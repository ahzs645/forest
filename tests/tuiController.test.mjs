import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlanningConstraintTriage,
  formatPlanningBlockPromptDescription,
  getPlanningTriageScrutinyDelta,
  rankPlanningBlockOptions,
} from '../js/data/planningBlocks.js';
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
  assert.match(formatPlanningBlockPromptDescription(blocks[0], area), /Constraints/i);
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
