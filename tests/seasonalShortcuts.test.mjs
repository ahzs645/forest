import test from 'node:test';
import assert from 'node:assert/strict';

import { ILLEGAL_ACTS, ISSUE_LIBRARY, CHAINED_ISSUES, OPERATING_AREAS } from '../js/data/index.js';
import { actFitsRole, ROLE_PHASES } from '../js/data/illegalActs.js';
import {
  actMatchesSeasonalTemptationContext,
  adaptIllegalActTemptation,
  buildIllegalActPayoff,
  drawIssue,
} from '../js/engine/content.js';
import { actMatchesTemptationContext, resolveTemptationSetAside, buildTemptationEvent, GO_AROUND_SILENCE_COST } from '../js/events/selection.js';
import { createJourney } from '../js/journey.js';
import { applyOptionOutcome, applyRoundConsequences } from '../js/engine/effects.js';
import { buildSummary } from '../js/engine/summary.js';
import { describeConsequences } from '../js/engine/insights.js';
import { createInitialState } from '../js/engine/state.js';
import { resolveRisk, riskBandOdds } from '../js/risk.js';
import { simulateRun } from '../js/engine/simulate.js';
import { TuiGameController } from '../tui/controller.js';
import { makeRng } from '../js/engine/rng.js';
import { FORESTER_ROLES } from '../js/data/index.js';
import { getSeasonalPlayableRoles } from '../js/engine/seasonalContract.js';

const METRICS = ['progress', 'forestHealth', 'relationships', 'compliance', 'budget'];
const SEASONAL_ROLES = ['planner', 'permitter', 'recce', 'silviculture'];
const ISSUE_BY_ID = new Map([...ISSUE_LIBRARY, ...CHAINED_ISSUES].map((issue) => [issue.id, issue]));

