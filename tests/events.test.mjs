import test from 'node:test';
import assert from 'node:assert/strict';

import { checkForEvent, formatEventForDisplay, resolveEvent } from '../js/events.js';
import { createJourney } from '../js/journey.js';
import { handleEvent } from '../js/modes/shared/handleEvent.js';
import { eventMatchesJourneyContext } from '../js/events/selection.js';
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

test('option hints disclose run-ending and evacuation choices without hiding graded odds', () => {
  const formatted = formatEventForDisplay({
    title: 'A difficult call',
    options: [
      { label: 'Walk away', gameOver: true, hiddenOutcome: true },
      { label: 'Send them to town', crewEffect: { evacuate_sick: true } },
      { label: 'Attempt recovery', hiddenOutcome: true, chanceSuccess: 0.5, chancePartial: 0.3 },
      { label: 'Wait', effects: {} }
    ]
  }, 'recon');
  assert.match(formatted.options[0].hint, /ends the run/i);
  assert.match(formatted.options[1].hint, /evacuates/i);
  assert.match(formatted.options[2].hint, /50% clean, 20% badly wrong/);
  assert.equal(formatted.options[3].hint, 'brief response; work continues');
});

test('event outcomes wait for acknowledgement before play resumes', async () => {
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
  const game = { ui, journey, gameOver: false };

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

  assert.equal(prompts.length, 2);
  assert.equal(prompts[0].prompt, 'What do you do?');
  assert.equal(prompts[1].options[0].label, 'Acknowledge outcome and continue');
  assert.ok(writes.some((entry) => entry.text === 'OUTCOME'));
  assert.ok(writes.some((entry) => entry.text === 'The decision lands.'));
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
    assert.match(first?.id || '', /^temptation_/);

    journey.day = 3;
    const coolingDown = checkForEvent(journey);
    assert.notEqual(coolingDown?.type, 'temptation');

    journey.day = 6;
    const stillCoolingDown = checkForEvent(journey);
    assert.notEqual(stillCoolingDown?.type, 'temptation');

    journey.day = 8;
    const nextEligible = checkForEvent(journey);
    assert.equal(nextEligible?.type, 'temptation');
  } finally {
    Math.random = originalRandom;
  }
});

test('field temptation chance accepts a draw inside the reduced pacing rate', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.09;

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

test('field event time costs read as lost ground when authored inside effects', () => {
  const journey = {
    journeyType: 'recon',
    day: 3,
    crew: [],
    log: [],
    scrutiny: 0,
    travelSetback: 0,
    resources: {}
  };

  const result = resolveEvent(journey, { id: 'bridge-test', title: 'Bridge Test', severity: 'minor' }, {
    label: 'Test it on foot first',
    outcome: 'The crossing is checked.',
    effects: { timeUsed: 1 }
  });

  // Content still rates delays on the retired eight-hour scale; the shift
  // turns that into the share of the day's ground the trouble cost.
  assert.equal(journey.travelSetback, 1 / 8);
  assert.ok(result.messages.some((message) => /eats into the next leg/i.test(message)));
});

test('a heavy field delay never takes the whole shift', () => {
  const journey = {
    journeyType: 'recon',
    day: 4,
    crew: [],
    log: [],
    scrutiny: 0,
    travelSetback: 0,
    resources: {}
  };

  resolveEvent(journey, { id: 'washout', title: 'Washout', severity: 'major' }, {
    label: 'Dig it out',
    outcome: 'The road is passable again.',
    effects: { timeUsed: 12 }
  });

  assert.equal(journey.travelSetback, 0.75, 'the crew always makes some ground');
});

test('temptation lane guarantees an offer after five eligible misses', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const journey = createJourney({
      roleId: 'recce',
      areaId: 'fort-st-john-plateau',
      crew: []
    });
    for (const day of [2, 3, 4, 5, 6]) {
      journey.day = day;
      checkForEvent(journey);
    }
    journey.day = 7;
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
    actionsRemaining: 1,
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
  // Generic progress brings a clock forward; it never signs a permit.
  assert.equal(journey.permits.approved, 0);
  assert.equal(journey.permits.inReview, 2);
  assert.equal(journey.permits.files.length, 3, 'no file is conjured or lost');
  assert.ok(result.messages.some((message) => /The queue moves faster: .+District Manager decision Day 4/.test(message)));
  assert.ok(result.messages.some((message) => message.includes('Relationships improved')));
});

