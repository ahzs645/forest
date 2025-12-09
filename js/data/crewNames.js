/**
 * Crew Name Pools and Role Definitions
 * Names and roles for generating crew members
 */

// Import data from JSON files
import namesData from './json/shared/names.json' with { type: 'json' };
import traitsData from './json/shared/traits.json' with { type: 'json' };
import statusEffectsData from './json/shared/statusEffects.json' with { type: 'json' };
import messagesData from './json/shared/messages.json' with { type: 'json' };
import fieldRolesData from './json/field/roles.json' with { type: 'json' };
import deskRolesData from './json/desk/roles.json' with { type: 'json' };

// Export name pools
export const FIRST_NAMES = namesData.firstNames;
export const LAST_NAMES = namesData.lastNames;

// Export roles
export const FIELD_ROLES = fieldRolesData;
export const DESK_ROLES = deskRolesData;

// Export traits and status effects
export const TRAITS = traitsData;
export const STATUS_EFFECTS = statusEffectsData;

// Export messages
export const DEPARTURE_MESSAGES = messagesData.departure;
export const RECOVERY_MESSAGES = messagesData.recovery;
