import test from 'node:test';
import assert from 'node:assert/strict';

import { TuiGameController } from '../tui/controller.js';

// Drive setup → first season opening card (planner, first area). Stops on the
// round-1 opening message rather than clicking through to the assignment.
function advanceToFirstSeasonMessage(controller) {
  controller.handleKey({ name: 'return' }); // company name -> role select
  controller.selectOption(0); // planner -> area select
  controller.selectOption(0); // area -> startRound, lands on the opening message
}

test('the first season opening card carries a mission briefing', () => {
  const controller = new TuiGameController({ storage: null });

  advanceToFirstSeasonMessage(controller);

  const { contentData } = controller.getState();
  assert.equal(contentData.type, 'message');
  assert.ok(contentData.mission, 'expected a mission payload on the opening card');
  assert.ok(contentData.mission.goal.length > 10);
  assert.ok(Array.isArray(contentData.mission.steps) && contentData.mission.steps.length >= 2);
  // The win line is pulled from the role objective system.
  assert.ok(contentData.mission.win, 'expected a signature win line for the role');
});

test('decision cards expose a season + stakes headline', () => {
  const controller = new TuiGameController({ storage: null });

  advanceToFirstSeasonMessage(controller);
  controller.selectOption(0); // clear the opening message -> first assignment

  const { contentData } = controller.getState();
  assert.equal(contentData.type, 'assignment');
  assert.ok(contentData.headline, 'expected a headline on the decision card');
  assert.match(contentData.headline, /^Spring:/);
});

test('the decision trail grows with each logged choice and its effects', () => {
  const controller = new TuiGameController({ storage: null });

  advanceToFirstSeasonMessage(controller);
  controller.selectOption(0); // opening message -> assignment

  assert.equal(controller.getState().gameState.decisionTrail.length, 0);

  controller.selectOption(0); // make the first real decision

  const trail = controller.getState().gameState.decisionTrail;
  assert.ok(trail.length >= 1, 'expected the trail to record the choice');
  const newest = trail[0];
  assert.ok(['choice', 'fallout'].includes(newest.kind));
  assert.ok(newest.option || newest.title, 'expected a label on the trail entry');
});
