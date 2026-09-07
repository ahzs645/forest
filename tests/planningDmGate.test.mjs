import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlanningJourney } from '../js/journey/factory.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import {
  WSA_REVIEW_READINESS,
  applySelectedBlockImpact,
  getEffectiveWaterGate,
  getPlanningLeadBlocks,
  getPlanningLeadWaterContext,
  getPlanningSubmissionReadiness,
  isBlockSelectionDue,
  processAction,
  syncFomStateFromActiveBlock,
  updatePlanningMissionStatus,
} from '../js/modes/planning.js';
import {
  getPlanningAreaBlockPool,
  getPlanningBlockHeritageLoad,
  getPlanningBlockWaterContext,
  buildPlanningConstraintTriage,
  formatPlanningBlockPromptDescription,
  formatPlanningBlockTriageEvidence,
} from '../js/data/planningBlocks.js';
import { resolveEvent } from '../js/events/resolution.js';
import { PLANNING_PRE_SUBMISSION_CAP } from '../js/journey/constants.js';
import { startDay } from '../js/journey/dayPlan.js';

function makeJourney(areaId = 'fraser-plateau') {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === areaId);
  return createPlanningJourney({ roleId: 'planner', areaId, area });
}

function makeUi() {
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
    setMissionStatus() {},
    async promptChoice(prompt, choices) { return choices?.[0] || { value: undefined }; },
  };
}

test('compliance and relationship events never move the District Manager\'s readiness or the engagement record', () => {
  const journey = makeJourney();
  journey.day = 9;
  journey.plan.phase = 'ministerial_approval';
  journey.plan.ministerialConfidence = 40;
  journey.plan.stakeholderBuyIn = 60;
  const reputationBefore = journey.protagonist.reputation;
  const goodwillBefore = journey.resources.politicalCapital;

  resolveEvent(journey, { id: 'policy_change', title: 'Policy Change' }, {
    label: 'Comply',
    effects: { compliance: 8, relationships: 6 },
  });

  assert.equal(journey.plan.ministerialConfidence, 40);
  assert.equal(journey.plan.stakeholderBuyIn, 60);
  assert.equal(journey.plan.phase, 'ministerial_approval');
  assert.equal(journey.isComplete, false);
  assert.ok(journey.protagonist.reputation > reputationBefore, 'compliance lands on reputation');
  assert.equal(journey.resources.politicalCapital, goodwillBefore, 'compliance is not district goodwill');
  assert.equal(journey.stakeholders.nations.mood, 53, 'relationships land on stakeholder moods');
});

test('explicit data / analysis / buyIn keys land on their own tracks and suppress the generic progress fallback', () => {
  const journey = makeJourney();
  journey.day = 4;
  journey.plan.phase = 'analysis';
  journey.plan.dataCompleteness = 80;
  journey.plan.analysisQuality = 40;
  journey.plan.stakeholderBuyIn = 35;

  const result = resolveEvent(journey, { id: 'gis_data_corrupted', title: 'GIS Data Corrupted' }, {
    label: 'Rebuild from backups',
    effects: { data: -12, progress: 10 },
  });
  assert.equal(journey.plan.dataCompleteness, 68, 'data key hits data completeness');
  assert.equal(journey.plan.analysisQuality, 40, 'generic progress is not applied on top of an explicit key');
  assert.ok(result.messages.some((message) => /Data readiness slipped/.test(message)));

  resolveEvent(journey, { id: 'partnership_offer', title: 'Partnership Opportunity' }, {
    label: 'Sign the MOU',
    effects: { buyIn: 6, analysis: 4 },
  });
  assert.equal(journey.plan.stakeholderBuyIn, 41);
  assert.equal(journey.plan.analysisQuality, 44);
  assert.equal(journey.plan.phase, 'analysis');
});

test('generic progress in the decision phase is capped below the gate so only Prepare Submission crosses it', () => {
  const journey = makeJourney();
  journey.day = 20;
  journey.plan.phase = 'ministerial_approval';
  journey.plan.dataCompleteness = 90;
  journey.plan.analysisQuality = 90;
  journey.plan.stakeholderBuyIn = 80;
  journey.plan.ministerialConfidence = 60;
  journey.blockPlanning.fom.status = 'closed';

  resolveEvent(journey, { id: 'good_week', title: 'Good Week' }, {
    label: 'Ride it',
    effects: { progress: 40 },
  });
  assert.equal(journey.plan.ministerialConfidence, PLANNING_PRE_SUBMISSION_CAP);
  assert.equal(journey.isComplete, false);
});

test('a relationship event does not advance the engagement phase; only a Stakeholder Session does', async () => {
  const journey = makeJourney();
  journey.day = 12;
  journey.plan.phase = 'stakeholder_review';
  journey.plan.dataCompleteness = 90;
  journey.plan.analysisQuality = 90;
  journey.plan.stakeholderBuyIn = 74;
  const pool = getPlanningAreaBlockPool(journey.areaId);
  applySelectedBlockImpact(journey, pool[0], 'access', null, [pool[1], pool[2]]);

  resolveEvent(journey, { id: 'town_hall', title: 'Town Hall' }, {
    label: 'Hold it',
    effects: { relationships: 12 },
  });
  assert.equal(journey.plan.phase, 'stakeholder_review');
  assert.equal(journey.plan.stakeholderBuyIn, 74);

  const ui = makeUi();
  startDay(journey);
  await processAction({ ui, journey }, 'stakeholder', null);
  assert.equal(journey.plan.phase, 'ministerial_approval');
  assert.ok(ui.lines.some((line) => /District Manager next/.test(line)));
});

