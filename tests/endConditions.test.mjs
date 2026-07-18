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

test('recon mode completion wins even if failure flags are also set on the final shift', () => {
  const reconJourney = {
    journeyType: 'recon',
    isComplete: true,
    isGameOver: true,
    endReason: 'Expedition completed!',
    gameOverReason: 'All crew members lost',
    crew: [{ isActive: false }],
    blocks: [{}, {}, {}],
    currentBlockIndex: 2,
    blocksAssessed: 3,
    distanceTraveled: 18,
    totalDistance: 18,
    resources: { fuel: 0, food: 0 }
  };

  assert.deepEqual(checkEndConditions(reconJourney), {
    victory: true,
    reason: 'Expedition completed!'
  });
});

test('recon mode fails on the final block when mobility is gone and open packages remain', () => {
  const reconJourney = {
    journeyType: 'recon',
    crew: [{ isActive: true }],
    blocks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    currentBlockIndex: 2,
    blocksAssessed: 2,
    totalDistance: 18,
    distanceTraveled: 18,
    resources: { fuel: 0, food: 12, equipment: 40 }
  };

  assert.deepEqual(checkEndConditions(reconJourney), {
    gameOver: true,
    reason: 'Recon package stalled on the final block with no mobility left'
  });
});

test('a stalled silviculture program closes after the outside delivery window', () => {
  const result = checkEndConditions({
    journeyType: 'silviculture',
    day: 121,
    crew: [{ isActive: true }],
    planting: { blocksPlanted: 1, blocksToPlant: 15 },
    surveys: { freeGrowingComplete: 0, freeGrowingTarget: 5 },
    resources: { budget: 21000, contractorCapacity: 3 }
  });

  assert.deepEqual(result, {
    gameOver: true,
    reason: 'Silviculture program fell short of its targets'
  });
});
