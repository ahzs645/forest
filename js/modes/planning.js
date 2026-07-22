/**
 * Planning Mode Runner
 * Protagonist-based strategic planning for landscape-level forest plans
 * Multi-action days with values tradeoffs
 */

import { checkForEvent } from '../events.js';
import { handleEvent } from './shared/handleEvent.js';
import { buildOfficeWindowFrames } from '../scene/textmode/scenes.js';
import { getCurrentSeasonInfo, advanceDay as advanceSeasonDay } from '../season.js';
import {
  buildPlanningConstraintTriage,
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
import { isPlanningApprovalReady } from './shared/endConditions.js';
import { getOperationalProgress, recordProgressMilestones } from '../journey.js';
import { getDiscoveryTagNotes, getJourneyDiscoveryTags } from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';

// The professional reference carried by the game specifies a 30-calendar-day
// comment period. A planning "day" is a compressed turn, so the statutory
// clock advances by 15 calendar days only when the player ends a day.
export const FOM_PUBLIC_REVIEW_MIN_DAYS = 30;
export const FOM_CALENDAR_DAYS_PER_PLANNING_DAY = 15;
export const FOM_MIN_DATA_COMPLETENESS = 30;
export const FOM_MIN_ANALYSIS_QUALITY = 15;
const FOM_PUBLIC_REVIEW_COMMENT_LIMIT = 0;
// The Cutblock Priority Decision card re-triages the area and reprints the
// same zone framing every time it fires. On a short (campaign-scale) run the
// 3-day cadence can put it on screen 4 times with identical wording, so cap
// it to a couple of appearances per run instead of letting the day-based
// cadence reschedule indefinitely.
const MAX_BLOCK_SELECTIONS_PER_RUN = 2;
const PLANNING_PHASE_NAMES = {
  data_gathering: 'Data Gathering',
  analysis: 'Analysis',
  stakeholder_review: 'Stakeholder Review',
  ministerial_approval: 'Ministerial Approval'
};

function ensurePlanningProfessionalState(journey) {
  return ensureProfessionalComplianceState(journey);
}

function getPlanningProfessionalSnapshot(journey) {
  return getProfessionalComplianceSnapshot(journey);
}

function describePlanningProfessionalSnapshot(snapshot) {
  if (!snapshot) return 'Registration n/a | CPD n/a | Paperwork n/a | Audit n/a';
  const burden = snapshot.areaBurdenLabel ? ` | ${snapshot.areaBurdenLabel}` : '';
  return `Registration: ${snapshot.registrationStatus} | CPD: ${snapshot.cpdHours}/${snapshot.cpdTarget}h | Paperwork: ${snapshot.paperworkLoad} | Audit: ${snapshot.auditExposure}${burden}`;
}

function getPlanningProfessionalIssues(journey) {
  const snapshot = getPlanningProfessionalSnapshot(journey);
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
  if (snapshot.paperworkLoad >= 55) {
    reasons.push(`paperwork load ${snapshot.paperworkLoad}`);
  }
  if (snapshot.auditExposure >= 35) {
    reasons.push(`audit exposure ${snapshot.auditExposure}`);
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
      return `Public review ${Math.max(0, fom.reviewDaysRemaining)} calendar days left`;
    case 'revision_required':
      return 'Revision required';
    case 'approved':
      return 'Approved';
    default:
      return 'Draft';
  }
}

export function getFomPublicationGaps(journey) {
  const gaps = [];
  if (!journey?.blockPlanning?.activeBlock) gaps.push('select an active block');
  const data = Math.round(Number(journey?.plan?.dataCompleteness || 0));
  const analysis = Math.round(Number(journey?.plan?.analysisQuality || 0));
  if (data < FOM_MIN_DATA_COMPLETENESS) gaps.push(`data ${data}%/${FOM_MIN_DATA_COMPLETENESS}%`);
  if (analysis < FOM_MIN_ANALYSIS_QUALITY) gaps.push(`analysis ${analysis}%/${FOM_MIN_ANALYSIS_QUALITY}%`);
  return gaps;
}

function getPlanningPhaseLabel(phase) {
  return PLANNING_PHASE_NAMES[phase] || phase;
}

export function syncFomStateFromActiveBlock(journey, seasonInfo) {
  const blockPlanning = journey.blockPlanning;
  if (!blockPlanning?.activeBlock) return ensurePlanningFomState(journey);

  const fom = ensurePlanningFomState(journey);
  const waterContext = getPlanningBlockWaterContext(blockPlanning.activeBlock, journey.area, seasonInfo);
  const roadContext = getPlanningRoadAssetContext(journey, blockPlanning.activeBlock);
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
  }

  fom.activeBlockId = activeBlockId;
  fom.blockLabel = blockPlanning.activeSummary || blockPlanning.activeBlock.label || blockPlanning.activeBlock.id;
  fom.waterGate = waterContext.gate;
  fom.waterNote = waterContext.note;
  fom.hydrologyLabel = waterContext.hydrologyLabel;
  fom.hydrologyReadiness = waterContext.readiness;
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
      return `Update FOM Review${roadSuffix} (2h)`;
    case 'revision_required':
      return `Revise FOM${roadSuffix} (2h)`;
    case 'approved':
      return roadContext?.hasData ? 'Check FOM / Road Record (1h)' : 'Check FOM Record (1h)';
    default:
      return `Open FOM Review${roadSuffix} (2h)`;
  }
}

