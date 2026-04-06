import test from 'node:test';
import assert from 'node:assert/strict';

import { executeDeskDay, getOperationalProgress, recordProgressMilestones } from '../js/journey.js';

test('planning progress reflects all approval gates instead of confidence alone', () => {
  const planningJourney = {
    journeyType: 'planning',
    plan: {
      dataCompleteness: 80,
      analysisQuality: 40,
      stakeholderBuyIn: 75,
      ministerialConfidence: 80
    }
  };

  assert.equal(getOperationalProgress(planningJourney), 88);
});

test('silviculture progress clamps completed survey work instead of exceeding 100%', () => {
  const silvicultureJourney = {
    journeyType: 'silviculture',
    planting: {
      blocksPlanted: 14,
      blocksToPlant: 15
    },
    surveys: {
      freeGrowingComplete: 54,
      freeGrowingTarget: 5
    },
    brushing: {
      hectaresComplete: 0,
      hectaresTarget: 500
    }
  };

  assert.equal(getOperationalProgress(silvicultureJourney), 86);
});

test('progress milestones log once when a mode crosses a major threshold', () => {
  const planningJourney = {
    journeyType: 'planning',
    day: 6,
    milestonesReached: [],
    log: [],
    plan: {
      dataCompleteness: 80,
      analysisQuality: 20,
      stakeholderBuyIn: 50,
      ministerialConfidence: 50
    }
  };

  const messages = [];
  const reached = recordProgressMilestones(planningJourney, 18, messages, planningJourney.day);

  assert.deepEqual(reached, [25, 50]);
  assert.equal(planningJourney.log.filter((entry) => entry.type === 'milestone').length, 2);
  assert.ok(messages.every((message) => message.includes('MILESTONE')));
});

test('standard desk actions stay safe in protagonist-only permitting mode', () => {
  const permittingJourney = {
    journeyType: 'permitting',
    hoursRemaining: 8,
    protagonist: {
      energy: 80,
      stress: 20
    },
    resources: {
      budget: 30000,
      politicalCapital: 40
    },
    permits: {
      target: 15,
      approved: 2,
      submitted: 2,
      inReview: 1,
      inReferral: 1,
      backlog: 3,
      needsRevision: 0
    },
    relationships: {
      ministry: 50,
      nations: 45,
      agencies: 48
    },
    crew: []
  };

  const originalRandom = Math.random;
  Math.random = () => 0.1;

  try {
    const meeting = executeDeskDay(permittingJourney, 'stakeholder_meeting');
    assert.ok(meeting.messages.some((message) => message.includes('Met with ministry')));
    assert.ok(permittingJourney.relationships.ministry > 50);

    const morale = executeDeskDay(permittingJourney, 'team_morale');
    assert.ok(morale.messages.some((message) => message.includes('recover')));
    assert.ok(permittingJourney.protagonist.energy > 60);
  } finally {
    Math.random = originalRandom;
  }
});

test('recon progress stays clamped even when distance overshoots the final segment', () => {
  const reconJourney = {
    journeyType: 'recon',
    blocks: [{}, {}, {}],
    currentBlockIndex: 2,
    blocksAssessed: 3,
    distanceTraveled: 25,
    totalDistance: 18
  };

  assert.equal(getOperationalProgress(reconJourney), 100);
});
