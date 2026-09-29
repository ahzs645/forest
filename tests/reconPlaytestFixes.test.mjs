/**
 * Recon field mechanics from the recon crew-lead playtest: event ground that
 * teleported the crew past stops and crossings, unaffordable options that
 * landed anyway, short rations that reset overnight, a crew that idled for
 * three weeks on an empty food box, legs that died a few hundred metres short,
 * fuel previews in the wrong unit, and a broken arm cured by one kit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney } from '../js/journey/factory.js';
import { runReconDay, handleResupply, handleTriage } from '../js/modes/recon.js';
import {
  applyEventTravelEffect,
  calculateTravelDistance,
  endFieldDay,
  executeFieldAction
} from '../js/journey/fieldMechanics.js';
import { ARRIVAL_SNAP_KM, STARVATION_WALKOFF_DAYS } from '../js/journey/constants.js';
import { resolveEvent } from '../js/events/resolution.js';
import { formatEventForDisplay } from '../js/events/display.js';
import { getOptionShortfall } from '../js/events/affordability.js';
import { handleEvent } from '../js/modes/shared/handleEvent.js';
import { applyStatusEffect, needsTreatment, treatCrewCondition } from '../js/crew.js';
import { FIELD_RESOURCES } from '../js/resources.js';
import { FIELD_EVENTS } from '../js/data/index.js';
import {
  getCrossingContext,
  getCrossingOptions,
  resolveCrossingChoice,
  FLOOD_HOLD_MESSAGE
} from '../js/journey/riverCrossing.js';

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

/** Camp, an open package block, a river crossing, and a far stop. */
function routeJourney() {
  const journey = createReconJourney({ areaId: 'fraser-plateau' });
  journey.blocks = [
    { id: 'camp', name: 'Camp', distance: 0, terrain: 'flat', hazards: [], features: [] },
    { id: 'blk-1', name: 'Block TH-05', distance: 4, terrain: 'flat', hazards: [], features: [], isPackage: true },
    { id: 'river', name: 'Outburst Channel', distance: 3, terrain: 'flat', hazards: ['glacial_outburst'], features: ['culvert'] },
    { id: 'far', name: 'Far Landing', distance: 6, terrain: 'flat', hazards: [], features: [] },
  ];
  journey.totalDistance = 13;
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0;
  journey.weather = { ...CLEAR };
  journey.temperature = 'warm';
  Object.assign(journey.resources, { food: 80, fuel: 400, equipment: 100, budget: 1450 });
  return journey;
}

// ── Event ground goes through the next leg ─────────────────────────────────

test('"+8 km traverse" never moves the crew: it banks ground for the next leg', () => {
  const journey = routeJourney();
  const event = FIELD_EVENTS.find((e) => e.id === 'good_road_conditions');
  const option = event.options.find((o) => o.effects?.progress === 8);

  const result = resolveEvent(journey, event, option);

  assert.equal(journey.distanceTraveled, 0, 'no teleport');
  assert.equal(journey.currentBlockIndex, 0);
  assert.equal(journey.travelBonusKm, 8);
  assert.ok(result.messages.some((m) => /next leg/.test(m) && /Block TH-05/.test(m)),
    'the outcome names the stop the crew still has to reach');
});

test('banked ground still stops at the next stop, records its road check, and is spent', () => {
  const journey = routeJourney();
  journey.travelBonusKm = 12;

  const result = withRandom(0.5, () => executeFieldAction(journey, 'normal'));

  assert.equal(journey.currentBlockIndex, 1, 'arrives at the block, not past it');
  assert.equal(journey.distanceTraveled, 4);
  assert.ok(result.messages.some((m) => /Arrived at Block TH-05/.test(m)));
  assert.ok(journey.accessVerdicts?.['blk-1'], 'the road check is recorded on arrival');
  assert.equal(journey.travelBonusKm, 0, 'the bonus is used by the leg it helped');
});

test('event ground can never carry the crew past a crossing or the end of the traverse', () => {
  const journey = routeJourney();
  journey.currentBlockIndex = 1;
  journey.distanceTraveled = 4;
  applyEventTravelEffect(journey, 12);
  applyEventTravelEffect(journey, 12);
  assert.ok(journey.travelBonusKm <= 12, 'stacked bonuses are capped at one day of travel');

  withRandom(0.5, () => executeFieldAction(journey, 'grueling'));
  assert.equal(journey.currentBlockIndex, 2, 'stops at the crossing');
  assert.equal(journey.distanceTraveled, 7);

  journey.currentBlockIndex = 3;
  journey.distanceTraveled = 13;
  const atEnd = applyEventTravelEffect(journey, 3);
  assert.equal(journey.distanceTraveled, 13);
  assert.ok(journey.distanceTraveled <= journey.totalDistance);
  assert.match(atEnd[0], /no leg left/);
});

