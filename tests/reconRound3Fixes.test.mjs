/**
 * Recon residuals from the round-3 retest: a restock billed at list price for
 * a part-load, a storm follow-up under clear skies that promised work, five
 * crew with the same epilogue, a grade that could not tell careful from
 * flawless, gamble failures that charged cash the card never showed, block
 * cards at waypoints and on closed blocks, and next-leg bonuses at the end of
 * the road.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney, createJourney } from '../js/journey/factory.js';
import { handleResupply, runReconDay, getReconLayoutProfile } from '../js/modes/recon.js';
import { FIELD_RESOURCES } from '../js/resources.js';
import { FIELD_EVENTS, FORESTER_ROLES, OPERATING_AREAS } from '../js/data/index.js';
import { WEATHER_CONDITIONS, getRandomWeather } from '../js/data/blocks.js';
import { checkScheduledEvents } from '../js/events.js';
import { formatOptionTimeCost, optionSpendsDay } from '../js/events/timePolicy.js';
import { eventSupportsJourney, eventMatchesJourneyContext } from '../js/events/selection.js';
import { eventFitsStop } from '../js/journey/packages.js';
import { formatEventForDisplay } from '../js/events/display.js';
import { applyEventTravelEffect, executeFieldAction, fitEventToCrew, fitEventToRemainingRoute } from '../js/journey/fieldMechanics.js';
import { calculateScore, formatScoreDisplay } from '../js/scoring.js';
import { addRouteConstraintFromEvent, getActiveRouteConstraint } from '../js/journey/routeConstraints.js';
import { runDaySituation } from '../js/journey/daySituation.js';
import { getCrossingContext } from '../js/journey/riverCrossing.js';
import { buildVictoryNarrative, buildDefeatNarrative } from '../js/game/endScreen.js';
import { buildCrewEpilogue } from '../js/game/debrief.js';

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  const restore = () => { Math.random = original; };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function withSeed(seed, fn) {
  let state = seed >>> 0;
  const original = Math.random;
  Math.random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
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

/** A journey parked at the first stop, so the shop charges no freight. */
function shopJourney() {
  const journey = createReconJourney({ areaId: 'kootenay-wetbelt' });
  journey.distanceTraveled = 0;
  journey.day = 1;
  return journey;
}

// ── Restock ────────────────────────────────────────────────────────────────

test('a part restock is billed for what the truck takes, and leaves the shelf when one line fits', async () => {
  const journey = shopJourney();
  // Nelson, shift 1 in the retest: fuel 720/800, food full, equipment 90, kits 8/15.
  Object.assign(journey.resources, { budget: 5000, fuel: 720, food: FIELD_RESOURCES.food.max, equipment: 90, firstAid: 8 });
  const menus = [];
  await handleResupply({
    ui: makeUi((options) => {
      menus.push(options.map((o) => ({ ...o })));
      return menus.length === 1 ? options.find((o) => o.value === 'full_restock') : options.find((o) => o.value === 'done');
    }),
    journey,
  }, { name: 'Nelson Works Yard' });

  const offer = menus[0].find((o) => o.value === 'full_restock');
  assert.match(offer.label, /^Restock, part \(all that fits\) \(\$\d+\)$/);
  assert.equal(offer.description, '+80 L fuel, +10% equipment, +2 kits');
  const price = Number(offer.label.match(/\$(\d+)\)$/)[1]);
  // The same goods item by item: 80 L of a $360 drum, 10% of a $220 repair
  // for 15%, two $120 kits. The bundle is cheaper, never dearer.
  const itemByItem = 360 * 80 / 200 + 220 * 10 / 15 + 2 * 120;
  assert.ok(price < itemByItem, `${price} < ${itemByItem}`);
  assert.ok(price < 700 * 0.6, `part-load price ${price} is pro-rated`);
  assert.equal(journey.resources.budget, 5000 - price);
  assert.equal(journey.resources.fuel, 800);
  assert.equal(journey.resources.equipment, 100);
  assert.equal(journey.resources.firstAid, 10);

  // Only kit room is left: the restock is no longer a choice.
  const after = menus[1].find((o) => o.value === 'full_restock');
  assert.ok(after?.disabled, 'restock with one line left is not offered');
  assert.ok(menus[1].find((o) => o.value === 'first_aid' && !o.disabled), 'the kit is still sold on its own');
});

