import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlanningConstraintTriage,
  formatPlanningBlockPromptDescription,
  getPlanningBlockWaterContext,
  getPlanningTriageScrutinyDelta,
  rankPlanningBlockOptions,
} from '../js/data/planningBlocks.js';
import { getPlanningSubmissionReadiness } from '../js/modes/planning.js';
import { TuiGameController } from '../tui/controller.js';

function advanceFromSetupToFirstPlannerTask(controller) {
  controller.handleKey({ name: 'return' });
  controller.selectOption(0);
  controller.selectOption(0);
  controller.selectOption(0);
}

test('planner flow snapshots the selected role and area into the dashboard state', () => {
  const controller = new TuiGameController();

  advanceFromSetupToFirstPlannerTask(controller);

  const state = controller.getState();
  assert.equal(state.gameState.role.name, 'Strategic Planner');
  assert.equal(state.gameState.area.name, 'Fort St. John Plateau');
  assert.equal(state.gameState.round, 1);
});

test('planner tasks use prompt text when description is absent', () => {
  const controller = new TuiGameController();

  advanceFromSetupToFirstPlannerTask(controller);

  const state = controller.getState();
  assert.equal(state.contentData.type, 'task');
  assert.equal(state.contentData.title, 'Landscape Assessment');
  assert.match(state.contentData.description, /five-year plan is due/i);
});

test('planner option selection updates the dashboard metrics in the controller snapshot', () => {
  const controller = new TuiGameController();

  advanceFromSetupToFirstPlannerTask(controller);
  controller.selectOption(0);

  const state = controller.getState();
  assert.equal(state.contentData.type, 'task');
  assert.equal(state.gameState.metrics.progress, 59);
  assert.equal(state.gameState.metrics.forestHealth, 48);
  assert.equal(state.gameState.metrics.compliance, 48);
  assert.match(state.contentData.notice.heading, /^Decision Logged:/);
  assert.match(state.contentData.notice.body, /Effects:/);
});

test('planning triage highlights the dominant area constraint and puts it first', () => {
  const area = {
    id: 'skeena-nass',
    name: 'Skeena-Nass Transition',
    tags: ['cwh', 'karst', 'salmon', 'community-water'],
    zoneSummary: 'Very wet CWH valleys where fish-bearing crossings, saturated slopes, and karst hydrology drive the job.',
  };
  const blocks = [
    {
      id: 'water-heavy-1',
      sourceType: 'planned-cutblock',
      timberMark: 'A',
      cutBlockId: '1',
      adminDistrict: 'Skeena NRD',
      areaHa: 12.4,
      metrics: {
        timberOpportunity: 44,
        biodiversitySensitivity: 66,
        firstNationsSensitivity: 18,
        technicalComplexity: 24,
      },
      indicators: {
        ogmaNearby: true,
        whaNoHarvestNearby: false,
        speciesAtRiskNearby: false,
        firstNationsReserveNearby: false,
      },
    },
    {
      id: 'water-heavy-2',
      sourceType: 'planned-cutblock',
      timberMark: 'B',
      cutBlockId: '2',
      adminDistrict: 'Skeena NRD',
      areaHa: 9.1,
      metrics: {
        timberOpportunity: 39,
        biodiversitySensitivity: 58,
        firstNationsSensitivity: 20,
        technicalComplexity: 18,
      },
      indicators: {
        ogmaNearby: false,
        whaNoHarvestNearby: true,
        speciesAtRiskNearby: false,
        firstNationsReserveNearby: false,
      },
    },
  ];

  const triage = buildPlanningConstraintTriage(area.id, area, blocks);

  assert.equal(triage.recommendedKey, 'water');
  assert.equal(triage.options[0].value, 'water');
  assert.match(triage.summary, /karst hydrology/i);
  assert.match(formatPlanningBlockPromptDescription(blocks[0], area, { currentSeason: 'spring' }), /Water HOLD/i);
  assert.ok(getPlanningTriageScrutinyDelta('water') < 0);
  assert.ok(getPlanningTriageScrutinyDelta('timber') > 0);
});

