/**
 * Field Events - Random events for field journey (Recon/Silviculture roles)
 * Oregon Trail-style random encounters
 */

// Import data from JSON (Vite handles JSON imports natively)
import eventsData from './json/field/events.json';
import legacyEventsData from './json/legacy/fieldEvents.json';

// Export events
export const FIELD_EVENTS = [...eventsData, ...(legacyEventsData || [])];

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
 * Select a random event based on probabilities
 * @param {Object[]} events - Pool of possible events
 * @param {Object} modifiers - Probability modifiers
 * @returns {Object|null} Selected event or null
 */
export function selectRandomFieldEvent(events, modifiers = {}) {
  const { paceModifier = 1, terrainModifier = 1 } = modifiers;

  for (const event of events) {
    const adjustedProb = event.probability * paceModifier * terrainModifier;
    if (Math.random() < adjustedProb) {
      return event;
    }
  }

  return null;
}
