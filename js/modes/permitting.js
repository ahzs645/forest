/**
 * Permitting Mode Runner
 * Protagonist-based permit processing and stakeholder management
 * YOU are the Permitting Specialist - no crew, just pipeline and relationships
 */

import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
import { calculateDeskConsumption, applyConsumption, applyDeskRegen, getFormattedResourceStatus, DESK_RESOURCES } from '../resources.js';
import { executeDeskDay, DESK_ACTIONS } from '../journey.js';
import { getOperationalProgress, recordProgressMilestones } from '../journey.js';
import { getDiscoveryTagNotes, getJourneyDiscoveryTags } from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';

const PERMIT_REVISION_PROFILES = [
  {
    id: 'fish-passage',
    title: 'Fish passage detail',
    summary: 'The crossing package needs clearer stream, culvert, and drainage support.',
    tags: ['salmon', 'fish', 'stream', 'river', 'riparian', 'wetland'],
    pressure: {
      hydrology: 3,
      timing: 2
    },
    clean: {
      hours: 3,
      label: 'Clean up the crossing file',
      note: 'You rebuild the package with better drawings and hydrology notes.',
      scrutiny: -3,
      compliance: 4,
      relationships: { agencies: 1 }
    },
    fast: {
      hours: 2,
      label: 'Fast-track the crossing file',
      note: 'You resubmit quickly and lean on the existing package.',
      scrutiny: 4,
      compliance: 1,
      politicalCapital: -2,
      relationships: { agencies: -1 }
    }
  },
  {
    id: 'community-watershed',
    title: 'Community watershed note',
    summary: 'The hydrology memo needs stronger protection language.',
    tags: ['watershed', 'drinking-water', 'community-interface', 'water'],
    pressure: {
      publicReview: 1,
      hydrology: 4,
      timing: 1
    },
    clean: {
      hours: 3,
      label: 'Rework the watershed package',
      note: 'You add a more defensible water-quality response and timing note.',
      scrutiny: -3,
      compliance: 5,
      relationships: { ministry: 1, agencies: 1 }
    },
    fast: {
      hours: 2,
      label: 'Push the watershed file',
      note: 'You keep the file moving, but the shorter response draws attention.',
      scrutiny: 4,
      compliance: 1,
      politicalCapital: -1,
      relationships: { ministry: -1 }
    }
  },
  {
    id: 'consultation',
    title: 'Consultation record',
    summary: 'The reviewer wants a clearer accommodation trail and map context.',
    tags: ['nations', 'cultural', 'archaeology', 'consultation', 'values'],
    pressure: {
      publicReview: 4
    },
    clean: {
      hours: 3,
      label: 'Tighten the consultation record',
      note: 'You rebuild the record trail and clean up the accommodation notes.',
      scrutiny: -3,
      compliance: 4,
      relationships: { nations: 2, agencies: 1 }
    },
    fast: {
      hours: 2,
      label: 'Resubmit consultation notes',
      note: 'You move quickly, but the lighter package leaves more heat behind.',
      scrutiny: 5,
      compliance: 1,
      politicalCapital: -2,
      relationships: { nations: -2 }
    }
  },
  {
    id: 'visual-quality',
    title: 'Visual quality package',
    summary: 'The layout needs a better public-facing map and sightline explanation.',
    tags: ['visuals', 'recreation', 'trail', 'community-interface'],
    pressure: {
      publicReview: 4
    },
    clean: {
      hours: 3,
      label: 'Redraw the visual package',
      note: 'You tighten the map set and the file reads as more defensible.',
      scrutiny: -3,
      compliance: 3,
      relationships: { ministry: 1 }
    },
    fast: {
      hours: 2,
      label: 'Minimal visual edits',
      note: 'You keep the turnaround short, but the thinner package stays under a microscope.',
      scrutiny: 4,
      compliance: 1,
      politicalCapital: -1,
      relationships: { ministry: -1 }
    }
  },
  {
    id: 'access-engineering',
    title: 'Access engineering note',
    summary: 'The road package needs clearer access, drainage, and deactivation detail.',
    tags: ['road', 'access', 'steep', 'karst', 'winter-road'],
    pressure: {
      hydrology: 1,
      timing: 3
    },
    clean: {
      hours: 3,
      label: 'Strengthen the access package',
      note: 'You tidy up the engineering notes and reduce the reviewer’s concerns.',
      scrutiny: -2,
      compliance: 4,
      relationships: { agencies: 1 }
    },
    fast: {
      hours: 2,
      label: 'Keep the access package moving',
      note: 'You push the file through with minimal edits and pay for it in attention.',
      scrutiny: 4,
      compliance: 1,
      politicalCapital: -2,
      relationships: { agencies: -1 }
    }
  },
  {
    id: 'package-completeness',
    title: 'Package completeness',
    summary: 'The file is technically usable, but the reviewer wants a cleaner submission.',
    tags: [],
    pressure: {
      publicReview: 1,
      hydrology: 1,
      timing: 1
    },
    clean: {
      hours: 3,
      label: 'Clean up the package',
      note: 'You chase down the missing pieces and make the submission more defensible.',
      scrutiny: -2,
      compliance: 3,
      relationships: { ministry: 1, agencies: 1 }
    },
    fast: {
      hours: 2,
      label: 'Submit the bare-minimum revision',
      note: 'You keep momentum, but the lean response adds heat to the file.',
      scrutiny: 3,
      compliance: 1,
      politicalCapital: -1,
      relationships: { ministry: -1, agencies: -1 }
    }
  }
];

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function countSignals(...signals) {
  return signals.filter(Boolean).length;
}

