/**
 * Block Navigation
 * Geometric/traversal functions for block-based field journeys
 */

/**
 * Get current block for field journey
 * @param {Object} journey - Field journey state
 * @returns {Object} Current block
 */
export function getCurrentBlock(journey) {
  return journey.blocks[journey.currentBlockIndex] || journey.blocks[0];
}

/**
 * Get next block for field journey
 * @param {Object} journey - Field journey state
 * @returns {Object|null} Next block or null if at end
 */
export function getNextBlock(journey) {
  const nextIndex = journey.currentBlockIndex + 1;
  return journey.blocks[nextIndex] || null;
}

export function getCumulativeDistanceToIndex(blocks, index) {
  let sum = 0;
  for (let i = 0; i <= index && i < blocks.length; i++) {
    sum += blocks[i]?.distance || 0;
  }
  return sum;
}

export function getCurrentSegmentLength(blocks, currentIndex) {
  const nextBlock = blocks[currentIndex + 1];
  return nextBlock?.distance || 0;
}

export function getDistanceIntoCurrentSegment(journey) {
  const blocks = journey.blocks || [];
  const currentIndex = Math.max(0, Math.min(blocks.length - 1, journey.currentBlockIndex || 0));
  const distanceAtCurrentBlock = getCumulativeDistanceToIndex(blocks, currentIndex);
  return Math.max(0, journey.distanceTraveled - distanceAtCurrentBlock);
}

export function advanceBlocksForDistance(journey) {
  const blocks = journey.blocks || [];
  const arrivals = [];

  while (journey.currentBlockIndex < blocks.length - 1) {
    const nextIndex = journey.currentBlockIndex + 1;
    const distanceToNextCumulative = getCumulativeDistanceToIndex(blocks, nextIndex);
    if (journey.distanceTraveled + 1e-6 >= distanceToNextCumulative) {
      journey.currentBlockIndex = nextIndex;
      arrivals.push(blocks[nextIndex]);
      continue;
    }
    break;
  }

  return arrivals;
}

/**
 * Sync block index with total distance traveled
 * @param {Object} journey - Journey state
 * @returns {Object|null} Current block
 */
export function syncBlocksFromDistance(journey) {
  const blocks = journey.blocks || [];
  if (!blocks.length) return null;

  let latestIndex = 0;
  for (let i = 0; i < blocks.length; i++) {
    const distanceToBlock = getCumulativeDistanceToIndex(blocks, i);
    if (journey.distanceTraveled + 1e-6 >= distanceToBlock) {
      latestIndex = i;
      continue;
    }
    break;
  }

  journey.currentBlockIndex = latestIndex;
  return blocks[latestIndex] || blocks[0] || null;
}
