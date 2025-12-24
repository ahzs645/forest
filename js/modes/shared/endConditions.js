/**
 * Shared End Conditions
 * Victory and game-over logic for all modes
 */

/**
 * Check end conditions for recon/field journey
 * @param {Object} journey - Journey state
 * @returns {Object|null} End condition result or null
 */
export function checkReconEndConditions(journey) {
  const activeCrewCount = journey.crew?.filter(m => m.isActive).length || 0;

  // No crew left
  if (activeCrewCount === 0) {
    return { gameOver: true, reason: 'All crew members lost' };
  }

  // Victory: Reached destination
  if (journey.distanceTraveled >= journey.totalDistance) {
    return { victory: true, reason: 'Expedition completed!' };
  }

  // Game over: Stranded (no fuel, no food)
  if (journey.resources.fuel <= 0 && journey.resources.food <= 0) {
    return { gameOver: true, reason: 'Stranded with no supplies' };
  }

  return null;
}

/**
 * Check end conditions for silviculture journey
 * @param {Object} journey - Journey state
 * @returns {Object|null} End condition result or null
 */
export function checkSilvicultureEndConditions(journey) {
  const activeCrewCount = journey.crew?.filter(m => m.isActive).length || 0;

  // No crew left (if crew-based)
  if (journey.crew && activeCrewCount === 0) {
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

  // Game over: No contractor capacity
  if (journey.resources.contractorCapacity <= 0 && journey.planting.seedlingsPlanted < journey.planting.seedlingsAllocated) {
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
  if (journey.plan.ministerialConfidence >= 80) {
    return { victory: true, reason: 'Landscape plan approved by Ministry!' };
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
  // Check journey flags first
  if (journey.isGameOver) {
    return { gameOver: true, reason: journey.gameOverReason || 'Operations halted' };
  }

  if (journey.isComplete) {
    return { victory: true, reason: journey.endReason || 'Expedition completed!' };
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

    default:
      return null;
  }
}
