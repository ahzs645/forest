/**
 * Scheduled Events
 * Handles event scheduling and retrieval by ID
 */

import { isFieldJourney } from './constants.js';
import { FIELD_EVENTS } from '../data/fieldEvents.js';
import { DESK_EVENTS } from '../data/deskEvents.js';

/**
 * Get event by ID
 * Searches the journey-type-matching pool first, then falls back to the other
 * pool — chained events may schedule a follow-up that lives across the divide
 * (e.g. a field discovery whose payoff is a desk decision).
 * @param {string} eventId - Event ID
 * @param {string} journeyType - Journey type
 * @returns {Object|null} Event or null
 */
export function getEventById(eventId, journeyType) {
  const [primary, fallback] = isFieldJourney(journeyType)
    ? [FIELD_EVENTS, DESK_EVENTS]
    : [DESK_EVENTS, FIELD_EVENTS];
  return primary.find(e => e.id === eventId) || fallback.find(e => e.id === eventId) || null;
}

/**
 * Check for any scheduled events that should trigger
 * @param {Object} journey - Journey state
 * @returns {Object|null} Scheduled event or null
 */
export function checkScheduledEvents(journey) {
  if (!journey.scheduledEvents || journey.scheduledEvents.length === 0) {
    return null;
  }

  const index = journey.scheduledEvents.findIndex(se => se.triggerDay <= journey.day);
  if (index === -1) return null;

  const scheduled = journey.scheduledEvents.splice(index, 1)[0];
  return getEventById(scheduled.eventId, journey.journeyType);
}