function stateFor(roleId, areaId = 'bulkley-valley', round = 2) {
  const state = createInitialState({ companyName: 'Shortcut Test', roleId, areaId });
  state.round = round;
  return state;
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

function takeShortcut(state, card, roll) {
  const option = card.options.find((entry) => entry.risk);
  return withRandom(roll, () => applyOptionOutcome(state, option, {
    type: 'temptation',
    id: card.id,
    title: card.title,
    option: option.label,
    round: state.round,
  }));
}

// ── (1) A clean take pays the act's own payoff, on the meter the text names ──

test('the clean band pays the act payoff on the role meter and the chips match what is applied', () => {
  for (const roleId of SEASONAL_ROLES) {
    const state = stateFor(roleId);
    const acts = ILLEGAL_ACTS.filter((act) => actMatchesSeasonalTemptationContext(act, state));
    assert.ok(acts.length > 20, `${roleId} pool`);
    for (const act of acts) {
      const card = adaptIllegalActTemptation(act, state);
      const take = card.options.find((option) => option.risk);
      const payoff = buildIllegalActPayoff(act);
      const metric = act.payoff.kind === 'budget' ? 'budget' : 'progress';
      assert.ok(payoff.effects[metric] >= 4 && payoff.effects[metric] <= 10, `${act.id} payoff ${JSON.stringify(payoff.effects)}`);
      assert.equal(take.payoffChip, `${metric === 'budget' ? 'Budget' : 'Progress'} +${payoff.effects[metric]}`);
      assert.equal(take.risk.successEffects[metric], payoff.effects[metric], `${act.id} clean band pays the payoff`);
      assert.match(take.risk.successOutcome, new RegExp(`You get ${act.payoff.line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      // The take option previews the same numbers the risk applies.
      assert.ok(take.preview.startsWith(`${metric === 'budget' ? 'Budget' : 'Progress'} +${payoff.effects[metric]}`), take.preview);
      assert.match(take.preview, /\d+% clean, \d+% noticed, \d+% caught by /);
      assert.equal(take.label, 'Take the shortcut');
      // No raw expedition keys on any band.
      for (const band of Object.values(take.bands)) {
        for (const key of Object.keys(band.effects)) assert.ok(METRICS.includes(key), `${act.id} ${key}`);
      }
      // Clean is a net gain in the role's own currency; caught keeps its costs.
      const weighted = (effects) => Object.entries(effects).reduce((sum, [key, value]) => sum + (key === 'compliance' ? 1.2 : key === 'budget' ? 0.8 : 1) * value, 0);
      assert.ok(weighted(take.risk.successEffects) > 0, `${act.id} clean nets ${weighted(take.risk.successEffects)}`);
      assert.ok(weighted(take.risk.failEffects) < -25, `${act.id} caught nets ${weighted(take.risk.failEffects)}`);
      assert.ok(take.risk.failEffects.compliance <= -12, `${act.id} caught compliance`);
    }
  }
});

test('a clean take moves the meters up by the chip amount; the year-end review then lists it', () => {
  const state = stateFor('silviculture', 'fraser-plateau', 2);
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'silvi-fake-free-growing');
  const card = adaptIllegalActTemptation(act, state);
  const before = state.metrics.budget;
  const result = takeShortcut(state, card, 0.01);
  assert.equal(result.riskResult.band, 'clean');
  assert.equal(state.metrics.budget - before, buildIllegalActPayoff(act).effects.budget);
  assert.match(result.outcome, /You get the block's liability released,? and \$[\d,]+ of brushing never spent/);
  assert.equal(state.pendingIssues?.length ?? 0, 0, 'a clean take schedules no fallout');
  const highlights = buildSummary(state).highlights.join('\n');
  assert.match(highlights, /Declare It Free Growing – Take the shortcut \(.*Budget \+10/);
});

// ── Three bands and honest odds ──────────────────────────────────────────────

test('the shortcut is a three-band gamble whose caught band never drops below 15%', () => {
  const state = stateFor('permitter');
  state.metrics.compliance = 95;
  state.metrics.relationships = 95;
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'borrowed-rpf-stamp');
  const card = adaptIllegalActTemptation(act, state);
  const odds = card.odds;
  assert.ok(Math.abs(odds.clean + odds.noticed + odds.caught - 1) < 1e-9);
  assert.ok(odds.caught >= 0.15 - 1e-9, `caught ${odds.caught}`);
  assert.equal(card.oddsLine, card.options[1].oddsLine);
  assert.deepEqual(riskBandOdds(state, card.options[1].risk), odds);

  // Noticed lands the payoff, leaves the watch flag, schedules nothing.
  const noticed = takeShortcut(state, card, odds.clean + 0.01);
  assert.equal(noticed.riskResult.band, 'noticed');
  assert.ok(noticed.effects.progress > 0);
  assert.equal(state.flags.professionalAuditActive, true);
  assert.equal(state.pendingIssues?.length ?? 0, 0);
  assert.match(noticed.outcome, /Somebody also wrote down what they saw/);
});

test('doing it again this year, or with the institution already watching, worsens the odds', () => {
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'phantom-culvert-locations');
  const fresh = stateFor('permitter');
  const first = adaptIllegalActTemptation(act, fresh).odds;

  const repeat = stateFor('permitter');
  repeat.history.push({ type: 'temptation', id: 'temptation:x', title: 'X', option: 'Take the shortcut', round: 2 });
  const second = adaptIllegalActTemptation(act, repeat).odds;
  assert.ok(second.caught > first.caught + 0.1, `${second.caught} vs ${first.caught}`);

  const watched = stateFor('permitter');
  watched.flags.environmentalAudit = true;
  const third = adaptIllegalActTemptation(act, watched).odds;
  assert.ok(third.caught > first.caught + 0.15, `${third.caught} vs ${first.caught}`);
});

test('a file under scrutiny gets less benefit of the doubt than a trusted one', () => {
  const risk = { baseSuccess: 0.5, chancePartial: 0.3 };
  const trusted = riskBandOdds({ metrics: { compliance: 80, relationships: 75 } }, risk);
  const dirty = riskBandOdds({ metrics: { compliance: 25, relationships: 30 } }, risk);
  assert.ok(trusted.caught < dirty.caught);
  const rng = makeRng(7);
  const counts = { clean: 0, noticed: 0, caught: 0 };
  for (let i = 0; i < 4000; i += 1) counts[resolveRisk({ metrics: { compliance: 50, relationships: 50 } }, risk, rng).band] += 1;
  assert.ok(Math.abs(counts.clean / 4000 - 0.5) < 0.04);
  assert.ok(Math.abs(counts.noticed / 4000 - 0.3) < 0.04);
  assert.ok(Math.abs(counts.caught / 4000 - 0.2) < 0.04);
});

// ── (2) The promised fallout is the card that is dealt ───────────────────────

test('a caught shortcut promises one card, keeps the promise next season, and names the shortcut on it', () => {
  const state = stateFor('planner', 'bulkley-valley', 2);
  state.currentSeasonContext = { season: 'summer' };
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'planner-overstate-decay');
  const card = adaptIllegalActTemptation(act, state);
  assert.equal(card.promisedFallout?.id, 'cruise-design-grid-shortcut');
  assert.equal(card.options[1].bands.caught.fallout.id, 'cruise-design-grid-shortcut');

  const result = takeShortcut(state, card, 0.99);
  assert.equal(result.riskResult.band, 'caught');
  assert.equal(result.scheduledIssueTeaser.text, 'Fallout (minor): Cruise Design Grid Shortcut. It lands next season.');
  assert.equal(state.pendingIssues[0].id, 'cruise-design-grid-shortcut');
  assert.equal(state.pendingIssues[0].causedBy.kind, 'shortcut');
  assert.equal(state.pendingIssues[0].causedBy.institution, 'Timber Pricing');

  state.round = 3;
  const issue = drawIssue(state, () => 0.99);
  assert.equal(issue.id, 'cruise-design-grid-shortcut');
  assert.equal(issue.scheduled, true);
  assert.equal(issue.sourceTitle, 'Overstate the Decay');
  assert.equal(issue.causedBy.actId, 'planner-overstate-decay');
  assert.equal(issue.surfaceReason, 'Why this surfaced: you took the shortcut “Overstate the Decay” in summer, and Timber Pricing caught it.');
});

test('the promise is judged against the season it lands in, not the one it was made in', () => {
  // ENV + herbicide for silviculture leads with the drift complaint, a summer-only card.
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'silvi-spray-in-wind');
  const summer = stateFor('silviculture', 'bulkley-valley', 2);
  const fall = stateFor('silviculture', 'bulkley-valley', 3);
  assert.equal(adaptIllegalActTemptation(act, summer).promisedFallout.id, 'environmental-audit-fallout', 'lands in fall: no drift complaint');
  assert.equal(adaptIllegalActTemptation(act, fall).promisedFallout.id, 'environmental-audit-fallout');
  const spring = stateFor('silviculture', 'bulkley-valley', 1);
  assert.equal(adaptIllegalActTemptation(act, spring).promisedFallout.id, 'herbicide-drift-complaint', 'lands in summer');
});

test('every seasonal offer promises a card that can be dealt where it lands', () => {
  for (const roleId of SEASONAL_ROLES) {
    for (const area of OPERATING_AREAS) {
      for (const round of [2, 3]) {
        const state = stateFor(roleId, area.id, round);
        for (const act of ILLEGAL_ACTS.filter((entry) => actMatchesSeasonalTemptationContext(entry, state))) {
          const card = adaptIllegalActTemptation(act, state);
          assert.ok(card.promisedFallout?.id, `${roleId}/${area.id}/${round} ${act.id} promises nothing`);
          const schedule = card.options[1].risk.failScheduleIssues[0];
          assert.equal(schedule.id, card.promisedFallout.id);
          assert.ok(ISSUE_BY_ID.has(schedule.id));
        }
      }
    }
  }
});

// ── (3) A final-season catch settles at the year end ─────────────────────────

test('a shortcut caught in the last season says where its fallout goes and the year-end review carries it', () => {
  const state = stateFor('planner', 'fort-st-john-plateau', 4);
  state.currentSeasonContext = { season: 'winter' };
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'planner-misrepresent-species-comp');
  const card = adaptIllegalActTemptation(act, state);
  const result = takeShortcut(state, card, 0.99);
  assert.equal(result.riskResult.band, 'caught');
  assert.match(result.scheduledIssueTeaser.text, /^Fallout \(manageable\): Ministry Data Audit\. It lands after the year closes and goes on next year's file\.$/);

  const consequences = applyRoundConsequences(state);
  assert.ok(consequences.includes('unlanded-fallout'));
  assert.equal(state.pendingIssues.filter((entry) => entry.causedBy?.kind === 'shortcut' || entry.id === 'ministry-data-audit').length, 0, 'the shortcut\'s fallout is settled, not left dangling');
  const settled = state.history.find((entry) => entry.id === 'unlanded-fallout');
  assert.deepEqual(settled.rawEffects, { compliance: -3, relationships: -1 });
  assert.equal(settled.falloutId, 'ministry-data-audit');
  const explained = describeConsequences(state, ['unlanded-fallout'])[0];
  assert.equal(explained.title, 'Ministry Data Audit lands after the year closes');
  assert.match(explained.cause, /you took the shortcut “Fudge the Species Composition” in winter, and C&E caught it/i);
  assert.match(explained.effectText, /Compliance -3/);

  const summary = buildSummary(state);
  assert.ok(summary.messages.some((line) => /Ministry Data Audit lands after the year closes/.test(line)), summary.messages.join('\n'));
  assert.ok(summary.scoreDetail.reasons.some((line) => /came back on you/.test(line)));
});

// ── (4) Silence about a go-around is not free ────────────────────────────────

test('condoning a go-around costs the file, and reporting it costs no scrutiny', () => {
  const journey = createJourney({ roleId: 'recce', areaId: 'fort-st-john-plateau' });
  journey.day = 9;
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'recce-move-riparian-ribbon');
  const offer = buildTemptationEvent(act, journey);
  assert.deepEqual(resolveTemptationSetAside(journey, offer, () => 0.9), { kind: 'drop', message: 'You let it sit. The falling contractor does not bring it up again.' });

  const goAround = { ...offer, temptationStage: 'goaround' };
  const reply = resolveTemptationSetAside(journey, goAround, () => 0.9);
  assert.equal(reply.kind, 'condone');
  assert.deepEqual(reply.effects, GO_AROUND_SILENCE_COST);
  assert.ok(reply.effects.compliance < 0 && reply.effects.scrutiny > 0);
  assert.deepEqual(reply.flags, ['contractor_owns_you']);
  assert.deepEqual(journey.temptationMemory.takenActIds, [act.id]);
});

// ── (5) Gating ───────────────────────────────────────────────────────────────

test('seasonal offers respect season and area: no bears or planting in winter, no coastal fir on the coast', () => {
  const winterRecce = stateFor('recce', 'bulkley-valley', 4);
  const winterSilvi = stateFor('silviculture', 'fort-st-john-plateau', 4);
  const byId = (id) => ILLEGAL_ACTS.find((entry) => entry.id === id);
  for (const id of ['dont-report-the-grizzly-encounter', 'recce-hide-bear-den', 'stealth-owl-relocation']) {
    assert.equal(actMatchesSeasonalTemptationContext(byId(id), winterRecce), false, `${id} in winter`);
    assert.equal(actMatchesSeasonalTemptationContext(byId(id), stateFor('recce', 'bulkley-valley', 2)), true, `${id} in summer`);
  }
  for (const id of ['seedling-switcheroo', 'silvi-fudge-species-mix', 'silvi-ignore-bear-encounters', 'silvi-ignore-first-aid']) {
    assert.equal(actMatchesSeasonalTemptationContext(byId(id), winterSilvi), false, `${id} in winter`);
  }
  assert.equal(actMatchesSeasonalTemptationContext(byId('silvi-wrong-seed-zone'), stateFor('silviculture', 'vancouver-island-coast', 2)), false);
  assert.equal(actMatchesSeasonalTemptationContext(byId('silvi-wrong-seed-zone'), stateFor('silviculture', 'fort-st-john-plateau', 2)), false);
  assert.equal(actMatchesSeasonalTemptationContext(byId('silvi-wrong-seed-zone'), stateFor('silviculture', 'kootenay-wetbelt', 2)), true);
  // Coastal Douglas-fir seed is the Island's, and a seed variance is the silviculture forester's file.
  assert.equal(actMatchesSeasonalTemptationContext(byId('permitter-falsify-seed-transfer'), stateFor('silviculture', 'fort-st-john-plateau', 4)), false);
  assert.equal(actMatchesSeasonalTemptationContext(byId('permitter-falsify-seed-transfer'), stateFor('silviculture', 'skeena-nass', 4)), false);
  assert.equal(actMatchesSeasonalTemptationContext(byId('permitter-falsify-seed-transfer'), stateFor('silviculture', 'vancouver-island-coast', 4)), true);
  assert.equal(actMatchesSeasonalTemptationContext(byId('permitter-falsify-seed-transfer'), stateFor('permitter', 'vancouver-island-coast', 4)), false);
  assert.equal(actMatchesSeasonalTemptationContext(byId('planner-manipulate-ha-size'), stateFor('planner', 'fort-st-john-plateau', 2)), false, 'the 40 ha cap is not a Northern Interior number');
  assert.equal(actMatchesSeasonalTemptationContext(byId('planner-manipulate-ha-size'), stateFor('planner', 'okanagan-shuswap-drybelt', 2)), true);
});

test('no act reaches a seasonal role it does not name or a phase the role does not work', () => {
  for (const roleId of SEASONAL_ROLES) {
    for (const area of OPERATING_AREAS) {
      for (const round of [2, 3, 4]) {
        const state = stateFor(roleId, area.id, round);
        for (const act of ILLEGAL_ACTS.filter((entry) => actMatchesSeasonalTemptationContext(entry, state))) {
          assert.ok(act.roles.includes(roleId), `${act.id} reached ${roleId}`);
          assert.ok(act.phase === 'any' || ROLE_PHASES[roleId].includes(act.phase), `${act.id} (${act.phase}) reached ${roleId}`);
          assert.ok(!act.roles.every((role) => role === 'manager'), `${act.id} is manager-only`);
          assert.ok(actFitsRole(act, roleId));
        }
      }
    }
  }
});

test('a silviculture deployment runs the growing season, so its brushing and survey acts are reachable there', () => {
  const journey = createJourney({ roleId: 'silviculture', areaId: 'fraser-plateau' });
  journey.day = 5;
  assert.equal(journey.season.currentSeason, 'spring');
  for (const id of ['silvi-unapproved-herbicide', 'silvi-fake-free-growing', 'silvi-ignore-heat-stress', 'sign-the-free-growing-survey-you-didnt-walk', 'recce-burn-during-ban', 'permitter-bypass-herbicide-permit', 'silvi-ignore-buffer-spray']) {
    assert.equal(actMatchesTemptationContext(ILLEGAL_ACTS.find((entry) => entry.id === id), journey), true, id);
  }
  // A winter act stays a winter act, and a recce crew in summer still cannot be offered a heat-stress card in winter.
  const planner = createJourney({ roleId: 'planner', areaId: 'fraser-plateau' });
  planner.day = 5;
  assert.equal(actMatchesTemptationContext(ILLEGAL_ACTS.find((entry) => entry.id === 'extend-the-regen-delay-quietly'), planner), true, 'fall planning reaches the regen-delay push');
  const recce = createJourney({ roleId: 'recce', areaId: 'fraser-plateau' });
  recce.season.currentSeason = 'winter';
  assert.equal(actMatchesTemptationContext(ILLEGAL_ACTS.find((entry) => entry.id === 'dont-report-the-grizzly-encounter'), recce), false);
});

// ── (6) Regression guard: the promised card is dealt in the next season ──────

function playYearTakingShortcuts(roleId, areaId, seed) {
  const roles = getSeasonalPlayableRoles(FORESTER_ROLES).map((role) => role.id);
  const areas = OPERATING_AREAS.map((area) => area.id);
  const controller = new TuiGameController({ rng: makeRng(seed), onExit: () => {} });
  controller.setInputText('Guard Co');
  controller.submitCurrent();
  controller.selectOption(roles.indexOf(roleId));
  controller.selectOption(areas.indexOf(areaId));
  // A file already under scrutiny, so enough shortcuts are caught to judge.
  controller.gs.metrics.compliance = 35;
  controller.gs.metrics.relationships = 40;
  const promises = [];
  let guard = 0;
  while (controller.getState().mode !== 'end' && guard < 600) {
    guard += 1;
    const view = controller.getState();
    const options = view.options || [];
    if (!options.length) break;
    const content = view.contentData || {};
    if (content.type === 'temptation') {
      const round = controller.gs.round;
      controller.selectOption(options.findIndex((label) => /^Take the shortcut/.test(String(label))));
      const pending = (controller.gs.pendingIssues || []).find((entry) => entry.causedBy?.kind === 'shortcut' && entry.causedBy.round === round);
      if (controller.gs.lastDecision?.band === 'caught' && pending) promises.push({ round, id: pending.id });
      continue;
    }
    // Everything else: the first option, which never gambles on a shortcut.
    controller.selectOption(0);
  }
  const issues = (controller.gs.history || []).filter((entry) => entry.type === 'issue');
  return promises.map((promise) => ({
    ...promise,
    landed: issues.some((entry) => entry.id === promise.id && entry.round === promise.round + 1),
    settled: promise.round >= controller.gs.totalRounds
      && (controller.gs.history || []).some((entry) => entry.id === 'unlanded-fallout' && entry.falloutId === promise.id),
  }));
}

test('a caught shortcut\'s promised fallout card is dealt in the next season in at least 95% of seeded years', () => {
  const results = [];
  for (const roleId of SEASONAL_ROLES) {
    for (const [areaIndex, area] of OPERATING_AREAS.entries()) {
      for (let seed = 1; seed <= 8; seed += 1) {
        results.push(...playYearTakingShortcuts(roleId, area.id, (seed * 7919 + areaIndex * 104729 + roleId.length * 15485863) >>> 0));
      }
    }
  }
  const early = results.filter((entry) => entry.round < 4);
  const late = results.filter((entry) => entry.round >= 4);
  assert.ok(early.length >= 25, `only ${early.length} early catches to judge`);
  const landed = early.filter((entry) => entry.landed).length;
  assert.ok(landed / early.length >= 0.95, `${landed}/${early.length} promises kept: ${JSON.stringify(early.filter((entry) => !entry.landed))}`);
  // A last-season catch is settled in the year-end consequences instead.
  assert.ok(late.every((entry) => entry.settled), JSON.stringify(late.filter((entry) => !entry.settled)));
});

test('over a year, taking every shortcut does not beat refusing every shortcut', () => {
  // A small witness alongside the headless sims (docs/playability-fixes.md);
  // the balance is set by SHORTCUT_* in js/engine/constants.js.
  const totals = { take: 0, refuse: 0 };
  let years = 0;
  for (const roleId of SEASONAL_ROLES) {
    for (const [areaIndex, area] of OPERATING_AREAS.entries()) {
      for (let seed = 1; seed <= 3; seed += 1) {
        const base = (seed * 7919 + areaIndex * 104729 + roleId.length * 15485863) >>> 0;
        const take = simulateRun({ roleId, areaId: area.id, strategy: 'aggressive', seed: base });
        const refuse = simulateRun({ roleId, areaId: area.id, strategy: 'balanced', seed: base });
        totals.take += take.score || 0;
        totals.refuse += refuse.score || 0;
        years += 1;
      }
    }
  }
  assert.ok(years > 0);
  assert.ok(totals.take < totals.refuse, `take ${totals.take / years} vs refuse ${totals.refuse / years}`);
});