test('a full restock still costs the bundle price', async () => {
  const journey = shopJourney();
  Object.assign(journey.resources, { budget: 5000, fuel: 300, food: 40, equipment: 50, firstAid: 3 });
  let menu = [];
  await handleResupply({ ui: makeUi((options) => { menu = options; return options.find((o) => o.value === 'done'); }), journey }, { name: 'Supply Point' });
  const offer = menu.find((o) => o.value === 'full_restock');
  assert.equal(offer.label, 'Full restock ($700)');
  assert.equal(offer.description, '+200 L fuel, +25 person-days food, +20% equipment, +2 kits');
});

test('shop rows keep their number when an item stops being affordable', async () => {
  const journey = shopJourney();
  // After one crate the fuel drum is out of reach; the kit must not slide into its slot.
  Object.assign(journey.resources, { budget: 500, fuel: 400, food: 30, equipment: 100, firstAid: 5 });
  const menus = [];
  await handleResupply({
    ui: makeUi((options) => {
      menus.push(options.map((o) => ({ value: o.value, disabled: Boolean(o.disabled) })));
      return menus.length === 1 ? options.find((o) => o.value === 'rations') : options.find((o) => o.value === 'done');
    }),
    journey,
  }, { name: 'Sproat Lake Camp' });
  assert.deepEqual(menus[1].map((o) => o.value), menus[0].map((o) => o.value));
  assert.equal(menus[1].find((o) => o.value === 'fuel_drum').disabled, true);
});

// ── The storm the radio promised ───────────────────────────────────────────

test('the scheduled storm brings storm weather, grounds the shift, and never promises work', async () => {
  const journey = shopJourney();
  journey.day = 5;
  journey.weather = WEATHER_CONDITIONS.find((w) => w.id === 'clear');
  journey.scheduledEvents = [{ eventId: 'major_storm_hits', triggerDay: 5 }];
  const card = checkScheduledEvents(journey);
  assert.equal(card.id, 'major_storm_hits');
  assert.equal(journey.weather.id, 'storm', 'the panel shows the storm the card describes');
  for (const option of card.options) {
    const label = formatOptionTimeCost(card, option, 'recon');
    assert.doesNotMatch(label, /work continues/);
    assert.match(label, /storm holds the crew in camp/);
  }

  // The shift that follows is the grounded storm day, not a quiet clear one.
  const log = [];
  const game = { ui: makeUi((options) => options.find((o) => o.value === 'next') || options[0], log), journey, checkpoint() {} };
  const dayBefore = journey.day;
  await withRandom(0.99, () => runReconDay(game));
  assert.ok(log.some((line) => /Storm has grounded all operations/.test(line)), log.join('\n'));
  assert.equal(journey.day, dayBefore + 1);
  assert.equal(journey.distanceTraveled, 0);
});

test('the storm warning is only dealt to a traverse that can be grounded by it', () => {
  const warning = FIELD_EVENTS.find((e) => e.id === 'radio_weather_warning');
  assert.equal(eventSupportsJourney(warning, { journeyType: 'recon' }), true);
  assert.equal(eventSupportsJourney(warning, { journeyType: 'silviculture' }), false);
});

test('a sudden storm is not lightning over a winter ridge, and sheltering does not claim the shift', () => {
  const storm = FIELD_EVENTS.find((e) => e.id === 'sudden_storm');
  assert.equal(eventMatchesJourneyContext(storm, { season: { currentSeason: 'winter' } }), false);
  const shelter = storm.options.find((o) => /Take shelter/.test(o.label));
  assert.equal(optionSpendsDay(storm, shelter, 'recon'), false);
  assert.doesNotMatch(shelter.outcome, /no work gets done/i);
});

