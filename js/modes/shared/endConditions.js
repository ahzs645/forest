/**
 * Shared End Conditions
 * Victory and game-over logic for all modes
 */

import { getSurveyedBlockCount } from '../../journey.js';

export function isPlanningApprovalReady(journey) {
  const plan = journey?.plan || {};
  return plan.phase === 'ministerial_approval' &&
    (plan.dataCompleteness || 0) >= 80 &&
    (plan.analysisQuality || 0) >= 80 &&
    (plan.stakeholderBuyIn || 0) >= 75 &&
    (plan.ministerialConfidence || 0) >= 80;
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

  // Victory: Met regeneration targets
  if (journey.planting.blocksPlanted >= journey.planting.blocksToPlant &&
      journey.surveys.freeGrowingComplete >= journey.surveys.freeGrowingTarget) {
    return { victory: true, reason: 'Regeneration targets achieved!' };
  }

  // Game over: Budget depleted
  if (journey.resources.budget <= 0) {
    return { gameOver: true, reason: 'Budget exhausted - program cancelled' };
  }

  // Game over: No contractor capacity and not enough planting done
  if (journey.resources.contractorCapacity <= 0 &&
      journey.planting.blocksPlanted < journey.planting.blocksToPlant) {
    return { gameOver: true, reason: 'No contractor capacity remaining' };
  }

  return null;
}

/**
 * Check end conditions for planning journey (protagonist mode)
 * @param {Object} journey - Journey state
 * @returns {Object|null} End condition result or null
 */
export function checkPlanningEndConditions(journey) {
  // Victory: Ministerial approval achieved
  if (isPlanningApprovalReady(journey)) {
    return { victory: true, reason: 'Landscape plan approved by Ministry!' };
  }

  if (Number.isFinite(journey.deadline) && journey.day > journey.deadline) {
    return { gameOver: true, reason: 'Cabinet window closed before approval' };
  }

  // Game over: Budget depleted
  if (journey.resources.budget <= 0) {
    return { gameOver: true, reason: 'Budget exhausted' };
  }

  // Game over: Political capital depleted
  if (journey.resources.politicalCapital <= 0) {
    return { gameOver: true, reason: 'Lost political support' };
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
  // Victory: Completed all terms (e.g., 100 days)
  if (journey.day > journey.deadline) {
    if (journey.resources.budget > 0 && (journey.metrics.reputation || 50) > 40) {
      return { victory: true, reason: 'Successfully led the company through the term!' };
    } else {
      return { gameOver: true, reason: 'Term ended with poor performance' };
    }
  }

  // Game over: Budget depleted
  if (journey.resources.budget <= 0) {
    return { gameOver: true, reason: 'Budget exhausted - operations halted' };
  }

  // Game over: Poor reputation
  if ((journey.metrics.reputation || 50) <= 0) {
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
  // Victory: Met permit target
  if (journey.permits.approved >= journey.permits.target) {
    return { victory: true, reason: 'Permit targets achieved!' };
  }

  // Deadline handling
  if (journey.day > journey.deadline) {
    if (journey.permits.approved >= journey.permits.target * 0.8) {
      return { victory: true, reason: 'Deadline reached with acceptable progress' };
    } else {
      return { gameOver: true, reason: 'Failed to meet deadline' };
    }
  }

  // Game over: Budget depleted
  if (journey.resources.budget <= 0) {
    return { gameOver: true, reason: 'Budget exhausted' };
  }

  // Game over: Political capital gone
  if (journey.resources.politicalCapital <= 0) {
    return { gameOver: true, reason: 'Lost political support - removed from position' };
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
