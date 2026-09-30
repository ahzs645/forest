/**
 * Recon regressions from the round-2 retest: a short-rations order nobody
 * lifted until the crew quit, a collapsed crew scoring Time 100, a landslide
 * reported and then driven through, block cards at bridges, a snap that missed
 * a displayed 1.5 km, a fracture evacuated a shift late, a broken bridge billed
 * on every forward leg, storm days that promised work, a grade that no longer
 * separated good from flawless, and a Budget line that paid for starving.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney } from '../js/journey/factory.js';
import {
  runReconDay,
  handleResupply,
  reviewShortRations,
  updateReconMissionStatus,
  SHORT_RATION_MORALE_FLOOR,
} from '../js/modes/recon.js';
import {
  calculateTravelDistance,
  endFieldDay,
  executeFieldAction,
  getBlockAccessVerdict,
} from '../js/journey/fieldMechanics.js';
import { ARRIVAL_SNAP_KM } from '../js/journey/constants.js';
import { runDaySituation } from '../js/journey/daySituation.js';
import { getActiveRouteConstraint, reopenReportedConstraints } from '../js/journey/routeConstraints.js';
import { actFitsStop, eventFitsStop } from '../js/journey/packages.js';
import { eventMatchesJourneyContext, actMatchesTemptationContext } from '../js/events/selection.js';
import { formatEventForDisplay } from '../js/events/display.js';
import { optionSpendsDay } from '../js/events/timePolicy.js';
import { pickDeferredCost } from '../js/events/deferral.js';
import { handleEvent } from '../js/modes/shared/handleEvent.js';
import { applyStatusEffect } from '../js/crew.js';
import { calculateScore } from '../js/scoring.js';
import { computeSeasonBridge, readStandingSnapshot } from '../js/game/campaign.js';
import { FIELD_RESOURCES } from '../js/resources.js';
import { FIELD_EVENTS, ILLEGAL_ACTS, OPERATING_AREAS } from '../js/data/index.js';
import blocksData from '../js/data/json/field/blocks.json' with { type: 'json' };

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  let result;
  try {
    result = fn();
  } catch (error) {
    Math.random = original;
    throw error;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => { Math.random = original; });
  }
  Math.random = original;
  return result;
}

function makeUi(pickValue, log = []) {
  const write = (message) => log.push(String(message ?? ''));
  const noop = () => {};
  return {
    clear: noop, write, writeHeader: write, writePositive: write, writeWarning: write, writeDanger: write,
    writeBox: write, writeDivider: noop, updateAllStatus: noop, playScene: noop, playEventVignette: noop,
    playTravelStrip: noop, setMissionStatus: noop, clearMissionStatus: noop,
    async promptText() { return 'x'; },
    async promptChoice(prompt, options = []) {
      return pickValue(options, prompt) || options[0];
    },
  };
}

const CLEAR = { id: 'clear', name: 'Clear Skies', tempC: 18, travelModifier: 1, moraleEffect: 0 };

/** Camp, a package block, a bridge waypoint, and a far block. */
function routeJourney() {
  const journey = createReconJourney({ areaId: 'fraser-plateau' });
  journey.blocks = [
    { id: 'camp', name: 'Camp', kind: 'waypoint', distance: 0, terrain: 'flat', hazards: [], features: [] },
    { id: 'blk-1', name: 'Block FP-02', kind: 'block', distance: 9, terrain: 'flat', hazards: [], features: [] },
    { id: 'bridge', name: 'Nechako Bridge', kind: 'waypoint', distance: 6, terrain: 'river', hazards: ['river_crossing'], features: ['bridge'] },
    { id: 'blk-2', name: 'Block FP-04', kind: 'block', distance: 8, terrain: 'flat', hazards: [], features: [] },
  ];
  journey.totalDistance = 23;
  journey.packageTarget = 2;
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0;
  journey.day = 1;
  journey.weather = { ...CLEAR };
  journey.temperature = 'warm';
  Object.assign(journey.resources, { food: 80, fuel: 400, equipment: 100, budget: 1450 });
  for (const member of journey.crew) { member.health = 100; member.morale = 80; }
  return journey;
}

