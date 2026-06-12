/**
 * Field Events - Random events for field journey (Recon/Silviculture roles)
 * Oregon Trail-style random encounters
 */

// Import data from JSON (Vite handles JSON imports natively)
import eventsData from "./json/field/events.json" with { type: "json" };
import legacyEventsData from "./json/legacy/fieldEvents.json" with { type: "json" };

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
  const { paceModifier = 1, terrainModifier = 1, typeMultipliers = {} } = modifiers;

  // Shuffle before rolling: iterating in file order gives the first events in
  // the JSON an outsized share of triggers across runs.
  for (const event of shuffle(events)) {
    const typeMultiplier = Number(typeMultipliers?.[event.type]) || 1;
    const adjustedProb = event.probability * paceModifier * terrainModifier * typeMultiplier;
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
