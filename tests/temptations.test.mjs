import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ILLEGAL_ACTS,
  ACTIVE_ILLEGAL_ACTS,
  ILLEGAL_ACT_CATEGORIES,
  CATCH_INSTITUTIONS,
  actFitsRole,
  buildCaughtNarrative,
} from '../js/data/illegalActs.js';
import {
  actMatchesTemptationContext,
  buildShortcutOption,
  buildTemptationEvent,
  buildTemptationPayoff,
  eventMatchesJourneyContext,
  reconcileTakenShortcuts,
  resolveTemptationSetAside,
  weightTemptationPool,
} from '../js/events/selection.js';
import { checkForEvent, formatEventForDisplay, resolveEvent } from '../js/events.js';
import { matchesOddsCondition } from '../js/events/odds.js';
import { applySetAsideCost, situationCostsTheDay } from '../js/journey/daySituation.js';
import { buildEventCardContent } from '../js/journey/dayCard.js';
import { createJourney } from '../js/journey.js';
import { adaptIllegalActTemptation, drawSeasonalTemptation } from '../js/engine/content.js';
import { createInitialState } from '../js/engine/state.js';

const ROLE_AREAS = {
  recce: 'fort-st-john-plateau',
  silviculture: 'fraser-plateau',
  planner: 'bulkley-valley',
  permitter: 'bulkley-valley',
};

function journeyFor(roleId, extra = {}) {
  const journey = createJourney({ roleId, areaId: ROLE_AREAS[roleId] || 'bulkley-valley', ...extra });
  journey.day = 5;
  return journey;
}

function managerJourney() {
  const journey = createJourney({ roleId: 'manager', areaId: 'bulkley-valley' });
  journey.day = 5;
  return journey;
}

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = typeof value === 'function' ? value : () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function fakeUi() {
  const lines = [];
  return {
    lines,
    write(text) { lines.push(String(text)); },
    writeWarning(text) { lines.push(String(text)); },
  };
}

// ── The library ─────────────────────────────────────────────────────────────

test('every act carries the fields the temptation lane needs', () => {
  for (const act of ILLEGAL_ACTS) {
    assert.ok(act.pitch, `${act.id} has no pitch`);
    assert.ok(act.proposer, `${act.id} has no proposer`);
    assert.ok(ILLEGAL_ACT_CATEGORIES.includes(act.category), `${act.id} category ${act.category}`);
    assert.ok(CATCH_INSTITUTIONS.includes(act.catch?.by), `${act.id} catch.by ${act.catch?.by}`);
    assert.ok(act.catch?.how, `${act.id} has no catch.how`);
    assert.ok(act.payoff?.line, `${act.id} has no payoff line`);
    assert.ok(Array.isArray(act.roles) && act.roles.length > 0, `${act.id} names no role`);
  }
});

test('every active act can be offered to at least one of the roles it names', () => {
  for (const act of ACTIVE_ILLEGAL_ACTS) {
    assert.ok(act.roles.some((roleId) => actFitsRole(act, roleId)), `${act.id} fits none of ${act.roles.join(',')}`);
  }
});

test('institution vocabulary stays off the retired phrases', () => {
  const banned = /ministry auditors|safety inspector from district|compliance officer|professional reliance|the association/i;
  for (const act of ILLEGAL_ACTS) {
    const text = `${act.title} ${act.description} ${act.pitch} ${act.catch.how} ${buildCaughtNarrative(act, 0)} ${buildCaughtNarrative(act, 1)}`;
    assert.doesNotMatch(text, banned, act.id);
  }
});

// ── Role and phase gating ───────────────────────────────────────────────────

test('a recce lead is never offered a harvest, haul or corporate act', () => {
  const journey = journeyFor('recce');
  const offered = ILLEGAL_ACTS.filter((act) => actMatchesTemptationContext(act, journey));
  assert.ok(offered.length > 20, 'recce should have a real pool');
  for (const act of offered) {
    assert.ok(['layout', 'any'].includes(act.phase), `${act.id} (${act.phase}) reached the recce lane`);
    assert.ok(act.roles.includes('recce'), `${act.id} is not tagged recce`);
  }
  for (const act of ILLEGAL_ACTS.filter((entry) => ['harvest', 'haul', 'corporate'].includes(entry.phase))) {
    assert.equal(actMatchesTemptationContext(act, journey), false, `${act.id} is a ${act.phase} act`);
  }
});

