import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blockHasCrossing,
  getCrossingMode,
  getCrossingContext,
  getCrossingOptions,
  scoutCrossing,
  winchCrossing,
  fordCrossing,
  bridgeCrossing,
  ferryCrossing,
  culvertCrossing,
  rerouteCrossing,
  resolveCrossingChoice,
  FLOOD_HOLD_MESSAGE,
} from '../js/journey/riverCrossing.js';
import { buildCrossingApproachFrames, buildCrossingResolveFrames } from '../js/scene/crossing.js';

function makeJourney(overrides = {}) {
  return {
    resources: { food: 60, fuel: 120, equipment: 60, firstAid: 3, budget: 1000 },
    crew: [
      { name: 'Avery', isActive: true, health: 90, maxHealth: 100, morale: 70, statusEffects: [] },
      { name: 'Bo', isActive: true, health: 85, maxHealth: 100, morale: 65, statusEffects: [] },
      { name: 'Cass', isActive: true, health: 80, maxHealth: 100, morale: 60, statusEffects: [] },
    ],
    weather: { id: 'clear' },
    season: { currentSeason: 'summer' },
    log: [],
    ...overrides,
  };
}

const riverBlock = { id: 'b7', name: 'Chutanli Crossing', terrain: 'river', hazards: [], features: ['creek'] };
const hazardBlock = { id: 'b8', name: 'Glacial Fan', terrain: 'flat', hazards: ['river_crossing', 'glacial_current'], features: [] };
const dryBlock = { id: 'b9', name: 'Dry Ridge', terrain: 'hilly', hazards: ['grade'], features: [] };
const bridgeBlock = { id: 'skn-2', name: 'Skeena River Crossing', terrain: 'river', hazards: ['river_crossing', 'flood'], features: ['river', 'bridge'] };
const ferryBlock = { id: 'thl-3', name: 'Stikine River Crossing', terrain: 'river', hazards: ['river_crossing', 'glacial_current'], features: ['river', 'ferry'] };
const culvertBlock = { id: 'frs-6', name: 'Dry Creek Gully', terrain: 'hilly', hazards: ['washout', 'erosion'], features: ['creek', 'culvert'] };

const values = (options) => options.map((option) => option.value);

test('crossing detection: river terrain and water hazards, not dry blocks', () => {
  assert.ok(blockHasCrossing(riverBlock));
  assert.ok(blockHasCrossing(hazardBlock));
  assert.ok(!blockHasCrossing(dryBlock));
  assert.equal(getCrossingContext(makeJourney(), dryBlock), null);
});

test('the crossing mode is read off what is physically there', () => {
  assert.equal(getCrossingMode(riverBlock), 'ford');
  assert.equal(getCrossingMode(bridgeBlock), 'bridge');
  assert.equal(getCrossingMode(ferryBlock), 'ferry');
  assert.equal(getCrossingMode(culvertBlock), 'culvert');
  assert.equal(getCrossingContext(makeJourney(), bridgeBlock).mode, 'bridge');
});

test('gauge reads world state: storms and freshet raise it, winter drops it', () => {
  const calm = getCrossingContext(makeJourney(), riverBlock);
  const stormy = getCrossingContext(makeJourney({ weather: { id: 'storm' } }), riverBlock);
  const freshet = getCrossingContext(
    makeJourney({ season: { currentSeason: 'spring' }, weather: { id: 'light_rain' } }),
    riverBlock
  );
  const winter = getCrossingContext(
    makeJourney({ weather: { id: 'freezing' }, season: { currentSeason: 'winter' } }),
    riverBlock
  );
  assert.ok(stormy.gaugeIndex > calm.gaugeIndex);
  assert.ok(freshet.gaugeIndex > calm.gaugeIndex);
  assert.ok(winter.gaugeIndex < calm.gaugeIndex);
  assert.ok(stormy.risk > calm.risk);

  const glacial = getCrossingContext(makeJourney({ weather: { id: 'storm' } }), hazardBlock);
  assert.equal(glacial.gaugeId, 'flood');
});

test('nobody fords at FLOOD: the menu holds wait and go-around only, and the ford is refused', () => {
  const journey = makeJourney({ weather: { id: 'storm' } });
  const ctx = getCrossingContext(journey, riverBlock);
  assert.equal(ctx.flood, true);
  assert.equal(ctx.holdMessage, FLOOD_HOLD_MESSAGE);
  const options = values(getCrossingOptions(ctx));
  assert.ok(!options.includes('ford'), 'no "Ford it now" at flood');
  assert.ok(!options.includes('scout'), 'no "Walk the line first" at flood');
  assert.ok(!options.includes('winch'));
  assert.deepEqual(options, ['reroute', 'wait']);

  const forced = fordCrossing(journey, ctx, () => 0.99);
  assert.equal(forced.crossed, false);
  assert.equal(forced.severity, 'refused');
  assert.ok(journey.crew.every((m) => m.statusEffects.length === 0));
});