function getFomActionDescription(fom, roadContext = null) {
  const roadTail = roadContext?.hasData
    ? ` Road-access intel: ${roadContext.summary}.`
    : '';
  switch (fom?.status) {
    case 'public_review':
      return `Keep the Forest Operations Map current while the ${Math.max(0, fom.reviewDaysRemaining)}-calendar-day review clock runs; one planning day advances ${FOM_CALENDAR_DAYS_PER_PLANNING_DAY} calendar days.${roadTail}`;
    case 'revision_required':
      return `Address review comments, especially timing and water notes, then resubmit the map.${roadTail}`;
    case 'approved':
      return `Confirm the map record and keep the submission package aligned.${roadTail}`;
    default:
      return `Publish the Forest Operations Map after baseline data and preliminary analysis are ready; opens the required 30-calendar-day review window.${roadTail}`;
  }
}

function updatePlanningFomStatus(ui, fom, waterContext, roadContext, sourceLabel = 'review work') {
  if (!fom) {
    return false;
  }

  const roadClear = !roadContext?.blocker;
  const reviewClear = (fom.reviewDaysRemaining || 0) <= 0;
  const commentsClear = (fom.commentLoad || 0) <= FOM_PUBLIC_REVIEW_COMMENT_LIMIT;
  const waterClear = waterContext?.gate !== 'hold';

  if (reviewClear && commentsClear && waterClear && roadClear) {
    fom.status = 'approved';
    fom.commentLoad = 0;
    fom.reviewDaysRemaining = 0;
    fom.approvedDay = Math.max(1, fom.lastUpdatedDay || 0);
    ui.writePositive(`Forest Operations Map cleared public review after ${sourceLabel}.`);
    return true;
  }

  return false;
}

