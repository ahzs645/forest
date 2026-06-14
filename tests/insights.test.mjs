import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  applyRoundConsequences,
  buildRoleLens,
  buildSeasonHeadline,
  computeManagementStyle,
  describeConsequences,
} from '../js/engine.js';

function makeState(roleId = 'planner') {
  return createInitialState({
    companyName: 'Test Outfit',
    roleId,
    areaId: 'fort-st-john-plateau',
  });
}

test('computeManagementStyle reads the dominant stance from chosen decisions', () => {
  const state = makeState();
  assert.equal(computeManagementStyle(state).total, 0);

  state.history.push({ type: 'assignment', stance: 'cautious', effects: {}, round: 1 });
  state.history.push({ type: 'assignment', stance: 'cautious', effects: {}, round: 1 });
  state.history.push({ type: 'assignment', stance: 'aggressive', effects: {}, round: 2 });

  const style = computeManagementStyle(state);
  assert.equal(style.dominant, 'cautious');
  assert.equal(style.label, 'Cautious Steward');
  assert.equal(style.total, 3);
  assert.deepEqual(style.counts, { cautious: 2, balanced: 0, aggressive: 1 });
});

test('computeManagementStyle flags an adaptive style when stances tie', () => {
  const state = makeState();
  state.history.push({ type: 'assignment', stance: 'cautious', effects: {}, round: 1 });
  state.history.push({ type: 'assignment', stance: 'aggressive', effects: {}, round: 2 });

  const style = computeManagementStyle(state);
  assert.equal(style.label, 'Adaptive Operator');
  assert.equal(style.total, 2);
});

test('describeConsequences pairs triggered ids with cause and the applied effect', () => {
  const state = makeState('recce');
  state.round = 2;
  state.metrics.budget = 22;
  state.flags.lowBudgetStreak = 1; // second consecutive low-budget round triggers attrition

  const ids = applyRoundConsequences(state);
  assert.ok(ids.includes('contractor-attrition'));

  const described = describeConsequences(state, ids);
  const attrition = described.find((entry) => entry.id === 'contractor-attrition');
  assert.ok(attrition);
  assert.equal(attrition.title, 'Contractor attrition');
  assert.match(attrition.cause, /Budget/);
  assert.match(attrition.effectText, /Progress -6/);
});

test('buildSeasonHeadline returns the most impactful decision of a season', () => {
  const state = makeState();
  state.history.push({ type: 'assignment', title: 'Minor Note', option: 'a', effects: { progress: 1 }, round: 1 });
  state.history.push({ type: 'assignment', title: 'Big Call', option: 'b', effects: { progress: 4, compliance: -5 }, round: 1 });
  state.history.push({ type: 'consequence', title: 'Trust', option: 'x', effects: { compliance: -3 }, round: 1 });

  assert.equal(buildSeasonHeadline(state, 1), 'Big Call');
  assert.equal(buildSeasonHeadline(state, 2), '');
});

test('buildRoleLens frames the ending around the role-relevant metric', () => {
  const state = makeState('silviculture');
  state.metrics.forestHealth = 72;
  const strong = buildRoleLens(state);
  assert.match(strong, /Silviculture Supervisor/);
  assert.match(strong, /stand conditions/i);

  state.metrics.forestHealth = 30;
  const weak = buildRoleLens(state);
  assert.match(weak, /slipped/i);
});
