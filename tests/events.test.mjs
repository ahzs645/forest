import test from 'node:test';
import assert from 'node:assert/strict';

import { checkForEvent, formatEventForDisplay, resolveEvent } from '../js/events.js';
import { createJourney } from '../js/journey.js';
import { handleEvent } from '../js/modes/shared/handleEvent.js';
import { eventMatchesJourneyContext, getTemptationDetectionChance } from '../js/events/selection.js';
import { ILLEGAL_ACTS } from '../js/data/illegalActs.js';
import {
  getPermittingConstraintState,
  resolvePermitRevisionResponse,
  seedPermitRevisionTickets
} from '../js/modes/permitting.js';

test('radio event copy uses one concise reporter lead', () => {
  const formatted = formatEventForDisplay({
    title: 'Helicopter Available for Hire',
    description: "A local pilot's afternoon charter was cancelled.",
    severity: 'minor',
    type: 'supply',
    reporter: {
      name: 'Melissa',
      role: 'Spotter',
      task: 'flagging boundaries'
    },
    options: [{ label: 'Hire the pilot', effects: {} }]
  }, 'recon');

  assert.equal(
    formatted.description,
    "Radio from Melissa (Spotter): A local pilot's afternoon charter was cancelled."
  );
  assert.doesNotMatch(formatted.description, /radios in:.*radios in:/i);
});

function createEventHarness() {
  const writes = [];
  const prompts = [];
  const ui = {
    write(text, className = '') {
      writes.push({ text, className });
    },
    writeHeader(text) {
      writes.push({ text, className: 'term-header' });
    },
    playEventVignette() {},
    async promptChoice(prompt, options) {
      prompts.push({ prompt, options });
      return options[0];
    }
  };
  const journey = {
    journeyType: 'recon',
    day: 2,
    crew: [],
    log: [],
    scrutiny: 0,
    resources: {}
  };
  return { writes, prompts, game: { ui, journey, gameOver: false } };
}

test('routine event outcomes return straight to play without a confirm beat', async () => {
  const { writes, prompts, game } = createEventHarness();

  await handleEvent(game, {
    id: 'acknowledgement-test',
    title: 'A Test Decision',
    description: 'Something needs a call.',
    severity: 'minor',
    type: 'social',
    options: [{
      label: 'Make the call',
      outcome: 'The decision lands.',
      effects: {}
    }]
  });

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].prompt, 'What do you do?');
  assert.ok(writes.some((entry) => entry.text === 'OUTCOME'));
  assert.ok(writes.some((entry) => entry.text === 'The decision lands.'));
});

test('consequential event outcomes still wait for acknowledgement', async () => {
  const { prompts, game } = createEventHarness();

  await handleEvent(game, {
    id: 'acknowledgement-major-test',
    title: 'A Serious Call',
    description: 'This one matters.',
    severity: 'major',
    type: 'compliance',
    options: [{
      label: 'Make the call',
      outcome: 'The decision lands hard.',
      effects: {}
    }]
  });

  assert.equal(prompts.length, 2);
  assert.equal(prompts[1].options[0].label, 'Acknowledge outcome and continue');
});

test('illegal-act temptations have a priority draw from day two with a cooldown', () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const journey = createJourney({
      roleId: 'recce',
      areaId: 'fort-st-john-plateau',
      crew: []
    });

    journey.day = 2;
    const first = checkForEvent(journey);
    assert.equal(first?.type, 'temptation');
    assert.match(first?.id || '', /^legacy_temptation_/);

    journey.day = 3;
    const coolingDown = checkForEvent(journey);
    assert.notEqual(coolingDown?.type, 'temptation');

    journey.day = 6;
    const nextEligible = checkForEvent(journey);
    assert.equal(nextEligible?.type, 'temptation');
  } finally {
    Math.random = originalRandom;
  }
});

