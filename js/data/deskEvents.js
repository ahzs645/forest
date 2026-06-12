/**
 * Desk Events - Random events for desk journey (Planner/Permitter roles)
 * Office-based challenges and crises
 */

// Import data from JSON (Vite handles JSON imports natively)
import eventsData from "./json/desk/events.json" with { type: "json" };
import legacyEventsData from "./json/legacy/deskEvents.json" with { type: "json" };

// Export events
export const DESK_EVENTS = [...eventsData, ...(legacyEventsData || [])];

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
  const { stressModifier = 1, crisisMode = false, typeMultipliers = {} } = modifiers;

  // In crisis mode, negative events more likely
  const crisisMultiplier = crisisMode ? 1.5 : 1;

  // Shuffle before rolling — see selectRandomFieldEvent: file order must not
  // decide which events dominate.
  for (const event of shuffle(events)) {
    const typeMultiplier = Number(typeMultipliers?.[event.type]) || 1;
    let adjustedProb = event.probability * stressModifier * typeMultiplier;
    if (event.severity !== 'positive') {
      adjustedProb *= crisisMultiplier;
    }
    adjustedProb = Math.max(0, Math.min(0.95, adjustedProb));
    if (Math.random() < adjustedProb) {
      return event;
    }
  }

  return null;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
