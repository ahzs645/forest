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
import { simulateRun } from '../scripts/simulate-expeditions.mjs';

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

const ACTION_PRIORITY = ['inspect', 'plant', 'survey', 'fill', 'brush', 'rotation', 'meeting', 'team_briefing', 'briefing', 'end'];

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

      // A day can now open with an authored situation that costs the day to
      // answer, plus an explicit way to decline it (js/journey/daySituation.js).
      // A sensible player does not answer everything: when the program is
      // behind the calendar they wear the scrutiny and keep the day for the
      // planting. Without this the "sensible" run spends its season on the
      // radio and lands outside any plausible window.
      const setAside = options.find((o) => o.value === 'set_aside');
      if (setAside) {
        const deadline = journey.deadline || 42;
        const elapsed = (journey.day || 1) / deadline;
        const planted = (journey.planting?.blocksPlanted || 0)
          / (journey.planting?.blocksToPlant || 1);
        if (planted < elapsed) return setAside;
      }

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
        const readyIdx = options.findIndex((o) => o.description && /^(ready|available)/.test(o.description));
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
  assert.equal(scaled.resources.budget, 1440);
  assert.equal(scaled.resources.fuel, 59);
  assert.equal(scaled.resources.food, 29);
  assert.equal(scaled.resources.firstAid, 4);
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
  assert.equal(normal.planting.blocksToPlant, 8);
  assert.equal(normal.planting.seedlingsAllocated, 140000);
  assert.equal(normal.brushing.hectaresTarget, 260);
  assert.equal(normal.surveys.freeGrowingTarget, 3);
  assert.equal(normal.resources.budget, 380000);
  assert.equal(normal.resources.contractorCapacity, 320);

  // Campaign season targets from docs/unified_campaign.md section 3.
  assert.equal(scaled.planting.blocksToPlant, 3);
  assert.equal(scaled.planting.seedlingsAllocated, 55000);
  assert.equal(scaled.resources.seedlings, 55000 + scaled.program.fill.reduce((sum, opening) => sum + opening.trees, 0), 'this year\'s allocation plus the fill stock');
  assert.equal(scaled.brushing.hectaresTarget, 100);
  assert.equal(scaled.surveys.freeGrowingTarget, 2);
  assert.equal(scaled.resources.budget, 150000);
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

test('campaign scale: silviculture arithmetic is winnable within a season', () => {
  // Mirrors js/modes/silviculture.js estimatePlantingOutput(): planters ×
  // ~950 trees/planter/day × productivity × planting window × site fit,
  // less zone drag. A 12-planter crew at ~85% productivity in the spring
  // window (1.2) with a 10% zone drag puts ~11,000 trees a day in the ground.
  const seedlingsAllocated = 55000;
  const perPlantDay = Math.round(12 * 950 * 0.85 * 1.2 * 0.9); // ~10,465
  const plantDays = Math.ceil(seedlingsAllocated / perPlantDay);
  assert.ok(plantDays >= 4 && plantDays <= 8, `expected 4-8 planting days, got ${plantDays}`);

  // Every planted block is followed by a day of quality plots before the
  // contractor moves on, so the planting track is plant days + 3 inspections.
  const blocks = 3;
  assert.ok(plantDays + blocks <= 12, `planting and plots should fit inside the season, got ${plantDays + blocks} days`);

  // Budget at real rates (js/data/silvicultureProgram.js): trees × ~$0.32,
  // fill at +$0.06, release at $900/ha manual or $350/ha glyphosate, an
  // accredited survey day at $1,800, and $550/day supervisor overhead. An
  // all-manual release program has to clear the campaign budget on normal;
  // glyphosate under the PMP has to clear it after the 0.8x hard multiplier.
  const overheadDays = 20;
  const plantCost = seedlingsAllocated * 0.35;
  const fillCost = 4500 * 0.41;
  const surveyCost = 3 * 1800;
  const overheadCost = overheadDays * 550;
  const manualBrush = 100 * 900;
  const glyphosateBrush = 100 * 350;
  const manualTotal = plantCost + fillCost + surveyCost + overheadCost + manualBrush;
  const glyphosateTotal = plantCost + fillCost + surveyCost + overheadCost + glyphosateBrush;

  const scaledBudget = 150000;
  const hardBudget = Math.round(scaledBudget * 0.8);
  assert.ok(manualTotal <= scaledBudget, `all-manual release ${manualTotal} should fit the $150k campaign budget`);
  assert.ok(glyphosateTotal <= hardBudget, `glyphosate release ${glyphosateTotal} should fit the hard-mode budget ${hardBudget}`);

  // Contractor capacity: plant=4/day, fill=3, brush=2; scaled capacity (144,
  // or 115 on hard) must comfortably cover the program.
  const scaledCapacity = Math.round(320 * 0.45);
  const hardCapacity = Math.round(scaledCapacity * 0.8);
  const capacityNeeded = plantDays * 4 + 3 + 3 * 2;
  assert.ok(capacityNeeded <= hardCapacity, `estimated capacity use ${capacityNeeded} should fit hard-mode capacity ${hardCapacity}`);
});

test('recon and silviculture ship a real season deadline, full-length and campaign', () => {
  const recon = createJourney({ roleId: 'recce', areaId: 'fort-st-john-plateau' });
  const reconCampaign = createJourney({ roleId: 'recce', areaId: 'fort-st-john-plateau', scale: 'campaign' });
  assert.equal(recon.deadline, 40, 'full-length recon runs to a 40-shift access season');
  assert.equal(reconCampaign.deadline, 24, 'campaign recon gets a 24-shift season');

  const silv = createSilvicultureJourney({ roleId: 'silviculture', areaId: 'fort-st-john-plateau' });
  const silvCampaign = createSilvicultureJourney({
    roleId: 'silviculture',
    areaId: 'fort-st-john-plateau',
    scale: 'campaign'
  });
  assert.equal(silv.deadline, 42, 'full-length silviculture runs to a 42-day planting season');
  assert.equal(silvCampaign.deadline, 20, 'campaign silviculture shares the twenty-day season');
});