test('a GM only sees acts tagged for a GM, and there is no fallback to the whole library', () => {
  const journey = managerJourney();
  const offered = ILLEGAL_ACTS.filter((act) => actMatchesTemptationContext(act, journey));
  assert.ok(offered.length > 10);
  assert.ok(offered.length < ILLEGAL_ACTS.length / 2, 'the GM used to get all 208');
  for (const act of offered) {
    assert.ok(act.roles.includes('manager'), `${act.id} reached the GM without a manager tag`);
  }
  // Nothing left to offer means nothing offered, not "everything".
  journey.temptationMemory = { lastDay: 0, seenActIds: offered.map((act) => act.id), missedEligibleDays: 9 };
  const event = withRandom(0, () => checkForEvent(journey));
  assert.notEqual(event?.type, 'temptation');
});

test('a silviculture supervisor is not offered layout work, and a recce lead is not offered planting fraud', () => {
  const silvi = journeyFor('silviculture');
  const recce = journeyFor('recce');
  const ribbon = ILLEGAL_ACTS.find((act) => act.id === 'phantom-riparian-class');
  const planting = ILLEGAL_ACTS.find((act) => act.id === 'silvi-misreport-planting');
  assert.equal(actMatchesTemptationContext(ribbon, silvi), false);
  assert.equal(actMatchesTemptationContext(planting, recce), false);
  assert.equal(actMatchesTemptationContext(planting, silvi), true);
});

test('season, area and difficulty gates apply to acts', () => {
  const journey = journeyFor('silviculture');
  const heat = ILLEGAL_ACTS.find((act) => act.id === 'silvi-ignore-heat-stress');
  journey.season.currentSeason = 'summer';
  assert.equal(actMatchesTemptationContext(heat, journey), true);
  journey.season.currentSeason = 'winter';
  assert.equal(actMatchesTemptationContext(heat, journey), false);

  const holly = ILLEGAL_ACTS.find((act) => act.id === 'stealth-holly-herbicide');
  assert.equal(actMatchesTemptationContext(holly, journey), false, 'holly is a Vancouver Island problem');
  const island = createJourney({ roleId: 'silviculture', areaId: 'vancouver-island-coast' });
  island.day = 5;
  assert.equal(actMatchesTemptationContext(holly, island), true);

  const comic = ILLEGAL_ACTS.find((act) => act.id === 'midnight-planting-bots');
  journey.season.currentSeason = 'spring';
  assert.equal(actMatchesTemptationContext(comic, journey), true);
  journey.difficulty = 'hard';
  assert.equal(actMatchesTemptationContext(comic, journey), false, 'comic never on hard');

  const retired = ILLEGAL_ACTS.find((act) => act.id === 'trespass-lidar-raid');
  assert.equal(actMatchesTemptationContext(retired, journeyFor('planner')), false);
});

test('the comic tier lands about 15% of the pool weight and grey acts weigh 60% of core', () => {
  const journey = managerJourney();
  const candidates = ILLEGAL_ACTS.filter((act) => actMatchesTemptationContext(act, journey));
  const pool = weightTemptationPool(candidates);
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  const comic = pool.filter((entry) => entry.act.tier === 'comic').reduce((sum, entry) => sum + entry.weight, 0);
  assert.ok(Math.abs(comic / total - 0.15) < 0.01, `comic share ${comic / total}`);
  const grey = pool.find((entry) => entry.act.tier === 'grey' && !entry.act.rare);
  const core = pool.find((entry) => entry.act.tier === 'core' && !entry.act.rare);
  assert.equal(grey.weight / core.weight, 0.6);
});

test('the seasons filter gates authored events on the journey season', () => {
  const summerOnly = { id: 'x', seasons: ['summer'], options: [] };
  assert.equal(eventMatchesJourneyContext(summerOnly, { season: { currentSeason: 'winter' } }), false);
  assert.equal(eventMatchesJourneyContext(summerOnly, { season: { currentSeason: 'summer' } }), true);
  assert.equal(eventMatchesJourneyContext(summerOnly, {}), true, 'no season state means no gate');
});

