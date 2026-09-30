/**
 * Shortcut cost honesty and consequences (wave 3, W3-A).
 *
 * Every number on a shortcut card equals the number the meter moves by,
 * knock-ons included; a caught shortcut costs the grade whether or not its
 * determination landed before the run closed; a noticed take leaves the
 * catching institution's own watch and nothing else; a serious catch costs
 * more than it paid; the campaign counts every shortcut of a season.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTIVE_ILLEGAL_ACTS, ILLEGAL_ACTS } from '../js/data/illegalActs.js';
import {
  badBandFloorFor,
  buildCaughtEffects,
  buildShortcutOption,
  buildTemptationEvent,
  buildTemptationPayoff,
  catchDelayFor,
  fpbcReviewDaysLeft,
  GO_AROUND_SILENCE_COST,
  resolveTemptationSetAside,
} from '../js/events/selection.js';
import { applyEventEffects, projectAppliedEffects } from '../js/events/resolution.js';
import { describeEffectChips, formatEventForDisplay } from '../js/events/display.js';
import { checkForEvent, resolveEvent } from '../js/events.js';
import { TEMPTATION_FLAG_LABELS, TEMPTATION_WATCH_FLAGS } from '../js/events/odds.js';
import { collectShortcutsFromJourney, describeShortcutWatch } from '../js/events/shortcutRecord.js';
import { applyProfessionalComplianceShift } from '../js/engine/professional.js';
import { calculateScore, formatScoreDisplay, scoreIntegrityPenalty } from '../js/scoring.js';
import { recordProgramShortcut, recordTemptationOutcome, runSeasonCloseAudit, summarizeIntegrity } from '../js/modes/silvicultureIntegrity.js';
import { createJourney } from '../js/journey.js';
import { createInitialState } from '../js/engine/state.js';
import { adaptIllegalActTemptation, buildIllegalActWatchFlags, drawIssue } from '../js/engine/content.js';
import { applyOptionOutcome, applyRoundConsequences } from '../js/engine/effects.js';
import { CHAINED_ISSUES } from '../js/data/index.js';
import { fitManagerEvent } from '../js/modes/manager.js';

const ROLE_AREAS = {
  recce: 'fort-st-john-plateau',
  silviculture: 'fraser-plateau',
  planner: 'bulkley-valley',
  permitter: 'fort-st-john-plateau',
  manager: 'bulkley-valley',
};

// A journey with every meter in the middle of its range, so a delta lands in
// full and the chip can be checked against it without a clamp in the way.
function journeyFor(roleId, extra = {}) {
  const journey = createJourney({ roleId, areaId: ROLE_AREAS[roleId], ...extra });
  journey.day = 5;
  journey.scrutiny = 40;
  if (typeof journey.resources?.politicalCapital === 'number') journey.resources.politicalCapital = 50;
  if (journey.plan) Object.assign(journey.plan, { dataCompleteness: 40, analysisQuality: 40, stakeholderBuyIn: 40 });
  if (journey.regulations) journey.regulations.complianceScore = 60;
  if (journey.metrics) Object.assign(journey.metrics, { compliance: 50, reputation: 50, progress: 50 });
  return journey;
}

function act(id) {
  const found = ILLEGAL_ACTS.find((entry) => entry.id === id);
  assert.ok(found, `no act ${id}`);
  return found;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function chipNumber(chips, unit) {
  const chip = chips.find((entry) => entry.endsWith(` ${unit}`));
  return chip ? Number(chip.replace(` ${unit}`, '')) : 0;
}

// ── (1) Hidden costs: the chip is the applied delta ─────────────────────────

test('a compliance loss lands as the scrutiny and goodwill the chip says, on every band of every act for every role', () => {
  let checked = 0;
  for (const entry of ACTIVE_ILLEGAL_ACTS) {
    for (const roleId of entry.roles.filter((role) => ROLE_AREAS[role])) {
      const journey = journeyFor(roleId);
      const option = buildShortcutOption(entry, journey);
      const bands = [
        ['clean', option.effects],
        ['noticed', option.partialEffects],
        ['caught today', option.failureEffects],
        ['determination', option.failureFallout?.effects],
      ].filter(([, effects]) => effects);
      for (const [band, effects] of bands) {
        const trial = clone(journey);
        const before = { scrutiny: trial.scrutiny, goodwill: trial.resources?.politicalCapital, budget: trial.resources?.budget };
        applyEventEffects(trial, effects, []);
        const projected = projectAppliedEffects(effects, trial.journeyType);
        const chips = describeEffectChips(effects, trial.journeyType);
        const where = `${entry.id} for ${roleId}, ${band}`;
        const scrutinyMoved = Math.round((trial.scrutiny - before.scrutiny) * 100) / 100;
        assert.equal(scrutinyMoved, Math.round((projected.scrutiny || 0) * 100) / 100, `${where}: scrutiny moved ${scrutinyMoved}, chip ${projected.scrutiny}`);
        if (projected.scrutiny) assert.equal(chipNumber(chips, 'scrutiny'), projected.scrutiny, `${where}: ${chips.join(', ')}`);
        if (typeof before.goodwill === 'number') {
          const goodwillMoved = trial.resources.politicalCapital - before.goodwill;
          const unit = trial.journeyType === 'manager' ? 'capital' : 'goodwill';
          assert.equal(goodwillMoved, projected.politicalCapital || 0, `${where}: goodwill moved ${goodwillMoved}, chip ${projected.politicalCapital || 0}`);
          assert.equal(chipNumber(chips, unit), projected.politicalCapital || 0, `${where}: ${chips.join(', ')}`);
        }
        if (typeof effects.budget === 'number' && typeof before.budget === 'number' && trial.journeyType !== 'recon') {
          assert.equal(trial.resources.budget - before.budget, effects.budget, `${where}: budget`);
        }
        checked += 1;
      }
    }
  }
  assert.ok(checked > 300, `${checked} bands checked`);
});

test('a permitting determination priced "-10 compliance, +15 scrutiny" reads and lands as +30 scrutiny and -10 goodwill', () => {
  const journey = journeyFor('permitter');
  const authored = { budget: -3000, compliance: -10, scrutiny: 15 };
  const chips = describeEffectChips(authored, 'permitting');
  assert.deepEqual(chips, ['-$3k', '-10 compliance', '-10 goodwill', '+30 scrutiny']);
  applyEventEffects(journey, authored, []);
  assert.equal(journey.scrutiny, 70);
  assert.equal(journey.resources.politicalCapital, 40);

  // A field crew has no goodwill to lose, and the same chip says so.
  assert.deepEqual(describeEffectChips(authored, 'recon'), ['-$3k', '-10 compliance', '+30 scrutiny']);
  // The old noticed chip "+8 scrutiny" is +11 once compliance moves it.
  assert.equal(chipNumber(describeEffectChips({ compliance: -2, scrutiny: 8 }, 'silviculture'), 'scrutiny'), 11);
  // Reporting on a desk is worth the goodwill it actually earns.
  assert.deepEqual(describeEffectChips({ compliance: 2, politicalCapital: 1, timeUsed: 0.5 }, 'permitting'), ['+2 compliance', '+3 goodwill', '-1 scrutiny']);
});

test('the stakes name the knock-ons, the scrutiny of a clean take, the finding on the day, and the files a catch opens', () => {
  const journey = journeyFor('permitter');
  const event = buildTemptationEvent(act('midnight-variance-forgery'), journey);
  const [gain, odds] = event.stakes;
  const buried = gain.match(/^Take it and you get .* \((\+\d+ scrutiny) even if it stays buried\)\. Saying no costs nothing\.$/);
  assert.ok(buried, gain);
  // The payoff is ten permit clock-days of work, which draws a point of
  // scrutiny of its own when it lands in the noticed band too: +12, not +11.
  assert.match(odds, /somebody notices \(-2 compliance, -2 goodwill, \+12 scrutiny, and the RCMP have your name\)/);
  assert.match(odds, /catches it \(no payoff; \+5 scrutiny today, then .*-16 compliance, -28 goodwill, .*\+49 scrutiny, landing about \d days? later; on your record: the RCMP have your name, an RCMP file is open\)/);
  const hint = formatEventForDisplay(event, 'permitting').options[1].hint;
  assert.ok(hint.includes(buried[1]), `${hint} vs ${buried[1]}`);
  // The clean band's chip is the clean band's landing, payoff coupling included.
  const trial = clone(journey);
  applyEventEffects(trial, event.options[1].effects, []);
  assert.equal(`+${trial.scrutiny - journey.scrutiny} scrutiny`, buried[1]);
});

/** "(-2 compliance, -2 goodwill, +12 scrutiny, and a watch)" → { compliance: -2, goodwill: -2, scrutiny: 12 } */
function parseChips(text) {
  const chips = {};
  for (const chip of String(text || '').split(', ')) {
    const match = chip.match(/^([+-]\d+(?:\.\d+)?) (scrutiny|compliance|goodwill|capital|professional standing|relations)$/);
    if (match) chips[match[2]] = Number(match[1]);
  }
  return chips;
}

