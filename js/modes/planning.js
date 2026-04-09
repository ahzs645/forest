/**
 * Planning Mode Runner
 * Protagonist-based strategic planning for landscape-level forest plans
 * Multi-action days with values tradeoffs
 */

import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
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
} from '../data/planningBlocks.js';
import { isPlanningApprovalReady } from './shared/endConditions.js';
import { getOperationalProgress, recordProgressMilestones } from '../journey.js';
import { getDiscoveryTagNotes, getJourneyDiscoveryTags } from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';

const FOM_PUBLIC_REVIEW_MIN_DAYS = 2;
const FOM_PUBLIC_REVIEW_COMMENT_LIMIT = 2;

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
  return fom;
}

function describeReviewState(fom) {
  if (!fom) return 'Draft';
  switch (fom.status) {
    case 'public_review':
      return `Public review ${Math.max(0, fom.reviewDaysRemaining)}d left`;
    case 'revision_required':
      return 'Revision required';
    case 'approved':
      return 'Approved';
    default:
      return 'Draft';
  }
}

function syncFomStateFromActiveBlock(journey, seasonInfo) {
  const blockPlanning = journey.blockPlanning;
  if (!blockPlanning?.activeBlock) return ensurePlanningFomState(journey);

  const fom = ensurePlanningFomState(journey);
  const waterContext = getPlanningBlockWaterContext(blockPlanning.activeBlock, journey.area, seasonInfo);
  const activeBlockId = blockPlanning.activeBlock.id;

  if (fom.activeBlockId !== activeBlockId) {
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

  if (fom.status === 'draft' && waterContext.gate !== 'clear') {
    fom.commentLoad = Math.max(fom.commentLoad, waterContext.commentCount);
  }

  return fom;
}

function getFomActionLabel(fom) {
  switch (fom?.status) {
    case 'public_review':
      return 'Update FOM Review (2h)';
    case 'revision_required':
      return 'Revise FOM (2h)';
    case 'approved':
      return 'Check FOM Record (1h)';
    default:
      return 'Open FOM Review (2h)';
  }
}

function getFomActionDescription(fom) {
  switch (fom?.status) {
    case 'public_review':
      return `Keep the Forest Operations Map current while public review runs (${Math.max(0, fom.reviewDaysRemaining)}d left).`;
    case 'revision_required':
      return 'Address review comments, especially timing and water notes, then resubmit the map.';
    case 'approved':
      return 'Confirm the map record and keep the submission package aligned.';
    default:
      return 'Publish the Forest Operations Map so the public-review window can open.';
  }
}

export function getPlanningSubmissionReadiness(journey, seasonInfo = null) {
  const fom = syncFomStateFromActiveBlock(journey, seasonInfo);
  const waterContext = getPlanningBlockWaterContext(journey.blockPlanning?.activeBlock, journey.area, seasonInfo);
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

  return {
    ready: reasons.length === 0,
    reasons,
    waterContext,
    fom,
  };
}

/**
 * Run a planning day with multi-action system
 * @param {Object} game - Game instance
 */
export async function runPlanningDay(game) {
  const { ui, journey } = game;
  const seasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;
  const progressBeforeDay = getOperationalProgress(journey);

  // Reset hours for new day
  if (!journey.hoursRemaining || journey.hoursRemaining <= 0) {
    journey.hoursRemaining = 8;
  }

  // Periodic real-data block decision: selected block influences events and values.
  await maybePromptForBlockSelection(game, seasonInfo);

  // Apply daily values consequences (Phase 4.1)
  applyValuesConsequences(journey);

  // Check for event at start of day
  const event = checkForEvent(journey);
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
    await processAction(game, action.value, seasonInfo);

    ui.updateAllStatus(journey);

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
  const phaseNames = {
    data_gathering: 'Data Gathering',
    analysis: 'Analysis',
    stakeholder_review: 'Stakeholder Review',
    ministerial_approval: 'Ministerial Approval'
  };
  const continueLabel = `Continue... (Phase: ${phaseNames[journey.plan.phase] || journey.plan.phase}, Day ${journey.day})`;
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
}

/**
 * Display compact planning header (Phase 6.2)
 */
function displayPlanningHeader(ui, journey, seasonInfo) {
  ui.clear();
  const deadlineLabel = Number.isFinite(journey.deadline)
    ? `DAY ${journey.day} of ${journey.deadline} - STRATEGIC PLANNING`
    : `DAY ${journey.day} - STRATEGIC PLANNING`;
  ui.writeHeader(deadlineLabel);

  if (seasonInfo) {
    ui.write(`${seasonInfo.icon} ${seasonInfo.name} - Year ${seasonInfo.year} | Hours: ${journey.hoursRemaining}h`);
  }
  ui.write('');

  // Protagonist status
  if (journey.protagonist) {
    const energyBar = createBar(journey.protagonist.energy, 10);
    const stressLevel = journey.protagonist.stress > 70 ? 'HIGH' : journey.protagonist.stress > 40 ? 'MODERATE' : 'LOW';
    ui.write(`Energy: [${energyBar}] ${journey.protagonist.energy}% | Stress: ${stressLevel} (${journey.protagonist.stress}%) | Rep: ${journey.protagonist.reputation}`);
  }

  // Phase and plan metrics
  const phaseNames = {
    data_gathering: 'Data Gathering',
    analysis: 'Analysis',
    stakeholder_review: 'Stakeholder Review',
    ministerial_approval: 'Ministerial Approval'
  };
  ui.write(`Phase: ${phaseNames[journey.plan.phase] || journey.plan.phase}`);
  if (Number.isFinite(journey.deadline)) {
    ui.write(`Days Remaining: ${Math.max(0, journey.deadline - journey.day)}`);
  }
  ui.write(`Data: ${journey.plan.dataCompleteness}% | Analysis: ${journey.plan.analysisQuality}% | Buy-in: ${journey.plan.stakeholderBuyIn}% | Confidence: ${journey.plan.ministerialConfidence}%`);
  if (journey.plan.phase === 'ministerial_approval') {
    const gap = Math.max(0, 80 - journey.plan.ministerialConfidence);
    if (gap > 0) {
      ui.write(`Approval gap: ${gap} confidence point${gap === 1 ? '' : 's'}. Use Ministerial Outreach to recover ground before submission.`);
    } else {
      ui.write('Approval threshold reached. A full submission can carry the plan across the line.');
    }
  }

  // Values balance (Phase 4.1 - these now matter)
  ui.write(`Values: Bio ${journey.values.biodiversity}% | Timber ${journey.values.timberSupply}% | Community ${journey.values.communityNeeds}% | FN ${journey.values.firstNationsValues}%`);

  // Resources
  ui.write(`Budget: $${journey.resources.budget.toLocaleString()} | Political Capital: ${journey.resources.politicalCapital} | Data: ${journey.resources.dataCredits}`);
  if (Number.isFinite(journey.scrutiny)) {
    const scrutiny = Math.round(journey.scrutiny);
    const scrutinyLevel = scrutiny > 70 ? 'HIGH' : scrutiny > 40 ? 'MODERATE' : 'LOW';
    ui.write(`Scrutiny: ${scrutiny}% (${scrutinyLevel})`);
  }
  const areaSituation = getAreaSituationSummary(journey);
  if (areaSituation) {
    ui.write(`Area Situation: ${areaSituation}`);
  }
  const discoveryNotes = getDiscoveryTagNotes(journey, journey.roleId || 'planner', 2);
  if (discoveryNotes.length > 0) {
    ui.write(`Carry-forward: ${discoveryNotes.join(' | ')}`);
  }

  const fom = syncFomStateFromActiveBlock(journey, seasonInfo);
  if (fom?.activeBlockId) {
    ui.write(`FOM: ${describeReviewState(fom)} | Water Gate: ${fom.waterGate.toUpperCase()} | ${fom.hydrologyLabel}`);
    ui.write(`Hydrology Readiness: ${Math.round(fom.hydrologyReadiness)}% | ${fom.waterNote}`);
  }

  if (journey.blockPlanning?.activeSummary) {
    ui.write(`Active Block: ${journey.blockPlanning.activeSummary}`);
    if (journey.blockPlanning.nextSelectionDay) {
      ui.write(`Next block review: Day ${journey.blockPlanning.nextSelectionDay}`);
    }
  }
  ui.write('');
}

async function maybePromptForBlockSelection(game, seasonInfo) {
  const { ui, journey } = game;
  const plannerState = journey.blockPlanning;
  if (!plannerState) return;
  if (journey.day < (plannerState.nextSelectionDay || 1)) return;

  displayPlanningHeader(ui, journey, seasonInfo);
  ui.writeHeader('CUTBLOCK PRIORITY DECISION');
  ui.write('Choose how to triage the area constraints before you lock the next block focus.');
  ui.write('');

  const allBlocks = getPlanningAreaBlockPool(journey.areaId);
  const triage = buildPlanningConstraintTriage(journey.areaId, journey.area, allBlocks);
  if (triage.area?.zoneSummary) {
    ui.write(triage.area.zoneSummary);
  }
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
    return {
      label: formatPlanningBlockLabel(block),
      description: formatPlanningBlockPromptDescription(block, journey.area, seasonInfo),
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
  state.activeSummary = summarizePlanningBlock(block, journey.area, triageKey, seasonInfo);
  state.activeEventBias = block.eventBias || null;
  state.history = Array.isArray(state.history) ? [...state.history, block.id].slice(-30) : [block.id];
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

  // Phase-specific primary actions
  if (journey.plan.phase === 'data_gathering' && journey.resources.dataCredits > 0 && hoursLeft >= 3) {
    actionOptions.push({
      label: 'Gather Data (3h)',
      description: 'Compile LiDAR, inventory, and baseline data',
      value: 'gather_data'
    });
  }

  if (journey.plan.phase === 'analysis' && hoursLeft >= 4) {
    actionOptions.push({
      label: 'Run Analysis (4h)',
      description: 'Spatial analysis and modeling',
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
        description: 'Host consultation session',
        value: 'stakeholder'
      });
    } else {
      actionOptions.push({
        label: 'Stakeholder Session (BLOCKED)',
        description: `Needs: ${formatValuesGateDeficits(deficits)}`,
        value: 'stakeholder_blocked'
      });
    }
  }

  if (journey.plan.phase === 'ministerial_approval' && hoursLeft >= 6) {
    const deficits = getValuesGateDeficits(journey);
    const valuesOk = deficits.length === 0;
    const submissionReadiness = getPlanningSubmissionReadiness(journey, seasonInfo);
    if (valuesOk && submissionReadiness.ready) {
      actionOptions.push({
        label: 'Prepare Submission (6h)',
        description: 'Fastest approval push (+18 confidence) after the FOM clears public review and water comments.',
        value: 'submit'
      });
    } else {
      actionOptions.push({
        label: 'Prepare Submission (BLOCKED)',
        description: `Needs: ${[formatValuesGateDeficits(deficits), ...submissionReadiness.reasons].filter(Boolean).join(' | ')}`,
        value: 'submit_blocked'
      });
    }
  }

  if (journey.plan.phase === 'ministerial_approval' && hoursLeft >= 2 && journey.plan.ministerialConfidence < 78) {
    actionOptions.push({
      label: 'Ministerial Outreach (2h)',
      description: 'Brief decision-makers and recover confidence up to 78%',
      value: 'outreach'
    });
  }

  if (journey.blockPlanning?.activeBlock && hoursLeft >= 2) {
    actionOptions.push({
      label: getFomActionLabel(fom),
      description: getFomActionDescription(fom),
      value: 'fom_review'
    });
  }

  // Values workshop - now with tradeoffs (Phase 4.1)
  if (hoursLeft >= 3) {
    actionOptions.push({
      label: 'Values Workshop (3h)',
      description: 'Balance competing interests (tradeoffs required)',
      value: 'values'
    });
  }

  // Timber assessment (new - Phase 4.1)
  if (hoursLeft >= 3) {
    actionOptions.push({
      label: 'Timber Assessment (3h)',
      description: 'Assess timber supply (+timber, -biodiversity)',
      value: 'timber'
    });
  }

  // Quick actions (Phase 2.3)
  if (hoursLeft >= 1) {
    actionOptions.push({
      label: 'Check Email (1h)',
      description: 'Handle correspondence (random small effect)',
      value: 'email'
    });
  }

  if (hoursLeft >= 2) {
    actionOptions.push({
      label: 'Network (2h)',
      description: 'Build political capital',
      value: 'network'
    });
  }

  if (hoursLeft >= 2 && journey.protagonist) {
    actionOptions.push({
      label: 'Take a Break (2h)',
      description: 'Reduce stress, recover energy',
      value: 'rest'
    });
  }

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
async function processAction(game, actionValue, seasonInfo = null) {
  const { ui, journey } = game;
  const discoveryTags = getJourneyDiscoveryTags(journey);
  const discoveryIds = new Set(discoveryTags.map((tag) => tag.id));

  switch (actionValue) {
    case 'gather_data':
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
      ui.write(`Data gathering progressed. Completeness: ${journey.plan.dataCompleteness}%`);
      if (journey.plan.dataCompleteness >= 80) {
        journey.plan.phase = 'analysis';
        ui.writePositive('Data phase complete! Moving to Analysis.');
      }
      break;

    case 'analyze':
      journey.plan.analysisQuality = Math.min(100, journey.plan.analysisQuality + 15);
      if (discoveryTags.length > 0) {
        const bonus = Math.min(4, discoveryTags.length * 2);
        journey.plan.analysisQuality = Math.min(100, journey.plan.analysisQuality + bonus);
        ui.write(`Existing ground intel tightened the analysis (+${bonus}).`);
      }
      journey.resources.budget = Math.max(0, journey.resources.budget - 700);
      journey.hoursRemaining -= 4;
      applyProtagonistCost(journey, { energy: 15, stress: 12 });
      ui.write(`Analysis progressed. Quality: ${journey.plan.analysisQuality}%`);
      if (journey.plan.analysisQuality >= 80) {
        journey.plan.phase = 'stakeholder_review';
        ui.writePositive('Analysis complete! Moving to Stakeholder Review.');
      }
      break;

    case 'stakeholder':
      journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 10);
      if (discoveryIds.has('community_visibility') || discoveryIds.has('cultural_hold') || discoveryIds.has('watershed_watch')) {
        journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 2);
        ui.write('Concrete field findings gave the stakeholder session more weight (+2 buy-in).');
      }
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 6);
      journey.resources.budget = Math.max(0, journey.resources.budget - 700);
      journey.hoursRemaining -= 4;
      applyProtagonistCost(journey, { energy: 20, stress: 16 });
      if (journey.protagonist) {
        journey.protagonist.reputation = Math.min(100, journey.protagonist.reputation + 3);
      }
      ui.write(`Stakeholder buy-in improved to ${journey.plan.stakeholderBuyIn}%`);
      if (journey.plan.stakeholderBuyIn >= 75) {
        journey.plan.phase = 'ministerial_approval';
        ui.writePositive('Stakeholder review complete! Moving to Ministerial Approval.');
      }
      break;

    case 'stakeholder_blocked':
    case 'submit_blocked': {
      const submissionReadiness = getPlanningSubmissionReadiness(journey, seasonInfo);
      ui.writeWarning(`Cannot proceed. Recover these values first: ${formatValuesGateDeficits(getValuesGateDeficits(journey))}.`);
      if (submissionReadiness.reasons.length > 0) {
        ui.write(`Planning gate: ${submissionReadiness.reasons.join(' | ')}.`);
      }
      ui.write('Use Values Workshop, Timber Assessment, or FOM Review to rebalance.');
      break;
    }

    case 'submit':
      {
        const submissionReadiness = getPlanningSubmissionReadiness(journey, seasonInfo);
        if (!submissionReadiness.ready) {
          ui.writeWarning(`Submission blocked: ${submissionReadiness.reasons.join(' | ')}.`);
          break;
        }
        const confidenceGain = submissionReadiness.waterContext.gate === 'clear' ? 18 : 14;
        journey.plan.ministerialConfidence = Math.min(100, journey.plan.ministerialConfidence + confidenceGain);
      }
      journey.hoursRemaining -= 6;
      journey.resources.budget = Math.max(0, journey.resources.budget - 2200);
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 2);
      applyProtagonistCost(journey, { energy: 25, stress: 20 });
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
      if (fom.status === 'approved') {
        journey.hoursRemaining -= 1;
        applyProtagonistCost(journey, { energy: 3, stress: 2 });
        ui.write('Forest Operations Map record checked. The approved review file stays in place.');
        break;
      }

      const waterContext = getPlanningBlockWaterContext(activeBlock, journey.area, seasonInfo);
      const reviewCost = 2;
      fom.status = 'public_review';
      fom.reviewDaysRemaining = Math.max(fom.reviewDaysRemaining || 0, waterContext.reviewDays, FOM_PUBLIC_REVIEW_MIN_DAYS);
      fom.commentLoad = Math.max(fom.commentLoad || 0, waterContext.commentCount);
      fom.publicReviewOpenedDay = journey.day;
      fom.lastUpdatedDay = journey.day;
      fom.hydrologyReadiness = waterContext.readiness;
      fom.waterGate = waterContext.gate;
      fom.waterNote = waterContext.note;
      fom.hydrologyLabel = waterContext.hydrologyLabel;

      journey.hoursRemaining -= reviewCost;
      applyProtagonistCost(journey, { energy: 6, stress: 5 });

      ui.write(`Forest Operations Map posted for public review.`);
      ui.write(`Review window: ${fom.reviewDaysRemaining} day${fom.reviewDaysRemaining === 1 ? '' : 's'} | ${fom.waterNote}`);
      break;
    }

    case 'outreach': {
      const previousConfidence = journey.plan.ministerialConfidence;
      journey.plan.ministerialConfidence = Math.min(78, journey.plan.ministerialConfidence + 8);
      journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 2);
      journey.resources.budget = Math.max(0, journey.resources.budget - 600);
      journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 1);
      journey.hoursRemaining -= 2;
      applyProtagonistCost(journey, { energy: 8, stress: 7 });

      const gained = journey.plan.ministerialConfidence - previousConfidence;
      const gap = Math.max(0, 80 - journey.plan.ministerialConfidence);
      ui.write(`Briefings improved ministerial confidence by ${gained} points to ${journey.plan.ministerialConfidence}%.`);
      ui.write(`You are ${gap} point${gap === 1 ? '' : 's'} short of the submission threshold.`);
      break;
    }

    case 'values': {
      // Values workshop with tradeoffs (Phase 4.1)
      const choices = [
        { label: 'Emphasize Biodiversity', description: '+8 bio, -3 timber', value: 'bio' },
        { label: 'Emphasize Timber Supply', description: '+8 timber, -3 bio', value: 'timber_v' },
        { label: 'Emphasize Community', description: '+8 community, -3 FN values', value: 'community' },
        { label: 'Emphasize First Nations', description: '+8 FN values, -3 community', value: 'fn' },
        { label: 'Balanced Approach (5h total)', description: '+3 all values', value: 'balanced' }
      ];
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
      ui.write('Values workshop completed. Balance updated.');
      break;
    }

    case 'timber':
      // New timber assessment action (Phase 4.1)
      journey.values.timberSupply = Math.min(100, journey.values.timberSupply + 15);
      journey.values.biodiversity = Math.max(0, journey.values.biodiversity - 5);
      journey.hoursRemaining -= 3;
      applyProtagonistCost(journey, { energy: 10, stress: 5 });
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
      break;
    }

    case 'network':
      journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 4);
      journey.hoursRemaining -= 2;
      applyProtagonistCost(journey, { energy: 8, stress: 3 });
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
      ui.write('You take a break. Feeling refreshed.');
      break;

    default:
      break;
  }
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
    fom.reviewDaysRemaining = Math.max(0, (fom.reviewDaysRemaining || 0) - 1);
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

async function handleEvent(game, event) {
  const { ui, journey } = game;
  const formatted = formatEventForDisplay(event, journey.journeyType);

  ui.write('');
  ui.writeHeader(`EVENT: ${formatted.title}`);
  ui.write(formatted.description);
  ui.write('');

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

function createBar(value, width) {
  const filled = Math.round((value / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