/** Stand the crew down: the camp menu, then whatever acknowledges. */
function standDown(options) {
  return options.find((o) => o.value === 'camp_menu')
    || options.find((o) => o.value === 'end_shift')
    || options.find((o) => o.presentation === 'continue')
    || options.find((o) => o.value === 'next');
}

// ── Short rations lift when their reason does ─────────────────────────────

test('a short-rations order lifts by itself once the box is restocked, and says so', async () => {
  const journey = routeJourney();
  journey.rationPlan = { mode: 'short', shortRationStreak: 5, lastDecisionDay: 0, orderedAtFood: 12 };
  journey.resources.food = 45;
  assert.equal(reviewShortRations(journey)?.reason, 'restocked');

  const log = [];
  await withRandom(0.99, () => runReconDay({ journey, ui: makeUi(standDown, log), gameOver: false }));
  assert.equal(journey.rationPlan.mode, 'normal');
  assert.ok(log.some((line) => /Short rations lift/.test(line)), log.join('\n'));
});

test('an order given on a full box holds until a restock, not until the next morning', () => {
  const journey = routeJourney();
  journey.rationPlan = { mode: 'short', shortRationStreak: 1, lastDecisionDay: 0, orderedAtFood: 60 };
  journey.resources.food = 52;
  assert.equal(reviewShortRations(journey), null, 'stretching a full box is the player\'s call');
  journey.resources.food = 75;
  assert.equal(reviewShortRations(journey)?.reason, 'restocked');
});

test('buying food at the supply point lifts short rations on the spot', async () => {
  const journey = routeJourney();
  journey.rationPlan = { mode: 'short', shortRationStreak: 3, lastDecisionDay: 0, orderedAtFood: 14 };
  journey.resources.food = 10;
  journey.resources.budget = 5000;
  const log = [];
  let bought = 0;
  const ui = makeUi((options) => {
    if (bought < 2 && options.some((o) => o.value === 'rations')) { bought += 1; return options.find((o) => o.value === 'rations'); }
    return options.find((o) => o.value === 'done');
  }, log);
  await handleResupply({ ui, journey }, { name: 'Supply Point' });
  assert.ok(journey.resources.food > FIELD_RESOURCES.food.warning);
  assert.equal(journey.rationPlan.mode, 'normal');
  assert.ok(log.some((line) => /Short rations lift/.test(line)));
});

test('a crew near the quit line comes off short rations before anyone walks', () => {
  const journey = routeJourney();
  journey.rationPlan = { mode: 'short', shortRationStreak: 7, lastDecisionDay: 0, orderedAtFood: 18 };
  journey.resources.food = 15;
  journey.crew[2].morale = SHORT_RATION_MORALE_FLOOR - 4;
  const review = reviewShortRations(journey);
  assert.equal(review?.reason, 'morale');
  assert.equal(review.member, journey.crew[2]);
  // Above the quit line (js/crew.js quits at morale 10) by a margin of shifts.
  assert.ok(SHORT_RATION_MORALE_FLOOR - 10 >= 4 * 4);

  // On a nearly empty box the order stays; the morning beat names its cost.
  journey.resources.food = FIELD_RESOURCES.food.critical - 1;
  assert.equal(reviewShortRations(journey), null);
});

test('the morning beat names what short rations cost on a thin box', async () => {
  const journey = routeJourney();
  journey.rationPlan = { mode: 'short', shortRationStreak: 4, lastDecisionDay: 0, orderedAtFood: 15 };
  journey.resources.food = 6;
  const log = [];
  await withRandom(0.99, () => runReconDay({ journey, ui: makeUi(standDown, log), gameOver: false }));
  assert.ok(log.some((line) => /short rations at 4 morale a shift each/.test(line)), log.join('\n'));
});

