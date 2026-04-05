import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, applyRoundConsequences, applyEffects } from '../js/engine.js';

function makeState() {
  return createInitialState({
    companyName: 'Test Outfit',
    roleId: 'recce',
    areaId: 'fort-st-john-plateau',
  });
}

test('budget attrition triggers after two consecutive low-budget rounds', () => {
  const state = makeState();

  state.round = 1;
  state.metrics.budget = 24;
  let consequences = applyRoundConsequences(state);
  assert.deepEqual(consequences, []);
  assert.equal(state.metrics.progress, 50);

  state.round = 2;
  state.metrics.budget = 22;
  consequences = applyRoundConsequences(state);
  assert.ok(consequences.includes('contractor-attrition'));
  assert.equal(state.metrics.progress, 44);
  assert.equal(state.metrics.relationships, 46);
});

test('trust deficit applies compliance drag and softens relationship recovery gains', () => {
  const state = makeState();

  state.round = 1;
  state.metrics.relationships = 30;
  const consequences = applyRoundConsequences(state);
  assert.ok(consequences.includes('trust-deficit'));
  assert.equal(state.metrics.compliance, 47);

  applyEffects(state, { relationships: 10 }, {
    type: 'task',
    id: 'relationship-repair',
    title: 'Relationship Repair',
    option: 'Intensive outreach',
    round: 1,
  });

  assert.equal(state.metrics.relationships, 35);
});

test('audit escalation triggers after two consecutive low-compliance rounds', () => {
  const state = makeState();

  state.round = 1;
  state.metrics.compliance = 38;
  let consequences = applyRoundConsequences(state);
  assert.deepEqual(consequences, []);

  state.round = 2;
  state.metrics.compliance = 35;
  consequences = applyRoundConsequences(state);
  assert.ok(consequences.includes('audit-escalation'));
  assert.equal(state.metrics.progress, 46);
  assert.equal(state.metrics.budget, 44);
});
