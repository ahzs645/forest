import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlanningConstraintTriage,
  formatPlanningBlockPromptDescription,
  getPlanningBlockWaterContext,
  getPlanningTriageScrutinyDelta,
  rankPlanningBlockOptions,
} from '../js/data/planningBlocks.js';
import { ILLEGAL_ACTS } from '../js/data/illegalActs.js';
import {
  adaptIllegalActTemptation,
  applyOptionOutcome,
  createInitialState,
  drawIssue,
} from '../js/engine.js';
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

test('planner start-of-season flow now surfaces a source-backed assignment card', () => {
  const controller = new TuiGameController();

  advanceFromSetupToFirstPlannerTask(controller);

  const state = controller.getState();
  assert.equal(state.contentData.type, 'assignment');
  assert.equal(state.contentData.sourceLabel, 'Role-Area Briefing');
  assert.ok(state.contentData.whyNow);
  assert.ok(state.contentData.description.length > 20);
});

test('planner assignment cards expose source metadata in the controller snapshot', () => {
  const controller = new TuiGameController();

  advanceFromSetupToFirstPlannerTask(controller);

  const state = controller.getState();
  assert.equal(state.gameState.assignmentHistory.length, 1);
  assert.equal(state.gameState.currentSeasonContext.selectedAssignment.sourceFamily, 'briefing');
  assert.equal(state.gameState.currentSeasonContext.selectedAssignment.sourceLabel, 'Role-Area Briefing');
});

test('planner assignment selection updates the dashboard metrics in the controller snapshot', () => {
  const controller = new TuiGameController();

  advanceFromSetupToFirstPlannerTask(controller);
  controller.selectOption(0);

  const state = controller.getState();
  assert.equal(state.gameState.metrics.progress, 50);
  assert.equal(state.gameState.metrics.relationships, 52);
  assert.equal(state.gameState.metrics.compliance, 53);
  assert.match(state.contentData.notice.heading, /^Decision Logged:/);
  assert.match(state.contentData.notice.body, /Compliance \+3/);
  assert.match(state.contentData.notice.body, /Relationships \+2/);
});

test('seasonal role picker excludes manager and keeps the Field Technician label', () => {
  const controller = new TuiGameController();

  controller.handleKey({ name: 'return' });

  let state = controller.getState();
  assert.equal(state.mode, 'setup-role');
  assert.ok(state.options.includes('Field Technician'));
  assert.ok(!state.options.includes('General Manager'));
  assert.equal(state.selected, 0);

  controller.handleKey({ name: 'down' });
  state = controller.getState();
  assert.equal(state.selected, 1);

  controller.handleKey({ name: 'up' });
  state = controller.getState();
  assert.equal(state.selected, 0);

  controller.handleKey({ name: 'return' });
  state = controller.getState();
  assert.equal(state.mode, 'setup-area');
});

test('role picker exposes the crisis command game mode without displacing seasonal roles', () => {
  const controller = new TuiGameController();

  controller.handleKey({ name: 'return' });

  const state = controller.getState();
  assert.equal(state.options[0], 'Strategic Planner');
  assert.ok(state.options.includes('BC Forestry Simulator: Crisis Command'));
});

test('crisis command starts the Williams Lake beetle scenario with map and reused area intel', () => {
  const controller = new TuiGameController();

  controller.handleKey({ name: 'return' });
  const crisisIndex = controller.getState().options.indexOf('BC Forestry Simulator: Crisis Command');
  controller.selectOption(crisisIndex);

  const state = controller.getState();
  assert.equal(state.mode, 'playing');
  assert.equal(state.gameState.gameMode, 'crisis-command');
  assert.equal(state.gameState.roleDisplayName, 'Incident Commander');
  assert.equal(state.gameState.area.name, 'Fraser Plateau Uplands');
  assert.equal(state.contentData.type, 'scenario');
  assert.match(state.contentData.title, /Pine Beetle Outbreak/);
  assert.match(state.contentData.map, /BEETLE/);
  assert.ok(state.contentData.intelLines.some((line) => line.includes('SBSwk1')));
  assert.ok(state.contentData.optionDetails.length >= 5);
});

test('crisis command choices advance metrics and end at a crisis debrief', () => {
  const controller = new TuiGameController();

  controller.handleKey({ name: 'return' });
  controller.selectOption(controller.getState().options.indexOf('BC Forestry Simulator: Crisis Command'));

  for (let i = 0; i < 4; i += 1) {
    assert.equal(controller.getState().contentData.type, 'scenario');
    controller.selectOption(0);
  }

  const state = controller.getState();
  assert.equal(state.contentData.type, 'summary');
  assert.match(state.contentData.heading, /^Crisis Debrief/);
  assert.equal(state.gameState.crisis.commandLog.length, 4);
  assert.deepEqual(state.options, ['Play Again', 'Quit']);
});

