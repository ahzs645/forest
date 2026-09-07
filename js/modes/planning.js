/**
 * Planning Mode Runner
 * Protagonist-based strategic planning: the licensee's Forest Stewardship
 * Plan replacement and the first Forest Operations Map for the operating
 * area, decided by the District Manager. One-action days with values tradeoffs.
 */

import { checkForEvent } from '../events.js';
import { runDaySituation } from '../journey/daySituation.js';
import { presentDayCard, formatStatusLine } from '../journey/dayCard.js';
import { buildOfficeWindowFrames } from '../scene/textmode/scenes.js';
import { getCurrentSeasonInfo, advanceDay as advanceSeasonDay } from '../season.js';
import {
  buildPlanningConstraintTriage,
  formatWaterGateLabel,
  getPlanningAreaBlockPool,
  getPlanningTriageLabel,
  getPlanningTriageScrutinyDelta,
  getPlanningBlockWaterContext,
  pickPlanningBlockOptions,
  summarizePlanningBlock,
  formatPlanningBlockLabel,
  formatPlanningBlockPromptDescription,
  formatPlanningBlockTriageEvidence,
} from '../data/planningBlocks.js';
import { PLANNING_DECISION_GATE } from '../journey/constants.js';
import {
  formatRoadAssetSummary,
  getPlanningRoadAssetContext,
} from '../data/roadAssetIntel.js';
import {
  advanceProfessionalComplianceChain,
  applyProfessionalComplianceShift,
  ensureProfessionalComplianceState,
  getProfessionalComplianceSnapshot,
} from '../engine.js';
import { checkPlanningEndConditions, isPlanningApprovalReady } from './shared/endConditions.js';
import { getOperationalProgress, recordProgressMilestones } from '../journey.js';
import { getDiscoveryTagNotes, getJourneyDiscoveryTags } from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';
import { startDay, spendDay, dayIsSpent, dayPrompt, settleDayPass } from '../journey/dayPlan.js';

/**
 * What a day on each track of the planning file is worth.
 *
 * These used to be the yield of a three or four hour block, taken two or three
 * times a day. A day is one action now (js/journey/dayPlan.js), so each track
 * moves by a day's worth instead — otherwise the file cannot reach its gates
 * before the current FSP expires. Sized with scripts/simulate-expeditions.mjs.
 */
const DAY_OF_DATA = 18;
const DAY_OF_ANALYSIS = 26;
const DAY_OF_CONSULTATION = 18;
/** What a day walking the draft with the District Manager is worth in readiness. */
const DAY_OF_DISTRICT_MEETING = 14;
/** A session with a clean engagement record also reassures the district. */
const SESSION_READINESS_LIFT = 3;
/**
 * What the planning team costs a day. The FOM comment period and the
 * pre-submission meetings put a competent file at 21-25 days, so the daily
 * burn is sized for that calendar (scripts/simulate-expeditions.mjs).
 */
const PLANNING_DAILY_BURN = 600;

// The professional reference carried by the game specifies a 30-calendar-day
// comment period. A planning "day" is a compressed turn, so the statutory
// clock advances by 15 calendar days only when the player ends a day.
export const FOM_PUBLIC_REVIEW_MIN_DAYS = 30;
export const FOM_CALENDAR_DAYS_PER_PLANNING_DAY = 15;
export const FOM_MIN_DATA_COMPLETENESS = 30;
export const FOM_MIN_ANALYSIS_QUALITY = 15;
const FOM_PUBLIC_REVIEW_COMMENT_LIMIT = 0;
/** How many blocks the first FOM leads with. */
export const LEAD_BLOCK_SET_SIZE = 3;
// Internal phase keys are persisted in saves (journey.plan.phase), so only
// the labels carry the District Manager framing.
const PLANNING_PHASE_NAMES = {
  data_gathering: 'Inventory & Data',
  analysis: 'Analysis & Draft Plan',
  stakeholder_review: 'Engagement & Public Review',
  ministerial_approval: 'District Manager Decision'
};
/** Water gate ids in order of how hard they hold the file. */
const WATER_GATE_RANK = { clear: 0, watch: 1, hold: 2 };
/**
 * A HOLD on the water gate is the works in and about a stream (WSA s.11)
 * review: hydrology readiness climbs with every FOM day spent on it, and at
 * this level the HOLD becomes a WINDOW — the in-stream work window is on
 * the map and the notification is filed.
 */
export const WSA_REVIEW_READINESS = 60;
const WSA_REVIEW_PROGRESS_PER_DAY = 20;

export function getEffectiveWaterGate(fom, waterContext) {
  const rawGate = waterContext?.gate || 'clear';
  if (rawGate === 'hold' && (fom?.hydrologyReadiness || 0) >= WSA_REVIEW_READINESS) return 'watch';
  return rawGate;
}

function describeEffectiveWaterNote(fom, waterContext) {
  const gate = getEffectiveWaterGate(fom, waterContext);
  if (waterContext?.gate === 'hold' && gate === 'watch') {
    return `${waterContext.hydrologyLabel} — works in and about a stream review done; in-stream work window on the map and WSA s.11 notification filed.`;
  }
  return waterContext?.note || 'No water gate evaluated yet.';
}

function progressWaterGateReview(fom, waterContext, baseGain) {
  const gain = waterContext?.gate === 'hold' ? WSA_REVIEW_PROGRESS_PER_DAY : baseGain;
  fom.hydrologyReadiness = Math.min(100, Math.max(fom.hydrologyReadiness || 0, waterContext?.readiness || 0) + gain);
  return gain;
}

function ensurePlanningProfessionalState(journey) {
  return ensureProfessionalComplianceState(journey);
}

function getPlanningProfessionalSnapshot(journey) {
  return getProfessionalComplianceSnapshot(journey);
}

function describePlanningProfessionalSnapshot(snapshot) {
  if (!snapshot) return 'Registration n/a | CPD n/a | Paperwork n/a | Audit n/a';
  const burden = snapshot.areaBurdenLabel ? ` | ${snapshot.areaBurdenLabel}` : '';
  const filing = snapshot.paperworkLoad >= PAPERWORK_FLAG_THRESHOLD ? 'high — the next audit will find it' : 'manageable';
  return `Registration: ${snapshot.registrationStatus} | CPD logged this season: ${snapshot.cpdHours}/${snapshot.cpdTarget}h | Filing backlog: ${filing} | Audit exposure: ${snapshot.auditExposure}${burden}`;
}

/** Paperwork load at which the filing backlog is worth a flag on the card. */
const PAPERWORK_FLAG_THRESHOLD = 20;

/**
 * What on the professional file stops the submission. Only registration
 * gates the file — a CPD shortfall or audit exposure shows up as scrutiny
 * and in the odds of an FPBC audit, not as a reason the DM cannot decide.
 */
function getPlanningProfessionalIssues(journey) {
  const snapshot = getPlanningProfessionalSnapshot(journey);
  if (!snapshot) return [];

  const reasons = [];
  if (!snapshot.registrationActive) {
    reasons.push(`registration is ${snapshot.registrationStatus}`);
  }
  return reasons;
}

function getPlanningApprovalGaps(journey) {
  const plan = journey?.plan || {};
  const gaps = [];

  if ((plan.dataCompleteness || 0) < 80) {
    gaps.push({
      key: 'data',
      actionLabel: 'Gather Data',
      headline: `Gather Data to recover the technical file to 80% completeness (${plan.dataCompleteness || 0}% now).`,
      followUp: 'Recover the baseline package before you keep pushing the approval file.',
      reason: `data completeness ${plan.dataCompleteness || 0}%`
    });
  }

  if ((plan.analysisQuality || 0) < 80) {
    gaps.push({
      key: 'analysis',
      actionLabel: 'Run Analysis',
      headline: `Run Analysis to rebuild the model package to 80% (${plan.analysisQuality || 0}% now).`,
      followUp: 'Reopen the technical lane until the analysis package clears again.',
      reason: `analysis quality ${plan.analysisQuality || 0}%`
    });
  }

  if ((plan.stakeholderBuyIn || 0) < 75) {
    gaps.push({
      key: 'stakeholder',
      actionLabel: 'Stakeholder Session',
      headline: `Stakeholder Session to rebuild buy-in to 75% (${plan.stakeholderBuyIn || 0}% now).`,
      followUp: 'Recover buy-in before you spend more hours on approval-stage work.',
      reason: `stakeholder buy-in ${plan.stakeholderBuyIn || 0}%`
    });
  }

  return gaps;
}


function applyPlanningProfessionalWork(journey, changes = {}) {
  const professional = ensurePlanningProfessionalState(journey);
  if (!professional) return null;
  return applyProfessionalComplianceShift(journey, changes);
}

function progressPlanningPaperworkChain(journey, chainId, stepCount = 1) {
  const chain = advanceProfessionalComplianceChain(journey, chainId, stepCount);
  if (!chain) {
    return null;
  }

  const stepIndex = Math.min(chain.stepIndex, chain.steps.length) - 1;
  const stage = stepIndex >= 0 ? chain.steps[stepIndex] : chain.steps[0];
  return { chain, stage };
}

function ensurePlanningFomState(journey) {
  const blockPlanning = journey.blockPlanning || (journey.blockPlanning = {});
  const fom = blockPlanning.fom || (blockPlanning.fom = {});

  if (!fom.status) {
    fom.status = 'draft';
  }
  // Older saves recorded the end of the comment period as 'approved'. A FOM
  // is published for comment, not approved; the period closes.
  if (fom.status === 'approved') {
    fom.status = 'closed';
  }
  if (!Number.isFinite(fom.reviewDaysRemaining)) {
    fom.reviewDaysRemaining = 0;
  }
  if (!Number.isFinite(fom.commentLoad)) {
    fom.commentLoad = 0;
  }
  if (!Number.isFinite(fom.hydrologyReadiness)) {
    fom.hydrologyReadiness = 100;
  }
  if (!fom.waterGate) {
    fom.waterGate = 'clear';
  }
  if (!fom.waterNote) {
    fom.waterNote = 'No water gate evaluated yet.';
  }
  if (!fom.hydrologyLabel) {
    fom.hydrologyLabel = 'water timing';
  }
  if (!Number.isFinite(fom.roadEngineeringReadiness)) {
    fom.roadEngineeringReadiness = 100;
  }
  if (!Number.isFinite(fom.roadEngineeringPressure)) {
    fom.roadEngineeringPressure = 0;
  }
  if (!fom.roadSummary) {
    fom.roadSummary = '';
  }
  if (!fom.roadNote) {
    fom.roadNote = 'No road-access intel loaded yet.';
  }
  if (!Array.isArray(fom.roadBlockerReasons)) {
    fom.roadBlockerReasons = [];
  }
  if (typeof fom.roadBlocker !== 'boolean') {
    fom.roadBlocker = false;
  }
  return fom;
}

function describeReviewState(fom) {
  if (!fom) return 'Draft';
  switch (fom.status) {
    case 'public_review':
      return `Comment period: ${Math.max(0, fom.reviewDaysRemaining)} calendar days left`;
    case 'revision_required':
      return 'Comments need a response';
    case 'closed':
      return 'Comment period closed';
    default:
      return 'Draft';
  }
}

export function getFomPublicationGaps(journey) {
  const gaps = [];
  if (!journey?.blockPlanning?.activeBlock) gaps.push('lock the lead block set');
  const data = Math.round(Number(journey?.plan?.dataCompleteness || 0));
  const analysis = Math.round(Number(journey?.plan?.analysisQuality || 0));
  if (data < FOM_MIN_DATA_COMPLETENESS) gaps.push(`data ${data}%/${FOM_MIN_DATA_COMPLETENESS}%`);
  if (analysis < FOM_MIN_ANALYSIS_QUALITY) gaps.push(`analysis ${analysis}%/${FOM_MIN_ANALYSIS_QUALITY}%`);
  return gaps;
}

