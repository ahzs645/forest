export { FORESTER_ROLES } from "./roles.js";
export { OPERATING_AREAS } from "./operatingAreas.js";
export { ISSUE_LIBRARY } from "./issues.js";
export { CHAINED_ISSUES } from "./chainedIssues.js";
export { ILLEGAL_ACTS } from "./illegalActs.js";
export { MISCHIEF_OPTIONS } from "./mischief.js";
export { GLOSSARY_TERMS } from "./glossary.js";
export { LEGACY_GLOSSARY_TERMS } from "./legacyGlossary.js";
export { LEGACY_ILLEGAL_ACTS } from "./legacyIllegalActs.js";
export { getRoleAreaBriefing, getRoleAreaFinding } from "./roleAreaIntel.js";
export {
  getMinistryProcessHook,
  getRoleMinistryProcessHooks,
  getRoleProcessFailureCatalog,
  MINISTRY_PROCESS_HOOKS as MINISTRY_PROCESS_LIBRARY,
  MINISTRY_PROCESS_FAILURES,
} from "./ministryProcessHooks.js";
export {
  PROFESSIONAL_OBLIGATIONS,
  MINISTRY_PROCESS_HOOKS,
  MINISTRY_PROCESS_FAILURES as REGULATORY_FAILURE_CASEFILES,
  ENFORCEMENT_CASEFILES,
  AREA_COMPLIANCE_PROFILES,
  PAPERWORK_CHAIN_LIBRARY,
  advancePaperworkChain,
  applyProfessionalDrift,
  createProfessionalState,
  ensureProfessionalState,
  getAreaComplianceProfile,
  getIllegalActsCatalog,
  getPaperworkChainProgress,
  getPaperworkChainsForRole,
  getRoleProfessionalContext,
} from "./professionalPractice.js";
export {
  addDiscoveryTags,
  ensureDiscoveryTagState,
  getDiscoveryEventTypeMultipliers,
  getDiscoveryTagDefinition,
  getDiscoveryTagNotes,
  getJourneyDiscoveryTags,
  inferDiscoveryTagsFromAccess,
  inferDiscoveryTagsFromEvent,
  listDiscoveryTagDefinitions,
  upsertDiscoveryTag
} from "./discoveryTags.js";
export {
  getAreaSituationForJourney,
  getAreaSituationMultipliers,
  getAreaSituationSummary
} from "./areaSituations.js";
export {
  formatRoadAssetSummary,
  getPermittingRoadAssetContext,
  getPlanningRoadAssetContext,
  getPlanningRoadObservationJoin,
  getRoadAssetAreaSummary,
  getRoadAssetObservationForBlock,
  getRoadAssetObservations
} from "./roadAssetIntel.js";

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
