import test from 'node:test';
import assert from 'node:assert/strict';

import { collectDetailLines } from '../js/game/seasonalAdapter.js';
import { summarizeEffects } from '../tui/controller.js';
import { createPlanningJourney, createReconJourney } from '../js/journey/factory.js';
import {
  FOM_PUBLIC_REVIEW_MIN_DAYS,
  buildPlanningActionReceipt,
  capturePlanningActionState,
  getFomPublicationGaps,
  processAction,
  updatePlanningMissionStatus,
} from '../js/modes/planning.js';
import { updateReconMissionStatus } from '../js/modes/recon.js';
import {
  formatPlanningBlockTriageEvidence,
  getPlanningAreaBlockPool,
  pickPlanningBlockOptions,
} from '../js/data/planningBlocks.js';
import { FORESTER_ROLES } from '../js/data/roles.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';

function makeUi() {
  const lines = [];
  return {
    lines,
    mission: null,
    write(line) { if (line) lines.push(String(line)); },
    writeHeader(line) { if (line) lines.push(String(line)); },
    writeWarning(line) { if (line) lines.push(String(line)); },
    writePositive(line) { if (line) lines.push(String(line)); },
    setMissionStatus(status) { this.mission = status; },
    async promptChoice(_prompt, choices) { return choices[0]; },
  };
}

function makePlanningJourney() {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');
  return createPlanningJourney({ roleId: 'planner', areaId: area.id, area });
}

test('seasonal context renders structured operation, objective, and stakes instead of object coercion', () => {
  const lines = collectDetailLines({
    context: {
      operation: 'Spring access sequencing',
      objective: 'Keep peatland approaches intact',
      stakes: 'A poor call can close the operating window',
    },
    whyNow: 'Breakup is underway',
  });

  assert.deepEqual(lines, [
    'Operation: Spring access sequencing',
    'Objective: Keep peatland approaches intact',
    'Stakes: A poor call can close the operating window',
    'Why now: Breakup is underway',
  ]);
  assert.equal(lines.some((line) => line.includes('[object Object]')), false);
});

test('seasonal choice previews expose exact magnitudes and time costs', () => {
  assert.equal(
    summarizeEffects(
      { progress: -1, relationships: 3, compliance: 1, timeUsed: 2 },
      { timeUsed: 2 },
    ),
    'Progress -1 · Relationships +3 · Compliance +1 · Time 2h',
  );
});

test('FOM publication requires baseline data and analysis and opens a 30-calendar-day clock', async () => {
  const journey = makePlanningJourney();
  const block = getPlanningAreaBlockPool(journey.areaId)[0];
  journey.blockPlanning.activeBlock = block;
  journey.blockPlanning.activeBlockId = block.id;
  const ui = makeUi();

  assert.deepEqual(getFomPublicationGaps(journey), ['data 0%/30%', 'analysis 0%/15%']);
  const hoursBeforeBlockedAttempt = journey.hoursRemaining;
  await processAction({ ui, journey }, 'fom_review', null);
  assert.equal(journey.blockPlanning.fom.status, 'draft');
  assert.equal(journey.hoursRemaining, hoursBeforeBlockedAttempt);
  assert.ok(ui.lines.some((line) => line.includes('publication blocked')));

  journey.plan.dataCompleteness = 30;
  journey.plan.analysisQuality = 15;
  const before = capturePlanningActionState(journey);
  await processAction({ ui, journey }, 'fom_review', null);

  assert.equal(journey.blockPlanning.fom.status, 'public_review');
  assert.equal(journey.blockPlanning.fom.reviewDaysRemaining, FOM_PUBLIC_REVIEW_MIN_DAYS);
  assert.match(buildPlanningActionReceipt(before, journey), /FOM draft → public review/);
  assert.match(buildPlanningActionReceipt(before, journey), /FOM clock 30 calendar days/);
});

test('planning mission status and action receipt reflect the post-action state immediately', async () => {
  const journey = makePlanningJourney();
  const ui = makeUi();
  const before = capturePlanningActionState(journey);

  await processAction({ ui, journey }, 'gather_data', null);
  const status = updatePlanningMissionStatus(ui, journey, null);
  const receipt = buildPlanningActionReceipt(before, journey);

  assert.ok(status.checklist.some((item) => item.label === 'Data 10% of 80%'));
  assert.match(receipt, /Data \+10 → 10%/);
  assert.match(receipt, /Budget -\$900/);
  assert.match(receipt, /Energy -10/);
  assert.match(receipt, /Stress \+6/);
});

test('recon mission status exposes only unverified access until fieldwork records it', () => {
  const journey = createReconJourney({ roleId: 'recce', areaId: 'fort-st-john-plateau' });
  const block = journey.blocks[0];
  const ui = makeUi();

  const initial = updateReconMissionStatus(ui, journey);
  assert.ok(initial.alerts.some((alert) => /Unverified/.test(alert.text)));
  assert.equal(initial.alerts.some((alert) => /Passable now/.test(alert.text)), false);
  assert.ok(initial.checklist.some((item) => item.label === 'access ground-truthed' && !item.done));

  journey.reconIntel.byBlock[block.id].accessGroundTruthed = true;
  journey.reconIntel.byBlock[block.id].assessmentComplete = true;
  journey.blocksAssessed = 1;
  const verified = updateReconMissionStatus(ui, journey);
  assert.ok(verified.checklist.some((item) => item.label === 'access ground-truthed' && item.done));
  assert.equal(verified.meter.text, `1/${journey.blocks.length}`);
});

test('access-first block choices include different engineering evidence instead of three equivalent cards', () => {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fort-st-john-plateau');
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const options = pickPlanningBlockOptions(area.id, [], 3, 'access', area, null);
    const complexities = new Set(options.map((block) => Math.round(block.metrics.technicalComplexity || 0)));
    assert.equal(options.length, 3);
    assert.ok(complexities.size >= 2, `expected varied engineering complexity, got ${[...complexities]}`);
    const evidence = options.map((block) => formatPlanningBlockTriageEvidence(block, 'access', options, area, null));
    assert.match(evidence[0], /engineering complexity/);
    assert.match(evidence[0], /fit rank 1\/3/);
    assert.notEqual(evidence[0], evidence[1]);
  } finally {
    Math.random = originalRandom;
  }
});

test('role descriptions are geographically valid for every selectable BC area', () => {
  for (const role of FORESTER_ROLES) {
    assert.doesNotMatch(role.description, /northern BC/i, role.id);
  }
});
