import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlanningJourney } from '../js/journey/factory.js';
import {
  runPlanningDay,
  syncFomStateFromActiveBlock,
  processAction,
  getPlanningSubmissionReadiness,
  getOutreachReadinessCap,
  applyTriageScrutinyShift,
  LEAD_BLOCK_SET_SIZE
} from '../js/modes/planning.js';
import { startDay } from '../js/journey/dayPlan.js';
import {
  getPlanningAreaBlockPool,
  hasPlanningAreaBlockSnapshot,
  pickPlanningBlockOptions
} from '../js/data/planningBlocks.js';
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

/**
 * A competent enough planner to reach the FOM: take the first triage and the
 * first lead block, publish the map the day it is allowed, and otherwise work
 * the file. Situations are set aside so the run measures the file, not the deck.
 */
function makePlannerUi(prompts, triageKey = null) {
  const ui = makeCaptureUi();
  ui.writeBox = ui.write;
  ui.writeInfo = ui.write;
  ui.writeSuccess = ui.write;
  ui.writeDivider = () => {};
  ui.playScene = () => {};
  ui.playTravelStrip = () => {};
  ui.playRadioAction = () => {};
  ui.setMissionStatus = () => {};
  ui.clearMissionStatus = () => {};
  ui.promptText = async () => 'noted';
  ui.promptChoice = async (prompt, choices = []) => {
    prompts.push(prompt);
    if (!choices.length) return { value: undefined };
    const byValue = (value) => choices.find((choice) => choice.value === value);
    if (prompt === 'Constraint triage:' && triageKey) return byValue(triageKey) || choices[0];
    return byValue('set_aside')
      || byValue('fom_review')
      || byValue('gather_data')
      || byValue('analyze')
      || byValue('stakeholder')
      || byValue('outreach')
      || byValue('end')
      || byValue('next')
      || byValue('continue')
      || choices[0];
  };
  return ui;
}

async function driveToFomPublication(area, seed) {
  return withSeededRandom(seed, async () => {
    const journey = createPlanningJourney({ roleId: 'planner', areaId: area.id, area });
    const prompts = [];
    const game = { ui: makePlannerUi(prompts), journey, gameOver: false, checkpoint() {} };
    for (let day = 0; day < journey.deadline && !game.gameOver && !journey.isComplete; day += 1) {
      await runPlanningDay(game);
      if (journey.blockPlanning.fom.status !== 'draft') break;
    }
    return { journey, prompts };
  });
}

test('every operating area has a block snapshot deep enough to lock a lead block set', () => {
  for (const area of OPERATING_AREAS) {
    assert.ok(hasPlanningAreaBlockSnapshot(area.id), `${area.id} has no generated block snapshot`);
    const pool = getPlanningAreaBlockPool(area.id);
    assert.ok(pool.length >= LEAD_BLOCK_SET_SIZE, `${area.id} has ${pool.length} blocks`);
    for (const block of pool) {
      assert.ok(block.id && block.adminDistrict && block.metrics && block.valueEffects && block.eventBias, `${area.id} ${block.id} is missing fields`);
    }
    const options = pickPlanningBlockOptions(area.id, [], LEAD_BLOCK_SET_SIZE, 'water', area, null);
    assert.equal(options.length, LEAD_BLOCK_SET_SIZE, `${area.id} offers ${options.length} blocks`);
  }
});

test('an area with no block snapshot still offers area-profile placeholder blocks for every triage', () => {
  const pool = getPlanningAreaBlockPool('area-without-snapshot');
  assert.ok(pool.length >= LEAD_BLOCK_SET_SIZE);
  assert.ok(pool.every((block) => block.source === 'area-profile-fallback'));
  assert.equal(hasPlanningAreaBlockSnapshot('area-without-snapshot'), false);
  for (const triageKey of ['access', 'water', 'community', 'timber']) {
    const options = pickPlanningBlockOptions('area-without-snapshot', [], LEAD_BLOCK_SET_SIZE, triageKey, null, null);
    assert.equal(options.length, LEAD_BLOCK_SET_SIZE, `${triageKey} triage offers ${options.length} blocks`);
  }
});

for (const area of OPERATING_AREAS) {
  test(`planning in ${area.id} locks the lead block set once and publishes the FOM`, async () => {
    const { journey, prompts } = await driveToFomPublication(area, 4242);
    assert.ok(journey.blockPlanning.activeBlock, 'the lead block set never locked');
    assert.equal(journey.blockPlanning.leadBlocks.length, LEAD_BLOCK_SET_SIZE);
    assert.equal(prompts.filter((prompt) => prompt === 'Constraint triage:').length, 1, 'the triage should be asked once');
    assert.notEqual(journey.blockPlanning.fom.status, 'draft', `FOM never published by day ${journey.day}`);
  });
}

test('planning in an area without a block snapshot still reaches FOM publication', async () => {
  const base = OPERATING_AREAS.find((candidate) => candidate.id === 'kootenay-wetbelt');
  const area = { ...base, id: 'area-without-snapshot' };
  const { journey, prompts } = await driveToFomPublication(area, 4242);
  assert.equal(journey.blockPlanning.activeBlock?.source, 'area-profile-fallback');
  assert.equal(prompts.filter((prompt) => prompt === 'Constraint triage:').length, 1);
  assert.notEqual(journey.blockPlanning.fom.status, 'draft');
});

test('the triage scrutiny shift lands once, not every time the posture is picked', () => {
  const journey = makeJourneyWithArea();
  journey.scrutiny = 40;
  assert.equal(applyTriageScrutinyShift(journey, 'water'), -2);
  assert.equal(journey.scrutiny, 38);
  assert.equal(applyTriageScrutinyShift(journey, 'water'), 0, 're-picking the same posture has no effect');
  assert.equal(journey.scrutiny, 38);
  // Switching posture moves scrutiny by the difference only.
  assert.equal(applyTriageScrutinyShift(journey, 'timber'), 4);
  assert.equal(journey.scrutiny, 42);
});

test('a save that locked its set before the shift was tracked does not get the shift again', () => {
  const journey = makeJourneyWithArea();
  journey.scrutiny = 30;
  journey.blockPlanning.activeTriage = 'community';
  assert.equal(applyTriageScrutinyShift(journey, 'community'), 0);
  assert.equal(journey.scrutiny, 30);
});

test('an event reopening the block question does not ease scrutiny again for the same triage', async () => {
  await withSeededRandom(99, async () => {
    const area = OPERATING_AREAS.find((candidate) => candidate.id === 'okanagan-shuswap-drybelt');
    const journey = createPlanningJourney({ roleId: 'planner', areaId: area.id, area });
    journey.plan.phase = 'analysis';
    const prompts = [];
    const ui = makePlannerUi(prompts, 'water');
    const game = { ui, journey, gameOver: false, checkpoint() {} };

    startDay(journey);
    await runPlanningDay(game);
    assert.ok(journey.blockPlanning.activeBlock);
    assert.ok(ui.lines.some((line) => /Scrutiny eases to .* as you choose Water and ecology first/.test(line)));

    const before = ui.lines.length;
    journey.blockPlanning.pendingSelection = true;
    startDay(journey);
    await runPlanningDay(game);
    const reopenedLines = ui.lines.slice(before);
    assert.equal(prompts.filter((prompt) => prompt === 'Constraint triage:').length, 2);
    assert.ok(!reopenedLines.some((line) => /Scrutiny eases to .* as you choose/.test(line)), 'the same triage eased scrutiny twice');
    assert.ok(reopenedLines.some((line) => /Scrutiny holds at \d+%: the file already carries the Water and ecology first posture/.test(line)));
  });
});