// ── A failed gamble shows what it can charge ───────────────────────────────

test('a gamble names what its bad roll charges, including cash', () => {
  const hintFor = (eventId, label) => {
    const event = FIELD_EVENTS.find((e) => e.id === eventId);
    const shown = formatEventForDisplay(event, 'recon');
    return shown.options.find((o) => o.label.startsWith(label)).hint;
  };
  // The bad band of "Drain and filter" bills $300 and 100 L.
  const drain = hintFor('fuel_contamination', 'Drain and filter');
  assert.match(drain, /if it goes wrong: -100 L fuel, -14% equip, -\$300/);
  // A hidden outcome keeps its meters hidden, but not the money.
  assert.match(hintFor('boundary_dispute', 'Trust the old ribbon'), /up to \$1\.5k if it goes wrong/);
  assert.match(hintFor('fuel_contamination', 'Use it anyway'), /up to \$400 if it goes wrong/);
  // A charge made in every band is simply the price.
  assert.match(hintFor('crew_threatens_quit', 'Negotiate'), /badly wrong, -\$400,/);

  // Every bad band's cash, anywhere in the field deck, is on its card.
  for (const event of FIELD_EVENTS) {
    const shown = formatEventForDisplay(event, 'recon');
    event.options.forEach((option, index) => {
      const cash = Number(option.failureEffects?.budget) || 0;
      if (cash >= 0 || option.liveOdds) return;
      const amount = Math.abs(cash) >= 1000 ? `$${Number((Math.abs(cash) / 1000).toFixed(1))}k` : `$${Math.abs(cash)}`;
      assert.ok(shown.options[index].hint.includes(amount), `${event.id} option ${index + 1}: ${shown.options[index].hint}`);
    });
  }
});

// ── No next leg at the end of the road ─────────────────────────────────────

test('at the last stop a card promises no next-leg km and charges no next-leg setback', () => {
  const journey = createReconJourney({ areaId: 'vancouver-island-coast' });
  journey.currentBlockIndex = journey.blocks.length - 1;
  journey.distanceTraveled = journey.totalDistance;

  // Road-ahead cards are not dealt at the end of the road.
  for (const id of ['trade_trapper_intel', 'good_road_conditions']) {
    assert.equal(fitEventToRemainingRoute(journey, FIELD_EVENTS.find((e) => e.id === id)), null, id);
  }
  // Anything else loses its km and its delay, and keeps the rest.
  const locals = fitEventToRemainingRoute(journey, FIELD_EVENTS.find((e) => e.id === 'helpful_locals'));
  const shown = formatEventForDisplay(locals, 'recon');
  for (const option of shown.options) {
    assert.doesNotMatch(option.hint, /next leg|next travel leg/, option.hint);
  }
  const fuel = fitEventToRemainingRoute(journey, FIELD_EVENTS.find((e) => e.id === 'fuel_contamination'));
  assert.equal(fuel.options[0].effects.equipment, -8);
  assert.ok(!('progress' in fuel.options[0].effects));

  // And the setback copy is not printed when a card still carries one.
  assert.deepEqual(applyEventTravelEffect(journey, -5), []);
  assert.equal(journey.travelSetback || 0, 0);

  // One stop earlier the card is untouched.
  journey.currentBlockIndex -= 1;
  const card = FIELD_EVENTS.find((e) => e.id === 'good_road_conditions');
  assert.equal(fitEventToRemainingRoute(journey, card), card);
});

// ── The grade separates careful from flawless, and idling from both ────────

