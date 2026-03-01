import test from 'node:test';
import assert from 'node:assert/strict';

import { checkEndConditions } from '../js/modes/shared/endConditions.js';

test('planning mode does not auto-fail when using protagonist without crew', () => {
  const planningJourney = {
    journeyType: 'planning',
    crew: [],
    protagonist: { stress: 20 },
    plan: { ministerialConfidence: 50 },
    resources: { budget: 50000, politicalCapital: 40 }
  };

  const result = checkEndConditions(planningJourney);
  assert.equal(result, null);
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
