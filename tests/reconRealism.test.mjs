import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney } from '../js/journey/factory.js';
import { runReconDay, updateReconMissionStatus } from '../js/modes/recon.js';
import { executeFieldAction, executeFieldDay, endFieldDay, getBlockAccessVerdict, formatAccessVerdict, calculateTravelDistance } from '../js/journey/fieldMechanics.js';
import { getPackageBlocks, getPackageTarget, isPackageBlock, allPackagesFinalized } from '../js/journey/packages.js';
import { resolveRouteConstraint, addRouteConstraintFromEvent, getActiveRouteConstraint } from '../js/journey/routeConstraints.js';
import { getCondemnedCrossingPenalty } from '../js/events/consequences.js';
import { resolveEvent } from '../js/events/resolution.js';
import {
  applyStatusEffect,
  evacuateCrewMember,
  generateCrew,
  generateCrewMember,
  getCrewDisplayInfo,
  hasActiveFirstAidAttendant,
  processDailyUpdate
} from '../js/crew.js';
import { FIELD_RESOURCES, createFieldResources, getSupplyStoreItems } from '../js/resources.js';
import { getWeatherTempC, WEATHER_CONDITIONS, TERRAIN_TYPES } from '../js/data/blocks.js';
import { OPERATING_AREAS, FIELD_EVENTS } from '../js/data/index.js';
import { STATUS_EFFECTS } from '../js/data/crewNames.js';
import { checkEndConditions } from '../js/modes/shared/endConditions.js';
import { RADIO_TASKS_BY_ROLE, GENERIC_RADIO_TASKS } from '../js/events/constants.js';
import { getDiscoveryTagDefinition } from '../js/data/discoveryTags.js';
import { calculateScore } from '../js/scoring.js';

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
  // The day runners are async: keep the seed pinned until they settle, or
  // later shifts roll real random events and the test goes flaky.
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
    async promptChoice(_prompt, options = []) {
      return pickValue(options) || options[0];
    },
  };
}

const CLEAR = { id: 'clear', name: 'Clear Skies', tempC: 18, travelModifier: 1, moraleEffect: 0 };

function calmJourney(areaId = 'fraser-plateau', options = {}) {
  const journey = createReconJourney({ areaId, ...options });
  journey.weather = { ...CLEAR };
  journey.temperature = 'warm';
  Object.assign(journey.resources, { food: 80, fuel: 400, equipment: 100 });
  return journey;
}

// endFieldDay rerolls the sky, and a pinned 0.99 lands on a storm that
// grounds the next shift. Every shift in these tests starts clear.
async function runClearShift(journey, ui) {
  journey.weather = { ...CLEAR };
  journey.temperature = 'warm';
  return withRandom(0.99, () => runReconDay({ journey, ui, gameOver: false }));
}

// ---------------------------------------------------------------- blocks vs waypoints

test('every area has 4-6 real blocks; staging lots, camps, bridges and caches are waypoints', () => {
  for (const area of OPERATING_AREAS) {
    const journey = createReconJourney({ areaId: area.id });
    for (const stop of journey.blocks) {
      assert.ok(['block', 'waypoint'].includes(stop.kind), `${stop.id} needs a kind`);
    }
    const blocks = getPackageBlocks(journey);
    assert.ok(blocks.length >= 4 && blocks.length <= 6, `${area.id} has ${blocks.length} blocks`);
    assert.ok(blocks.every((stop) => /^Block /.test(stop.name)), `${area.id}: every block is named as one`);
    assert.equal(journey.blocks[0].kind, 'waypoint', 'the crew musters at a staging waypoint');
    assert.equal(journey.packageTarget, blocks.length);
    assert.equal(getPackageTarget(journey), blocks.length);
  }
});

test('the campaign keeps the leading stops that hold exactly three blocks, with their waypoints', () => {
  for (const area of OPERATING_AREAS) {
    const journey = createReconJourney({ areaId: area.id, scale: 'campaign' });
    assert.equal(getPackageTarget(journey), 3, area.id);
    assert.ok(journey.blocks.length <= 7, `${area.id} keeps ${journey.blocks.length} stops`);
    assert.ok(journey.blocks.some((stop) => stop.hasSupply));
    assert.equal(journey.deadline, 24);
  }
});

