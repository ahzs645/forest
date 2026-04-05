import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, drawIssue, applyOptionOutcome } from '../js/engine.js';

function makeSbsPlannerState() {
  const state = createInitialState({
    companyName: 'Issue Chain Tester',
    roleId: 'planner',
    areaId: 'fraser-plateau',
  });
  state.round = 1;
  return state;
}

test('scheduled issue delay counts down and issue becomes drawable', () => {
  const state = makeSbsPlannerState();

  applyOptionOutcome(state, {
    effects: {},
    setFlags: { pineBeetleMonitor: true },
    scheduleIssues: { id: 'pine-beetle-escalation', delay: 1 },
  });

  assert.deepEqual(state.pendingIssues, [{ id: 'pine-beetle-escalation', delay: 1 }]);

  const firstDraw = drawIssue(state, () => 0);
  assert.equal(firstDraw?.id, 'pine-beetle-escalation');
  assert.deepEqual(state.pendingIssues, []);
});

test('setFlags and clearFlags mutate narrative state through option outcomes', () => {
  const state = makeSbsPlannerState();

  applyOptionOutcome(state, {
    effects: {},
    setFlags: { pineBeetleUnchecked: true, temporaryMarker: true },
  });
  assert.equal(state.flags.pineBeetleUnchecked, true);
  assert.equal(state.flags.temporaryMarker, true);

  applyOptionOutcome(state, {
    effects: {},
    clearFlags: ['temporaryMarker'],
  });
  assert.equal(state.flags.temporaryMarker, undefined);
  assert.equal(state.flags.pineBeetleUnchecked, true);
});
