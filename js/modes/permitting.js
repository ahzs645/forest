/**
 * Permitting Mode Runner
 * Protagonist-based permit processing and stakeholder management
 * YOU are the Permitting Specialist - no crew, just pipeline and relationships
 */

import { checkForEvent } from '../events.js';
import { handleEvent } from './shared/handleEvent.js';
import { calculateDeskConsumption, applyConsumption, applyDeskRegen, getFormattedResourceStatus, DESK_RESOURCES } from '../resources.js';
import { executeDeskDay, DESK_ACTIONS } from '../journey.js';
import { getOperationalProgress, recordProgressMilestones } from '../journey.js';
import { getDiscoveryTagNotes, getJourneyDiscoveryTags } from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';
import { formatRoadAssetSummary, getPermittingRoadAssetContext } from '../data/roadAssetIntel.js';
import {
  advanceProfessionalComplianceChain,
  applyProfessionalComplianceShift,
  ensureProfessionalComplianceState,
  getProfessionalComplianceSnapshot,
} from '../engine.js';

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
      engineering: 4,
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

// Paperwork load at/above this level makes the Compliance Admin lane the
// genuinely urgent move — below it, admin work is available but not the
// callout, so players aren't trained to spam it while pipeline win
// conditions (permits approved) sit untouched. A permitter's starting
// paperworkLoad already runs ~17-21 once area burden is folded in (engine
// baseline 10 + half the area's compliance-profile burden, which spans
// 14-22 across areas — see js/engine/professional.js and the
// AREA_COMPLIANCE_PROFILES entries in js/data/professionalPractice.js), and
// ordinary pipeline work (drafting/submitting/processing permits) adds
// another 2-3 per action. 20 sits just above that starting band and below
// the paperwork-burn consequence line (js/engine/effects.js triggers at
// 20+), so the callout starts quiet, only lights up once neglect actually
// pushes the load past where it starts to bite, and clears again once a
// diligent admin cycle brings it back down.
const PAPERWORK_ADMIN_URGENT_THRESHOLD = 20;

function ensurePermittingProfessionalState(journey) {
  return ensureProfessionalComplianceState(journey);
}

function getPermittingProfessionalSnapshot(journey) {
  return getProfessionalComplianceSnapshot(journey);
}

function describePermittingProfessionalSnapshot(snapshot) {
  if (!snapshot) return 'Registration n/a | CPD n/a | Paperwork n/a | Audit n/a';
  const burden = snapshot.areaBurdenLabel ? ` | ${snapshot.areaBurdenLabel}` : '';
  return `Registration: ${snapshot.registrationStatus} | CPD: ${snapshot.cpdHours}/${snapshot.cpdTarget}h | Paperwork: ${snapshot.paperworkLoad} | Audit: ${snapshot.auditExposure}${burden}`;
}

function getPermittingProfessionalIssues(journey) {
  const snapshot = getPermittingProfessionalSnapshot(journey);
  if (!snapshot) return [];

  const reasons = [];
  if (!snapshot.registrationActive) {
    reasons.push(`registration is ${snapshot.registrationStatus}`);
  }
  if (snapshot.cpdGap > 0) {
    reasons.push(`CPD gap ${snapshot.cpdGap}h`);
  }
  if (snapshot.competenceRisk >= 35) {
    reasons.push(`competence risk ${snapshot.competenceRisk}%`);
  }
  if (snapshot.paperworkLoad >= 40) {
    reasons.push(`paperwork load ${snapshot.paperworkLoad}`);
  }
  if (snapshot.auditExposure >= 35) {
    reasons.push(`audit exposure ${snapshot.auditExposure}`);
  }
  return reasons;
}

function applyPermittingProfessionalWork(journey, changes = {}) {
  const professional = ensurePermittingProfessionalState(journey);
  if (!professional) return null;
  return applyProfessionalComplianceShift(journey, changes);
}

function getPermittingPaperworkChainId(journey) {
  const tags = new Set((journey?.area?.tags || []).map((tag) => String(tag).toLowerCase()));
  const discoveryIds = new Set(getJourneyDiscoveryTags(journey).map((tag) => tag.id));

  if (tags.has('road') || tags.has('access') || tags.has('winter-road') || discoveryIds.has('access_rehab')) {
    return 'roadPermit';
  }
  if (tags.has('archaeology') || tags.has('cultural') || tags.has('heritage') || discoveryIds.has('cultural_hold')) {
    return 'archaeology';
  }
  if (tags.has('camp') || tags.has('helipad') || tags.has('dump') || tags.has('special-use')) {
    return 'specialUse';
  }
  return 'registration';
}