test('a stop with no kind is treated as a block so old saves and ad-hoc fixtures keep counting', () => {
  assert.equal(isPackageBlock({ id: 'x' }), true);
  assert.equal(isPackageBlock({ id: 'x', kind: 'waypoint' }), false);
  assert.equal(getPackageTarget({ blocks: [{ id: 'a' }, { id: 'b', kind: 'waypoint' }] }), 1);
});

test('a block needs the road notes and two shifts on the ground; a waypoint offers no block work', async () => {
  const journey = calmJourney();
  const waypoint = journey.blocks[0];
  assert.equal(waypoint.kind, 'waypoint');
  const seen = [];
  const ui = makeUi((options) => {
    if (options.some((o) => o.value === 'set_tempo')) seen.push(options.map((o) => o.value));
    return options.find((o) => o.value === 'camp_menu') || options.find((o) => o.value === 'end_shift');
  });
  await withRandom(0.99, () => runReconDay({ journey, ui, gameOver: false }));
  assert.ok(seen.length > 0);
  assert.ok(!seen[0].includes('ground_truth'), 'no "Work the block" on a staging lot');
  assert.ok(!seen[0].includes('values_sweep'));

  // Stand the crew on the first block. The truck's arrival wrote the road
  // notes; the boundary shift and the sweep close it.
  const blockIndex = journey.blocks.findIndex((stop) => stop.kind === 'block');
  journey.currentBlockIndex = blockIndex;
  journey.reconIntel.byBlock[journey.blocks[blockIndex].id] = {
    accessGroundTruthed: true, layoutWalked: false, valuesSwept: false, assessmentComplete: false,
    lastAccessDay: 1, lastLayoutDay: 0, lastValuesDay: 0
  };
  const log = [];
  const pickWork = (options) => options.find((o) => o.value === 'ground_truth')
    || options.find((o) => o.value === 'values_sweep')
    || options.find((o) => o.presentation === 'continue')
    || options.find((o) => o.value === 'next');
  await runClearShift(journey, makeUi(pickWork, log));
  const intel = journey.reconIntel.byBlock[journey.blocks[blockIndex].id];
  assert.equal(intel.layoutWalked, true);
  assert.equal(intel.valuesSwept, false);
  assert.equal(intel.assessmentComplete, false, 'one shift does not close a package');
  assert.ok(log.some((line) => /^Stream: /.test(line)), 'streams are classified on the boundary shift');
  assert.ok(log.some((line) => /^Terrain: /.test(line)));
  assert.ok(log.some((line) => /^Danger trees: /.test(line)));

  const log2 = [];
  await runClearShift(journey, makeUi(pickWork, log2));
  assert.equal(intel.valuesSwept, true);
  assert.equal(intel.assessmentComplete, true);
  assert.equal(journey.blocksAssessed, 1);
  assert.ok(log2.some((line) => /^WTP: /.test(line)) && log2.some((line) => /^CH: /.test(line)));
  assert.ok(log2.some((line) => /Package finalized for Block FP-03/.test(line)));

  const status = updateReconMissionStatus(makeUi(() => null), journey);
  assert.deepEqual(status.checklist.map((item) => item.label), [
    'road & crossing notes',
    'boundary walked & ribboned',
    'streams classified (S1–S6)',
    'terrain / soils noted',
    'WTP & wildlife features flagged',
    'CH / archaeology overview',
    'package finalized',
  ]);
  assert.ok(status.checklist.every((item) => item.done));
  assert.equal(status.meter.text, `1/${journey.packageTarget}`);
});

test('the sweep reads a Nation\'s bench as a CH follow-up, never as a hold', async () => {
  const journey = calmJourney('bulkley-valley');
  const bench = journey.blocks.find((stop) => stop.id === 'blk-4');
  journey.currentBlockIndex = journey.blocks.indexOf(bench);
  journey.reconIntel = { byBlock: { [bench.id]: { accessGroundTruthed: true, layoutWalked: true, valuesSwept: false, assessmentComplete: false } } };
  const log = [];
  const ui = makeUi((options) => options.find((o) => o.value === 'values_sweep') || options.find((o) => o.presentation === 'continue') || options.find((o) => o.value === 'next'), log);
  await withRandom(0.99, () => runReconDay({ journey, ui, gameOver: false }));
  assert.ok(log.some((line) => /CMTs/.test(line)));
  assert.ok(log.some((line) => /CH follow-up \/ archaeology overview needed/.test(line)));
  assert.ok(!log.some((line) => /cultural_hold|Cultural hold/.test(line)), 'human-readable labels only');
  assert.equal(getDiscoveryTagDefinition('cultural_hold').label, 'CH follow-up / archaeology overview needed');
});

