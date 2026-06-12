/**
 * Journey Display
 * Formatting and summary functions for journey state
 */

import {
  getCurrentBlock,
  getNextBlock,
  getCurrentSegmentLength,
  getDistanceIntoCurrentSegment
} from './blockNav.js';
import { getJourneyProgress } from './progress.js';
import { getActiveCrewCount, getAverageMorale } from '../crew.js';

/**
 * Get detailed progress info for field journey
 * @param {Object} journey - Field journey state
 * @returns {Object} Detailed progress info
 */
export function getFieldProgressInfo(journey) {
  const currentBlock = getCurrentBlock(journey);
  const nextBlock = getNextBlock(journey);

  const segmentLength = getCurrentSegmentLength(journey.blocks, journey.currentBlockIndex);
  const distanceIntoSegment = getDistanceIntoCurrentSegment(journey);
  const distanceToNextBlock = nextBlock ? Math.max(0, segmentLength - distanceIntoSegment) : 0;

  const overallProgress = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
  const blockProgress = segmentLength > 0
    ? Math.round((distanceIntoSegment / segmentLength) * 100)
    : 100;

  return {
    overallProgress,
    distanceTraveled: journey.distanceTraveled,
    totalDistance: journey.totalDistance,
    currentBlock: currentBlock?.name || 'Unknown',
    nextBlock: nextBlock?.name || 'Destination',
    distanceToNextBlock: Math.round(distanceToNextBlock * 10) / 10,
    blocksCompleted: journey.currentBlockIndex,
    totalBlocks: journey.blocks.length,
    blockProgress: Math.min(100, blockProgress)
  };
}

/**
 * Format journey log for display
 * @param {Object} journey - Journey state
 * @returns {Object[]} Formatted log entries
 */
export function formatJourneyLog(journey) {
  if (!journey.log || journey.log.length === 0) {
    return [];
  }

  const dayLabel = journey.journeyType === 'field' || journey.journeyType === 'recon' ? 'Shift' : 'Day';
  const typeIcons = {
    travel: '→',
    event: '!',
    milestone: '★',
    arrival: '◆'
  };

  return journey.log.map(entry => ({
    day: entry.day,
    dayLabel,
    icon: typeIcons[entry.type] || '·',
    type: entry.type,
    summary: entry.summary || entry.eventTitle || entry.action || 'Unknown',
    detail: entry.optionLabel || entry.weather || ''
  }));
}

/**
 * Get summary of journey status
 * @param {Object} journey - Journey state
 * @returns {Object} Status summary
 */
export function getJourneySummary(journey) {
  if (journey.journeyType === 'field') {
    const block = getCurrentBlock(journey);
    return {
      type: 'field',
      day: journey.day,
      location: block?.name || 'Unknown',
      progress: getJourneyProgress(journey),
      distanceTraveled: journey.distanceTraveled,
      totalDistance: journey.totalDistance,
      weather: journey.weather?.name || 'Unknown',
      crewActive: getActiveCrewCount(journey.crew),
      crewTotal: journey.crew.length,
      morale: Math.round(getAverageMorale(journey.crew))
    };
  } else {
    const hasPermits = Boolean(journey.permits?.target);
    return {
      type: 'desk',
      day: journey.day,
      deadline: journey.deadline,
      daysRemaining: Number.isFinite(journey.deadline) ? journey.deadline - journey.day : null,
      progress: getJourneyProgress(journey),
      permitsApproved: hasPermits ? journey.permits.approved : 0,
      permitsTarget: hasPermits ? journey.permits.target : 0,
      crewActive: getActiveCrewCount(journey.crew),
      crewTotal: journey.crew?.length || 0,
      morale: Math.round(getAverageMorale(journey.crew))
    };
  }
}