test('the mission panel carries the standing cost of short rations', () => {
  const journey = routeJourney();
  journey.rationPlan = { mode: 'short', shortRationStreak: 3, lastDecisionDay: 0 };
  const status = updateReconMissionStatus(makeUi(() => null), journey);
  assert.ok(status.alerts.some((alert) => /Short rations \(3 days\): 4 morale a shift each/.test(alert.text)));
});

// ── The grade ─────────────────────────────────────────────────────────────

function finishedRecon({ day, crewMorale = 90, clean = 10, dirty = 0, won = true } = {}) {
  const journey = routeJourney();
  journey.day = day;
  journey.deadline = 40;
  journey.distanceTraveled = journey.totalDistance;
  journey.currentBlockIndex = journey.blocks.length - 1;
  journey.blocksAssessed = won ? 2 : 0;
  for (const member of journey.crew) { member.health = 100; member.morale = crewMorale; }
  journey.log = [
    ...Array.from({ length: clean }, () => ({ type: 'event', effects: { compliance: 2 } })),
    ...Array.from({ length: dirty }, () => ({ type: 'event', effects: { scrutiny: 3 } })),
  ];
  journey.scrutiny = 10;
  return journey;
}

test('a season that was not delivered earns no Time, however early it collapsed', () => {
  const collapsed = finishedRecon({ day: 14, won: false });
  collapsed.distanceTraveled = 10;
  const score = calculateScore(collapsed, false);
  assert.equal(score.components.speed.score, 0);
  assert.match(score.components.speed.label, /not delivered/);
  assert.equal(score.components.objectives.score, 0, 'no packages closed, no objective credit');

  const won = calculateScore(finishedRecon({ day: 30 }), true);
  assert.ok(won.components.speed.score > 0);
  assert.ok(won.totalScore > score.totalScore);
});

test('a careful win lands in the 80s-90s; only a flawless one reaches 100', () => {
  // Clean run = 2 packages x 2 + 3 legs = 7 shifts.
  const flawless = calculateScore(finishedRecon({ day: 8, crewMorale: 100 }), true);
  assert.equal(flawless.victoryBonus, 0, 'a recon win is paid in Objectives, not a flat bonus');
  assert.equal(flawless.totalScore, 100);

  const careful = calculateScore(finishedRecon({ day: 26, crewMorale: 80, clean: 13, dirty: 1 }), true);
  assert.ok(careful.totalScore >= 85 && careful.totalScore < 97, `careful season scored ${careful.totalScore}`);
  assert.ok(careful.totalScore < flawless.totalScore);
});

test('the crew-loss ending says what happened: nobody died', () => {
  const journey = routeJourney();
  journey.crew[0].hasQuit = true;
  for (const member of journey.crew) member.isActive = false;
  withRandom(0.5, () => executeFieldAction(journey, 'camp_work'));
  assert.match(journey.gameOverReason, /^NO CREW LEFT - 1 quit and \d+ were sent out injured or ill\. Nobody is left/);
  assert.doesNotMatch(journey.gameOverReason, /LOST/);
});

// ── Landslide: turning back to report closes the road ─────────────────────

test('turning back to report a landslide closes the road for the rest of the shift', async () => {
  const journey = routeJourney();
  journey.day = 4;
  const landslide = FIELD_EVENTS.find((e) => e.id === 'landslide');
  const ui = makeUi((options) =>
    options.find((o) => /Turn back and report/.test(o.label))
    || options.find((o) => o.value === 'continue'));
  await runDaySituation({ ui, journey, gameOver: false }, landslide);

  const constraint = getActiveRouteConstraint(journey);
  assert.equal(constraint?.status, 'reported');
  const drive = withRandom(0.5, () => executeFieldAction(journey, 'normal'));
  assert.equal(drive.blocked, true, 'nobody drives through the slide the same shift');
  assert.equal(journey.distanceTraveled, 0);

  endFieldDay(journey);
  const news = reopenReportedConstraints(journey);
  assert.equal(news.length, 1);
  assert.match(news[0], /open again/);
  assert.equal(getActiveRouteConstraint(journey), null);
});

// ── Cards fit the stop ─────────────────────────────────────────────────────

