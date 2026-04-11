import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLegacyTaskFallback,
  buildSeasonContext,
  createInitialState,
  drawSeasonalAssignment,
  recordAssignmentSelection,
} from '../js/engine.js';

function createMockState(roleId) {
  return {
    round: 1,
    role: {
      id: roleId,
      tasks: [
        {
          id: 'legacy-a',
          title: 'Legacy Assignment A',
          prompt: 'Fallback assignment A',
          options: [{ label: 'A', outcome: 'A', effects: { progress: 1 } }],
        },
        {
          id: 'legacy-b',
          title: 'Legacy Assignment B',
          prompt: 'Fallback assignment B',
          options: [{ label: 'B', outcome: 'B', effects: { progress: 1 } }],
        },
      ],
    },
    area: {
      id: 'test-area',
      name: 'Test Area',
      zoneSummary: 'Synthetic area for assignment routing tests.',
      tags: ['community-interface', 'salmon'],
    },
    metrics: {
      progress: 40,
      forestHealth: 50,
      relationships: 45,
      compliance: 42,
      budget: 38,
    },
    professional: {
      paperworkLoad: 62,
      auditExposure: 54,
      competenceRisk: 31,
      areaBurdenLabel: 'Synthetic burden',
    },
    assignmentHistory: [],
    assignmentSourceUsage: {},
    currentSeasonContext: null,
    seasonContexts: [],
    discoveryTags: [],
  };
}

function createRichContext(roleId, theme, season = 'spring') {
  return {
    round: 1,
    season,
    theme,
    roleId,
    areaId: 'test-area',
    metricPressure: {
      progress: 40,
      forestHealth: 50,
      relationships: 45,
      compliance: 42,
      budget: 38,
    },
    briefing: {
      zoneSummary: 'Synthetic zone summary',
      seasonalSignals: ['Signal one', 'Signal two', 'Signal three', 'Signal four'],
      likelyFinds: ['Briefing finding one', 'Briefing finding two'],
    },
    areaSituation: {
      id: 'bulkley_visual_backlash',
      title: 'Visual backlash',
      summary: 'Visible ground is carrying a stronger-than-usual public optics burden.',
      areaTags: ['community-interface'],
    },
    areaSituationMultipliers: {
      desk: { eventMultiplier: 1.1, typeMultipliers: { stakeholder: 1.2 } },
      field: { eventMultiplier: 1.1, typeMultipliers: { terrain: 1.2 } },
    },
    professionalContext: {
      paperwork: [
        {
          id: 'cutting-permit-admin',
          title: 'Cutting Permit Administration',
          summary: 'Permit files keep drifting as status changes land faster than clean updates.',
          category: 'permit-administration',
          failureModes: [{ id: 'fom-consistency-gap' }],
          sourceLabel: 'Cutting Permit and Road Tenure Administration',
        },
      ],
      breaches: [
        {
          id: 'fpbc-competence-audit',
          title: 'Competence audit pattern',
          summary: 'Competence and declaration gaps are starting to look systemic.',
          processHookTitle: 'Competence declaration',
          sourceLabel: 'FPBC practice controls',
        },
      ],
      chains: [
        {
          id: 'fom-notice-cycle',
          title: 'FOM Notice -> Comment -> Submission',
          sourceLabel: 'Forest Operations Map',
          hookIds: ['fom-notice-cycle'],
        },
      ],
    },
    paperworkProgress: [
      {
        chain: {
          id: 'fom-notice-cycle',
          title: 'FOM Notice -> Comment -> Submission',
          sourceLabel: 'Forest Operations Map',
          hookIds: ['fom-notice-cycle'],
        },
        stage: {
          id: 'notice',
          label: 'Post FOM notice and preserve proof',
          description: 'Open the public notice cycle cleanly.',
          paperworkRelief: 6,
          auditRelief: 4,
        },
        completed: false,
        remainingStages: 3,
      },
    ],
    planningSnapshot: {
      blockCount: 3,
      recommendedTriageKey: 'water',
      recommendedTriageLabel: 'Water-first triage',
      sampleBlocks: [
        {
          id: 'blk-1',
          label: 'Block 1',
          summary: 'A water-sensitive sample block.',
          district: 'Test District',
          species: 'Sx',
        },
      ],
      generatedOn: '2026-04-10',
    },
    planningRoadContext: {
      hasData: true,
      source: 'area',
      summary: 'Hydrology and crossing notes are still shaping the file.',
      note: 'Carry-forward access intel: hydrology and crossing issues are still shaping the file.',
      engineeringPressure: 2,
      hydrologyPressure: 2,
      timingPressure: 1,
      reviewDays: 2,
    },
    permittingRoadContext: {
      hasData: true,
      summary: 'Road and crossing observations are adding engineering pressure to the file.',
      engineering: 2,
      hydrology: 2,
      timing: 1,
      dominantProfileId: 'package-completeness',
      approvalPenalty: 2,
    },
    discoveryTags: [
      {
        id: 'watershed_watch',
        label: 'Watershed watch',
        summary: 'Water detail is sensitive enough to keep carrying forward.',
        severity: 3,
        count: 1,
        definition: {
          roleNotes: {
            [roleId]: 'The file needs stronger watershed and crossing language.',
          },
        },
      },
    ],
    discoveryMultipliers: {
      desk: { technical: 1.2 },
      field: { terrain: 1.2 },
    },
  };
}