function getPlanningPhaseLabel(phase) {
  return PLANNING_PHASE_NAMES[phase] || phase;
}

/**
 * The blocks the first FOM leads with. Saves from before the lead set carry
 * only an active block, which is a set of one.
 */
export function getPlanningLeadBlocks(journey) {
  const state = journey?.blockPlanning;
  if (!state) return [];
  if (Array.isArray(state.leadBlocks) && state.leadBlocks.length) return state.leadBlocks;
  return state.activeBlock ? [state.activeBlock] : [];
}

export function formatPlanningLeadBlocks(journey) {
  const blocks = getPlanningLeadBlocks(journey);
  if (!blocks.length) return '';
  return blocks.map((block) => formatPlanningBlockLabel(block).replace(/^Cutblock /, '')).join(', ');
}

/**
 * The water gate for the file is the worst gate in the lead set: one block
 * with an in-stream work window holds the whole FOM.
 */
export function getPlanningLeadWaterContext(journey, seasonInfo = null) {
  const blocks = getPlanningLeadBlocks(journey);
  let worst = null;
  for (const block of blocks) {
    const context = getPlanningBlockWaterContext(block, journey.area, seasonInfo);
    if (!worst
      || WATER_GATE_RANK[context.gate] > WATER_GATE_RANK[worst.gate]
      || (context.gate === worst.gate && context.timingPressure > worst.timingPressure)) {
      worst = { ...context, block };
    }
  }
  return worst || { ...getPlanningBlockWaterContext(null, journey.area, seasonInfo), block: null };
}

/** The road file for the FOM is the worst road context in the lead set. */
export function getPlanningLeadRoadContext(journey) {
  const blocks = getPlanningLeadBlocks(journey);
  let worst = null;
  for (const block of blocks) {
    const context = getPlanningRoadAssetContext(journey, block);
    const score = (context.blocker ? 1000 : 0) + (context.readinessPenalty || 0) + (context.engineeringPressure || 0);
    if (!worst || score > worst.score) worst = { ...context, block, score };
  }
  return worst || { ...getPlanningRoadAssetContext(journey, null), block: null, score: 0 };
}

export function syncFomStateFromActiveBlock(journey, seasonInfo) {
  const blockPlanning = journey.blockPlanning;
  if (!blockPlanning?.activeBlock) return ensurePlanningFomState(journey);

  const fom = ensurePlanningFomState(journey);
  const waterContext = getPlanningLeadWaterContext(journey, seasonInfo);
  const roadContext = getPlanningLeadRoadContext(journey);
  const activeBlockId = blockPlanning.activeBlock.id;

  // The FOM submission is plan-level, not per-block: Cutblock Priority
  // Decision can reassign the active block focus mid-run, and that switch
  // used to reset fom.status straight back to 'draft', silently discarding
  // review progress (or even a completed approval) every time the block
  // changed. Seed the review clock only the first time this journey gets an
  // FOM tracker; after that, changing the active block just refreshes the
  // descriptive water/road readiness context below without rewinding
  // status/reviewDaysRemaining/commentLoad.
  if (!fom.activeBlockId) {
    fom.status = 'draft';
    fom.reviewDaysRemaining = waterContext.reviewDays;
    fom.commentLoad = waterContext.commentCount;
    fom.publicReviewOpenedDay = null;
    fom.approvedDay = null;
    fom.revisionNotes = '';
    // Hydrology readiness starts where the worst block in the set puts it
    // and climbs only with FOM work (the WSA s.11 review), so it is seeded
    // once rather than reset on every sync.
    fom.hydrologyReadiness = waterContext.readiness;
  }

  fom.activeBlockId = activeBlockId;
  fom.blockLabel = formatPlanningLeadBlocks(journey) || blockPlanning.activeSummary || blockPlanning.activeBlock.label || blockPlanning.activeBlock.id;
  fom.hydrologyReadiness = Math.min(100, Math.max(fom.hydrologyReadiness || 0, waterContext.readiness));
  fom.rawWaterGate = waterContext.gate;
  fom.waterGate = getEffectiveWaterGate(fom, waterContext);
  fom.waterNote = describeEffectiveWaterNote(fom, waterContext);
  fom.hydrologyLabel = waterContext.hydrologyLabel;
  fom.reviewDaysTarget = Math.max(FOM_PUBLIC_REVIEW_MIN_DAYS, waterContext.reviewDays);
  fom.roadSource = roadContext.source;
  fom.roadSummary = formatRoadAssetSummary(roadContext);
  fom.roadEngineeringPressure = roadContext.engineeringPressure;
  fom.roadHydrologyPressure = roadContext.hydrologyPressure;
  fom.roadTimingPressure = roadContext.timingPressure;
  fom.roadReviewDays = roadContext.reviewDays;
  fom.roadCommentLoad = roadContext.commentLoad;
  fom.roadEngineeringReadiness = Math.max(0, 100 - roadContext.readinessPenalty);
  fom.roadReadinessPenalty = roadContext.readinessPenalty;
  fom.roadRankingPenalty = roadContext.rankingPenalty;
  fom.roadBlocker = roadContext.blocker;
  fom.roadBlockerReasons = roadContext.blockerReasons || [];
  fom.roadNote = roadContext.note;

  if (fom.status === 'draft' && waterContext.gate !== 'clear') {
    fom.commentLoad = Math.max(fom.commentLoad, waterContext.commentCount);
  }

  return fom;
}

function getFomActionLabel(fom, roadContext = null) {
  const roadSuffix = roadContext?.hasData ? ' + Road Review' : '';
  switch (fom?.status) {
    case 'public_review':
      return `Update FOM Review${roadSuffix}`;
    case 'revision_required':
      return `Revise FOM${roadSuffix}`;
    case 'closed':
      return roadContext?.hasData ? 'Check FOM / Road Record' : 'Check FOM Record';
    default:
      return `Open FOM Review${roadSuffix}`;
  }
}

function getFomActionDescription(fom, roadContext = null) {
  const roadTail = roadContext?.hasData
    ? ` Road-access intel: ${roadContext.summary}.`
    : '';
  switch (fom?.status) {
    case 'public_review':
      return `Log and respond to comments while the ${Math.max(0, fom.reviewDaysRemaining)}-calendar-day comment period runs; one planning day advances ${FOM_CALENDAR_DAYS_PER_PLANNING_DAY} calendar days.${roadTail}`;
    case 'revision_required':
      return `Respond to the comments, especially the in-stream work window (WSA s.11), then republish the map.${roadTail}`;
    case 'closed':
      return `Confirm the comment record and keep the submission package consistent with the map.${roadTail}`;
    default:
      return `Publish the Forest Operations Map for the lead block set once baseline data and preliminary analysis are ready; opens the required 30-calendar-day comment period.${roadTail}`;
  }
}

function updatePlanningFomStatus(ui, fom, waterContext, roadContext, sourceLabel = 'review work') {
  if (!fom) {
    return false;
  }

  const roadClear = !roadContext?.blocker;
  const reviewClear = (fom.reviewDaysRemaining || 0) <= 0;
  const commentsClear = (fom.commentLoad || 0) <= FOM_PUBLIC_REVIEW_COMMENT_LIMIT;
  const waterClear = getEffectiveWaterGate(fom, waterContext) !== 'hold';

  if (reviewClear && commentsClear && waterClear && roadClear) {
    fom.status = 'closed';
    fom.commentLoad = 0;
    fom.reviewDaysRemaining = 0;
    fom.approvedDay = Math.max(1, fom.lastUpdatedDay || 0);
    ui.writePositive(`FOM comment period closed after ${sourceLabel}; comments logged and responses filed.`);
    return true;
  }

  return false;
}

export function getPlanningSubmissionReadiness(journey, seasonInfo = null) {
  const fom = syncFomStateFromActiveBlock(journey, seasonInfo);
  const waterContext = getPlanningLeadWaterContext(journey, seasonInfo);
  const roadContext = getPlanningLeadRoadContext(journey);
  const professional = getPlanningProfessionalSnapshot(journey);
  const reasons = [];

  if (!journey.blockPlanning?.activeBlock) {
    reasons.push('no lead block set locked');
  }

  if (fom.status !== 'closed') {
    reasons.push(`FOM ${describeReviewState(fom).toLowerCase()}`);
  }

  const waterGate = getEffectiveWaterGate(fom, waterContext);
  if (waterGate === 'hold') {
    reasons.push(fom.waterNote || waterContext.note);
  }

  if (fom.commentLoad > FOM_PUBLIC_REVIEW_COMMENT_LIMIT) {
    reasons.push('public review still carries open comments');
  }

  if (roadContext.blocker) {
    reasons.push(`road-engineering blocker: ${roadContext.blockerReasons.join('; ')}`);
  }

  if (professional && !professional.registrationActive) {
    reasons.push(`registration is ${professional.registrationStatus}`);
  }

  return {
    ready: reasons.length === 0,
    reasons,
    waterContext,
    waterGate,
    roadContext,
    fom,
    professional,
  };
}

function getPlanningValueRecoveryHint(journey, deficits) {
  const sorted = [...(deficits || [])].sort((left, right) => left.value - right.value);
  const primary = sorted[0] || null;
  if (!primary) {
    return null;
  }

  if (primary.label === 'Timber') {
    return {
      actionLabel: 'Timber Supply Analysis',
      headline: `Timber Supply Analysis to lift timber supply from ${primary.value}% before the next gate.`,
      followUp: 'It costs a day of analysis time; use Values Workshop if another value slips meanwhile.'
    };
  }

  const workshopFocus = {
    Bio: 'Emphasize Biodiversity',
    Timber: 'Emphasize Timber Supply',
    Community: 'Emphasize Community',
    FN: 'Emphasize First Nations'
  };

  return {
    actionLabel: 'Values Workshop',
    headline: `Values Workshop to recover ${primary.label} from ${primary.value}% before the next gate.`,
    followUp: `Use ${workshopFocus[primary.label] || 'Balanced Approach'} inside the workshop first.`
  };
}

function pushPlanningGuideStep(steps, text) {
  if (!text || steps.includes(text)) {
    return;
  }
  steps.push(text);
}

function getSubmissionConfidenceGain(readiness) {
  const gate = readiness?.waterGate || readiness?.waterContext?.gate || 'clear';
  return gate === 'clear' ? 18 : 14;
}

/**
 * Where a pre-submission meeting tops out. Only Prepare Submission — the
 * step that checks the FOM comment period, the water gate, the road file and
 * registration — carries DM readiness across the decision gate.
 */
export function getOutreachReadinessCap(readiness) {
  return PLANNING_DECISION_GATE - getSubmissionConfidenceGain(readiness);
}

