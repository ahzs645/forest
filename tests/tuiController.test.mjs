import test from 'node:test';
import assert from 'node:assert/strict';

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
  assert.equal(state.contentData.type, 'message');
  assert.equal(state.gameState.metrics.progress, 59);
  assert.equal(state.gameState.metrics.forestHealth, 48);
  assert.equal(state.gameState.metrics.compliance, 48);
});
