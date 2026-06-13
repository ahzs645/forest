/**
 * Career Record
 * The one persistent profile both games share. Expedition runs (via the
 * debrief), seasonal years, and crisis-command incidents all land in the same
 * localStorage record, so a player's history follows them across modes —
 * and each game can tip its hat to experience earned in the other.
 */

import { getLetterGrade } from './scoring.js';

const SERVICE_RECORD_KEY = 'bcft.serviceRecord.v1';

export const ROLE_LABELS = {
  recon: 'Recon Crew Lead',
  field: 'Field Crew',
  silviculture: 'Silviculture Supervisor',
  planning: 'Strategic Planner',
  permitting: 'Permitting Specialist',
  desk: 'Desk Team',
  manager: 'General Manager',
  seasonal: 'Seasonal Strategist',
  'crisis-command': 'Incident Commander',
};

export const CAREER_LABELS = {
  kmSurveyed: 'Kilometres surveyed',
  seedlingsPlanted: 'Seedlings planted',
  plansApproved: 'Plans approved',
  permitsApproved: 'Permits approved',
  daysInTheChair: 'Days in the chair',
  yearsCompleted: 'Seasonal years completed',
  incidentsCommanded: 'Incidents commanded',
};

export function loadServiceRecord() {
  try {
    const raw = window.localStorage?.getItem(SERVICE_RECORD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveServiceRecord(record) {
  try {
    const { isBest, ...persisted } = record;
    window.localStorage?.setItem(SERVICE_RECORD_KEY, JSON.stringify(persisted));
  } catch {
    // Storage unavailable (private mode, node tests) — play continues.
  }
}

/**
 * Fold a finished run into a service record under the given bucket.
 * Pure: returns a new record. `isBest` marks a new personal best.
 * @param {Object|null} record - Existing record or null
 * @param {string} bucket - byRole key (journey type, 'seasonal', 'crisis-command')
 * @param {{score: number, grade: string, victory: boolean}} result
 * @param {Object} [careerDeltas] - counters to add to record.career
 * @returns {Object}
 */
export function foldRunIntoRecord(record, bucket, result, careerDeltas = {}) {
  const next = {
    runs: (record?.runs || 0) + 1,
    byRole: { ...(record?.byRole || {}) },
    career: { ...(record?.career || {}) },
  };

  const prev = next.byRole[bucket] || { runs: 0, victories: 0, bestScore: -1, bestGrade: null };
  const isBest = result.score > prev.bestScore;
  next.byRole[bucket] = {
    runs: prev.runs + 1,
    victories: prev.victories + (result.victory ? 1 : 0),
    bestScore: isBest ? result.score : prev.bestScore,
    bestGrade: isBest ? result.grade : prev.bestGrade,
  };

  for (const [key, delta] of Object.entries(careerDeltas)) {
    if (typeof delta === 'number' && delta !== 0) {
      next.career[key] = (next.career[key] || 0) + delta;
    }
  }

  return { ...next, isBest };
}

/**
 * Score a finished seasonal year (or crisis run) from its final metrics:
 * the average of the five 0-100 metrics.
 * @param {Object} metrics
 * @returns {number} 0-100
 */
export function scoreFromMetrics(metrics = {}) {
  const values = Object.values(metrics).filter((v) => typeof v === 'number');
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * Record a completed seasonal year. Persists and returns the updated record.
 * @param {Object} gs - Seasonal game state (metrics, gameMode)
 * @param {boolean} strongEnding - Did the year end strongly?
 * @returns {Object} updated record
 */
export function recordSeasonalYear(gs, strongEnding) {
  const bucket = gs?.gameMode === 'crisis-command' ? 'crisis-command' : 'seasonal';
  const score = scoreFromMetrics(gs?.metrics);
  const result = { score, grade: getLetterGrade(score), victory: Boolean(strongEnding) };
  const deltas = bucket === 'seasonal' ? { yearsCompleted: 1 } : { incidentsCommanded: 1 };
  const updated = foldRunIntoRecord(loadServiceRecord(), bucket, result, deltas);
  saveServiceRecord(updated);
  return updated;
}

/**
 * What the other game should know about this player.
 * @returns {{expeditionWins: number, seasonalYears: number, totalRuns: number}}
 */
export function getCareerSnapshot() {
  const record = loadServiceRecord();
  if (!record) return { expeditionWins: 0, seasonalYears: 0, totalRuns: 0 };
  const expeditionBuckets = ['recon', 'field', 'silviculture', 'planning', 'permitting', 'desk', 'manager'];
  const expeditionWins = expeditionBuckets.reduce(
    (sum, key) => sum + (record.byRole?.[key]?.victories || 0), 0);
  return {
    expeditionWins,
    seasonalYears: record.byRole?.seasonal?.runs || 0,
    totalRuns: record.runs || 0,
  };
}