test('campaign scale: planning shortens the deadline and scales budget, leaves gate thresholds alone', () => {
  const normal = createPlanningJourney({ roleId: 'planner', areaId: 'fort-st-john-plateau' });
  const scaled = createPlanningJourney({ roleId: 'planner', areaId: 'fort-st-john-plateau', scale: 'campaign' });

  assert.equal(normal.deadline, 34);
  assert.equal(scaled.deadline, 26);

  assert.equal(scaled.resources.budget, Math.round(82000 * 0.85));
  assert.equal(scaled.resources.budget, 69700);

  // Gate thresholds / plan phase state are untouched by campaign scale.
  assert.deepEqual(scaled.plan, normal.plan);
  assert.equal(scaled.resources.politicalCapital, normal.resources.politicalCapital);
  assert.equal(scaled.resources.dataCredits, normal.resources.dataCredits);
  assert.equal(scaled.resources.consultantDays, normal.resources.consultantDays);
});

test('campaign planning can finish a real file within its funded season', async () => {
  const results = [];
  for (let index = 0; index < 12; index += 1) {
    results.push(await simulateRun('planning', 1000 + index * 37, 'campaign'));
  }
  assert.ok(results.filter((result) => result.won).length >= 4,
    `competent planning files should be deliverable: ${JSON.stringify(results.map(({ seed, days, reason }) => ({ seed, days, reason })))}`);
  for (const result of results) {
    assert.ok(!result.reason?.startsWith('error:'), result.reason);
    assert.ok(result.days <= result.deadline);
    assert.equal(result.tally.__fellThrough || 0, 0, 'the policy must recognise the actual menus');
  }
});

test('campaign scale: permitting tightens permit target and deadline, scales budget', () => {
  const normal = createPermittingJourney({ roleId: 'permitter', areaId: 'fort-st-john-plateau' });
  const scaled = createPermittingJourney({
    roleId: 'permitter',
    areaId: 'fort-st-john-plateau',
    scale: 'campaign',
  });

  assert.equal(normal.permits.target, 15);
  assert.equal(scaled.permits.target, 12);

  assert.equal(normal.deadline, 30);
  assert.equal(scaled.deadline, 20);

  assert.equal(scaled.resources.budget, Math.round(58000 * 0.68));
  assert.equal(scaled.resources.budget, 39440);

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
  assert.equal(journey.resources.budget, 850000);
});

test('unscaled createJourney remains behaviorally identical to before the campaign-scale change', () => {
  // Recon
  const recon = createJourney({ roleId: 'recce', areaId: 'fort-st-john-plateau' });
  assert.equal(recon.journeyType, 'recon');
  assert.equal(recon.blocks.length, 12);
  assert.equal(recon.resources.budget, 3200);
  assert.equal(recon.resources.fuel, 130);
  assert.equal(recon.resources.food, 65);
  assert.equal(recon.resources.equipment, 90);
  assert.equal(recon.resources.firstAid, 8);
  assert.equal(recon.resources.gpsUnits, 5);
  assert.equal(recon.resources.flaggingTape, 50);
  assert.equal(recon.scrutiny, 28);

  // Silviculture
  const silviculture = createJourney({ roleId: 'silviculture', areaId: 'fort-st-john-plateau' });
  assert.equal(silviculture.journeyType, 'silviculture');
  assert.equal(silviculture.planting.blocksToPlant, 8);
  assert.equal(silviculture.planting.seedlingsAllocated, 140000);
  assert.equal(silviculture.brushing.hectaresTarget, 260);
  assert.equal(silviculture.surveys.freeGrowingTarget, 3);
  assert.equal(silviculture.resources.budget, 380000);
  assert.ok(silviculture.resources.seedlings > 140000, 'allocation plus fill stock');
  assert.equal(silviculture.resources.contractorCapacity, 320);

  // Planning
  const planning = createJourney({ roleId: 'planner', areaId: 'fort-st-john-plateau' });
  assert.equal(planning.journeyType, 'planning');
  assert.equal(planning.deadline, 34);
  assert.equal(planning.resources.budget, 82000);

  // Permitting
  const permitting = createJourney({ roleId: 'permitter', areaId: 'fort-st-john-plateau' });
  assert.equal(permitting.journeyType, 'permitting');
  assert.equal(permitting.permits.target, 15);
  assert.equal(permitting.deadline, 30);
  assert.equal(permitting.resources.budget, 58000);

  // Manager
  const manager = createJourney({ roleId: 'manager' });
  assert.equal(manager.journeyType, 'manager');
  assert.equal(manager.deadline, 12);
  assert.equal(manager.resources.budget, 850000);

  // Legacy field fallback (no roleId / unmapped role)
  const legacyField = createJourney({ areaId: 'fort-st-john-plateau' });
  assert.equal(legacyField.journeyType, 'field');
  assert.equal(legacyField.blocks.length, 12);
  assert.equal(legacyField.resources.budget, 3200);
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
    // A day is one action now (js/journey/dayPlan.js), so a campaign season
    // runs ~12-19 days rather than ~8-12; the bound keeps the same RNG
    // headroom over the range scripts/simulate-expeditions.mjs measures.
    assert.ok(win.day <= 26, `expected a win within a plausible season, got day ${win.day} (seed ${win.seed})`);
  }
});