test('field temptation chance accepts a draw above the old twelve-percent rate', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.17;

  try {
    const journey = createJourney({
      roleId: 'recce',
      areaId: 'fort-st-john-plateau',
      crew: []
    });
    journey.day = 2;

    assert.equal(checkForEvent(journey)?.type, 'temptation');
  } finally {
    Math.random = originalRandom;
  }
});

test('field event time costs work when authored inside effects', () => {
  const journey = {
    journeyType: 'recon',
    day: 3,
    crew: [],
    log: [],
    scrutiny: 0,
    travelDelayHours: 0,
    resources: {}
  };

  const result = resolveEvent(journey, { id: 'bridge-test', title: 'Bridge Test', severity: 'minor' }, {
    label: 'Test it on foot first',
    outcome: 'The crossing is checked.',
    effects: { timeUsed: 1 }
  });

  assert.equal(journey.travelDelayHours, 1);
  assert.ok(result.messages.some((message) => /Lost 1 hour/i.test(message)));
});

test('temptation lane guarantees an offer after three eligible misses', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const journey = createJourney({
      roleId: 'recce',
      areaId: 'fort-st-john-plateau',
      crew: []
    });
    for (const day of [2, 3, 4]) {
      journey.day = day;
      checkForEvent(journey);
    }
    journey.day = 5;
    assert.equal(checkForEvent(journey)?.type, 'temptation');
  } finally {
    Math.random = originalRandom;
  }
});

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