// ── The card ────────────────────────────────────────────────────────────────

test('the card is a person speaking, at the tailgate for field roles and in the inbox for desk roles', () => {
  const recce = journeyFor('recce');
  const ribbon = ILLEGAL_ACTS.find((act) => act.id === 'recce-move-riparian-ribbon');
  const fieldEvent = buildTemptationEvent(ribbon, recce);
  assert.equal(fieldEvent.severity, 'minor');
  assert.equal(situationCostsTheDay(fieldEvent), false);
  assert.equal(fieldEvent.cardLabel, 'AT THE TAILGATE');
  assert.match(fieldEvent.description, /^The falling contractor, at the tailgate: “Give me ten more metres/);
  assert.doesNotMatch(fieldEvent.description, /quietly proposes a shortcut/);
  const card = buildEventCardContent(formatEventForDisplay(fieldEvent, 'recon'), fieldEvent,
    fieldEvent.options.map((raw, index) => ({ opt: formatEventForDisplay(fieldEvent, 'recon').options[index], raw, index })));
  assert.equal(card.label, 'AT THE TAILGATE');

  const planner = journeyFor('planner');
  const maps = ILLEGAL_ACTS.find((act) => act.id === 'black-market-timber-maps');
  const deskEvent = buildTemptationEvent(maps, planner);
  assert.ok(['IN THE INBOX', 'PHONE CALL'].includes(deskEvent.cardLabel), deskEvent.cardLabel);
  assert.doesNotMatch(deskEvent.cardLabel, /RADIO/);

  const self = ILLEGAL_ACTS.find((act) => act.id === 'rogue-referral-autoresponder');
  const selfEvent = buildTemptationEvent(self, journeyFor('permitter'));
  assert.match(selfEvent.description, /4:45 on a Friday and the thought is yours/);
});

test('the take option shows the payoff in the role currency and the odds for this run', () => {
  const recce = journeyFor('recce');
  const flags = ILLEGAL_ACTS.find((act) => act.id === 'bribed-hazard-flags');
  const event = buildTemptationEvent(flags, recce);
  const formatted = formatEventForDisplay(event, 'recon');
  const take = formatted.options[1];
  assert.equal(take.label, 'Take the shortcut');
  assert.match(take.hint, /offer: a day of layout, and a straight mainline/);
  assert.match(take.hint, /km traverse/);
  assert.match(take.hint, /\d+% clean, \d+% badly wrong for you today/);
  assert.doesNotMatch(take.hint, /-\d+h/);
  assert.equal(take.tag, 'RISKY');
});

// ── Payoff in the role's currency ───────────────────────────────────────────

test('payoff lands in progress for field roles, files for permitters, and money only at the right scale', () => {
  const flags = ILLEGAL_ACTS.find((act) => act.id === 'bribed-hazard-flags');
  const recceProgress = buildTemptationPayoff(flags, journeyFor('recce'));
  assert.ok(recceProgress.effects.progress > 0);
  assert.equal(recceProgress.effects.budget, undefined, 'a recce lead is offered ground, not cash');

  const cash = ILLEGAL_ACTS.find((act) => act.id === 'recce-smuggle-firewood');
  assert.ok(buildTemptationPayoff(cash, journeyFor('recce')).effects.budget <= 1200);

  const seedlings = ILLEGAL_ACTS.find((act) => act.id === 'seedling-switcheroo');
  assert.equal(buildTemptationPayoff(seedlings, journeyFor('silviculture')).effects.budget, 9000);

  const referral = ILLEGAL_ACTS.find((act) => act.id === 'rogue-referral-autoresponder');
  const permitterFiles = buildTemptationPayoff(referral, journeyFor('permitter'));
  assert.equal(permitterFiles.effects.progress, 20, 'two files moved is twenty pipeline points');

  const maps = ILLEGAL_ACTS.find((act) => act.id === 'black-market-timber-maps');
  assert.ok(buildTemptationPayoff(maps, journeyFor('planner')).effects.progress >= 12, 'a planner is paid in analysis');

  const recode = ILLEGAL_ACTS.find((act) => act.id === 'phantom-budget-recode');
  const gm = buildTemptationPayoff(recode, managerJourney());
  assert.equal(gm.effects.budget, Math.min(60000, 35000 * 3));
});

