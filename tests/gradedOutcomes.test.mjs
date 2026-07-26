import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  ODDS_PREDICATE_NAMES,
  OUTCOME_BANDS,
  computeBandOdds,
  resolveOutcomeBand,
  matchesOddsCondition,
} from '../js/events/odds.js';
import { CONSEQUENCE_FLAGS, applyConsequenceFlags } from '../js/events/consequences.js';
import { lintEvents } from '../scripts/lint-events.mjs';

/**
 * These tests exist because of a specific run of bugs, each of which was
 * invisible to reading and only ever caught by executing something:
 *
 *   - a renamed option value that silently blinded the sim policy
 *   - a `*​/` inside a JSDoc path that ended the comment early and took down
 *     ten test files
 *   - a follow-up timer moved onto a band, which deleted it from the seasonal
 *     game that shares the same deck
 *   - a consequence flag with a consumer and no producer
 *
 * Each one has a guard here.
 */

// ── The content lint runs in the suite, not only in CI ──────────────────────

test('event content lint passes', () => {
  const errors = lintEvents();
  assert.deepEqual(errors, [], `event content lint failed:\n  ${errors.join('\n  ')}`);
});

// ── Every module parses ─────────────────────────────────────────────────────

function collectModules(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectModules(full, out);
    } else if (entry.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

test('every module under js/ parses and imports', async () => {
  // A `*/` inside a JSDoc path once terminated a block comment early. The file
  // still looked fine and the suite reported ten unrelated failures. Importing
  // everything turns that into one obvious error at the source.
  const root = new URL('../js', import.meta.url).pathname;
  const modules = collectModules(root);
  assert.ok(modules.length > 40, `expected to find the module tree, got ${modules.length}`);

  const broken = [];
  for (const file of modules) {
    try {
      await import(file);
    } catch (error) {
      // Only syntax/parse failures are this test's business; a module that
      // throws on import for an environmental reason is not a parse error.
      if (error instanceof SyntaxError) {
        broken.push(`${relative(root, file)}: ${error.message}`);
      }
    }
  }
  assert.deepEqual(broken, [], `modules failed to parse:\n  ${broken.join('\n  ')}`);
});

// ── Odds predicates ─────────────────────────────────────────────────────────

test('every advertised odds predicate is actually implemented', () => {
  // A `when` string the switch does not handle returns false forever, which
  // reads in the deck as an odds shift that simply never fires. Each predicate
  // gets a journey that should satisfy it.
  const cases = {
    weather: [{ weather: { id: 'rain' } }, 'weather:rain'],
    season: [{ season: { currentSeason: 'spring' } }, 'season:spring'],
    pace: [{ paceSetting: 'grueling' }, 'pace:grueling'],
    difficulty: [{ difficulty: 'hard' }, 'difficulty:hard'],
    terrain: [{ blocks: [{ terrain: 'muskeg' }], currentBlockIndex: 0 }, 'terrain:muskeg'],
    crewHasRole: [{ crew: [{ isActive: true, role: 'mechanic' }] }, 'crewHasRole:mechanic'],
    scrutinyAbove: [{ scrutiny: 80 }, 'scrutinyAbove:55'],
    scrutinyBelow: [{ scrutiny: 10 }, 'scrutinyBelow:20'],
    equipmentBelow: [{ resources: { equipment: 20 } }, 'equipmentBelow:40'],
    avgMoraleBelow: [{ crew: [{ isActive: true, morale: 20 }] }, 'avgMoraleBelow:40'],
    avgMoraleAbove: [{ crew: [{ isActive: true, morale: 90 }] }, 'avgMoraleAbove:70'],
    relationshipsAbove: [{ resources: { politicalCapital: 80 } }, 'relationshipsAbove:70'],
    shortRationStreak: [{ rationPlan: { shortRationStreak: 5 } }, 'shortRationStreak:3'],
    priorShortcuts: [{ temptationMemory: { seenActIds: [1, 2, 3] } }, 'priorShortcuts:2'],
    hasFlag: [{ consequenceFlags: ['locals_soured'] }, 'hasFlag:locals_soured'],
    accessGroundTruthed: [
      { blocks: [{ id: 'b1' }], currentBlockIndex: 0, reconIntel: { byBlock: { b1: { accessGroundTruthed: true } } } },
      'accessGroundTruthed',
    ],
  };

  for (const name of ODDS_PREDICATE_NAMES) {
    assert.ok(cases[name], `predicate "${name}" is advertised but has no test case`);
    const [journey, when] = cases[name];
    assert.equal(
      matchesOddsCondition(when, journey), true,
      `predicate "${when}" is advertised in ODDS_PREDICATE_NAMES but does not match a journey that should satisfy it`,
    );
  }

  assert.equal(matchesOddsCondition('notARealPredicate:5', { scrutiny: 90 }), false);
});

// ── Band arithmetic ─────────────────────────────────────────────────────────

test('band odds always sum to 1 and never leave a band certain', () => {
  const option = {
    chanceSuccess: 0.5,
    chancePartial: 0.3,
    oddsModifiers: [
      { when: 'scrutinyAbove:55', move: 0.4, from: 'good', to: 'bad' },
      { when: 'difficulty:hard', move: 0.4, from: 'good', to: 'bad' },
    ],
  };
  const brutal = computeBandOdds(option, { scrutiny: 90, difficulty: 'hard' });
  const total = brutal.good + brutal.partial + brutal.bad;
  assert.ok(Math.abs(total - 1) < 1e-9, `bands must sum to 1, got ${total}`);
  assert.ok(brutal.good > 0, 'no run should make a gamble a guaranteed loss');
  assert.ok(brutal.bad < 1);
});

test('a modifier cannot move more probability than its source band holds', () => {
  const option = {
    chanceSuccess: 0.1,
    oddsModifiers: [{ when: 'difficulty:hard', move: 0.9, from: 'good', to: 'bad' }],
  };
  const odds = computeBandOdds(option, { difficulty: 'hard' });
  assert.ok(odds.good >= 0 && odds.bad <= 1);
  assert.ok(Math.abs(odds.good + odds.partial + odds.bad - 1) < 1e-9);
});

test('options with no chanceSuccess resolve to the good band, unchanged', () => {
  // 234 of 389 authored options are still deterministic. They must behave
  // exactly as they did before bands existed.
  const option = { outcome: 'flat', effects: { fuel: -3 } };
  const odds = computeBandOdds(option, { scrutiny: 99, difficulty: 'hard' });
  assert.deepEqual(odds, { good: 1, partial: 0, bad: 0 });
  const resolved = resolveOutcomeBand(option, {}, () => 0.999);
  assert.equal(resolved.band, 'good');
  assert.equal(resolved.outcome, 'flat');
});

test('a legacy binary gamble keeps its exact odds', () => {
  const odds = computeBandOdds({ chanceSuccess: 0.6 }, {});
  assert.deepEqual(odds, { good: 0.6, partial: 0, bad: 0.4 });
});

test('the roll lands in the band the odds describe', () => {
  const option = {
    chanceSuccess: 0.5,
    chancePartial: 0.3,
    outcome: 'g', partialOutcome: 'p', failureOutcome: 'b',
    effects: {}, partialEffects: {}, failureEffects: {},
  };
  assert.equal(resolveOutcomeBand(option, {}, () => 0.10).band, 'good');
  assert.equal(resolveOutcomeBand(option, {}, () => 0.60).band, 'partial');
  assert.equal(resolveOutcomeBand(option, {}, () => 0.95).band, 'bad');
});

test('an unauthored partial band falls back to failure, never to success', () => {
  // Promoting an unfinished middle band to the success text would make a
  // half-authored option read as a win.
  const option = {
    chanceSuccess: 0.4, chancePartial: 0.3,
    outcome: 'success', effects: { fuel: 5 },
    failureOutcome: 'failure', failureEffects: { fuel: -5 },
  };
  const resolved = resolveOutcomeBand(option, {}, () => 0.5);
  assert.equal(resolved.band, 'partial');
  assert.equal(resolved.outcome, 'failure');
});

// ── Consequence flags ───────────────────────────────────────────────────────

test('every consequence flag is recorded so odds modifiers can read it', () => {
  const journey = { blocks: [{ id: 'b1', name: 'Telkwa' }], currentBlockIndex: 0, crew: [] };
  applyConsequenceFlags(journey, ['locals_soured', 'machine_down'], []);
  assert.deepEqual(journey.consequenceFlags, ['locals_soured', 'machine_down']);
  assert.equal(matchesOddsCondition('hasFlag:locals_soured', journey), true);
  assert.equal(matchesOddsCondition('hasFlag:reviewer_watching', journey), false);
});

test('applying the same flag twice does not duplicate it', () => {
  const journey = { blocks: [], crew: [] };
  applyConsequenceFlags(journey, ['locals_soured'], []);
  applyConsequenceFlags(journey, ['locals_soured'], []);
  assert.deepEqual(journey.consequenceFlags, ['locals_soured']);
});

test('every registered flag names a consumer', () => {
  for (const [flag, consumer] of Object.entries(CONSEQUENCE_FLAGS)) {
    assert.ok(consumer && typeof consumer === 'string' && consumer.length > 3,
      `flag "${flag}" must name where it is consumed — a flag with no reader is a lie to the player`);
  }
});

test('bands are ordered best to worst', () => {
  assert.deepEqual(OUTCOME_BANDS, ['good', 'partial', 'bad']);
});
