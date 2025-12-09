/**
 * Desk Events - Random events for desk journey (Planner/Permitter roles)
 * Office-based challenges and crises
 */

// Import data from JSON
import eventsData from './json/desk/events.json' with { type: 'json' };

// Export events
export const DESK_EVENTS = eventsData;

/**
 * Get events filtered by current phase
 * @param {string} phase - Current desk phase
 * @returns {Object[]} Filtered events
 */
export function getApplicableDeskEvents(phase) {
  // All events are generally applicable
  return DESK_EVENTS;
}

/**
 * Select a random desk event
 * @param {Object[]} events - Pool of possible events
 * @param {Object} modifiers - Probability modifiers
 * @returns {Object|null} Selected event or null
 */
export function selectRandomDeskEvent(events, modifiers = {}) {
  const { stressModifier = 1, crisisMode = false } = modifiers;

  // In crisis mode, negative events more likely
  const crisisMultiplier = crisisMode ? 1.5 : 1;

  for (const event of events) {
    let adjustedProb = event.probability * stressModifier;
    if (event.severity !== 'positive') {
      adjustedProb *= crisisMultiplier;
    }
    if (Math.random() < adjustedProb) {
      return event;
    }
  }

  return null;
}
