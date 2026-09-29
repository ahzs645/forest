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

test('a failed campaign season never hears that the crew was delivering', () => {
  const state = makeState('planner');
  state.round = 3;
  Object.assign(state.metrics, { compliance: 30, progress: 70, forestHealth: 60 });
  const ids = applyRoundConsequences(state);
  assert.ok(ids.includes('field-discipline-rebound'), ids.join(', '));
  assert.ok(ids.includes('ecological-strain'), ids.join(', '));

  const delivered = describeConsequences(state, ids);
  assert.match(delivered.find((entry) => entry.id === 'field-discipline-rebound').cause, /still delivering/);

  const short = describeConsequences(state, ids, { fellShort: true });
  for (const entry of short) {
    assert.doesNotMatch(entry.cause, /still delivering|Production stayed high/, entry.cause);
  }
  assert.match(short.find((entry) => entry.id === 'field-discipline-rebound').cause, /^The season fell short/);
  // The rest of the copy is unchanged.
  assert.deepEqual(
    short.filter((entry) => !['field-discipline-rebound', 'ecological-strain'].includes(entry.id)),
    delivered.filter((entry) => !['field-discipline-rebound', 'ecological-strain'].includes(entry.id)),
  );
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

test('describeConsequences explains every id the round engine can fire, never the bare id', () => {
  const state = makeState();
  state.round = 2;
  Object.assign(state.metrics, { progress: 50, forestHealth: 55, relationships: 52, compliance: 54, budget: 48 });
  const ids = applyRoundConsequences(state);
  assert.ok(ids.includes('steady-program'), `expected the steady-program recovery, got ${ids.join(', ')}`);

  for (const entry of describeConsequences(state, ids)) {
    assert.notEqual(entry.title, entry.id, `${entry.id} needs a title`);
    assert.ok(entry.cause, `${entry.id} needs a Why: line`);
  }
  const steady = describeConsequences(state, ['steady-program'])[0];
  assert.equal(steady.title, 'Steady program');
  assert.match(steady.effectText, /\+3/);

  // An id added to the engine without copy still reads as words.
  assert.equal(describeConsequences(state, ['late-season-slump'])[0].title, 'Late season slump');
});