function buildPlanningActionGuidance(journey, seasonInfo = null) {
  const readiness = getPlanningSubmissionReadiness(journey, seasonInfo);
  const deficits = getValuesGateDeficits(journey);
  const approvalGaps = getPlanningApprovalGaps(journey);
  const professional = getPlanningProfessionalSnapshot(journey);
  const professionalIssues = getPlanningProfessionalIssues(journey);
  const steps = [];
  let lane = 'Technical file';
  let headline = 'Gather Data to keep the planning file moving.';

  if (journey.plan.phase === 'data_gathering') {
    lane = 'Technical file';
    headline = 'Gather Data to reach 80% completeness and open the analysis.';
    pushPlanningGuideStep(steps, 'Pull VRI, LiDAR and the district resource-value layers until the baseline is strong enough to draft against.');
    pushPlanningGuideStep(steps, 'The lead block set is chosen when the analysis opens.');
    return { lane, headline, steps };
  }

  if (!journey.blockPlanning?.activeBlock) {
    lane = 'Block file';
    headline = 'Lock the lead block set when the cutblock priority decision opens so the FOM has somewhere to land.';
    pushPlanningGuideStep(steps, 'Finish the cutblock priority decision before you worry about FOM or submission work.');
    return { lane, headline, steps };
  }

  const fom = readiness.fom;
  const fomOpen = fom?.status === 'draft' && getFomPublicationGaps(journey).length === 0;

  switch (journey.plan.phase) {
    case 'analysis':
      lane = 'Technical file';
      headline = fomOpen
        ? 'Open FOM Review now — the 30-day comment period runs while you finish the analysis.'
        : 'Run Analysis to push the draft plan to 80% and open engagement.';
      pushPlanningGuideStep(steps, 'Run Analysis until the technical package clears the phase gate.');
      pushPlanningGuideStep(steps, 'Publish the FOM as soon as data and preliminary analysis allow; the comment period is the long pole.');
      return { lane, headline, steps };

    case 'stakeholder_review': {
      if (deficits.length > 0) {
        const valueHint = getPlanningValueRecoveryHint(journey, deficits);
        lane = 'Values lane';
        headline = valueHint?.headline || 'Values Workshop to recover the blocked values.';
        pushPlanningGuideStep(steps, valueHint?.followUp || 'Recover the weakest value before reopening the engagement lane.');
        pushPlanningGuideStep(steps, 'Stakeholder Session stays blocked until every value clears 25%.');
        return { lane, headline, steps };
      }

      if (fomOpen) {
        lane = 'FOM / submission file';
        headline = 'Open FOM Review to start the 30-day comment period; buy-in can build while it runs.';
        pushPlanningGuideStep(steps, 'Nothing goes to the District Manager until the comment period has closed.');
        return { lane, headline, steps };
      }

      lane = 'Engagement lane';
      headline = 'Stakeholder Session to push buy-in toward 75% and bring the file to the District Manager.';
      pushPlanningGuideStep(steps, 'Hold Stakeholder Session until buy-in clears the handoff.');
      pushPlanningGuideStep(steps, fom?.status === 'public_review'
        ? `Keep the FOM live: ${Math.max(0, fom.reviewDaysRemaining || 0)} calendar days and ${Math.max(0, fom.commentLoad || 0)} comment${(fom.commentLoad || 0) === 1 ? '' : 's'} to burn down.`
        : 'Use Values Workshop if a session drags a value back down.');
      return { lane, headline, steps };
    }

    default:
      break;
  }

  if (deficits.length > 0) {
    const valueHint = getPlanningValueRecoveryHint(journey, deficits);
    lane = 'Values lane';
    headline = valueHint?.headline || 'Values Workshop to reopen the approval gate.';
    pushPlanningGuideStep(steps, valueHint?.followUp || 'Recover the weakest value first.');
  }

  if (!deficits.length && approvalGaps.length > 0) {
    const gap = approvalGaps[0];
    lane = 'Technical recovery';
    headline = gap.headline;
    pushPlanningGuideStep(steps, gap.followUp);
    return { lane, headline, steps };
  }

  if (!deficits.length && fom?.status !== 'closed') {
    lane = 'FOM / submission file';
    if (fom?.status === 'draft') {
      headline = 'Open FOM Review to start the 30-day comment period on the lead block set.';
      pushPlanningGuideStep(steps, 'Open FOM Review first; nothing goes to the District Manager while the FOM is still a draft.');
    } else if (fom?.status === 'public_review') {
      headline = 'Update FOM Review until the comment period and open comments clear.';
      pushPlanningGuideStep(steps, `Keep the FOM live until the ${Math.max(0, fom.reviewDaysRemaining || 0)} calendar days and comment load burn down; each planning day advances ${FOM_CALENDAR_DAYS_PER_PLANNING_DAY} calendar days.`);
    } else if (fom?.status === 'revision_required') {
      headline = 'Revise FOM to respond to the comments and reopen the submission lane.';
      pushPlanningGuideStep(steps, 'Stay in the FOM lane until the responses, especially on the in-stream work window, are filed.');
    }
    if (readiness.waterGate === 'hold') {
      pushPlanningGuideStep(steps, `${readiness.fom?.waterNote || readiness.waterContext.note} FOM days on the map progress the review.`);
    }
    if (readiness.roadContext?.blocker) {
      pushPlanningGuideStep(steps, `Road blocker: ${readiness.roadContext.blockerReasons.join(' | ')}`);
    }
    return { lane, headline, steps };
  }

  if (!deficits.length && professionalIssues.length > 0) {
    lane = 'Professional file';
    const adminLabel = professional?.registrationActive ? 'Compliance Admin' : 'Renew Registration';
    headline = `${adminLabel} to clear ${professionalIssues[0]} before the package goes to the District Manager.`;
    pushPlanningGuideStep(steps, 'The DM will not accept a plan sealed by someone whose registration is not current.');
    return { lane, headline, steps };
  }

  if (!deficits.length && !readiness.ready) {
    lane = 'Submission package';
    headline = `Clear the submission gate: ${readiness.reasons.join(' | ')}.`;
    if (readiness.waterGate === 'hold') pushPlanningGuideStep(steps, readiness.fom?.waterNote || readiness.waterContext.note);
    if (readiness.roadContext?.blocker) pushPlanningGuideStep(steps, `Road blocker: ${readiness.roadContext.blockerReasons.join(' | ')}`);
    return { lane, headline, steps };
  }

  if (!deficits.length && readiness.ready) {
    const readinessNow = Math.round(journey.plan.ministerialConfidence || 0);
    const directGain = getSubmissionConfidenceGain(readiness);
    const directConfidence = Math.min(100, readinessNow + directGain);
    const cap = getOutreachReadinessCap(readiness);
    if (directConfidence >= PLANNING_DECISION_GATE) {
      lane = 'Submission package';
      headline = `Prepare Submission can carry DM readiness to ${directConfidence}% now — the FOM, water, road and registration gates are clean.`;
      pushPlanningGuideStep(steps, 'Submission costs more energy and budget, but it is the step that puts the file on the District Manager\'s desk.');
      return { lane, headline, steps };
    }
    lane = 'District file';
    headline = `District Pre-Submission Meeting to lift DM readiness toward ${cap}% (${readinessNow}% now); Prepare Submission carries the last ${directGain} points.`;
    pushPlanningGuideStep(steps, 'Walk the District Manager and stewardship staff through the draft before you file it.');
  }

  if (!steps.length) {
    pushPlanningGuideStep(steps, 'Keep the live blocker moving instead of spending hours on low-yield support work.');
  }

  return { lane, headline, steps };
}

export function capturePlanningActionState(journey) {
  return {
    phase: journey.plan?.phase || '',
    data: Number(journey.plan?.dataCompleteness || 0),
    analysis: Number(journey.plan?.analysisQuality || 0),
    buyIn: Number(journey.plan?.stakeholderBuyIn || 0),
    confidence: Number(journey.plan?.ministerialConfidence || 0),
    budget: Number(journey.resources?.budget || 0),
    political: Number(journey.resources?.politicalCapital || 0),
    energy: Number(journey.protagonist?.energy || 0),
    stress: Number(journey.protagonist?.stress || 0),
    biodiversity: Number(journey.values?.biodiversity || 0),
    timber: Number(journey.values?.timberSupply || 0),
    community: Number(journey.values?.communityNeeds || 0),
    firstNations: Number(journey.values?.firstNationsValues || 0),
    cpd: Number(journey.professional?.cpdHours || 0),
    paperwork: Number(journey.professional?.paperworkLoad || 0),
    scrutiny: Number(journey.scrutiny || 0),
    fomStatus: journey.blockPlanning?.fom?.status || 'draft',
    fomDays: Number(journey.blockPlanning?.fom?.reviewDaysRemaining || 0),
    fomComments: Number(journey.blockPlanning?.fom?.commentLoad || 0),
  };
}

function signed(value) {
  return `${value > 0 ? '+' : ''}${Math.round(value)}`;
}

export function buildPlanningActionReceipt(before, journey) {
  if (!before || !journey) return '';
  const after = capturePlanningActionState(journey);
  const parts = [];

  const percentFields = [
    ['Data', 'data'],
    ['Analysis', 'analysis'],
    ['Buy-in', 'buyIn'],
    ['DM readiness', 'confidence'],
    ['Energy', 'energy'],
    ['Stress', 'stress'],
    ['Biodiversity', 'biodiversity'],
    ['Timber', 'timber'],
    ['Community', 'community'],
    ['FN values', 'firstNations'],
    ['Scrutiny', 'scrutiny'],
  ];
  for (const [label, key] of percentFields) {
    const delta = after[key] - before[key];
    if (delta !== 0) parts.push(`${label} ${signed(delta)} → ${Math.round(after[key])}%`);
  }

  const budgetDelta = after.budget - before.budget;
  if (budgetDelta !== 0) {
    parts.push(`Budget ${budgetDelta > 0 ? '+' : '-'}$${Math.abs(Math.round(budgetDelta)).toLocaleString()} → $${Math.round(after.budget).toLocaleString()}`);
  }
  const politicalDelta = after.political - before.political;
  if (politicalDelta !== 0) parts.push(`District goodwill ${signed(politicalDelta)} → ${Math.round(after.political)}`);
  const cpdDelta = after.cpd - before.cpd;
  if (cpdDelta !== 0) parts.push(`CPD ${signed(cpdDelta)}h → ${Math.round(after.cpd)}h`);
  // The filing backlog is a flag, not a meter: say so only when it crosses
  // the line where an audit would find it, in either direction.
  if (before.paperwork < PAPERWORK_FLAG_THRESHOLD && after.paperwork >= PAPERWORK_FLAG_THRESHOLD) parts.push('Filing backlog: high — the next audit will find it');
  if (before.paperwork >= PAPERWORK_FLAG_THRESHOLD && after.paperwork < PAPERWORK_FLAG_THRESHOLD) parts.push('Filing backlog: back under control');
  if (after.phase !== before.phase) parts.push(`Phase ${getPlanningPhaseLabel(before.phase)} → ${getPlanningPhaseLabel(after.phase)}`);
  if (after.fomStatus !== before.fomStatus) parts.push(`FOM ${before.fomStatus.replaceAll('_', ' ')} → ${after.fomStatus.replaceAll('_', ' ')}`);
  if (after.fomDays !== before.fomDays) parts.push(`FOM clock ${Math.round(after.fomDays)} calendar days`);
  if (after.fomComments !== before.fomComments) parts.push(`FOM comments ${signed(after.fomComments - before.fomComments)} → ${Math.round(after.fomComments)}`);
  return parts.join(' · ');
}

function actionNeedsReceipt(actionValue) {
  return !['briefing', 'stakeholder_blocked', 'submit_blocked', 'fom_review_blocked'].includes(actionValue);
}

/**
 * Run a planning day with multi-action system
 * @param {Object} game - Game instance
 */