function getAreaTagSet(journey) {
  return new Set((journey?.area?.tags || []).map((tag) => String(tag).toLowerCase()));
}

function derivePermittingConstraintState(journey) {
  const areaTags = getAreaTagSet(journey);
  const discoveryIds = new Set(getJourneyDiscoveryTags(journey).map((tag) => tag.id));
  const phase = String(journey?.currentPhase || '').toLowerCase();
  const permits = journey?.permits || {};
  const needRevisionPressure = Math.min(2, Math.floor((permits.needsRevision || 0) / 2));
  const referralPressure = Math.min(2, Math.floor((permits.inReferral || 0) / 2));

  const publicReviewSignals = countSignals(
    areaTags.has('community-interface'),
    areaTags.has('visuals'),
    areaTags.has('recreation'),
    areaTags.has('trail'),
    areaTags.has('road'),
    areaTags.has('access'),
    phase === 'review',
    phase === 'approval',
    discoveryIds.has('fom_public_review'),
    discoveryIds.has('community_visibility')
  );

  const hydrologySignals = countSignals(
    areaTags.has('watershed'),
    areaTags.has('water'),
    areaTags.has('river'),
    areaTags.has('riparian'),
    areaTags.has('wetland'),
    areaTags.has('salmon'),
    areaTags.has('fish'),
    discoveryIds.has('watershed_watch')
  );

  const timingSignals = countSignals(
    areaTags.has('timing'),
    areaTags.has('seasonal'),
    areaTags.has('salmon'),
    areaTags.has('floodplain'),
    areaTags.has('winter-road'),
    areaTags.has('winter'),
    areaTags.has('muskeg'),
    discoveryIds.has('access_rehab')
  );

  const publicReviewPressure = clampConstraintLevel(publicReviewSignals + needRevisionPressure);
  const hydrologyPressure = clampConstraintLevel(hydrologySignals + referralPressure);
  const timingPressure = clampConstraintLevel(timingSignals + (phase === 'crunch' ? 1 : 0));
  const overallPressure = clampConstraintLevel(publicReviewPressure + hydrologyPressure + timingPressure);

  return {
    publicReview: publicReviewPressure,
    hydrology: hydrologyPressure,
    timing: timingPressure,
    overall: overallPressure,
    dominant: getDominantPermittingPressure({
      publicReview: publicReviewPressure,
      hydrology: hydrologyPressure,
      timing: timingPressure
    })
  };
}

function clampConstraintLevel(value) {
  return Math.max(0, Math.min(4, Math.round(value)));
}

function getDominantPermittingPressure(pressure) {
  const entries = Object.entries(pressure);
  if (!entries.length) return 'package';
  entries.sort((a, b) => b[1] - a[1]);
  const [label, value] = entries[0];
  if (value <= 0) return 'package';
  return label;
}

function formatConstraintPressure(state) {
  return `FOM/Public Review ${state.publicReview}/4 | Hydrology ${state.hydrology}/4 | Water Timing ${state.timing}/4`;
}

/**
 * Ensure the permitting-specific lazy state exists.
 * @param {Object} journey - Journey state
 * @returns {Array} Open revision tickets
 */
function ensurePermitRevisionBaseState(journey) {
  if (!journey.permits) journey.permits = {};
  if (!Array.isArray(journey.permits.revisionQueue)) {
    journey.permits.revisionQueue = [];
  }

  if (!Number.isFinite(journey.permits.revisionSeq)) {
    journey.permits.revisionSeq = journey.permits.revisionQueue.length;
  }

  if (!Number.isFinite(journey.scrutiny)) {
    const compliance = Number.isFinite(journey.regulations?.complianceScore)
      ? journey.regulations.complianceScore
      : 65;
    journey.scrutiny = clampPercent(Math.round(100 - compliance));
  } else {
    journey.scrutiny = clampPercent(Math.round(journey.scrutiny));
  }

  journey.permits.phase3Pressure = derivePermittingConstraintState(journey);

  return journey.permits.revisionQueue;
}