test('arriving by truck writes the road and crossing notes for a block', async () => {
  const journey = calmJourney();
  journey.blocks = [
    { id: 'camp', name: 'Camp', kind: 'waypoint', distance: 0, terrain: 'flat', hazards: [], features: [] },
    { id: 'blk', name: 'Block T-02 - Test', kind: 'block', distance: 1, terrain: 'flat', hazards: [], features: ['creek'] },
  ];
  journey.packageTarget = 1;
  journey.totalDistance = 1;
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0;
  const ui = makeUi((options) => options.find((o) => o.value === 'travel') || options.find((o) => o.value === 'mainline') || options.find((o) => o.presentation === 'continue') || options.find((o) => o.value === 'next'));
  await withRandom(0.5, () => runReconDay({ journey, ui, gameOver: false }));
  assert.equal(journey.currentBlockIndex, 1);
  assert.equal(journey.reconIntel.byBlock.blk.accessGroundTruthed, true);
  assert.equal(journey.reconIntel.byBlock.blk.layoutWalked, false);
});

// ---------------------------------------------------------------- access verdict

test('the road verdict is about the road: bridged rivers, public roads and territory markers read sanely', () => {
  const skeena = getBlockAccessVerdict(
    { id: 's', name: 'Skeena', terrain: 'river', hazards: ['river_crossing', 'flood'], features: ['river', 'bridge', 'salmon_river'] },
    { id: 'overcast', name: 'Overcast' }
  );
  assert.ok(['passable_now', 'rehab_needed'].includes(skeena.id), `bridged river is not ${skeena.id}`);
  assert.notEqual(skeena.id, 'winter_only');

  const telegraph = getBlockAccessVerdict(
    { id: 't', name: 'Telegraph Creek Road', terrain: 'steep', hazards: ['grade', 'rockslide', 'narrow'], features: ['canyon', 'switchbacks'] },
    { id: 'clear', name: 'Clear' }
  );
  assert.notEqual(telegraph.id, 'heli_only', 'a public road is not heli-only');
  assert.notEqual(telegraph.id, 'no_go');

  const casYikh = getBlockAccessVerdict(
    { id: 'c', name: 'Cas Yikh Bench', terrain: 'hilly', hazards: ['cultural_protocol'], features: ['first_nation', 'culturally_modified_trees', 'creek'] },
    { id: 'clear', name: 'Clear' }
  );
  assert.equal(casYikh.id, 'passable_now', 'cultural protocol is a values gate, not a road closure');

  const flats = getBlockAccessVerdict(
    { id: 'f', name: 'Caribou Flats', terrain: 'flat', hazards: ['caribou', 'wildlife'], features: ['caribou_habitat'] },
    { id: 'clear', name: 'Clear' }
  );
  assert.equal(flats.id, 'passable_now', 'caribou feed the sweep, not the verdict');
});