export function getPlanningSubmissionReadiness(journey, seasonInfo = null) {
  const fom = syncFomStateFromActiveBlock(journey, seasonInfo);
  const waterContext = getPlanningBlockWaterContext(journey.blockPlanning?.activeBlock, journey.area, seasonInfo);
  const roadContext = getPlanningRoadAssetContext(journey, journey.blockPlanning?.activeBlock || null);
  const professional = getPlanningProfessionalSnapshot(journey);
  const reasons = [];

  if (!journey.blockPlanning?.activeBlock) {
    reasons.push('no active block selected');
  }

  if (fom.status !== 'approved') {
    reasons.push(`FOM is ${describeReviewState(fom).toLowerCase()}`);
  }

  if (waterContext.gate === 'hold') {
    reasons.push(waterContext.note);
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
  if (professional?.cpdGap > 0) {
    reasons.push(`CPD gap ${professional.cpdGap}h`);
  }
  if (professional?.competenceRisk >= 35) {
    reasons.push(`competence risk ${professional.competenceRisk}%`);
  }
  if (professional?.auditExposure >= 35) {
    reasons.push(`audit exposure ${professional.auditExposure}`);
  }

  return {
    ready: reasons.length === 0,
    reasons,
    waterContext,
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

  if (primary.label === 'Timber' && (journey?.values?.biodiversity || 0) > 32) {
    return {
      actionLabel: 'Timber Assessment',
      headline: `Timber Assessment to lift timber supply from ${primary.value}% before the next gate.`,
      followUp: 'Use Values Workshop after the timber pass if biodiversity starts to slip.'
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

function buildPlanningActionGuidance(journey, seasonInfo = null) {
  const readiness = getPlanningSubmissionReadiness(journey, seasonInfo);
  const deficits = getValuesGateDeficits(journey);
  const approvalGaps = getPlanningApprovalGaps(journey);
  const professional = getPlanningProfessionalSnapshot(journey);
  const professionalIssues = getPlanningProfessionalIssues(journey);
  const steps = [];
  let lane = 'Technical file';
  let headline = 'Gather Data to keep the planning file moving.';

  if (!journey.blockPlanning?.activeBlock) {
    lane = 'Block file';
    headline = 'Choose an active block when the cutblock review opens so the rest of the file has somewhere to land.';
    pushPlanningGuideStep(steps, 'Finish the cutblock review prompt and lock an active block before you worry about FOM or submission work.');
    return { lane, headline, steps };
  }

  switch (journey.plan.phase) {
    case 'data_gathering':
      lane = 'Technical file';
      headline = 'Gather Data to reach 80% completeness and unlock analysis.';
      pushPlanningGuideStep(steps, 'Gather Data until the baseline package is strong enough to hand off to analysis.');
      pushPlanningGuideStep(steps, 'Use Compliance Admin if registration or paperwork pressure starts dragging the file.');
      return { lane, headline, steps };

    case 'analysis':
      lane = 'Technical file';
      headline = 'Run Analysis to push the model package to 80% and open stakeholder review.';
      pushPlanningGuideStep(steps, 'Run Analysis until the technical package clears the phase gate.');
      pushPlanningGuideStep(steps, 'Use Values Workshop if the block choice dragged a core value under the review threshold.');
      return { lane, headline, steps };

    case 'stakeholder_review': {
      if (deficits.length > 0) {
        const valueHint = getPlanningValueRecoveryHint(journey, deficits);
        lane = 'Values lane';
        headline = valueHint?.headline || 'Values Workshop to recover the blocked values.';
        pushPlanningGuideStep(steps, valueHint?.followUp || 'Recover the weakest value before reopening the stakeholder lane.');
        pushPlanningGuideStep(steps, 'Stakeholder Session stays blocked until every value clears 25%.');
        return { lane, headline, steps };
      }

      lane = 'Consultation lane';
      headline = 'Stakeholder Session to push buy-in toward 75% and open ministerial approval.';
      pushPlanningGuideStep(steps, 'Hold Stakeholder Session until buy-in clears the approval handoff.');
      pushPlanningGuideStep(steps, 'Use Values Workshop if a session drags biodiversity, community, or First Nations values back down.');
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

  const fom = readiness.fom;
  if (!deficits.length && fom?.status !== 'approved') {
    lane = 'FOM / submission file';
    if (fom?.status === 'draft') {
      headline = 'Open FOM Review to start the public-review clock on the active block.';
      pushPlanningGuideStep(steps, 'Open FOM Review first; submission cannot move while the FOM is still a draft.');
    } else if (fom?.status === 'public_review') {
      headline = 'Update FOM Review until the review window and open comments clear.';
      pushPlanningGuideStep(steps, `Keep the FOM live until the ${Math.max(0, fom.reviewDaysRemaining || 0)} calendar days and comment load burn down; each planning day advances ${FOM_CALENDAR_DAYS_PER_PLANNING_DAY} calendar days.`);
    } else if (fom?.status === 'revision_required') {
      headline = 'Revise FOM to close review comments and reopen the submission lane.';
      pushPlanningGuideStep(steps, 'Stay in the FOM lane until revision notes and water comments are closed.');
    }
    if (readiness.waterContext?.gate === 'hold') {
      pushPlanningGuideStep(steps, readiness.waterContext.note);
    }
    if (readiness.roadContext?.blocker) {
      pushPlanningGuideStep(steps, `Road blocker: ${readiness.roadContext.blockerReasons.join(' | ')}`);
    }
  }

  if (!deficits.length && fom?.status === 'approved' && professionalIssues.length > 0) {
    lane = 'Professional file';
    const adminLabel = professional?.registrationActive ? 'Compliance Admin' : 'Renew Registration';
    headline = `${adminLabel} to clear ${professionalIssues[0]} before the package goes upstairs.`;
    pushPlanningGuideStep(steps, 'Clear registration, CPD, and paperwork drag before you spend ministerial time.');
  }

  if (!deficits.length && fom?.status === 'approved' && professionalIssues.length === 0 && journey.plan.ministerialConfidence < 80) {
    lane = 'Ministerial brief';
    headline = 'Ministerial Outreach to close the confidence gap before submission.';
    pushPlanningGuideStep(steps, 'Recover confidence to 80% before you burn six hours on the final package.');
  }

  if (!deficits.length && readiness.ready && journey.plan.ministerialConfidence >= 80) {
    lane = 'Submission package';
    headline = 'Prepare Submission while the FOM, values, and professional gates are clean.';
    pushPlanningGuideStep(steps, 'Use the six-hour submission push before another event reopens the file.');
  }

  if (!steps.length) {
    pushPlanningGuideStep(steps, 'Keep the live blocker moving instead of spending hours on low-yield support work.');
  }

  return { lane, headline, steps };
}

export function capturePlanningActionState(journey) {
  return {
    hours: Number(journey.hoursRemaining || 0),
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
  const hoursUsed = before.hours - after.hours;
  if (hoursUsed > 0) parts.push(`Time ${hoursUsed}h`);

  const percentFields = [
    ['Data', 'data'],
    ['Analysis', 'analysis'],
    ['Buy-in', 'buyIn'],
    ['Confidence', 'confidence'],
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
  if (politicalDelta !== 0) parts.push(`Political capital ${signed(politicalDelta)} → ${Math.round(after.political)}`);
  const cpdDelta = after.cpd - before.cpd;
  if (cpdDelta !== 0) parts.push(`CPD ${signed(cpdDelta)}h → ${Math.round(after.cpd)}h`);
  const paperworkDelta = after.paperwork - before.paperwork;
  if (paperworkDelta !== 0) parts.push(`Paperwork ${signed(paperworkDelta)} → ${Math.round(after.paperwork)}`);
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
    }), { delay: 140, holdLastFrame: false });
  }

  // Reset hours for new day
  if (!journey.hoursRemaining || journey.hoursRemaining <= 0) {
    journey.hoursRemaining = 8;
  }

  // Periodic real-data block decision: selected block influences events and values.
  await maybePromptForBlockSelection(game, seasonInfo);

  // Apply daily values consequences (Phase 4.1)
  applyValuesConsequences(journey);

  // Check for event at start of day. Day 1 stays event-free so the player meets
  // the normal planning loop before the game starts throwing disruptions.
  const event = journey.day > 1 ? checkForEvent(journey) : null;
  if (event) {
    displayPlanningHeader(ui, journey, seasonInfo);
    await handleEvent(game, event);
    if (game.gameOver) return;
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

  // Multi-action loop (Phase 2.3)
  while (journey.hoursRemaining > 0) {
    displayPlanningHeader(ui, journey, seasonInfo);

    // Check protagonist energy mid-day
    if (journey.protagonist && journey.protagonist.energy <= 0) {
      ui.writeWarning('You are exhausted. The rest of the day is lost to recovery.');
      journey.protagonist.energy = 15;
      break;
    }

    const actionOptions = buildActionOptions(journey, seasonInfo);

    const action = await ui.promptChoice(`${journey.hoursRemaining}h remaining:`, actionOptions);

    if (action.value === 'end') {
      break;
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
        label: 'Acknowledge results and continue',
        description: `${action.label || 'Action'} is complete; return to the planning day`,
        value: 'continue'
      }]);
    }

    if (journey.isComplete) {
      // 'submit' can clear ministerial approval with hours still on the
      // clock. Once the plan is approved the expedition is over -- stop
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
  facts.push({ label: 'Hours left', value: `${journey.hoursRemaining}h` });
  facts.push({ label: 'Phase', value: getPlanningPhaseLabel(plan.phase) });
  if (Number.isFinite(journey.deadline)) {
    const daysLeft = Math.max(0, journey.deadline - journey.day);
    facts.push({ label: 'Days left', value: `${daysLeft}`, tone: daysLeft <= 3 ? 'danger' : daysLeft <= 7 ? 'warn' : undefined });
  }
  if (guidance.lane) facts.push({ label: 'Lane', value: guidance.lane });

  const gates = [
    { label: 'Data', target: 80, current: Math.round(plan.dataCompleteness || 0) },
    { label: 'Analysis', target: 80, current: Math.round(plan.analysisQuality || 0) },
    { label: 'Buy-in', target: 75, current: Math.round(plan.stakeholderBuyIn || 0) },
    { label: 'Confidence', target: 80, current: Math.round(plan.ministerialConfidence || 0) }
  ];
  const checklist = gates.map((gate) => ({
    label: `${gate.label} ${gate.current}% of ${gate.target}%`,
    done: gate.current >= gate.target
  }));
  const alerts = [];
  if (plan.phase === 'ministerial_approval') {
    const gap = Math.max(0, 80 - plan.ministerialConfidence);
    alerts.push(gap > 0
      ? { level: 'warn', text: `Approval gap: ${gap} confidence point${gap === 1 ? '' : 's'}. Use Ministerial Outreach before submission.` }
      : { level: 'ok', text: 'Approval threshold reached. A full submission can carry the plan across the line.' });
  }
  const fom = syncFomStateFromActiveBlock(journey, seasonInfo);
  if (fom?.status === 'public_review') {
    const days = Math.max(0, fom.reviewDaysRemaining || 0);
    const comments = Math.max(0, fom.commentLoad || 0);
    alerts.push({
      level: days <= FOM_CALENDAR_DAYS_PER_PLANNING_DAY ? 'danger' : 'warn',
      text: `Public Review Window: ${days} calendar days remaining | ${comments} open comment${comments === 1 ? '' : 's'} | ${FOM_CALENDAR_DAYS_PER_PLANNING_DAY} calendar days per planning day`
    });
  } else if (fom?.status === 'revision_required') {
    alerts.push({ level: 'warn', text: 'FOM public review flagged revisions - address them before the window reopens.' });
  }
  if (fom?.roadBlocker) alerts.push({ level: 'warn', text: `Road-engineering blocker: ${fom.roadBlockerReasons.join(' | ')}` });

  const objectiveDeadline = Number.isFinite(journey.deadline) ? ` by Day ${journey.deadline}` : '';
  const status = {
    objective: `Win ministerial approval of the landscape plan${objectiveDeadline}.`,
    meter: { label: 'Confidence', value: plan.ministerialConfidence, text: `${Math.round(plan.ministerialConfidence)}%` },
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
    ui.write(`Public Review Window: ${reviewDaysRemaining} calendar days remaining | ${commentLoad} open comment${commentLoad === 1 ? '' : 's'} | ${FOM_CALENDAR_DAYS_PER_PLANNING_DAY} calendar days per planning day`);
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
  ui.write(`Values: Bio ${journey.values.biodiversity}% | Timber ${journey.values.timberSupply}% | Community ${journey.values.communityNeeds}% | FN ${journey.values.firstNationsValues}%`);
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
    ui.write(`FOM: ${describeReviewState(fom)} | Water Gate: ${fom.waterGate.toUpperCase()} | ${fom.hydrologyLabel}`);
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
  if (journey.blockPlanning?.activeSummary) {
    ui.write(`Active Block: ${journey.blockPlanning.activeSummary}`);
    if (journey.blockPlanning.nextSelectionDay) {
      ui.write(`Next block review: Day ${journey.blockPlanning.nextSelectionDay}`);
    }
  }
}

async function maybePromptForBlockSelection(game, seasonInfo) {
  const { ui, journey } = game;
  const plannerState = journey.blockPlanning;
  if (!plannerState) return;
  if (journey.plan?.phase === 'ministerial_approval' && plannerState.activeBlock) return;
  if (journey.day < (plannerState.nextSelectionDay || 1)) return;
  if ((plannerState.selectionCount || 0) >= MAX_BLOCK_SELECTIONS_PER_RUN) return;

  displayPlanningHeader(ui, journey, seasonInfo);
  ui.writeHeader('CUTBLOCK PRIORITY DECISION');
  ui.write('Choose how to triage the area constraints before you lock the next block focus.');
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

  const selected = await ui.promptChoice('Select active block focus:', promptOptions);
  const chosen = options.find((block) => block.id === selected.value) || options[0];
  applySelectedBlockImpact(journey, chosen, triageChoice.value, seasonInfo);
}

function applySelectedBlockImpact(journey, block, triageKey = null, seasonInfo = null) {
  if (!journey.blockPlanning || !block) return;

  const state = journey.blockPlanning;
  state.activeBlockId = block.id;
  state.activeBlock = block;
  state.activeTriage = triageKey;
  state.activeTriageLabel = getPlanningTriageLabel(triageKey);
  const roadContext = getPlanningRoadAssetContext(journey, block);
  const roadMatch = roadContext.source === 'joined' && roadContext.joinedFromBlockName
    ? ` | Matched recce ${roadContext.joinedFromBlockName}`
    : '';
  state.activeSummary = `${summarizePlanningBlock(block, journey.area, triageKey, seasonInfo)}${roadMatch}`;
  state.activeEventBias = block.eventBias || null;
  state.history = Array.isArray(state.history) ? [...state.history, block.id].slice(-30) : [block.id];
  state.selectionCount = (state.selectionCount || 0) + 1;
  state.nextSelectionDay = journey.day + (state.cadenceDays || 3);
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
    journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 1);
  }
  if (journey.values.firstNationsValues < 30 && journey.plan.phase === 'stakeholder_review') {
    // Stalls stakeholder phase progress
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
  const hoursLeft = journey.hoursRemaining || 8;
  const fom = syncFomStateFromActiveBlock(journey, seasonInfo);
  const roadContext = getPlanningRoadAssetContext(journey, journey.blockPlanning?.activeBlock || null);
  const approvalGaps = getPlanningApprovalGaps(journey);

  // Phase-specific primary actions
  if (journey.plan.phase === 'data_gathering' && journey.resources.dataCredits > 0 && hoursLeft >= 3) {
    actionOptions.push({
      label: 'Gather Data (3h)',
      description: 'Lane: technical file | Compile LiDAR, inventory, and baseline data',
      value: 'gather_data'
    });
  }

  if (journey.plan.phase === 'analysis' && hoursLeft >= 4) {
    actionOptions.push({
      label: 'Run Analysis (4h)',
      description: 'Lane: technical file | Spatial analysis and modeling',
      value: 'analyze'
    });
  }

  if (journey.plan.phase === 'stakeholder_review' && hoursLeft >= 4) {
    // Check values gate (Phase 4.1)
    const deficits = getValuesGateDeficits(journey);
    const valuesOk = deficits.length === 0;
    if (valuesOk) {
      actionOptions.push({
        label: 'Stakeholder Session (4h)',
        description: 'Lane: consultation file | Host consultation and bank buy-in',
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

  if (journey.plan.phase === 'ministerial_approval' && approvalGaps.some((gap) => gap.key === 'data') && hoursLeft >= 3) {
    actionOptions.push({
      label: 'Gather Data (3h)',
      description: 'Lane: technical recovery | Rebuild baseline completeness before final approval work',
      value: 'gather_data'
    });
  }

  if (journey.plan.phase === 'ministerial_approval' && approvalGaps.some((gap) => gap.key === 'analysis') && hoursLeft >= 4) {
    actionOptions.push({
      label: 'Run Analysis (4h)',
      description: 'Lane: technical recovery | Reopen the model package and restore submission readiness',
      value: 'analyze'
    });
  }

  if (journey.plan.phase === 'ministerial_approval' && approvalGaps.some((gap) => gap.key === 'stakeholder') && hoursLeft >= 4) {
    const deficits = getValuesGateDeficits(journey);
    const valuesOk = deficits.length === 0;
    if (valuesOk) {
      actionOptions.push({
        label: 'Stakeholder Session (4h)',
        description: 'Lane: consultation recovery | Rebuild buy-in before the final package',
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

  if (journey.plan.phase === 'ministerial_approval' && hoursLeft >= 6) {
    const deficits = getValuesGateDeficits(journey);
    const valuesOk = deficits.length === 0;
    const submissionReadiness = getPlanningSubmissionReadiness(journey, seasonInfo);
    const professionalIssues = getPlanningProfessionalIssues(journey);
    if (valuesOk && submissionReadiness.ready && professionalIssues.length === 0 && approvalGaps.length === 0) {
      actionOptions.push({
        label: 'Prepare Submission (6h)',
        description: 'Lane: submission package | Fastest approval push once the FOM, road, and professional gates are clear',
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

  if (hoursLeft >= 2) {
    const professional = getPlanningProfessionalSnapshot(journey);
    const label = professional?.registrationActive ? 'Compliance Admin (2h)' : 'Renew Registration (2h)';
    const pieces = [];
    if (professional?.registrationStatus !== 'active') {
      pieces.push(`registration ${professional.registrationStatus} (your licence to sign off is not current)`);
    }
    if (professional?.cpdGap > 0) {
      pieces.push(`CPD gap ${professional.cpdGap}h (professional training file is behind)`);
    }
    if (professional?.paperworkLoad > 0) {
      pieces.push(`paperwork ${professional.paperworkLoad} (filing backlog slowing the file)`);
    }
    actionOptions.push({
      label,
      description: pieces.length
        ? `Lane: professional file | Clears: ${pieces.join(' | ')}`
        : 'Lane: professional file | Renew registration, log CPD (continuing training), and clear paperwork pressure',
      value: 'professional_admin'
    });
  }

  if (journey.plan.phase === 'ministerial_approval' && hoursLeft >= 2 && journey.plan.ministerialConfidence < 80) {
    actionOptions.push({
      label: 'Ministerial Outreach (2h)',
      description: 'Lane: ministerial brief | Brief decision-makers and recover confidence up to 80%',
      value: 'outreach'
    });
  }

  if (journey.blockPlanning?.activeBlock && hoursLeft >= 2) {
    const publicationGaps = fom?.status === 'draft' ? getFomPublicationGaps(journey) : [];
    if (publicationGaps.length > 0) {
      actionOptions.push({
        label: 'Open FOM Review (BLOCKED)',
        description: `Needs: ${publicationGaps.join(' | ')}. Build a baseline file before publishing a public map.`,
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
  if (hoursLeft >= 3) {
    actionOptions.push({
      label: 'Values Workshop (3h)',
      description: 'Lane: values file | Balance competing interests with explicit tradeoffs',
      value: 'values'
    });
  }

  // Timber assessment (new - Phase 4.1)
  if (hoursLeft >= 3) {
    actionOptions.push({
      label: 'Timber Assessment (3h)',
      description: 'Lane: timber file | Assess timber supply (+timber, -biodiversity)',
      value: 'timber'
    });
  }

  // Quick actions (Phase 2.3)
  if (hoursLeft >= 1) {
    actionOptions.push({
      label: 'Check Email (1h)',
      description: 'Lane: admin support | Handle correspondence and clear inbox drag',
      value: 'email'
    });
  }

  if (hoursLeft >= 2) {
    actionOptions.push({
      label: 'Network (2h)',
      description: 'Lane: support | Build political capital for the next gate',
      value: 'network'
    });
  }

  if (hoursLeft >= 2 && journey.protagonist) {
    actionOptions.push({
      label: 'Take a Break (2h)',
      description: 'Lane: recovery | Reduce stress and recover energy',
      value: 'rest'
    });
  }

  actionOptions.push({
    label: 'Review the File',
    description: 'Values, situation, FOM detail, and carry-forward notes',
    value: 'briefing'
  });

  actionOptions.push({
    label: 'End Day',
    description: 'Wrap up work',
    value: 'end'
  });

  return actionOptions;
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
      journey.plan.dataCompleteness = Math.min(100, journey.plan.dataCompleteness + 10);
      if (discoveryTags.length > 0) {
        const bonus = Math.min(3, discoveryTags.length);
        journey.plan.dataCompleteness = Math.min(100, journey.plan.dataCompleteness + bonus);
        ui.write(`Carry-forward field intel sharpened the data package (+${bonus}).`);
      }
      journey.resources.dataCredits -= 10;
      journey.resources.budget = Math.max(0, journey.resources.budget - 900);
      journey.hoursRemaining -= 3;
      applyProtagonistCost(journey, { energy: 10, stress: 6 });
      applyPlanningProfessionalWork(journey, { cpdHours: 2, paperworkLoad: recoveryRun ? 1 : 2, competenceRisk: -1, auditExposure: 1 });
      ui.write(`Data gathering progressed. Completeness: ${journey.plan.dataCompleteness}%`);
      if (!recoveryRun && journey.plan.dataCompleteness >= 80) {
        journey.plan.phase = 'analysis';
        ui.writePositive('Data phase complete! Moving to Analysis.');
      } else if (recoveryRun && journey.plan.dataCompleteness >= 80) {
        ui.writePositive('Technical recovery complete. The data file is back above the approval threshold.');
      }
      break;
    }

    case 'analyze': {
      const recoveryRun = journey.plan.phase === 'ministerial_approval';
      journey.plan.analysisQuality = Math.min(100, journey.plan.analysisQuality + 15);
      if (discoveryTags.length > 0) {
        const bonus = Math.min(4, discoveryTags.length * 2);
        journey.plan.analysisQuality = Math.min(100, journey.plan.analysisQuality + bonus);
        ui.write(`Existing ground intel tightened the analysis (+${bonus}).`);
      }
      journey.resources.budget = Math.max(0, journey.resources.budget - 700);
      journey.hoursRemaining -= 4;
      applyProtagonistCost(journey, { energy: 15, stress: 12 });
      applyPlanningProfessionalWork(journey, { cpdHours: 3, paperworkLoad: recoveryRun ? 1 : 2, competenceRisk: -1, auditExposure: 1 });
      ui.write(`Analysis progressed. Quality: ${journey.plan.analysisQuality}%`);
      if (!recoveryRun && journey.plan.analysisQuality >= 80) {
        journey.plan.phase = 'stakeholder_review';
        ui.writePositive('Analysis complete! Moving to Stakeholder Review.');
      } else if (recoveryRun && journey.plan.analysisQuality >= 80) {
        ui.writePositive('Analysis recovery complete. The model package is back above the approval threshold.');
      }
      break;
    }

    case 'stakeholder': {
      const recoveryRun = journey.plan.phase === 'ministerial_approval';
      journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 10);
      if (discoveryIds.has('community_visibility') || discoveryIds.has('cultural_hold') || discoveryIds.has('watershed_watch')) {
        journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 2);
        ui.write('Concrete field findings gave the stakeholder session more weight (+2 buy-in).');
      }
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 6);
      journey.resources.budget = Math.max(0, journey.resources.budget - 700);
      journey.hoursRemaining -= 4;
      applyProtagonistCost(journey, { energy: 20, stress: 16 });
      applyPlanningProfessionalWork(journey, { cpdHours: 2, paperworkLoad: recoveryRun ? 2 : 3, competenceRisk: -1, auditExposure: 2 });
      if (journey.protagonist) {
        journey.protagonist.reputation = Math.min(100, journey.protagonist.reputation + 3);
      }
      ui.write(`Stakeholder buy-in improved to ${journey.plan.stakeholderBuyIn}%`);
      if (!recoveryRun && journey.plan.stakeholderBuyIn >= 75) {
        journey.plan.phase = 'ministerial_approval';
        ui.writePositive('Stakeholder review complete! Moving to Ministerial Approval.');
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
        ui.write('A public map needs a defensible baseline data package and preliminary analysis before the 30-calendar-day notice period starts.');
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
        const confidenceGain = submissionReadiness.waterContext.gate === 'clear' ? 18 : 14;
        journey.plan.ministerialConfidence = Math.min(100, journey.plan.ministerialConfidence + confidenceGain);
      }
      journey.hoursRemaining -= 6;
      journey.resources.budget = Math.max(0, journey.resources.budget - 2200);
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 2);
      applyProtagonistCost(journey, { energy: 25, stress: 20 });
      applyPlanningProfessionalWork(journey, { cpdHours: 4, paperworkLoad: 3, competenceRisk: -2, auditExposure: 2 });
      progressPlanningPaperworkChain(journey, 'fom', 1);
      ui.write(`Submission prepared. Confidence: ${journey.plan.ministerialConfidence}%`);
      if (isPlanningApprovalReady(journey)) {
        journey.isComplete = true;
        journey.endReason = 'Landscape plan approved by Ministry!';
      } else {
        const gap = Math.max(0, 80 - journey.plan.ministerialConfidence);
        ui.write(`Still ${gap} point${gap === 1 ? '' : 's'} short of approval-ready confidence.`);
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
      if (fom.status === 'approved') {
        journey.hoursRemaining -= 1;
        applyProtagonistCost(journey, { energy: 3, stress: 2 });
        ui.write('Forest Operations Map record checked. The approved review file stays in place.');
        if (roadContext.hasData) {
          ui.write(roadContext.note);
        }
        break;
      }

      const waterContext = getPlanningBlockWaterContext(activeBlock, journey.area, seasonInfo);
      const reviewCost = 2;
      journey.hoursRemaining -= reviewCost;
      applyProtagonistCost(journey, { energy: 6, stress: 5 });
      const chainProgress = progressPlanningPaperworkChain(journey, 'fom', 1);
      fom.lastUpdatedDay = journey.day;
      fom.hydrologyLabel = waterContext.hydrologyLabel;

      if (previousStatus === 'draft') {
        fom.status = 'public_review';
        fom.reviewDaysRemaining = FOM_PUBLIC_REVIEW_MIN_DAYS;
        fom.commentLoad = Math.max(fom.commentLoad || 0, waterContext.commentCount);
        fom.publicReviewOpenedDay = journey.day;
        fom.hydrologyReadiness = waterContext.readiness;
        fom.waterGate = waterContext.gate;
        fom.waterNote = waterContext.note;
        applyPlanningProfessionalWork(journey, { paperworkLoad: 2, auditExposure: 1 });

        ui.write('Forest Operations Map posted for public review.');
      } else if (previousStatus === 'public_review') {
        const commentBurn = roadContext.hasData || waterContext.commentCount > 0 ? 2 : 1;
        fom.commentLoad = Math.max(0, (fom.commentLoad || 0) - commentBurn);
        fom.hydrologyReadiness = Math.min(100, Math.max(fom.hydrologyReadiness || 0, waterContext.readiness) + 8);
        fom.waterGate = waterContext.gate;
        fom.waterNote = waterContext.note;
        applyPlanningProfessionalWork(journey, { cpdHours: 1, paperworkLoad: -3, competenceRisk: -1, auditExposure: -2 });

        ui.write(`FOM review updated. Closed ${commentBurn} comment${commentBurn === 1 ? '' : 's'}; the statutory clock advances only when the planning day ends.`);
        updatePlanningFomStatus(ui, fom, waterContext, roadContext, 'review work');
      } else {
        const revisionBurn = roadContext.hasData ? 3 : 2;
        fom.status = 'public_review';
        fom.reviewDaysRemaining = FOM_PUBLIC_REVIEW_MIN_DAYS;
        fom.commentLoad = Math.max(0, Math.max(fom.commentLoad || 0, waterContext.commentCount) - revisionBurn);
        fom.hydrologyReadiness = Math.min(100, Math.max(fom.hydrologyReadiness || 0, waterContext.readiness) + 14);
        fom.waterGate = waterContext.gate;
        fom.waterNote = waterContext.note;
        applyPlanningProfessionalWork(journey, { cpdHours: 1, paperworkLoad: -4, competenceRisk: -2, auditExposure: -2 });

        ui.write(`FOM revisions rebuilt the file and reopened public review with ${Math.max(0, fom.commentLoad)} comment${(fom.commentLoad || 0) === 1 ? '' : 's'} left.`);
      }

      if (chainProgress?.stage) {
        ui.write(`Paperwork chain advanced to: ${chainProgress.stage}.`);
      }
      ui.write(`Review window: ${Math.max(0, fom.reviewDaysRemaining)} calendar days (${FOM_CALENDAR_DAYS_PER_PLANNING_DAY} per planning day) | ${fom.waterNote}`);
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
      // The submission gate needs 80% (see the "Confidence 80%" approval gate
      // and the 80-point gap checks elsewhere in this file) - capping this
      // recommended action's gain at 78% meant the game could tell a player
      // to use Ministerial Outreach to "close the confidence gap" while the
      // action itself was structurally incapable of ever reaching the gate.
      journey.plan.ministerialConfidence = Math.min(80, journey.plan.ministerialConfidence + 8);
      journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 2);
      journey.resources.budget = Math.max(0, journey.resources.budget - 600);
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 1);
      journey.hoursRemaining -= 2;
      applyProtagonistCost(journey, { energy: 8, stress: 7 });
      applyPlanningProfessionalWork(journey, { cpdHours: 1, paperworkLoad: 1, competenceRisk: -1, auditExposure: 1 });

      const gained = journey.plan.ministerialConfidence - previousConfidence;
      const gap = Math.max(0, 80 - journey.plan.ministerialConfidence);
      ui.write(`Briefings improved ministerial confidence by ${gained} points to ${journey.plan.ministerialConfidence}%.`);
      ui.write(`You are ${gap} point${gap === 1 ? '' : 's'} short of the submission threshold.`);
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
      journey.hoursRemaining -= 2;
      applyProtagonistCost(journey, { energy: 5, stress: 4 });
      if (didRenewal) {
        ui.write('Registration renewal paperwork cleared and active status is restored.');
      } else {
        ui.write('Compliance admin caught up CPD records and trimmed the paperwork load.');
      }
      if (chainProgress?.stage) {
        ui.write(`Registration chain advanced to: ${chainProgress.stage}.`);
      }
      break;
    }

    case 'values': {
      // Values workshop with tradeoffs (Phase 4.1). Balanced Approach costs 5h
      // total, so it is only offered when the player can actually afford it —
      // otherwise the nested choice would spend more time than they have.
      const choices = buildValuesWorkshopChoices(journey.hoursRemaining);
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
          journey.values.communityNeeds = Math.min(100, journey.values.communityNeeds + 8);
          journey.values.firstNationsValues = Math.max(0, journey.values.firstNationsValues - 3);
          break;
        case 'fn':
          journey.values.firstNationsValues = Math.min(100, journey.values.firstNationsValues + 8);
          journey.values.communityNeeds = Math.max(0, journey.values.communityNeeds - 3);
          break;
        case 'balanced':
          journey.values.biodiversity = Math.min(100, journey.values.biodiversity + 3);
          journey.values.timberSupply = Math.min(100, journey.values.timberSupply + 3);
          journey.values.communityNeeds = Math.min(100, journey.values.communityNeeds + 3);
          journey.values.firstNationsValues = Math.min(100, journey.values.firstNationsValues + 3);
          journey.hoursRemaining -= 2; // Extra 2h for balanced (total 5h)
          break;
      }

      journey.hoursRemaining -= 3;
      applyProtagonistCost(journey, { energy: 10, stress: 5 });
      applyPlanningProfessionalWork(journey, { cpdHours: 1, paperworkLoad: 1, auditExposure: 1 });
      ui.write('Values workshop completed. Balance updated.');
      break;
    }

    case 'timber':
      // New timber assessment action (Phase 4.1)
      journey.values.timberSupply = Math.min(100, journey.values.timberSupply + 15);
      journey.values.biodiversity = Math.max(0, journey.values.biodiversity - 5);
      journey.hoursRemaining -= 3;
      applyProtagonistCost(journey, { energy: 10, stress: 5 });
      applyPlanningProfessionalWork(journey, { cpdHours: 1, paperworkLoad: 1, auditExposure: 1 });
      ui.write(`Timber supply assessment completed. Timber: ${journey.values.timberSupply}%, Biodiversity: ${journey.values.biodiversity}%`);
      break;

    case 'email': {
      // Quick email check with random effect (Phase 2.3)
      journey.hoursRemaining -= 1;
      applyProtagonistCost(journey, { energy: 3, stress: 2 });
      const roll = Math.random();
      if (roll < 0.3) {
        journey.plan.dataCompleteness = Math.min(100, journey.plan.dataCompleteness + 3);
        ui.write('Useful data attachment in an email. Data completeness +3%.');
      } else if (roll < 0.5) {
        journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 2);
        ui.write('Supportive email from a stakeholder. Political capital +2.');
      } else if (roll < 0.7) {
        applyProtagonistCost(journey, { energy: 0, stress: 5 });
        ui.write('Angry email from a licensee. Stress increased.');
      } else {
        ui.write('Nothing urgent in the inbox.');
      }
      applyPlanningProfessionalWork(journey, { paperworkLoad: 1, auditExposure: 1 });
      break;
    }

    case 'network':
      journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 4);
      journey.hoursRemaining -= 2;
      applyProtagonistCost(journey, { energy: 8, stress: 3 });
      applyPlanningProfessionalWork(journey, { cpdHours: 1, paperworkLoad: 1 });
      if (journey.protagonist) {
        journey.protagonist.reputation = Math.min(100, journey.protagonist.reputation + 2);
      }
      ui.write('Networking successful. Political capital increased.');
      break;

    case 'rest':
      if (journey.protagonist) {
        journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 25);
        journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 15);
      }
      journey.hoursRemaining -= 2;
      applyPlanningProfessionalWork(journey, { auditExposure: -1, competenceRisk: -1 });
      ui.write('You take a break. Feeling refreshed.');
      break;

    default:
      break;
  }

  // Safety net: no single action may push the shift into negative hours.
  // Action costs are gated when options are built, but this guarantees the
  // time economy stays trustworthy even if a new action slips through.
  if (journey.hoursRemaining < 0) {
    journey.hoursRemaining = 0;
  }
}

/**
 * Build the Values Workshop sub-menu. The four single-emphasis options cost
 * the workshop's base 3h; Balanced Approach costs 5h total and is only listed
 * when the player has at least 5h left.
 * @param {number} hoursRemaining
 * @returns {Array<{label: string, description: string, value: string}>}
 */
export function buildValuesWorkshopChoices(hoursRemaining = 0) {
  const choices = [
    { label: 'Emphasize Biodiversity', description: '+8 bio, -3 timber', value: 'bio' },
    { label: 'Emphasize Timber Supply', description: '+8 timber, -3 bio', value: 'timber_v' },
    { label: 'Emphasize Community', description: '+8 community, -3 FN values', value: 'community' },
    { label: 'Emphasize First Nations', description: '+8 FN values, -3 community', value: 'fn' }
  ];

  if (hoursRemaining >= 5) {
    choices.push({ label: 'Balanced Approach (5h total)', description: '+3 all values', value: 'balanced' });
  }

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

  journey.resources.budget = Math.max(0, journey.resources.budget - 750);
  if (journey.plan.phase !== 'ministerial_approval') {
    journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 1);
  }

  const daysRemainingBeforeAdvance = Number.isFinite(journey.deadline)
    ? journey.deadline - journey.day
    : null;
  if (daysRemainingBeforeAdvance !== null && daysRemainingBeforeAdvance <= 4 && journey.plan.phase !== 'ministerial_approval') {
    journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 2);
    if (journey.protagonist) {
      journey.protagonist.stress = Math.min(100, journey.protagonist.stress + 6);
    }
    ui.writeWarning('The cabinet window is closing. Delays are starting to cost political support.');
  }

  const fom = journey.blockPlanning?.fom;
  if (fom?.status === 'public_review') {
    fom.reviewDaysRemaining = Math.max(
      0,
      (fom.reviewDaysRemaining || 0) - FOM_CALENDAR_DAYS_PER_PLANNING_DAY,
    );
    if (fom.reviewDaysRemaining <= 0) {
      if (fom.commentLoad <= FOM_PUBLIC_REVIEW_COMMENT_LIMIT && fom.waterGate !== 'hold') {
        fom.status = 'approved';
        fom.commentLoad = 0;
        fom.approvedDay = journey.day + 1;
        ui.writePositive('Forest Operations Map cleared public review.');
      } else {
        fom.status = 'revision_required';
        fom.revisionNotes = fom.waterGate === 'hold'
          ? 'Working-around-water timing comments still need a revision.'
          : 'Public comments require one more revision pass.';
        ui.writeWarning(`Forest Operations Map needs revisions: ${fom.revisionNotes}`);
      }
    }
  }

  journey.day++;
  journey.hoursRemaining = 8;

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

  ui.write(`Daily planning overhead: -$750${journey.plan.phase !== 'ministerial_approval' ? ', political capital -1' : ''}.`);
}

function checkGameOver(game) {
  const journey = game.journey;

  if (journey.resources.budget <= 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'Budget exhausted';
  }

  if (journey.resources.politicalCapital <= 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'Lost political support';
  }

  if (journey.protagonist && journey.protagonist.stress >= 100) {
    journey.isGameOver = true;
    journey.gameOverReason = 'Burnout - you need to step back from this project';
  }
}