test('block-ground cards and shortcuts stay off bridges and staging lots', () => {
  const journey = routeJourney();
  const bridge = journey.blocks[2];
  const block = journey.blocks[1];
  for (const id of ['boundary_dispute', 'wildlife_nesting_area', 'historical_survey_markers']) {
    const event = FIELD_EVENTS.find((e) => e.id === id);
    assert.equal(eventFitsStop(event, bridge), false, `${id} at a bridge`);
    assert.equal(eventFitsStop(event, block), true, `${id} on a block`);
    assert.equal(eventMatchesJourneyContext(event, journey, { currentBlock: bridge }), false);
  }
  // A card with no stop kind fits anywhere.
  assert.equal(eventFitsStop(FIELD_EVENTS.find((e) => e.id === 'landslide'), bridge), true);

  const den = ILLEGAL_ACTS.find((act) => act.id === 'recce-hide-bear-den');
  assert.equal(actFitsStop(den, bridge), false);
  assert.equal(actFitsStop(den, block), true);
  const bridgeAct = ILLEGAL_ACTS.find((act) => act.id === 'recce-falsify-bridge-inspection');
  assert.equal(actFitsStop(bridgeAct, bridge), true, 'a bridge shortcut still belongs at a bridge');

  journey.roleId = 'recce';
  journey.currentBlockIndex = 2;
  journey.distanceTraveled = 15;
  assert.equal(actMatchesTemptationContext(den, journey), false);
});

test('Ealue Lake is a road-end block, not an air-access stop the crew then drives into', () => {
  const tahltan = Object.values(blocksData).flat().find((b) => b?.id === 'thl-7')
    || (blocksData.routes ? Object.values(blocksData.routes).flat().find((b) => b?.id === 'thl-7') : null);
  assert.ok(tahltan, 'thl-7 is on the Tahltan route');
  const verdict = getBlockAccessVerdict(tahltan, CLEAR, routeJourney());
  assert.notEqual(verdict.id, 'heli_only');
  assert.doesNotMatch(tahltan.description, /Fly-in/);
});

test('fair-weather cards do not fire on a storm day', () => {
  const sunset = FIELD_EVENTS.find((e) => e.id === 'crew_morale_boost');
  assert.ok(sunset.notInWeather.includes('storm'));
});

// ── The arrival snap uses the figure the player sees ──────────────────────

test('a leg that prints 7.5 km on a 9 km segment walks the last 1.5 km in', () => {
  const journey = routeJourney();
  const longSegment = () => ({
    ...journey,
    blocks: journey.blocks.map((b, i) => (i === 1 ? { ...b, distance: 50 } : b)),
    totalDistance: 64,
  });
  // Slow the day (a setback from the morning's trouble) until the leg is
  // just under 7.5 km: it prints as 7.5 and leaves what prints as exactly
  // 1.5 km. `full` is itself rounded to the tenth, so the target sits close
  // enough to 7.5 that the rounding cannot drop the leg to 7.4.
  const full = withRandom(0.5, () => calculateTravelDistance(longSegment(), 'normal')).distance;
  journey.travelSetback = 1 - 7.49 / full;
  const raw = withRandom(0.5, () => calculateTravelDistance(longSegment(), 'normal'));
  assert.equal(raw.distance, 7.5);
  assert.equal(9 - 7.5, ARRIVAL_SNAP_KM);

  const travel = withRandom(0.5, () => calculateTravelDistance(journey, 'normal'));
  assert.equal(travel.reachesBlock, true, 'the displayed 1.5 km is inside the snap');
  assert.equal(travel.distance, 9);
});

// ── Injuries and broken crossings ─────────────────────────────────────────