test('the verdict prints today\'s access and development access without a label prefix or a weather clause', () => {
  const washout = getBlockAccessVerdict(
    { id: 'w', name: 'Dry Creek Gully', terrain: 'hilly', hazards: ['washout', 'erosion'], features: ['creek', 'culvert'] },
    { id: 'heavy_rain', name: 'Heavy Rain', dangerous: true }
  );
  assert.equal(washout.id, 'no_go');
  assert.match(washout.summary, /^Do not proceed: washout/);
  assert.ok(!/No-go:/.test(washout.summary));
  assert.ok(!/heavy rain weather/.test(washout.summary));
  const line = formatAccessVerdict(washout);
  assert.match(line, /^Today's access: closed · Development access: bridge upgrade required\./);

  const clean = getBlockAccessVerdict(
    { id: 'p', name: 'Plateau', terrain: 'flat', hazards: [], features: ['mixedwood'] },
    { id: 'clear', name: 'Clear' }
  );
  assert.equal(formatAccessVerdict(clean), "Today's access: 4x4 · Development access: summer road. Routine truck access.");
});

// ---------------------------------------------------------------- units

test('fuel is litres everywhere: stocks, thresholds, store, and scaled event deltas', () => {
  assert.equal(FIELD_RESOURCES.fuel.unit, 'L');
  assert.equal(FIELD_RESOURCES.fuel.max, 800);
  assert.equal(FIELD_RESOURCES.fuel.warning, 160);
  assert.equal(FIELD_RESOURCES.fuel.critical, 60);
  assert.equal(createFieldResources().fuel, 520);
  assert.equal(getSupplyStoreItems('field').find((item) => item.id === 'fuel').unit, 'L');

  const journey = calmJourney();
  journey.resources.fuel = 300;
  const messages = resolveEvent(journey, { id: 'x', title: 'X', severity: 'minor', options: [] }, {
    label: 'Burn it', outcome: 'ok', effects: { fuel: -8 }
  }).messages;
  assert.equal(journey.resources.fuel, 268, 'an authored -8 is -32 L');
  assert.ok(messages.some((m) => m === 'Fuel: -32 L'));
});

test('weather carries a temperature and alpine ground runs colder', () => {
  for (const condition of WEATHER_CONDITIONS) {
    assert.ok(Number.isFinite(condition.tempC), `${condition.id} has tempC`);
  }
  const clear = WEATHER_CONDITIONS.find((c) => c.id === 'clear');
  assert.equal(getWeatherTempC(clear), 18);
  assert.equal(getWeatherTempC(clear, { features: ['alpine'] }), 13);
  assert.equal(getWeatherTempC(WEATHER_CONDITIONS.find((c) => c.id === 'freezing')), -12);
  assert.equal(TERRAIN_TYPES.river.speed, 0.8, 'arriving at a bridge does not halve the next day');
});

test('the condemned-crossing tax is charged in litres', () => {
  assert.deepEqual(getCondemnedCrossingPenalty({ condemnedCrossings: ['a'] }).fuel, 12);
});

// ---------------------------------------------------------------- fuel favour, cache, route constraints

test('the emergency fuel favour is one-shot and actually delivers fuel', () => {
  const journey = calmJourney();
  journey.resources.fuel = 20;
  journey.resources.budget = 1000;
  journey.blocks[journey.currentBlockIndex].terrain = 'flat';
  const first = withRandom(0.5, () => executeFieldAction(journey, 'camp_work'));
  const second = withRandom(0.5, () => executeFieldAction(journey, 'camp_work'));
  const third = withRandom(0.5, () => executeFieldAction(journey, 'camp_work'));
  const favours = [...first.messages, ...second.messages, ...third.messages].filter((m) => /lends a drum/.test(m));
  assert.equal(favours.length, 1);
  assert.equal(journey.fuelFavourUsed, true);
  assert.equal(journey.resources.budget, 880);
  assert.ok(journey.resources.fuel > 20);
  assert.ok(![...first.messages, ...second.messages, ...third.messages].some((m) => /scavenging/.test(m)));
});

test('the ration cache is one crate per cache stop for the whole season', async () => {
  const journey = calmJourney();
  journey.resources.food = 10;
  const cacheIndex = journey.blocks.findIndex((stop) => stop.hasSupply);
  journey.currentBlockIndex = cacheIndex;
  const pull = (options) => options.find((o) => o.value === 'food_cache')
    || options.find((o) => o.value === 'camp_menu')
    || options.find((o) => o.value === 'full')
    || options.find((o) => o.value === 'end_shift')
    || options.find((o) => o.presentation === 'continue')
    || options.find((o) => o.value === 'next');
  const log = [];
  await withRandom(0.99, () => runReconDay({ journey, ui: makeUi(pull, log), gameOver: false }));
  assert.ok(log.some((line) => /The sealed crate was where the map said\. 12 person-days\./.test(line)));
  assert.ok(log.some((line) => /Fuel used reaching the cache: 12 L/.test(line)));
  assert.deepEqual(journey.rationCacheUsedAtBlockIds, [journey.blocks[cacheIndex].id]);

  journey.resources.food = 10;
  const seen = [];
  const ui = makeUi((options) => {
    if (options.some((o) => o.value === 'camp_back')) seen.push(options.map((o) => o.value));
    return options.find((o) => o.value === 'camp_menu') || options.find((o) => o.value === 'full') || options.find((o) => o.value === 'end_shift') || options.find((o) => o.presentation === 'continue') || options.find((o) => o.value === 'next');
  });
  await runClearShift(journey, ui);
  assert.ok(seen.length > 0);
  assert.ok(!seen[0].includes('food_cache'), 'the crate is gone');
  assert.ok(seen[0].includes('fuel_run'), 'a fuel run is on the camp menu');
  assert.ok(seen[0].includes('grocery_run'), 'a grocery run is on the camp menu');
});

test('a washout is reported, not cleared with the saws; the detour is the honest bypass', () => {
  const journey = calmJourney();
  journey.blocks = [
    { id: 'a', name: 'A', kind: 'waypoint', distance: 0, terrain: 'flat', hazards: [], features: [] },
    { id: 'b', name: 'B', kind: 'block', distance: 5, terrain: 'flat', hazards: [], features: [] },
  ];
  journey.currentBlockIndex = 0;
  const washout = FIELD_EVENTS.find((event) => event.id === 'road_washout');
  const constraint = addRouteConstraintFromEvent(journey, washout);
  assert.ok(constraint);
  const fuelBefore = journey.resources.fuel;
  const scrutinyBefore = journey.scrutiny;
  const reported = resolveRouteConstraint(journey, constraint.id, 'report');
  assert.equal(reported.mode, 'report');
  assert.match(reported.messages.join(' '), /call it in to the road permit holder and work the near-side blocks/);
  assert.equal(journey.resources.fuel, fuelBefore - 8);
  assert.equal(journey.scrutiny, scrutinyBefore - 1);
  assert.equal(journey.pendingTravelSetback, 0.5);
  assert.equal(getActiveRouteConstraint(journey), null);

  const again = addRouteConstraintFromEvent(journey, washout);
  const legacy = resolveRouteConstraint(journey, again.id, 'clear');
  assert.equal(legacy.mode, 'report', 'the old "clear" spelling is the report path');
});

// ---------------------------------------------------------------- crew

test('the field crew is a layout crew with first aid tickets, and E can pass its own role table', () => {
  const crew = generateCrew(5, 'field');
  const names = new Set(crew.map((m) => m.roleName));
  assert.ok(crew.some((m) => m.role === 'driver' && m.roleName === 'Driver-Swamper'));
  assert.ok(crew.some((m) => m.role === 'medic' && m.roleName === 'OFA 3 Attendant' && m.firstAidTicket === 'OFA3'));
  assert.ok(![...names].some((name) => /Faller|Bucker|Spotter/.test(name)));
  assert.ok(crew.every((m) => m.firstAidTicket === 'OFA1' || m.firstAidTicket === 'OFA3'));
  assert.ok(hasActiveFirstAidAttendant(crew));

  const custom = generateCrew(3, 'field', {
    roles: [
      { id: 'planter', name: 'Planter', description: 'x', skills: [], baseHealth: 90, baseMorale: 80 },
      { id: 'checker', name: 'Quality Checker', description: 'x', skills: [], baseHealth: 90, baseMorale: 80, firstAidTicket: 'OFA3' },
    ],
    essentialIds: ['checker'],
  });
  assert.equal(custom.length, 3);
  assert.equal(custom[0].role, 'checker');
  assert.ok(custom.every((m) => ['planter', 'checker'].includes(m.role)));
  assert.ok(hasActiveFirstAidAttendant(custom));
  assert.equal(hasActiveFirstAidAttendant([{ role: 'planter', firstAidTicket: 'OFA1', isActive: true }]), false);
});

test('radio tasks describe layout work, not falling and bucking', () => {
  const all = [...GENERIC_RADIO_TASKS, ...Object.values(RADIO_TASKS_BY_ROLE).flat()].join(' ');
  assert.ok(!/topping hazard snags|bucking windthrow|tagging log decks|clearing danger trees/.test(all));
  assert.ok(/running a boundary/.test(all) && /classifying a stream/.test(all) && /cruise plots/.test(all));
});

test('without a Level 3 attendant the crew cannot work the line, and a replacement can be driven out', async () => {
  const journey = calmJourney();
  journey.resources.budget = 2000;
  const blockIndex = journey.blocks.findIndex((stop) => stop.kind === 'block');
  journey.currentBlockIndex = blockIndex;
  for (const member of journey.crew) {
    if (member.role === 'medic') evacuateCrewMember(member, { day: 1 });
  }
  assert.equal(hasActiveFirstAidAttendant(journey.crew), false);

  const menus = [];
  const log = [];
  const ui = makeUi((options) => {
    if (options.some((o) => o.value === 'set_tempo')) menus.push(options);
    return options.find((o) => o.value === 'replace_attendant') || options.find((o) => o.presentation === 'continue') || options.find((o) => o.value === 'next');
  }, log);
  await withRandom(0.99, () => runReconDay({ journey, ui, gameOver: false }));
  const values = menus[0].map((o) => o.value);
  assert.ok(!values.includes('ground_truth') && !values.includes('values_sweep'), 'no line work without OFA 3');
  assert.ok(values.includes('replace_attendant'));
  assert.match(menus[0].find((o) => o.value === 'replace_attendant').description, /20 minutes from hospital without a Level 3 attendant and ETV/);
  assert.equal(hasActiveFirstAidAttendant(journey.crew), true);
  assert.ok(journey.resources.budget < 2000);
  assert.ok(log.some((line) => /OFA 3, with the ETV/.test(line)));
});

// ---------------------------------------------------------------- no deaths

test('nobody dies: health at zero is an evacuation, and a fracture is an ETV run off the crew', () => {
  const worn = generateCrewMember('field');
  worn.health = 1;
  applyStatusEffect(worn, 'flu');
  const out = processDailyUpdate(worn, { currentDay: 4 });
  assert.equal(worn.isActive, false);
  assert.equal(worn.isDead, false);
  assert.equal(worn.status, 'evacuated');
  assert.equal(worn.evacuatedDay, 4);
  assert.ok(out.messages.some((m) => /flown out|driven to town|clinic/.test(m)));
  assert.equal(getCrewDisplayInfo(worn).status, 'Evacuated');

  const fractured = generateCrewMember('field');
  applyStatusEffect(fractured, 'broken_leg');
  const gone = processDailyUpdate(fractured, { currentDay: 7 });
  assert.equal(fractured.isActive, false);
  assert.equal(fractured.status, 'evacuated');
  assert.ok(gone.messages.some((m) => /Fracture\. ETV to hospital; off the crew\. WorkSafeBC is notified/.test(m)));

  assert.equal(STATUS_EFFECTS.broken_leg.canTravel, false);
  assert.equal(STATUS_EFFECTS.broken_leg.workCapacity, 0);
  assert.equal(STATUS_EFFECTS.severe_laceration.canTravel, false);
  assert.equal(STATUS_EFFECTS.severe_laceration.workCapacity, 0);
  assert.equal(STATUS_EFFECTS.dysentery.name, 'Giardia');
  assert.match(STATUS_EFFECTS.dysentery.description, /Beaver fever/);
});

test('the score counts evacuations, not the dead', () => {
  const journey = calmJourney();
  evacuateCrewMember(journey.crew[0], { day: 3 });
  const score = calculateScore(journey, true);
  assert.match(score.components.crewWelfare.label, /1 evacuated$/);
  assert.ok(!/lost/.test(score.components.crewWelfare.label));
});

// ---------------------------------------------------------------- injuries by band

test('an option\'s crewEffect belongs to the good band; a failed band evacuates a real person', () => {
  const event = FIELD_EVENTS.find((e) => e.id === 'worker_injury');
  const option = event.options[0];
  assert.ok(option.crewEffect?.injury === 'sprained_ankle' && option.failureCrewEffect?.evacuate);

  const good = calmJourney();
  const activeBefore = good.crew.filter((m) => m.isActive).length;
  withRandom(0, () => resolveEvent(good, event, option));
  assert.ok(good.crew.some((m) => m.statusEffects.some((e) => e.effectId === 'sprained_ankle')));
  assert.equal(good.crew.filter((m) => m.isActive).length, activeBefore);

  const bad = calmJourney();
  withRandom(0.999, () => resolveEvent(bad, event, option));
  assert.ok(!bad.crew.some((m) => m.isActive && m.statusEffects.some((e) => e.effectId === 'sprained_ankle')),
    'the bad band never applies the good band\'s sprain to a working member');
  const evacuated = bad.crew.filter((m) => !m.isActive);
  assert.equal(evacuated.length, 1, 'the truck at first light takes someone');
  assert.equal(evacuated[0].status, 'evacuated');

  const sendOut = calmJourney();
  withRandom(0.5, () => resolveEvent(sendOut, event, event.options[1]));
  assert.equal(sendOut.crew.filter((m) => !m.isActive).length, 1, '"Send them out for medical care" removes someone');
});

// ---------------------------------------------------------------- win-then-lose, bear, seasons

test('closing the last package on the shift the last hand leaves is still a win', () => {
  const journey = calmJourney();
  journey.packageTarget = 1;
  journey.blocksAssessed = 1;
  assert.ok(allPackagesFinalized(journey));
  for (const member of journey.crew) evacuateCrewMember(member, { day: 9 });
  withRandom(0.5, () => executeFieldAction(journey, 'camp_work'));
  assert.equal(journey.isGameOver, false);
  assert.deepEqual(checkEndConditions(journey), { victory: true, reason: 'Expedition completed!' });

  const stalled = calmJourney();
  for (const member of stalled.crew) evacuateCrewMember(member, { day: 9 });
  withRandom(0.5, () => executeFieldAction(stalled, 'camp_work'));
  assert.equal(stalled.isGameOver, true);
  assert.match(stalled.gameOverReason, /nobody left in the field/);
});

test('a fed bear is cleaned up from camp and can be reported without losing the shift', async () => {
  const journey = calmJourney();
  journey.campBear = true;
  journey.resources.food = 50;
  let reported = false;
  const ui = makeUi((options) => {
    if (options.some((o) => o.value === 'bear_report') && !reported) { reported = true; return options.find((o) => o.value === 'bear_report'); }
    return options.find((o) => o.value === 'bear_cleanup') || options.find((o) => o.value === 'camp_menu') || options.find((o) => o.presentation === 'continue') || options.find((o) => o.value === 'next');
  });
  const dayBefore = journey.day;
  await withRandom(0.99, () => runReconDay({ journey, ui, gameOver: false }));
  assert.equal(journey.campBear, false);
  assert.equal(journey.bearReported, true);
  assert.equal(journey.day, dayBefore + 1, 'the RAPP call was brief; the cleanup was the shift');
});

test('breakup slows every leg and pumps soft ground; summer is the baseline', () => {
  const summer = calmJourney();
  summer.season.currentSeason = 'summer';
  const spring = calmJourney();
  spring.season.currentSeason = 'spring';
  const summerKm = withRandom(0.5, () => calculateTravelDistance(summer, 'normal')).distance;
  const springKm = withRandom(0.5, () => calculateTravelDistance(spring, 'normal')).distance;
  assert.ok(springKm < summerKm, `${springKm} < ${summerKm}`);

  const muskeg = { id: 'm', name: 'Muskeg', terrain: 'muskeg', hazards: [], features: [] };
  const dry = getBlockAccessVerdict(muskeg, { id: 'clear' }, { season: { currentSeason: 'summer' } });
  const wet = getBlockAccessVerdict(muskeg, { id: 'clear' }, { season: { currentSeason: 'spring' } });
  assert.ok(wet.roadLifecycleId !== dry.roadLifecycleId || wet.reasons.length >= dry.reasons.length);
});

test('the travel result is rounded and framed as line walked', () => {
  const journey = calmJourney();
  journey.blocks = [
    { id: 'a', name: 'A', kind: 'waypoint', distance: 0, terrain: 'flat', hazards: [], features: [] },
    { id: 'b', name: 'Block B', kind: 'block', distance: 4.4, terrain: 'flat', hazards: [], features: [] },
  ];
  journey.totalDistance = 4.4;
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0.1 + 0.2; // classic float noise
  const result = withRandom(0.5, () => executeFieldDay(journey, 'normal'));
  const walked = result.messages.find((m) => /^Walked /.test(m));
  assert.ok(walked, result.messages.join('\n'));
  assert.match(walked, /^Walked \d+(\.\d)? km of line and road location toward Block B/);
});

test('every area\'s recon route still reaches its first stop at the displayed leg distance after re-tagging', () => {
  for (const area of OPERATING_AREAS) {
    const journey = createReconJourney({ areaId: area.id });
    endFieldDay(journey);
    assert.ok(journey.day === 2);
    assert.equal(journey.blocks[0].distance, 0);
  }
});