test('a turn-back pulls the crew back along the segment only, never behind its last stop', () => {
  const journey = routeJourney();
  journey.currentBlockIndex = 1;
  journey.distanceTraveled = 6; // 2 km out of Block TH-05 toward the channel
  const messages = applyEventTravelEffect(journey, -12, { turnBack: true });
  assert.equal(journey.distanceTraveled, 4, 'back to the block, not across it');
  assert.equal(journey.currentBlockIndex, 1);
  assert.ok(journey.travelSetback > 0, 'the rest becomes a slower next leg');
  assert.ok(messages.some((m) => /pulls back 2 km to Block TH-05/.test(m)));
  assert.ok(messages.some((m) => /next leg will be slower \(about 10 km/.test(m)));
});

test('the card previews event ground and brief-response delays as the next leg', () => {
  const road = FIELD_EVENTS.find((e) => e.id === 'good_road_conditions');
  const hint = formatEventForDisplay(road, 'recon').options.find((o) => o.label === 'Make up time!').hint;
  assert.match(hint, /up to \+8 km on the next leg/);

  const slide = FIELD_EVENTS.find((e) => e.options?.some((o) => o.effects?.progressMode === 'turn_back'));
  const back = formatEventForDisplay(slide, 'recon').options.find((o) => o.label === 'Turn back and report').hint;
  assert.match(back, /turn back; slower next travel leg/);
  assert.doesNotMatch(back, /-12 km/);

  const waited = formatEventForDisplay({
    id: 't', title: 'Moose', severity: 'minor',
    options: [{ label: 'Wait him out', outcome: 'He leaves.', timeUsed: 1, effects: { crew_morale: 1 } }]
  }, 'recon').options[0].hint;
  assert.match(waited, /slower next travel leg/);
});

// ── Affordability ──────────────────────────────────────────────────────────

test('an option that costs more cash than the crew has is left off the card, with the reason', async () => {
  const journey = routeJourney();
  journey.resources.budget = 1450;
  const heli = FIELD_EVENTS.find((e) => e.id === 'helicopter_available');
  assert.ok(getOptionShortfall(journey, heli.options[0]), '$2,000 against $1,450');
  assert.equal(getOptionShortfall({ ...journey, journeyType: 'planning' }, heli.options[0]), null,
    'desk budgets are not a crew card');

  const log = [];
  let offered = null;
  const ui = makeUi((options) => {
    if (!offered) offered = options.map((o) => o.label);
    return options[0];
  }, log);
  await handleEvent({ ui, journey, gameOver: false }, heli);

  assert.ok(!offered.some((label) => /\$2,000|\$1,800/.test(label)), 'neither helicopter option is offered');
  assert.ok(offered.some((label) => /Save the money/.test(label)));
  assert.ok(log.some((line) => /Can't pay for "Sling supplies ahead \(\$2,000\)": it needs \$2,000 and the card has \$1,450/.test(line)));
  assert.equal(journey.resources.budget, 1450, 'nothing was spent');
});

// ── Rations and hunger ─────────────────────────────────────────────────────

test('short rations are a standing order: they hold overnight and the streak counts days', () => {
  const journey = routeJourney();
  journey.rationPlan = { mode: 'short', shortRationStreak: 1, lastDecisionDay: 0 };
  endFieldDay(journey);
  endFieldDay(journey);
  assert.equal(journey.rationPlan.mode, 'short');
  assert.equal(journey.rationPlan.shortRationStreak, 3);
});

test('a crew on an empty food box weakens every shift, rest does not offset it, and it ends the run', () => {
  const journey = routeJourney();
  journey.resources.food = 0;
  for (const member of journey.crew) { member.health = 94; member.morale = 91; }
  const health = [];
  let walkedOff = null;
  for (let shift = 1; shift <= STARVATION_WALKOFF_DAYS; shift += 1) {
    const result = withRandom(0.99, () => executeFieldAction(journey, 'resting'));
    const active = journey.crew.filter((m) => m.isActive);
    health.push(active.length ? active.reduce((s, m) => s + m.health, 0) / active.length : 0);
    if (shift === 1) assert.ok(result.messages.some((m) => /Nothing in the food box/.test(m)));
    if (journey.isGameOver) { walkedOff = { shift, result }; break; }
    endFieldDay(journey);
  }
  for (let i = 1; i < health.length; i += 1) {
    assert.ok(health[i] < health[i - 1], `health falls every shift (${health.join(' > ')})`);
  }
  assert.ok(walkedOff, 'an empty box is a failure path, not a long rest');
  assert.ok(walkedOff.shift <= STARVATION_WALKOFF_DAYS);
  assert.match(journey.gameOverReason, /NO FOOD|NO CREW LEFT/);
});

test('an empty food box is not offered as a full-or-short rations choice', async () => {
  const journey = routeJourney();
  journey.day = 3;
  journey.resources.food = 0;
  journey.resourcePressure = { fuel: 0, food: 1, equipment: 0, hungryDays: 1 };
  const prompts = [];
  const log = [];
  const ui = makeUi((options, prompt) => {
    prompts.push(prompt);
    return options.find((o) => o.value === 'camp_menu')
      || options.find((o) => o.value === 'end_shift')
      || options.find((o) => o.presentation === 'continue')
      || options.find((o) => o.value === 'next');
  }, log);
  await withRandom(0.99, () => runReconDay({ journey, ui, gameOver: false }));
  assert.ok(!prompts.some((p) => /Decide how to handle/.test(p)), 'no ration prompt at zero food');
  assert.ok(log.some((line) => /food box has been empty/.test(line)));
});

// ── Arrival tolerance ──────────────────────────────────────────────────────

test('a leg that ends within the arrival tolerance walks the last stretch in', () => {
  const journey = routeJourney();
  journey.blocks[1].distance = 12.4; // a normal clear-day leg is ~12 km
  journey.totalDistance = 21.4;
  const travel = withRandom(0.5, () => calculateTravelDistance(journey, 'normal'));
  assert.ok(12.4 - 12 <= ARRIVAL_SNAP_KM);
  assert.equal(travel.reachesBlock, true);
  assert.equal(travel.distance, 12.4);

  journey.blocks[1].distance = 20;
  const far = withRandom(0.5, () => calculateTravelDistance(journey, 'normal'));
  assert.equal(far.reachesBlock, false, 'a real gap is still a second leg');
});

// ── Fuel in litres, both ways ──────────────────────────────────────────────

test('the fuel preview is the fuel the option actually costs, and gains are reported', () => {
  const truck = FIELD_EVENTS.find((e) => e.id === 'resupply_opportunity');
  const tradeForFood = truck.options.find((o) => o.label === 'Trade for food');
  const hint = formatEventForDisplay(truck, 'recon').options.find((o) => o.label === 'Trade for food').hint;
  assert.match(hint, /-20 L fuel/);

  const journey = routeJourney();
  const before = journey.resources.fuel;
  const spent = resolveEvent(journey, truck, tradeForFood);
  assert.equal(journey.resources.fuel, before - 20, 'preview equals cost');
  assert.ok(spent.messages.includes('Fuel: -20 L'));
  assert.ok(spent.messages.includes('Food: +15 person-days'));

  const tradeForFuel = truck.options.find((o) => o.label === 'Trade for fuel');
  const gained = resolveEvent(journey, truck, tradeForFuel);
  assert.ok(gained.messages.includes('Fuel: +80 L'), 'a fuel gain is not silent');
});

// ── Injuries heal with time ────────────────────────────────────────────────

test('a broken arm is splinted by a kit, not cured, and a second kit is not spent on it', async () => {
  const journey = routeJourney();
  const mike = journey.crew[0];
  mike.health = 100;
  applyStatusEffect(mike, 'broken_arm');

  const first = treatCrewCondition(mike, 'broken_arm', 3);
  assert.equal(first.cleared, false);
  assert.equal(first.kitUsed, true);
  assert.match(first.message, /Splinted and slung/);
  assert.ok(mike.statusEffects.some((e) => e.effectId === 'broken_arm' && e.treated));
  assert.equal(needsTreatment(mike), false, 'no triage day on offer for a bone that only needs time');

  const second = treatCrewCondition(mike, 'broken_arm', 4);
  assert.equal(second.kitUsed, false);
  assert.match(second.message, /not another kit/);

  // Through the camp triage: the kit is spent once, and the copy does not
  // say "feeling much better" next to "already at full health".
  const other = journey.crew[1];
  other.health = 100;
  applyStatusEffect(other, 'broken_arm');
  const kits = journey.resources.firstAid;
  const log = [];
  const ui = makeUi((options) => options.find((o) => o.value === other.id), log);
  await handleTriage({ ui, journey });
  assert.equal(journey.resources.firstAid, kits - 1);
  assert.ok(other.statusEffects.some((e) => e.effectId === 'broken_arm'), 'still broken');
  assert.ok(!log.some((line) => /already at full health/.test(line)));
});

// ── Resupply at the cap ────────────────────────────────────────────────────

test('the supply point does not sell stock the truck cannot hold', async () => {
  const journey = routeJourney();
  journey.resources.budget = 5000;
  journey.resources.food = FIELD_RESOURCES.food.max - 8;
  journey.resources.fuel = FIELD_RESOURCES.fuel.max;
  const menus = [];
  const ui = makeUi((options) => {
    menus.push(options.map((o) => `${o.value}|${o.label}${o.disabled ? '|disabled' : ''}`));
    return menus.length === 1 ? options.find((o) => o.value === 'rations') : options.find((o) => o.value === 'done');
  });
  await handleResupply({ ui, journey }, { name: 'Supply Point' });

  const first = menus[0];
  assert.ok(!first.some((entry) => entry.startsWith('fuel_drum|')), 'no fuel drum for full tanks');
  const crate = first.find((entry) => entry.startsWith('rations|'));
  assert.match(crate, /\+8 person-days, all that fits/);
  assert.equal(journey.resources.food, FIELD_RESOURCES.food.max);
  // The row keeps its place so the number keys do not slide, but it is not a choice.
  assert.ok(menus[1].some((entry) => entry.startsWith('rations|') && entry.endsWith('|disabled')), 'a full food box is not offered more food');
});

// ── The camp bear ──────────────────────────────────────────────────────────

test('the habituated bear is reported to RAPP once, not once per menu visit', async () => {
  const journey = routeJourney();
  journey.campBear = true;
  journey.bearReported = true;
  let campOptions = null;
  const ui = makeUi((options) => {
    if (options.some((o) => o.value === 'camp_back')) {
      campOptions = options.map((o) => o.value);
      return options.find((o) => o.value === 'end_shift');
    }
    return options.find((o) => o.value === 'camp_menu')
      || options.find((o) => o.presentation === 'continue')
      || options.find((o) => o.value === 'next');
  });
  await withRandom(0.99, () => runReconDay({ journey, ui, gameOver: false }));
  assert.ok(campOptions.includes('bear_cleanup'));
  assert.ok(!campOptions.includes('bear_report'));
});

// ── Crossings ──────────────────────────────────────────────────────────────

test('fording a fish stream outside the work window costs scrutiny and says why', () => {
  const block = { id: 'salmon', name: 'Salmon Creek Crossing', terrain: 'river', hazards: ['fish_timing', 'river_crossing'], features: ['salmon_stream'] };
  const fall = { ...routeJourney(), scrutiny: 20, weather: { id: 'clear' }, season: { currentSeason: 'fall' } };
  const ctx = getCrossingContext(fall, block);
  assert.equal(ctx.fishStream, true);
  assert.equal(ctx.fishWindow, false);
  assert.match(getCrossingOptions(ctx).find((o) => o.value === 'ford').description, /fish stream outside the work window/);
  const result = resolveCrossingChoice(fall, ctx, 'ford', () => 0.99);
  assert.equal(result.crossed, true);
  assert.equal(fall.scrutiny, 22);
  assert.ok(result.messages.some((m) => /DFO/.test(m)));

  const summer = { ...routeJourney(), scrutiny: 20, weather: { id: 'clear' }, season: { currentSeason: 'summer' } };
  const inWindow = resolveCrossingChoice(summer, getCrossingContext(summer, block), 'ford', () => 0.99);
  assert.equal(summer.scrutiny, 20);
  assert.ok(inWindow.messages.some((m) => /inside the least-risk work window/.test(m)));
});

test('a bridge in flood does not print the ford line it then contradicts', () => {
  const bridge = { id: 'skn', name: 'Skeena River Crossing', terrain: 'river', hazards: ['river_crossing', 'flood'], features: ['river', 'bridge'] };
  const journey = { ...routeJourney(), weather: { id: 'storm' }, season: { currentSeason: 'summer' } };
  const ctx = getCrossingContext(journey, bridge);
  assert.equal(ctx.flood, true);
  assert.notEqual(ctx.holdMessage, FLOOD_HOLD_MESSAGE);
  assert.match(ctx.holdMessage, /under the deck/);
});