export async function runPlanningDay(game) {
  const { ui, journey } = game;
  const seasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;
  const progressBeforeDay = getOperationalProgress(journey);
  ensurePlanningProfessionalState(journey);

  // Morning at the office: the season outside the window, coffee inside.
  if (typeof ui.playScene === 'function') {
    await ui.playScene(buildOfficeWindowFrames({
      weatherId: journey.weather?.id,
      season: journey.season?.currentSeason,
      seed: journey.day,
    }), { delay: 140, holdLastFrame: false, ambient: 'work' });
  }

  startDay(journey);

  // Periodic real-data block decision: selected block influences events and values.
  await maybePromptForBlockSelection(game, seasonInfo);

  // Apply daily values consequences (Phase 4.1)
  applyValuesConsequences(journey);

  // Check for event at start of day. Day 1 stays event-free so the player meets
  // the normal planning loop before the game starts throwing disruptions.
  const event = journey.day > 1 ? checkForEvent(journey) : null;
  if (event) {
    const daysLeft = Number.isFinite(journey.deadline)
      ? Math.max(0, journey.deadline - journey.day)
      : null;
    const outcome = await runDaySituation(game, event, {
      frame: {
        dayHeader: Number.isFinite(journey.deadline)
          ? `DAY ${journey.day} of ${journey.deadline} - STRATEGIC PLANNING`
          : `DAY ${journey.day} - STRATEGIC PLANNING`,
        statusLine: formatStatusLine([
          getPlanningPhaseLabel(journey.plan.phase),
          daysLeft === null ? null : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
          `DM readiness ${Math.round(journey.plan.ministerialConfidence || 0)}%`,
          `budget $${Math.round((journey.resources.budget || 0) / 1000)}k`,
        ]),
        onRender: () => updatePlanningMissionStatus(ui, journey, seasonInfo),
      },
      setAsideDescription: 'Not today. Keep the day for the file.',
    });
    if (outcome.gameOver) return;
    // A situation worth a day is the day — the action menu below never opens.
    if (outcome.spendsDay) spendDay(journey);
  }

  // Check protagonist energy
  if (journey.protagonist && journey.protagonist.energy <= 0) {
    displayPlanningHeader(ui, journey, seasonInfo);
    ui.writeWarning('You are exhausted. Taking the day to recover.');
    journey.protagonist.energy = 30;
    journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 20);
    await advanceToNextDay(game);
    return;
  }

  // One file gets the day. Reviewing the file is free and leaves the day
  // unspent, so the loop comes back to the real decision; the tally closes a
  // day whose menu turns out to be nothing but look-ups and blocked gates.
  const freeChoices = { count: 0 };
  while (!dayIsSpent(journey)) {
    displayPlanningHeader(ui, journey, seasonInfo);

    // Check protagonist energy mid-day
    if (journey.protagonist && journey.protagonist.energy <= 0) {
      ui.writeWarning('You are exhausted. The rest of the day is lost to recovery.');
      journey.protagonist.energy = 15;
      break;
    }

    const actionOptions = buildActionOptions(journey, seasonInfo);
    const guidance = buildPlanningActionGuidance(journey, seasonInfo);
    const daysLeft = Number.isFinite(journey.deadline)
      ? Math.max(0, journey.deadline - journey.day)
      : null;

    let chosen = await presentDayCard(ui, {
      dayHeader: Number.isFinite(journey.deadline)
        ? `DAY ${journey.day} of ${journey.deadline} - STRATEGIC PLANNING`
        : `DAY ${journey.day} - STRATEGIC PLANNING`,
      statusLine: formatStatusLine([
        getPlanningPhaseLabel(journey.plan.phase),
        daysLeft === null ? null : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
        `DM readiness ${Math.round(journey.plan.ministerialConfidence || 0)}%`,
        `budget $${Math.round((journey.resources.budget || 0) / 1000)}k`,
      ]),
      label: 'AT THE DESK',
      title: 'THE FILE, AS IT STANDS',
      body: guidance.headline || 'The file is yours today. Pick the lane that moves it.',
      context: buildPlanningContextLines(journey, seasonInfo),
      prompt: dayPrompt(journey),
      options: actionOptions,
    });

    if (chosen === 'desk_menu') {
      const desk = await ui.promptChoice('Desk & self:', [
        ...buildPlanningDeskOptions(journey),
        { label: 'Back', description: 'Return to the day', value: 'desk_back' }
      ]);
      chosen = desk.value === 'desk_back' ? 'noop' : (desk.value || 'noop');
    }

    const action = actionOptions.find((option) => option.value === chosen)
      || { value: chosen, label: chosen };

    if (chosen === 'end') {
      break;
    }
    if (chosen === 'noop') {
      if (settleDayPass(journey, freeChoices, ui)) break;
      continue;
    }

    ui.write('');
    const actionBefore = capturePlanningActionState(journey);
    await processAction(game, action.value, seasonInfo);

    ui.updateAllStatus(journey);
    updatePlanningMissionStatus(ui, journey, seasonInfo);
    if (actionNeedsReceipt(action.value)) {
      const receipt = buildPlanningActionReceipt(actionBefore, journey);
      if (receipt) ui.write(`State change: ${receipt}`, 'term-dim');
      await ui.promptChoice('', [{
        label: 'Continue',
        presentation: 'continue',
        value: 'continue'
      }]);
    }

    if (settleDayPass(journey, freeChoices, ui)) {
      break;
    }

    if (journey.isComplete) {
      // 'submit' can win the District Manager's decision with hours still on
      // the clock. Once the plan is approved the expedition is over -- stop
      // offering more actions on a day that's already been won so the day
      // (and the end-of-run debrief) closes out immediately instead of
      // leaving the player to burn remaining hours on a finished file.
      break;
    }

  }

  // End of day
  await advanceToNextDay(game);

  // Check game over conditions
  checkGameOver(game);

  ui.updateAllStatus(journey);

  const milestoneMessages = [];
  recordProgressMilestones(journey, progressBeforeDay, milestoneMessages, Math.max(1, journey.day - 1));
  for (const message of milestoneMessages) {
    ui.writePositive(message);
  }

  // Contextual continue (Phase 6.1)
  const continueLabel = `Continue... (Phase: ${getPlanningPhaseLabel(journey.plan.phase)}, Day ${journey.day})`;
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
}

/**
 * Display compact planning header (Phase 6.2)
 */
export function updatePlanningMissionStatus(ui, journey, seasonInfo = null) {
  const guidance = buildPlanningActionGuidance(journey, seasonInfo);
  const plan = journey.plan;
  const facts = [];
  if (seasonInfo) facts.push({ label: 'Season', value: `${seasonInfo.name} · Y${seasonInfo.year}` });

  facts.push({ label: 'Phase', value: getPlanningPhaseLabel(plan.phase) });
  if (Number.isFinite(journey.deadline)) {
    const daysLeft = Math.max(0, journey.deadline - journey.day);
    facts.push({ label: 'Days left', value: `${daysLeft}`, tone: daysLeft <= 3 ? 'danger' : daysLeft <= 7 ? 'warn' : undefined });
  }
  if (guidance.lane) facts.push({ label: 'Lane', value: guidance.lane });

  const fom = syncFomStateFromActiveBlock(journey, seasonInfo);
  const gates = [
    { label: 'Data', target: 80, current: Math.round(plan.dataCompleteness || 0) },
    { label: 'Analysis', target: 80, current: Math.round(plan.analysisQuality || 0) },
    { label: 'Buy-in', target: 75, current: Math.round(plan.stakeholderBuyIn || 0) },
    { label: 'DM readiness', target: PLANNING_DECISION_GATE, current: Math.round(plan.ministerialConfidence || 0) }
  ];
  const checklist = gates.map((gate) => ({
    label: `${gate.label} ${gate.current}% of ${gate.target}%`,
    done: gate.current >= gate.target
  }));
  checklist.push({
    label: `FOM ${describeReviewState(fom).toLowerCase()}`,
    done: fom?.status === 'closed'
  });
  // The guidance headline is the one recommendation; the alerts only carry
  // the clocks and blockers the headline cannot hold.
  const alerts = [];
  if (fom?.status === 'public_review') {
    const days = Math.max(0, fom.reviewDaysRemaining || 0);
    const comments = Math.max(0, fom.commentLoad || 0);
    alerts.push({
      level: days <= FOM_CALENDAR_DAYS_PER_PLANNING_DAY ? 'danger' : 'warn',
      text: `FOM comment period: ${days} calendar days remaining | ${comments} open comment${comments === 1 ? '' : 's'} | ${FOM_CALENDAR_DAYS_PER_PLANNING_DAY} calendar days per planning day`
    });
  } else if (fom?.status === 'revision_required') {
    alerts.push({ level: 'warn', text: 'FOM comments need a response before the map can be republished.' });
  }
  if (fom?.roadBlocker) alerts.push({ level: 'warn', text: `Road-engineering blocker: ${fom.roadBlockerReasons.join(' | ')}` });

  const objectiveDeadline = Number.isFinite(journey.deadline) ? ` by Day ${journey.deadline}` : '';
  const status = {
    objective: `Get the FSP and first Forest Operations Map through the District Manager${objectiveDeadline}.`,
    meter: { label: 'DM readiness', value: plan.ministerialConfidence, text: `${Math.round(plan.ministerialConfidence)}%` },
    facts,
    checklist,
    guidance: guidance.headline || null,
    alerts
  };
  ui.setMissionStatus?.(status);
  return status;
}

function displayPlanningHeader(ui, journey, seasonInfo) {
  ui.clear();
  const deadlineLabel = Number.isFinite(journey.deadline)
    ? `DAY ${journey.day} of ${journey.deadline} - STRATEGIC PLANNING`
    : `DAY ${journey.day} - STRATEGIC PLANNING`;
  ui.writeHeader(deadlineLabel);

  // Keep the statutory clock in the narrative log as well as the structured
  // mission pane; the rest of the status is rendered by one shared updater so
  // action-result screens and day headers cannot drift apart.
  const fomAlert = syncFomStateFromActiveBlock(journey, seasonInfo);
  if (fomAlert?.status === 'public_review') {
    const reviewDaysRemaining = Math.max(0, fomAlert.reviewDaysRemaining || 0);
    const commentLoad = Math.max(0, fomAlert.commentLoad || 0);
    ui.write(`FOM comment period: ${reviewDaysRemaining} calendar days remaining | ${commentLoad} open comment${commentLoad === 1 ? '' : 's'} | ${FOM_CALENDAR_DAYS_PER_PLANNING_DAY} calendar days per planning day`);
  }
  updatePlanningMissionStatus(ui, journey, seasonInfo);
}

/**
 * The full file, on demand: guidance detail, values, situation, FOM, blocks
 */