test('planning triage ranking shifts block order toward the chosen handling style', () => {
  const area = {
    id: 'fort-st-john-plateau',
    name: 'Fort St. John Plateau',
    tags: ['bwbs', 'peace-region', 'peatland', 'gas-interface', 'winter-road'],
  };
  const blocks = [
    {
      id: 'access-easy',
      sourceType: 'planned-cutblock',
      timberMark: 'C',
      cutBlockId: '1',
      metrics: {
        timberOpportunity: 46,
        biodiversitySensitivity: 34,
        firstNationsSensitivity: 18,
        technicalComplexity: 7,
      },
      indicators: {},
    },
    {
      id: 'timber-strong',
      sourceType: 'planned-cutblock',
      timberMark: 'D',
      cutBlockId: '1',
      metrics: {
        timberOpportunity: 85,
        biodiversitySensitivity: 30,
        firstNationsSensitivity: 20,
        technicalComplexity: 28,
      },
      indicators: {},
    },
  ];

  assert.equal(rankPlanningBlockOptions(blocks, 'access', area)[0].id, 'access-easy');
  assert.equal(rankPlanningBlockOptions(blocks, 'timber', area)[0].id, 'timber-strong');
});

test('planning water context holds community watershed blocks and blocks submission until FOM review clears', () => {
  const area = {
    id: 'skeena-nass',
    name: 'Skeena-Nass Transition',
    tags: ['cwh', 'karst', 'salmon', 'community-water'],
    zoneSummary: 'Very wet CWH valleys where fish-bearing crossings, saturated slopes, and karst hydrology drive the job.',
  };
  const block = {
    id: 'water-review-1',
    sourceType: 'planned-cutblock',
    timberMark: 'E',
    cutBlockId: '1',
    adminDistrict: 'Skeena NRD',
    areaHa: 12.1,
    plannedHarvestDate: '2026-04-18',
    indicators: {
      ogmaNearby: true,
      whaNoHarvestNearby: true,
      speciesAtRiskNearby: false,
      firstNationsReserveNearby: false,
    },
    metrics: {
      timberOpportunity: 50,
      biodiversitySensitivity: 60,
      firstNationsSensitivity: 20,
      technicalComplexity: 24,
    },
    valueEffects: {
      biodiversity: 1,
      timberSupply: 1,
      communityNeeds: 0,
      firstNationsValues: 1,
    },
    summary: 'Water-sensitive block in a community watershed',
  };
  const season = { currentSeason: 'spring', year: 1 };

  const water = getPlanningBlockWaterContext(block, area, season);
  assert.equal(water.gate, 'hold');
  assert.match(water.note, /community watershed hydrology/i);
  assert.equal(rankPlanningBlockOptions([block, { ...block, id: 'water-review-2', plannedHarvestDate: '2026-08-18', indicators: { ogmaNearby: false, whaNoHarvestNearby: false, speciesAtRiskNearby: false, firstNationsReserveNearby: false } }], 'water', area, season)[0].plannedHarvestDate, '2026-08-18');
  assert.match(formatPlanningBlockPromptDescription(block, area, season), /Water HOLD/i);

  const journey = {
    area,
    season,
    plan: {
      phase: 'ministerial_approval',
      ministerialConfidence: 62,
    },
    resources: {
      budget: 50000,
      politicalCapital: 10,
      dataCredits: 10,
    },
    values: {
      biodiversity: 60,
      timberSupply: 60,
      communityNeeds: 60,
      firstNationsValues: 60,
    },
    scrutiny: 25,
    blockPlanning: {
      activeBlock: block,
      fom: {
        status: 'draft',
        reviewDaysRemaining: water.reviewDays,
        commentLoad: water.commentCount,
      },
    },
  };

  const readiness = getPlanningSubmissionReadiness(journey, season);
  assert.equal(readiness.ready, false);
  assert.match(readiness.reasons.join(' | '), /FOM is draft/i);
  assert.match(readiness.reasons.join(' | '), /working-around-water/i);
});