/** A Tahltan season as the retest played it: 4 packages, 11 stops, clean run ~18 shifts. */
function tahltanSeason({ shiftsUsed, health = 100, morale = 100, injuries = 0, clean = 7, won = true } = {}) {
  const journey = createReconJourney({ areaId: 'tahltan-highland' });
  journey.day = shiftsUsed + 1;
  journey.blocksAssessed = won ? journey.packageTarget : 0;
  journey.distanceTraveled = won ? journey.totalDistance : 0;
  journey.currentBlockIndex = won ? journey.blocks.length - 1 : 0;
  journey.scrutiny = 18;
  for (const member of journey.crew) Object.assign(member, { isActive: true, hasQuit: false, health, morale });
  journey.log = [
    ...Array.from({ length: clean }, () => ({ type: 'event', effects: { compliance: 2 } })),
    ...Array.from({ length: injuries }, (_, i) => ({ type: 'event', effects: {}, victimId: journey.crew[i].id, victimName: journey.crew[i].name })),
  ];
  return journey;
}

test('careful play grades high 80s to low 90s; only a flawless season reaches 100', () => {
  const flawless = calculateScore(tahltanSeason({ shiftsUsed: 18 }), true);
  assert.equal(flawless.totalScore, 100);

  // The retest's careful Tahltan run: 25 shifts, every card answered clean, one
  // sprain on the way, the crew a little worn at the end. It used to grade A 99.
  const careful = calculateScore(tahltanSeason({ shiftsUsed: 25, health: 90, morale: 85, injuries: 1 }), true);
  assert.ok(careful.totalScore >= 85 && careful.totalScore <= 95, `careful season scored ${careful.totalScore}`);
  assert.ok(flawless.totalScore - careful.totalScore >= 5, `${flawless.totalScore} vs ${careful.totalScore}`);

  // A rougher delivered season sits below the careful one.
  const rough = calculateScore(tahltanSeason({ shiftsUsed: 33, health: 70, morale: 60, injuries: 3 }), true);
  assert.ok(rough.totalScore < careful.totalScore - 5, `rough ${rough.totalScore} vs careful ${careful.totalScore}`);
});

test('standing down until the food runs out grades F, and the crew is not "5/5 active"', () => {
  const idle = tahltanSeason({ shiftsUsed: 18, won: false, health: 45, morale: 20 });
  idle.resources.food = 0;
  idle.crewWalkedOff = true;
  idle.isGameOver = true;
  const score = calculateScore(idle, false);
  assert.equal(score.grade, 'F', `idle season scored ${score.totalScore}`);
  assert.ok(score.totalScore <= 40);
  assert.match(score.components.crewWelfare.label, /drove out when the food ran out/);
  assert.ok(score.components.crewWelfare.score <= 25, `welfare ${score.components.crewWelfare.score}`);
  assert.match(formatScoreDisplay(score).join('\n'), /a season that missed its obligations grades no higher than F/);

  // A season that closed most of its packages and then lost the crew is not an F.
  const nearly = tahltanSeason({ shiftsUsed: 30, won: false, health: 70, morale: 60 });
  nearly.blocksAssessed = 3;
  const near = calculateScore(nearly, false);
  assert.ok(near.totalScore > score.totalScore && near.totalScore <= 54, `nearly ${near.totalScore}`);
});

// ── Where are they now ─────────────────────────────────────────────────────

test('a strong crew gets five different epilogues, and a walk-off crew is not told it won', () => {
  const journey = tahltanSeason({ shiftsUsed: 18 });
  for (const member of journey.crew) member.traits = [];
  const used = new Set();
  const lines = journey.crew.map((member) => buildCrewEpilogue(member, { victory: true, used }).split(': ').slice(1).join(': '));
  assert.equal(new Set(lines).size, lines.length, lines.join('\n'));

  const walked = new Set();
  const walkOff = journey.crew.map((member) => buildCrewEpilogue(member, { victory: false, used: walked, walkedOff: true }));
  assert.ok(walkOff.every((line) => !/stronger|run point|Banks the season/.test(line)), walkOff.join('\n'));
  assert.ok(walkOff.some((line) => /food|hungry|grub|feed|ate/.test(line)), walkOff.join('\n'));
});