function displayPlanningBriefing(ui, journey, seasonInfo) {
  const professional = ensurePlanningProfessionalState(journey);
  const guidance = buildPlanningActionGuidance(journey, seasonInfo);

  ui.write('');
  ui.writeHeader('PLANNING FILE REVIEW');

  ui.write(`Lane Focus: ${guidance.lane}`);
  if (guidance.steps.length > 0) {
    ui.write(`Follow-up: ${guidance.steps.join(' -> ')}`);
  }
  ui.write(`Values: Habitat ${journey.values.biodiversity}% | Timber ${journey.values.timberSupply}% | Community ${journey.values.communityNeeds}% | First Nations ${journey.values.firstNationsValues}%`);
  const moods = describeStakeholderMoods(journey);
  if (moods) ui.write(`Stakeholder mood: ${moods}`);
  if (Number.isFinite(journey.scrutiny)) {
    const scrutiny = Math.round(journey.scrutiny);
    const scrutinyLevel = scrutiny > 70 ? 'HIGH' : scrutiny > 40 ? 'MODERATE' : 'LOW';
    ui.write(`Scrutiny: ${scrutiny}% (${scrutinyLevel})`);
  }
  const areaSituation = getAreaSituationSummary(journey);
  if (areaSituation) {
    ui.write(`Area Situation: ${areaSituation}`);
  }
  ui.write(describePlanningProfessionalSnapshot(getPlanningProfessionalSnapshot(journey)));
  const discoveryNotes = getDiscoveryTagNotes(journey, journey.roleId || 'planner', 2);
  if (discoveryNotes.length > 0) {
    ui.write(`Carry-forward: ${discoveryNotes.join(' | ')}`);
  }

  const fom = syncFomStateFromActiveBlock(journey, seasonInfo);
  if (fom?.activeBlockId) {
    ui.write(`FOM: ${describeReviewState(fom)} | Water Gate: ${formatWaterGateLabel(fom.waterGate)} | ${fom.hydrologyLabel}`);
    ui.write(`Hydrology Readiness: ${Math.round(fom.hydrologyReadiness)}% | ${fom.waterNote}`);
    ui.write(`Review Burndown: ${Math.max(0, fom.commentLoad || 0)} open comment${(fom.commentLoad || 0) === 1 ? '' : 's'} | ${Math.max(0, fom.reviewDaysRemaining || 0)} calendar days remaining | Road Readiness ${Math.round(fom.roadEngineeringReadiness || 0)}%`);
    if (fom.roadSummary) {
      ui.write(`Road Intel: ${fom.roadSummary}`);
      ui.write(`Road Engineering Readiness: ${Math.round(fom.roadEngineeringReadiness)}% | ${fom.roadNote}`);
    }
  }
  if (professional?.chains?.fom) {
    const chain = professional.chains.fom;
    const currentStage = chain.steps[Math.min(chain.stepIndex, chain.steps.length - 1)] || 'submission';
    ui.write(`FOM paperwork chain: ${currentStage}${chain.complete ? ' (complete)' : ''}`);
  }
  const leadBlocks = formatPlanningLeadBlocks(journey);
  if (leadBlocks) {
    ui.write(`Active blocks: ${leadBlocks}`);
  }
  if (journey.blockPlanning?.activeSummary) {
    ui.write(`Lead block: ${journey.blockPlanning.activeSummary}`);
  }
  if (Number.isFinite(journey.resources?.dataCredits)) {
    ui.write(`Inventory budget: ${Math.max(0, Math.round(journey.resources.dataCredits / 10))} LiDAR/VRI pulls remaining`);
  }
}

const STAKEHOLDER_MOOD_LABELS = {
  ministry: 'district',
  nations: 'the Nation',
  community: 'community',
  licensees: 'the mill',
};

/**
 * Stakeholder moods are moved by events (a town hall, a partnership offer)
 * and read by the Stakeholder Session, which lands harder or softer with
 * the room. One line so the player can see the room.
 */
export function describeStakeholderMoods(journey) {
  const stakeholders = journey?.stakeholders;
  if (!stakeholders || typeof stakeholders !== 'object') return '';
  return Object.entries(stakeholders)
    .filter(([, value]) => Number.isFinite(value?.mood))
    .map(([key, value]) => `${STAKEHOLDER_MOOD_LABELS[key] || key} ${Math.round(value.mood)}`)
    .join(' | ');
}

/** Average stakeholder mood, or null when the journey carries none. */
export function getStakeholderMoodAverage(journey) {
  const moods = Object.values(journey?.stakeholders || {})
    .map((value) => value?.mood)
    .filter((mood) => Number.isFinite(mood));
  if (!moods.length) return null;
  return moods.reduce((sum, mood) => sum + mood, 0) / moods.length;
}

/**
 * Whether the cutblock priority decision is due. It runs once, when the
 * analysis opens and there is data to triage against; after that only an
 * authored event (effects.blockSelection) reopens it.
 */
export function isBlockSelectionDue(journey) {
  const plannerState = journey?.blockPlanning;
  if (!plannerState) return false;
  if (plannerState.pendingSelection) return true;
  if (plannerState.activeBlock) return false;
  return journey.plan?.phase !== 'data_gathering';
}

async function maybePromptForBlockSelection(game, seasonInfo) {
  const { ui, journey } = game;
  const plannerState = journey.blockPlanning;
  if (!isBlockSelectionDue(journey)) return;
  const reopened = Boolean(plannerState.pendingSelection && plannerState.activeBlock);
  plannerState.pendingSelection = false;

  displayPlanningHeader(ui, journey, seasonInfo);
  ui.writeHeader('CUTBLOCK PRIORITY DECISION');
  ui.write(reopened
    ? 'The file has reopened the block question. Re-triage the area constraints and pick the lead block set again.'
    : `The inventory is in. Choose how to triage the area constraints, then lock the lead block set (${LEAD_BLOCK_SET_SIZE} blocks) the first Forest Operations Map will carry.`);
  ui.write('');

  const allBlocks = getPlanningAreaBlockPool(journey.areaId);
  const triage = buildPlanningConstraintTriage(journey.areaId, journey.area, allBlocks);
  // triage.summary already leads with the area's zoneSummary paragraph
  // (buildPlanningConstraintTriage prefixes it before the driver ranking), so
  // printing triage.area.zoneSummary here as well used to render the same
  // paragraph twice in this card.
  ui.write(triage.summary);
  ui.write('');

  const triageChoice = await ui.promptChoice('Constraint triage:', triage.options);
  const triageDelta = getPlanningTriageScrutinyDelta(triageChoice.value);
  if (triageDelta !== 0) {
    journey.scrutiny = clampValue((journey.scrutiny || 0) + triageDelta);
    const direction = triageDelta > 0 ? 'rises' : 'eases';
    ui.write(`Scrutiny ${direction} to ${Math.round(journey.scrutiny)}% as you choose ${getPlanningTriageLabel(triageChoice.value)}.`);
  }
  ui.write('');

  const options = pickPlanningBlockOptions(journey.areaId, plannerState.history, 3, triageChoice.value, journey.area, seasonInfo);
  if (!options.length) return;

  const promptOptions = options.map((block) => {
    const roadContext = getPlanningRoadAssetContext(journey, block);
    const roadMatch = roadContext.source === 'joined'
      ? ` | Matched recce: ${roadContext.joinedFromBlockName} (${roadContext.summary})`
      : roadContext.source === 'block'
        ? ` | Recce: ${roadContext.summary}`
        : '';
    return {
      label: formatPlanningBlockLabel(block),
      description: `${formatPlanningBlockTriageEvidence(block, triageChoice.value, options, journey.area, seasonInfo)} | ${formatPlanningBlockPromptDescription(block, journey.area, seasonInfo)}${roadMatch}`,
      value: block.id
    };
  });

  const selected = await ui.promptChoice('Select the lead block:', promptOptions);
  const chosen = options.find((block) => block.id === selected.value) || options[0];
  const others = options.filter((block) => block.id !== chosen.id).slice(0, LEAD_BLOCK_SET_SIZE - 1);
  applySelectedBlockImpact(journey, chosen, triageChoice.value, seasonInfo, others);
  ui.write(`Lead block set for the first FOM: ${formatPlanningLeadBlocks(journey)}.`);
  const water = getPlanningLeadWaterContext(journey, seasonInfo);
  if (water.block) {
    ui.write(`Water gate for the set: ${water.gateLabel} — ${water.note}`);
  }
}

/**
 * Lock the lead block set. The chosen block leads (its value effects land on
 * the file); the rest of the set rides along and the FOM's water and road
 * context is the worst of the set.
 */
export function applySelectedBlockImpact(journey, block, triageKey = null, seasonInfo = null, others = []) {
  if (!journey.blockPlanning || !block) return;

  const state = journey.blockPlanning;
  state.activeBlockId = block.id;
  state.activeBlock = block;
  state.leadBlocks = [block, ...others.filter((candidate) => candidate && candidate.id !== block.id)].slice(0, LEAD_BLOCK_SET_SIZE);
  state.leadBlockIds = state.leadBlocks.map((candidate) => candidate.id);
  state.activeTriage = triageKey;
  state.activeTriageLabel = getPlanningTriageLabel(triageKey);
  const roadContext = getPlanningRoadAssetContext(journey, block);
  const roadMatch = roadContext.source === 'joined' && roadContext.joinedFromBlockName
    ? ` | Matched recce ${roadContext.joinedFromBlockName}`
    : '';
  state.activeSummary = `${summarizePlanningBlock(block, journey.area, triageKey, seasonInfo)}${roadMatch}`;
  state.activeEventBias = block.eventBias || null;
  state.history = Array.isArray(state.history) ? [...state.history, ...state.leadBlockIds].slice(-30) : [...state.leadBlockIds];
  state.selectionCount = (state.selectionCount || 0) + 1;
  state.nextSelectionDay = null;
  state.pendingSelection = false;
  syncFomStateFromActiveBlock(journey, seasonInfo);

  const effects = block.valueEffects || {};
  journey.values.biodiversity = clampValue(journey.values.biodiversity + (effects.biodiversity || 0));
  journey.values.timberSupply = clampValue(journey.values.timberSupply + (effects.timberSupply || 0));
  journey.values.communityNeeds = clampValue(journey.values.communityNeeds + (effects.communityNeeds || 0));
  journey.values.firstNationsValues = clampValue(journey.values.firstNationsValues + (effects.firstNationsValues || 0));
}

function clampValue(value) {
  return Math.max(0, Math.min(100, value));
}

/**
 * Apply daily consequences from values imbalance (Phase 4.1)
 */
function applyValuesConsequences(journey) {
  // Low values create daily penalties
  if (journey.values.biodiversity < 30) {
    journey.plan.stakeholderBuyIn = Math.max(0, journey.plan.stakeholderBuyIn - 2);
  }
  if (journey.values.timberSupply < 30) {
    // The mill's planning lead stops returning calls.
    journey.plan.stakeholderBuyIn = Math.max(0, journey.plan.stakeholderBuyIn - 1);
  }
  if (journey.values.firstNationsValues < 30 && (journey.plan.phase === 'stakeholder_review' || journey.plan.phase === 'ministerial_approval')) {
    // A Nation that is not engaged stalls both the engagement and the decision.
    journey.plan.stakeholderBuyIn = Math.max(0, journey.plan.stakeholderBuyIn - 3);
  }
  if (journey.values.communityNeeds < 30 && journey.protagonist) {
    journey.protagonist.stress = Math.min(100, journey.protagonist.stress + 3);
  }
}

/**
 * Build action options based on current phase and resources
 */
