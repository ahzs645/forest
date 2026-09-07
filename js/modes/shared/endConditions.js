/**
 * Shared End Conditions
 * Victory and game-over logic for all modes
 */

import { getSurveyedBlockCount } from '../../journey.js';

/**
 * Whether a FOM's public comment period has closed. Older saves recorded the
 * same state as 'approved'; a FOM is published for comment, not approved.
 */
export function isFomCommentPeriodClosed(journey) {
  const status = journey?.blockPlanning?.fom?.status;
  return status === 'closed' || status === 'approved';
}

/**
 * The District Manager decides the FSP and first FOM only when every gate on
 * the file is met — including the FOM's statutory comment period. A file
 * with four green meters and a FOM still in draft is not decidable.
 */
export function isPlanningApprovalReady(journey) {
  const plan = journey?.plan || {};
  return plan.phase === 'ministerial_approval' &&
    (plan.dataCompleteness || 0) >= 80 &&
    (plan.analysisQuality || 0) >= 80 &&
    (plan.stakeholderBuyIn || 0) >= 75 &&
    (plan.ministerialConfidence || 0) >= 80 &&
    isFomCommentPeriodClosed(journey);
}

/**
 * Check end conditions for recon/field journey
 * @param {Object} journey - Journey state
 * @returns {Object|null} End condition result or null
 */
export function checkReconEndConditions(journey) {
  const crewBasedMode = !journey.protagonist;
  const activeCrewCount = journey.crew?.filter(m => m.isActive).length || 0;
  const totalBlocks = journey.blocks?.length || 0;
  const surveyedBlocks = getSurveyedBlockCount(journey);

  // Victory: objective completed. Reaching the destination should count even if the crew limps over the line.
  if ((totalBlocks > 0 && surveyedBlocks >= totalBlocks) || (totalBlocks === 0 && journey.distanceTraveled >= journey.totalDistance)) {
    return { victory: true, reason: 'Expedition completed!' };
  }

  // No crew left
  if (crewBasedMode && activeCrewCount === 0) {
    return { gameOver: true, reason: 'All crew members lost' };
  }

  // Game over: Stranded (no fuel, no food)
  if (journey.resources.fuel <= 0 && journey.resources.food <= 0) {
    return { gameOver: true, reason: 'Stranded with no supplies' };
  }

  if (totalBlocks > 0 &&
      journey.currentBlockIndex >= totalBlocks - 1 &&
      surveyedBlocks < totalBlocks &&
      (journey.resources.fuel <= 0 || journey.resources.equipment <= 0)) {
    return { gameOver: true, reason: 'Recon package stalled on the final block with no mobility left' };
  }

  // The access season closes. Checked last so a package finished on the final
  // day still wins above — but a traverse that runs past the window loses,
  // the same way every other mode's deadline works. Recon shipped without
  // this branch while the mission pane advertised "Days left", which is why
  // no recon day ever competed with any other day.
  if (Number.isFinite(journey.deadline) && journey.day > journey.deadline) {
    return { gameOver: true, reason: 'The access season closed with blocks still unassessed' };
  }

  return null;
}

/**
 * Check end conditions for silviculture journey
 * @param {Object} journey - Journey state
 * @returns {Object|null} End condition result or null
 */
export function checkSilvicultureEndConditions(journey) {
  const crewBasedMode = !journey.protagonist;
  const activeCrewCount = journey.crew?.filter(m => m.isActive).length || 0;

  // No crew left (if crew-based)
  if (crewBasedMode && activeCrewCount === 0) {
    return { gameOver: true, reason: 'All crew members lost' };
  }

  // Victory: this year's blocks planted, this year's declarations in RESULTS
  if (journey.planting.blocksPlanted >= journey.planting.blocksToPlant &&
      journey.surveys.freeGrowingComplete >= journey.surveys.freeGrowingTarget) {
    return { victory: true, reason: 'Planting program delivered and this year\'s free-growing declarations submitted to RESULTS.' };
  }

  // Game over: Budget depleted
  if (journey.resources.budget <= 0) {
    return { gameOver: true, reason: 'Budget exhausted - program cancelled, contractor invoices unpaid' };
  }

  // Game over: No contractor capacity and not enough planting done
  if (journey.resources.contractorCapacity <= 0 &&
      journey.planting.blocksPlanted < journey.planting.blocksToPlant) {
    return { gameOver: true, reason: 'No contractor capacity remaining' };
  }

  // A stalled program must eventually close instead of cycling through radio
  // events forever. Four field months is the outside delivery window when a
  // mode-specific deadline was not authored.
  const programDeadline = Number.isFinite(journey.deadline) ? journey.deadline : 120;
  if (journey.day > programDeadline) {
    return { gameOver: true, reason: 'Silviculture program fell short of its targets' };
  }

  return null;
}

