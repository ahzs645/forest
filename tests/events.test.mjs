import test from 'node:test';
import assert from 'node:assert/strict';

import { checkForEvent, resolveEvent } from '../js/events.js';

test('permitting events update relationship and compliance tracks without legacy stakeholder state', () => {
  const journey = {
    journeyType: 'permitting',
    day: 4,
    log: [],
    hoursRemaining: 8,
    permits: {
      target: 15,
      backlog: 3,
      drafting: 0,
      submitted: 1,
      inReferral: 0,
      inReview: 2,
      needsRevision: 0,
      approved: 0,
      rejected: 0
    },
    resources: {
      budget: 35000,
      politicalCapital: 40
    },
    relationships: {
      ministry: 50,
      nations: 45,
      agencies: 48
    },
    regulations: {
      complianceScore: 80
    }
  };

  const event = { id: 'referral-crunch', title: 'Referral Crunch' };
  const option = {
    label: 'Call in favors',
    effects: {
      relationships: 4,
      compliance: 3,
      progress: 10
    }
  };

  const result = resolveEvent(journey, event, option);

  assert.equal(journey.relationships.ministry, 52);
  assert.equal(journey.relationships.nations, 47);
  assert.equal(journey.relationships.agencies, 50);
  assert.equal(journey.regulations.complianceScore, 83);
  assert.equal(journey.resources.politicalCapital, 43);
  assert.equal(journey.permits.approved, 1);
  assert.ok(result.messages.some((message) => message.includes('Relationships improved')));
});

test('planning events advance the active phase instead of no-oping against permit state', () => {
  const journey = {
    journeyType: 'planning',
    day: 7,
    log: [],
    hoursRemaining: 8,
    resources: {
      budget: 48000,
      politicalCapital: 40
    },
    protagonist: {
      reputation: 50
    },
    plan: {
      phase: 'analysis',
      dataCompleteness: 82,
      analysisQuality: 66,
      stakeholderBuyIn: 50,
      ministerialConfidence: 44
    },
    stakeholders: {
      ministry: { mood: 50 },
      nations: { mood: 50 },
      community: { mood: 50 },
      licensees: { mood: 50 }
    }
  };

  resolveEvent(journey, { id: 'model-boost', title: 'Model Boost' }, {
    label: 'Use the new outputs',
    effects: {
      progress: 10,
      relationships: 6,
      compliance: 5
    }
  });

  assert.equal(journey.plan.phase, 'stakeholder_review');
  assert.equal(journey.plan.analysisQuality, 81);
  assert.equal(journey.plan.stakeholderBuyIn, 56);
  assert.equal(journey.plan.ministerialConfidence, 49);
  assert.equal(journey.protagonist.reputation, 56);
});

test('silviculture random-event check stays safe without recon block data', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;

  const journey = {
    journeyType: 'silviculture',
    day: 1,
    crew: [],
    resources: {
      budget: 100000,
      equipment: 100
    }
  };

  try {
    assert.equal(checkForEvent(journey), null);
  } finally {
    Math.random = originalRandom;
  }
});

test('event cooldown skips the most recent repeated desk event when alternatives exist', () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  const journey = {
    journeyType: 'permitting',
    day: 8,
    currentPhase: 'review',
    log: [
      { day: 6, type: 'event', eventId: 'community_complaint' },
      { day: 7, type: 'event', eventId: 'surprise_audit' }
    ],
    protagonist: {
      stress: 10
    },
    resources: {
      budget: 35000,
      politicalCapital: 40
    },
    permits: {
      target: 15,
      approved: 2
    }
  };

  try {
    const event = checkForEvent(journey);
    assert.ok(event);
    assert.notEqual(event.id, 'surprise_audit');
  } finally {
    Math.random = originalRandom;
  }
});
