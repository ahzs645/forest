import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blockHasCrossing,
  getCrossingContext,
  scoutCrossing,
  winchCrossing,
  fordCrossing,
} from '../js/journey/riverCrossing.js';
import { buildCrossingApproachFrames, buildCrossingResolveFrames } from '../js/scene/crossing.js';

function makeJourney(overrides = {}) {
  return {
    resources: { food: 60, fuel: 30, equipment: 60, firstAid: 3, budget: 1000 },
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

const riverBlock = { id: 'b7', name: 'Chutanli Crossing', terrain: 'river', hazards: [] };
const hazardBlock = { id: 'b8', name: 'Glacial Fan', terrain: 'flat', hazards: ['river_crossing', 'glacial_current'] };
const dryBlock = { id: 'b9', name: 'Dry Ridge', terrain: 'hilly', hazards: ['grade'] };

test('crossing detection: river terrain and water hazards, not dry blocks', () => {
  assert.ok(blockHasCrossing(riverBlock));
  assert.ok(blockHasCrossing(hazardBlock));
  assert.ok(!blockHasCrossing(dryBlock));
  assert.equal(getCrossingContext(makeJourney(), dryBlock), null);
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

test('scouting halves the ford risk for that block', () => {
  const journey = makeJourney();
  const before = getCrossingContext(journey, riverBlock);
  const result = scoutCrossing(journey, before);
  assert.ok(result.messages.length >= 1);
  const after = getCrossingContext(journey, riverBlock);
  assert.ok(after.scouted);
  assert.ok(Math.abs(after.risk - before.risk / 2) < 1e-9);
});

test('ford success leaves supplies intact; high-water success lifts morale', () => {
  const journey = makeJourney({ weather: { id: 'heavy_rain' } });
  const ctx = getCrossingContext(journey, riverBlock);
  assert.ok(ctx.gaugeIndex >= 2);
  const foodBefore = journey.resources.food;
  const result = fordCrossing(journey, ctx, () => 0.99);
  assert.equal(result.mishap, false);
  assert.equal(journey.resources.food, foodBefore);
  assert.ok(journey.crew.every((m) => m.morale >= 63));
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

test('swept mishap injures a named crew member and takes a rations crate', () => {
  const journey = makeJourney({ weather: { id: 'storm' } });
  const ctx = getCrossingContext(journey, riverBlock);
  // roll: 0 (mishap), severity roll low (severe), victim pick, food loss
  const rolls = [0, 0.1, 0.4, 0.5];
  const result = fordCrossing(journey, ctx, () => rolls.shift() ?? 0.5);
  assert.equal(result.severity, 'swept');
  assert.ok(result.victimName);
  const victim = journey.crew.find((m) => m.name === result.victimName);
  assert.ok(victim.statusEffects.some((e) => e.effectId === 'hypothermia'));
  assert.ok(journey.resources.food <= 45);
  assert.ok(result.messages.some((m) => m.includes(result.victimName)));
});

test('winch crossing spends fuel and gear but crosses safely below flood', () => {
  const journey = makeJourney();
  const ctx = getCrossingContext(journey, riverBlock);
  const result = winchCrossing(journey, ctx, () => 0.9);
  assert.equal(result.mishap, false);
  assert.equal(journey.resources.fuel, 26);
  assert.equal(journey.resources.equipment, 57);
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