function buildActionOptions(journey, seasonInfo = null) {
  const actionOptions = [];
  const fom = syncFomStateFromActiveBlock(journey, seasonInfo);
  const roadContext = getPlanningRoadAssetContext(journey, journey.blockPlanning?.activeBlock || null);
  const approvalGaps = getPlanningApprovalGaps(journey);

  // Phase-specific primary actions
  if (journey.plan.phase === 'data_gathering' && journey.resources.dataCredits > 0) {
    actionOptions.push({
      label: 'Gather Data',
      description: "Lane: technical file | Pull VRI, LiDAR, and the district's resource-value layers",
      value: 'gather_data'
    });
  }

  if (journey.plan.phase === 'analysis') {
    actionOptions.push({
      label: 'Run Analysis',
      description: 'Lane: technical file | Spatial analysis, results and strategies, the draft FSP',
      value: 'analyze'
    });
  }

  if (journey.plan.phase === 'stakeholder_review') {
    // Check values gate (Phase 4.1)
    const deficits = getValuesGateDeficits(journey);
    const valuesOk = deficits.length === 0;
    if (valuesOk) {
      actionOptions.push({
        label: 'Stakeholder Session',
        description: 'Engagement record: hear concerns, record responses and agree follow-up actions',
        value: 'stakeholder'
      });
    } else {
      const valueHint = getPlanningValueRecoveryHint(journey, deficits);
      actionOptions.push({
        label: 'Stakeholder Session (BLOCKED)',
        description: `Needs: ${formatValuesGateDeficits(deficits)} | Next: ${valueHint?.actionLabel || 'Values Workshop'}`,
        value: 'stakeholder_blocked'
      });
    }
  }

  if (journey.plan.phase === 'ministerial_approval' && approvalGaps.some((gap) => gap.key === 'data')) {
    actionOptions.push({
      label: 'Gather Data',
      description: 'Lane: technical recovery | Rebuild baseline completeness before final approval work',
      value: 'gather_data'
    });
  }

  if (journey.plan.phase === 'ministerial_approval' && approvalGaps.some((gap) => gap.key === 'analysis')) {
    actionOptions.push({
      label: 'Run Analysis',
      description: 'Lane: technical recovery | Reopen the model package and restore submission readiness',
      value: 'analyze'
    });
  }

  if (journey.plan.phase === 'ministerial_approval' && approvalGaps.some((gap) => gap.key === 'stakeholder')) {
    const deficits = getValuesGateDeficits(journey);
    const valuesOk = deficits.length === 0;
    if (valuesOk) {
      actionOptions.push({
        label: 'Stakeholder Session',
        description: 'Lane: engagement recovery | Rebuild buy-in before the final package',
        value: 'stakeholder'
      });
    } else {
      const valueHint = getPlanningValueRecoveryHint(journey, deficits);
      actionOptions.push({
        label: 'Stakeholder Session (BLOCKED)',
        description: `Needs: ${formatValuesGateDeficits(deficits)} | Next: ${valueHint?.actionLabel || 'Values Workshop'}`,
        value: 'stakeholder_blocked'
      });
    }
  }

  if (journey.plan.phase === 'ministerial_approval') {
    const deficits = getValuesGateDeficits(journey);
    const valuesOk = deficits.length === 0;
    const submissionReadiness = getPlanningSubmissionReadiness(journey, seasonInfo);
    const professionalIssues = getPlanningProfessionalIssues(journey);
    if (valuesOk && submissionReadiness.ready && professionalIssues.length === 0 && approvalGaps.length === 0) {
      actionOptions.push({
        label: 'Prepare Submission',
        description: `Lane: submission package | Put the FSP and FOM on the District Manager's desk; +${getSubmissionConfidenceGain(submissionReadiness)} DM readiness`,
        value: 'submit'
      });
    } else {
      const guidance = buildPlanningActionGuidance(journey, seasonInfo);
      actionOptions.push({
        label: 'Prepare Submission (BLOCKED)',
        description: `Needs: ${[deficits.length ? formatValuesGateDeficits(deficits) : null, ...approvalGaps.map((gap) => gap.reason), ...submissionReadiness.reasons, ...professionalIssues].filter(Boolean).join(' | ')} | Next: ${guidance.headline}`,
        value: 'submit_blocked'
      });
    }
  }

  if (true) {
    const professional = getPlanningProfessionalSnapshot(journey);
    const label = professional?.registrationActive ? 'Compliance Admin' : 'Renew Registration';
    const pieces = [];
    if (professional?.registrationStatus !== 'active') {
      pieces.push(`registration ${professional.registrationStatus} (your licence to sign off is not current)`);
    }
    if (professional?.cpdGap > 0) {
      pieces.push(`CPD ${professional.cpdHours}/${professional.cpdTarget}h logged this season`);
    }
    if ((professional?.paperworkLoad || 0) >= PAPERWORK_FLAG_THRESHOLD) {
      pieces.push(`filing backlog high (the next audit will find it)`);
    }
    actionOptions.push({
      label,
      description: pieces.length
        ? `Lane: professional file | Clears: ${pieces.join(' | ')}`
        : 'Lane: professional file | Renew registration, log CPD, and clear the filing backlog',
      value: 'professional_admin'
    });
  }

  if (journey.plan.phase === 'ministerial_approval') {
    const readiness = getPlanningSubmissionReadiness(journey, seasonInfo);
    const cap = getOutreachReadinessCap(readiness);
    if (journey.plan.ministerialConfidence < cap) {
      actionOptions.push({
        label: 'District Pre-Submission Meeting',
        description: `Lane: district file | Walk the District Manager and stewardship staff through the draft; recover readiness up to ${cap}%`,
        value: 'outreach'
      });
    }
  }

  if (journey.blockPlanning?.activeBlock) {
    const publicationGaps = fom?.status === 'draft' ? getFomPublicationGaps(journey) : [];
    if (publicationGaps.length > 0) {
      actionOptions.push({
        label: 'Open FOM Review (BLOCKED)',
        description: `Needs: ${publicationGaps.join(' | ')}. Build a baseline file before publishing a map for public comment.`,
        value: 'fom_review_blocked'
      });
    } else {
      actionOptions.push({
        label: getFomActionLabel(fom, roadContext),
        description: getFomActionDescription(fom, roadContext),
        value: 'fom_review'
      });
    }
  }

  // Values workshop - now with tradeoffs (Phase 4.1)
  {
    actionOptions.push({
      label: 'Values Workshop',
      description: 'Lane: values file | Balance competing interests with explicit tradeoffs',
      value: 'values'
    });
  }

  // Timber supply analysis
  {
    actionOptions.push({
      label: 'Timber Supply Analysis',
      description: 'Lane: timber file | Timber supply analysis (+timber; costs a day of analysis time)',
      value: 'timber'
    });
  }

  // The supporting lanes go behind one door, the way recon's camp upkeep does.
  // Ten options on a phone leaves the log pane about seven rows
  // (docs/day_as_situation.md section 4); the gate-advancing work above is the
  // decision, and this is everything else.
  actionOptions.push({
    label: 'Desk & self',
    description: 'Inbox, networking, a break — the work that is not the gate',
    value: 'desk_menu'
  });

  actionOptions.push({
    label: 'Hold the Line',
    description: 'Keep the file ticking over and give the day back to the office',
    value: 'end'
  });

  return actionOptions;
}

/**
 * The supporting lane, one level down. "Review the File" is not here: it is
 * reference material and lives in the day card's free "More context".
 */
function buildPlanningDeskOptions(journey) {
  const options = [
    {
      label: 'Clear the Inbox',
      description: 'Handle correspondence and clear inbox drag',
      value: 'email'
    },
    {
      label: 'Network',
      description: 'Build district goodwill for the next gate',
      value: 'network'
    }
  ];
  if (journey.protagonist) {
    options.push({
      label: 'Take a Break',
      description: 'Reduce stress and recover energy',
      value: 'rest'
    });
  }
  return options;
}

/**
 * Reference material for the planning day card, free behind "More context".
 * This is what "Review the File" used to cost a slot on the menu to show.
 */
function buildPlanningContextLines(journey, seasonInfo) {
  const plan = journey.plan || {};
  const lines = [
    `Data ${Math.round(plan.dataCompleteness || 0)}% of 80%`,
    `Analysis ${Math.round(plan.analysisQuality || 0)}% of 80%`,
    `Buy-in ${Math.round(plan.stakeholderBuyIn || 0)}% of 75%`,
    `DM readiness ${Math.round(plan.ministerialConfidence || 0)}% of ${PLANNING_DECISION_GATE}%`,
  ];
  const fom = journey.blockPlanning?.fom;
  if (fom?.status) lines.push(`FOM: ${describeReviewState(fom)}`);
  const leadBlocks = formatPlanningLeadBlocks(journey);
  if (leadBlocks) lines.push(`Active blocks: ${leadBlocks}`);
  if (seasonInfo) lines.push(`Season: ${seasonInfo.name} - Year ${seasonInfo.year}`);
  const scrutiny = Number(journey.scrutiny ?? journey.heat ?? 0);
  if (Number.isFinite(scrutiny)) lines.push(`Scrutiny: ${Math.round(Math.max(0, scrutiny))}%`);
  lines.push(`District goodwill: ${Math.round(journey.resources.politicalCapital || 0)}`);
  const moods = describeStakeholderMoods(journey);
  if (moods) lines.push(`Stakeholder mood: ${moods}`);
  if ((journey.professional?.paperworkLoad || 0) >= PAPERWORK_FLAG_THRESHOLD) {
    lines.push('Filing backlog: high — the next audit will find it.');
  }
  const notes = getDiscoveryTagNotes(journey, journey.roleId || 'planner', 2);
  if (notes.length > 0) lines.push(`Carry-forward: ${notes.join(' | ')}`);
  return lines.filter(Boolean);
}

/**
 * Process a selected action
 */