/**
 * Check end conditions for planning journey (protagonist mode)
 * @param {Object} journey - Journey state
 * @returns {Object|null} End condition result or null
 */
export function checkPlanningEndConditions(journey) {
  // Victory: the District Manager approves the FSP and first FOM
  if (isPlanningApprovalReady(journey)) {
    return { victory: true, reason: 'FSP and Forest Operations Map approved by the District Manager.' };
  }

  if (Number.isFinite(journey.deadline) && journey.day > journey.deadline) {
    return { gameOver: true, reason: 'The FSP expired before the replacement was approved.' };
  }

  // Game over: Budget depleted
  if (journey.resources.budget <= 0) {
    return { gameOver: true, reason: 'Budget exhausted' };
  }

  // Game over: District goodwill depleted
  if (journey.resources.politicalCapital <= 0) {
    return { gameOver: true, reason: 'Lost the district\'s goodwill — the file is no longer being read' };
  }

  // Game over: Protagonist burnout (if using protagonist model)
  if (journey.protagonist && journey.protagonist.stress >= 100) {
    return { gameOver: true, reason: 'Burnout - you need to step back from this project' };
  }

  return null;
}

/**
 * Check end conditions for manager journey (protagonist mode)
 * @param {Object} journey - Journey state
 * @returns {Object|null} End condition result or null
 */
export function checkManagerEndConditions(journey) {
  // Victory: the operating year is run with the books solvent and the board onside
  if (journey.day > journey.deadline) {
    if (journey.resources.budget > 0 && (journey.metrics.reputation ?? 50) > 40) {
      return { victory: true, reason: 'The operating year is delivered with the books solvent and the board onside.' };
    } else {
      return { gameOver: true, reason: 'Term ended with poor performance' };
    }
  }

  // Game over: treasury gone
  if (journey.resources.budget <= 0) {
    return { gameOver: true, reason: 'Budget exhausted - the bank calls the covenant and operations halt' };
  }

  // Game over: Poor reputation
  if ((journey.metrics.reputation ?? 50) <= 0) {
    return { gameOver: true, reason: 'Lost all public and board trust' };
  }

  return null;
}

/**
 * Check end conditions for permitting journey (protagonist mode)
 * @param {Object} journey - Journey state
 * @returns {Object|null} End condition result or null
 */
export function checkPermittingEndConditions(journey) {
  // Victory: every permit the season needed is issued
  if (journey.permits.approved >= journey.permits.target) {
    return { victory: true, reason: 'Every permit the season needed is issued.' };
  }

  // Deadline handling
  if (journey.day > journey.deadline) {
    if (journey.permits.approved >= journey.permits.target * 0.8) {
      return { victory: true, reason: 'Deadline reached with enough permits issued to keep the mill supplied' };
    } else {
      return { gameOver: true, reason: 'Failed to meet deadline' };
    }
  }

  // Game over: Budget depleted
  if (journey.resources.budget <= 0) {
    return { gameOver: true, reason: 'Budget exhausted' };
  }

  // Game over: District goodwill gone
  if (journey.resources.politicalCapital <= 0) {
    return { gameOver: true, reason: 'Lost the district\'s goodwill - the licensee pulls you off the file' };
  }

  // Game over: Protagonist burnout (if using protagonist model)
  if (journey.protagonist && journey.protagonist.stress >= 100) {
    return { gameOver: true, reason: 'Burnout - you need medical leave' };
  }

  return null;
}

/**
 * Check end conditions based on journey type
 * @param {Object} journey - Journey state
 * @returns {Object|null} End condition result or null
 */
export function checkEndConditions(journey) {
  if (journey.isComplete) {
    return { victory: true, reason: journey.endReason || 'Expedition completed!' };
  }

  if (journey.isGameOver) {
    return { gameOver: true, reason: journey.gameOverReason || 'Operations halted' };
  }

  // Check by journey type
  switch (journey.journeyType) {
    case 'recon':
    case 'field':
      return checkReconEndConditions(journey);

    case 'silviculture':
      return checkSilvicultureEndConditions(journey);

    case 'planning':
      return checkPlanningEndConditions(journey);

    case 'permitting':
    case 'desk':
      return checkPermittingEndConditions(journey);

    case 'manager':
      return checkManagerEndConditions(journey);

    default:
      return null;
  }
}