test('the starvation walk-off marks the crew as gone', () => {
  const journey = createReconJourney({ areaId: 'tahltan-highland' });
  journey.resources.food = 0;
  journey.resourcePressure = { ...(journey.resourcePressure || {}), hungryDays: 5 };
  withRandom(0.5, () => executeFieldAction(journey, 'resting'));
  if (journey.isGameOver && /^NO FOOD/.test(journey.gameOverReason || '')) {
    assert.equal(journey.crewWalkedOff, true);
  } else {
    // One more hungry shift and they go.
    withRandom(0.5, () => executeFieldAction(journey, 'resting'));
    assert.match(journey.gameOverReason || '', /^NO FOOD/);
    assert.equal(journey.crewWalkedOff, true);
  }
});

// ── Copy that has to match the shift ───────────────────────────────────────

test('nobody is sent out sick when nobody is sick', () => {
  const journey = createReconJourney({ areaId: 'vancouver-island-coast' });
  for (const member of journey.crew) member.statusEffects = [];
  const card = FIELD_EVENTS.find((e) => e.id === 'supply_delivery_early');
  const fitted = fitEventToCrew(journey, card);
  assert.ok(!fitted.options.some((o) => o.crewEffect?.evacuate_sick), 'no evacuation offered');
  assert.equal(fitted.options.length, card.options.length - 1);

  journey.crew[1].statusEffects = [{ effectId: 'flu', daysRemaining: 3 }];
  assert.equal(fitEventToCrew(journey, card), card);
});

test('a road leg is driven, a stand-down on an empty box is not recovery, fog is not a good road', () => {
  const journey = createReconJourney({ areaId: 'vancouver-island-coast' });
  const next = journey.blocks[1];
  const result = withRandom(0.5, () => executeFieldAction(journey, 'normal'));
  const leg = result.messages.find((m) => /km/.test(m) && /toward/.test(m));
  if (next.kind === 'waypoint') assert.match(leg, /^Covered [\d.]+ km of road toward/);
  else assert.match(leg, /^Walked [\d.]+ km of line and road location toward/);

  const hungry = createReconJourney({ areaId: 'vancouver-island-coast' });
  hungry.resources.food = 0;
  const rest = withRandom(0.5, () => executeFieldAction(hungry, 'resting'));
  assert.ok(rest.messages.some((m) => /nobody recovers on an empty food box/.test(m)), rest.messages.join('\n'));
  assert.ok(!rest.messages.some((m) => /stood down and recovered/.test(m)));
});

test('card copy no longer contradicts itself', () => {
  const byId = (id) => FIELD_EVENTS.find((e) => e.id === id);
  assert.doesNotMatch(JSON.stringify(byId('flat_tire').options.map((o) => o.label)), /hours/);
  assert.equal(byId('trade_survey_crew_chains').title, 'Cruising Crew Wants Your Chains');
  const fight = byId('crew_card_game').options.find((o) => /sort it out themselves/.test(o.label));
  assert.ok(fight.effects.crew_morale < 0, 'a fistfight is not a morale reward');
  assert.doesNotMatch(fight.outcome, /respect each other more/);
  const dump = byId('fuel_contamination').options.find((o) => /fresh fuel/.test(o.label));
  assert.match(dump.label, /waste drums/);
});

