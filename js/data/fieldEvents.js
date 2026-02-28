/**
 * Field Events - Random events for field journey (Recon/Silviculture roles)
 * Oregon Trail-style random encounters
 * Uses weighted pool selection with cooldowns for better variety
 */

// Import data from JSON (Vite handles JSON imports natively)
import eventsData from './json/field/events.json';
import legacyEventsData from './json/legacy/fieldEvents.json';

// Export events
export const FIELD_EVENTS = [...eventsData, ...(legacyEventsData || [])];

// Track recently fired events for cooldown (last N event IDs)
const recentFieldEvents = [];
const FIELD_COOLDOWN_SIZE = 5;

/**
 * Get events filtered by conditions
 * @param {Object} conditions - Current conditions (terrain, weather, etc.)
 * @returns {Object[]} Filtered events
 */
export function getApplicableFieldEvents(conditions = {}) {
  return FIELD_EVENTS.filter(event => {
    // Filter by terrain trigger if specified
    if (event.terrainTrigger && conditions.terrain) {
      if (!event.terrainTrigger.includes(conditions.terrain)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Select a random event using weighted pool selection (not first-match)
 * Events on cooldown are excluded from the pool
 * @param {Object[]} events - Pool of possible events
 * @param {Object} modifiers - Probability modifiers
 * @returns {Object|null} Selected event or null
 */
export function selectRandomFieldEvent(events, modifiers = {}) {
  const { paceModifier = 1, terrainModifier = 1 } = modifiers;

  // Filter out events on cooldown
  const available = events.filter(e => !recentFieldEvents.includes(e.id));
  if (available.length === 0) return null;

  // Build weighted pool
  const pool = [];
  let totalWeight = 0;

  for (const event of available) {
    const weight = event.probability * paceModifier * terrainModifier;
    if (weight > 0) {
      pool.push({ event, weight });
      totalWeight += weight;
    }
  }

  if (pool.length === 0 || totalWeight <= 0) return null;

  // Roll against total weight to decide if ANY event fires
  // Use average probability as the threshold
  const avgProb = totalWeight / pool.length;
  if (Math.random() > avgProb * 2.5) return null;

  // Weighted random selection from the pool
  let roll = Math.random() * totalWeight;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) {
      // Add to cooldown
      recentFieldEvents.push(entry.event.id);
      if (recentFieldEvents.length > FIELD_COOLDOWN_SIZE) {
        recentFieldEvents.shift();
      }
      return entry.event;
    }
  }

  return null;
}

/**
 * Reset event cooldowns (for new game)
 */
export function resetFieldEventCooldowns() {
  recentFieldEvents.length = 0;
}