export async function processAction(game, actionValue, seasonInfo = null) {
  const { ui, journey } = game;
  const discoveryTags = getJourneyDiscoveryTags(journey);
  const discoveryIds = new Set(discoveryTags.map((tag) => tag.id));

  switch (actionValue) {
    case 'briefing': {
      displayPlanningBriefing(ui, journey, seasonInfo);
      await ui.promptChoice('', [{ label: 'Close the file', value: 'next' }]);
      return;
    }

    case 'gather_data': {
      const recoveryRun = journey.plan.phase === 'ministerial_approval';
      journey.plan.dataCompleteness = Math.min(100, journey.plan.dataCompleteness + DAY_OF_DATA);
      if (discoveryTags.length > 0) {
        const bonus = Math.min(3, discoveryTags.length);
        journey.plan.dataCompleteness = Math.min(100, journey.plan.dataCompleteness + bonus);
        ui.write(`Carry-forward field intel sharpened the data package (+${bonus}).`);
      }
      journey.resources.dataCredits -= 10;
      journey.resources.budget = Math.max(0, journey.resources.budget - 900);
      spendDay(journey);
      applyProtagonistCost(journey, { energy: 10, stress: 6 });
      applyPlanningProfessionalWork(journey, { paperworkLoad: recoveryRun ? 1 : 2, competenceRisk: -1, auditExposure: 1 });
      ui.write(`Inventory pull filed. Data completeness: ${journey.plan.dataCompleteness}%`);
      if (!recoveryRun && journey.plan.dataCompleteness >= 80) {
        journey.plan.phase = 'analysis';
        ui.writePositive('Inventory complete. The analysis opens tomorrow with the cutblock priority decision.');
      } else if (recoveryRun && journey.plan.dataCompleteness >= 80) {
        ui.writePositive('Technical recovery complete. The data file is back above the approval threshold.');
      }
      break;
    }

    case 'analyze': {
      const recoveryRun = journey.plan.phase === 'ministerial_approval';
      journey.plan.analysisQuality = Math.min(100, journey.plan.analysisQuality + DAY_OF_ANALYSIS);
      if (discoveryTags.length > 0) {
        const bonus = Math.min(4, discoveryTags.length * 2);
        journey.plan.analysisQuality = Math.min(100, journey.plan.analysisQuality + bonus);
        ui.write(`Existing ground intel tightened the analysis (+${bonus}).`);
      }
      journey.resources.budget = Math.max(0, journey.resources.budget - 700);
      spendDay(journey);
      applyProtagonistCost(journey, { energy: 15, stress: 12 });
      applyPlanningProfessionalWork(journey, { paperworkLoad: recoveryRun ? 1 : 2, competenceRisk: -1, auditExposure: 1 });
      ui.write(`Analysis progressed. Draft plan quality: ${journey.plan.analysisQuality}%`);
      if (!recoveryRun && journey.plan.analysisQuality >= 80) {
        journey.plan.phase = 'stakeholder_review';
        ui.writePositive('Draft plan complete. Moving to Engagement & Public Review.');
      } else if (recoveryRun && journey.plan.analysisQuality >= 80) {
        ui.writePositive('Analysis recovery complete. The model package is back above the approval threshold.');
      }
      break;
    }

    case 'stakeholder': {
      const recoveryRun = journey.plan.phase === 'ministerial_approval';
      journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + DAY_OF_CONSULTATION);
      if (discoveryIds.has('community_visibility') || discoveryIds.has('cultural_hold') || discoveryIds.has('watershed_watch')) {
        journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 2);
        ui.write('Concrete field findings gave the session more weight (+2 buy-in).');
      }
      const mood = getStakeholderMoodAverage(journey);
      if (mood !== null && mood >= 60) {
        journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 2);
        ui.write('The room was already warm; the session landed well (+2 buy-in).');
      } else if (mood !== null && mood <= 40) {
        journey.plan.stakeholderBuyIn = Math.max(0, journey.plan.stakeholderBuyIn - 2);
        ui.write('The room came in sour; the session spent its first hour on old grievances (-2 buy-in).');
      }
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 3);
      journey.resources.budget = Math.max(0, journey.resources.budget - 700);
      spendDay(journey);
      applyProtagonistCost(journey, { energy: 20, stress: 16 });
      applyPlanningProfessionalWork(journey, { paperworkLoad: recoveryRun ? 2 : 3, competenceRisk: -1, auditExposure: 2 });
      if (journey.protagonist) {
        journey.protagonist.reputation = Math.min(100, journey.protagonist.reputation + 3);
      }
      journey.plan.ministerialConfidence = Math.min(100, (journey.plan.ministerialConfidence || 0) + SESSION_READINESS_LIFT);
      ui.write(`Buy-in improved to ${journey.plan.stakeholderBuyIn}%. The district reads the engagement record too (DM readiness +${SESSION_READINESS_LIFT}).`);
      if (!recoveryRun && journey.plan.stakeholderBuyIn >= 75) {
        journey.plan.phase = 'ministerial_approval';
        ui.writePositive('Engagement record complete. The file goes to the District Manager next.');
      } else if (recoveryRun && journey.plan.stakeholderBuyIn >= 75) {
        ui.writePositive('Consultation recovery complete. Buy-in is back above the approval threshold.');
      }
      break;
    }

    case 'stakeholder_blocked':
    case 'submit_blocked':
    case 'fom_review_blocked': {
      const submissionReadiness = getPlanningSubmissionReadiness(journey, seasonInfo);
      const valueDeficits = getValuesGateDeficits(journey);
      const guidance = buildPlanningActionGuidance(journey, seasonInfo);
      const isFomBlocked = actionValue === 'fom_review_blocked';
      ui.writeHeader(actionValue === 'submit_blocked'
        ? 'SUBMISSION BLOCKED'
        : isFomBlocked ? 'FOM PUBLICATION BLOCKED' : 'STAKEHOLDER SESSION BLOCKED');
      if (isFomBlocked) {
        ui.writeWarning(`Cannot publish yet. Complete: ${getFomPublicationGaps(journey).join(' | ')}.`);
        ui.write('A map published for public comment needs a defensible baseline data package and preliminary analysis before the 30-calendar-day comment period starts.');
      } else if (valueDeficits.length > 0) {
        ui.writeWarning(`Cannot proceed. Recover these values first: ${formatValuesGateDeficits(valueDeficits)}.`);
      } else {
        ui.writeWarning('Cannot proceed yet.');
      }
      if (!isFomBlocked && submissionReadiness.reasons.length > 0) {
        ui.write(`Planning gate: ${submissionReadiness.reasons.join(' | ')}.`);
      }
      ui.write(`Lane Focus: ${guidance.lane}`);
      ui.write(`Next Best Move: ${guidance.headline}`);
      if (guidance.steps.length > 0) {
        ui.write(`Follow-up: ${guidance.steps.join(' -> ')}`);
      }
      // The day loop clears the screen the instant this function returns, so
      // without a blocking prompt the explanation above is wiped before the
      // browser ever paints it — the player sees nothing and can click the
      // disabled option forever. Pausing on an explicit acknowledgement (same
      // "show detail, then let the player close it" idiom as Review the File)
      // guarantees the reasons are actually seen. Still costs 0 hours.
      await ui.promptChoice('', [{ label: 'Back to the day', value: 'next' }]);
      break;
    }

    case 'submit':
      {
        const submissionReadiness = getPlanningSubmissionReadiness(journey, seasonInfo);
        const approvalGaps = getPlanningApprovalGaps(journey);
        if (!submissionReadiness.ready || approvalGaps.length > 0) {
          ui.writeWarning(`Submission blocked: ${[...approvalGaps.map((gap) => gap.reason), ...submissionReadiness.reasons].join(' | ')}.`);
          break;
        }
        const confidenceGain = getSubmissionConfidenceGain(submissionReadiness);
        journey.plan.ministerialConfidence = Math.min(100, journey.plan.ministerialConfidence + confidenceGain);
      }
      spendDay(journey);
      journey.resources.budget = Math.max(0, journey.resources.budget - 2200);
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 2);
      applyProtagonistCost(journey, { energy: 25, stress: 20 });
      applyPlanningProfessionalWork(journey, { paperworkLoad: 3, competenceRisk: -2, auditExposure: 2 });
      progressPlanningPaperworkChain(journey, 'fom', 1);
      ui.write(`Submission filed with the district. DM readiness: ${journey.plan.ministerialConfidence}%`);
      if (isPlanningApprovalReady(journey)) {
        journey.isComplete = true;
        journey.endReason = 'FSP and Forest Operations Map approved by the District Manager.';
      } else {
        const gap = Math.max(0, PLANNING_DECISION_GATE - journey.plan.ministerialConfidence);
        ui.write(`Still ${gap} point${gap === 1 ? '' : 's'} short — the District Manager wants another pre-submission meeting before deciding.`);
      }
      break;

    case 'fom_review': {
      const activeBlock = journey.blockPlanning?.activeBlock;
      if (!activeBlock) {
        ui.writeWarning('Select a block before opening the Forest Operations Map review.');
        break;
      }

      const fom = syncFomStateFromActiveBlock(journey, seasonInfo);
      const roadContext = getPlanningRoadAssetContext(journey, activeBlock);
      const previousStatus = fom.status;
      const publicationGaps = previousStatus === 'draft' ? getFomPublicationGaps(journey) : [];
      if (publicationGaps.length > 0) {
        ui.writeWarning(`Forest Operations Map publication blocked: ${publicationGaps.join(' | ')}.`);
        break;
      }
      if (fom.status === 'closed') {
        spendDay(journey);
        applyProtagonistCost(journey, { energy: 3, stress: 2 });
        ui.write('Forest Operations Map record checked. The comment record and responses stay on file.');
        if (roadContext.hasData) {
          ui.write(roadContext.note);
        }
        break;
      }

      const waterContext = getPlanningLeadWaterContext(journey, seasonInfo);
      spendDay(journey);
      applyProtagonistCost(journey, { energy: 6, stress: 5 });
      const chainProgress = progressPlanningPaperworkChain(journey, 'fom', 1);
      fom.lastUpdatedDay = journey.day;
      fom.hydrologyLabel = waterContext.hydrologyLabel;

      if (previousStatus === 'draft') {
        fom.status = 'public_review';
        fom.reviewDaysRemaining = FOM_PUBLIC_REVIEW_MIN_DAYS;
        fom.commentLoad = Math.max(fom.commentLoad || 0, waterContext.commentCount);
        fom.publicReviewOpenedDay = journey.day;
        fom.hydrologyReadiness = Math.max(fom.hydrologyReadiness || 0, waterContext.readiness);
        fom.waterGate = getEffectiveWaterGate(fom, waterContext);
        fom.waterNote = describeEffectiveWaterNote(fom, waterContext);
        applyPlanningProfessionalWork(journey, { paperworkLoad: 2, auditExposure: 1 });

        ui.write(`Forest Operations Map published for public comment: ${formatPlanningLeadBlocks(journey)}.`);
        if (fom.waterGate === 'hold') {
          ui.write('The water gate is a HOLD: the works in and about a stream review runs alongside the comment period, one FOM day at a time.');
        }
      } else if (previousStatus === 'public_review') {
        const commentBurn = roadContext.hasData || waterContext.commentCount > 0 ? 2 : 1;
        fom.commentLoad = Math.max(0, (fom.commentLoad || 0) - commentBurn);
        const gateBefore = getEffectiveWaterGate(fom, waterContext);
        progressWaterGateReview(fom, waterContext, 8);
        fom.waterGate = getEffectiveWaterGate(fom, waterContext);
        fom.waterNote = describeEffectiveWaterNote(fom, waterContext);
        applyPlanningProfessionalWork(journey, { paperworkLoad: -3, competenceRisk: -1, auditExposure: -2 });

        ui.write(`FOM comment record updated. Responded to ${commentBurn} comment${commentBurn === 1 ? '' : 's'}; the comment period advances only when the planning day ends.`);
        if (waterContext.gate === 'hold') {
          ui.write(gateBefore === 'hold' && fom.waterGate !== 'hold'
            ? 'Works in and about a stream review complete: the HOLD is now a WINDOW and the WSA s.11 notification is filed.'
            : `Works in and about a stream review progressed: hydrology readiness ${Math.round(fom.hydrologyReadiness)}% of ${WSA_REVIEW_READINESS}%.`);
        }
        updatePlanningFomStatus(ui, fom, waterContext, roadContext, 'review work');
      } else {
        const revisionBurn = roadContext.hasData ? 3 : 2;
        fom.status = 'public_review';
        fom.reviewDaysRemaining = FOM_PUBLIC_REVIEW_MIN_DAYS;
        fom.commentLoad = Math.max(0, Math.max(fom.commentLoad || 0, waterContext.commentCount) - revisionBurn);
        const gateBefore = getEffectiveWaterGate(fom, waterContext);
        progressWaterGateReview(fom, waterContext, 14);
        fom.waterGate = getEffectiveWaterGate(fom, waterContext);
        fom.waterNote = describeEffectiveWaterNote(fom, waterContext);
        applyPlanningProfessionalWork(journey, { paperworkLoad: -4, competenceRisk: -2, auditExposure: -2 });

        ui.write(`FOM responses filed and the map republished for comment with ${Math.max(0, fom.commentLoad)} comment${(fom.commentLoad || 0) === 1 ? '' : 's'} left.`);
        if (waterContext.gate === 'hold') {
          ui.write(gateBefore === 'hold' && fom.waterGate !== 'hold'
            ? 'Works in and about a stream review complete: the HOLD is now a WINDOW and the WSA s.11 notification is filed.'
            : `Works in and about a stream review progressed: hydrology readiness ${Math.round(fom.hydrologyReadiness)}% of ${WSA_REVIEW_READINESS}%.`);
        }
      }

      if (chainProgress?.stage) {
        ui.write(`FOM record: ${chainProgress.stage} stage filed.`);
      }
      ui.write(`Comment period: ${Math.max(0, fom.reviewDaysRemaining)} calendar days (${FOM_CALENDAR_DAYS_PER_PLANNING_DAY} per planning day) | ${fom.waterNote}`);
      if (roadContext.hasData) {
        ui.write(roadContext.note);
        if (roadContext.blocker) {
          ui.writeWarning(`Road-engineering blocker: ${roadContext.blockerReasons.join(' | ')}`);
        }
      }
      break;
    }

    case 'outreach': {
      const previousConfidence = journey.plan.ministerialConfidence;
      // A pre-submission meeting tops out short of the decision gate: only
      // Prepare Submission, which checks the FOM comment period, the water
      // gate, the road file and registration, carries the file across.
      const readiness = getPlanningSubmissionReadiness(journey, seasonInfo);
      const cap = getOutreachReadinessCap(readiness);
      journey.plan.ministerialConfidence = Math.max(previousConfidence, Math.min(cap, journey.plan.ministerialConfidence + DAY_OF_DISTRICT_MEETING));
      journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 2);
      journey.resources.budget = Math.max(0, journey.resources.budget - 600);
      journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 1);
      spendDay(journey);
      applyProtagonistCost(journey, { energy: 8, stress: 7 });
      applyPlanningProfessionalWork(journey, { paperworkLoad: 1, competenceRisk: -1, auditExposure: 1 });

      const gained = journey.plan.ministerialConfidence - previousConfidence;
      ui.write(`The District Manager and stewardship staff walked the draft with you. DM readiness +${gained} → ${journey.plan.ministerialConfidence}%.`);
      if (journey.plan.ministerialConfidence >= cap) {
        ui.write(`That is as far as a meeting takes it. Prepare Submission carries the last ${getSubmissionConfidenceGain(readiness)} points${readiness.ready ? '' : ` once the gate is clear: ${readiness.reasons.join(' | ')}`}.`);
      }
      break;
    }

    case 'professional_admin': {
      const professional = ensurePlanningProfessionalState(journey);
      const didRenewal = professional?.registrationStatus !== 'active';
      const chainProgress = progressPlanningPaperworkChain(journey, 'registration', 1);
      applyPlanningProfessionalWork(journey, {
        registrationStatus: 'active',
        cpdHours: didRenewal ? 8 : 6,
        competenceRisk: -6,
        paperworkLoad: -10,
        auditExposure: -6,
      });
      spendDay(journey);
      applyProtagonistCost(journey, { energy: 5, stress: 4 });
      if (didRenewal) {
        ui.write('FPBC registration renewal filed and active status is restored. CPD logged for the season.');
      } else {
        ui.write('Compliance admin logged the season\'s CPD and trimmed the filing backlog.');
      }
      if (chainProgress?.stage) {
        ui.write(`Registration chain advanced to: ${chainProgress.stage}.`);
      }
      break;
    }

    case 'values': {
      // Values workshop with tradeoffs (Phase 4.1). Every emphasis takes the
      // same day; Balanced Approach is the one that costs you personally,
      // because holding four interests level in one session is a long day.
      const choices = buildValuesWorkshopChoices();
      const pick = await ui.promptChoice('Choose values focus:', choices);

      switch (pick.value) {
        case 'bio':
          journey.values.biodiversity = Math.min(100, journey.values.biodiversity + 8);
          journey.values.timberSupply = Math.max(0, journey.values.timberSupply - 3);
          break;
        case 'timber_v':
          journey.values.timberSupply = Math.min(100, journey.values.timberSupply + 8);
          journey.values.biodiversity = Math.max(0, journey.values.biodiversity - 3);
          break;
        case 'community':
          // Viewscape and access commitments cost volume, not the Nation.
          journey.values.communityNeeds = Math.min(100, journey.values.communityNeeds + 8);
          journey.values.timberSupply = Math.max(0, journey.values.timberSupply - 2);
          break;
        case 'fn':
          // Heritage and referral commitments cost volume too.
          journey.values.firstNationsValues = Math.min(100, journey.values.firstNationsValues + 8);
          journey.values.timberSupply = Math.max(0, journey.values.timberSupply - 2);
          break;
        case 'balanced':
          journey.values.biodiversity = Math.min(100, journey.values.biodiversity + 3);
          journey.values.timberSupply = Math.min(100, journey.values.timberSupply + 3);
          journey.values.communityNeeds = Math.min(100, journey.values.communityNeeds + 3);
          journey.values.firstNationsValues = Math.min(100, journey.values.firstNationsValues + 3);
          applyProtagonistCost(journey, BALANCED_WORKSHOP_SURCHARGE);
          ui.write('Holding all four interests level ran the session long.', 'term-dim');
          break;
      }

      spendDay(journey);
      applyProtagonistCost(journey, { energy: 10, stress: 5 });
      applyPlanningProfessionalWork(journey, { paperworkLoad: 1, auditExposure: 1 });
      ui.write('Values workshop completed. Balance updated.');
      break;
    }

    case 'timber':
      // Timber supply analysis: a day of analysis time buys timber standing.
      journey.values.timberSupply = Math.min(100, journey.values.timberSupply + 12);
      spendDay(journey);
      applyProtagonistCost(journey, { energy: 10, stress: 5 });
      applyPlanningProfessionalWork(journey, { paperworkLoad: 1, auditExposure: 1 });
      ui.write(`Timber supply analysis completed. Timber: ${journey.values.timberSupply}%. The day came out of the analysis calendar.`);
      break;

    case 'email': {
      // Quick email check with random effect (Phase 2.3)
      spendDay(journey);
      applyProtagonistCost(journey, { energy: 3, stress: 2 });
      const roll = Math.random();
      if (roll < 0.3) {
        journey.plan.dataCompleteness = Math.min(100, journey.plan.dataCompleteness + 3);
        ui.write('Useful data attachment in an email. Data completeness +3%.');
      } else if (roll < 0.5) {
        journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 2);
        ui.write('Supportive email from the district stewardship officer. District goodwill +2.');
      } else if (roll < 0.7) {
        applyProtagonistCost(journey, { energy: 0, stress: 5 });
        ui.write("Angry email from the mill's planning lead. Stress increased.");
      } else {
        ui.write('Nothing urgent in the inbox.');
      }
      applyPlanningProfessionalWork(journey, { paperworkLoad: 1, auditExposure: 1 });
      break;
    }

    case 'network':
      journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 4);
      spendDay(journey);
      applyProtagonistCost(journey, { energy: 8, stress: 3 });
      applyPlanningProfessionalWork(journey, { paperworkLoad: 1 });
      if (journey.protagonist) {
        journey.protagonist.reputation = Math.min(100, journey.protagonist.reputation + 2);
      }
      ui.write('Coffee with district staff and the Nation\'s referral coordinator. District goodwill +4.');
      break;

    case 'rest':
      if (journey.protagonist) {
        journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 25);
        journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 15);
      }
      spendDay(journey);
      applyPlanningProfessionalWork(journey, { auditExposure: -1, competenceRisk: -1 });
      ui.write('You take a break. Feeling refreshed.');
      break;

    default:
      break;
  }

}

