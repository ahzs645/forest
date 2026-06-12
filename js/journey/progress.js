/**
 * Journey Progress Tracking
 * Progress calculation, milestones, and survey counting
 */

import { JOURNEY_MILESTONES, MILESTONE_COPY } from './constants.js';

export function clampRatio(value) {
  return Math.max(0, Math.min(1, value));
}

export function safeProgressRatio(current, target) {
  if (!Number.isFinite(target) || target <= 0) {
    return 0;
  }
  return clampRatio((Number(current) || 0) / target);
}

function getJourneyMilestoneCopy(journeyType, threshold) {
  return MILESTONE_COPY[journeyType]?.[threshold]
    || MILESTONE_COPY.field?.[threshold]
    || `Reached ${threshold}% of the expedition.`;
}

/**
 * Get journey progress percentage
 * @param {Object} journey - Journey state
 * @returns {number} Progress 0-100
 */
export function getJourneyProgress(journey) {
  return getOperationalProgress(journey);
}

export function getOperationalProgress(journey) {
  switch (journey?.journeyType) {
    case 'recon':
    case 'field': {
      const totalBlocks = journey?.blocks?.length || 0;
      if (totalBlocks > 0) {
        return Math.round(safeProgressRatio(getSurveyedBlockCount(journey), totalBlocks) * 100);
      }
      if (!journey?.totalDistance) {
        return 0;
      }
      return Math.round(safeProgressRatio(journey.distanceTraveled, journey.totalDistance) * 100);
    }

    case 'silviculture': {
      const plantingRatio = safeProgressRatio(journey?.planting?.blocksPlanted, journey?.planting?.blocksToPlant);
      const surveyRatio = safeProgressRatio(journey?.surveys?.freeGrowingComplete, journey?.surveys?.freeGrowingTarget);
      const brushingRatio = safeProgressRatio(journey?.brushing?.hectaresComplete, journey?.brushing?.hectaresTarget);
      return Math.round((plantingRatio * 0.65 + surveyRatio * 0.25 + brushingRatio * 0.10) * 100);
    }

    case 'planning': {
      const plan = journey?.plan || {};
      const phaseProgress = [
        safeProgressRatio(plan.dataCompleteness, 80),
        safeProgressRatio(plan.analysisQuality, 80),
        safeProgressRatio(plan.stakeholderBuyIn, 75),
        safeProgressRatio(plan.ministerialConfidence, 80)
      ];
      return Math.round((phaseProgress.reduce((sum, value) => sum + value, 0) / phaseProgress.length) * 100);
    }

    case 'permitting':
    case 'desk':
      return Math.round(safeProgressRatio(journey?.permits?.approved, journey?.permits?.target) * 100);

    case 'manager': {
      // The GM's term is mostly time served, partly how healthy the company
      // looks while serving it: 60% term progress, 40% average metric health.
      const termRatio = safeProgressRatio(journey?.day, journey?.deadline);
      const metricValues = Object.values(journey?.metrics || {})
        .filter((value) => Number.isFinite(value));
      const metricRatio = metricValues.length
        ? clampRatio(metricValues.reduce((sum, value) => sum + value, 0) / metricValues.length / 100)
        : 0;
      return Math.round(clampRatio(termRatio * 0.6 + metricRatio * 0.4) * 100);
    }

    default:
      return 0;
  }
}

export function recordProgressMilestones(journey, previousProgress, messages = [], dayNumber = journey?.day) {
  if (!journey) {
    return [];
  }

  const currentProgress = getOperationalProgress(journey);
  if (!journey.milestonesReached) {
    journey.milestonesReached = [];
  }
  if (!journey.log) {
    journey.log = [];
  }

  const reached = [];
  for (const threshold of JOURNEY_MILESTONES) {
    if (previousProgress >= threshold || currentProgress < threshold || journey.milestonesReached.includes(threshold)) {
      continue;
    }

    journey.milestonesReached.push(threshold);
    journey.log.push({
      day: dayNumber,
      type: 'milestone',
      threshold,
      summary: `Reached ${threshold}% of the expedition`
    });
    messages.push(`*** MILESTONE: ${getJourneyMilestoneCopy(journey.journeyType, threshold)} ***`);
    reached.push(threshold);
  }

  return reached;
}

/**
 * Get the number of blocks that have been visited/surveyed so far.
 * @param {Object} journey - Journey state
 * @returns {number} Count of surveyed blocks
 */
export function getSurveyedBlockCount(journey) {
  const totalBlocks = journey?.blocks?.length || 0;
  if (!totalBlocks) return 0;

  if (journey?.journeyType === 'recon' && Number.isFinite(journey?.blocksAssessed)) {
    return Math.min(totalBlocks, Math.max(0, Number(journey.blocksAssessed) || 0));
  }

  const currentIndex = Math.max(0, Number(journey?.currentBlockIndex || 0));
  const trackedBlocks = Math.max(0, Number(journey?.blocksAssessed || 0));
  return Math.min(totalBlocks, Math.max(trackedBlocks, currentIndex + 1));
}
