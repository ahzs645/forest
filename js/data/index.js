export { FORESTER_ROLES } from "./roles.js";
export { OPERATING_AREAS } from "./operatingAreas.js";
export { ISSUE_LIBRARY } from "./issues.js";
export { ILLEGAL_ACTS } from "./illegalActs.js";
export { GLOSSARY_TERMS } from "./glossary.js";

// Oregon Trail additions - Crew data
export {
  FIRST_NAMES,
  LAST_NAMES,
  FIELD_ROLES,
  DESK_ROLES,
  TRAITS,
  STATUS_EFFECTS,
  DEPARTURE_MESSAGES,
  RECOVERY_MESSAGES
} from "./crewNames.js";

// Oregon Trail additions - Field journey
export {
  FORT_ST_JOHN_BLOCKS,
  MUSKWA_BLOCKS,
  WEATHER_CONDITIONS,
  TEMPERATURE_CATEGORIES,
  TERRAIN_TYPES,
  getBlocksForArea,
  getTotalDistance,
  getRandomWeather,
  getTemperature,
  checkBlockHazards
} from "./blocks.js";

export { FIELD_EVENTS, getApplicableFieldEvents, selectRandomFieldEvent } from "./fieldEvents.js";

// Oregon Trail additions - Desk journey
export { DESK_EVENTS, getApplicableDeskEvents, selectRandomDeskEvent } from "./deskEvents.js";
