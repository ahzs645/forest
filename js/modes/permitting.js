/**
 * Permitting Mode Runner
 * Protagonist-based permit processing and relationship management.
 * YOU are the licensee's Permitting Specialist — no crew, just the queue at
 * the district office and the people who move it.
 */

import { checkForEvent } from '../events.js';
import { runDaySituation } from '../journey/daySituation.js';
import { presentDayCard, formatStatusLine } from '../journey/dayCard.js';
import { buildOfficeWindowFrames, buildStampFrames } from '../scene/textmode/scenes.js';
import { calculateDeskConsumption, applyConsumption, applyDeskRegen, getFormattedResourceStatus, DESK_RESOURCES } from '../resources.js';
import { executeDeskDay, DESK_ACTIONS } from '../journey.js';
import { getOperationalProgress, recordProgressMilestones } from '../journey.js';
import { getDiscoveryTagNotes, getJourneyDiscoveryTags } from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';
import { startDay, spendDay, dayIsSpent, dayPrompt, settleDayPass } from '../journey/dayPlan.js';
import {
  DAILY_PERMIT_THROUGHPUT,
  PERMIT_TYPES,
  advancePermitClocks,
  describeLane,
  draftPermits,
  ensurePermitFiles,
  formatPermitClockLines,
  getChaseableFiles,
  getPermitFileById,
  getPermitFiles,
  getPermitFilesInLane,
  getReferralWindow,
  hasQueueWork,
  planQueueWork,
  reconcilePermitFiles,
  resubmitPermitFile,
  shortenPermitClock,
  submitPermits,
} from '../journey/permitPipeline.js';
import { formatRoadAssetSummary, getPermittingRoadAssetContext } from '../data/roadAssetIntel.js';
import { OPERATING_AREAS } from '../data/operatingAreas.js';
import {
  advanceProfessionalComplianceChain,
  applyProfessionalComplianceShift,
  ensureProfessionalComplianceState,
  getProfessionalComplianceSnapshot,
} from '../engine.js';

/** Working relationship with the Nation above which a follow-up call shortens a referral clock. */
const REFERRAL_CHASE_RELATIONSHIP = 55;
/** Working relationship with the district above which a chase shortens a district clock. */
const DISTRICT_CHASE_RELATIONSHIP = 50;

function nationName(journey) {
  const area = journey?.area || OPERATING_AREAS.find((candidate) => candidate.id === journey?.areaId) || null;
  return area?.indigenousPartners?.[0] || 'the Nation';
}

