import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createJourney,
  createReconJourney,
  createFieldJourney,
  createSilvicultureJourney,
  createPlanningJourney,
  createPermittingJourney,
  createManagerJourney,
} from '../js/journey/factory.js';
import { AREA_BLOCKS } from '../js/data/blocks.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';

// Deterministic PRNG so the headless drive below never flakes on Math.random().
function seededRandomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withSeededRandom(seed, fn) {
  const original = Math.random;
  Math.random = seededRandomFactory(seed);
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

const ACTION_PRIORITY = ['plant', 'inspect', 'fill', 'herbicide', 'survey', 'rotation', 'meeting', 'team_briefing', 'briefing', 'end'];

// A minimal "sensible player" UI (same shape as tests/silvicultureProgression.test.mjs):
// always take the highest-priority target-advancing action on offer, deploy
// ready contractors rather than stand deployed ones down, never gamble on
// standing anyone down.
function makeSensibleUi(journey) {
  return {
    write() {}, writeHeader() {}, writeWarning() {}, writePositive() {}, writeDanger() {},
    clear() {}, updateAllStatus() {}, playEventVignette() {},
    async promptChoice(prompt, options) {
      if (!options || options.length === 0) return { value: undefined };
      if (options.length === 1) return options[0];

      if (options.some((o) => o.value === 'end')) {
        const anyReadyToDeploy = (journey.contractors || []).some((c) => {
          const s = c.silvicultureState;
          return !c.isActive && !(s?.status === 'recovering') && !((s?.cooldownDays || 0) > 0);
        });
        for (const val of ACTION_PRIORITY) {
          if (val === 'rotation' && !anyReadyToDeploy) continue;
          const idx = options.findIndex((o) => o.value === val);
          if (idx !== -1) return options[idx];
        }
        return options[options.length - 1];
      }

      if (prompt === 'Adjust which contractor?') {
        const readyIdx = options.findIndex((o) => o.description && o.description.startsWith('ready'));
        if (readyIdx !== -1) return options[readyIdx];
        return options.find((o) => o.value === 'cancel') || options[options.length - 1];
      }
      if (prompt.startsWith('Stand down ')) {
        return options.find((o) => o.value === 'cancel') || options[0];
      }
      if (prompt === 'Meet with which contractor?') {
        let bestIdx = 0;
        let bestMorale = Infinity;
        options.forEach((o, i) => {
          const c = journey.contractors.find((c) => c.id === o.value);
          if (c && c.morale < bestMorale) { bestMorale = c.morale; bestIdx = i; }
        });
        return options[bestIdx];
      }
      return options[0];
    },
  };
}

// Shared assertion: a "scaled" block list must be a coherent, order-
// preserving subset of the "normal" block list, and its totalDistance must
// equal the sum of the kept blocks' distances.
function assertBlockSubsetConsistency(normalBlocks, scaledBlocks, totalDistance) {
  assert.ok(scaledBlocks.length < normalBlocks.length, 'campaign scale should shrink the block list');
  assert.equal(scaledBlocks.length, 6, 'recon/field campaign deployments trim to ~6 blocks');

  const normalIds = normalBlocks.map((b) => b.id);
  let cursor = -1;
  for (const block of scaledBlocks) {
    const idx = normalIds.indexOf(block.id);
    assert.ok(idx >= 0, `scaled block ${block.id} must come from the original area block list`);
    assert.ok(idx > cursor, `scaled block ${block.id} is out of the original order`);
    cursor = idx;
  }

  assert.ok(
    scaledBlocks.some((b) => b.hasSupply),
    'the kept block subset must retain a supply-bearing block',
  );

  const expectedDistance = scaledBlocks.reduce((sum, b) => sum + b.distance, 0);
  assert.equal(totalDistance, expectedDistance, 'totalDistance must be recomputed from the kept blocks');
}

test('campaign scale: recon trims blocks and scales per-run stockpile resources', () => {
  const normal = createReconJourney({ roleId: 'recce', areaId: 'fort-st-john-plateau' });
  const scaled = createReconJourney({ roleId: 'recce', areaId: 'fort-st-john-plateau', scale: 'campaign' });

  assert.equal(normal.blocks.length, 12);
  assertBlockSubsetConsistency(normal.blocks, scaled.blocks, scaled.totalDistance);

  // Stockpile resources scale ~0.45x.
  assert.equal(scaled.resources.budget, Math.round(normal.resources.budget * 0.45));
  assert.equal(scaled.resources.fuel, Math.round(normal.resources.fuel * 0.45));
  assert.equal(scaled.resources.food, Math.round(normal.resources.food * 0.45));
  assert.equal(scaled.resources.firstAid, Math.round(normal.resources.firstAid * 0.45));
  assert.equal(scaled.resources.gpsUnits, Math.round(normal.resources.gpsUnits * 0.45));
  assert.equal(scaled.resources.flaggingTape, Math.round(normal.resources.flaggingTape * 0.45));

  // Exact expected numbers from the current createFieldResources() defaults.
  assert.equal(scaled.resources.budget, 900);
  assert.equal(scaled.resources.fuel, 36);
  assert.equal(scaled.resources.food, 16);
  assert.equal(scaled.resources.firstAid, 3);
  assert.equal(scaled.resources.gpsUnits, 2);
  assert.equal(scaled.resources.flaggingTape, 23);

  // Equipment is a condition percentage (0-100), not a stockpile - untouched.
  assert.equal(scaled.resources.equipment, normal.resources.equipment);

  // Every declared operating area produces a consistent, order-preserving,
  // supply-retaining subset.
  for (const areaId of Object.keys(AREA_BLOCKS)) {
    const areaNormal = createFieldJourney({ areaId });
    const areaScaled = createFieldJourney({ areaId, scale: 'campaign' });
    assertBlockSubsetConsistency(areaNormal.blocks, areaScaled.blocks, areaScaled.totalDistance);
  }
});

test('campaign scale: plain field journeys (recon fallback) get the same block/resource treatment', () => {
  const normal = createFieldJourney({ areaId: 'fort-st-john-plateau' });
  const scaled = createFieldJourney({ areaId: 'fort-st-john-plateau', scale: 'campaign' });

  assertBlockSubsetConsistency(normal.blocks, scaled.blocks, scaled.totalDistance);
  assert.equal(scaled.resources.budget, Math.round(normal.resources.budget * 0.45));
  assert.equal(scaled.resources.equipment, normal.resources.equipment);
});

test('campaign scale: silviculture sets season-sized targets, budget and contractor capacity', () => {
  const normal = createSilvicultureJourney({ roleId: 'silviculture', areaId: 'fort-st-john-plateau' });
  const scaled = createSilvicultureJourney({
    roleId: 'silviculture',
    areaId: 'fort-st-john-plateau',
    scale: 'campaign',
  });

  // Full-length baseline, unaffected.
  assert.equal(normal.planting.blocksToPlant, 15);
  assert.equal(normal.planting.seedlingsAllocated, 250000);
  assert.equal(normal.brushing.hectaresTarget, 500);
  assert.equal(normal.surveys.freeGrowingTarget, 5);
  assert.equal(normal.resources.budget, 120000);
  assert.equal(normal.resources.contractorCapacity, 320);

  // Campaign season targets from docs/unified_campaign.md section 3.
  assert.equal(scaled.planting.blocksToPlant, 5);
  assert.equal(scaled.planting.seedlingsAllocated, 80000);
  assert.equal(scaled.resources.seedlings, 80000);
  assert.equal(scaled.brushing.hectaresTarget, 150);
  assert.equal(scaled.surveys.freeGrowingTarget, 2);
  assert.equal(scaled.resources.budget, 45000);
  assert.equal(scaled.resources.contractorCapacity, Math.round(320 * 0.45));
  assert.equal(scaled.resources.contractorCapacity, 144);

  // Percentages/credits not called out by the spec stay untouched.
  assert.equal(scaled.resources.equipment, normal.resources.equipment);
  assert.equal(scaled.resources.nurseryCredit, normal.resources.nurseryCredit);

  // Other planting/brushing/survey progress fields are untouched.
  assert.equal(scaled.planting.seedlingsPlanted, 0);
  assert.equal(scaled.planting.survivalRate, normal.planting.survivalRate);
  assert.equal(scaled.brushing.hectaresComplete, 0);
  assert.equal(scaled.surveys.freeGrowingComplete, 0);
});

test('campaign scale: silviculture arithmetic is winnable within a season (9-14 plant/fill actions, ~8-12 days)', () => {
  // Mirrors js/modes/silviculture.js handlePlanting()'s formula:
  //   seedlingsToPlant = round(baseSeedlings * (avgProductivity/100) * plantingEff * crowdingFactor * (1 - zoneDrag))
  // baseSeedlings: 9500 (plant) / 7000 (fill); contractors start at 80-100%
  // productivity (avg ~85-90%); zoneDrag/crowding trims a further ~10-15%.
  const seedlingsAllocated = 80000;
  const perPlantAction = Math.round(9500 * 0.85 * 1.0 * 1.0 * 0.9); // ~7267
  const actionsNeeded = Math.ceil(seedlingsAllocated / perPlantAction);
  assert.ok(actionsNeeded >= 9 && actionsNeeded <= 14, `expected 9-14 plant/fill actions, got ${actionsNeeded}`);

  // Hours: plant costs 4h, fill 3h, out of a 10h silviculture day.
  const hoursForPlanting = actionsNeeded * 4;
  const daysForPlanting = Math.ceil(hoursForPlanting / 10);
  assert.ok(daysForPlanting <= 6, `planting alone should fit comfortably inside the season, got ${daysForPlanting} days`);

  // Budget: $550/day overhead + $1700/plant action + brushing/survey passes,
  // must clear the scaled budget even after the 0.8x hard multiplier.
  const overheadDays = 12;
  const plantCost = actionsNeeded * 1700;
  const brushCost = 3 * 1400; // ~3 brushing actions to cover 150ha
  const surveyCost = 4 * 700; // a few survey attempts to land 2 free-growing calls
  const overheadCost = overheadDays * 550;
  const totalCost = plantCost + brushCost + surveyCost + overheadCost;

  const scaledBudget = 45000;
  const hardBudget = Math.round(scaledBudget * 0.8);
  assert.ok(totalCost <= scaledBudget, `estimated cost ${totalCost} should fit the $45k campaign budget`);
  assert.ok(totalCost <= hardBudget, `estimated cost ${totalCost} should still fit the hard-mode budget ${hardBudget}`);

  // Contractor capacity: plant=4/action, fill/brush/survey draw further capacity;
  // scaled capacity (144, or 115 on hard) must comfortably cover the program.
  const scaledCapacity = Math.round(320 * 0.45);
  const hardCapacity = Math.round(scaledCapacity * 0.8);
  const capacityNeeded = actionsNeeded * 4 + 3 * 2; // plant actions + brushing passes
  assert.ok(capacityNeeded <= hardCapacity, `estimated capacity use ${capacityNeeded} should fit hard-mode capacity ${hardCapacity}`);
});

test('campaign scale: planning shortens the deadline and scales budget, leaves gate thresholds alone', () => {
  const normal = createPlanningJourney({ roleId: 'planner', areaId: 'fort-st-john-plateau' });
  const scaled = createPlanningJourney({ roleId: 'planner', areaId: 'fort-st-john-plateau', scale: 'campaign' });

  assert.equal(normal.deadline, 28);
  assert.equal(scaled.deadline, 12);

  assert.equal(scaled.resources.budget, Math.round(50000 * 0.5));
  assert.equal(scaled.resources.budget, 25000);

  // Gate thresholds / plan phase state are untouched by campaign scale.
  assert.deepEqual(scaled.plan, normal.plan);
  assert.equal(scaled.resources.politicalCapital, normal.resources.politicalCapital);
  assert.equal(scaled.resources.dataCredits, normal.resources.dataCredits);
  assert.equal(scaled.resources.consultantDays, normal.resources.consultantDays);
});

test('campaign scale: permitting tightens permit target and deadline, scales budget', () => {
  const normal = createPermittingJourney({ roleId: 'permitter', areaId: 'fort-st-john-plateau' });
  const scaled = createPermittingJourney({
    roleId: 'permitter',
    areaId: 'fort-st-john-plateau',
    scale: 'campaign',
  });

  assert.equal(normal.permits.target, 15);
  assert.equal(scaled.permits.target, 5);

  assert.equal(normal.deadline, 30);
  assert.equal(scaled.deadline, 12);

  assert.equal(scaled.resources.budget, Math.round(42000 * 0.5));
  assert.equal(scaled.resources.budget, 21000);

  // Political capital/energy are percentage-style resources, untouched.
  assert.equal(scaled.resources.politicalCapital, normal.resources.politicalCapital);
  assert.equal(scaled.resources.energy, normal.resources.energy);
});

test('campaign scale: manager is not one of the four campaign roles and throws', () => {
  assert.throws(
    () => createManagerJourney({ roleId: 'manager', scale: 'campaign' }),
    /campaign/i,
  );
  // Routed the same way through the top-level factory.
  assert.throws(
    () => createJourney({ roleId: 'manager', scale: 'campaign' }),
    /campaign/i,
  );
});

test('campaign scale: manager without scale is unaffected', () => {
  const journey = createManagerJourney({ roleId: 'manager' });
  assert.equal(journey.deadline, 12);
  assert.equal(journey.resources.budget, 500000);
});

test('unscaled createJourney remains behaviorally identical to before the campaign-scale change', () => {
  // Recon
  const recon = createJourney({ roleId: 'recce', areaId: 'fort-st-john-plateau' });
  assert.equal(recon.journeyType, 'recon');
  assert.equal(recon.blocks.length, 12);
  assert.equal(recon.resources.budget, 2000);
  assert.equal(recon.resources.fuel, 80);
  assert.equal(recon.resources.food, 35);
  assert.equal(recon.resources.equipment, 85);
  assert.equal(recon.resources.firstAid, 6);
  assert.equal(recon.resources.gpsUnits, 5);
  assert.equal(recon.resources.flaggingTape, 50);
  assert.equal(recon.scrutiny, 28);

  // Silviculture
  const silviculture = createJourney({ roleId: 'silviculture', areaId: 'fort-st-john-plateau' });
  assert.equal(silviculture.journeyType, 'silviculture');
  assert.equal(silviculture.planting.blocksToPlant, 15);
  assert.equal(silviculture.planting.seedlingsAllocated, 250000);
  assert.equal(silviculture.brushing.hectaresTarget, 500);
  assert.equal(silviculture.surveys.freeGrowingTarget, 5);
  assert.equal(silviculture.resources.budget, 120000);
  assert.equal(silviculture.resources.seedlings, 250000);
  assert.equal(silviculture.resources.contractorCapacity, 320);

  // Planning
  const planning = createJourney({ roleId: 'planner', areaId: 'fort-st-john-plateau' });
  assert.equal(planning.journeyType, 'planning');
  assert.equal(planning.deadline, 28);
  assert.equal(planning.resources.budget, 50000);

  // Permitting
  const permitting = createJourney({ roleId: 'permitter', areaId: 'fort-st-john-plateau' });
  assert.equal(permitting.journeyType, 'permitting');
  assert.equal(permitting.permits.target, 15);
  assert.equal(permitting.deadline, 30);
  assert.equal(permitting.resources.budget, 42000);

  // Manager
  const manager = createJourney({ roleId: 'manager' });
  assert.equal(manager.journeyType, 'manager');
  assert.equal(manager.deadline, 12);
  assert.equal(manager.resources.budget, 500000);

  // Legacy field fallback (no roleId / unmapped role)
  const legacyField = createJourney({ areaId: 'fort-st-john-plateau' });
  assert.equal(legacyField.journeyType, 'field');
  assert.equal(legacyField.blocks.length, 12);
  assert.equal(legacyField.resources.budget, 2000);
});

test('headless drive: a campaign-scale silviculture deployment is winnable inside a season', async () => {
  // Drives the real js/modes/silviculture.js day-loop (not a mock) against a
  // campaign-scaled journey with a "sensible player" UI, across a spread of
  // seeds, to confirm 5 blocks / 80k seedlings / 150ha / 2 surveys is
  // actually completable in a season-length number of days - not just
  // arithmetically plausible.
  const seeds = [1, 2, 3, 4, 5];
  const results = [];

  for (const seed of seeds) {
    await withSeededRandom(seed, async () => {
      const journey = createSilvicultureJourney({ areaId: 'fraser-plateau', scale: 'campaign' });
      const ui = makeSensibleUi(journey);
      const game = { ui, journey, gameOver: false };

      let days = 0;
      while (!journey.isComplete && !journey.isGameOver && !game.gameOver && days < 40) {
        await runSilvicultureDay(game);
        days++;
      }

      results.push({
        seed,
        day: journey.day,
        isComplete: journey.isComplete,
        gameOverReason: journey.gameOverReason,
        planted: journey.planting.blocksPlanted,
        surveys: journey.surveys.freeGrowingComplete,
        budgetLeft: journey.resources.budget,
      });
    });
  }

  const wins = results.filter((r) => r.isComplete);
  assert.ok(
    wins.length >= Math.ceil(seeds.length * 0.6),
    `expected most seeds to win the campaign-scale season, got: ${JSON.stringify(results)}`,
  );
  for (const win of wins) {
    // Contract target is ~8-12 in-game days; give some RNG headroom the same
    // way the full-length equivalent test does (target 25-45, asserts <=50).
    assert.ok(win.day <= 18, `expected a win within a plausible season, got day ${win.day} (seed ${win.seed})`);
  }
});