/** The meters a chip names, read off a journey. */
function readMeters(journey) {
  return {
    scrutiny: Number(journey.scrutiny) || 0,
    goodwill: journey.resources?.politicalCapital,
    capital: journey.resources?.politicalCapital,
    'professional standing': journey.protagonist?.reputation,
    compliance: journey.journeyType === 'permitting' ? journey.regulations?.complianceScore : journey.metrics?.compliance,
  };
}

function landed(journey, effects) {
  const trial = clone(journey);
  const before = readMeters(trial);
  applyEventEffects(trial, effects || {}, []);
  const after = readMeters(trial);
  return Object.fromEntries(Object.keys(before).map((key) => [key, (after[key] ?? 0) - (before[key] ?? 0)]));
}

test('every shortcut\'s stakes line is what each band lands, for every act and role, a big payoff included', () => {
  // Two desks: meters mid-range, and a planning file whose gates are all
  // full, so its payoff is time back on the file at twelve or more points of
  // work, which draws a point of scrutiny of its own.
  const states = [
    ['mid-range', (roleId) => journeyFor(roleId)],
    ['big payoff', (roleId) => {
      const journey = journeyFor(roleId);
      if (journey.plan) Object.assign(journey.plan, { dataCompleteness: 98, analysisQuality: 98, stakeholderBuyIn: 98 });
      return journey;
    }],
  ];
  let checked = 0;
  let bigPayoffs = 0;
  for (const [state, make] of states) {
    for (const entry of ACTIVE_ILLEGAL_ACTS) {
      for (const roleId of entry.roles.filter((role) => ROLE_AREAS[role])) {
        const journey = make(roleId);
        let event = buildTemptationEvent(entry, journey);
        if (journey.journeyType === 'manager') event = fitManagerEvent(journey, event);
        const shortcut = event.options.find((option) => option.liveOdds);
        const where = `${entry.id} for ${roleId} (${state})`;
        if ((shortcut.effects?.progress || 0) > 6) bigPayoffs += 1;
        const [gain, odds] = event.stakes;
        const clean = landed(journey, shortcut.effects);
        const buried = gain.match(/\(([+-]\d+(?:\.\d+)?) scrutiny even if it stays buried\)/);
        assert.equal(buried ? Number(buried[1]) : 0, clean.scrutiny, `${where} clean: ${gain}`);

        const noticedText = odds.match(/somebody notices \((.*?), and [^()]*\)/)?.[1];
        assert.ok(noticedText !== undefined, `${where}: ${odds}`);
        const noticedChips = parseChips(noticedText);
        const noticed = landed(journey, shortcut.partialEffects);
        assert.equal(noticedChips.scrutiny || 0, noticed.scrutiny, `${where} noticed scrutiny: ${noticedText}`);
        for (const unit of ['goodwill', 'capital', 'professional standing']) {
          if (!(unit in noticedChips)) continue;
          assert.equal(noticedChips[unit], noticed[unit] - clean[unit], `${where} noticed ${unit}: ${noticedText}`);
        }

        const caughtText = odds.match(/catches it \(no payoff; (.*)\)\.$/)?.[1] || '';
        const [today, later] = shortcut.failureFallout ? caughtText.split(' today, then ') : ['', caughtText];
        if (shortcut.failureFallout) {
          assert.equal(parseChips(today).scrutiny || 0, landed(journey, shortcut.failureEffects).scrutiny, `${where} caught today: ${today}`);
        }
        const determination = landed(journey, shortcut.failureFallout?.effects || shortcut.failureEffects);
        const laterChips = parseChips(later.split(/, landing |; on your record/)[0]);
        assert.equal(laterChips.scrutiny || 0, determination.scrutiny, `${where} determination: ${later}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 300, `${checked} offers checked`);
  assert.ok(bigPayoffs >= 20, `${bigPayoffs} offers paid more than six points of work`);
});

test('a planner\'s compliance chips name professional standing, at the size it lands', () => {
  const journey = journeyFor('planner');
  const authored = { compliance: -10, scrutiny: 15 };
  const chips = describeEffectChips(authored, 'planning');
  assert.ok(!chips.some((chip) => / compliance$/.test(chip)), chips.join(', '));
  assert.ok(chips.includes('-5 professional standing'), chips.join(', '));
  const before = journey.protagonist.reputation;
  const messages = [];
  applyEventEffects(journey, authored, messages);
  assert.equal(journey.protagonist.reputation, before - 5);
  assert.ok(messages.includes('Professional standing slipped (-5).'), messages.join(' | '));
});

test('silence about a go-around costs what its card says', () => {
  const journey = journeyFor('silviculture');
  const entry = act('slash-burn-party');
  journey.temptationMemory = { pending: [{ actId: entry.id, day: 5, kind: 'goaround' }], seenActIds: [entry.id], takenActIds: [], lastDay: 1 };
  const goAround = withRandom(0.5, () => checkForEvent(journey));
  assert.equal(goAround?.temptationStage, 'goaround');
  assert.match(goAround.setAsideDescription, /It costs -2 compliance, \+6 scrutiny\.$/);
  const before = journey.scrutiny;
  const reply = resolveTemptationSetAside(journey, goAround, () => 0.5);
  assert.deepEqual(reply.effects, GO_AROUND_SILENCE_COST);
  applyEventEffects(journey, reply.effects, []);
  assert.equal(journey.scrutiny - before, 6);
});

// ── (2) A catch costs the grade, landed or settled ──────────────────────────

test('a caught shortcut costs the grade by its seriousness, whether the determination landed or settled at the debrief', () => {
  const journey = journeyFor('permitter');
  journey.log.push({ day: 3, type: 'event', eventId: 'temptation_permitter-fake-road-maintenance-log', optionLabel: 'Take the shortcut', band: 'bad', effects: {} });
  assert.equal(scoreIntegrityPenalty(journey), 8, 'a core act');
  journey.log.push({ day: 7, type: 'event', eventId: 'temptation_permitter-hide-spill-report', optionLabel: 'Take the shortcut', band: 'bad', effects: {} });
  assert.equal(scoreIntegrityPenalty(journey), 20, 'a serious one on top');
  journey.log.push({ day: 9, type: 'event', eventId: 'temptation_black-market-timber-maps', optionLabel: 'Take the shortcut', band: 'good', effects: {} });
  journey.log.push({ day: 11, type: 'event', eventId: 'temptation_permit-fastpass', optionLabel: 'Take the shortcut', band: 'partial', effects: {} });
  assert.equal(scoreIntegrityPenalty(journey), 20, 'a clean or noticed take is not a catch');
  journey.permits = { ...(journey.permits || {}), approved: 15, target: 15 };
  const score = calculateScore(journey, true);
  assert.equal(score.integrityPenalty, 20);
  assert.ok(formatScoreDisplay(score).some((line) => /Integrity\s+-20 /.test(line)));
  assert.equal(scoreIntegrityPenalty(journeyFor('planner')), 0);
});

test('a desk determination lands within five days, so a file closed early still meets it in season', () => {
  const permitter = journeyFor('permitter');
  const recce = journeyFor('recce');
  for (const entry of ACTIVE_ILLEGAL_ACTS) {
    assert.ok(catchDelayFor(entry, permitter) <= 5, `${entry.id}: ${catchDelayFor(entry, permitter)} days on a desk`);
    assert.ok(catchDelayFor(entry, permitter) <= catchDelayFor(entry, recce));
  }
  const longest = ACTIVE_ILLEGAL_ACTS.filter((entry) => entry.catch.lagDays >= 35);
  assert.ok(longest.length > 0);
  for (const entry of longest) assert.equal(catchDelayFor(entry, permitter), 5, `${entry.id} lag ${entry.catch.lagDays}`);
});

// ── (3) Noticed leaves a watch, and only the institution's own ──────────────

test('a noticed band sets the catching institution\'s own watch, the panel names it, and only that institution reads the same act closely', () => {
  const journey = journeyFor('permitter');
  const pipe = act('phantom-culvert-locations');
  const option = buildShortcutOption(pipe, journey);
  assert.deepEqual(option.partialFlags, ['dfo_watching']);
  assert.match(option.partialOutcome, /a DFO fishery officer has the crossing on a list/);
  const noticedRoll = option.liveOdds.good + 0.01;
  const event = buildTemptationEvent(pipe, journey);
  const result = withRandom(noticedRoll, () => resolveEvent(journey, event, event.options[1]));
  assert.ok(result.messages.some((line) => /On your record now: DFO is watching the crossings\./.test(line)), result.messages.join(' | '));
  assert.ok(describeShortcutWatch(journey).some((alert) => /^Watched: DFO is watching the crossings\./.test(alert.text)));

  // DFO's attention hurts the next DFO act; a C&E act only a little.
  const fresh = journeyFor('permitter');
  const dfoAgain = buildShortcutOption(pipe, journey).liveOdds;
  const dfoFresh = buildShortcutOption(pipe, fresh).liveOdds;
  assert.ok(dfoAgain.bad >= dfoFresh.bad + 0.19, `${dfoAgain.bad} vs ${dfoFresh.bad}`);
  const ceAct = act('black-market-timber-maps');
  const ceWatched = buildShortcutOption(ceAct, journey).liveOdds;
  const ceFresh = buildShortcutOption(ceAct, fresh).liveOdds;
  assert.ok(Math.abs(ceWatched.bad - ceFresh.bad) < 0.01, 'the caught band does not move');
  assert.ok(ceWatched.partial > ceFresh.partial, 'somebody is likelier to write it down');

  for (const flag of TEMPTATION_WATCH_FLAGS) assert.ok(TEMPTATION_FLAG_LABELS[flag], `${flag} has a label`);
});

test('an FPBC complaint file is decided after eight days: the registration can be renewed and FPBC keeps watching', () => {
  const journey = journeyFor('planner');
  journey.consequenceFlags = ['fpbc_watching', 'fpbc_file_open'];
  journey.day = 9;
  withRandom(0.99, () => checkForEvent(journey));
  assert.equal(journey.professional.registrationStatus, 'under-review');
  assert.equal(fpbcReviewDaysLeft(journey), 8);
  applyProfessionalComplianceShift(journey, { registrationStatus: 'active' });
  assert.equal(journey.professional.registrationStatus, 'under-review', 'no renewal clears an open file');

  journey.day = 16;
  withRandom(0.99, () => checkForEvent(journey));
  assert.equal(fpbcReviewDaysLeft(journey), 1);
  journey.day = 17;
  withRandom(0.99, () => checkForEvent(journey));
  assert.equal(fpbcReviewDaysLeft(journey), null);
  assert.ok(!journey.consequenceFlags.includes('fpbc_file_open'));
  assert.ok(journey.consequenceFlags.includes('fpbc_watching'));
  applyProfessionalComplianceShift(journey, { registrationStatus: 'active' });
  assert.equal(journey.professional.registrationStatus, 'active', 'once decided, the renewal restores the licence');
});

test('an FPBC file saved open before the review clock existed is still decided eight days after the load', () => {
  // The wave-2 save shape: the file settled (registration under review) but
  // no opening day, so the review read 0 of 8 days forever.
  const journey = journeyFor('planner');
  journey.day = 6;
  journey.consequenceFlags = ['fpbc_watching', 'fpbc_file_open'];
  journey.temptationMemory = { lastDay: 3, seenActIds: [], takenActIds: [], pending: [], settledFlags: ['fpbc_file_open'] };
  journey.professional.registrationStatus = 'under-review';

  withRandom(0.99, () => checkForEvent(journey));
  assert.equal(journey.temptationMemory.fpbcFileOpenedDay, 6, 'the clock starts at the save\'s day');
  assert.equal(fpbcReviewDaysLeft(journey), 8);
  for (let day = 7; day <= 14; day += 1) {
    journey.day = day;
    withRandom(0.99, () => checkForEvent(journey));
  }
  assert.equal(fpbcReviewDaysLeft(journey), null, 'decided on day 14');
  assert.ok(!journey.consequenceFlags.includes('fpbc_file_open'));
  assert.ok(journey.consequenceFlags.includes('fpbc_watching'));
  applyProfessionalComplianceShift(journey, { registrationStatus: 'active' });
  assert.equal(journey.professional.registrationStatus, 'active');
});

// ── (4) The campaign counts the last shortcut of a season ───────────────────

test('a shortcut taken after the season\'s last offer check is still carried into the year', () => {
  const campaign = {};
  const summer = journeyFor('recce');
  summer.temptationMemory = { seenActIds: ['recce-hide-bear-den'], takenActIds: ['recce-hide-bear-den'], lastDay: 3 };
  summer.log.push({ day: 3, type: 'event', eventId: 'temptation_recce-hide-bear-den', optionLabel: 'Take the shortcut', band: 'good' });
  summer.log.push({ day: 11, type: 'event', eventId: 'temptation_recce-move-riparian-ribbon', optionLabel: 'Take the shortcut', band: 'bad' });
  const review = collectShortcutsFromJourney(campaign, summer, { label: 'Summer' });
  assert.equal(review.counts.taken, 2);
  assert.deepEqual(campaign.shortcuts.takenActIds, ['recce-hide-bear-den', 'recce-move-riparian-ribbon']);
});

// ── (5) The silviculture close check honours the card's odds ────────────────

test('the season-close check reads only what somebody noticed, at the act\'s own caught odds, on the day\'s dice', () => {
  const journey = journeyFor('silviculture');
  journey.day = 30;
  recordProgramShortcut(journey, { id: 'silvi-fake-free-growing', title: 'Sign the Free-Growing Survey You Didn\'t Walk', kind: 'false-record', status: 'clean' });
  recordProgramShortcut(journey, { id: 'silvi-misreport-planting', title: 'Report It Planted', kind: 'false-record', status: 'noticed' });
  const odds = buildShortcutOption(act('silvi-misreport-planting'), journey).liveOdds.bad;
  assert.ok(odds > 0.05 && odds < 0.9, `caught odds ${odds}`);

  const buried = clone(journey);
  assert.equal(runSeasonCloseAudit(buried, () => odds + 0.01).length, 0, 'a roll above the act\'s odds surfaces nothing');
  assert.equal(summarizeIntegrity(buried).caughtFalseRecords, 0);

  const found = clone(journey);
  const lines = runSeasonCloseAudit(found, () => odds - 0.01);
  assert.equal(lines.length, 1, 'the noticed record surfaces; the clean one stays buried');
  assert.match(lines[0], /"Report It Planted"/);
  assert.equal(found.programIntegrity.records.find((record) => record.id === 'silvi-fake-free-growing').status, 'clean');

  // The default dice are the day's, so a reload replays the same check.
  const seeded = clone(journey);
  seeded.daySeed = { day: 30, seed: 12345 };
  const first = runSeasonCloseAudit(clone(seeded)).length;
  assert.equal(runSeasonCloseAudit(clone(seeded)).length, first);
});

test('a silviculture card says the noticed record is read again at season close, and the close reads it at the odds the card printed', () => {
  const journey = journeyFor('silviculture');
  const event = buildTemptationEvent(act('silvi-misreport-planting'), journey);
  const shortcut = event.options.find((option) => option.liveOdds);
  const caught = Math.round(shortcut.liveOdds.bad * 100);
  assert.match(event.stakes[1], new RegExp(`somebody notices \\([^()]*, and the district reads it again at season close: ${caught}% it is caught then\\)`));
  assert.match(shortcut.partialOutcome, /The district will read that record again at season close\.$/);
  // No other role's card carries the season-close line.
  const permit = buildTemptationEvent(act('midnight-variance-forgery'), journeyFor('permitter'));
  assert.ok(!/season close/.test(permit.stakes[1]));

  // Taken and noticed: the record keeps the printed odds, and the close
  // rolls against them even when the file's odds have moved since.
  journey.log.push({ day: 5, type: 'event', eventId: event.id, optionLabel: shortcut.label, outcome: shortcut.partialOutcome, band: 'partial' });
  const record = recordTemptationOutcome(journey, event);
  assert.equal(record.status, 'noticed');
  assert.equal(record.closeOdds, shortcut.liveOdds.bad);
  journey.scrutiny = 90;
  const later = clone(journey);
  assert.equal(runSeasonCloseAudit(later, () => shortcut.liveOdds.bad + 0.01).length, 0, 'above the printed odds: nothing');
  const found = clone(journey);
  assert.equal(runSeasonCloseAudit(found, () => shortcut.liveOdds.bad - 0.01).length, 1, 'under the printed odds: caught');
});

// ── (6) A payoff that cannot land is not promised ───────────────────────────

test('a planner is paid only what the gate can take, and a full gate pays the next one or time back', () => {
  const planner = journeyFor('planner');
  const launder = act('inventory-data-laundering');
  planner.plan.phase = 'stakeholder_review';
  planner.plan.analysisQuality = 100;
  planner.plan.stakeholderBuyIn = 60;
  const fallThrough = buildTemptationPayoff(launder, planner).effects;
  assert.equal(fallThrough.analysis, undefined, 'a full analysis gate cannot be paid');
  assert.ok(fallThrough.buyIn > 0, `the gate the plan is on: ${JSON.stringify(fallThrough)}`);

  planner.plan.analysisQuality = 93;
  const capped = buildTemptationPayoff(launder, planner).effects;
  assert.equal(capped.analysis, 7, 'only the room left');
  const event = buildTemptationEvent(launder, planner);
  assert.match(event.stakes[0], /\+7 analysis/);
  withRandom(0, () => resolveEvent(planner, event, event.options[1]));
  assert.equal(planner.plan.analysisQuality, 100);

  planner.plan.stakeholderBuyIn = 100;
  planner.plan.analysisQuality = 100;
  const spent = buildTemptationPayoff(launder, planner).effects;
  assert.ok(spent.progress > 0 && spent.analysis === undefined && spent.buyIn === undefined, JSON.stringify(spent));
  assert.match(formatEventForDisplay(buildTemptationEvent(launder, planner), 'planning').options[1].hint, /time back on the file/);
});

// ── (7) A serious catch costs more than it pays ─────────────────────────────

test('a serious act caught costs more in its own currency than it would have paid', () => {
  let checked = 0;
  for (const entry of ACTIVE_ILLEGAL_ACTS) {
    if (badBandFloorFor(entry) < 0.15) continue;
    for (const roleId of entry.roles.filter((role) => ROLE_AREAS[role])) {
      const journey = journeyFor(roleId);
      const payoff = buildTemptationPayoff(entry, journey).effects;
      const caught = buildCaughtEffects(entry, journey);
      const where = `${entry.id} for ${roleId}: pays ${JSON.stringify(payoff)}, costs ${JSON.stringify(caught)}`;
      if (payoff.budget > 0) {
        const cap = journey.journeyType === 'recon' ? 1200 : Infinity;
        assert.ok(-caught.budget >= Math.min(cap, payoff.budget * 1.5), where);
      }
      if (payoff.progress > 0) assert.ok(-caught.progress >= payoff.progress, where);
      checked += 1;
    }
  }
  assert.ok(checked > 40, `${checked} serious acts checked`);
  // A spill buried for $12,000 on a permitting desk is an $18,000 finding, not a $4,000 one.
  const spill = buildCaughtEffects(act('permitter-hide-spill-report'), journeyFor('permitter'));
  assert.equal(spill.budget, -18000);
  // A core act keeps the institution's own mix.
  assert.equal(buildCaughtEffects(act('permitter-fake-road-maintenance-log'), journeyFor('permitter')).budget, -3000);
});

// ── (8) Seasonal: noticed opens nothing unlinked; fallout keeps its provenance ──

function seasonalState(roleId, round = 2) {
  const state = createInitialState({ companyName: 'W3A', roleId, areaId: 'bulkley-valley' });
  state.round = round;
  state.currentSeasonContext = { season: 'summer' };
  return state;
}

function takeSeasonal(state, card, roll) {
  const option = card.options.find((entry) => entry.risk);
  return withRandom(roll, () => applyOptionOutcome(state, option, { type: 'temptation', id: card.id, title: card.title, option: option.label, round: state.round }));
}

test('a seasonal noticed take leaves the institution\'s watch and opens no chained fallout; the odds line says why they moved', () => {
  const state = seasonalState('silviculture');
  const garbage = ILLEGAL_ACTS.find((entry) => entry.roles.includes('silviculture') && entry.catch.by === 'C&E' && ['spill', 'herbicide', 'riparian', 'wildlife', 'fire'].includes(entry.category));
  assert.ok(garbage);
  const card = adaptIllegalActTemptation(garbage, state);
  assert.equal(card.oddsReason, '', 'a fresh file has nothing to explain');
  const result = takeSeasonal(state, card, card.odds.clean + 0.01);
  assert.equal(result.riskResult.band, 'noticed');
  assert.deepEqual(Object.keys(state.flags).filter((flag) => state.flags[flag] && flag !== 'budgetLoanActive'), ['watched:C&E']);
  assert.deepEqual(buildIllegalActWatchFlags(garbage), { 'watched:C&E': true });
  const gated = CHAINED_ISSUES.filter((issue) => (issue.requiresAnyFlags || []).some((flag) => state.flags[flag]));
  assert.equal(gated.length, 0, 'no flag-gated issue can open from a noticed take');

  const again = adaptIllegalActTemptation(garbage, state);
  assert.ok(again.odds.caught > card.odds.caught, 'the watch worsens the next offer');
  assert.match(again.oddsReason, /^Worse odds because you have taken a shortcut this year; C&E is already watching your file\./);
  assert.match(again.options[1].preview, /Worse odds because/);
});

test('a caught shortcut\'s fallout keeps its own pending entry and provenance beside another source\'s card', () => {
  const state = seasonalState('planner');
  const decay = act('planner-overstate-decay');
  const card = adaptIllegalActTemptation(decay, state);
  const promised = card.promisedFallout.id;
  // An assignment already put the same card on the calendar.
  applyOptionOutcome(state, { label: 'Hold the notice', effects: {}, scheduleIssues: { id: promised, delay: 1 } }, { type: 'assignment', id: 'hold', title: 'Hold the notice until the map is final', option: 'Hold the notice', round: 2 });
  assert.equal(state.pendingIssues.length, 1);
  const result = takeSeasonal(state, card, 0.99);
  assert.equal(result.riskResult.band, 'caught');
  assert.equal(state.pendingIssues.length, 2, 'the shortcut keeps its own entry');
  const shortcutEntry = state.pendingIssues.find((entry) => entry.causedBy?.kind === 'shortcut');
  assert.equal(shortcutEntry.causedBy.actId, decay.id);
  assert.equal(state.pendingIssues.find((entry) => entry.causedBy?.kind !== 'shortcut').causedBy.title, 'Hold the notice until the map is final');

  // Dealt: the first card is the assignment's; the shortcut's still stands
  // and, if the year closes on it, settles under its own name.
  state.round = 3;
  const dealt = drawIssue(state, () => 0.99);
  assert.equal(dealt.id, promised);
  const left = state.pendingIssues.find((entry) => entry.id === promised);
  assert.ok(left, 'one entry remains');
  state.round = 4;
  state.totalRounds = 4;
  const consequences = applyRoundConsequences(state);
  assert.ok(consequences.includes('unlanded-fallout'), consequences.join(', '));
  assert.ok(state.history.some((entry) => entry.id === 'unlanded-fallout' && entry.actId === decay.id));
});