function sentence(text) {
  const value = String(text || '');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Deficiency letters the district sends back. Each profile names what is
 * actually missing from the file; `summary` takes the file it is about so the
 * letter reads like one about that block, road, or camp rather than a form.
 */
const PERMIT_REVISION_PROFILES = [
  {
    id: 'fish-passage',
    title: 'Fish passage detail',
    summary: (file, ctx) => `Crossing on stream ${ctx.streamClass} is a fish stream; culvert sizing and the in-stream work window are not in the ${file?.type === 'RP' ? 'RP' : 'crossing'} package.`,
    tags: ['salmon', 'fish', 'stream', 'river', 'riparian', 'wetland'],
    types: ['RP', 'CP'],
    pressure: {
      hydrology: 3,
      timing: 2
    },
    clean: {
      label: 'Clean up the crossing file',
      note: 'You size the culvert to the Q100 flow, attach the fish-stream classification, and write the work window into the package.',
      scrutiny: -3,
      compliance: 4,
      relationships: { agencies: 1 }
    },
    fast: {
      label: 'Fast-track the crossing file',
      note: 'You resubmit quickly and lean on the existing drawings.',
      scrutiny: 4,
      compliance: 1,
      politicalCapital: -2,
      relationships: { agencies: -1 }
    }
  },
  {
    id: 'community-watershed',
    title: 'Community watershed hydrology',
    summary: (file) => `${file?.type === 'RP' ? 'The road' : 'The block'} drains to the community watershed intake; the hydrology memo does not address sediment during spring freshet.`,
    tags: ['watershed', 'drinking-water', 'community-interface', 'water'],
    types: ['CP', 'RP'],
    pressure: {
      publicReview: 1,
      hydrology: 4,
      timing: 1
    },
    clean: {
      label: 'Rework the watershed package',
      note: 'You add a freshet sediment response, a monitoring commitment, and a timing note the district can defend.',
      scrutiny: -3,
      compliance: 5,
      relationships: { ministry: 1, agencies: 1 }
    },
    fast: {
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
    title: 'Referral response outstanding',
    summary: (file, ctx) => `Referral response from ${ctx.nation} is outstanding; the ${ctx.referralCalendarDays}-day window closes Day ${ctx.referralClosesDay}. Engagement record does not show the site visit that was promised.`,
    tags: ['nations', 'cultural', 'archaeology', 'consultation', 'values'],
    types: ['CP', 'SUP', 'HCA', 'RP'],
    pressure: {
      publicReview: 4
    },
    clean: {
      label: 'Tighten the engagement record',
      note: 'You book the site visit, log every contact, and rebuild the engagement record so the district can see the trail.',
      scrutiny: -3,
      compliance: 4,
      relationships: { nations: 2, agencies: 1 }
    },
    fast: {
      label: 'Resubmit the engagement notes',
      note: 'You move quickly, but the lighter record leaves more heat behind.',
      scrutiny: 5,
      compliance: 1,
      politicalCapital: -2,
      relationships: { nations: -2 }
    }
  },
  {
    id: 'visual-quality',
    title: 'Visual impact assessment',
    summary: () => 'Block sits in a VQO Partial Retention polygon; the visual impact assessment and viewpoint renders are missing.',
    tags: ['visuals', 'recreation', 'trail', 'community-interface'],
    types: ['CP', 'SUP'],
    pressure: {
      publicReview: 4
    },
    clean: {
      label: 'Build the visual package',
      note: 'You run the viewpoint renders, write up the VIA against the VQO, and the file reads as defensible.',
      scrutiny: -3,
      compliance: 3,
      relationships: { ministry: 1 }
    },
    fast: {
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
    title: 'Access engineering',
    summary: () => 'Exhibit A map does not show the deactivation intent; terrain stability field assessment is referenced but not attached.',
    tags: ['road', 'access', 'steep', 'karst', 'winter-road'],
    types: ['RP', 'RUP', 'CP'],
    pressure: {
      engineering: 4,
      hydrology: 1,
      timing: 3
    },
    clean: {
      label: 'Strengthen the access package',
      note: 'You attach the TSFA, mark the deactivation intent on Exhibit A, and the engineering reads whole.',
      scrutiny: -2,
      compliance: 4,
      relationships: { agencies: 1 }
    },
    fast: {
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
    title: 'Application incomplete',
    summary: () => 'Application is missing the FOM consistency statement and the appraisal data submission; district will not start the referral clock until they are attached.',
    tags: [],
    types: ['CP', 'RP', 'RUP', 'SUP', 'HCA'],
    completeness: true,
    pressure: {
      publicReview: 1,
      hydrology: 1,
      timing: 1
    },
    clean: {
      label: 'Complete the package',
      note: 'You attach the FOM consistency statement and the appraisal data submission and refile.',
      scrutiny: -2,
      compliance: 3,
      relationships: { ministry: 1, agencies: 1 }
    },
    fast: {
      label: 'Refile with the bare minimum',
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
// callout, so players aren't trained to spam it while the queue sits
// untouched. A permitter's starting paperworkLoad already runs ~17-21 once
// area burden is folded in (see js/engine/professional.js and
// AREA_COMPLIANCE_PROFILES in js/data/professionalPractice.js); ordinary
// queue work adds 2-3 per action. 20 sits just above that starting band and
// at the paperwork-burn consequence line (js/engine/effects.js triggers at
// 20+), so the callout starts quiet and lights up once neglect bites.
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
  return `Registration: ${snapshot.registrationStatus} | CPD logged this season: ${snapshot.cpdHours}/${snapshot.cpdTarget}h | Paperwork: ${snapshot.paperworkLoad} | Audit exposure: ${snapshot.auditExposure}${burden}`;
}

function getPermittingProfessionalIssues(journey) {
  const snapshot = getPermittingProfessionalSnapshot(journey);
  if (!snapshot) return [];

  const reasons = [];
  if (!snapshot.registrationActive) {
    reasons.push(`registration is ${snapshot.registrationStatus}`);
  }
  if (snapshot.competenceRisk >= 35) {
    reasons.push(`competence risk ${snapshot.competenceRisk}%`);
  }
  if (snapshot.paperworkLoad >= 40) {
    reasons.push(`filing backlog ${snapshot.paperworkLoad}`);
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

function formatPermittingStageLabel(stage, chainId = null) {
  const roadLabels = {
    screen: 'Road screen',
    map: 'Road map exhibits',
    submit: 'Road submission',
    maintenance: 'Maintenance conditions'
  };
  if (chainId === 'roadPermit' && roadLabels[stage]) {
    return roadLabels[stage];
  }
  return String(stage || 'review')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * The lane action and where its paperwork chain stands. `stage` is the step
 * the next click will do — the same step the outcome names as completed once
 * it has been clicked — so the day card and the outcome line never disagree.
 */
function getPermittingLaneAction(journey) {
  const chainId = getPermittingPaperworkChainId(journey);
  const professional = getPermittingProfessionalSnapshot(journey);
  const chain = professional?.[`${chainId}Chain`] || null;
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
  const complete = Boolean(chain?.complete);
  const stageLabel = complete
    ? `${formatPermittingStageLabel(stage, chainId)} (done)`
    : `${formatPermittingStageLabel(stage, chainId)} (next)`;

  return {
    chainId,
    chain,
    laneLabel: laneMap[chainId] || 'Professional file',
    actionLabel: labelMap[chainId] || 'Compliance Admin',
    stage,
    stageLabel: chainId === 'registration' ? formatPermittingStageLabel(stage, chainId) : stageLabel,
    stageIndex: chain ? Math.min(chain.stepIndex + 1, chain.steps.length) : 1,
    stageCount: chain?.steps?.length || 1
  };
}

function getPermittingLaneProgressSummary(laneAction, permits) {
  return `${laneAction.actionLabel}: ${laneAction.stageIndex}/${laneAction.stageCount} | Backlog ${permits?.backlog || 0} | Drafted ${permits?.drafting || 0} | Screening ${permits?.submitted || 0} | Referral ${permits?.inReferral || 0} | Decision ${permits?.inReview || 0}`;
}

function progressPermittingPaperworkChain(journey, chainId, stepCount = 1) {
  const chain = advanceProfessionalComplianceChain(journey, chainId, stepCount);
  if (!chain) {
    return null;
  }

  const stepIndex = Math.min(chain.stepIndex, chain.steps.length) - 1;
  const stage = stepIndex >= 0 ? chain.steps[stepIndex] : chain.steps[0];
  const next = chain.stepIndex < chain.steps.length ? chain.steps[chain.stepIndex] : null;
  return { chain, stage, next };
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
 *
 * CPD is logged on the professional file only (registration renewal and the
 * admin day that goes with it); moving permit paperwork is the job, not
 * continuing professional development.
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
        message: 'Road permit screening confirms the access needs a road permit rather than riding inside the CP.'
      };
    }
    if (stage === 'map') {
      return {
        changes: { paperworkLoad: 1, auditExposure: 0 },
        message: 'Exhibit A mapping and the deactivation intent now sit in the drafting stack.'
      };
    }
    if (stage === 'submit') {
      return {
        changes: { paperworkLoad: 1, competenceRisk: -1, auditExposure: 0 },
        message: 'Road permit submission package is aligned and filed with the district.'
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
        message: 'Special-use screening confirms the camp needs its own occupancy package.'
      };
    }
    if (stage === 'bundle') {
      return {
        changes: { paperworkLoad: 1, auditExposure: 0 },
        message: 'Special-use bundle assembled and queued with the active permit work.'
      };
    }
    if (stage === 'submit') {
      return {
        changes: { paperworkLoad: 1, competenceRisk: -1, auditExposure: 0 },
        message: 'Special-use submission is filed for district review.'
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
        message: 'Archaeology screening (AOA) shows the file needs a preliminary field reconnaissance.'
      };
    }
    if (stage === 'field-review') {
      return {
        changes: { paperworkLoad: 0, competenceRisk: -1, auditExposure: -2 },
        message: 'PFR notes and the engagement record with the Nation are better aligned.'
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

function describeQueueWork(journey) {
  const plan = planQueueWork(journey);
  switch (plan.step) {
    case 'draft':
      return {
        label: 'Process Permits',
        description: `Work the queue | Draft ${plan.count} application${plan.count === 1 ? '' : 's'} out of the backlog — the block, the road, the camp each get a file`,
        step: plan
      };
    case 'submit':
      return {
        label: 'Process Permits',
        description: `Work the queue | Submit ${plan.count} drafted file${plan.count === 1 ? '' : 's'} to the district; the completeness screen and any WSA s.11 window start today`,
        step: plan
      };
    case 'chase':
      return {
        label: 'Process Permits',
        description: `Work the queue | Chase the district on ${plan.file.label} (${describeLane(plan.file, journey)})`,
        step: plan
      };
    default:
      return null;
  }
}

function buildPermittingActionGuidance(journey) {
  const laneAction = getPermittingLaneAction(journey);
  const revisionQueue = ensurePermittingRevisionState(journey).filter((ticket) => ticket && !ticket.resolved);
  const pressure = journey?.permits?.phase3Pressure || derivePermittingConstraintState(journey);
  const professionalIssues = getPermittingProfessionalIssues(journey);
  const queueWork = describeQueueWork(journey);
  const steps = [];
  let lane = laneAction.laneLabel;
  let headline = `${laneAction.actionLabel} to keep the active file moving.`;

  if (revisionQueue.length > 0 && !queueWork) {
    const ticket = revisionQueue[0];
    lane = 'Deficiency letters';
    headline = `Clean response: ${ticket.fileLabel || ticket.id} (${ticket.title}). Nothing is moving in the district queue until the deficiency letters are answered.`;
    pushPermittingGuideStep(steps, ticket.summary);
    return { lane, headline, steps };
  }

  if (revisionQueue.length >= 3) {
    const ticket = revisionQueue[0];
    lane = 'Deficiency letters';
    headline = `Clean response: ${ticket.fileLabel || ticket.id} (${ticket.title}) before the letters stack up on the file.`;
    pushPermittingGuideStep(steps, ticket.summary);
    pushPermittingGuideStep(steps, 'Use the clean response unless the calendar forces a fast resubmission.');
    return { lane, headline, steps };
  }

  const referralFiles = getPermitFilesInLane(journey, 'referral');
  if (referralFiles.length > 0 && (journey.relationships?.nations || 0) >= REFERRAL_CHASE_RELATIONSHIP && !queueWork) {
    lane = 'Referral clocks';
    headline = `Follow Up on Referrals: ${referralFiles[0].label} (${describeLane(referralFiles[0], journey)}) — ${nationName(journey)} will move a file for a desk that keeps in touch.`;
    pushPermittingGuideStep(steps, 'A stalled referral holds every downstream decision.');
    return { lane, headline, steps };
  }

  if (queueWork) {
    lane = queueWork.step.step === 'chase' ? 'District queue' : 'Permit queue';
    headline = queueWork.description.replace(/^Work the queue \| /, '');
    if (pressure.publicReview > 0 || pressure.hydrology > 0) {
      pushPermittingGuideStep(steps, `Dominant pressure: ${getPermittingPressureLabel(pressure.dominant)}.`);
    }
    if (revisionQueue.length > 0) {
      pushPermittingGuideStep(steps, `${revisionQueue.length} deficiency letter${revisionQueue.length === 1 ? '' : 's'} waiting; answer them before they stack to three.`);
    }
    return { lane, headline, steps };
  }

  if (revisionQueue.length > 0) {
    const ticket = revisionQueue[0];
    lane = 'Deficiency letters';
    headline = `Clean response: ${ticket.fileLabel || ticket.id} (${ticket.title}).`;
    pushPermittingGuideStep(steps, ticket.summary);
    return { lane, headline, steps };
  }

  if (laneAction.chainId !== 'registration' && !laneAction.chain?.complete) {
    lane = laneAction.laneLabel;
    headline = `${laneAction.actionLabel} to do the ${formatPermittingStageLabel(laneAction.stage, laneAction.chainId).toLowerCase()} step on the active file.`;
    pushPermittingGuideStep(steps, `Next step: ${formatPermittingStageLabel(laneAction.stage, laneAction.chainId)}.`);
    return { lane, headline, steps };
  }

  if (professionalIssues.length > 0) {
    lane = 'Professional file';
    headline = `${laneAction.actionLabel} to clear ${professionalIssues[0]} before more scrutiny lands on the queue.`;
    pushPermittingGuideStep(steps, 'Registration and filing drag both feed scrutiny.');
    return { lane, headline, steps };
  }

  if (referralFiles.length > 0) {
    lane = 'Referral clocks';
    headline = `Follow Up on Referrals while ${referralFiles[0].label} sits with ${nationName(journey)} (${describeLane(referralFiles[0], journey)}).`;
    return { lane, headline, steps };
  }

  const live = getPermitFiles(journey).filter((file) => ['screening', 'referral', 'decision'].includes(file.lane));
  if (live.length > 0) {
    lane = 'District queue';
    headline = `The clocks are running: ${formatPermitClockLines(journey, 1)[0] || 'the district has the file'}. Use the day on the office.`;
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

/**
 * Deficiency tickets, one per file the district returned. Files are the
 * source of truth: a file in the deficiency lane without a letter gets one,
 * and a letter whose file has moved on is closed.
 */
export function ensurePermittingRevisionState(journey) {
  const queue = ensurePermitRevisionBaseState(journey);
  ensurePermitFiles(journey);
  const deficiencyFiles = getPermitFilesInLane(journey, 'deficiency');
  const fileIds = new Set(deficiencyFiles.map((file) => file.id));

  // Legacy tickets from before files had names: adopt them onto files.
  for (const ticket of queue) {
    if (ticket && !ticket.fileId) {
      const orphan = deficiencyFiles.find((file) => !queue.some((other) => other.fileId === file.id));
      if (orphan) {
        ticket.fileId = orphan.id;
        ticket.fileLabel = orphan.label;
        ticket.fileType = orphan.type;
      }
    }
  }

  const kept = queue.filter((ticket) => ticket && ticket.fileId && fileIds.has(ticket.fileId));
  queue.length = 0;
  queue.push(...kept);

  for (const file of deficiencyFiles) {
    if (!queue.some((ticket) => ticket.fileId === file.id)) {
      pushRevisionTicket(journey, file, { type: 'sync', reason: 'queue_sync' });
    }
  }

  return queue;
}

export function getPermittingConstraintState(journey) {
  return derivePermittingConstraintState(journey);
}

function scoreRevisionProfiles(journey, file = null) {
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
      if (file) {
        // The letter has to be about this file: a road permit gets an
        // engineering or crossing letter, a heritage-heavy block a referral
        // one, and a file the screen bounced is incomplete by definition.
        if (profile.types && !profile.types.includes(file.type)) score -= 12;
        if (file.type === 'RP' && (profile.id === 'access-engineering' || profile.id === 'fish-passage')) score += 4;
        if (file.type === 'RUP' && profile.id === 'access-engineering') score += 6;
        if (file.touchesStream && profile.id === 'fish-passage') score += 3;
        if (file.heritageClass === 'heavy' && profile.id === 'consultation') score += 5;
        if (file.heritageClass === 'moderate' && profile.id === 'consultation') score += 2;
        if (file.deficiencyProfileId === 'package-completeness') {
          score += profile.id === 'package-completeness' ? 50 : 0;
        } else if (profile.id === 'package-completeness') {
          score -= 6;
        }
      }
      return { profile, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.profile);
}

function pickRevisionProfile(journey, index = 0, file = null) {
  const profiles = scoreRevisionProfiles(journey, file);
  if (!profiles.length) {
    return PERMIT_REVISION_PROFILES[PERMIT_REVISION_PROFILES.length - 1];
  }
  if (file?.deficiencyProfileId) {
    return profiles.find((profile) => profile.id === file.deficiencyProfileId) || profiles[0];
  }
  return profiles[index % profiles.length];
}

function buildDeficiencySummary(profile, file, journey) {
  const referral = getReferralWindow(journey);
  const ctx = {
    nation: nationName(journey),
    referralCalendarDays: referral.calendarDays,
    referralClosesDay: (journey?.day || 1) + referral.deskDays,
    streamClass: file?.touchesStream ? 'S3' : 'S4',
  };
  if (typeof profile.summary === 'function') return profile.summary(file, ctx);
  return String(profile.summary || '');
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
  if (total <= 0) return queue;

  if (!journey.permits) journey.permits = {};
  const openTickets = queue.filter((ticket) => ticket && !ticket.resolved).length;
  journey.permits.needsRevision = Math.max(Math.round(journey.permits.needsRevision || 0), openTickets + total);
  reconcilePermitFiles(journey);
  for (const file of getPermitFilesInLane(journey, 'deficiency')) {
    if (!queue.some((ticket) => ticket.fileId === file.id)) {
      pushRevisionTicket(journey, file, source);
    }
  }

  return queue;
}

function pushRevisionTicket(journey, file, source = {}) {
  const queue = ensurePermitRevisionBaseState(journey);
  const profile = pickRevisionProfile(journey, queue.length, file);
  const nextSeq = (journey.permits.revisionSeq || 0) + 1;
  journey.permits.revisionSeq = nextSeq;
  if (file) file.deficiencyProfileId = profile.id;
  const ticket = {
    id: `revision-${journey.day || 0}-${nextSeq}-${profile.id}`,
    sequence: nextSeq,
    fileId: file?.id || null,
    fileLabel: file?.label || `File ${nextSeq}`,
    fileType: file?.type || null,
    profileId: profile.id,
    completeness: Boolean(profile.completeness),
    title: profile.title,
    summary: buildDeficiencySummary(profile, file, journey),
    clean: profile.clean,
    fast: profile.fast,
    sourcePhase: journey.currentPhase || 'review',
    source: source.type || source.reason || 'review'
  };
  queue.push(ticket);
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
      messages: ['No open deficiency letter was available to answer.']
    };
  }

  const response = ticket[selectedMode] || ticket.clean;

  if (dayIsSpent(journey)) {
    return {
      resolved: false,
      mode: selectedMode,
      ticket,
      messages: ['The day is already spoken for. That letter waits until tomorrow.']
    };
  }

  spendDay(journey);

  // A day answering the district clears the letters that are open, not one
  // form. Deficiencies land faster than a single-ticket day could ever answer
  // them, so the queue would only ever grow (see DAILY_PERMIT_THROUGHPUT).
  const alsoCleared = queue
    .filter((candidate) => candidate !== ticket)
    .slice(0, DAILY_PERMIT_THROUGHPUT - 1);
  const cleared = [ticket, ...alsoCleared];

  applyProtagonistCost(journey, {
    energy: selectedMode === 'fast' ? 6 : 8,
    stress: selectedMode === 'fast' ? 7 : 4
  });
  for (const entry of cleared) {
    applyRevisionEffects(journey, entry[selectedMode] || entry.clean);
  }

  const refiled = [];
  for (const entry of cleared) {
    const index = queue.indexOf(entry);
    if (index !== -1) queue.splice(index, 1);
    const file = entry.fileId ? getPermitFileById(journey, entry.fileId) : null;
    if (file) {
      resubmitPermitFile(journey, file.id, { completeness: Boolean(entry.completeness) });
      refiled.push(file);
    }
  }
  reconcilePermitFiles(journey);

  const responseLabel = selectedMode === 'fast' ? 'Quick resubmission' : 'Clean response';
  const messages = [
    cleared.length > 1
      ? `${responseLabel} filed for ${ticket.fileLabel || ticket.id} (${ticket.title}) and ${cleared.length - 1} more open letter${cleared.length > 2 ? 's' : ''}.`
      : `${responseLabel} filed for ${ticket.fileLabel || ticket.id} (${ticket.title}).`,
    response.note
  ];

  for (const file of refiled) {
    messages.push(`${file.label}: ${sentence(describeLane(file, journey))}.`);
  }

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
    messages.push('The public-facing package reads more defensible for the district and for anyone who pulls the FOM.');
  } else if (ticket.profileId === 'fish-passage' && pressure.timing > 0) {
    messages.push('The crossing timing note now matches the in-stream work window.');
  }

  return {
    resolved: true,
    mode: selectedMode,
    ticket,
    cleared: cleared.length,
    messages
  };
}

/**
 * Run a permitting day (permit processing with referral clocks)
 * @param {Object} game - Game instance
 */
export async function runPermittingDay(game) {
  const { ui, journey } = game;
  ensurePermitFiles(journey);
  ensurePermittingRevisionState(journey);
  ensurePermittingProfessionalState(journey);

  // Morning at the office: the season outside the window, coffee inside.
  if (typeof ui.playScene === 'function') {
    await ui.playScene(buildOfficeWindowFrames({
      weatherId: journey.weather?.id,
      season: journey.season?.currentSeason,
      seed: journey.day,
    }), { delay: 140, holdLastFrame: false, ambient: 'work' });
  }

  const daysRemaining = journey.deadline - journey.day;
  const progressBeforeDay = getOperationalProgress(journey);
  let meetingsToday = 0;
  let crisisMode = daysRemaining <= 5;

  // Check for random event at start of day. Day 1 is event-free onboarding so
  // the player sees the normal permitting loop before any exception arrives.
  const event = journey.day > 1 ? checkForEvent(journey) : null;
  if (event) {
    const outcome = await runDaySituation(game, event, {
      frame: {
        dayHeader: buildPermittingDayHeader(journey),
        statusLine: buildPermittingStatusLine(journey),
        onRender: () => updatePermittingMissionStatus(ui, journey),
      },
      setAsideDescription: 'Not today. Keep the day for the queue.',
    });
    if (outcome.gameOver) return;
    if (outcome.spendsDay) spendDay(journey);
    // An authored situation may have moved the counters; bring the files up.
    reconcilePermitFiles(journey);
    ensurePermittingRevisionState(journey);
  }

  // One file gets the day, and it opens as a card like every other mode's
  // quiet day: the desk as you find it, then the call. Look-ups and the
  // card's free context leave the day unspent and the loop comes back around
  // to the real decision; the tally closes a day whose menu turns out to be
  // nothing but look-ups.
  const freeChoices = { count: 0 };
  while (!dayIsSpent(journey)) {
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

    let actionId = await presentDayCard(ui, {
      dayHeader: buildPermittingDayHeader(journey),
      statusLine: buildPermittingStatusLine(journey),
      label: 'THE MORNING QUEUE',
      title: buildPermittingQuietTitle(journey),
      body: buildPermittingQuietBody(journey),
      context: buildPermittingContextLines(journey),
      prompt: dayPrompt(journey),
      options: primary,
      onRender: () => { updatePermittingMissionStatus(ui, journey); },
    }) || 'end_day';

    if (actionId === 'support_menu') {
      const sub = await ui.promptChoice('Office & support:', [
        ...support,
        { label: 'Back', description: 'Return to the main menu', value: 'support_back' }
      ]);
      // Backing out is a free look-up, not a spent day; settleDayPass below
      // counts it against FREE_LOOKUPS_PER_DAY so the loop cannot spin.
      actionId = sub.value === 'support_back' ? 'noop' : (sub.value || 'noop');
    }

    // End day early
    if (actionId === 'end_day') {
      ui.write('');
      ui.write('You call it a day and head home. The clocks at the district keep running.');
      break;
    }

    if (actionId === 'noop') {
      if (settleDayPass(journey, freeChoices, ui)) break;
      continue;
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
    settleDayPass(journey, freeChoices, ui);
  }

  // End of day processing
  await endOfDayProcessing(game, meetingsToday, crisisMode, progressBeforeDay);
}

/**
 * The day card's header line and drumbeat, shared between the quiet card and
 * the situation frame so the day reads the same whichever way it opens. The
 * header names the mode, not the internal season phase — `currentPhase` says
 * 'planning' for the opening third of a permitting season, which reads like a
 * different job entirely.
 */
function buildPermittingDayHeader(journey) {
  return `DAY ${journey.day} of ${journey.deadline} - PERMITTING`;
}

function buildPermittingStatusLine(journey) {
  const daysLeft = Math.max(0, journey.deadline - journey.day);
  return formatStatusLine([
    `${journey.permits?.approved || 0}/${journey.permits?.target || 0} issued`,
    `${journey.permits?.backlog || 0} in the backlog`,
    `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
  ]);
}

/**
 * A quiet desk day still needs to read like a morning, not like a form. The
 * title and body come off the actual pipeline so two mornings at different
 * points in the season do not open with identical text.
 */
function buildPermittingQuietTitle(journey) {
  const permits = journey.permits || {};
  const daysLeft = Math.max(0, journey.deadline - journey.day);
  if ((permits.needsRevision || 0) > 0) return 'RED INK IN THE INBOX';
  if ((permits.inReferral || 0) > 0) return 'WAITING ON THE REFERRAL';
  if (daysLeft <= 5) return 'THE CALENDAR LEANS IN';
  if ((permits.backlog || 0) === 0 && (permits.drafting || 0) === 0) return 'A CLEAR COUNTER';
  return 'THE QUEUE, FIRST THING';
}

function buildPermittingQuietBody(journey) {
  const permits = journey.permits || {};
  const daysLeft = Math.max(0, journey.deadline - journey.day);
  const parts = ['The phone holds off through the first coffee. The day belongs to whichever file you pull first.'];

  const revisions = permits.needsRevision || 0;
  const referrals = permits.inReferral || 0;
  const backlog = permits.backlog || 0;
  if (revisions > 0) {
    parts.push(`${revisions} deficiency letter${revisions === 1 ? ' sits' : 's sit'} on the corner of the desk.`);
    if (!hasQueueWork(journey)) {
      parts.push('Nothing is moving in the district queue until the deficiency letters are answered.');
    }
  } else if (referrals > 0) {
    parts.push(`${referrals} file${referrals === 1 ? ' is' : 's are'} out on referral with ${nationName(journey)}, waiting on a response.`);
  } else if (backlog > 0) {
    parts.push(`${backlog} application${backlog === 1 ? '' : 's'} deep in the backlog.`);
  }
  const clocks = formatPermitClockLines(journey, 2);
  if (clocks.length) {
    parts.push(`Clocks: ${clocks.join(' · ')}.`);
  }
  if (daysLeft <= 5) {
    parts.push(`The deadline lands in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`);
  }
  return parts.join(' ');
}

/**
 * Reference material, free and behind "More context": the pipeline at a
 * glance, the lane, and the pressures on the file. The full review is still
 * its own menu entry; this is the glance, not the file.
 */
function buildPermittingContextLines(journey) {
  const permits = journey.permits || {};
  const guidance = buildPermittingActionGuidance(journey);
  const laneAction = getPermittingLaneAction(journey);
  const lines = [
    `Pipeline: backlog ${permits.backlog || 0} | drafted ${permits.drafting || 0} | screening ${permits.submitted || 0} | referral ${permits.inReferral || 0} | decision ${permits.inReview || 0} | deficiency ${permits.needsRevision || 0}`,
    ...formatPermitClockLines(journey, 4),
    `Lane: ${guidance.lane} | Stage: ${laneAction.stageLabel}`,
  ];
  if (guidance.headline) lines.push(`Next best move: ${guidance.headline}`);
  lines.push(`Scrutiny: ${Math.round(journey.scrutiny || 0)}%`);
  if (Number.isFinite(journey.regulations?.complianceScore)) {
    lines.push(`Regulatory standing: ${Math.round(journey.regulations.complianceScore)}%`);
  }
  if (journey.relationships) {
    lines.push(`Working relationships: district ${journey.relationships.ministry}% | ${nationName(journey)} ${journey.relationships.nations}% | agencies (DFO/ENV) ${journey.relationships.agencies}%`);
  }
  const professional = getPermittingProfessionalSnapshot(journey);
  if ((professional?.paperworkLoad || 0) >= PAPERWORK_ADMIN_URGENT_THRESHOLD) {
    lines.push('Filing backlog: high — the next audit will find it.');
  }
  const areaSituation = getAreaSituationSummary(journey);
  if (areaSituation) lines.push(`Area: ${areaSituation}`);
  const discoveryNotes = getDiscoveryTagNotes(journey, journey.roleId || 'permitter', 2);
  if (discoveryNotes.length > 0) lines.push(`Carry-forward: ${discoveryNotes.join(' | ')}`);
  return lines.filter(Boolean);
}

/**
 * Keep the mission dashboard pane current on every card render; energy/stress
 * live in the protagonist pane and budget/goodwill in the supplies pane.
 */
function updatePermittingMissionStatus(ui, journey) {
  const daysRemaining = Math.max(0, journey.deadline - journey.day);
  const guidance = buildPermittingActionGuidance(journey);
  const laneAction = getPermittingLaneAction(journey);

  const permits = journey.permits;
  const permitProgress = Math.round((permits.approved / permits.target) * 100);

  const facts = [
    { label: 'Days left', value: `${daysRemaining}`, tone: daysRemaining <= 5 ? 'danger' : daysRemaining <= 10 ? 'warn' : undefined },
    { label: 'Lane', value: guidance.lane },
    { label: 'Stage', value: laneAction.stageLabel }
  ];

  // The pipeline is the mode's real state machine — as a checklist it reads
  // as flow: each lane shows its count, done once nothing is stuck in it.
  const checklist = [
    { label: `backlog ${permits.backlog || 0}`, done: (permits.backlog || 0) === 0 },
    { label: `drafted ${permits.drafting || 0}`, done: (permits.drafting || 0) === 0 },
    { label: `screening ${permits.submitted}`, done: permits.submitted === 0 },
    { label: `referral ${permits.inReferral || 0}`, done: (permits.inReferral || 0) === 0 },
    { label: `decision ${permits.inReview}`, done: permits.inReview === 0 },
    { label: `deficiency ${permits.needsRevision || 0}`, done: (permits.needsRevision || 0) === 0 },
    { label: `issued ${permits.approved}/${permits.target}`, done: permits.approved >= permits.target }
  ];

  const alerts = [];
  for (const line of formatPermitClockLines(journey, 2)) {
    alerts.push({ level: 'warn', text: line });
  }
  if (daysRemaining <= 5) {
    alerts.push({ level: 'danger', text: `Deadline pressure: ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining.` });
  }

  ui.setMissionStatus?.({
    objective: `Get ${permits.target} permits issued by the District Manager by Day ${journey.deadline} (${permits.approved} issued).`,
    meter: { label: 'Issued', value: permitProgress, text: `${permits.approved}/${permits.target}` },
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
  ui.write(`  Backlog: ${journey.permits.backlog || 0} | Drafted: ${journey.permits.drafting || 0}`);
  ui.write(`  Screening: ${journey.permits.submitted} | On referral: ${journey.permits.inReferral || 0}`);
  ui.write(`  At the District Manager: ${journey.permits.inReview} | Deficiency letters: ${journey.permits.needsRevision}`);
  const live = getPermitFiles(journey).filter((file) => file.lane !== 'issued');
  for (const file of live.slice(0, 8)) {
    ui.write(`    - ${file.label}: ${describeLane(file, journey)}`);
  }
  const referral = getReferralWindow(journey);
  ui.write(`  Referral window this season: ${referral.calendarDays} calendar days (${referral.deskDays} desk day${referral.deskDays === 1 ? '' : 's'})`);
  ui.write(`  Scrutiny: ${Math.round(journey.scrutiny || 0)}% | Regulatory standing: ${Math.round(journey.regulations?.complianceScore || 0)}%`);
  ui.write(`  Pressure on the file: ${formatConstraintPressure(journey.permits.phase3Pressure || derivePermittingConstraintState(journey))}`);
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
    ui.write(`  Open Deficiency Letters: ${revisionQueue.length}`);
    for (const ticket of revisionQueue.slice(0, 3)) {
      ui.write(`    - ${ticket.fileLabel || ticket.id} (${ticket.title}): ${ticket.summary}`);
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
    ui.writeDivider('WORKING RELATIONSHIPS');
    ui.write(`District office: ${journey.relationships.ministry}%`);
    ui.write(`${nationName(journey)}: ${journey.relationships.nations}%`);
    ui.write(`Agencies (DFO / ENV / Archaeology Branch): ${journey.relationships.agencies}%`);
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
  const revisionQueue = ensurePermittingRevisionState(journey);
  const laneAction = getPermittingLaneAction(journey);
  const openRevisionTickets = revisionQueue.filter((ticket) => ticket && !ticket.resolved);
  const queueWork = describeQueueWork(journey);

  // The turn is split so it reads as a decision, not an audit:
  //   primary  = the best move + core queue throughput (kept ≤6)
  //   support  = relationships, the office, crisis, recovery — one level down
  const primary = [];
  const support = [];

  // When the only live work is a deficiency letter, answering it is the day.
  const lettersFirst = openRevisionTickets.length > 0 && !queueWork;
  openRevisionTickets.forEach((ticket, index) => {
    const bucket = index === 0 ? primary : support;
    bucket.push({
      label: `Clean response: ${ticket.fileLabel || ticket.id}`,
      description: `${lettersFirst || openRevisionTickets.length >= 3 ? 'Best move | ' : ''}${ticket.title}: ${ticket.summary}`,
      value: `revise_permit:${ticket.id}:clean`
    });
    bucket.push({
      label: `Fast-track: ${ticket.fileLabel || ticket.id}`,
      description: `${ticket.title}: quicker resubmission, but more heat on the file`,
      value: `revise_permit:${ticket.id}:fast`
    });
  });

  // Process Permits is the queue — offered only while the queue has work
  // that is not a deficiency letter.
  if (queueWork) {
    primary.push({
      label: queueWork.label,
      description: queueWork.description,
      value: 'process_permits'
    });
  }

  if ((journey.permits.inReferral || 0) > 0) {
    const [file] = getPermitFilesInLane(journey, 'referral').sort((a, b) => a.clockCloses - b.clockCloses);
    const warm = (journey.relationships?.nations || 0) >= REFERRAL_CHASE_RELATIONSHIP;
    primary.push({
      label: 'Follow Up on Referrals',
      description: file
        ? `${file.label} is with ${nationName(journey)} (${describeLane(file, journey)}). ${warm ? 'The relationship is good enough that a call can bring the response in a day early.' : 'Keep in touch; the relationship is not yet warm enough to move the clock.'}`
        : `Keep in touch with ${nationName(journey)} on the files out on referral`,
      value: 'follow_up_referrals'
    });
  }

  // The lane action is always available, but it only earns the "Best move"
  // callout when admin is actually urgent — otherwise players learn to spam
  // it every turn while the real queue sits untouched.
  {
    const professional = getPermittingProfessionalSnapshot(journey);
    const pieces = [];
    if (professional?.registrationStatus !== 'active') {
      pieces.push(`registration ${professional.registrationStatus} (your licence to sign off is not current)`);
    }
    if (professional?.cpdGap > 0) {
      pieces.push(`CPD ${professional.cpdHours}/${professional.cpdTarget}h logged this season`);
    }
    if ((professional?.paperworkLoad || 0) >= PAPERWORK_ADMIN_URGENT_THRESHOLD) {
      pieces.push(`filing backlog ${professional.paperworkLoad} (the next audit will find it)`);
    }
    const adminUrgent = openRevisionTickets.length === 0 && (
      (professional?.paperworkLoad || 0) >= PAPERWORK_ADMIN_URGENT_THRESHOLD
      || professional?.registrationStatus !== 'active'
    );
    const laneDetail = `Lane: ${laneAction.laneLabel.toLowerCase()} | Stage: ${laneAction.stageLabel}`;
    const prefix = adminUrgent ? 'Best move | ' : '';
    primary.push({
      label: laneAction.actionLabel,
      description: pieces.length
        ? `${prefix}${laneDetail} | Clears: ${pieces.join(' | ')}`
        : `${prefix}${laneDetail}`,
      value: 'professional_admin'
    });
  }

  // Support actions: relationships, the office, crisis response, recovery.
  support.push({
    label: DESK_ACTIONS.stakeholder_meeting.name,
    description: DESK_ACTIONS.stakeholder_meeting.description,
    value: 'stakeholder_meeting'
  });
  support.push({
    label: DESK_ACTIONS.team_morale.name,
    description: DESK_ACTIONS.team_morale.description,
    value: 'team_morale'
  });
  support.push({
    label: DESK_ACTIONS.crisis_management.name,
    description: DESK_ACTIONS.crisis_management.description,
    value: 'crisis_management'
  });
  if (journey.protagonist) {
    support.push({
      label: 'Take a Break',
      description: 'Reduce stress, recover energy',
      value: 'rest'
    });
  }

  // Several open letters can land on the same profile once the deficiency
  // queue outgrows PERMIT_REVISION_PROFILES; collapse exact repeats down to
  // one visible row per label+description.
  const dedupedSupport = dedupeMenuOptions(support);

  if (dedupedSupport.length > 0) {
    primary.push({
      label: 'Office & Support ▸',
      description: 'The district, the Nation, the agencies, the office, and recovery',
      value: 'support_menu'
    });
  }

  primary.push({
    label: 'Review the File',
    description: 'Every clock in the queue, pressure, relationships, and carry-forward notes',
    value: 'briefing'
  });

  primary.push({
    label: 'End Day Early',
    description: 'Rest and start fresh tomorrow; the district clocks keep running',
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

function describeDraftedFiles(files) {
  return files.map((file) => file.label).join(', ');
}

/**
 * The paperwork chains move real files now: a screen or a map exhibit drafts
 * something, a submission files it, and the closing stage chases a clock.
 */
function applyPermittingLaneThroughput(journey, chainId, stage, ui) {
  if (chainId === 'roadPermit' || chainId === 'specialUse' || chainId === 'archaeology') {
    if (stage === 'screen') {
      const drafted = draftPermits(journey, 1);
      if (drafted.length) ui.write(`Screening opened ${describeDraftedFiles(drafted)} for drafting.`);
      return;
    }
    if (stage === 'map' || stage === 'bundle') {
      const drafted = draftPermits(journey, 2);
      if (drafted.length) ui.write(`Drafted ${describeDraftedFiles(drafted)}.`);
      return;
    }
    if (stage === 'submit') {
      const submitted = submitPermits(journey, 2);
      if (submitted.length) ui.write(`Filed ${describeDraftedFiles(submitted)} with the district.`);
      return;
    }
    if (stage === 'field-review') {
      const file = shortenPermitClock(journey, ['referral', 'decision']);
      if (file) ui.write(`The field review unstuck ${file.label}: ${sentence(describeLane(file, journey))}.`);
      return;
    }
    const file = shortenPermitClock(journey, ['screening', 'decision']);
    if (file) ui.write(`The cleaner file moved ${file.label} a day closer: ${sentence(describeLane(file, journey))}.`);
  }
}

/**
 * Work the queue for a day: draft the backlog, submit what is drafted, or
 * chase the district on the closest clock.
 * @returns {string[]} messages
 */
export function workPermitQueue(journey) {
  const messages = [];
  const plan = planQueueWork(journey);
  if (!plan.step) {
    messages.push('Nothing is moving in the district queue until the deficiency letters are answered.');
    return { worked: false, messages };
  }
  spendDay(journey);
  applyProtagonistCost(journey, { energy: 8, stress: 5 });

  if (plan.step === 'draft') {
    const drafted = draftPermits(journey, DAILY_PERMIT_THROUGHPUT);
    messages.push(`Drafted ${describeDraftedFiles(drafted)}.`);
    const hca = drafted.find((file) => file.type === 'HCA');
    if (hca) {
      const held = drafted.find((file) => file.pausedBy === hca.id);
      messages.push(`${held?.label || 'The cutting permit'} sits on ground with a heavy heritage screen; an HCA permit goes in alongside it and the CP waits for the Archaeology Branch.`);
    }
    applyPermittingProfessionalWork(journey, { paperworkLoad: 2, auditExposure: 1 });
    return { worked: true, messages, step: 'draft', files: drafted };
  }

  if (plan.step === 'submit') {
    const submitted = submitPermits(journey, DAILY_PERMIT_THROUGHPUT);
    messages.push(`Submitted ${describeDraftedFiles(submitted)} to the district.`);
    for (const file of submitted) {
      const def = PERMIT_TYPES[file.type] || PERMIT_TYPES.CP;
      const tail = file.wsaClockCloses ? ` WSA s.11 notification window closes Day ${file.wsaClockCloses}.` : '';
      messages.push(`${file.label}: ${def.screeningNote} closes Day ${file.clockCloses}${def.referral ? `, then ${getReferralWindow(journey).calendarDays}-day referral to ${nationName(journey)}` : ', then straight to the District Manager'}.${tail}`);
    }
    applyPermittingProfessionalWork(journey, { paperworkLoad: 3, competenceRisk: -1, auditExposure: 1 });
    return { worked: true, messages, step: 'submit', files: submitted };
  }

  // chase
  const warm = (journey.relationships?.ministry || 0) >= DISTRICT_CHASE_RELATIONSHIP;
  const [file] = getChaseableFiles(journey, ['screening', 'decision']);
  if (warm && file) {
    shortenPermitClock(journey, ['screening', 'decision']);
    messages.push(`You walk ${file.label} over to the district in person. ${sentence(describeLane(file, journey))}.`);
    journey.resources.politicalCapital = Math.max(0, (journey.resources.politicalCapital || 0) - 1);
  } else if (file) {
    messages.push(`You call the district about ${file.label}. They are polite; the clock does not move. ${sentence(describeLane(file, journey))}.`);
    if (journey.relationships) {
      journey.relationships.ministry = Math.min(100, (journey.relationships.ministry || 0) + 2);
    }
  }
  applyPermittingProfessionalWork(journey, { paperworkLoad: 1, auditExposure: 0 });
  return { worked: true, messages, step: 'chase', files: file ? [file] : [] };
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

  // Permit-specific actions
  switch (actionId) {
    case 'briefing': {
      displayPermittingBriefing(ui, journey);
      await ui.promptChoice('', [{ label: 'Close the file', value: 'next' }]);
      return;
    }

    case 'process_permits':
    case 'draft_permit':
    case 'submit_permit': {
      const result = workPermitQueue(journey);
      ui.write('');
      for (const msg of result.messages) ui.write(msg);
      if (journey.professional?.registrationStatus !== 'active') {
        ui.writeWarning('Registration is not current; the district reads every one of these with that in mind.');
      }
      return;
    }

    case 'follow_up_referrals': {
      const referrals = getPermitFilesInLane(journey, 'referral');
      if (referrals.length > 0) {
        spendDay(journey);
        applyProtagonistCost(journey, { energy: 6, stress: 4 });
        const nation = nationName(journey);
        const warm = (journey.relationships?.nations || 0) >= REFERRAL_CHASE_RELATIONSHIP;
        const file = warm ? shortenPermitClock(journey, ['referral']) : null;
        if (file) {
          ui.write(`${sentence(nation)}'s referral coordinator takes the call about ${file.label}; the response is coming a day early. ${sentence(describeLane(file, journey))}.`);
          if (journey.relationships) {
            const lift = discoveryIds.has('cultural_hold') ? 3 : 2;
            journey.relationships.nations = Math.min(100, journey.relationships.nations + lift);
          }
          applyPermittingProfessionalWork(journey, { paperworkLoad: -1, auditExposure: -1, competenceRisk: -1 });
        } else {
          ui.write(warm
            ? `You check in with ${nation}'s referral coordinator on ${referrals[0].label}; the response is already on its way tonight, and the relationship is warmer for the call.`
            : `You check in with ${nation}'s referral coordinator on ${referrals[0].label}. The window runs its course, but the relationship is warmer for the call.`);
          if (journey.relationships) {
            journey.relationships.nations = Math.min(100, journey.relationships.nations + 4);
          }
          applyPermittingProfessionalWork(journey, { paperworkLoad: 1, auditExposure: 0 });
        }
        journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 1);
      }
      return;
    }

    case 'stakeholder_meeting': {
      const nation = nationName(journey);
      const choice = await ui.promptChoice('Who do you meet?', [
        { label: 'District office', description: 'Walk a file through completeness with district staff; a file at the decision-maker can be issued on the spot', value: 'ministry' },
        { label: nation, description: `Sit down with ${nation}'s referral coordinator; a file on referral moves a day early`, value: 'nations' },
        { label: 'Agencies (DFO / ENV)', description: 'Sort the in-stream work window and the crossing questions before they become letters', value: 'agencies' },
      ]);
      const result = executeDeskDay(journey, 'stakeholder_meeting', { stakeholder: choice.value || 'ministry' });
      applyProtagonistCost(journey, { energy: 10, stress: 5 });
      ui.write('');
      for (const msg of result?.messages || []) ui.write(msg);
      reconcilePermitFiles(journey);
      ensurePermittingRevisionState(journey);
      return;
    }

    case 'professional_admin': {
      const chainId = getPermittingPaperworkChainId(journey);
      const chainProgress = progressPermittingPaperworkChain(journey, chainId, 1);
      const stage = chainProgress?.stage || 'renewal';
      spendDay(journey);
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

      if (chainProgress?.stage && chainId !== 'registration') {
        ui.write(`Completed: ${formatPermittingStageLabel(chainProgress.stage, chainId)}.${chainProgress.next ? ` Next: ${formatPermittingStageLabel(chainProgress.next, chainId)}.` : ' The chain is complete.'}`);
      }
      return;
    }

    case 'rest':
      if (journey.protagonist) {
        journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 15);
        journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 10);
      }
      spendDay(journey);
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
    reconcilePermitFiles(journey);
    ensurePermittingRevisionState(journey);
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
    // Every clock in the queue runs a day; the district decides what is due.
    processPermitPipeline(ui, journey);

    if ((journey.permits.inReferral || 0) >= 3) {
      const drag = Math.min(3, Math.ceil(journey.permits.inReferral / 2));
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - drag);
      if (journey.protagonist) {
        journey.protagonist.stress = Math.min(100, journey.protagonist.stress + drag * 2);
      }
      ui.writeWarning(`${journey.permits.inReferral} files are out on referral at once. The mill wants dates. District goodwill -${drag}.`);
    }

    if (journey.day >= Math.max(10, journey.deadline - 10) && (journey.permits.backlog || 0) >= 4) {
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 2);
      ui.writeWarning('The woodlands manager is pressing for the backlog to move. District goodwill -2.');
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
        // A CPD record that is behind is what an FPBC audit finds first.
        if (journey.day % 4 === 0) {
          journey.scrutiny = clampPercent(Math.round((journey.scrutiny || 0) + 1));
        }
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
    startDay(journey);
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
    ? `Start next day... (${daysLeft} days left, ${permitPct}% issued)`
    : 'Start next day... (DEADLINE)';
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
}

/**
 * The share of decided files the District Manager issues rather than returns
 * with a deficiency letter. Scrutiny, the pressures on the file, road intel
 * and the professional file all cost points; the floor keeps a bad season
 * playable.
 */
export function getPermitApprovalRate(journey) {
  const pressure = journey?.permits?.phase3Pressure || derivePermittingConstraintState(journey);
  const roadIntel = getPermittingRoadAssetContext(journey);
  const professional = getPermittingProfessionalSnapshot(journey);
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
  return Math.max(0.42, 0.8 - scrutinyPenalty - phase3Penalty - roadPenalty - professionalPenalty);
}

/** Share of screened files bounced as incomplete. */
export function getPermitCompletenessReturnRate(journey) {
  const professional = getPermittingProfessionalSnapshot(journey);
  const paperwork = Math.min(0.12, (professional?.paperworkLoad || 0) / 250);
  const registration = professional?.registrationActive ? 0 : 0.1;
  return Math.min(0.35, 0.08 + paperwork + registration);
}

/**
 * Process permit pipeline - the nightly pass at the district
 * @param {Object} ui - UI instance
 * @param {Object} journey - Journey state
 */
function processPermitPipeline(ui, journey) {
  reconcilePermitFiles(journey);
  ensurePermittingRevisionState(journey);
  const pressure = journey?.permits?.phase3Pressure || derivePermittingConstraintState(journey);

  const result = advancePermitClocks(journey, {
    approvalRate: getPermitApprovalRate(journey),
    completenessReturnRate: getPermitCompletenessReturnRate(journey),
  });

  for (const entry of result.advanced) {
    const file = entry.file;
    if (file.lane === 'referral') {
      ui.write(`${file.label} passed the completeness screen; referred to ${nationName(journey)}. ${sentence(describeLane(file, journey))}.`);
    } else {
      ui.write(`${file.label} is with the District Manager. ${sentence(describeLane(file, journey))}.`);
    }
  }

  for (const entry of result.held) {
    ui.write(`${entry.file.label} holds: ${entry.reason}.`);
  }

  if (result.issued.length > 0) {
    applyPermittingProfessionalWork(journey, { paperworkLoad: -1, auditExposure: -1 });
    // The stamp comes down beside the message — non-blocking, like vignettes.
    if (typeof ui.playScene === 'function') {
      ui.playScene(buildStampFrames('ISSUED'), { delay: 110 });
    }
    for (const entry of result.issued) {
      ui.writePositive(`${entry.file.label} ISSUED by the District Manager.`);
    }
  }

  if (result.returned.length > 0) {
    for (const entry of result.returned) {
      const ticket = pushRevisionTicket(journey, entry.file, {
        type: 'review',
        reason: entry.stage === 'screening' ? 'incomplete' : 'returned_for_revision',
        pressure: pressure.dominant
      });
      ui.writeWarning(`${entry.file.label} returned with a deficiency letter — ${ticket.title}: ${ticket.summary}`);
    }
    applyPermittingProfessionalWork(journey, { paperworkLoad: 2, auditExposure: 1 });
  }

  ensurePermittingRevisionState(journey);
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