function formatPermittingStageLabel(stage) {
  return String(stage || 'review')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getPermittingLaneAction(journey) {
  const chainId = getPermittingPaperworkChainId(journey);
  const professional = getPermittingProfessionalSnapshot(journey);
  const chain = professional?.chains?.[chainId] || null;
  const stepIndex = chain
    ? Math.min(chain.stepIndex, Math.max(0, chain.steps.length - 1))
    : 0;
  const stage = chain?.steps?.[stepIndex] || (chainId === 'registration' ? 'renewal' : 'screen');
  const laneMap = {
    registration: 'Professional file',
    roadPermit: 'Road permit file',
    archaeology: 'Archaeology file',
    specialUse: 'Special-use file'
  };
  const labelMap = {
    registration: professional?.registrationActive ? 'Compliance Admin' : 'Renew Registration',
    roadPermit: 'Road Permit File',
    archaeology: 'Archaeology File',
    specialUse: 'Special-Use File'
  };

  return {
    chainId,
    chain,
    laneLabel: laneMap[chainId] || 'Professional file',
    actionLabel: labelMap[chainId] || 'Compliance Admin',
    stage,
    stageLabel: formatPermittingStageLabel(stage),
    stageIndex: chain ? Math.min(chain.stepIndex + 1, chain.steps.length) : 1,
    stageCount: chain?.steps?.length || 1
  };
}

function getPermittingLaneProgressSummary(laneAction, permits) {
  return `${laneAction.actionLabel}: ${laneAction.stageIndex}/${laneAction.stageCount} | Backlog ${permits?.backlog || 0} | Drafting ${permits?.drafting || 0} | Submitted ${permits?.submitted || 0} | Review ${permits?.inReview || 0}`;
}

function progressPermittingPaperworkChain(journey, chainId, stepCount = 1) {
  const chain = advanceProfessionalComplianceChain(journey, chainId, stepCount);
  if (!chain) {
    return null;
  }

  const stepIndex = Math.min(chain.stepIndex, chain.steps.length) - 1;
  const stage = stepIndex >= 0 ? chain.steps[stepIndex] : chain.steps[0];
  return { chain, stage };
}

/**
 * Compliance-metric deltas for a single Compliance Admin click on a given
 * paperwork chain/stage. Pulled out as a pure lookup (rather than inlined in
 * processAction) so the per-cycle paperwork math can be covered by a
 * regression test without driving the full UI loop.
 *
 * Per full diligent cycle (every stage clicked once, in order):
 *   registration: -8 paperworkLoad per click (single-stage relief, no ladder)
 *   roadPermit:   screen +1, map +1, submit +1, maintenance -6   => net -3 / 4 clicks
 *   specialUse:   screen +1, bundle +1, submit +1, conditions -6 => net -3 / 4 clicks
 *   archaeology:  screen +1, field-review 0, permit-context -2   => net -1 / 3 clicks
 * roadPermit/specialUse used to net +1 per cycle (screen/map/submit each
 * added paperwork and only the final stage relieved -2) — a treadmill that
 * lost ground against the ~+2 ambient paperwork growth from ordinary permit
 * work. The final stage now relieves -6 so a full cycle nets clearly
 * negative, in line with (here, better than) archaeology.
 *
 * @param {string} chainId - 'registration' | 'roadPermit' | 'specialUse' | 'archaeology'
 * @param {string} stage - current stage name within the chain
 * @returns {{changes: Object, message: string}|null}
 */
export function getPaperworkChainStageEffect(chainId, stage) {
  if (chainId === 'registration') {
    return {
      changes: {
        registrationStatus: 'active',
        cpdHours: 8,
        competenceRisk: -6,
        paperworkLoad: -8,
        auditExposure: -5,
      },
      message: 'Registration renewal and CPD housekeeping are back under control.'
    };
  }

  if (chainId === 'roadPermit') {
    if (stage === 'screen') {
      return {
        changes: { paperworkLoad: 1, auditExposure: 0, competenceRisk: -1 },
        message: 'Road permit screening confirms the access needs district review.'
      };
    }
    if (stage === 'map') {
      return {
        changes: { cpdHours: 1, paperworkLoad: 1, auditExposure: 0 },
        message: 'Road permit mapping and Exhibit A detail now sit in the drafting stack.'
      };
    }
    if (stage === 'submit') {
      return {
        changes: { cpdHours: 1, paperworkLoad: 1, competenceRisk: -1, auditExposure: 0 },
        message: 'Road permit submission package is aligned and moving into review.'
      };
    }
    return {
      changes: { paperworkLoad: -6, auditExposure: -2, competenceRisk: -1 },
      message: 'Road maintenance notes and deactivation planning are cleaned up.'
    };
  }

  if (chainId === 'specialUse') {
    if (stage === 'screen') {
      return {
        changes: { paperworkLoad: 1, auditExposure: 0 },
        message: 'Special-use screening confirms the site needs a separate package.'
      };
    }
    if (stage === 'bundle') {
      return {
        changes: { cpdHours: 1, paperworkLoad: 1, auditExposure: 0 },
        message: 'Special-use bundle assembled and queued with the active permit work.'
      };
    }
    if (stage === 'submit') {
      return {
        changes: { cpdHours: 1, paperworkLoad: 1, competenceRisk: -1, auditExposure: 0 },
        message: 'Special-use submission is ready for district review.'
      };
    }
    return {
      changes: { paperworkLoad: -6, auditExposure: -2 },
      message: 'Special-use conditions are lined up and the file is cleaner.'
    };
  }

  if (chainId === 'archaeology') {
    if (stage === 'screen') {
      return {
        changes: { paperworkLoad: 1, auditExposure: 0 },
        message: 'Archaeology screening shows the file needs a proper field review path.'
      };
    }
    if (stage === 'field-review') {
      return {
        changes: { cpdHours: 1, paperworkLoad: 0, competenceRisk: -1, auditExposure: -2 },
        message: 'Field review notes and consultation context are better aligned.'
      };
    }
    return {
      changes: { paperworkLoad: -2, auditExposure: -2, competenceRisk: -1 },
      message: 'Archaeology context is folded into the permit package.'
    };
  }

  return null;
}

function pushPermittingGuideStep(steps, text) {
  if (!text || steps.includes(text)) {
    return;
  }
  steps.push(text);
}

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
  const roadIntel = getPermittingRoadAssetContext(journey);
  const professional = getPermittingProfessionalSnapshot(journey);
  const needRevisionPressure = Math.min(2, Math.floor((permits.needsRevision || 0) / 2));
  const referralPressure = Math.min(2, Math.floor((permits.inReferral || 0) / 2));
  const professionalPressure = professional?.registrationActive
    ? Math.min(2, Math.floor((professional.auditExposure + professional.competenceRisk) / 40))
    : 2;

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

  const engineeringSignals = countSignals(
    areaTags.has('road'),
    areaTags.has('access'),
    areaTags.has('steep'),
    areaTags.has('karst'),
    discoveryIds.has('access_rehab')
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

  const engineeringPressure = clampConstraintLevel(engineeringSignals + roadIntel.engineering + needRevisionPressure);
  const publicReviewPressure = clampConstraintLevel(publicReviewSignals + roadIntel.publicReview + needRevisionPressure);
  const hydrologyPressure = clampConstraintLevel(hydrologySignals + roadIntel.hydrology + referralPressure);
  const timingPressure = clampConstraintLevel(timingSignals + roadIntel.timing + (phase === 'crunch' ? 1 : 0));
  const overallPressure = clampConstraintLevel(engineeringPressure + publicReviewPressure + hydrologyPressure + timingPressure + professionalPressure);

  return {
    engineering: engineeringPressure,
    publicReview: publicReviewPressure,
    hydrology: hydrologyPressure,
    timing: timingPressure,
    overall: overallPressure,
    dominant: getDominantPermittingPressure({
      engineering: engineeringPressure,
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
  const priority = {
    engineering: 4,
    hydrology: 3,
    timing: 2,
    publicReview: 1
  };
  entries.sort((a, b) => (b[1] - a[1]) || ((priority[b[0]] || 0) - (priority[a[0]] || 0)));
  const [label, value] = entries[0];
  if (value <= 0) return 'package';
  return label;
}

function getPermittingPressureLabel(pressureId) {
  const labels = {
    engineering: 'Engineering',
    publicReview: 'FOM / Public Review',
    hydrology: 'Hydrology',
    timing: 'Timing',
    package: 'Package'
  };
  return labels[pressureId] || 'Package';
}

function buildPermittingActionGuidance(journey) {
  const laneAction = getPermittingLaneAction(journey);
  const revisionQueue = ensurePermittingRevisionState(journey).filter((ticket) => ticket && !ticket.resolved);
  const pressure = journey?.permits?.phase3Pressure || derivePermittingConstraintState(journey);
  const professionalIssues = getPermittingProfessionalIssues(journey);
  const steps = [];
  let lane = laneAction.laneLabel;
  let headline = `${laneAction.actionLabel} to keep the active file moving.`;

  if (revisionQueue.length > 0) {
    const ticket = revisionQueue[0];
    lane = 'Revision queue';
    headline = `Clean response: ${ticket.title} to keep scrutiny from stacking on the file.`;
    pushPermittingGuideStep(steps, ticket.summary);
    pushPermittingGuideStep(steps, 'Use the clean response first unless you need a desperate fast resubmission.');
    return { lane, headline, steps };
  }

  if ((journey.permits.inReferral || 0) > 0) {
    lane = 'Referral queue';
    headline = 'Follow Up on Referrals to move live files back into ministry review.';
    pushPermittingGuideStep(steps, 'A stuck referral slows every downstream approval.');
    if (pressure.publicReview > 0 || pressure.hydrology > 0) {
      pushPermittingGuideStep(steps, `Dominant pressure: ${getPermittingPressureLabel(pressure.dominant)}.`);
    }
    return { lane, headline, steps };
  }

  if (laneAction.chainId !== 'registration' && !laneAction.chain?.complete) {
    lane = laneAction.laneLabel;
    headline = `${laneAction.actionLabel} to advance the ${laneAction.stageLabel.toLowerCase()} stage of the active file.`;
    pushPermittingGuideStep(steps, `Current stage: ${laneAction.stageLabel}.`);
    if ((journey.permits.backlog || 0) > 0) {
      pushPermittingGuideStep(steps, 'This lane can convert backlog into drafting or submitted work as it advances.');
    }
    return { lane, headline, steps };
  }

  if (professionalIssues.length > 0) {
    lane = 'Professional file';
    headline = `${laneAction.actionLabel} to clear ${professionalIssues[0]} before more heat lands on the queue.`;
    pushPermittingGuideStep(steps, 'Registration, CPD, and paperwork drag all feed scrutiny.');
    return { lane, headline, steps };
  }

  if ((journey.permits.drafting || 0) > 0) {
    lane = 'Submission stack';
    headline = 'Submit Permit to move drafted files into review before the day runs out.';
    pushPermittingGuideStep(steps, 'Drafted files do nothing until they are pushed into the review queue.');
    return { lane, headline, steps };
  }

  if ((journey.permits.backlog || 0) > 0) {
    lane = 'Permit stack';
    headline = 'Draft Permit Application to keep backlog from choking the queue.';
    pushPermittingGuideStep(steps, 'Drafting is still the cleanest way to convert backlog into throughput.');
    return { lane, headline, steps };
  }

  if ((journey.permits.inReview || 0) > 0) {
    lane = pressure.publicReview >= pressure.engineering ? 'Consultation support' : 'Review support';
    headline = pressure.publicReview >= pressure.engineering
      ? 'Stakeholder Meeting to keep the public-facing file defensible while review is active.'
      : 'Process Permits to keep active reviews moving through the ministry queue.';
    pushPermittingGuideStep(steps, `Dominant pressure: ${getPermittingPressureLabel(pressure.dominant)}.`);
    return { lane, headline, steps };
  }

  pushPermittingGuideStep(steps, 'Use support actions only after the live file lane is moving.');
  return { lane, headline, steps };
}

function formatConstraintPressure(state) {
  return `Engineering ${state?.engineering || 0}/4 | FOM/Public Review ${state?.publicReview || 0}/4 | Hydrology ${state?.hydrology || 0}/4 | Water Timing ${state?.timing || 0}/4`;
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
  const roadIntel = getPermittingRoadAssetContext(journey);

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
      if (profile.pressure?.engineering) {
        score += pressure.engineering * profile.pressure.engineering;
      }
      if (profile.pressure?.hydrology) {
        score += pressure.hydrology * profile.pressure.hydrology;
      }
      if (profile.pressure?.timing) {
        score += pressure.timing * profile.pressure.timing;
      }
      if (roadIntel.hasData) {
        if (profile.id === roadIntel.dominantProfileId) {
          score += 6;
        }
        if (profile.id === 'access-engineering') {
          score += roadIntel.engineering * 2;
        }
        if (profile.id === 'community-watershed') {
          score += roadIntel.hydrology * 2;
        }
        if (profile.id === 'fish-passage') {
          score += roadIntel.timing * 2;
        }
        if (profile.id === 'visual-quality' || profile.id === 'consultation') {
          score += roadIntel.publicReview;
        }
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
  const roadIntel = getPermittingRoadAssetContext(journey);
  if (ticket.profileId === 'community-watershed' && pressure.hydrology > 0) {
    messages.push('The watershed response is now lined up with the hydrology concerns on the file.');
  } else if (ticket.profileId === 'access-engineering' && roadIntel.engineering > 0) {
    messages.push('The road package now lines up with the access engineering issues on the file.');
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
  ensurePermittingProfessionalState(journey);
  const daysRemaining = journey.deadline - journey.day;
  const progressBeforeDay = getOperationalProgress(journey);
  let meetingsToday = 0;
  let crisisMode = daysRemaining <= 5;

  // Check for random event at start of day. Day 1 is event-free onboarding so
  // the player sees the normal permitting loop before any exception arrives.
  const event = journey.day > 1 ? checkForEvent(journey) : null;
  if (event) {
    ui.clear();
    ui.writeHeader(`DAY ${journey.day} of ${journey.deadline} - ${(journey.currentPhase || 'PERMITTING').toUpperCase()}`);
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  // Inner loop: multiple actions per day until hours run out
  while (journey.hoursRemaining > 0) {
    displayPermittingHeader(ui, journey);

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

    const { primary, support } = buildActionOptions(journey);

    // Resolve the menu, drilling into the support submenu when chosen — the same
    // shape recon uses, so the primary turn stays a clean set of decisions.
    let actionId = 'end_day';
    while (true) {
      const action = await ui.promptChoice(`${journey.hoursRemaining} hours remaining:`, primary);
      const chosen = action.value || 'end_day';
      if (chosen === 'support_menu') {
        const sub = await ui.promptChoice('Office & support:', [
          ...support,
          { label: 'Back', description: 'Return to the main menu', value: 'support_back' }
        ]);
        const subChoice = sub.value || 'support_back';
        if (subChoice === 'support_back') {
          displayPermittingHeader(ui, journey);
          continue;
        }
        actionId = subChoice;
        break;
      }
      actionId = chosen;
      break;
    }

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
 * Display compact permitting header (Phase 6.2)
 */
function displayPermittingHeader(ui, journey) {
  const daysRemaining = Math.max(0, journey.deadline - journey.day);
  const guidance = buildPermittingActionGuidance(journey);
  const laneAction = getPermittingLaneAction(journey);
  ui.clear();
  ui.writeHeader(`DAY ${journey.day} of ${journey.deadline} - PERMITTING`);

  // Status renders in the mission dashboard pane; energy/stress live in the
  // protagonist pane and budget/political capital in the supplies pane.
  const permits = journey.permits;
  const permitProgress = Math.round((permits.approved / permits.target) * 100);

  const facts = [
    { label: 'Days left', value: `${daysRemaining}`, tone: daysRemaining <= 5 ? 'danger' : daysRemaining <= 10 ? 'warn' : undefined },
    { label: 'Hours left', value: `${journey.hoursRemaining}h` },
    { label: 'Lane', value: guidance.lane },
    { label: 'Stage', value: laneAction.stageLabel }
  ];

  // The pipeline is the mode's real state machine — as a checklist it reads
  // as flow: each stage shows its count, done once nothing is stuck in it.
  const checklist = [
    { label: `backlog ${permits.backlog || 0}`, done: (permits.backlog || 0) === 0 },
    { label: `drafting ${permits.drafting || 0}`, done: (permits.drafting || 0) === 0 },
    { label: `submitted ${permits.submitted}`, done: permits.submitted === 0 },
    { label: `in review ${permits.inReview}`, done: permits.inReview === 0 },
    { label: `approved ${permits.approved}/${permits.target}`, done: permits.approved >= permits.target }
  ];

  const alerts = [];
  if (daysRemaining <= 5) {
    alerts.push({ level: 'danger', text: `Deadline pressure: ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining.` });
  }

  ui.setMissionStatus?.({
    objective: `Approve ${permits.target} permits by Day ${journey.deadline} (${permits.approved} done).`,
    meter: { label: 'Approved', value: permitProgress, text: `${permits.approved}/${permits.target}` },
    facts,
    checklist,
    guidance: guidance.headline || null,
    alerts
  });
}

/**
 * The full file, on demand: pipeline detail, pressure, relationships, resources
 */
function displayPermittingBriefing(ui, journey) {
  const guidance = buildPermittingActionGuidance(journey);
  const laneAction = getPermittingLaneAction(journey);
  const revisionQueue = journey.permits.revisionQueue || [];

  ui.write('');
  ui.writeHeader('PERMIT FILE REVIEW');

  ui.write(`Pipeline Status:`);
  ui.write(`  Backlog: ${journey.permits.backlog || 0} | Drafting: ${journey.permits.drafting || 0}`);
  ui.write(`  Submitted: ${journey.permits.submitted} | In Referral: ${journey.permits.inReferral || 0}`);
  ui.write(`  In Review: ${journey.permits.inReview} | Needs Revision: ${journey.permits.needsRevision}`);
  ui.write(`  Scrutiny / Heat: ${Math.round(journey.scrutiny || 0)}%`);
  ui.write(`  Phase 3 Pressure: ${formatConstraintPressure(journey.permits.phase3Pressure || derivePermittingConstraintState(journey))}`);
  ui.write(`  Lane Focus: ${guidance.lane} | Stage: ${laneAction.stageLabel}`);
  ui.write(`  Lane Progress: ${getPermittingLaneProgressSummary(laneAction, journey.permits)}`);
  ui.write(`  Next Best Move: ${guidance.headline}`);
  if (guidance.steps.length > 0) {
    ui.write(`  Follow-up: ${guidance.steps.join(' -> ')}`);
  }
  ui.write(`  ${describePermittingProfessionalSnapshot(getPermittingProfessionalSnapshot(journey))}`);
  const roadIntel = getPermittingRoadAssetContext(journey);
  if (roadIntel.hasData) {
    ui.write(`  Road Intel: ${formatRoadAssetSummary(roadIntel) || roadIntel.note}`);
  }
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

  if (journey.relationships) {
    ui.writeDivider('STAKEHOLDER RELATIONSHIPS');
    ui.write(`Ministry: ${journey.relationships.ministry}%`);
    ui.write(`First Nations: ${journey.relationships.nations}%`);
    ui.write(`Agencies: ${journey.relationships.agencies}%`);
  }

  ui.writeDivider('RESOURCES');
  const deskResourceStatus = getFormattedResourceStatus(journey.resources, DESK_RESOURCES);
  for (const [, status] of Object.entries(deskResourceStatus)) {
    const icon = status.level === 'critical' ? '!!' : status.level === 'low' ? '!' : ' ';
    ui.write(`${icon} ${status.label}: ${status.display}`);
  }

  if (journey.protagonist?.expertise) {
    const skills = Object.entries(journey.protagonist.expertise)
      .map(([skill, value]) => `${capitalize(skill)}: ${value}`)
      .join(' | ');
    ui.write(`Expertise: ${skills}`);
  }
}

/**
 * Build action options based on journey state
 * @param {Object} journey - Journey state
 * @returns {Array} Action options
 */
export function buildActionOptions(journey) {
  const hoursLeft = journey.hoursRemaining || 8;
  const revisionQueue = ensurePermittingRevisionState(journey);
  const laneAction = getPermittingLaneAction(journey);

  // The turn is split so it reads as a decision, not an audit:
  //   primary  = the best move + core pipeline throughput (kept ≤6)
  //   support  = relationships, morale, crisis, recovery — one level down
  const primary = [];
  const support = [];

  // The lane action is always available, but it only earns the "Best move"
  // callout when admin is actually urgent — otherwise players learn to spam
  // it every turn while the real pipeline (backlog/drafting/review) sits
  // untouched. Urgency mirrors the paperwork-burn consequence: a lapsed
  // registration is always urgent, and a climbing paperwork load becomes
  // urgent well before it reaches the "issue" threshold used elsewhere
  // (getPermittingProfessionalIssues flags it at 40+).
  if (hoursLeft >= 2) {
    const professional = getPermittingProfessionalSnapshot(journey);
    const pieces = [];
    if (professional?.registrationStatus !== 'active') {
      pieces.push(`registration ${professional.registrationStatus} (your licence to sign off is not current)`);
    }
    if (professional?.cpdGap > 0) {
      pieces.push(`CPD gap ${professional.cpdGap}h (training file behind — reviewers trust submissions less)`);
    }
    if (professional?.paperworkLoad > 0) {
      pieces.push(`paperwork ${professional.paperworkLoad} (filing backlog slowing the desk)`);
    }
    const adminUrgent = (professional?.paperworkLoad || 0) >= PAPERWORK_ADMIN_URGENT_THRESHOLD
      || professional?.registrationStatus !== 'active';
    const laneDetail = `Lane: ${laneAction.laneLabel.toLowerCase()} | Stage: ${laneAction.stageLabel}`;
    const prefix = adminUrgent ? 'Best move | ' : '';
    primary.push({
      label: `${laneAction.actionLabel} (2h)`,
      description: pieces.length
        ? `${prefix}${laneDetail} | Clears: ${pieces.join(' | ')}`
        : `${prefix}${laneDetail}`,
      value: 'professional_admin'
    });
  }

  // Core pipeline throughput stays top-level so the main work is never buried.
  if (journey.permits.backlog > 0 && hoursLeft >= 2) {
    primary.push({
      label: 'Draft Permit Application',
      description: '2h - Move a permit from the backlog into drafting',
      value: 'draft_permit'
    });
  }

  if ((journey.permits.drafting || 0) > 0 && hoursLeft >= 2) {
    primary.push({
      label: 'Submit Permit',
      description: '2h - Send a drafted permit into review',
      value: 'submit_permit'
    });
  }

  // First open deficiency gets a top-level pair; extras drop into the submenu so
  // the primary menu does not balloon when several files come back at once.
  const openRevisionTickets = revisionQueue.filter((ticket) => ticket && !ticket.resolved);
  openRevisionTickets.forEach((ticket, index) => {
    const bucket = index === 0 ? primary : support;
    if (hoursLeft >= ticket.clean.hours) {
      bucket.push({
        label: `Clean response: ${ticket.title}`,
        description: `${ticket.clean.hours}h - Fix the deficiency properly; lower scrutiny`,
        value: `revise_permit:${ticket.id}:clean`
      });
    }
    if (hoursLeft >= ticket.fast.hours) {
      bucket.push({
        label: `Fast-track: ${ticket.title}`,
        description: `${ticket.fast.hours}h - Quicker resubmission, but more heat`,
        value: `revise_permit:${ticket.id}:fast`
      });
    }
  });

  if ((journey.permits.inReferral || 0) > 0 && hoursLeft >= 2) {
    primary.push({
      label: 'Follow Up on Referrals',
      description: '2h - Chase the other-agency sign-offs a permit is waiting on',
      value: 'follow_up_referrals'
    });
  }

  // Process Permits is core throughput — it keeps submitted files moving.
  if (DESK_ACTIONS.process_permits.hoursRequired <= hoursLeft) {
    primary.push({
      label: DESK_ACTIONS.process_permits.name,
      description: `${DESK_ACTIONS.process_permits.hoursRequired}h - ${DESK_ACTIONS.process_permits.description}`,
      value: 'process_permits'
    });
  }

  // Support actions: relationships, morale, crisis response, recovery.
  if (DESK_ACTIONS.stakeholder_meeting.hoursRequired <= hoursLeft) {
    support.push({
      label: DESK_ACTIONS.stakeholder_meeting.name,
      description: `${DESK_ACTIONS.stakeholder_meeting.hoursRequired}h - ${DESK_ACTIONS.stakeholder_meeting.description}`,
      value: 'stakeholder_meeting'
    });
  }
  if (DESK_ACTIONS.team_morale.hoursRequired <= hoursLeft) {
    support.push({
      label: DESK_ACTIONS.team_morale.name,
      description: `${DESK_ACTIONS.team_morale.hoursRequired}h - ${DESK_ACTIONS.team_morale.description}`,
      value: 'team_morale'
    });
  }
  if (DESK_ACTIONS.crisis_management.hoursRequired <= hoursLeft) {
    support.push({
      label: DESK_ACTIONS.crisis_management.name,
      description: `${DESK_ACTIONS.crisis_management.hoursRequired}h - ${DESK_ACTIONS.crisis_management.description}`,
      value: 'crisis_management'
    });
  }
  if (journey.protagonist && hoursLeft >= 1) {
    support.push({
      label: 'Take a Break',
      description: '1h - Reduce stress, recover energy',
      value: 'rest'
    });
  }

  // Several open revision tickets can land on the same profile once the
  // deficiency queue outgrows PERMIT_REVISION_PROFILES (pickRevisionProfile
  // cycles through the profile list), which used to surface exact-duplicate
  // "Clean response: X" / "Fast-track: X" rows in this submenu. Collapse
  // repeats down to one visible row per label+description; the underlying
  // tickets are unaffected and any remaining duplicate will resurface here
  // once the visible one is resolved.
  const dedupedSupport = dedupeMenuOptions(support);

  if (dedupedSupport.length > 0) {
    primary.push({
      label: 'Office & Support ▸',
      description: 'Stakeholders, team morale, crisis response, and recovery',
      value: 'support_menu'
    });
  }

  primary.push({
    label: 'Review the File',
    description: 'Pipeline detail, pressure, relationships, and carry-forward notes',
    value: 'briefing'
  });

  primary.push({
    label: 'End Day Early',
    description: 'Rest and start fresh tomorrow',
    value: 'end_day'
  });

  return { primary, support: dedupedSupport };
}

/**
 * Collapse options that read as identical to the player (same label and
 * description) down to a single entry, keeping the first occurrence so the
 * remaining `value` still resolves a real, currently-open item.
 */
function dedupeMenuOptions(options) {
  const seen = new Set();
  const deduped = [];
  for (const option of options) {
    const key = `${option?.label ?? ''}|${option?.description ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(option);
  }
  return deduped;
}

function shiftPermits(sourceKey, targetKey, permits, count) {
  const available = Math.max(0, permits?.[sourceKey] || 0);
  const moved = Math.min(available, Math.max(0, count));
  if (moved <= 0) {
    return 0;
  }

  permits[sourceKey] -= moved;
  permits[targetKey] = (permits[targetKey] || 0) + moved;
  return moved;
}

function applyPermittingLaneThroughput(journey, chainId, stage, ui) {
  const permits = journey.permits || {};

  if (chainId === 'roadPermit') {
    if (stage === 'screen') {
      const drafted = shiftPermits('backlog', 'drafting', permits, 1);
      if (drafted > 0) ui.write(`Road screening pulled ${drafted} package into drafting.`);
    } else if (stage === 'map') {
      const drafted = shiftPermits('backlog', 'drafting', permits, 2);
      if (drafted > 0) ui.write(`Road exhibits advanced ${drafted} package${drafted === 1 ? '' : 's'} into drafting.`);
    } else if (stage === 'submit') {
      const reviewed = shiftPermits('drafting', 'inReview', permits, 2);
      if (reviewed > 0) ui.write(`Road package submission pushed ${reviewed} file${reviewed === 1 ? '' : 's'} directly into review.`);
    } else {
      const moved = shiftPermits('submitted', 'inReview', permits, 1) || shiftPermits('inReferral', 'inReview', permits, 1);
      if (moved > 0) ui.write('Road maintenance conditions cleared one file back into active review.');
    }
    return;
  }

  if (chainId === 'specialUse') {
    if (stage === 'screen') {
      const drafted = shiftPermits('backlog', 'drafting', permits, 1);
      if (drafted > 0) ui.write('Special-use screening opened a package in drafting.');
    } else if (stage === 'bundle') {
      const drafted = shiftPermits('backlog', 'drafting', permits, 2);
      if (drafted > 0) ui.write(`Special-use bundling assembled ${drafted} package${drafted === 1 ? '' : 's'} for submission.`);
    } else if (stage === 'submit') {
      const moved = shiftPermits('drafting', 'submitted', permits, 2);
      if (moved > 0) ui.write(`Special-use submission moved ${moved} file${moved === 1 ? '' : 's'} into the ministry queue.`);
    } else {
      const moved = shiftPermits('submitted', 'inReview', permits, 1);
      if (moved > 0) ui.write('Special-use conditions closed one file into active review.');
    }
    return;
  }

  if (chainId === 'archaeology') {
    if (stage === 'screen') {
      const drafted = shiftPermits('backlog', 'drafting', permits, 1);
      if (drafted > 0) ui.write('Archaeology screening opened a file for drafting.');
    } else if (stage === 'field-review') {
      const moved = shiftPermits('inReferral', 'inReview', permits, 1) || shiftPermits('drafting', 'submitted', permits, 1);
      if (moved > 0) ui.write('Field review work unstuck one archaeology-sensitive file.');
    } else {
      const moved = shiftPermits('submitted', 'inReview', permits, 1) || shiftPermits('drafting', 'submitted', permits, 1);
      if (moved > 0) ui.write('Permit-context work folded archaeology notes into a live file.');
    }
  }
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
    case 'briefing': {
      displayPermittingBriefing(ui, journey);
      await ui.promptChoice('', [{ label: 'Close the file', value: 'next' }]);
      return;
    }

    case 'draft_permit':
      if (journey.permits.backlog > 0) {
        const drafted = shiftPermits('backlog', 'drafting', journey.permits, 1);
        journey.hoursRemaining -= 2;
        applyProtagonistCost(journey, { energy: 8, stress: 5 });
        applyPermittingProfessionalWork(journey, { cpdHours: 1, paperworkLoad: 2, auditExposure: 1 });
        ui.write(`Permit application drafted and ready for submission${drafted > 1 ? 's' : ''}.`);
      }
      return;

    case 'submit_permit':
      if ((journey.permits.drafting || 0) > 0) {
        shiftPermits('drafting', 'submitted', journey.permits, 1);
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
        const roadIntel = getPermittingRoadAssetContext(journey);
        const professional = getPermittingProfessionalSnapshot(journey);
        const professionalIssues = getPermittingProfessionalIssues(journey);
        const professionalPressure = professional?.registrationActive
          ? Math.min(0.25, (professional.competenceRisk / 250) + (professional.auditExposure / 300))
          : 0.35;
        if (!professional?.registrationActive) {
          ui.writeWarning('Registration is not current; the submission will draw extra scrutiny.');
        }
        if (professionalIssues.length > 0) {
          ui.write(`Professional watch: ${professionalIssues.join(' | ')}.`);
        }
        const referralChance = Math.min(0.68, 0.12
          + hotFilePressure * 0.06
          + pressure.publicReview * 0.06
          + pressure.hydrology * 0.05
          + pressure.timing * 0.04
          + roadIntel.referralPenalty
          + professionalPressure);
        if (hotFilePressure > 0) {
          journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + 1);
        }
        if (pressure.overall > 0) {
          journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + Math.max(0, Math.floor(pressure.overall / 3)));
        }
        if (roadIntel.hasData) {
          journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + Math.max(0, roadIntel.engineering - 1));
        }
        if (!professional?.registrationActive) {
          journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + 3);
        }
        applyPermittingProfessionalWork(journey, {
          cpdHours: 1,
          paperworkLoad: 3,
          competenceRisk: -1,
          auditExposure: 1,
        });
        if (Math.random() < referralChance) {
          journey.permits.inReferral = (journey.permits.inReferral || 0) + 1;
          journey.permits.submitted--;
          ui.write(hotFilePressure > 0
            ? 'Permit submitted - the hot spots in the file sent it into referral.'
            : 'Permit submitted - sent for First Nations referral.');
        } else {
          journey.permits.inReview = (journey.permits.inReview || 0) + 1;
          journey.permits.submitted = Math.max(0, (journey.permits.submitted || 0) - 1);
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
        if (Math.random() < 0.7) {
          journey.permits.inReferral--;
          journey.permits.inReview++;
          if (journey.relationships) {
            const lift = discoveryIds.has('cultural_hold') ? 4 : 3;
            journey.relationships.nations = Math.min(100, journey.relationships.nations + lift);
          }
          journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 2);
          ui.write('Referral complete - permit moved to ministry review.');
          applyPermittingProfessionalWork(journey, { paperworkLoad: -1, auditExposure: -1, competenceRisk: -1 });
        } else {
          ui.write('Referral still in progress. Maintained good communication.');
          if (journey.relationships) {
            journey.relationships.nations = Math.min(100, journey.relationships.nations + 1);
          }
          journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 1);
          applyPermittingProfessionalWork(journey, { paperworkLoad: 1, auditExposure: 1 });
        }
      }
      return;

    case 'professional_admin': {
      const chainId = getPermittingPaperworkChainId(journey);
      const chainProgress = progressPermittingPaperworkChain(journey, chainId, 1);
      const stage = chainProgress?.stage || 'renewal';
      journey.hoursRemaining -= 2;
      applyProtagonistCost(journey, { energy: 5, stress: 4 });

      const effect = getPaperworkChainStageEffect(chainId, stage);
      if (effect) {
        applyPermittingProfessionalWork(journey, effect.changes);
        ui.write(effect.message);
      }
      if (chainId === 'archaeology' && stage === 'field-review' && journey.relationships) {
        journey.relationships.nations = Math.min(100, journey.relationships.nations + 2);
      }

      applyPermittingLaneThroughput(journey, chainId, stage, ui);

      if (chainProgress?.stage) {
        ui.write(`Paperwork chain advanced to: ${chainProgress.stage}.`);
      }
      return;
    }

    case 'rest':
      if (journey.protagonist) {
        journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 15);
        journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 10);
      }
      journey.hoursRemaining -= 1;
      applyPermittingProfessionalWork(journey, { auditExposure: -1, competenceRisk: -1 });
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

  const professional = ensurePermittingProfessionalState(journey);
  if (professional) {
    const cpdGap = Math.max(0, professional.cpdTarget - professional.cpdHours);
    if (cpdGap > 0) {
      professional.competenceRisk = Math.min(100, professional.competenceRisk + 1);
      professional.auditExposure = Math.min(100, professional.auditExposure + 1);
    } else if (professional.competenceRisk > 0) {
      professional.competenceRisk = Math.max(0, professional.competenceRisk - 1);
    }
    professional.paperworkLoad = Math.max(0, professional.paperworkLoad - 1);
    if (professional.auditExposure > 0 && professional.registrationStatus === 'active') {
      professional.auditExposure = Math.max(0, professional.auditExposure - 1);
    }
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
  const roadIntel = getPermittingRoadAssetContext(journey);
  const professional = getPermittingProfessionalSnapshot(journey);

  // Submitted permits may advance to inReview
  if (journey.permits.submitted > 0) {
    const advancing = Math.max(1, Math.floor(journey.permits.submitted * 0.5));
    if (advancing > 0) {
      journey.permits.submitted -= advancing;
      journey.permits.inReview += advancing;
      ui.write(`${advancing} permit(s) moved to active review.`);
    }
  }

  if (journey.permits.inReferral > 0) {
    const returning = Math.max(1, Math.floor(journey.permits.inReferral * 0.25));
    if (returning > 0) {
      journey.permits.inReferral -= returning;
      journey.permits.inReview += returning;
      applyPermittingProfessionalWork(journey, { paperworkLoad: -1, auditExposure: -1 });
      ui.write(`${returning} referral file(s) came back into active review.`);
    }
  }

  // InReview permits may be approved or need revision
  if (journey.permits.inReview > 0) {
    const reviewed = Math.max(1, Math.ceil(journey.permits.inReview * 0.55));
    const scrutinyPenalty = Math.min(0.25, (journey.scrutiny || 0) / 400);
    const phase3Penalty = Math.min(0.2, (
      pressure.publicReview * 0.03
      + pressure.engineering * 0.03
      + pressure.hydrology * 0.025
      + pressure.timing * 0.02
    ));
    const roadPenalty = Math.min(0.15, roadIntel.approvalPenalty);
    const professionalPenalty = professional?.registrationActive
      ? Math.min(0.15, (professional.auditExposure / 300) + (professional.competenceRisk / 500))
      : 0.2;
    const approvalRate = Math.max(0.42, 0.8 - scrutinyPenalty - phase3Penalty - roadPenalty - professionalPenalty);
    const approved = Math.floor(reviewed * approvalRate);
    const revisions = reviewed - approved;

    if (approved > 0) {
      journey.permits.inReview -= approved;
      journey.permits.approved += approved;
      applyPermittingProfessionalWork(journey, { cpdHours: 1, paperworkLoad: -1, auditExposure: -1 });
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
      applyPermittingProfessionalWork(journey, { paperworkLoad: 2, auditExposure: 1 });
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
 * Capitalize first letter
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
