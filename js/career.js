/**
 * Career Record
 * Persistent service record for the expedition game (written by the debrief).
 */

const SERVICE_RECORD_KEY = 'bcft.serviceRecord.v1';

export const ROLE_LABELS = {
  recon: 'Recon Crew Lead',
  field: 'Field Crew',
  silviculture: 'Silviculture Supervisor',
  planning: 'Strategic Planner',
  permitting: 'Permitting Specialist',
  desk: 'Desk Team',
  manager: 'General Manager',
};

export const CAREER_LABELS = {
  kmSurveyed: 'Kilometres surveyed',
  seedlingsPlanted: 'Seedlings planted',
  plansApproved: 'Plans approved',
  permitsApproved: 'Permits approved',
  daysInTheChair: 'Days in the chair',
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