test('planning readiness blocks direct severe road observations with road-engineering reasons', () => {
  const area = {
    id: 'fort-st-john-plateau',
    name: 'Fort St. John Plateau',
    tags: ['bwbs', 'peace-region', 'winter-road'],
  };
  const block = {
    id: 'road-block-severe',
    sourceType: 'planned-cutblock',
    timberMark: 'F',
    cutBlockId: '3',
    adminDistrict: 'Peace NRD',
    areaHa: 11.2,
    plannedHarvestDate: '2026-08-18',
    indicators: {
      ogmaNearby: false,
      whaNoHarvestNearby: false,
      speciesAtRiskNearby: false,
      firstNationsReserveNearby: false,
    },
    metrics: {
      timberOpportunity: 56,
      biodiversitySensitivity: 33,
      firstNationsSensitivity: 18,
      technicalComplexity: 21,
    },
    valueEffects: {
      biodiversity: 0,
      timberSupply: 1,
      communityNeeds: 0,
      firstNationsValues: 0,
    },
    summary: 'Access block with a severe road observation',
  };
  const season = { currentSeason: 'summer', year: 1 };

  const journey = {
    area,
    season,
    plan: {
      phase: 'ministerial_approval',
      ministerialConfidence: 86,
    },
    resources: {
      budget: 50000,
      politicalCapital: 10,
      dataCredits: 10,
    },
    values: {
      biodiversity: 60,
      timberSupply: 60,
      communityNeeds: 60,
      firstNationsValues: 60,
    },
    scrutiny: 25,
    blockPlanning: {
      activeBlock: block,
      activeSummary: block.summary,
      fom: {
        status: 'approved',
        activeBlockId: block.id,
        reviewDaysRemaining: 0,
        commentLoad: 0,
      },
    },
    roadAssets: {
      byBlock: {
        [block.id]: {
          blockId: block.id,
          roadLifecycleId: 'out_of_service',
          roadLifecycleLabel: 'Out of Service',
          crossingConditionId: 'restricted',
          crossingConditionLabel: 'Restricted',
          watershedPressureId: 'critical',
          watershedPressureLabel: 'Critical',
          day: 12,
        },
      },
      observations: [],
    },
  };

  const readiness = getPlanningSubmissionReadiness(journey, season);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.roadContext.blocker, true);
  assert.equal(readiness.roadContext.source, 'block');
  assert.match(readiness.reasons.join(' | '), /road-engineering blocker/i);
  assert.match(readiness.reasons.join(' | '), /out of service|restricted/i);
});

test('planning readiness carries forward area-level road intel without blocking submission', () => {
  const area = {
    id: 'bulkley-valley',
    name: 'Bulkley Valley',
    tags: ['bess', 'forest', 'winter-road'],
  };
  const block = {
    id: 'road-block-soft',
    sourceType: 'planned-cutblock',
    timberMark: 'G',
    cutBlockId: '4',
    adminDistrict: 'Bulkley NRD',
    areaHa: 9.6,
    plannedHarvestDate: '2026-08-18',
    indicators: {
      ogmaNearby: false,
      whaNoHarvestNearby: false,
      speciesAtRiskNearby: false,
      firstNationsReserveNearby: false,
    },
    metrics: {
      timberOpportunity: 53,
      biodiversitySensitivity: 31,
      firstNationsSensitivity: 19,
      technicalComplexity: 17,
    },
    valueEffects: {
      biodiversity: 0,
      timberSupply: 1,
      communityNeeds: 0,
      firstNationsValues: 0,
    },
    summary: 'Block with carried-forward road intel',
  };
  const season = { currentSeason: 'summer', year: 1 };

  const journey = {
    area,
    season,
    plan: {
      phase: 'ministerial_approval',
      ministerialConfidence: 86,
    },
    resources: {
      budget: 50000,
      politicalCapital: 10,
      dataCredits: 10,
    },
    values: {
      biodiversity: 60,
      timberSupply: 60,
      communityNeeds: 60,
      firstNationsValues: 60,
    },
    scrutiny: 25,
    blockPlanning: {
      activeBlock: block,
      activeSummary: block.summary,
      fom: {
        status: 'approved',
        activeBlockId: block.id,
        reviewDaysRemaining: 0,
        commentLoad: 0,
      },
    },
    roadAssets: {
      observations: [
        {
          blockId: 'adjacent-road-1',
          roadLifecycleId: 'repair_needed',
          roadLifecycleLabel: 'Repair Needed',
          crossingConditionId: 'timing_sensitive',
          crossingConditionLabel: 'Timing Sensitive',
          watershedPressureId: 'watch',
          watershedPressureLabel: 'Watch',
          day: 12,
        },
      ],
      byBlock: {},
    },
  };

  const readiness = getPlanningSubmissionReadiness(journey, season);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.roadContext.source, 'area');
  assert.ok(readiness.fom.roadEngineeringReadiness < 100);
  assert.match(readiness.fom.roadNote, /carry-forward access intel/i);
});