export function ensurePermittingRevisionState(journey) {
  const queue = ensurePermitRevisionBaseState(journey);
  const missingTickets = Math.max(0, (journey.permits.needsRevision || 0) - journey.permits.revisionQueue.length);
  for (let i = 0; i < missingTickets; i++) {
    const profile = pickRevisionProfile(journey, journey.permits.revisionQueue.length + i);
    const nextSeq = (journey.permits.revisionSeq || 0) + 1;
    journey.permits.revisionSeq = nextSeq;
    journey.permits.revisionQueue.push({
      id: `revision-${journey.day || 0}-${nextSeq}-${profile.id}`,
      profileId: profile.id,
      title: profile.title,
      summary: profile.summary,
      clean: profile.clean,
      fast: profile.fast,
      sourcePhase: journey.currentPhase || 'review',
      source: 'sync'
    });
  }

  return queue;
}

export function getPermittingConstraintState(journey) {
  return derivePermittingConstraintState(journey);
}

function scoreRevisionProfiles(journey) {
  const areaTags = Array.isArray(journey?.area?.tags) ? journey.area.tags : [];
  const phase = journey?.currentPhase || '';
  const pressure = journey?.permits?.phase3Pressure || derivePermittingConstraintState(journey);

  return PERMIT_REVISION_PROFILES
    .map((profile) => {
      let score = profile.tags.length === 0 ? 1 : 0;
      for (const tag of profile.tags) {
        if (areaTags.includes(tag)) score += 3;
      }
      if (phase === 'review' && profile.id !== 'package-completeness') score += 1;
      if (profile.pressure?.publicReview) {
        score += pressure.publicReview * profile.pressure.publicReview;
      }
      if (profile.pressure?.hydrology) {
        score += pressure.hydrology * profile.pressure.hydrology;
      }
      if (profile.pressure?.timing) {
        score += pressure.timing * profile.pressure.timing;
      }
      return { profile, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.profile);
}

function pickRevisionProfile(journey, index = 0) {
  const profiles = scoreRevisionProfiles(journey);
  if (!profiles.length) {
    return PERMIT_REVISION_PROFILES[PERMIT_REVISION_PROFILES.length - 1];
  }
  return profiles[index % profiles.length];
}

/**
 * Seed revision tickets for newly returned permits.
 * @param {Object} journey - Journey state
 * @param {number} count - Number of new deficiencies
 * @param {Object} source - Optional source metadata
 * @returns {Array} Open revision tickets
 */
export function seedPermitRevisionTickets(journey, count = 1, source = {}) {
  const queue = ensurePermitRevisionBaseState(journey);
  const total = Math.max(0, Math.floor(count));

  for (let i = 0; i < total; i++) {
    pushRevisionTicket(journey, queue.length + i, source);
  }

  return queue;
}

function pushRevisionTicket(journey, index, source = {}) {
  const profile = pickRevisionProfile(journey, index);
  const nextSeq = (journey.permits.revisionSeq || 0) + 1;
  journey.permits.revisionSeq = nextSeq;
  const ticket = {
    id: `revision-${journey.day || 0}-${nextSeq}-${profile.id}`,
    profileId: profile.id,
    title: profile.title,
    summary: profile.summary,
    clean: profile.clean,
    fast: profile.fast,
    sourcePhase: journey.currentPhase || 'review',
    source: source.type || source.reason || 'review'
  };
  journey.permits.revisionQueue.push(ticket);
  return ticket;
}

function applyRevisionEffects(journey, effects) {
  if (!effects) return;

  if (typeof effects.scrutiny === 'number') {
    journey.scrutiny = clampPercent((journey.scrutiny || 0) + effects.scrutiny);
  }

  if (typeof effects.compliance === 'number' && typeof journey.regulations?.complianceScore === 'number') {
    journey.regulations.complianceScore = clampPercent(
      journey.regulations.complianceScore + effects.compliance
    );
  }

  if (typeof effects.politicalCapital === 'number' && typeof journey.resources?.politicalCapital === 'number') {
    journey.resources.politicalCapital = clampPercent(
      journey.resources.politicalCapital + effects.politicalCapital
    );
  }

  if (effects.relationships && journey.relationships) {
    for (const [key, delta] of Object.entries(effects.relationships)) {
      if (typeof journey.relationships[key] === 'number') {
        journey.relationships[key] = clampPercent(journey.relationships[key] + delta);
      }
    }
  }

  if (typeof effects.reputation === 'number' && journey.protagonist) {
    journey.protagonist.reputation = clampPercent(
      (journey.protagonist.reputation || 0) + effects.reputation
    );
  }
}

/**
 * Resolve a permit revision ticket with a clean or fast response.
 * @param {Object} journey - Journey state
 * @param {string|null} ticketId - Optional deficiency id
 * @param {string} mode - 'clean' or 'fast'
 * @returns {Object} Result details
 */
export function resolvePermitRevisionResponse(journey, ticketId = null, mode = 'clean') {
  const queue = ensurePermittingRevisionState(journey);
  const selectedMode = mode === 'fast' ? 'fast' : 'clean';
  const ticketIndex = ticketId
    ? queue.findIndex((ticket) => ticket.id === ticketId)
    : 0;
  const ticket = ticketIndex >= 0 ? queue[ticketIndex] : null;

  if (!ticket) {
    return {
      resolved: false,
      mode: selectedMode,
      ticket: null,
      hoursUsed: 0,
      messages: ['No open deficiency file was available to respond to.']
    };
  }

  const response = ticket[selectedMode] || ticket.clean;
  const hoursUsed = Math.max(0, response.hours || 0);
  const availableHours = Number.isFinite(journey.hoursRemaining) ? journey.hoursRemaining : 0;

  if (availableHours < hoursUsed) {
    return {
      resolved: false,
      mode: selectedMode,
      ticket,
      hoursUsed: 0,
      messages: ['Not enough hours remain to address that deficiency today.']
    };
  }

  journey.hoursRemaining = availableHours - hoursUsed;
  applyProtagonistCost(journey, {
    energy: selectedMode === 'fast' ? 6 : 8,
    stress: selectedMode === 'fast' ? 7 : 4
  });
  applyRevisionEffects(journey, response);

  queue.splice(ticketIndex, 1);
  if (journey.permits) {
    journey.permits.needsRevision = Math.max(0, (journey.permits.needsRevision || 0) - 1);
    journey.permits.submitted = (journey.permits.submitted || 0) + 1;
  }

  const responseLabel = selectedMode === 'fast' ? 'Quick resubmission' : 'Clean response';
  const messages = [
    `${responseLabel} filed for ${ticket.title}.`,
    response.note
  ];

  if (selectedMode === 'fast') {
    messages.push('It keeps the file moving, but it adds heat to the review trail.');
  } else {
    messages.push('The file reads cleaner and should draw less scrutiny on the next pass.');
  }

  const pressure = journey?.permits?.phase3Pressure || derivePermittingConstraintState(journey);
  if (ticket.profileId === 'community-watershed' && pressure.hydrology > 0) {
    messages.push('The watershed response is now lined up with the hydrology concerns on the file.');
  } else if ((ticket.profileId === 'visual-quality' || ticket.profileId === 'consultation') && pressure.publicReview > 0) {
    messages.push('The public review package reads more defensible for ministry and external eyes.');
  } else if (ticket.profileId === 'fish-passage' && pressure.timing > 0) {
    messages.push('The crossing timing note now matches the in-water and seasonal constraints.');
  }

  return {
    resolved: true,
    mode: selectedMode,
    ticket,
    hoursUsed,
    messages
  };
}

/**
 * Run a permitting day (permit processing with referral tracking)
 * @param {Object} game - Game instance
 */
export async function runPermittingDay(game) {
  const { ui, journey } = game;
  ensurePermittingRevisionState(journey);
  const daysRemaining = journey.deadline - journey.day;
  const progressBeforeDay = getOperationalProgress(journey);
  let meetingsToday = 0;
  let crisisMode = daysRemaining <= 5;

  // Check for random event at start of day
  const event = checkForEvent(journey);
  if (event) {
    ui.clear();
    ui.writeHeader(`DAY ${journey.day} of ${journey.deadline} - ${(journey.currentPhase || 'PERMITTING').toUpperCase()}`);
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  // Inner loop: multiple actions per day until hours run out
  while (journey.hoursRemaining > 0) {
    ui.clear();
    ui.writeHeader(`DAY ${journey.day} of ${journey.deadline} - PERMITTING`);

    // Show protagonist status if using protagonist model
    if (journey.protagonist) {
      displayProtagonistStatus(ui, journey.protagonist);
    }

    // Show permit pipeline
    const permitProgress = Math.round((journey.permits.approved / journey.permits.target) * 100);
    ui.writeDivider('PERMIT PIPELINE');
    ui.write(`Days Remaining: ${journey.deadline - journey.day}`);
    ui.write(`Target: ${journey.permits.approved}/${journey.permits.target} approved (${permitProgress}%)`);
    ui.write('');

    const backlog = journey.permits.backlog || 0;
    const inReferral = journey.permits.inReferral || 0;
    const revisionQueue = journey.permits.revisionQueue || [];
    ui.write(`Pipeline Status:`);
    ui.write(`  Backlog: ${backlog} | Drafting: ${journey.permits.drafting || 0}`);
    ui.write(`  Submitted: ${journey.permits.submitted} | In Referral: ${inReferral}`);
    ui.write(`  In Review: ${journey.permits.inReview} | Needs Revision: ${journey.permits.needsRevision}`);
    ui.write(`  Scrutiny / Heat: ${Math.round(journey.scrutiny || 0)}%`);
    ui.write(`  Phase 3 Pressure: ${formatConstraintPressure(journey.permits.phase3Pressure || derivePermittingConstraintState(journey))}`);
    if (revisionQueue.length > 0) {
      ui.write(`  Open Deficiencies: ${revisionQueue.length}`);
      for (const ticket of revisionQueue.slice(0, 2)) {
        ui.write(`    - ${ticket.title}: ${ticket.summary}`);
      }
    }
    const areaSituation = getAreaSituationSummary(journey);
    if (areaSituation) {
      ui.write(`  Area Situation: ${areaSituation}`);
    }
    const discoveryNotes = getDiscoveryTagNotes(journey, journey.roleId || 'permitter', 2);
    if (discoveryNotes.length > 0) {
      ui.write(`  Carry-forward: ${discoveryNotes.join(' | ')}`);
    }
    ui.write('');

    // Show relationships (protagonist mode)
    if (journey.relationships) {
      ui.writeDivider('STAKEHOLDER RELATIONSHIPS');
      ui.write(`Ministry: ${journey.relationships.ministry}%`);
      ui.write(`First Nations: ${journey.relationships.nations}%`);
      ui.write(`Agencies: ${journey.relationships.agencies}%`);
      ui.write('');
    }

    // Show resources
    ui.writeDivider('RESOURCES');
    const deskResourceStatus = getFormattedResourceStatus(journey.resources, DESK_RESOURCES);
    for (const [, status] of Object.entries(deskResourceStatus)) {
      const icon = status.level === 'critical' ? '!!' : status.level === 'low' ? '!' : ' ';
      ui.write(`${icon} ${status.label}: ${status.display}`);
    }
    ui.write(`   Hours Remaining: ${journey.hoursRemaining}`);
    ui.write('');

    // Check protagonist energy
    if (journey.protagonist && journey.protagonist.energy <= 0) {
      ui.writeWarning('You are exhausted. Taking the rest of the day to recover.');
      break;
    }

    // Legacy energy check
    if (!journey.protagonist && journey.resources.energy <= 0) {
      ui.writeWarning('You are exhausted. The day ends early.');
      break;
    }

    // Build action options
    ui.writeDivider('WHAT DO YOU DO?');

    const actionOptions = buildActionOptions(journey);

    const action = await ui.promptChoice(`${journey.hoursRemaining} hours remaining:`, actionOptions);
    const actionId = action.value || 'end_day';

    // End day early
    if (actionId === 'end_day') {
      ui.write('');
      ui.write('You call it a day and head home to rest.');
      break;
    }

    // Execute the action
    await processAction(game, actionId);

    if (actionId === 'stakeholder_meeting') {
      meetingsToday += 1;
    }
    if (actionId === 'crisis_management') {
      crisisMode = true;
    }

    // Update status panels
    ui.updateAllStatus(journey);

  }

  // End of day processing
  await endOfDayProcessing(game, meetingsToday, crisisMode, progressBeforeDay);
}

/**
 * Display protagonist status
 * @param {Object} ui - UI instance
 * @param {Object} protagonist - Protagonist state
 */
function displayProtagonistStatus(ui, protagonist) {
  ui.writeDivider('YOUR STATUS');

  // Energy bar
  const energyBar = createBar(protagonist.energy, 10);
  ui.write(`Energy: [${energyBar}] ${protagonist.energy}%`);

  // Stress level
  const stressLevel = protagonist.stress > 70 ? 'HIGH' : protagonist.stress > 40 ? 'MODERATE' : 'LOW';
  ui.write(`Stress: ${stressLevel} (${protagonist.stress}%)`);

  // Reputation
  ui.write(`Reputation: ${protagonist.reputation}`);

  // Expertise (if available)
  if (protagonist.expertise) {
    const skills = Object.entries(protagonist.expertise)
      .map(([skill, value]) => `${capitalize(skill)}: ${value}`)
      .join(' | ');
    ui.write(`Expertise: ${skills}`);
  }

  ui.write('');
}

/**
 * Build action options based on journey state
 * @param {Object} journey - Journey state
 * @returns {Array} Action options
 */
function buildActionOptions(journey) {
  const actionOptions = [];
  const hoursLeft = journey.hoursRemaining || 8;
  const revisionQueue = ensurePermittingRevisionState(journey);

  // Permit-specific actions
  if (journey.permits.backlog > 0 && hoursLeft >= 2) {
    actionOptions.push({
      label: 'Draft Permit Application',
      description: '2h - Move a permit from backlog to drafting',
      value: 'draft_permit'
    });
  }

  if ((journey.permits.drafting || 0) > 0 && hoursLeft >= 2) {
    actionOptions.push({
      label: 'Submit Permit',
      description: '2h - Submit a drafted permit for review',
      value: 'submit_permit'
    });
  }

  const openRevisionTickets = revisionQueue.filter((ticket) => ticket && !ticket.resolved);
  for (const ticket of openRevisionTickets.slice(0, 3)) {
    if (hoursLeft >= ticket.clean.hours) {
      actionOptions.push({
        label: `Clean response: ${ticket.title}`,
        description: `${ticket.clean.hours}h - cleaner file, lower scrutiny`,
        value: `revise_permit:${ticket.id}:clean`
      });
    }
    if (hoursLeft >= ticket.fast.hours) {
      actionOptions.push({
        label: `Fast-track: ${ticket.title}`,
        description: `${ticket.fast.hours}h - quicker resubmission, more heat`,
        value: `revise_permit:${ticket.id}:fast`
      });
    }
  }

  // Referral management (permitting-specific)
  if ((journey.permits.inReferral || 0) > 0 && hoursLeft >= 2) {
    actionOptions.push({
      label: 'Follow Up on Referrals',
      description: '2h - Check status with referral agencies',
      value: 'follow_up_referrals'
    });
  }

  // Standard desk actions
  const standardActions = Object.entries(DESK_ACTIONS)
    .filter(([, action]) => action.hoursRequired <= hoursLeft)
    .map(([id, action]) => ({
      label: action.name,
      description: `${action.hoursRequired}h - ${action.description}`,
      value: id
    }));

  actionOptions.push(...standardActions);

  // Protagonist-specific actions
  if (journey.protagonist && hoursLeft >= 1) {
    actionOptions.push({
      label: 'Take a Break',
      description: '1h - Reduce stress, recover energy',
      value: 'rest'
    });
  }

  // Always add "End Day Early" option
  actionOptions.push({
    label: 'End Day Early',
    description: 'Rest and start fresh tomorrow',
    value: 'end_day'
  });

  return actionOptions;
}

/**
 * Process a selected action
 * @param {Object} game - Game instance
 * @param {string} actionId - Selected action ID
 */
async function processAction(game, actionId) {
  const { ui, journey } = game;
  const discoveryIds = new Set(getJourneyDiscoveryTags(journey).map((tag) => tag.id));

  if (typeof actionId === 'string' && actionId.startsWith('revise_permit')) {
    const [, ticketId, mode] = actionId.split(':');
    const result = resolvePermitRevisionResponse(journey, ticketId || null, mode || 'clean');

    ui.write('');
    if (result.messages.length > 0) {
      const primaryWriter = result.mode === 'fast' ? ui.writeWarning.bind(ui) : ui.writePositive.bind(ui);
      primaryWriter(result.messages[0]);
      for (const msg of result.messages.slice(1)) {
        ui.write(msg);
      }
    }
    return;
  }

  if (actionId === 'revise_permit') {
    const result = resolvePermitRevisionResponse(journey, null, 'clean');

    ui.write('');
    if (result.messages.length > 0) {
      const primaryWriter = result.mode === 'fast' ? ui.writeWarning.bind(ui) : ui.writePositive.bind(ui);
      primaryWriter(result.messages[0]);
      for (const msg of result.messages.slice(1)) {
        ui.write(msg);
      }
    }
    return;
  }

  // Permit-specific actions
  switch (actionId) {
    case 'draft_permit':
      if (journey.permits.backlog > 0) {
        journey.permits.backlog--;
        journey.permits.drafting = (journey.permits.drafting || 0) + 1;
        journey.hoursRemaining -= 2;
        applyProtagonistCost(journey, { energy: 8, stress: 5 });
        ui.write('Permit application drafted and ready for submission.');
      }
      return;

    case 'submit_permit':
      if ((journey.permits.drafting || 0) > 0) {
        journey.permits.drafting--;
        journey.permits.submitted++;
        journey.hoursRemaining -= 2;
        applyProtagonistCost(journey, { energy: 5, stress: 3 });

        // Some permits go to referral, some to direct review
        const hotFilePressure = (
          Number(discoveryIds.has('watershed_watch'))
          + Number(discoveryIds.has('cultural_hold'))
          + Number(discoveryIds.has('community_visibility'))
          + Number(discoveryIds.has('access_rehab'))
        );
        const pressure = journey?.permits?.phase3Pressure || derivePermittingConstraintState(journey);
        const referralChance = Math.min(0.75, 0.18
          + hotFilePressure * 0.06
          + pressure.publicReview * 0.06
          + pressure.hydrology * 0.05
          + pressure.timing * 0.04);
        if (hotFilePressure > 0) {
          journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + 1);
        }
        if (pressure.overall > 0) {
          journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + Math.max(0, Math.floor(pressure.overall / 3)));
        }
        if (Math.random() < referralChance) {
          journey.permits.inReferral = (journey.permits.inReferral || 0) + 1;
          journey.permits.submitted--;
          ui.write(hotFilePressure > 0
            ? 'Permit submitted - the hot spots in the file sent it into referral.'
            : 'Permit submitted - sent for First Nations referral.');
        } else {
          ui.write('Permit submitted for ministry review.');
        }
      }
      return;

    case 'follow_up_referrals':
      const referrals = journey.permits.inReferral || 0;
      if (referrals > 0) {
        journey.hoursRemaining -= 2;
        applyProtagonistCost(journey, { energy: 6, stress: 4 });

        // Chance to advance referrals
        if (Math.random() < 0.5) {
          journey.permits.inReferral--;
          journey.permits.inReview++;
          if (journey.relationships) {
            const lift = discoveryIds.has('cultural_hold') ? 4 : 3;
            journey.relationships.nations = Math.min(100, journey.relationships.nations + lift);
          }
          journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 2);
          ui.write('Referral complete - permit moved to ministry review.');
        } else {
          ui.write('Referral still in progress. Maintained good communication.');
          if (journey.relationships) {
            journey.relationships.nations = Math.min(100, journey.relationships.nations + 1);
          }
          journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 1);
        }
      }
      return;

    case 'rest':
      if (journey.protagonist) {
        journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 15);
        journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 10);
      }
      journey.hoursRemaining -= 1;
      ui.write('You take a short break. Feeling a bit better.');
      return;

    default:
      // Fall through to standard desk actions
      break;
  }

  // Standard desk action handling
  try {
    const result = executeDeskDay(journey, actionId);
    applyProtagonistCost(journey, { energy: 10, stress: 5 });

    ui.write('');
    if (result && result.messages) {
      for (const msg of result.messages) {
        ui.write(msg);
      }
    }
  } catch (error) {
    console.error('Action execution error:', error);
    ui.writeDanger(`Error executing action: ${error.message}`);
  }
}

