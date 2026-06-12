/**
 * Run Persistence
 * Saves the active expedition to localStorage at end-of-day boundaries so a
 * page refresh, tab eviction, or crash never destroys a run. The journey
 * object is plain serializable data by construction (see journey/factory.js).
 */

const ACTIVE_RUN_KEY = 'bcft.activeRun.v1';

/**
 * Persist the active run. Quietly does nothing when storage is unavailable.
 * @param {Object} journey - Journey state
 */
export function saveActiveRun(journey) {
  if (!journey) return;
  try {
    window.localStorage?.setItem(ACTIVE_RUN_KEY, JSON.stringify({
      version: 1,
      journey,
    }));
  } catch {
    // Private mode / quota — the game plays on without persistence.
  }
}

/**
 * Load the saved run, or null.
 * @returns {Object|null} journey
 */
export function loadActiveRun() {
  try {
    const raw = window.localStorage?.getItem(ACTIVE_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !parsed.journey?.journeyType) return null;
    return parsed.journey;
  } catch {
    return null;
  }
}

/**
 * Forget the saved run (on completion or deliberate restart).
 */
export function clearActiveRun() {
  try {
    window.localStorage?.removeItem(ACTIVE_RUN_KEY);
  } catch {
    // nothing to clear
  }
}
