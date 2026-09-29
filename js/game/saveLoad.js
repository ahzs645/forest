/**
 * Run Persistence
 * Saves the active expedition to localStorage at decision checkpoints so a
 * page refresh, tab eviction, or crash never destroys a run. The journey
 * object is plain serializable data by construction (see journey/factory.js).
 *
 * Every read is schema-checked. The save version has stayed at 1 through many
 * schema changes, so a save from an older build (or one damaged by a storage
 * quota or a hand edit) can parse fine and still lack what the resume path
 * dereferences. A save that fails the check is reported as unreadable rather
 * than handed to the game, so boot can offer to discard it instead of
 * blanking the app.
 */

const ACTIVE_RUN_KEY = 'bcft.activeRun.v1';
export const CAMPAIGN_SAVE_KEY = 'bcft.campaign.v1';

const JOURNEY_TYPES = new Set(['recon', 'field', 'silviculture', 'planning', 'permitting', 'desk', 'manager']);
const CAMPAIGN_METRICS = ['progress', 'forestHealth', 'relationships', 'compliance', 'budget'];
const CAMPAIGN_SEASON_COUNT = 4;
const CAMPAIGN_STANCE_COUNT = 3;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCount = (value) => Number.isFinite(value) && value >= 0;

// Containers each deployment type's day runner reads without a guard.
const JOURNEY_SHAPES = {
  recon: { arrays: ['blocks'], objects: [] },
  field: { arrays: ['blocks'], objects: [] },
  silviculture: { arrays: ['blocks', 'contractors'], objects: ['planting', 'brushing', 'surveys'] },
  planning: { arrays: [], objects: ['plan', 'protagonist', 'stakeholders', 'values'] },
  permitting: { arrays: [], objects: ['permits', 'protagonist', 'relationships'] },
  desk: { arrays: [], objects: ['permits', 'stakeholders'] },
  manager: { arrays: [], objects: ['metrics', 'ledger'] },
};

function storage() {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Check a saved journey has everything the resume path touches.
 * @param {*} journey
 * @returns {string|null} what is wrong, or null when it can be resumed
 */
export function validateJourneySave(journey) {
  if (!isObject(journey)) return 'no expedition data';
  if (!JOURNEY_TYPES.has(journey.journeyType)) return 'unknown role';
  if (!Number.isInteger(journey.day) || journey.day < 1) return 'no day on file';
  if (!isObject(journey.resources)) return 'supplies missing';
  if (!Array.isArray(journey.crew) || !journey.crew.every(isObject)) return 'crew missing';

  const shape = JOURNEY_SHAPES[journey.journeyType];
  for (const key of shape.arrays) {
    if (!Array.isArray(journey[key])) return `${key} missing`;
  }
  for (const key of shape.objects) {
    if (!isObject(journey[key])) return `${key} missing`;
  }

  if (journey.journeyType === 'recon' || journey.journeyType === 'field') {
    if (!journey.blocks.length || !journey.blocks.every(isObject)) return 'route missing';
    const index = journey.currentBlockIndex;
    if (!Number.isInteger(index) || index < 0 || index > journey.blocks.length) return 'route position missing';
    if (!isCount(journey.distanceTraveled)) return 'distance missing';
  }
  return null;
}

/**
 * Check a saved campaign year before anything renders from it.
 * @param {*} state
 * @returns {string|null} what is wrong, or null when it can be resumed
 */
export function validateCampaignSave(state) {
  if (!isObject(state)) return 'no campaign data';
  if (state.version !== 1) return 'saved by a different version of the game';
  if (typeof state.crewName !== 'string' || typeof state.areaId !== 'string') return 'crew or area missing';
  // seasonIndex reaches the season count once winter closes; the year-end
  // review replays from there.
  if (!Number.isInteger(state.seasonIndex) || state.seasonIndex < 0 || state.seasonIndex > CAMPAIGN_SEASON_COUNT) {
    return 'season missing';
  }
  if (!isObject(state.yearMetrics) || !CAMPAIGN_METRICS.every((key) => Number.isFinite(state.yearMetrics[key]))) {
    return 'year meters missing';
  }
  for (const key of ['history', 'pendingIssues', 'discoveryTags', 'seasonLog']) {
    if (!Array.isArray(state[key])) return `${key} missing`;
  }
  if (!isObject(state.flags)) return 'flags missing';
  if (!Number.isFinite(state.rngState ?? state.seed)) return 'random seed missing';
  if (state.stanceIndex != null
    && !(Number.isInteger(state.stanceIndex) && state.stanceIndex >= 0 && state.stanceIndex < CAMPAIGN_STANCE_COUNT)) {
    return 'briefing stance missing';
  }
  if (state.activeJourney != null) {
    const problem = validateJourneySave(state.activeJourney);
    if (problem) return `deployment: ${problem}`;
  }
  return null;
}

/**
 * Read a save slot without throwing.
 * @returns {{status: 'empty'}|{status: 'ok', data: *}|{status: 'unreadable', reason: string}}
 */
function readSlot(key, validate) {
  let raw;
  try {
    raw = storage()?.getItem(key);
  } catch {
    return { status: 'empty' };
  }
  if (!raw) return { status: 'empty' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'unreadable', reason: 'the file is damaged' };
  }
  const problem = validate(parsed);
  return problem ? { status: 'unreadable', reason: problem } : { status: 'ok', data: parsed };
}

