import {
  ensureProfessionalState,
  getAreaSituationForJourney,
  getAreaSituationMultipliers,
  getDiscoveryEventTypeMultipliers,
  getJourneyDiscoveryTags,
  getPaperworkChainProgress,
  getPermittingRoadAssetContext,
  getPlanningAreaSnapshot,
  getPlanningRoadAssetContext,
  getRoleAreaBriefing,
  getRoleProfessionalContext,
} from "../data/index.js";
import { getRoleOperationState } from "./seasonalContract.js";

const SEASON_IDS = ["spring", "summer", "fall", "winter"];
const SEASON_THEMES = ["foundation", "operations", "pressure", "closeout"];

export function getSeasonTheme(round) {
  const index = Math.max(0, Math.min(SEASON_THEMES.length - 1, Number(round || 1) - 1));
  return SEASON_THEMES[index];
}

function getSeasonId(round) {
  const index = Math.max(0, Math.min(SEASON_IDS.length - 1, Number(round || 1) - 1));
  return SEASON_IDS[index];
}

function buildJourneyLikeState(state, season) {
  return {
    ...state,
    roleId: state?.role?.id || state?.roleId || null,
    areaId: state?.area?.id || state?.areaId || null,
    season: {
      currentSeason: season,
    },
  };
}

export function buildSeasonContext(state) {
  const round = Number(state?.round || 1);
  const season = getSeasonId(round);
  const theme = getSeasonTheme(round);
  const roleId = state?.role?.id || state?.roleId || null;
  const area = state?.area || null;
  const areaId = area?.id || state?.areaId || null;

  if (!Array.isArray(state.discoveryTags)) {
    state.discoveryTags = [];
  }

  ensureProfessionalState(state, { roleId, area });
  const journey = buildJourneyLikeState(state, season);
  state.flags = state.flags || {};
  state.flags.professionalAuditActive =
    Number(state.professional?.auditExposure || 0) >= 35
    || Number(state.professional?.competenceRisk || 0) >= 40
    || Number(state.professional?.paperworkLoad || 0) >= 30;
  state.flags.regenReviewNeeded =
    Number(state.metrics?.forestHealth || 50) < 45
    || state.discoveryTags.some((tag) => tag.id === "regen_gap");

  const briefing = roleId && area ? getRoleAreaBriefing(roleId, area, { maxFinds: 6 }) : null;
  const areaSituation = getAreaSituationForJourney(journey);
  const professionalContext = roleId ? getRoleProfessionalContext(roleId, { area }) : null;
  const paperworkProgress = (professionalContext?.chains || [])
    .map((chain) => getPaperworkChainProgress(journey, chain.id))
    .filter(Boolean);
  const planningSnapshot =
    roleId === "planner" || roleId === "permitter"
      ? getPlanningAreaSnapshot(areaId, area)
      : null;
  const planningRoadContext = getPlanningRoadAssetContext(journey);
  const permittingRoadContext = getPermittingRoadAssetContext(journey);
  const discoveryTags = getJourneyDiscoveryTags(journey);
  const operationState = getRoleOperationState(state);

  return {
    round,
    season,
    theme,
    roleId,
    areaId,
    metricPressure: { ...(state?.metrics || {}) },
    briefing,
    areaSituation,
    areaSituationMultipliers: {
      desk: getAreaSituationMultipliers(journey, "desk"),
      field: getAreaSituationMultipliers(journey, "field"),
    },
    professionalContext,
    paperworkProgress,
    planningSnapshot,
    planningRoadContext,
    permittingRoadContext,
    discoveryTags,
    operationState,
    discoveryMultipliers: {
      desk: getDiscoveryEventTypeMultipliers(journey, "desk"),
      field: getDiscoveryEventTypeMultipliers(journey, "field"),
    },
  };
}