test('first playable seasonal card exposes the contract fields and neutral prompt', () => {
  const controller = new TuiGameController();

  advanceFromSetupToFirstPlannerTask(controller);

  let state = controller.getState();
  assert.equal(state.contentData.type, 'assignment');
  assert.ok(state.contentData.context?.operation);
  assert.ok(state.contentData.context?.objective);
  assert.ok(state.contentData.context?.stakes);
  assert.match(state.contentData.decisionPrompt || '', /^How do you want to respond\?$/i);
  assert.equal(state.contentData.optionHeading, 'Choose your response');
  assert.equal(state.art, null);
  assert.ok(state.options.length > 1);

  controller.handleKey({ name: 'down' });
  state = controller.getState();
  assert.equal(state.selected, 1);

  controller.handleKey({ name: 'up' });
  state = controller.getState();
  assert.equal(state.selected, 0);
});

test('controller suppresses impossible seasonal issue states', () => {
  const state = createInitialState({
    companyName: 'Suppressed Seasonal State Test',
    roleId: 'silviculture',
    areaId: 'muskwa-foothills',
  });
  state.round = 1;
  state.pendingIssues = [
    {
      delay: 0,
      candidates: [
        {
          id: 'free-growing-catchup-plan',
          weight: 1,
        },
      ],
    },
  ];

  const issue = drawIssue(state, () => 0);

  assert.notEqual(issue?.id, 'free-growing-catchup-plan');
  assert.equal(state.pendingIssues.length, 0);
});

test('end-of-year summary can restart and quit cleanly', () => {
  let exits = 0;
  const controller = new TuiGameController({
    onExit: () => {
      exits += 1;
    },
  });

  controller.gs = createInitialState({
    companyName: 'Controller Summary Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  controller.gs.round = controller.gs.totalRounds;
  controller.queue = [];
  controller.processNext();

  let state = controller.getState();
  assert.equal(state.contentData.type, 'summary');
  assert.deepEqual(state.options, ['Play Again', 'Quit']);

  controller.selectOption(0);
  state = controller.getState();
  assert.equal(state.mode, 'setup-name');
  assert.equal(state.contentData.heading, 'Welcome to BC Forestry Trail');
  assert.deepEqual(state.options, []);

  controller.gs = createInitialState({
    companyName: 'Controller Summary Quit Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  controller.gs.round = controller.gs.totalRounds;
  controller.queue = [];
  controller.processNext();
  controller.selectOption(1);

  assert.equal(exits, 1);
});

test('scheduled fallout issues expose why they surfaced in the issue card', () => {
  const controller = new TuiGameController();
  const gs = createInitialState({
    companyName: 'Controller Fallout Test',
    roleId: 'permitter',
    areaId: 'bulkley-valley',
  });
  gs.round = 1;
  gs.metrics.relationships = 20;

  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'courtesy-flag-bribes');
  const temptation = adaptIllegalActTemptation(act, gs, () => 0.5);
  const riskyOption = temptation.options.find((option) => option.risk);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    applyOptionOutcome(gs, riskyOption, {
      type: 'temptation',
      id: temptation.id,
      title: temptation.title,
      option: riskyOption.label,
      round: gs.round,
    });
  } finally {
    Math.random = originalRandom;
  }

  const issue = drawIssue(gs, () => 0);
  controller.gs = gs;
  controller.queue = [{ type: 'issue', data: issue }];
  controller.processNext();

  const state = controller.getState();
  assert.equal(state.contentData.type, 'issue');
  assert.equal(state.contentData.title, 'Heritage Protocol Gap Identified');
  assert.equal(state.contentData.surfaceSeverity, 'warning');
  assert.match(state.contentData.surfaceReason || '', /relationship damage/i);
});

test('temptation outcome notices preview the most likely fallout branch', () => {
  const controller = new TuiGameController();
  const gs = createInitialState({
    companyName: 'Controller Notice Test',
    roleId: 'permitter',
    areaId: 'bulkley-valley',
  });
  gs.round = 1;
  gs.metrics.relationships = 20;

  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'courtesy-flag-bribes');
  const temptation = adaptIllegalActTemptation(act, gs, () => 0.5);
  const riskIndex = temptation.options.findIndex((option) => option.risk);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    controller.gs = gs;
    controller.queue = [
      { type: 'temptation', data: temptation },
      { type: 'message', text: 'Checkpoint', body: 'Queued phase for notice capture.' },
    ];
    controller.processNext();
    controller.selectOption(riskIndex);
  } finally {
    Math.random = originalRandom;
  }

  const state = controller.getState();
  assert.equal(state.contentData.type, 'message');
  assert.match(state.contentData.notice?.heading || '', /^Caught:/);
  assert.equal(state.contentData.notice?.tone, 'warning');
  assert.match(state.contentData.notice?.body || '', /Likely fallout \(manageable\): Heritage Protocol Gap Identified/i);
  assert.match(state.contentData.notice?.body || '', /relationship damage/i);
});