/**
 * Apply protagonist costs
 * @param {Object} journey - Journey state
 * @param {Object} costs - { energy, stress }
 */
function applyProtagonistCost(journey, costs) {
  if (!journey.protagonist) return;

  if (costs.energy) {
    journey.protagonist.energy = Math.max(0, journey.protagonist.energy - costs.energy);
  }
  if (costs.stress) {
    journey.protagonist.stress = Math.min(100, journey.protagonist.stress + costs.stress);
  }
}

/**
 * End of day processing
 * @param {Object} game - Game instance
 * @param {number} meetingsToday - Number of meetings held
 * @param {boolean} crisisMode - Whether in crisis mode
 */
async function endOfDayProcessing(game, meetingsToday, crisisMode, progressBeforeDay) {
  const { ui, journey } = game;

  ui.write('');
  ui.write('--- End of Day ---');

  try {
    // Process permit pipeline (automatic advancement)
    processPermitPipeline(ui, journey);

    if ((journey.permits.inReferral || 0) >= 3) {
      const drag = Math.min(3, Math.ceil(journey.permits.inReferral / 2));
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - drag);
      if (journey.protagonist) {
        journey.protagonist.stress = Math.min(100, journey.protagonist.stress + drag * 2);
      }
      ui.writeWarning(`Referral bottlenecks are piling up. Political capital -${drag}.`);
    }

    if (journey.day >= Math.max(10, journey.deadline - 10) && (journey.permits.backlog || 0) >= 4) {
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 2);
      ui.writeWarning('Senior leadership is pressing for queue reduction. Political capital -2.');
    }

    // Apply daily resource consumption (legacy support)
    if (!journey.protagonist) {
      const consumption = calculateDeskConsumption({
        meetings: meetingsToday,
        crisisMode
      });

      const consumptionResult = applyConsumption(journey.resources, consumption, DESK_RESOURCES);
      journey.resources = applyDeskRegen(consumptionResult.resources);

      if (consumptionResult.warnings.length > 0) {
        for (const warning of consumptionResult.warnings) {
          ui.writeWarning(`${warning.resource}: ${warning.value} ${warning.unit} remaining`);
        }
      }
    }

    // Protagonist recovery
    if (journey.protagonist) {
      journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 25);
      journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 8);
    }

    // Advance to next day
    journey.day++;
    journey.hoursRemaining = 8;
    journey.currentPhase = getDeskPhase(journey);

    // Update status panels
    ui.updateAllStatus(journey);

    const milestoneMessages = [];
    recordProgressMilestones(journey, progressBeforeDay, milestoneMessages, Math.max(1, journey.day - 1));
    for (const message of milestoneMessages) {
      ui.writePositive(message);
    }
  } catch (error) {
    console.error('End of day processing error:', error);
    ui.writeDanger('An error occurred. Please try again.');
  }

  // Contextual continue with deadline info (Phase 6.1)
  const daysLeft = journey.deadline - journey.day;
  const permitPct = journey.permits.target > 0
    ? Math.round((journey.permits.approved / journey.permits.target) * 100) : 0;
  const continueLabel = daysLeft > 0
    ? `Start next day... (${daysLeft} days left, ${permitPct}% approved)`
    : 'Start next day... (DEADLINE)';
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
}