// ── Refusing is free; set-aside costs nothing ───────────────────────────────

test('refusing is brief, free, and does not count as a prior shortcut', () => {
  const journey = journeyFor('recce');
  const scrutinyBefore = journey.scrutiny;
  const budgetBefore = journey.resources.budget;
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'recce-fake-stream-class');
  const event = buildTemptationEvent(act, journey);
  const refuse = event.options[0];
  assert.equal(refuse.label, 'Say no');
  assert.deepEqual(refuse.effects, {});
  assert.equal(refuse.reactionTone, 'steady');
  withRandom(0.99, () => resolveEvent(journey, event, refuse));
  assert.equal(journey.scrutiny, scrutinyBefore);
  assert.equal(journey.resources.budget, budgetBefore);
  assert.equal(reconcileTakenShortcuts(journey), 0);
  assert.equal(matchesOddsCondition('priorShortcuts:1', journey), false);

  const deskEvent = buildTemptationEvent(ILLEGAL_ACTS.find((entry) => entry.id === 'borrowed-rpf-stamp'), journeyFor('planner'));
  assert.equal(deskEvent.options[0].label, 'Decline');
  assert.match(deskEvent.options[0].outcome, /close the email|say no on the phone|laughs it off|one sentence/i);
});

test('taking a shortcut is what counts against you later', () => {
  const journey = journeyFor('recce');
  journey.log.push({ day: 3, type: 'event', eventId: 'temptation_recce-move-riparian-ribbon', optionLabel: 'Take the shortcut' });
  journey.log.push({ day: 4, type: 'event', eventId: 'temptation_recce-hide-bear-den', optionLabel: 'Say no' });
  assert.equal(reconcileTakenShortcuts(journey), 1);
  assert.deepEqual(journey.temptationMemory.takenActIds, ['recce-move-riparian-ribbon']);
  assert.equal(matchesOddsCondition('priorShortcuts:1', journey), true);
  assert.equal(matchesOddsCondition('priorShortcuts:2', journey), false);
});

test('documenting and reporting is ten minutes, not a quarter-shift', () => {
  const field = buildTemptationEvent(ILLEGAL_ACTS.find((entry) => entry.id === 'recce-hide-bear-den'), journeyFor('recce'));
  assert.deepEqual(field.options[2].effects, { compliance: 2, timeUsed: 0.5 });
  const desk = buildTemptationEvent(ILLEGAL_ACTS.find((entry) => entry.id === 'silent-fom-comment-box'), journeyFor('planner'));
  assert.equal(desk.options[2].label, 'Document and report');
  assert.deepEqual(desk.options[2].effects, { compliance: 2, politicalCapital: 1, timeUsed: 0.5 });
});

test('setting a temptation aside charges no scrutiny and no morale', () => {
  const journey = journeyFor('recce', { crew: undefined });
  const before = journey.scrutiny;
  const moraleBefore = journey.crew.map((member) => member.morale);
  const event = buildTemptationEvent(ILLEGAL_ACTS.find((entry) => entry.id === 'recce-hide-bear-den'), journey);
  const ui = fakeUi();
  withRandom(0.99, () => applySetAsideCost(ui, journey, event));
  assert.equal(journey.scrutiny, before);
  assert.deepEqual(journey.crew.map((member) => member.morale), moraleBefore);
  assert.ok(ui.lines.some((line) => /let it sit/i.test(line)));

  // An ordinary situation still costs what it always did.
  applySetAsideCost(fakeUi(), journey, { type: 'terrain', severity: 'moderate' });
  assert.equal(journey.scrutiny, before + 2);
});

