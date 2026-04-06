import test from 'node:test';
import assert from 'node:assert/strict';

import { checkEndConditions, isPlanningApprovalReady } from '../js/modes/shared/endConditions.js';

test('planning mode does not auto-fail when using protagonist without crew', () => {
  const planningJourney = {
    journeyType: 'planning',
    crew: [],
    protagonist: { stress: 20 },
    plan: {
      phase: 'data_gathering',
      dataCompleteness: 20,
      analysisQuality: 0,
      stakeholderBuyIn: 50,
      ministerialConfidence: 50
    },
    resources: { budget: 50000, politicalCapital: 40 }
  };

  const result = checkEndConditions(planningJourney);
  assert.equal(result, null);
});

test('planning mode does not declare victory on confidence alone before the full plan is ready', () => {
  const planningJourney = {
    journeyType: 'planning',
    crew: [],
    protagonist: { stress: 15 },
    plan: {
      phase: 'data_gathering',
      dataCompleteness: 0,
      analysisQuality: 0,
      stakeholderBuyIn: 58,
      ministerialConfidence: 86
    },
    resources: { budget: 43500, politicalCapital: 53 }
  };

  assert.equal(isPlanningApprovalReady(planningJourney), false);
  assert.equal(checkEndConditions(planningJourney), null);
});

test('planning mode wins once every ministerial approval milestone is actually complete', () => {
  const planningJourney = {
    journeyType: 'planning',
    crew: [],
    protagonist: { stress: 22 },
    plan: {
      phase: 'ministerial_approval',
      dataCompleteness: 85,
      analysisQuality: 84,
      stakeholderBuyIn: 78,
      ministerialConfidence: 82
    },
    resources: { budget: 41000, politicalCapital: 25 }
  };

  assert.equal(isPlanningApprovalReady(planningJourney), true);
  assert.deepEqual(checkEndConditions(planningJourney), {
    victory: true,
    reason: 'Landscape plan approved by Ministry!'
  });
});

test('permitting mode does not auto-fail when using protagonist without crew', () => {
  const permittingJourney = {
    journeyType: 'permitting',
    crew: [],
    protagonist: { stress: 25 },
    day: 5,
    deadline: 30,
    permits: { approved: 2, target: 15 },
    resources: { budget: 30000, politicalCapital: 35 }
  };

  const result = checkEndConditions(permittingJourney);
  assert.equal(result, null);
});

test('recon mode ends when no active crew remain', () => {
  const reconJourney = {
    journeyType: 'recon',
    crew: [{ isActive: false }, { isActive: false }],
    distanceTraveled: 10,
    totalDistance: 100,
    resources: { fuel: 40, food: 20 }
  };

  const result = checkEndConditions(reconJourney);
  assert.deepEqual(result, { gameOver: true, reason: 'All crew members lost' });
});

test('recon mode victory uses fully surveyed block count for the final checkpoint', () => {
  const reconJourney = {
    journeyType: 'recon',
    crew: [{ isActive: true }],
    blocks: [{}, {}, {}],
    currentBlockIndex: 2,
    blocksAssessed: 3,
    distanceTraveled: 18,
    totalDistance: 18,
    resources: { fuel: 10, food: 10 }
  };

  assert.deepEqual(checkEndConditions(reconJourney), {
    victory: true,
    reason: 'Expedition completed!'
  });
});