/**
 * Extra toll for running a balanced values session. Every workshop takes the
 * same day (see js/journey/dayPlan.js); this is what the balanced one takes
 * out of you on top.
 */
export const BALANCED_WORKSHOP_SURCHARGE = { energy: 8, stress: 6 };

/**
 * Build the Values Workshop sub-menu. Every emphasis is one day's session, so
 * all five are always on the table — Balanced Approach pays for its spread in
 * energy and stress instead of in hours.
 * @returns {Array<{label: string, description: string, value: string}>}
 */
export function buildValuesWorkshopChoices() {
  const choices = [
    { label: 'Emphasize Biodiversity', description: '+8 bio, -3 timber', value: 'bio' },
    { label: 'Emphasize Timber Supply', description: '+8 timber, -3 bio', value: 'timber_v' },
    { label: 'Emphasize Community', description: '+8 community, -2 timber (viewscape and access commitments cost volume)', value: 'community' },
    { label: 'Emphasize First Nations', description: '+8 First Nations values, -2 timber (heritage and referral commitments cost volume)', value: 'fn' }
  ];

  choices.push({
    label: 'Balanced Approach',
    description: `+3 all values, but a long day: -${BALANCED_WORKSHOP_SURCHARGE.energy} energy, +${BALANCED_WORKSHOP_SURCHARGE.stress} stress`,
    value: 'balanced'
  });

  return choices;
}

function applyProtagonistCost(journey, costs) {
  if (!journey.protagonist) return;
  if (costs.energy) {
    journey.protagonist.energy = Math.max(0, journey.protagonist.energy - costs.energy);
  }
  if (costs.stress) {
    journey.protagonist.stress = Math.min(100, journey.protagonist.stress + costs.stress);
  }
}

function getValuesGateDeficits(journey) {
  const values = journey?.values || {};
  return [
    { label: 'Bio', value: values.biodiversity ?? 0 },
    { label: 'Timber', value: values.timberSupply ?? 0 },
    { label: 'Community', value: values.communityNeeds ?? 0 },
    { label: 'FN', value: values.firstNationsValues ?? 0 }
  ].filter((entry) => entry.value < 25);
}

function formatValuesGateDeficits(deficits) {
  if (!deficits.length) return 'all values ready';
  return deficits.map((entry) => `${entry.label} ${entry.value}%`).join(', ');
}

async function advanceToNextDay(game) {
  const { ui, journey } = game;

  // District goodwill moves only on district-facing actions and events; the
  // daily cost of a planning file is money.
  journey.resources.budget = Math.max(0, journey.resources.budget - PLANNING_DAILY_BURN);

  const daysRemainingBeforeAdvance = Number.isFinite(journey.deadline)
    ? journey.deadline - journey.day
    : null;
  if (daysRemainingBeforeAdvance !== null && daysRemainingBeforeAdvance <= 4 && journey.plan.phase !== 'ministerial_approval') {
    journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 2);
    if (journey.protagonist) {
      journey.protagonist.stress = Math.min(100, journey.protagonist.stress + 6);
    }
    ui.writeWarning('The current FSP expires soon. Every day without a replacement is a day the licence cannot apply for new cutting permits.');
  }

  const fom = journey.blockPlanning?.fom;
  if (fom?.status === 'public_review') {
    fom.reviewDaysRemaining = Math.max(
      0,
      (fom.reviewDaysRemaining || 0) - FOM_CALENDAR_DAYS_PER_PLANNING_DAY,
    );
    if (fom.reviewDaysRemaining <= 0) {
      if (fom.commentLoad <= FOM_PUBLIC_REVIEW_COMMENT_LIMIT && fom.waterGate !== 'hold') {
        fom.status = 'closed';
        fom.commentLoad = 0;
        fom.approvedDay = journey.day + 1;
        ui.writePositive('FOM comment period closed; comments logged and responses filed.');
      } else {
        fom.status = 'revision_required';
        fom.revisionNotes = fom.waterGate === 'hold'
          ? 'Comments on the in-stream work window (WSA s.11) still need a response.'
          : 'Public comments require one more response pass.';
        ui.writeWarning(`Forest Operations Map comments need a response: ${fom.revisionNotes}`);
      }
    }
  }

  journey.day++;
  startDay(journey);

  // Protagonist recovery
  if (journey.protagonist) {
    journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 30);
    journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 10);
  } else {
    journey.resources.energy = Math.min(100, (journey.resources.energy || 50) + 30);
  }

  const professional = ensurePlanningProfessionalState(journey);
  if (professional) {
    const cpdGap = Math.max(0, professional.cpdTarget - professional.cpdHours);
    if (cpdGap > 0) {
      professional.competenceRisk = Math.min(100, professional.competenceRisk + 1);
      professional.auditExposure = Math.min(100, professional.auditExposure + 1);
      // A CPD record that is behind is what an FPBC audit finds first.
      if (journey.day % 4 === 0) {
        journey.scrutiny = clampValue((journey.scrutiny || 0) + 1);
      }
    } else if (professional.competenceRisk > 0) {
      professional.competenceRisk = Math.max(0, professional.competenceRisk - 1);
    }
    professional.paperworkLoad = Math.max(0, professional.paperworkLoad - 1);
    if (professional.auditExposure > 0 && professional.registrationStatus === 'active') {
      professional.auditExposure = Math.max(0, professional.auditExposure - 1);
    }
  }

  // Advance season
  if (journey.season) {
    const { state, transition } = advanceSeasonDay(journey.season);
    journey.season = state;
    if (transition.seasonChanged) {
      ui.write(`Season changed to ${transition.newSeason}`);
    }
  }

  ui.write(`Planning team burn: -$${PLANNING_DAILY_BURN}.`);
}

function checkGameOver(game) {
  const journey = game.journey;

  // Thresholds and reason strings live in the shared module. This used to be a
  // copy that had drifted — it never closed the file when the FSP expired, so
  // a doomed plan kept billing days forever.
  const result = checkPlanningEndConditions(journey);
  if (result?.gameOver) {
    journey.isGameOver = true;
    journey.gameOverReason = result.reason;
  }
}