test('silence is answered: they drop it, ask again with a deadline, or go around you', () => {
  const journey = journeyFor('recce');
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'recce-move-riparian-ribbon');
  const event = buildTemptationEvent(act, journey);

  assert.equal(resolveTemptationSetAside(journey, event, () => 0.9).kind, 'drop');
  assert.equal(journey.temptationMemory.pending.length, 0);

  assert.equal(resolveTemptationSetAside(journey, event, () => 0.3).kind, 'reoffer');
  const reoffer = journey.temptationMemory.pending.pop();
  assert.equal(reoffer.kind, 'reoffer');
  assert.ok(reoffer.day >= journey.day + 2 && reoffer.day <= journey.day + 4);

  assert.equal(resolveTemptationSetAside(journey, event, () => 0.05).kind, 'goaround');
  const goaround = journey.temptationMemory.pending[0];
  assert.equal(goaround.kind, 'goaround');

  // The follow-up arrives on its day, ahead of any new draw.
  journey.day = goaround.day;
  const followUp = withRandom(0.99, () => checkForEvent(journey));
  assert.equal(followUp?.type, 'temptation');
  assert.equal(followUp.temptationStage, 'goaround');
  assert.equal(followUp.severity, 'minor');
  assert.match(followUp.description, /somebody went around you/i);
  assert.match(followUp.description, /report a thing you did not do/i);
  assert.deepEqual(followUp.options.map((option) => option.label), ['Report it', 'Fix it quietly', 'Let it stand']);
  assert.ok(followUp.options[2].chanceSuccess < event.options[1].chanceSuccess, 'letting it stand is worse odds');

  // Re-offers carry the escalated pitch.
  journey.temptationMemory.pending.push({ actId: act.id, day: journey.day, kind: 'reoffer' });
  const again = withRandom(0.99, () => checkForEvent(journey));
  assert.equal(again.temptationStage, 'reoffer');
  assert.match(again.description, /second time of asking/);
});

// ── The caught band names the institution ───────────────────────────────────

const INSTITUTION_MARKERS = {
  'C&E': /NRO|C&E/,
  FPB: /Forest Practices Board/,
  FPBC: /Forest Professionals BC|FPBC/,
  WorkSafeBC: /WorkSafeBC/,
  BCWS: /Wildfire/,
  COS: /[Cc]onservation [Oo]fficer/,
  ENV: /ENV|Ministry of Environment/,
  DFO: /DFO|Fisheries Act/,
  'Archaeology Branch': /Archaeology Branch|Heritage Conservation Act|Branch/,
  'Timber Pricing': /Timber Pricing|check cruis/,
  'Revenue Branch': /Revenue Branch/,
  'the Nation': /referrals coordinator|Guardians|Nation/,
  RCMP: /RCMP/,
  CVSE: /CVSE|Commercial Vehicle/,
  'Transport Canada': /Transport Canada|Navigable Waters/,
  'internal audit': /audit/i,
  'the contractor': /contractor|super/,
};

