/**
 * Shared End Conditions
 * Victory and game-over logic for all modes
 */

import { getSurveyedBlockCount } from '../../journey.js';
import { allPackagesFinalized, getPackagesFinalized, getPackageTarget } from '../../journey/packages.js';

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
  // Only the cutblocks need packages; staging lots, camps and bridges are
  // waypoints (js/journey/packages.js). A plain field journey counts stops.
  const isRecon = journey.journeyType === 'recon';
  const totalBlocks = isRecon ? getPackageTarget(journey) : (journey.blocks?.length || 0);
  const surveyedBlocks = isRecon ? getPackagesFinalized(journey) : getSurveyedBlockCount(journey);

  // Victory: objective completed. Every package closed counts even if the crew limps over the line.
  if ((isRecon && allPackagesFinalized(journey))
    || (!isRecon && totalBlocks > 0 && surveyedBlocks >= totalBlocks)
    || (totalBlocks === 0 && journey.distanceTraveled >= journey.totalDistance)) {
    return { victory: true, reason: 'Expedition completed!' };
  }

  // Nobody left in the field. Nobody died — they were flown out, driven out,
  // or walked — but the season cannot be finished from town.
  if (crewBasedMode && activeCrewCount === 0) {
    return { gameOver: true, reason: 'The crew is off the block: nobody left in the field to finish the season' };
  }

  // Game over: Stranded (no fuel, no food)
  if (journey.resources.fuel <= 0 && journey.resources.food <= 0) {
    return { gameOver: true, reason: 'Stranded with no supplies' };
  }

  const lastStopIndex = (journey.blocks?.length || 0) - 1;
  if (totalBlocks > 0 &&
      lastStopIndex >= 0 &&
      journey.currentBlockIndex >= lastStopIndex &&
      surveyedBlocks < totalBlocks &&
      (journey.resources.fuel <= 0 || journey.resources.equipment <= 0)) {
    return { gameOver: true, reason: 'Recon package stalled on the final block with no mobility left' };
  }

  // The layout deadline. Checked last so a package finished on the final
  // day still wins above — but a season that runs past the window loses,
  // the same way every other mode's deadline works. Recon shipped without
  // this branch while the mission pane advertised "Days left", which is why
  // no recon day ever competed with any other day.
  if (Number.isFinite(journey.deadline) && journey.day > journey.deadline) {
    return { gameOver: true, reason: 'The layout deadline passed with blocks still unassessed — the cutting permit goes in without them' };
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
    if (journey.resources.budget > 0 && (journey.metrics.reputation ?? 50) > 40) {
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
