/**
 * Desk Events - Random events for desk journey (Planner/Permitter roles)
 * Office-based challenges and crises
 * Uses weighted pool selection with cooldowns for better variety
 */

// Import data from JSON (Vite handles JSON imports natively)
import eventsData from './json/desk/events.json';
import legacyEventsData from './json/legacy/deskEvents.json';

// Export events
export const DESK_EVENTS = [...eventsData, ...(legacyEventsData || [])];

// Track recently fired events for cooldown
const recentDeskEvents = [];
const DESK_COOLDOWN_SIZE = 4;

/**
 * Get events filtered by current phase
 * @param {string} phase - Current desk phase
 * @returns {Object[]} Filtered events
 */
export function getApplicableDeskEvents(phase) {
  return DESK_EVENTS;
}

/**
 * Select a random desk event using weighted pool (not first-match)
 * @param {Object[]} events - Pool of possible events
 * @param {Object} modifiers - Probability modifiers
 * @returns {Object|null} Selected event or null
 */
export function selectRandomDeskEvent(events, modifiers = {}) {
  const { stressModifier = 1, crisisMode = false } = modifiers;
  const crisisMultiplier = crisisMode ? 1.5 : 1;

  // Filter out events on cooldown
  const available = events.filter(e => !recentDeskEvents.includes(e.id));
  if (available.length === 0) return null;

  // Build weighted pool
  const pool = [];
  let totalWeight = 0;

  for (const event of available) {
    let weight = event.probability * stressModifier;
    if (event.severity !== 'positive') {
      weight *= crisisMultiplier;
    }
    if (weight > 0) {
      pool.push({ event, weight });
      totalWeight += weight;
    }
  }

  if (pool.length === 0 || totalWeight <= 0) return null;

  // Roll to see if any event fires
  const avgProb = totalWeight / pool.length;
  if (Math.random() > avgProb * 2.5) return null;

  // Weighted random selection
  let roll = Math.random() * totalWeight;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) {
      recentDeskEvents.push(entry.event.id);
      if (recentDeskEvents.length > DESK_COOLDOWN_SIZE) {
        recentDeskEvents.shift();
      }
      return entry.event;
    }
  }

  return null;
}

/**
 * Reset event cooldowns (for new game)
 */
export function resetDeskEventCooldowns() {
  recentDeskEvents.length = 0;
}