test('seasonal assignment selection honors the exact role/theme priority matrix when all families are available', () => {
  const expectations = [
    ['planner', 'foundation', 'briefing'],
    ['planner', 'operations', 'planning'],
    ['planner', 'pressure', 'process'],
    ['planner', 'closeout', 'professional'],
    ['permitter', 'foundation', 'briefing'],
    ['permitter', 'operations', 'process'],
    ['permitter', 'pressure', 'process'],
    ['permitter', 'closeout', 'professional'],
    ['recce', 'foundation', 'briefing'],
    ['recce', 'operations', 'road'],
    ['recce', 'pressure', 'discovery'],
    ['recce', 'closeout', 'professional'],
    ['silviculture', 'foundation', 'briefing'],
    ['silviculture', 'operations', 'discovery'],
    ['silviculture', 'pressure', 'discovery'],
    ['silviculture', 'closeout', 'professional'],
  ];

  for (const [roleId, theme, expectedFamily] of expectations) {
    const state = createMockState(roleId);
    const context = createRichContext(roleId, theme);
    state.currentSeasonContext = context;

    const assignment = drawSeasonalAssignment(state, context);

    assert.ok(assignment, `missing assignment for ${roleId}/${theme}`);
    assert.equal(
      assignment.sourceFamily,
      expectedFamily,
      `unexpected family for ${roleId}/${theme}`,
    );
  }
});

test('source-driven assignments produce one unique assignment per season across a four-season year', () => {
  const state = createInitialState({
    companyName: 'Seasonal Assignment Coverage',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });

  const keys = new Set();
  for (let round = 1; round <= 4; round++) {
    state.round = round;
    const context = buildSeasonContext(state);
    state.currentSeasonContext = context;

    const assignment = drawSeasonalAssignment(state, context);
    assert.ok(assignment, `expected assignment in round ${round}`);
    assert.ok(!keys.has(assignment.assignmentKey), `duplicate assignment key in round ${round}`);

    keys.add(assignment.assignmentKey);
    recordAssignmentSelection(state, assignment);
  }

  assert.equal(keys.size, 4);
});

test('legacy fallback uses an unseen role task once and then stops for the rest of the year', () => {
  const state = createMockState('planner');
  const emptyContext = {
    round: 1,
    season: 'spring',
    theme: 'foundation',
    roleId: 'planner',
    areaId: 'test-area',
    metricPressure: { ...state.metrics },
    briefing: { likelyFinds: [] },
    professionalContext: { paperwork: [], breaches: [], chains: [] },
    paperworkProgress: [],
    planningSnapshot: null,
    planningRoadContext: { hasData: false },
    permittingRoadContext: { hasData: false },
    discoveryTags: [],
    areaSituation: null,
    areaSituationMultipliers: { desk: { eventMultiplier: 1, typeMultipliers: {} }, field: { eventMultiplier: 1, typeMultipliers: {} } },
    discoveryMultipliers: { desk: {}, field: {} },
  };
  state.currentSeasonContext = emptyContext;

  const firstFallback = buildLegacyTaskFallback(state, emptyContext);
  assert.ok(firstFallback);
  assert.equal(firstFallback.sourceFamily, 'legacy-task');
  assert.equal(firstFallback.sourceKey, 'task:legacy-a');

  recordAssignmentSelection(state, firstFallback);

  const secondFallback = buildLegacyTaskFallback(state, emptyContext);
  assert.equal(secondFallback, null);
});