test('serious fallout previews keep danger tone on the outcome notice', () => {
  const controller = new TuiGameController();
  const gs = createInitialState({
    companyName: 'Controller Serious Notice Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  gs.round = 1;
  gs.metrics.compliance = 20;

  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'trespass-lidar-raid');
  const temptation = adaptIllegalActTemptation(act, gs, () => 0.5);
  const riskIndex = temptation.options.findIndex((option) => option.risk);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    controller.gs = gs;
    controller.queue = [
      { type: 'temptation', data: temptation },
      { type: 'message', text: 'Checkpoint', body: 'Queued phase for notice capture.' },
    ];
    controller.processNext();
    controller.selectOption(riskIndex);
  } finally {
    Math.random = originalRandom;
  }

  const state = controller.getState();
  assert.equal(state.contentData.type, 'message');
  assert.equal(state.contentData.notice?.tone, 'danger');
  assert.match(state.contentData.notice?.body || '', /Likely fallout \(serious\): Formal Investigation/i);
});

test('serious fallout issues carry danger severity on the issue card', () => {
  const controller = new TuiGameController();
  const gs = createInitialState({
    companyName: 'Controller Serious Issue Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  gs.round = 1;
  gs.metrics.compliance = 20;

  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'trespass-lidar-raid');
  const temptation = adaptIllegalActTemptation(act, gs, () => 0.5);
  const riskyOption = temptation.options.find((option) => option.risk);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    applyOptionOutcome(gs, riskyOption, {
      type: 'temptation',
      id: temptation.id,
      title: temptation.title,
      option: riskyOption.label,
      round: gs.round,
    });
  } finally {
    Math.random = originalRandom;
  }

  const issue = drawIssue(gs, () => 0);
  controller.gs = gs;
  controller.queue = [{ type: 'issue', data: issue }];
  controller.processNext();

  const state = controller.getState();
  assert.equal(state.contentData.type, 'issue');
  assert.equal(state.contentData.title, 'Formal Investigation');
  assert.equal(state.contentData.surfaceSeverity, 'danger');
  assert.equal(state.contentData.cardLabel, 'Operational issue');
  assert.equal(state.contentData.optionHeading, 'Choose your response');
  assert.equal(state.contentData.optionTone, 'danger');
  assert.deepEqual(state.options, [
    'Open the file now',
    'Lawyer up and freeze comms',
    'Burn a subcontractor',
  ]);
  assert.deepEqual(
    state.contentData.optionDetails.map((option) => option.outcome),
    [
      'You hand over the record immediately and absorb the hit now to keep the case from turning into charges.',
      'Counsel slows the investigators, but the meter runs hard and the file stays fully live.',
      'You try to redirect the blast radius, but the story frays fast and the investigation widens.',
    ],
  );
});

test('serious fallout rounds suppress routine task flow and surface the crisis issue first', () => {
  const controller = new TuiGameController();
  const gs = createInitialState({
    companyName: 'Controller Crisis Round Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  gs.round = 0;
  gs.metrics.compliance = 20;
  gs.pendingIssues = [{
    delay: 0,
    force: true,
    candidates: [
      {
        id: 'formal-investigation',
        weight: 3,
        force: true,
        metricBoosts: { compliance: 2, relationships: 1.5 },
      },
    ],
  }];

  controller.gs = gs;
  controller.startRound();

  let state = controller.getState();
  assert.equal(state.contentData.type, 'message');
  assert.match(state.contentData.body || '', /critical matter overrides routine work/i);

  controller.selectOption(0);
  state = controller.getState();

  assert.equal(state.contentData.type, 'issue');
  assert.equal(state.contentData.title, 'Formal Investigation');
  assert.equal(state.contentData.cardLabel, 'Operational issue');
  assert.equal(state.contentData.optionHeading, 'Choose your response');
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
    roleId: 'planner',
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
    professional: {
      registrationStatus: 'active',
      cpdHours: 30,
      cpdTarget: 30,
      competenceRisk: 18,
      paperworkLoad: 8,
      auditExposure: 8,
    },
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
    roleId: 'planner',
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
    professional: {
      registrationStatus: 'active',
      cpdHours: 30,
      cpdTarget: 30,
      competenceRisk: 18,
      paperworkLoad: 8,
      auditExposure: 8,
    },
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
    roleId: 'planner',
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
    professional: {
      registrationStatus: 'active',
      cpdHours: 30,
      cpdTarget: 30,
      competenceRisk: 18,
      paperworkLoad: 8,
      auditExposure: 8,
    },
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