test('the short-rations option names its morale cost where the player chooses it', async () => {
  const journey = createReconJourney({ areaId: 'fraser-plateau' });
  journey.day = 3;
  journey.resources.food = 14;
  journey.weather = WEATHER_CONDITIONS.find((w) => w.id === 'clear');
  let rationMenu = null;
  const pick = (options) => {
    if (options.some((o) => o.value === 'short')) {
      rationMenu = options;
      return options.find((o) => o.value !== 'short');
    }
    return options.find((o) => o.value === 'set_aside')
      || options.find((o) => o.value === 'camp_menu')
      || options.find((o) => o.value === 'end_shift')
      || options.find((o) => o.value === 'next' || o.value === 'continue')
      || options[0];
  };
  await withRandom(0.99, () => runReconDay({ ui: makeUi(pick), journey, checkpoint() {} }));
  assert.ok(rationMenu, 'the low-food beat asked about rations');
  assert.match(rationMenu.find((o) => o.value === 'short').description, /4 morale a shift/);
});

test('a dry block\'s layout notes are read off its ground', () => {
  const flat = getReconLayoutProfile({ terrain: 'flat', features: [], hazards: [] });
  const hilly = getReconLayoutProfile({ terrain: 'hilly', features: [], hazards: [] });
  assert.notEqual(flat.terrain[0], hilly.terrain[0]);
  assert.notEqual(flat.streams[0], hilly.streams[0]);
  assert.doesNotMatch(hilly.terrain[0], /gentle ground/);
});

// ── The landslide's legal answers cost about a shift, not two ──────────────

function slideJourney() {
  const journey = createReconJourney({ areaId: 'kootenay-wetbelt' });
  journey.blocks = [
    { id: 'a', name: 'Salmo Yard', kind: 'waypoint', distance: 0, terrain: 'flat', hazards: [], features: [] },
    { id: 'b', name: 'Block KW-02', kind: 'block', distance: 9, terrain: 'flat', hazards: [], features: [] },
    { id: 'c', name: 'Block KW-03', kind: 'block', distance: 9, terrain: 'flat', hazards: [], features: [] },
  ];
  journey.totalDistance = 18;
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0;
  journey.day = 4;
  journey.weather = WEATHER_CONDITIONS.find((w) => w.id === 'clear');
  journey.resources.food = 60;
  journey.resources.fuel = 400;
  return journey;
}

test('the old spur around a slide is a slow leg that makes ground this shift', async () => {
  const journey = slideJourney();
  const slide = FIELD_EVENTS.find((e) => e.id === 'landslide');
  addRouteConstraintFromEvent(journey, slide);
  const pick = (options) => options.find((o) => o.value === 'detour_route_constraint')
    || options.find((o) => o.value === 'next' || o.value === 'continue')
    || options[0];
  await withRandom(0.99, () => runReconDay({ ui: makeUi(pick), journey, checkpoint() {} }));
  assert.ok(journey.distanceTraveled > 0, 'the spur covered ground');
  assert.equal(getActiveRouteConstraint(journey), null);
  assert.equal(journey.pendingTravelSetback || 0, 0, 'and it does not slow tomorrow as well');
});

test('turning back to report a slide closes the road but slows the reopened leg only lightly', async () => {
  const journey = slideJourney();
  const slide = FIELD_EVENTS.find((e) => e.id === 'landslide');
  const ui = makeUi((options) => options.find((o) => /Turn back and report/.test(o.label))
    || options.find((o) => o.value === 'continue') || options[0]);
  await runDaySituation({ ui, journey, gameOver: false }, slide);
  assert.ok(getActiveRouteConstraint(journey), 'the road is shut for the rest of the shift');
  const setback = Number(journey.travelSetback || 0) + Number(journey.pendingTravelSetback || 0);
  assert.ok(setback > 0 && setback <= 0.25, `setback ${setback}`);
});