/**
 * Process permit pipeline - automatic advancement
 * @param {Object} ui - UI instance
 * @param {Object} journey - Journey state
 */
function processPermitPipeline(ui, journey) {
  const queue = ensurePermittingRevisionState(journey);
  const pressure = journey?.permits?.phase3Pressure || derivePermittingConstraintState(journey);

  // Submitted permits may advance to inReview
  if (journey.permits.submitted > 0) {
    const advancing = Math.floor(journey.permits.submitted * 0.3);
    if (advancing > 0) {
      journey.permits.submitted -= advancing;
      journey.permits.inReview += advancing;
      ui.write(`${advancing} permit(s) moved to active review.`);
    }
  }

  // InReview permits may be approved or need revision
  if (journey.permits.inReview > 0) {
    const reviewed = Math.ceil(journey.permits.inReview * 0.4);
    const scrutinyPenalty = Math.min(0.25, (journey.scrutiny || 0) / 400);
    const phase3Penalty = Math.min(0.2, (
      pressure.publicReview * 0.03
      + pressure.hydrology * 0.025
      + pressure.timing * 0.02
    ));
    const approvalRate = Math.max(0.4, 0.72 - scrutinyPenalty - phase3Penalty);
    const approved = Math.floor(reviewed * approvalRate);
    const revisions = reviewed - approved;

    if (approved > 0) {
      journey.permits.inReview -= approved;
      journey.permits.approved += approved;
      ui.writePositive(`${approved} permit(s) APPROVED!`);
    }
    if (revisions > 0) {
      journey.permits.inReview -= revisions;
      journey.permits.needsRevision += revisions;
      for (let i = 0; i < revisions; i++) {
        pushRevisionTicket(journey, queue.length + i, {
          type: 'review',
          reason: 'returned_for_revision',
          pressure: pressure.dominant
        });
      }
      ui.writeWarning(`${revisions} permit(s) returned for revision.`);
    }
  }

  // Keep the revision queue aligned with the backlog if anything drifted.
  if (journey.permits.needsRevision > queue.length) {
    seedPermitRevisionTickets(journey, journey.permits.needsRevision - queue.length, {
      type: 'repair',
      reason: 'queue_sync'
    });
  }
}