test('a generic negative-progress event slips reviews back but never revokes an approved permit', () => {
  const journey = {
    journeyType: 'permitting',
    day: 10,
    log: [],
    hoursRemaining: 8,
    permits: {
      target: 5,
      backlog: 0,
      drafting: 0,
      submitted: 0,
      inReferral: 0,
      inReview: 1,
      needsRevision: 0,
      approved: 2,
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

  const event = { id: 'distracted-week', title: 'Distracted Week' };
  const option = {
    label: 'Take the hit',
    effects: {
      progress: -5
    }
  };

  const result = resolveEvent(journey, event, option);

  // "Approved 2/5" must stay "Approved 2/5" — a setback can knock the file
  // in review back to needing revision, but it cannot un-approve a permit.
  assert.equal(journey.permits.approved, 2);
  assert.equal(journey.permits.inReview, 0);
  assert.equal(journey.permits.needsRevision, 1);
  assert.ok(result.messages.some((message) => message.includes('Permit pipeline slowed')));
});

test('a negative-progress event with nothing left to slip leaves approved permits untouched', () => {
  const journey = {
    journeyType: 'permitting',
    day: 20,
    log: [],
    hoursRemaining: 8,
    permits: {
      target: 5,
      backlog: 0,
      drafting: 0,
      submitted: 0,
      inReferral: 0,
      inReview: 0,
      needsRevision: 0,
      approved: 3,
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

  const result = resolveEvent(journey, { id: 'bad-week', title: 'Bad Week' }, {
    label: 'Absorb it',
    effects: { progress: -50 }
  });

  assert.equal(journey.permits.approved, 3);
  assert.equal(journey.permits.needsRevision, 0);
  assert.ok(!result.messages.some((message) => message.includes('Permit pipeline slowed')));
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

test('planning mode ignores permit-only approval effects instead of crashing on missing permit data', () => {
  const journey = {
    journeyType: 'planning',
    day: 3,
    log: [],
    hoursRemaining: 8,
    resources: {
      budget: 47000,
      politicalCapital: 44
    },
    protagonist: {
      reputation: 50
    },
    plan: {
      phase: 'analysis',
      dataCompleteness: 80,
      analysisQuality: 40,
      stakeholderBuyIn: 55,
      ministerialConfidence: 48
    }
  };

  const result = resolveEvent(journey, { id: 'permit_approved_early', title: 'Early Permit Approval' }, {
    label: 'Use momentum to push others',
    effects: {
      permits_approved: 1,
      progress: 5,
      politicalCapital: 3
    }
  });

  assert.equal(journey.plan.analysisQuality, 48);
  assert.equal(journey.resources.politicalCapital, 47);
  assert.ok(result.messages.some((message) => message.includes('Analysis quality improved')));
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

test('contextual event matching honors role, area tags, and BEC code', () => {
  const journey = {
    roleId: 'planner',
    area: {
      becCode: 'SBSmc2',
      tags: ['sbs', 'community-interface', 'visuals', 'watershed']
    }
  };

  assert.equal(eventMatchesJourneyContext({
    roles: ['planner'],
    areaTags: ['visuals'],
    becCodes: ['SBSmc2']
  }, journey), true);

  assert.equal(eventMatchesJourneyContext({
    roles: ['permitter'],
    areaTags: ['visuals']
  }, journey), false);

  assert.equal(eventMatchesJourneyContext({
    roles: ['planner'],
    areaTags: ['salmon']
  }, journey), false);
});

test('contextual field events can require block features', () => {
  const journey = {
    roleId: 'recce',
    area: {
      becCode: 'CWHws2',
      tags: ['cwh', 'karst', 'salmon']
    }
  };
  const currentBlock = {
    features: ['karst', 'destination']
  };

  assert.equal(eventMatchesJourneyContext({
    roles: ['recce'],
    areaTags: ['karst'],
    requiredBlockFeatures: ['karst']
  }, journey, { currentBlock }), true);

  assert.equal(eventMatchesJourneyContext({
    roles: ['recce'],
    areaTags: ['karst'],
    requiredBlockFeatures: ['salmon_spawning']
  }, journey, { currentBlock }), false);
});

test('permitting revision tickets reflect area context and create actionable deficiencies', () => {
  const journey = {
    day: 9,
    currentPhase: 'review',
    hoursRemaining: 8,
    area: {
      becCode: 'CWHws2',
      tags: ['watershed', 'community-interface', 'river']
    },
    permits: {
      needsRevision: 0,
      revisionQueue: []
    },
    regulations: {
      complianceScore: 72
    }
  };

  const queue = seedPermitRevisionTickets(journey, 2, { type: 'review' });

  assert.equal(queue.length, 2);
  assert.equal(queue[0].profileId, 'community-watershed');
  assert.equal(queue[0].clean.hours, 3);
  assert.equal(queue[0].fast.hours, 2);
  assert.match(queue[0].summary, /hydrology/i);
});

test('permitting phase 3 pressure reflects public review, watershed, and timing constraints', () => {
  const journey = {
    day: 9,
    currentPhase: 'approval',
    area: {
      becCode: 'CWHws2',
      tags: ['watershed', 'community-interface', 'river', 'winter-road']
    },
    permits: {
      needsRevision: 4,
      inReferral: 2,
      revisionQueue: []
    },
    discoveryTags: [
      { id: 'community_visibility' },
      { id: 'watershed_watch' }
    ]
  };

  const pressure = getPermittingConstraintState(journey);

  assert.equal(pressure.publicReview, 4);
  assert.equal(pressure.hydrology, 4);
  assert.equal(pressure.timing, 1);
  assert.equal(pressure.dominant, 'hydrology');
});

test('permitting phase 3 pressure picks up explicit road asset engineering pressure', () => {
  const journey = {
    day: 9,
    currentPhase: 'review',
    roadAssets: {
      observations: [
        {
          blockId: 'blk-road-1',
          roadLifecycleId: 'repair_needed',
          roadLifecycleLabel: 'Repair Needed',
          crossingConditionId: 'restricted',
          crossingConditionLabel: 'Restricted',
          watershedPressureId: 'critical',
          watershedPressureLabel: 'Critical'
        }
      ]
    },
    permits: {
      needsRevision: 0,
      inReferral: 0,
      revisionQueue: []
    }
  };

  const pressure = getPermittingConstraintState(journey);

  assert.equal(pressure.engineering, 4);
  assert.equal(pressure.hydrology, 4);
  assert.equal(pressure.timing, 4);
  assert.equal(pressure.dominant, 'engineering');
});

test('permitting revision tickets favor hydrology and public review deficiencies when the file is sensitive', () => {
  const watershedJourney = {
    day: 10,
    currentPhase: 'review',
    area: {
      becCode: 'CWHws2',
      tags: ['watershed', 'community-interface', 'river']
    },
    permits: {
      needsRevision: 0,
      revisionQueue: []
    }
  };

  const watershedQueue = seedPermitRevisionTickets(watershedJourney, 1, { type: 'review' });
  assert.equal(watershedQueue[0].profileId, 'community-watershed');

  const publicReviewJourney = {
    day: 10,
    currentPhase: 'review',
    area: {
      becCode: 'SBSmc2',
      tags: ['visuals', 'community-interface', 'recreation']
    },
    permits: {
      needsRevision: 0,
      revisionQueue: []
    }
  };

  const publicReviewQueue = seedPermitRevisionTickets(publicReviewJourney, 1, { type: 'review' });
  assert.equal(publicReviewQueue[0].profileId, 'visual-quality');
});

test('permitting revision tickets follow road asset intel toward engineering and watershed deficiencies', () => {
  const engineeringJourney = {
    day: 10,
    currentPhase: 'review',
    roadAssets: {
      observations: [
        {
          blockId: 'blk-road-2',
          roadLifecycleId: 'repair_needed',
          roadLifecycleLabel: 'Repair Needed',
          crossingConditionId: 'restricted',
          crossingConditionLabel: 'Restricted',
          watershedPressureId: 'watch',
          watershedPressureLabel: 'Watch'
        }
      ]
    },
    permits: {
      needsRevision: 0,
      revisionQueue: []
    }
  };

  const engineeringQueue = seedPermitRevisionTickets(engineeringJourney, 1, { type: 'review' });
  assert.equal(engineeringQueue[0].profileId, 'access-engineering');

  const watershedJourney = {
    day: 10,
    currentPhase: 'review',
    roadAssets: {
      observations: [
        {
          blockId: 'blk-road-3',
          roadLifecycleId: 'good',
          roadLifecycleLabel: 'Good',
          crossingConditionId: 'timing_sensitive',
          crossingConditionLabel: 'Timing Sensitive',
          watershedPressureId: 'critical',
          watershedPressureLabel: 'Critical'
        }
      ]
    },
    permits: {
      needsRevision: 0,
      revisionQueue: []
    }
  };

  const watershedQueue = seedPermitRevisionTickets(watershedJourney, 1, { type: 'review' });
  assert.equal(watershedQueue[0].profileId, 'community-watershed');
});

test('permitting revision responses trade time for scrutiny and political capital', () => {
  const cleanJourney = {
    day: 11,
    currentPhase: 'review',
    hoursRemaining: 8,
    scrutiny: 30,
    area: {
      becCode: 'CWHws2',
      tags: ['watershed', 'community-interface', 'river']
    },
    permits: {
      needsRevision: 1,
      submitted: 0,
      revisionQueue: []
    },
    resources: {
      politicalCapital: 40
    },
    regulations: {
      complianceScore: 70
    },
    relationships: {
      ministry: 50,
      nations: 50,
      agencies: 50
    }
  };

  seedPermitRevisionTickets(cleanJourney, 1, { type: 'review' });
  const cleanTicket = cleanJourney.permits.revisionQueue[0];
  const cleanResult = resolvePermitRevisionResponse(cleanJourney, cleanTicket.id, 'clean');

  assert.equal(cleanResult.resolved, true);
  assert.equal(cleanJourney.hoursRemaining, 5);
  assert.equal(cleanJourney.scrutiny, 27);
  assert.equal(cleanJourney.permits.needsRevision, 0);
  assert.equal(cleanJourney.permits.submitted, 1);
  assert.equal(cleanJourney.regulations.complianceScore, 75);
  assert.equal(cleanJourney.relationships.agencies, 51);
  assert.ok(cleanResult.messages.some((message) => /watershed response/i.test(message)));

  const fastJourney = {
    day: 11,
    currentPhase: 'review',
    hoursRemaining: 8,
    scrutiny: 30,
    area: {
      becCode: 'CWHws2',
      tags: ['watershed', 'community-interface', 'river']
    },
    permits: {
      needsRevision: 1,
      submitted: 0,
      revisionQueue: []
    },
    resources: {
      politicalCapital: 40
    },
    regulations: {
      complianceScore: 70
    },
    relationships: {
      ministry: 50,
      nations: 50,
      agencies: 50
    }
  };

  seedPermitRevisionTickets(fastJourney, 1, { type: 'review' });
  const fastTicket = fastJourney.permits.revisionQueue[0];
  const fastResult = resolvePermitRevisionResponse(fastJourney, fastTicket.id, 'fast');

  assert.equal(fastResult.resolved, true);
  assert.equal(fastJourney.hoursRemaining, 6);
  assert.equal(fastJourney.scrutiny, 34);
  assert.equal(fastJourney.resources.politicalCapital, 39);
  assert.equal(fastJourney.permits.needsRevision, 0);
  assert.equal(fastJourney.permits.submitted, 1);
  assert.equal(fastJourney.regulations.complianceScore, 71);
  assert.equal(fastJourney.relationships.ministry, 49);
});

test('selected events can seed carry-forward discovery tags', () => {
  const journey = {
    journeyType: 'permitting',
    day: 12,
    log: [],
    hoursRemaining: 8,
    discoveryTags: [],
    permits: {
      target: 15,
      approved: 2
    },
    resources: {
      budget: 35000,
      politicalCapital: 40
    },
    relationships: {
      ministry: 50,
      nations: 50,
      agencies: 50
    },
    regulations: {
      complianceScore: 78
    }
  };

  const result = resolveEvent(
    journey,
    { id: 'visual_quality_redraft', title: 'Visual Quality Redraft' },
    { label: 'Redraw it', effects: {} }
  );

  assert.ok(journey.discoveryTags.some((tag) => tag.id === 'community_visibility'));
  assert.ok(result.messages.some((message) => /Carry-forward intel/i.test(message)));
});

test('shortcut offers are a real bet: odds, a losing branch, and a stated downside', () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const journey = createJourney({
      roleId: 'recce',
      areaId: 'fort-st-john-plateau',
      crew: []
    });
    journey.day = 2;

    const temptation = checkForEvent(journey);
    assert.equal(temptation?.type, 'temptation');

    const take = temptation.options.find((option) => option.temptationChoice === 'taken');
    assert.ok(take, 'the shortcut option is tagged so the ledger can see it');
    assert.equal(typeof take.chanceSuccess, 'number');
    assert.ok(take.chanceSuccess > 0 && take.chanceSuccess < 1, 'taking it is a gamble, not a purchase');
    assert.ok(take.failureEffects, 'the losing branch has its own effects');
    assert.ok(Number(take.failureEffects.budget) < 0, 'getting caught costs money, it does not pay');
    assert.ok(Number(take.effects.budget) > 0, 'the winning branch pays');

    const formatted = formatEventForDisplay(temptation, 'recon');
    const takeHint = formatted.options.find((option) => /Take the shortcut/.test(option.label))?.hint || '';
    assert.match(takeHint, /it goes wrong/, 'the odds of it surfacing are on the button');
    assert.match(takeHint, /then /, 'so is what it costs when it does');
  } finally {
    Math.random = originalRandom;
  }
});

test('shortcut detection climbs with scrutiny and with every shortcut already taken', () => {
  const tier = { detection: 0.3 };
  const clean = getTemptationDetectionChance({ scrutiny: 0, difficulty: 'normal' }, tier, 0);
  const hot = getTemptationDetectionChance({ scrutiny: 80, difficulty: 'normal' }, tier, 0);
  const repeat = getTemptationDetectionChance({ scrutiny: 0, difficulty: 'normal' }, tier, 3);
  const hard = getTemptationDetectionChance({ scrutiny: 0, difficulty: 'hard' }, tier, 0);

  assert.ok(hot > clean, 'a run under scrutiny is a worse place to try it');
  assert.ok(repeat > clean, 'the third shortcut is riskier than the first');
  assert.ok(hard > clean, 'hard runs are watched more closely');
  assert.ok(getTemptationDetectionChance({ scrutiny: 100 }, { detection: 0.85 }, 9) <= 0.85, 'odds stay bounded');
});

test('brazen shortcuts pay more and get caught more often than corner-cutting', () => {
  const originalRandom = Math.random;
  const gains = {};
  const odds = {};

  try {
    for (const [label, actId] of [['brazen', 'permit-fastpass'], ['petty', 'carbon-offset-spin']]) {
      Math.random = () => 0.05;
      const journey = createJourney({ roleId: 'permitter', areaId: 'fort-st-john-plateau', crew: [] });
      journey.day = 2;
      // Force the draw onto a known act by pre-seeding every other id as seen.
      journey.temptationMemory = {
        lastDay: 0,
        missedEligibleDays: 0,
        seenActIds: ILLEGAL_ACTS.filter((act) => act.id !== actId).map((act) => act.id)
      };
      const temptation = checkForEvent(journey);
      const take = temptation.options.find((option) => option.temptationChoice === 'taken');
      gains[label] = Number(take.effects.budget);
      odds[label] = 1 - Number(take.chanceSuccess);
    }

    assert.ok(gains.brazen > gains.petty, 'the flagrant one is worth more');
    assert.ok(odds.brazen > odds.petty, 'and is likelier to surface');
  } finally {
    Math.random = originalRandom;
  }
});

test('the run keeps a shortcut ledger the debrief can read', () => {
  const journey = {
    journeyType: 'recon',
    day: 4,
    crew: [],
    log: [],
    scrutiny: 0,
    resources: { budget: 2000 }
  };
  const event = { id: 'legacy_temptation_x', title: 'Bootleg Fibre Shuffle', temptation: { actTitle: 'Bootleg Fibre Shuffle' } };

  resolveEvent(journey, event, {
    label: 'Take it',
    outcome: 'It holds.',
    effects: { budget: 400 },
    chanceSuccess: 1,
    temptationChoice: 'taken'
  });
  resolveEvent(journey, event, {
    label: 'Take it',
    outcome: 'It holds.',
    failureOutcome: 'It does not.',
    effects: { budget: 400 },
    failureEffects: { budget: -400, compliance: -10 },
    chanceSuccess: 0,
    temptationChoice: 'taken'
  });
  resolveEvent(journey, event, { label: 'No', outcome: 'You walk.', effects: {}, temptationChoice: 'refused' });

  assert.equal(journey.temptationLedger.taken, 2);
  assert.equal(journey.temptationLedger.held, 1);
  assert.equal(journey.temptationLedger.caught, 1);
  assert.equal(journey.temptationLedger.refused, 1);
  assert.deepEqual(journey.temptationLedger.caughtActs, ['Bootleg Fibre Shuffle']);
});

test('a busted desk shortcut books its own follow-up, a clean one does not', () => {
  const base = () => ({
    journeyType: 'permitting',
    day: 5,
    crew: [],
    log: [],
    scrutiny: 10,
    resources: { budget: 20000, politicalCapital: 40 }
  });
  const option = {
    label: 'Take it',
    outcome: 'It holds.',
    failureOutcome: 'It does not.',
    effects: { budget: 3000 },
    failureEffects: { budget: -2400, compliance: -12 },
    failureSchedulesEvent: 'surprise_audit',
    temptationChoice: 'taken'
  };

  const held = base();
  resolveEvent(held, { id: 't', title: 'T' }, { ...option, chanceSuccess: 1 });
  assert.equal(held.scheduledEvents?.length ?? 0, 0, 'a shortcut that held schedules nothing');

  const caught = base();
  resolveEvent(caught, { id: 't', title: 'T' }, { ...option, chanceSuccess: 0 });
  assert.equal(caught.scheduledEvents?.[0]?.eventId, 'surprise_audit');
});