test('at HIGH the ford is a vehicle ford, only after a scout, with no morale bonus', () => {
  const journey = makeJourney({ weather: { id: 'light_rain' } });
  let ctx = getCrossingContext(journey, riverBlock);
  assert.equal(ctx.gaugeId, 'high');
  assert.ok(!values(getCrossingOptions(ctx)).includes('ford'), 'no ford before the line is walked');
  assert.ok(values(getCrossingOptions(ctx)).includes('scout'));

  const before = ctx.risk;
  scoutCrossing(journey, ctx);
  ctx = getCrossingContext(journey, riverBlock);
  assert.ok(ctx.scouted);
  assert.ok(Math.abs(ctx.risk - before / 2) < 1e-9, 'scouting halves the risk');
  assert.ok(values(getCrossingOptions(ctx)).includes('ford'));

  const moraleBefore = journey.crew.map((m) => m.morale);
  const foodBefore = journey.resources.food;
  const result = fordCrossing(journey, ctx, () => 0.99);
  assert.equal(result.mishap, false);
  assert.equal(result.crossed, true);
  assert.match(result.messages[0], /lead truck idles across the bar in low range with a spotter on the hood/);
  assert.equal(journey.resources.food, foodBefore);
  assert.deepEqual(journey.crew.map((m) => m.morale), moraleBefore, 'fording earns no morale');
});

test('a low-water ford is offered without a scout and leaves supplies intact', () => {
  const journey = makeJourney({ weather: { id: 'freezing' } });
  const ctx = getCrossingContext(journey, riverBlock);
  assert.equal(ctx.gaugeId, 'low');
  assert.ok(values(getCrossingOptions(ctx)).includes('ford'));
  const result = fordCrossing(journey, ctx, () => 0.99);
  assert.equal(result.crossed, true);
  assert.equal(journey.resources.food, 60);
});

test('soaked mishap costs food and morale but hurts nobody', () => {
  const journey = makeJourney();
  const ctx = getCrossingContext(journey, riverBlock);
  // roll: 0 (mishap), severity roll high (not severe), food loss roll
  const rolls = [0, 0.9, 0.5];
  const result = fordCrossing(journey, ctx, () => rolls.shift() ?? 0.5);
  assert.equal(result.severity, 'soaked');
  assert.ok(journey.resources.food < 60);
  assert.ok(journey.crew.every((m) => (m.statusEffects || []).length === 0));
});

test('a stalled truck at HIGH hurts and chills a named crew member, takes a rations crate, and kills nobody', () => {
  const journey = makeJourney({ weather: { id: 'light_rain' } });
  scoutCrossing(journey, getCrossingContext(journey, riverBlock));
  const ctx = getCrossingContext(journey, riverBlock);
  // roll: 0 (mishap), severity roll low (severe), victim pick, food loss
  const rolls = [0, 0.1, 0.4, 0.5];
  const result = fordCrossing(journey, ctx, () => rolls.shift() ?? 0.5);
  assert.equal(result.severity, 'swept');
  assert.ok(result.victimName);
  const victim = journey.crew.find((m) => m.name === result.victimName);
  assert.ok(victim.statusEffects.some((e) => e.effectId === 'hypothermia'));
  assert.ok(!victim.statusEffects.some((e) => e.effectId === 'broken_leg'), 'a stalled truck is a moderate injury, not a fracture');
  assert.ok(journey.resources.food <= 45);
  assert.ok(result.messages.some((m) => m.includes(result.victimName)));
});

test('winch crossing spends fuel in litres and gear but crosses safely below flood', () => {
  const journey = makeJourney();
  const ctx = getCrossingContext(journey, riverBlock);
  assert.ok(ctx.canWinch);
  const result = winchCrossing(journey, ctx, () => 0.9);
  assert.equal(result.mishap, false);
  assert.equal(result.crossed, true);
  assert.equal(journey.resources.fuel, 104);
  assert.equal(journey.resources.equipment, 57);
});

test('a bridge is inspected and crossed one vehicle at a time; a failure condemns the structure, not the crew', () => {
  const journey = makeJourney({ weather: { id: 'overcast' } });
  let ctx = getCrossingContext(journey, bridgeBlock);
  assert.equal(ctx.mode, 'bridge');
  const menu = values(getCrossingOptions(ctx));
  assert.ok(menu.includes('scout') && menu.includes('cross') && menu.includes('reroute') && menu.includes('wait'));
  assert.ok(!menu.includes('ford'), 'nobody fords a bridged river');

  const inspected = scoutCrossing(journey, ctx);
  assert.match(inspected.messages.join(' '), /inspection tag/);
  ctx = getCrossingContext(journey, bridgeBlock);

  const ok = bridgeCrossing(journey, ctx, () => 0.99);
  assert.equal(ok.crossed, true);
  assert.match(ok.messages[0], /One truck at a time/);

  const failed = bridgeCrossing(journey, ctx, () => 0);
  assert.equal(failed.crossed, true);
  assert.equal(failed.severity, 'condemned');
  assert.ok(journey.condemnedCrossings.includes('skn-2'));
  assert.ok(journey.crew.every((m) => m.statusEffects.length === 0));

  ctx = getCrossingContext(journey, bridgeBlock);
  assert.equal(ctx.condemned, true);
  assert.equal(ctx.canCross, false);
});