test('every caught band names the institution that caught it, in both variants', () => {
  const journey = journeyFor('recce');
  for (const act of ILLEGAL_ACTS) {
    const marker = INSTITUTION_MARKERS[act.catch.by];
    for (const variant of [0, 1]) {
      assert.match(buildCaughtNarrative(act, variant), marker, `${act.id} variant ${variant}`);
    }
    const option = buildShortcutOption(act, journey);
    assert.match(option.failureOutcome, /^It does not hold\./);
    assert.match(option.failureOutcome, marker, act.id);
    assert.match(option.failureOutcome, new RegExp(act.catch.how.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${act.id} uses catch.how`);
  }
});

test('the caught band pays in the institution currency and leaves the right flag', () => {
  const recce = journeyFor('recce');
  const ce = buildShortcutOption(ILLEGAL_ACTS.find((act) => act.id === 'recce-move-riparian-ribbon'), recce);
  assert.ok(ce.failureEffects.compliance < 0 && ce.failureEffects.budget < 0 && ce.failureEffects.scrutiny > 0);
  assert.deepEqual(ce.failureFlags, ['ce_watching']);
  assert.deepEqual(ce.partialFlags, ['ce_watching']);

  const worksafe = buildShortcutOption(ILLEGAL_ACTS.find((act) => act.id === 'recce-ignore-danger-tree'), recce);
  assert.ok(worksafe.failureEffects.progress < 0, 'a stop-work day');
  assert.ok(worksafe.failureEffects.crew_morale < 0);
  assert.deepEqual(worksafe.failureFlags, ['worksafe_watching']);
  assert.equal(worksafe.riskInjury, 0.15);

  const nation = buildShortcutOption(ILLEGAL_ACTS.find((act) => act.id === 'courtesy-flag-bribes'), recce);
  assert.deepEqual(nation.failureFlags, ['fn_watching', 'locals_soured']);
  assert.ok(nation.failureEffects.relationships < 0);

  const fpbc = buildShortcutOption(ILLEGAL_ACTS.find((act) => act.id === 'borrowed-rpf-stamp'), journeyFor('planner'));
  assert.deepEqual(fpbc.failureFlags, ['ce_watching', 'fpbc_file_open']);

  const rcmp = buildShortcutOption(ILLEGAL_ACTS.find((act) => act.id === 'midnight-variance-forgery'), journeyFor('permitter'));
  assert.deepEqual(rcmp.failureFlags, ['ce_watching', 'rcmp_file']);
  assert.ok(rcmp.failureEffects.compliance <= -16);

  const contractor = buildShortcutOption(ILLEGAL_ACTS.find((act) => act.id === 'silvi-falsify-planting-quality'), journeyFor('silviculture'));
  assert.deepEqual(contractor.failureFlags, ['contractor_owns_you']);
  assert.doesNotMatch(contractor.partialOutcome, /Money changes hands/);
});

test('an FPBC file puts the registration under review the next day', () => {
  const journey = journeyFor('planner');
  assert.equal(journey.professional.registrationStatus, 'active');
  journey.consequenceFlags = ['fpbc_file_open'];
  journey.day = 9;
  withRandom(0.99, () => checkForEvent(journey));
  assert.equal(journey.professional.registrationStatus, 'under-review');
});

test('being watched moves the odds against the next shortcut', () => {
  const journey = journeyFor('recce');
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'recce-move-riparian-ribbon');
  const clean = buildShortcutOption(act, journey).liveOdds;
  journey.consequenceFlags = ['ce_watching'];
  const watched = buildShortcutOption(act, journey).liveOdds;
  assert.ok(watched.bad > clean.bad + 0.15, `${watched.bad} vs ${clean.bad}`);
});

// ── The seasonal lane ───────────────────────────────────────────────────────

test('the seasonal card refuses for free, names the institution when caught, and previews adapted meters', () => {
  const state = createInitialState({ companyName: 'T', roleId: 'recce', areaId: 'muskwa-foothills' });
  state.round = 2;
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'bribed-hazard-flags');
  const card = adaptIllegalActTemptation(act, state, () => 0.5);
  assert.equal(card.options[0].label, 'Say no');
  assert.deepEqual(card.options[0].effects, {});
  assert.equal(card.options[0].outcome, 'The file stays yours. Nothing else changes.');
  const risky = card.options.find((option) => option.risk);
  assert.match(risky.label, /C&E/);
  assert.match(risky.risk.failOutcome, /NRO/);
  assert.doesNotMatch(risky.preview, /equipment|crew_morale|politicalCapital|Political Capital|Crew Morale/i);
  assert.match(card.description, /The layout contractor: “My guys can walk right past/);
  const report = card.options[2];
  assert.ok(report.effects.compliance > 0);
  assert.ok((report.effects.progress || 0) >= -1, 'ten minutes, not a quarter-shift');
});

test('the seasonal draw respects role and phase with no fallback', () => {
  const state = createInitialState({ companyName: 'T', roleId: 'silviculture', areaId: 'muskwa-foothills' });
  state.round = 3;
  for (let i = 0; i < 40; i += 1) {
    const rolls = [0, 0, i / 40];
    const card = drawSeasonalTemptation(state, () => rolls.shift() ?? 0.5);
    if (!card) continue;
    const act = ILLEGAL_ACTS.find((entry) => `temptation:${entry.id}` === card.id);
    assert.ok(act.roles.includes('silviculture'), act.id);
    assert.ok(['silviculture', 'any'].includes(act.phase), act.id);
  }
});