test('a fracture from a route mishap goes out on the ETV the same shift', () => {
  const journey = routeJourney();
  journey.routePlan = { shortLabel: 'shortcut', injuryRisk: 0.9, distanceMultiplier: 1, day: journey.day };
  journey.blocks[1].hazards = ['rockslide', 'grade'];
  // 0.0 picks the first crew member and the first severe injury: a fracture.
  const result = withRandom(0.0, () => executeFieldAction(journey, 'grueling'));
  const victim = journey.crew.find((member) => member.statusEffects.some((e) => e.effectId === 'broken_leg'));
  assert.ok(victim, result.messages.join('\n'));
  assert.equal(victim.isActive, false, 'off the crew now, not after a night and a kit');
  assert.ok(result.messages.some((m) => /ETV to hospital; off the crew/.test(m)));
});

test('a bridge broken behind the crew bills trips back over it, not every forward leg', async () => {
  const journey = routeJourney();
  journey.currentBlockIndex = 2;
  journey.distanceTraveled = 15;
  journey.condemnedCrossings = ['bridge'];
  journey.day = 1;
  const fuel = journey.resources.fuel;
  const log = [];
  const ui = makeUi((options) => options.find((o) => o.value === 'travel')
    || options.find((o) => o.value === 'mainline')
    || options.find((o) => o.presentation === 'continue')
    || options.find((o) => o.value === 'next'), log);
  await withRandom(0.5, () => runReconDay({ journey, ui, gameOver: false }));
  assert.ok(!log.some((line) => /crossing you broke/.test(line)), 'driving on, away from it, is free');
  assert.ok(journey.resources.fuel > fuel - 40);

  // A grocery run goes back to town over it.
  const back = routeJourney();
  back.currentBlockIndex = 2;
  back.distanceTraveled = 15;
  back.condemnedCrossings = ['bridge'];
  back.resources.food = 40;
  const backLog = [];
  const backUi = makeUi((options) => options.find((o) => o.value === 'camp_menu')
    || options.find((o) => o.value === 'grocery_run')
    || options.find((o) => o.presentation === 'continue')
    || options.find((o) => o.value === 'next'), backLog);
  await withRandom(0.99, () => runReconDay({ journey: back, ui: backUi, gameOver: false }));
  assert.ok(backLog.some((line) => /crossing you broke/.test(line)), backLog.join('\n'));
});

// ── Storm days and prices ──────────────────────────────────────────────────

test('on a storm-grounded shift the card says the crew stays in camp, not that work continues', () => {
  const event = { ...FIELD_EVENTS.find((e) => e.id === 'crew_morale_boost'), heldInCamp: 'storm holds the crew in camp' };
  const hints = formatEventForDisplay(event, 'recon').options.map((o) => o.hint);
  assert.ok(hints.every((hint) => /storm holds the crew in camp/.test(hint)), hints.join(' | '));
  assert.ok(hints.every((hint) => !/work continues/.test(hint)));
});

test('a storm day shows the grounding on the event card itself', async () => {
  const journey = routeJourney();
  journey.day = 3;
  journey.weather = { id: 'storm', name: 'Storm', dangerous: true, travelModifier: 0.4, moraleEffect: -4, tempC: 7 };
  const log = [];
  const prompts = [];
  const ui = makeUi((options, prompt) => {
    prompts.push({ prompt, options });
    return options.find((o) => typeof o.value === 'number') || options.find((o) => o.value === 'continue') || options.find((o) => o.value === 'next');
  }, log);
  // Force a situation onto the storm day.
  journey.activeReconShift = { day: 3, hasTraveled: false, dayResolved: false, pendingEvent: FIELD_EVENTS.find((e) => e.id === 'radio_dead') };
  await withRandom(0.5, () => runReconDay({ journey, ui, gameOver: false }));
  const card = prompts.find(({ options }) => options.some((o) => typeof o.value === 'number'));
  assert.ok(card, 'the event was on the card');
  assert.ok(card.options.filter((o) => typeof o.value === 'number').every((o) => /storm holds the crew in camp/.test(o.description)));
  assert.ok(log.some((line) => /has grounded all operations/.test(line)));
});

test('standing down until the radio is back uses the shift', () => {
  const radio = FIELD_EVENTS.find((e) => e.id === 'radio_dead');
  const standDownOption = radio.options.find((o) => /Stand down until comms/.test(o.label));
  assert.equal(optionSpendsDay(radio, standDownOption, 'recon'), true);
});