test('the cutblock priority decision is due once at the start of the analysis and only reopens by event', () => {
  const journey = makeJourney();
  assert.equal(isBlockSelectionDue(journey), false, 'not before the inventory is in');
  journey.plan.phase = 'analysis';
  assert.equal(isBlockSelectionDue(journey), true);
  const pool = getPlanningAreaBlockPool(journey.areaId);
  applySelectedBlockImpact(journey, pool[0], 'water', null, [pool[1], pool[2]]);
  assert.equal(isBlockSelectionDue(journey), false, 'locked');
  assert.equal(getPlanningLeadBlocks(journey).length, 3);
  assert.equal(journey.blockPlanning.nextSelectionDay, null);

  resolveEvent(journey, { id: 'block_reopened', title: 'Block Reopened' }, {
    label: 'Reopen',
    effects: { blockSelection: true },
  });
  assert.equal(isBlockSelectionDue(journey), true, 'an authored event reopens it');
});

test('the FOM water and road context is the worst block in the lead set', () => {
  const journey = makeJourney();
  const pool = getPlanningAreaBlockPool(journey.areaId);
  const area = journey.area;
  const ranked = [...pool].sort((a, b) => getPlanningBlockWaterContext(b, area, null).timingPressure - getPlanningBlockWaterContext(a, area, null).timingPressure);
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];
  assert.ok(getPlanningBlockWaterContext(worst, area, null).timingPressure > getPlanningBlockWaterContext(best, area, null).timingPressure);

  applySelectedBlockImpact(journey, best, 'timber', null, [worst]);
  const lead = getPlanningLeadWaterContext(journey, null);
  assert.equal(lead.block.id, worst.id, 'the set is held by its wettest block');
  const fom = syncFomStateFromActiveBlock(journey, null);
  assert.equal(fom.rawWaterGate, getPlanningBlockWaterContext(worst, area, null).gate);
  assert.match(fom.blockLabel, /,/, 'the FOM names the whole set');
});

test('a HOLD on the water gate clears to a WINDOW through the works in and about a stream review', async () => {
  const journey = makeJourney('skeena-nass');
  const season = { currentSeason: 'spring', year: 1 };
  const pool = getPlanningAreaBlockPool(journey.areaId);
  const held = pool.find((block) => getPlanningBlockWaterContext(block, journey.area, season).gate === 'hold');
  assert.ok(held, 'skeena-nass carries a HOLD block in spring');
  journey.plan.phase = 'analysis';
  journey.plan.dataCompleteness = 60;
  journey.plan.analysisQuality = 40;
  applySelectedBlockImpact(journey, held, 'water', season, []);
  const fom = syncFomStateFromActiveBlock(journey, season);
  assert.equal(fom.waterGate, 'hold');
  assert.match(fom.waterNote, /WSA s\.11/);

  const ui = makeUi();
  startDay(journey);
  await processAction({ ui, journey }, 'fom_review', season);
  assert.equal(journey.blockPlanning.fom.status, 'public_review');
  let days = 0;
  while (getEffectiveWaterGate(journey.blockPlanning.fom, getPlanningLeadWaterContext(journey, season)) === 'hold' && days < 6) {
    startDay(journey);
    await processAction({ ui, journey }, 'fom_review', season);
    days += 1;
  }
  assert.ok(days <= 3, `the review should clear within three FOM days, took ${days}`);
  assert.ok(journey.blockPlanning.fom.hydrologyReadiness >= WSA_REVIEW_READINESS);
  assert.equal(syncFomStateFromActiveBlock(journey, season).waterGate, 'watch');
  assert.ok(ui.lines.some((line) => /HOLD is now a WINDOW/.test(line)));
  const readiness = getPlanningSubmissionReadiness(journey, season);
  assert.ok(!readiness.reasons.some((reason) => /works in and about a stream review needed/.test(reason)));
});

test('the mission status is framed around the District Manager and lists the FOM as a gate', () => {
  const journey = makeJourney();
  let status = null;
  updatePlanningMissionStatus({ setMissionStatus(next) { status = next; } }, journey, null);
  assert.match(status.objective, /District Manager/);
  assert.equal(status.meter.label, 'DM readiness');
  assert.ok(status.checklist.some((item) => /^FOM /.test(item.label) && item.done === false));
  assert.ok(!JSON.stringify(status).match(/inister|abinet/));
});

test('heritage/referral load replaces reserve proximity on the block lines and in the engagement triage', () => {
  const journey = makeJourney();
  const pool = getPlanningAreaBlockPool(journey.areaId);
  const load = getPlanningBlockHeritageLoad(pool[0], journey.area);
  assert.ok(load.score >= 0 && load.score <= 100);
  assert.ok(['light', 'moderate', 'heavy'].includes(load.className));
  assert.ok(load.notes.some((note) => /AOA potential/.test(note)));

  const line = formatPlanningBlockPromptDescription(pool[0], journey.area, null);
  assert.match(line, /Heritage\/referral \d+/);
  assert.match(line, /Habitat \d+/);
  assert.ok(!/reserve nearby|\bFN \d+|\bEco \d+/.test(line));

  const evidence = formatPlanningBlockTriageEvidence(pool[0], 'community', pool.slice(0, 3), journey.area, null);
  assert.match(evidence, /heritage\/referral load \d+\/100/);
  assert.ok(!/reserve/.test(evidence));

  const triage = buildPlanningConstraintTriage(journey.areaId, journey.area, pool);
  const engagement = triage.options.find((option) => option.value === 'community');
  assert.equal(engagement.label, 'Engagement-led sequencing');
  assert.match(engagement.description, /heritage screen is clean/);
});
