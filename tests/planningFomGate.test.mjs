import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlanningJourney } from '../js/journey/factory.js';
import {
  runPlanningDay,
  syncFomStateFromActiveBlock,
  processAction,
  getPlanningSubmissionReadiness,
  getOutreachReadinessCap
} from '../js/modes/planning.js';
import { startDay } from '../js/journey/dayPlan.js';
import { getPlanningAreaBlockPool } from '../js/data/planningBlocks.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';

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

function makeCaptureUi() {
  const lines = [];
  return {
    lines,
    write(text) { if (typeof text === 'string') lines.push(text); },
    writeHeader(text) { lines.push(text); },
    writeWarning(text) { lines.push(text); },
    writePositive(text) { lines.push(text); },
    writeDanger(text) { lines.push(text); },
    clear() {},
    updateAllStatus() {},
    playEventVignette() {},
    async promptChoice(prompt, choices) {
      if (!choices || choices.length === 0) return { value: undefined };
      const endIdx = choices.findIndex((c) => c.value === 'end');
      if (endIdx !== -1) return choices[endIdx];
      return choices[0];
    }
  };
}

function makeJourneyWithArea() {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');
  return createPlanningJourney({ roleId: 'planner', areaId: 'fraser-plateau', area });
}

test('the public-review countdown surfaces in the day header once the FOM is published', async () => {
  await withSeededRandom(555, async () => {
    const journey = makeJourneyWithArea();
    const pool = getPlanningAreaBlockPool(journey.areaId);
    journey.blockPlanning.activeBlock = pool[0];
    journey.blockPlanning.activeBlockId = pool[0].id;

    const fom = syncFomStateFromActiveBlock(journey, null);
    fom.status = 'public_review';
    fom.reviewDaysRemaining = 30;
    fom.commentLoad = 2;

    const ui = makeCaptureUi();
    const game = { ui, journey, gameOver: false };

    await runPlanningDay(game);

    assert.ok(
      ui.lines.some((line) => /FOM comment period: 30 calendar days remaining/.test(line)),
      `expected the day header to surface the review countdown, lines were: ${JSON.stringify(ui.lines.slice(0, 15))}`
    );
  });
});

test('FOM review state persists across a block-focus switch instead of resetting to draft', () => {
  const journey = makeJourneyWithArea();
  const pool = getPlanningAreaBlockPool(journey.areaId);
  assert.ok(pool.length >= 2, 'need at least two blocks in the pool for this area to exercise a focus switch');

  journey.blockPlanning.activeBlock = pool[0];
  journey.blockPlanning.activeBlockId = pool[0].id;
  const firstSync = syncFomStateFromActiveBlock(journey, null);
  firstSync.status = 'public_review';
  firstSync.reviewDaysRemaining = 4;
  firstSync.commentLoad = 3;

  // Switching the active block focus (as Cutblock Priority Decision does)
  // must not silently discard the review clock/status that was already in
  // progress for the plan-level FOM submission.
  journey.blockPlanning.activeBlock = pool[1];
  journey.blockPlanning.activeBlockId = pool[1].id;
  const secondSync = syncFomStateFromActiveBlock(journey, null);

  assert.equal(secondSync.status, 'public_review', 'FOM status should survive a block-focus switch');
  assert.equal(secondSync.reviewDaysRemaining, 4, 'review clock should survive a block-focus switch');
  assert.equal(secondSync.commentLoad, 3, 'comment load should survive a block-focus switch');
  assert.equal(secondSync.activeBlockId, pool[1].id, 'the descriptive active-block id still updates');
});

test('a closed FOM comment period is not reset back to draft when the block focus changes', () => {
  const journey = makeJourneyWithArea();
  const pool = getPlanningAreaBlockPool(journey.areaId);
  assert.ok(pool.length >= 2);

  journey.blockPlanning.activeBlock = pool[0];
  journey.blockPlanning.activeBlockId = pool[0].id;
  const firstSync = syncFomStateFromActiveBlock(journey, null);
  firstSync.status = 'closed';
  firstSync.approvedDay = 12;

  journey.blockPlanning.activeBlock = pool[1];
  journey.blockPlanning.activeBlockId = pool[1].id;
  const secondSync = syncFomStateFromActiveBlock(journey, null);

  assert.equal(secondSync.status, 'closed', 'a closed comment period must not be rewound to draft by a focus switch');
  assert.equal(secondSync.approvedDay, 12);
});

test("older saves that recorded the FOM as 'approved' load as a closed comment period", () => {
  const journey = makeJourneyWithArea();
  const pool = getPlanningAreaBlockPool(journey.areaId);
  journey.blockPlanning.activeBlock = pool[0];
  journey.blockPlanning.activeBlockId = pool[0].id;
  journey.blockPlanning.fom.status = 'approved';
  journey.blockPlanning.fom.activeBlockId = pool[0].id;

  const fom = syncFomStateFromActiveBlock(journey, null);
  assert.equal(fom.status, 'closed');
});

test('the District Pre-Submission Meeting tops out short of the decision gate; only Prepare Submission crosses it, and only with the FOM closed', async () => {
  await withSeededRandom(777, async () => {
    const journey = makeJourneyWithArea();
    const pool = getPlanningAreaBlockPool(journey.areaId);
    journey.blockPlanning.activeBlock = pool[0];
    journey.blockPlanning.activeBlockId = pool[0].id;
    journey.plan.phase = 'ministerial_approval';
    journey.plan.dataCompleteness = 85;
    journey.plan.analysisQuality = 85;
    journey.plan.stakeholderBuyIn = 80;
    journey.plan.ministerialConfidence = 30;
    journey.resources.budget = 100000;
    journey.resources.politicalCapital = 100;
    journey.professional.registrationStatus = 'active';

    const ui = makeCaptureUi();
    const game = { ui, journey, gameOver: false };

    for (let i = 0; i < 10; i++) {
      startDay(journey);
      await processAction(game, 'outreach', null);
    }
    const readiness = getPlanningSubmissionReadiness(journey, null);
    const cap = getOutreachReadinessCap(readiness);
    assert.ok(cap < 80, `the meeting cap must sit below the decision gate, got ${cap}`);
    assert.equal(journey.plan.ministerialConfidence, cap, 'meetings stop at the cap');

    // The FOM is still a draft: the submission is blocked and the file is not won.
    startDay(journey);
    await processAction(game, 'submit', null);
    assert.equal(journey.isComplete, false, 'no decision without a closed FOM comment period');
    assert.equal(journey.plan.ministerialConfidence, cap);
    assert.ok(ui.lines.some((line) => /Submission blocked: .*FOM draft/.test(line)));

    // Close the comment period; the submission carries the file across.
    journey.blockPlanning.fom.status = 'closed';
    journey.blockPlanning.fom.commentLoad = 0;
    journey.blockPlanning.fom.reviewDaysRemaining = 0;
    journey.blockPlanning.fom.hydrologyReadiness = 100;
    startDay(journey);
    await processAction(game, 'submit', null);
    assert.ok(journey.plan.ministerialConfidence >= 80, `submission should cross the gate, at ${journey.plan.ministerialConfidence}%`);
    assert.equal(journey.isComplete, true);
    assert.match(journey.endReason, /approved by the District Manager/);
  });
});