test('a generic negative-progress event slips reviews back but never revokes an approved permit', () => {
  const journey = {
    journeyType: 'permitting',
    day: 10,
    log: [],
    actionsRemaining: 1,
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

  // "Approved 2/5" must stay "Approved 2/5" — a setback pushes the clock on
  // the file in review back a day, but it cannot un-approve a permit, and the
  // file stays exactly where it was in the queue.
  assert.equal(journey.permits.approved, 2);
  assert.equal(journey.permits.inReview, 1);
  assert.equal(journey.permits.needsRevision, 0);
  const inReview = journey.permits.files.find((file) => file.lane === 'decision');
  assert.equal(inReview.clockCloses, 11, 'the decision slips a day');
  assert.ok(result.messages.some((message) => /The queue slips: .+District Manager decision Day 11/.test(message)));
});

test('a negative-progress event with nothing left to slip leaves approved permits untouched', () => {
  const journey = {
    journeyType: 'permitting',
    day: 20,
    log: [],
    actionsRemaining: 1,
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
  assert.equal(journey.permits.files.length, 3, 'the issued files are the only files, before and after');
  assert.ok(!result.messages.some((message) => /queue slips/.test(message)));
  assert.ok(result.messages.some((message) => /already stalled/.test(message)));
});

test('generic progress on a planning file is the planner\'s time, never a gate or a phase', () => {
  const journey = {
    journeyType: 'planning',
    day: 7,
    log: [],
    actionsRemaining: 1,
    resources: {
      budget: 48000,
      politicalCapital: 40
    },
    protagonist: {
      reputation: 50,
      energy: 70,
      stress: 30
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

  const gained = resolveEvent(journey, { id: 'model-boost', title: 'Model Boost' }, {
    label: 'Use the new outputs',
    effects: {
      progress: 10,
      relationships: 6,
      compliance: 5
    }
  });

  // Generic progress is the planner's own time: it buys energy and eases
  // stress. The gates and the phase move only on the planner's own actions
  // or an explicit data/analysis/buyIn key.
  assert.equal(journey.plan.phase, 'analysis');
  assert.equal(journey.plan.analysisQuality, 66);
  assert.equal(journey.plan.dataCompleteness, 82);
  assert.equal(journey.protagonist.energy, 76);
  assert.equal(journey.protagonist.stress, 24);
  assert.ok(gained.messages.some((message) => /Time back on the file/.test(message)));
  // Relationships land on stakeholder moods and the planner's reputation,
  // compliance on reputation and scrutiny; neither writes the engagement
  // record or the District Manager's readiness (only the planner's own work does).
  assert.equal(journey.plan.stakeholderBuyIn, 50);
  assert.equal(journey.plan.ministerialConfidence, 44);
  assert.equal(journey.stakeholders.nations.mood, 53);
  assert.equal(journey.protagonist.reputation, 56);

  // A lost week in the decision phase costs the planner, not the DM.
  journey.plan.phase = 'ministerial_approval';
  journey.plan.ministerialConfidence = 29;
  const lost = resolveEvent(journey, { id: 'wildfire_evacuation', title: 'Wildfire Approaching' }, {
    label: 'Preemptively shut down operations and evacuate',
    effects: { progress: -10 }
  });
  assert.equal(journey.plan.ministerialConfidence, 29, 'evacuating ahead of a fire is not the DM losing confidence');
  assert.equal(journey.plan.phase, 'ministerial_approval');
  assert.equal(journey.protagonist.energy, 70);
  assert.equal(journey.protagonist.stress, 30);
  assert.ok(lost.messages.some((message) => /Lost time on the file: energy -6, stress \+6/.test(message)));
  assert.ok(!lost.messages.some((message) => /readiness|buy-in/i.test(message)));
});

test('planning mode ignores permit-only approval effects instead of crashing on missing permit data', () => {
  const journey = {
    journeyType: 'planning',
    day: 3,
    log: [],
    actionsRemaining: 1,
    resources: {
      budget: 47000,
      politicalCapital: 44
    },
    protagonist: {
      reputation: 50,
      energy: 60,
      stress: 40
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

  assert.equal(journey.plan.analysisQuality, 40);
  assert.equal(journey.resources.politicalCapital, 47);
  assert.equal(journey.protagonist.energy, 63);
  assert.ok(result.messages.some((message) => message.includes('Time back on the file')));
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
    actionsRemaining: 1,
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
  // A deficiency response is a whole day either way now, so the choice is
  // purely the scrutiny trade: clean it up, or push it back out fast.
  assert.ok(queue[0].clean.scrutiny < 0, 'a clean response should cool scrutiny');
  assert.ok(queue[0].fast.scrutiny > 0, 'a fast-track should heat scrutiny');
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

test('permitting revision responses trade the day for scrutiny and political capital', () => {
  const cleanJourney = {
    day: 11,
    currentPhase: 'review',
    actionsRemaining: 1,
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
  assert.equal(cleanJourney.actionsRemaining, 0, 'a deficiency response is the day');
  assert.equal(cleanJourney.scrutiny, 27);
  assert.equal(cleanJourney.permits.needsRevision, 0);
  // A substantive letter answered goes back to the District Manager; the
  // referral is not re-run.
  assert.equal(cleanJourney.permits.inReview, 1);
  assert.match(cleanTicket.fileLabel, /^(CP|RP|RUP|SUP|HCA) /);
  assert.equal(cleanJourney.regulations.complianceScore, 75);
  assert.equal(cleanJourney.relationships.agencies, 51);
  assert.ok(cleanResult.messages.some((message) => /watershed response/i.test(message)));

  const fastJourney = {
    day: 11,
    currentPhase: 'review',
    actionsRemaining: 1,
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
  assert.equal(fastJourney.actionsRemaining, 0, 'a fast-track still costs the day');
  assert.equal(fastJourney.scrutiny, 34);
  assert.equal(fastJourney.resources.politicalCapital, 39);
  assert.equal(fastJourney.permits.needsRevision, 0);
  assert.equal(fastJourney.permits.inReview, 1);
  assert.equal(fastJourney.regulations.complianceScore, 71);
  assert.equal(fastJourney.relationships.ministry, 49);
});

test('selected events can seed carry-forward discovery tags', () => {
  const journey = {
    journeyType: 'permitting',
    day: 12,
    log: [],
    actionsRemaining: 1,
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

test('every change to district goodwill is surfaced, with a warning before the fatal threshold', () => {
  const permitting = {
    journeyType: 'permitting',
    day: 11,
    log: [],
    permits: { target: 15, backlog: 0, drafting: 0, submitted: 0, inReferral: 0, inReview: 0, needsRevision: 0, approved: 11 },
    resources: { budget: 30000, politicalCapital: 16 },
    relationships: { ministry: 50, nations: 50, agencies: 50 },
    regulations: { complianceScore: 60 }
  };
  // A compliance hit on a permit file drains goodwill; it used to do so silently.
  const hit = resolveEvent(permitting, { id: 'archaeology_gap', title: 'Archaeology Screening Gap' }, {
    label: 'Submit and hope',
    effects: { compliance: -10 }
  });
  assert.equal(permitting.resources.politicalCapital, 6);
  assert.ok(hit.messages.some((message) => message === 'District goodwill -10 → 6.'), hit.messages.join(' | '));
  assert.ok(hit.messages.some((message) => /licensee pulls you off the file \(6 left\)/.test(message)));

  const gone = resolveEvent(permitting, { id: 'complaint', title: 'Complaint' }, {
    label: 'Redirect to PR',
    effects: { politicalCapital: -6 }
  });
  assert.equal(permitting.resources.politicalCapital, 0);
  assert.ok(gone.messages.some((message) => /goodwill is gone/.test(message)));

  const planning = {
    journeyType: 'planning',
    day: 18,
    log: [],
    resources: { budget: 40000, politicalCapital: 23 },
    protagonist: { reputation: 50, energy: 60, stress: 30 },
    plan: { phase: 'analysis', dataCompleteness: 80, analysisQuality: 40, stakeholderBuyIn: 55, ministerialConfidence: 48 }
  };
  const quiet = resolveEvent(planning, { id: 'media', title: 'Media Inquiry' }, {
    label: 'Redirect to PR department',
    effects: { politicalCapital: -6, relationships: -3 }
  });
  assert.equal(planning.resources.politicalCapital, 17);
  assert.ok(quiet.messages.some((message) => message === 'District goodwill -6 → 17.'));
  assert.ok(!quiet.messages.some((message) => /nearly spent/.test(message)), 'no warning while goodwill is above the threshold');

  const low = resolveEvent(planning, { id: 'elder', title: 'Elder Offers Traditional Knowledge' }, {
    label: 'Decline',
    effects: { politicalCapital: -8 }
  });
  assert.ok(low.messages.some((message) => /district stops reading the file \(9 left\)/.test(message)));

  const back = resolveEvent(planning, { id: 'grant', title: 'Grant' }, {
    label: 'Apply',
    effects: { politicalCapital: 4 }
  });
  assert.ok(back.messages.some((message) => message === 'District goodwill +4 → 13.'));
});

test('the option hint names goodwill on a desk file and capital only in the boardroom', () => {
  const event = {
    id: 'hint', title: 'Hint', description: 'x',
    options: [{ label: 'Lean on the district', outcome: 'x', effects: { politicalCapital: -6 } }]
  };
  assert.match(formatEventForDisplay(event, 'planning').options[0].hint, /-6 goodwill/);
  assert.match(formatEventForDisplay(event, 'permitting').options[0].hint, /-6 goodwill/);
  assert.match(formatEventForDisplay(event, 'manager').options[0].hint, /-6 capital/);
});
