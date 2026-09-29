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
import { handleResupply, runReconDay } from '../js/modes/recon.js';
import { FIELD_RESOURCES } from '../js/resources.js';
import { FIELD_EVENTS, FORESTER_ROLES, OPERATING_AREAS } from '../js/data/index.js';
import { WEATHER_CONDITIONS, getRandomWeather } from '../js/data/blocks.js';
import { checkScheduledEvents } from '../js/events.js';
import { formatOptionTimeCost, optionSpendsDay } from '../js/events/timePolicy.js';
import { eventSupportsJourney, eventMatchesJourneyContext } from '../js/events/selection.js';
import { eventFitsStop } from '../js/journey/packages.js';

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