test('the supply point lists what the card cannot cover, with the shortfall', async () => {
  const journey = routeJourney();
  journey.resources.budget = 300;
  journey.resources.food = 30;
  journey.resources.fuel = 200;
  const log = [];
  let menu = [];
  await handleResupply({ ui: makeUi((options) => { menu = options; return options.find((o) => o.value === 'done'); }, log), journey }, { name: 'Supply Point' });
  // Listed in its row, disabled, with the shortfall as the reason.
  const restock = menu.find((o) => o.value === 'full_restock');
  assert.ok(restock?.disabled, JSON.stringify(menu));
  assert.match(restock.description, /^\$\d+ short$/);
});

test('a set-aside never lands a cost the card could not have paid', () => {
  const chainsaw = FIELD_EVENTS.find((e) => e.id === 'chainsaw_cut');
  const journey = routeJourney();
  journey.resources.budget = 400;
  const deferred = pickDeferredCost(chainsaw, 3, { journey });
  assert.ok(!deferred || !(Number(deferred.effects.budget) < -400), JSON.stringify(deferred));
});

// ── The campaign's Budget line ─────────────────────────────────────────────

test('an unspent allowance saved by starving the crew or by shortcut cash earns no Budget credit', () => {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');
  const open = () => {
    const journey = createReconJourney({ roleId: 'recce', areaId: 'fraser-plateau', area, scale: 'campaign' });
    journey.campaignStartStanding = readStandingSnapshot(journey);
    journey.campaignStartBudget = Number(journey.resources.budget);
    journey.blocksAssessed = journey.packageTarget || journey.blocks.length;
    return journey;
  };
  const budgetEntry = (journey) => computeSeasonBridge(journey, { victory: true }, journey.campaignStartBudget)
    .entries.find((entry) => entry.metric === 'budget');

  const fed = open();
  assert.ok(budgetEntry(fed).delta > 0, 'a thrifty, fed season still earns its credit');

  const hungry = open();
  hungry.resourcePressure.hungryShifts = 2;
  assert.ok(budgetEntry(hungry).delta <= 0, 'an allowance saved by an empty food box earns no credit');
  assert.match(budgetEntry(hungry).reason, /empty food box/);

  const paidOff = open();
  paidOff.resources.budget -= 600;
  paidOff.log.push({ type: 'event', eventId: 'temptation_recce-ignore-cmt', optionLabel: 'Take the shortcut', effects: { budget: 600 } });
  paidOff.resources.budget += 600;
  const honest = open();
  honest.resources.budget -= 600;
  assert.equal(budgetEntry(paidOff).delta, budgetEntry(honest).delta, 'shortcut cash does not read as savings');
});

// ── Evacuation on the spot keeps the triage picker honest ──────────────────

test('the triage picker lists every condition a crew member carries', async () => {
  const { handleTriage } = await import('../js/modes/recon.js');
  const journey = routeJourney();
  const member = journey.crew[1];
  member.health = 70;
  applyStatusEffect(member, 'sprained_ankle');
  applyStatusEffect(member, 'flu');
  let labels = [];
  const ui = makeUi((options) => { labels = options.map((o) => o.label); return options[0]; });
  await handleTriage({ ui, journey });
  const line = labels.find((label) => label.startsWith(member.name));
  assert.match(line, /Sprained Ankle/);
  assert.match(line, /Flu/);
});

test('handleEvent still resolves an ordinary card with the work-continues label', async () => {
  const journey = routeJourney();
  const event = FIELD_EVENTS.find((e) => e.id === 'crew_morale_boost');
  const hints = formatEventForDisplay(event, 'recon').options.map((o) => o.hint);
  assert.ok(hints.some((hint) => /work continues/.test(hint)));
  const ui = makeUi((options) => options.find((o) => typeof o.value === 'number') || options.find((o) => o.value === 'continue'));
  const outcome = await handleEvent({ ui, journey, gameOver: false }, event);
  assert.equal(outcome.resolved, true);
});