test('a bridge gauge describes water under a deck, and endings are told from the run', () => {
  const journey = slideJourney();
  const bridge = { id: 'br', name: 'Salmo River Bridge', kind: 'waypoint', features: ['bridge', 'river'], hazards: [], terrain: 'river' };
  const seen = new Set();
  for (let i = 0; i < 40; i += 1) {
    const ctx = withRandom((i + 0.5) / 40, () => getCrossingContext(journey, bridge));
    if (ctx?.mode === 'bridge') seen.add(ctx.gaugeDescription);
  }
  assert.ok(seen.size > 0, 'the bridge was read as a bridge');
  for (const line of seen) assert.doesNotMatch(line, /Thigh-deep|Knee-deep|swims/);

  const won = createReconJourney({ areaId: 'tahltan-highland' });
  won.distanceTraveled = won.totalDistance;
  won.deadline = 40;
  const story = buildVictoryNarrative(won, 'Tahltan Highland', 'The Timber Wolves', 25);
  assert.doesNotMatch(story, /settled in/);
  assert.match(story, /15 shifts left/);
  const lost = buildDefeatNarrative({ ...won, distanceTraveled: 10, endReason: 'NO FOOD' }, 'Tahltan Highland', 'The Timber Wolves', 19);
  assert.match(lost, /After 19 shifts, the Timber Wolves could go no further/);
});

// ── Block cards stay on open blocks ────────────────────────────────────────

test('layout cards stay off waypoints and off blocks whose package is closed', () => {
  const journey = createReconJourney({ areaId: 'tahltan-highland' });
  const waypoint = journey.blocks.find((b) => b.kind === 'waypoint');
  const block = journey.blocks.find((b) => b.kind !== 'waypoint' && b.distance > 0);
  const layoutCards = ['first_nations_consultation_field', 'boundary_dispute', 'wildlife_nesting_area',
    'historical_survey_markers', 'unmapped_creek', 'mineral_lick_discovered'];
  for (const id of layoutCards) {
    const event = FIELD_EVENTS.find((e) => e.id === id);
    assert.equal(eventFitsStop(event, waypoint, journey), false, `${id} at ${waypoint.name}`);
    assert.equal(eventFitsStop(event, block, journey), true, `${id} on an open block`);
  }
  journey.reconIntel = { byBlock: { [block.id]: { assessmentComplete: true } } };
  for (const id of layoutCards) {
    const event = FIELD_EVENTS.find((e) => e.id === id);
    assert.equal(eventFitsStop(event, block, journey), false, `${id} after ${block.name} was finalized`);
    // The selector reads the same gate.
    journey.currentBlockIndex = journey.blocks.indexOf(block);
    assert.equal(eventMatchesJourneyContext(event, journey, { currentBlock: block }), false);
  }
  // A road card still fits a closed block and a waypoint.
  const landslide = FIELD_EVENTS.find((e) => e.id === 'landslide');
  assert.equal(eventFitsStop(landslide, block, journey), true);
  assert.equal(eventFitsStop(landslide, waypoint, journey), true);
});

test('the Elder\'s CMTs are not redcedar in the northern interior', () => {
  const elder = FIELD_EVENTS.find((e) => e.id === 'first_nations_consultation_field');
  const text = JSON.stringify(elder);
  assert.doesNotMatch(text, /cedars/);
});

test('a summer pass can squall but never freezes, and day 1 rolls the role season', () => {
  const pass = { id: 'pass', features: ['pass', 'alpine'] };
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    seen.add(withRandom((i + 0.5) / 200, () => getRandomWeather(pass, 5, 'summer')).id);
  }
  assert.ok(!seen.has('freezing') && !seen.has('heavy_snow'), [...seen].join(','));
  assert.ok(seen.has('light_snow'), 'a summer squall is still possible up high');

  // The new-game screen passes the role as an object, not an id. Summer puts
  // no weight on light snow in the valley; the spring table did.
  const role = FORESTER_ROLES.find((r) => r.id === 'recce');
  const area = OPERATING_AREAS.find((a) => a.id === 'kootenay-wetbelt');
  for (let seed = 1; seed <= 40; seed += 1) {
    const journey = withSeed(seed, () => createJourney({ role, area }));
    assert.equal(journey.season.currentSeason, 'summer');
    assert.notEqual(journey.weather.id, 'light_snow');
  }
});