/**
 * Get current desk phase based on day
 * @param {Object} journey - Journey state
 * @returns {string} Phase name
 */
function getDeskPhase(journey) {
  const day = journey.day;
  const deadline = journey.deadline || 30;
  const phaseLength = Math.max(1, Math.floor(deadline / 3));

  if (day > deadline - 4) return 'crunch';
  if (day > phaseLength * 2) return 'approval';
  if (day > phaseLength) return 'review';
  return 'planning';
}

/**
 * Handle an event
 * @param {Object} game - Game instance
 * @param {Object} event - Event to handle
 */
async function handleEvent(game, event) {
  const { ui, journey } = game;
  const formatted = formatEventForDisplay(event, journey.journeyType);

  ui.write('');
  ui.writeHeader(`EVENT: ${formatted.title}`);
  ui.write(formatted.description);
  ui.write('');

  // Build options
  const options = formatted.options.map((opt, index) => {
    const pieces = [];
    if (opt.hint) pieces.push(opt.hint);
    return {
      label: opt.label,
      description: pieces.length ? `[${pieces.join(' | ')}]` : '',
      value: index
    };
  });

  const choice = await ui.promptChoice('What do you do?', options);
  const optionIndex = typeof choice.value === 'number' ? choice.value : 0;
  const selectedOption = event.options[optionIndex];

  const result = resolveEvent(journey, event, selectedOption);

  ui.write('');
  for (const msg of result.messages) {
    ui.write(msg);
  }

  if (selectedOption.gameOver) {
    game.gameOver = true;
    journey.endReason = selectedOption.gameOverReason || 'Event outcome';
  }
}

/**
 * Create a visual progress bar
 * @param {number} value - Current value (0-100)
 * @param {number} width - Bar width in characters
 * @returns {string} Progress bar string
 */
function createBar(value, width) {
  const filled = Math.round((value / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Capitalize first letter
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