test('a bridge at FLOOD can only be crossed after the structure is inspected', () => {
  const journey = makeJourney({ weather: { id: 'storm' } });
  let ctx = getCrossingContext(journey, bridgeBlock);
  assert.equal(ctx.flood, true);
  assert.ok(!values(getCrossingOptions(ctx)).includes('cross'));
  scoutCrossing(journey, ctx);
  ctx = getCrossingContext(journey, bridgeBlock);
  assert.ok(values(getCrossingOptions(ctx)).includes('cross'));
});

test('the ferry runs the crew across below flood and has the cable up at flood', () => {
  const calm = makeJourney({ weather: { id: 'overcast' } });
  const calmCtx = getCrossingContext(calm, ferryBlock);
  assert.equal(calmCtx.mode, 'ferry');
  assert.deepEqual(values(getCrossingOptions(calmCtx)), ['ferry', 'wait']);
  assert.equal(ferryCrossing(calm, calmCtx).crossed, true);

  const flood = makeJourney({ weather: { id: 'heavy_rain' } });
  const floodCtx = getCrossingContext(flood, ferryBlock);
  assert.equal(floodCtx.flood, true);
  const shut = ferryCrossing(flood, floodCtx);
  assert.equal(shut.crossed, false);
  assert.match(shut.messages[0], /cable up/);
});

test('a washout is a road prism: walk it, drive it only while the fill is sound, turn back when undercut', () => {
  const dry = makeJourney({ weather: { id: 'clear' } });
  let ctx = getCrossingContext(dry, culvertBlock);
  assert.equal(ctx.mode, 'culvert');
  assert.ok(values(getCrossingOptions(ctx)).includes('cross'), 'a dry culvert can be driven');
  const ok = culvertCrossing(dry, ctx, () => 0.99);
  assert.equal(ok.crossed, true);

  const wet = makeJourney({ weather: { id: 'light_rain' } });
  ctx = getCrossingContext(wet, culvertBlock);
  assert.equal(ctx.gaugeId, 'high');
  assert.ok(!values(getCrossingOptions(ctx)).includes('cross'), 'not driven at HIGH before the prism is walked');
  const walked = scoutCrossing(wet, ctx);
  assert.match(walked.messages.join(' '), /undercut/);
  ctx = getCrossingContext(wet, culvertBlock);
  assert.equal(ctx.undercut, true);
  assert.equal(ctx.canCross, false);
  const refused = culvertCrossing(wet, ctx, () => 0.99);
  assert.equal(refused.severity, 'refused');
  assert.ok(values(getCrossingOptions(ctx)).includes('reroute'));
});

test('going around spends fuel and a slice of tomorrow, and leaves the crew intact', () => {
  const journey = makeJourney({ weather: { id: 'storm' } });
  const ctx = getCrossingContext(journey, riverBlock);
  const result = resolveCrossingChoice(journey, ctx, 'reroute');
  assert.equal(result.crossed, true);
  assert.equal(journey.resources.fuel, 96);
  assert.ok(journey.pendingTravelSetback > 0);
  assert.ok(journey.crew.every((m) => m.isActive && m.statusEffects.length === 0));
  assert.equal(rerouteCrossing(journey, ctx).crossed, true);
});

test('crossing scenes render fixed-size decks with gauge and water', () => {
  const journey = makeJourney({ weather: { id: 'storm' } });
  const ctx = getCrossingContext(journey, riverBlock);
  const approach = buildCrossingApproachFrames(ctx, { frames: 6, seed: 2 });
  assert.equal(approach.length, 6);
  assert.ok(approach[0].includes(`GAUGE: ${ctx.gaugeLabel}`));
  assert.ok(approach[0].includes('~'));

  const mishap = { mishap: true, severity: 'swept' };
  const resolve = buildCrossingResolveFrames(ctx, mishap, { frames: 12, seed: 3 });
  assert.equal(resolve.length, 12);
  assert.ok(resolve.some((frame) => frame.includes('▯')), 'a crate rides the current');
  const lines = resolve[0].split('\n');
  assert.ok(lines.every((line) => line.length === lines[0].length));
});
