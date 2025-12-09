/**
 * Crew Name Pools and Role Definitions
 * Names and roles for generating crew members
 */

// Import data from JSON files (Vite handles JSON imports natively)
import namesData from './json/shared/names.json';
import traitsData from './json/shared/traits.json';
import statusEffectsData from './json/shared/statusEffects.json';
import messagesData from './json/shared/messages.json';
import fieldRolesData from './json/field/roles.json';
import deskRolesData from './json/desk/roles.json';

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
