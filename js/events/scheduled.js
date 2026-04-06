/**
 * Scheduled Events
 * Handles event scheduling and retrieval by ID
 */

import { isFieldJourney } from './constants.js';
import { FIELD_EVENTS } from '../data/fieldEvents.js';
import { DESK_EVENTS } from '../data/deskEvents.js';

/**
 * Get event by ID
 * @param {string} eventId - Event ID
 * @param {string} journeyType - Journey type
 * @returns {Object|null} Event or null
 */
export function getEventById(eventId, journeyType) {
  const events = isFieldJourney(journeyType) ? FIELD_EVENTS : DESK_EVENTS;
  return events.find(e => e.id === eventId) || null;
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