/**
 * Read the expedition slot.
 * @returns {{status: 'empty'}|{status: 'ok', journey: Object}|{status: 'unreadable', reason: string}}
 */
export function readActiveRun() {
  let campaignDeployment = false;
  const slot = readSlot(ACTIVE_RUN_KEY, (parsed) => {
    if (!isObject(parsed) || parsed.version !== 1) return 'saved by a different version of the game';
    // A campaign deployment belongs to bcft.campaign.v1 — never offer one as
    // a standalone expedition (covers stale saves from older builds).
    if (isObject(parsed.journey) && parsed.journey.campaignStartMetrics) {
      campaignDeployment = true;
      return null;
    }
    return validateJourneySave(parsed.journey);
  });
  if (slot.status !== 'ok') return slot;
  if (campaignDeployment) return { status: 'empty' };
  return { status: 'ok', journey: slot.data.journey };
}

/**
 * Persist the active run. Quietly does nothing when storage is unavailable.
 * @param {Object} journey - Journey state
 */
export function saveActiveRun(journey) {
  if (!journey) return;
  try {
    storage()?.setItem(ACTIVE_RUN_KEY, JSON.stringify({
      version: 1,
      journey,
    }));
  } catch {
    // Private mode / quota — the game plays on without persistence.
  }
}

/**
 * Load the saved run, or null (also for a save that fails the schema check).
 * @returns {Object|null} journey
 */
export function loadActiveRun() {
  const slot = readActiveRun();
  return slot.status === 'ok' ? slot.journey : null;
}

/**
 * Forget the saved run (on completion or deliberate restart).
 */
export function clearActiveRun() {
  try {
    storage()?.removeItem(ACTIVE_RUN_KEY);
  } catch {
    // nothing to clear
  }
}

/**
 * Read the campaign slot.
 * @returns {{status: 'empty'}|{status: 'ok', data: Object}|{status: 'unreadable', reason: string}}
 */
export function readCampaignSave() {
  return readSlot(CAMPAIGN_SAVE_KEY, validateCampaignSave);
}

export function saveCampaignState(state) {
  try {
    storage()?.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(state));
  } catch { /* storage full/unavailable: play on without persistence */ }
}

export function clearCampaignSave() {
  try {
    storage()?.removeItem(CAMPAIGN_SAVE_KEY);
  } catch { /* ignore */ }
}

/**
 * Every save slot that holds something the game cannot resume, with a
 * player-facing name and a way to discard it.
 * @returns {Array<{label: string, reason: string, discard: Function}>}
 */
export function findUnreadableSaves() {
  const found = [];
  const run = readActiveRun();
  if (run.status === 'unreadable') {
    found.push({ label: 'expedition', reason: run.reason, discard: clearActiveRun });
  }
  const campaign = readCampaignSave();
  if (campaign.status === 'unreadable') {
    found.push({ label: 'campaign year', reason: campaign.reason, discard: clearCampaignSave });
  }
  return found;
}
