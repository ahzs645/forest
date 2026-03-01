/**
 * Planning Block Intelligence
 * Provides real-data block options for strategic planning mode.
 */

import blockOptionsData from './json/planning/blockOptions.json';

const DEFAULT_CADENCE_DAYS = 3;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomizeCopy(items = []) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getPlanningCadenceDays() {
  const cadence = Number(blockOptionsData?.cadenceDays);
  return Number.isFinite(cadence) && cadence > 0 ? cadence : DEFAULT_CADENCE_DAYS;
}

export function getPlanningAreaBlockPool(areaId) {
  return blockOptionsData?.areas?.[areaId]?.options || [];
}

export function getPlanningBlockById(areaId, blockId) {
  const pool = getPlanningAreaBlockPool(areaId);
  return pool.find((block) => block.id === blockId) || null;
}

/**
 * Pick a fresh set of candidate block options for the player's area.
 * Prioritizes unseen blocks, then allows repeats when exhausted.
 */
export function pickPlanningBlockOptions(areaId, historyIds = [], count = 3) {
  const pool = getPlanningAreaBlockPool(areaId);
  if (!pool.length) return [];

  const historySet = new Set(historyIds);
  const unseen = pool.filter((block) => !historySet.has(block.id));
  const seen = pool.filter((block) => historySet.has(block.id));

  const rankedUnseen = randomizeCopy(unseen).sort((a, b) => {
    const aScore = (a?.metrics?.timberOpportunity || 0) + (a?.metrics?.technicalComplexity || 0);
    const bScore = (b?.metrics?.timberOpportunity || 0) + (b?.metrics?.technicalComplexity || 0);
    return bScore - aScore;
  });

  const rankedSeen = randomizeCopy(seen).sort((a, b) => {
    const aScore = (a?.metrics?.biodiversitySensitivity || 0) + (a?.metrics?.firstNationsSensitivity || 0);
    const bScore = (b?.metrics?.biodiversitySensitivity || 0) + (b?.metrics?.firstNationsSensitivity || 0);
    return bScore - aScore;
  });

  return [...rankedUnseen, ...rankedSeen].slice(0, clamp(count, 1, 6));
}

export function summarizePlanningBlock(block) {
  if (!block) return 'No active block';
  const sourceLabel = block.sourceType === 'planned-cutblock' ? 'Planned cutblock' : 'Untreated opening';
  const area = Number(block.areaHa || 0).toFixed(1);
  const timber = Math.round(block?.metrics?.timberOpportunity || 0);
  const eco = Math.round(block?.metrics?.biodiversitySensitivity || 0);
  const fn = Math.round(block?.metrics?.firstNationsSensitivity || 0);
  return `${sourceLabel} ${block.label} (${area} ha) | Timber ${timber} | Eco ${eco} | FN ${fn}`;
}

export function getPlanningDataAttribution() {
  return {
    generatedAt: blockOptionsData?.generatedAt || null,
    sources: blockOptionsData?.sources || {}
  };
}
