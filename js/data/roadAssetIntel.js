/**
 * Road Asset Intelligence
 * Shared interpretation layer for recce-derived road, crossing, and watershed observations.
 */

import { getBlocksForArea } from "./blocks.js";

const ROAD_LIFECYCLE_LEVELS = {
  good: 0,
  watch: 1,
  rough: 2,
  repair_needed: 3,
  out_of_service: 4
};

const CROSSING_LEVELS = {
  clear_window: 0,
  timing_sensitive: 1,
  high_water: 2,
  restricted: 3
};

const WATERSHED_LEVELS = {
  low: 0,
  watch: 1,
  elevated: 2,
  critical: 3
};

const ACCESS_AREA_TAGS = new Set(["steep", "remote-camps", "winter-road", "peatland", "glacial"]);
const WATER_AREA_TAGS = new Set(["karst", "salmon", "watershed", "wetland", "community-water"]);
const COMMUNITY_AREA_TAGS = new Set(["community-interface", "visuals"]);
const ACCESS_HAZARDS = new Set([
  "road_damage",
  "grade",
  "bridge_weight",
  "traffic",
  "industrial",
  "bog",
  "subsidence",
  "tire_damage",
  "detour",
  "rough_surface",
  "flood",
  "river_crossing"
]);
const WATER_HAZARDS = new Set([
  "river_crossing",
  "flood",
  "washout",
  "water_intake",
  "erosion",
  "fish_timing"
]);
const WATER_FEATURES = new Set([
  "river",
  "bridge",
  "watershed",
  "community_water",
  "water_intake",
  "salmon_river",
  "salmon_stream",
  "fish_habitat",
  "wetland",
  "wetland_buffer",
  "creek",
  "karst"
]);
const COMMUNITY_FEATURES = new Set([
  "first_nation",
  "cultural_site",
  "culturally_modified_trees",
  "visual_quality_zone",
  "town",
  "viewpoint",
  "ranch"
]);
const SENSITIVE_FEATURES = new Set([
  "old_growth",
  "karst",
  "sensitive_area",
  "caribou_habitat",
  "wetland",
  "wetland_buffer",
  "salmon_river",
  "salmon_stream",
  "fish_habitat",
  "watershed",
  "community_water"
]);
const ACCESS_TERRAINS = new Set(["steep", "hilly", "river", "muskeg", "cutblock"]);
const WINTER_ACCESS_TERRAINS = new Set(["muskeg"]);
const WINTER_ACCESS_HAZARDS = new Set(["bog", "subsidence", "permafrost", "snow"]);

function clampLevel(value, max = 4) {
  return Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}

function getAreaTagSet(journey) {
  return new Set((journey?.area?.tags || []).map(normalizeToken).filter(Boolean));
}

function countMatches(tokens, candidates) {
  let total = 0;
  for (const candidate of candidates) {
    if (tokens.has(candidate)) {
      total += 1;
    }
  }
  return total;
}

function getMonthFromDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCMonth() + 1;
}

function getPlanningJoinProfile(journey, planningBlock) {
  const areaTags = getAreaTagSet(journey);
  const metrics = planningBlock?.metrics || {};
  const indicators = planningBlock?.indicators || {};
  const plannedMonth = getMonthFromDate(planningBlock?.plannedHarvestDate || planningBlock?.approveDate);
  const winterWindow = plannedMonth === 11 || plannedMonth === 12 || plannedMonth === 1 || plannedMonth === 2;

  const accessNeed = clampLevel(
    Number((metrics.technicalComplexity || 0) >= 18)
      + Number((metrics.technicalComplexity || 0) >= 24)
      + Number([...ACCESS_AREA_TAGS].some((tag) => areaTags.has(tag)))
      + Number(winterWindow && areaTags.has("winter-road")),
    3
  );

  const waterNeed = clampLevel(
    Number(Boolean(indicators.ogmaNearby) || Boolean(indicators.whaNoHarvestNearby))
      + Number(Boolean(indicators.speciesAtRiskNearby))
      + Number([...WATER_AREA_TAGS].some((tag) => areaTags.has(tag)))
      + Number(plannedMonth === 3 || plannedMonth === 4 || plannedMonth === 9 || plannedMonth === 10),
    3
  );

  const communityNeed = clampLevel(
    Number((metrics.firstNationsSensitivity || 0) >= 18)
      + Number(Boolean(indicators.firstNationsReserveNearby))
      + Number([...COMMUNITY_AREA_TAGS].some((tag) => areaTags.has(tag))),
    2
  );

  const sensitiveNeed = clampLevel(
    Number((metrics.biodiversitySensitivity || 0) >= 18)
      + Number((metrics.biodiversitySensitivity || 0) >= 28)
      + Number(Boolean(indicators.speciesAtRiskNearby) || Boolean(indicators.ogmaNearby) || Boolean(indicators.whaNoHarvestNearby)),
    3
  );

  const winterNeed = clampLevel(
    Number(areaTags.has("winter-road"))
      + Number(areaTags.has("peatland"))
      + Number(winterWindow),
    2
  );

  return {
    accessNeed,
    waterNeed,
    communityNeed,
    sensitiveNeed,
    winterNeed
  };
}

function getRoadLevel(observation) {
  return ROAD_LIFECYCLE_LEVELS[observation?.roadLifecycleId] ?? 0;
}

function getCrossingLevel(observation) {
  return CROSSING_LEVELS[observation?.crossingConditionId] ?? 0;
}

function getWatershedLevel(observation) {
  return WATERSHED_LEVELS[observation?.watershedPressureId] ?? 0;
}

function summarizeObservation(observation) {
  if (!observation) {
    return "";
  }

  const pieces = [];
  if (observation.roadLifecycleLabel) {
    pieces.push(`road ${String(observation.roadLifecycleLabel).toLowerCase()}`);
  }
  if (observation.crossingConditionLabel) {
    pieces.push(`crossing ${String(observation.crossingConditionLabel).toLowerCase()}`);
  }
  if (observation.watershedPressureLabel) {
    pieces.push(`watershed ${String(observation.watershedPressureLabel).toLowerCase()}`);
  }

  return pieces.join("; ");
}

function getObservationSeverity(observation) {
  if (!observation) {
    return 0;
  }

  return (
    getRoadLevel(observation) * 2 +
    getCrossingLevel(observation) * 2 +
    getWatershedLevel(observation)
  );
}

function sortObservations(observations = []) {
  return [...observations].sort((a, b) => {
    const severityDiff = getObservationSeverity(b) - getObservationSeverity(a);
    if (severityDiff !== 0) return severityDiff;
    const dayDiff = Number(b?.day || 0) - Number(a?.day || 0);
    if (dayDiff !== 0) return dayDiff;
    return String(a?.blockId || "").localeCompare(String(b?.blockId || ""));
  });
}

export function getRoadAssetObservations(journey) {
  const byBlock = journey?.roadAssets?.byBlock || {};
  const observationList = Array.isArray(journey?.roadAssets?.observations)
    ? journey.roadAssets.observations
    : [];

  const merged = [];
  const seen = new Set();

  for (const observation of observationList) {
    if (!observation?.blockId || seen.has(observation.blockId)) continue;
    merged.push(observation);
    seen.add(observation.blockId);
  }

  for (const observation of Object.values(byBlock)) {
    if (!observation?.blockId || seen.has(observation.blockId)) continue;
    merged.push(observation);
    seen.add(observation.blockId);
  }

  return sortObservations(merged);
}

export function getRoadAssetObservationForBlock(journey, blockId) {
  if (!blockId) return null;
  const byBlockObservation = journey?.roadAssets?.byBlock?.[blockId];
  if (byBlockObservation) return byBlockObservation;
  return getRoadAssetObservations(journey).find((observation) => observation.blockId === blockId) || null;
}

function getObservedRouteCandidates(journey) {
  const areaId = journey?.areaId || journey?.area?.id;
  if (!areaId) {
    return [];
  }

  const routeBlocks = getBlocksForArea(areaId);
  const byId = new Map(routeBlocks.map((block) => [block.id, block]));
  return getRoadAssetObservations(journey)
    .map((observation) => ({
      observation,
      routeBlock: byId.get(observation.blockId) || null
    }))
    .filter((entry) => entry.routeBlock);
}

function scorePlanningObservationJoin(profile, observation, routeBlock) {
  const terrain = normalizeToken(routeBlock?.terrain);
  const hazards = new Set((routeBlock?.hazards || []).map(normalizeToken).filter(Boolean));
  const features = new Set((routeBlock?.features || []).map(normalizeToken).filter(Boolean));
  const roadLevel = getRoadLevel(observation);
  const crossingLevel = getCrossingLevel(observation);
  const watershedLevel = getWatershedLevel(observation);

  let score = getObservationSeverity(observation) * 0.5;

  if (profile.accessNeed > 0) {
    score += profile.accessNeed * (
      roadLevel +
      Number(ACCESS_TERRAINS.has(terrain)) +
      Math.min(2, countMatches(hazards, ACCESS_HAZARDS))
    );
  }

  if (profile.waterNeed > 0) {
    score += profile.waterNeed * (
      crossingLevel +
      watershedLevel +
      Math.min(2, countMatches(hazards, WATER_HAZARDS) + countMatches(features, WATER_FEATURES))
    );
  }

  if (profile.communityNeed > 0) {
    score += profile.communityNeed * Math.min(2, countMatches(features, COMMUNITY_FEATURES));
  }

  if (profile.sensitiveNeed > 0) {
    score += profile.sensitiveNeed * Math.min(2, countMatches(features, SENSITIVE_FEATURES));
  }

  if (profile.winterNeed > 0) {
    score += profile.winterNeed * (
      Number(WINTER_ACCESS_TERRAINS.has(terrain)) +
      Math.min(2, countMatches(hazards, WINTER_ACCESS_HAZARDS))
    );
  }

  if (routeBlock?.name && profile.waterNeed > 0 && /bridge|crossing|creek|river/i.test(routeBlock.name)) {
    score += 1;
  }
  if (routeBlock?.name && profile.accessNeed > 0 && /access|road|junction|camp/i.test(routeBlock.name)) {
    score += 1;
  }

  return score;
}

export function getPlanningRoadObservationJoin(journey, planningBlock) {
  if (!journey || !planningBlock) {
    return null;
  }

  const candidates = getObservedRouteCandidates(journey);
  if (!candidates.length) {
    return null;
  }

  const profile = getPlanningJoinProfile(journey, planningBlock);
  const scored = candidates
    .map(({ observation, routeBlock }) => ({
      observation,
      routeBlock,
      score: scorePlanningObservationJoin(profile, observation, routeBlock)
    }))
    .sort((a, b) => b.score - a.score || getObservationSeverity(b.observation) - getObservationSeverity(a.observation));

  const best = scored[0];
  const threshold = profile.accessNeed || profile.waterNeed || profile.communityNeed || profile.sensitiveNeed || profile.winterNeed
    ? 5
    : 7;

  if (!best || best.score < threshold) {
    return null;
  }

  return {
    observation: best.observation,
    routeBlock: best.routeBlock,
    score: best.score,
    profile
  };
}

export function getRoadAssetAreaSummary(journey) {
  const observations = getRoadAssetObservations(journey);
  if (!observations.length) {
    return {
      hasData: false,
      source: "none",
      observationCount: 0,
      primaryObservation: null,
      maxRoadLevel: 0,
      maxCrossingLevel: 0,
      maxWatershedLevel: 0,
      summary: "",
      engineeringPressure: 0,
      hydrologyPressure: 0,
      timingPressure: 0,
      publicReviewPressure: 0,
      dominantProfileId: "package-completeness",
      referralPenalty: 0,
      approvalPenalty: 0
    };
  }

  const primaryObservation = observations[0];
  const maxRoadLevel = Math.max(...observations.map(getRoadLevel));
  const maxCrossingLevel = Math.max(...observations.map(getCrossingLevel));
  const maxWatershedLevel = Math.max(...observations.map(getWatershedLevel));

  const engineeringPressure = clampLevel(maxRoadLevel + (maxCrossingLevel >= 2 ? 1 : 0));
  const hydrologyPressure = clampLevel(maxWatershedLevel + (maxCrossingLevel >= 2 ? 1 : 0));
  const timingPressure = clampLevel(maxCrossingLevel + (maxWatershedLevel >= 2 ? 1 : 0));
  const publicReviewPressure = clampLevel(
    (maxRoadLevel >= 3 ? 1 : 0) +
    (maxWatershedLevel >= 2 ? 1 : 0) +
    (observations.length >= 3 ? 1 : 0)
  );

  let dominantProfileId = "package-completeness";
  if (engineeringPressure >= hydrologyPressure && engineeringPressure >= timingPressure && engineeringPressure > 0) {
    dominantProfileId = "access-engineering";
  } else if (hydrologyPressure >= timingPressure && hydrologyPressure > 0) {
    dominantProfileId = maxWatershedLevel >= 2 ? "community-watershed" : "fish-passage";
  } else if (timingPressure > 0) {
    dominantProfileId = "fish-passage";
  }

  return {
    hasData: true,
    source: "area",
    observationCount: observations.length,
    primaryObservation,
    maxRoadLevel,
    maxCrossingLevel,
    maxWatershedLevel,
    summary: summarizeObservation(primaryObservation),
    engineeringPressure,
    hydrologyPressure,
    timingPressure,
    publicReviewPressure,
    dominantProfileId,
    referralPenalty: engineeringPressure * 0.04 + hydrologyPressure * 0.03 + timingPressure * 0.03,
    approvalPenalty: engineeringPressure * 0.02 + hydrologyPressure * 0.02 + timingPressure * 0.015
  };
}

function resolvePlanningBlock(blockOrId, journey) {
  if (!blockOrId) return null;
  if (typeof blockOrId === "object") return blockOrId;
  const activeBlock = journey?.blockPlanning?.activeBlock;
  if (activeBlock?.id === blockOrId) {
    return activeBlock;
  }
  return null;
}

export function getPlanningRoadAssetContext(journey, blockOrId = null) {
  const planningBlock = resolvePlanningBlock(blockOrId, journey);
  const blockId = typeof blockOrId === "string" ? blockOrId : blockOrId?.id || planningBlock?.id || null;
  const directObservation = blockId ? getRoadAssetObservationForBlock(journey, blockId) : null;
  const joinedObservation = !directObservation && planningBlock
    ? getPlanningRoadObservationJoin(journey, planningBlock)
    : null;
  const areaSummary = getRoadAssetAreaSummary(journey);
  if (!directObservation && !joinedObservation && !areaSummary.hasData) {
    return {
      hasData: false,
      source: "none",
      summary: "",
      engineeringPressure: 0,
      hydrologyPressure: 0,
      timingPressure: 0,
      reviewDays: 0,
      commentLoad: 0,
      readinessPenalty: 0,
      rankingPenalty: 0,
      scrutinyDelta: 0,
      blocker: false,
      blockerReasons: [],
      note: "No road or crossing observations are carrying forward yet."
    };
  }

  const observation = directObservation || joinedObservation?.observation || areaSummary.primaryObservation;
  const source = directObservation ? "block" : joinedObservation ? "joined" : "area";
  const routeBlock = joinedObservation?.routeBlock || null;
  const roadLevel = source === "area" ? areaSummary.maxRoadLevel : getRoadLevel(observation);
  const crossingLevel = source === "area" ? areaSummary.maxCrossingLevel : getCrossingLevel(observation);
  const watershedLevel = source === "area" ? areaSummary.maxWatershedLevel : getWatershedLevel(observation);
  const uncertaintyPenalty = source === "area" ? 2 : source === "joined" ? 1 : 0;

  const engineeringPressure = clampLevel(roadLevel + (crossingLevel >= 2 ? 1 : 0));
  const hydrologyPressure = clampLevel(watershedLevel + (crossingLevel >= 2 ? 1 : 0));
  const timingPressure = clampLevel(crossingLevel + (watershedLevel >= 2 ? 1 : 0));
  const reviewDays = Math.max(0, Number(engineeringPressure >= 2) + Number(hydrologyPressure >= 3) + Number(timingPressure >= 3));
  const commentLoad = Number(engineeringPressure >= 3) + Number(hydrologyPressure >= 2) + Number(timingPressure >= 3);
  const readinessPenalty = engineeringPressure * 7 + hydrologyPressure * 4 + timingPressure * 3 + uncertaintyPenalty;
  const rankingPenalty = engineeringPressure * 3 + hydrologyPressure * 2 + timingPressure * 2 + uncertaintyPenalty;

  const blockerReasons = [];
  if (source === "block" && roadLevel >= 4) {
    blockerReasons.push("observed road condition is still out of service");
  }
  if (source === "block" && crossingLevel >= 3) {
    blockerReasons.push("observed crossing condition is still restricted");
  }

  const summary = summarizeObservation(observation);
  const joinedFromBlockId = source === "joined" ? observation?.blockId || null : null;
  const joinedFromBlockName = source === "joined"
    ? routeBlock?.name || observation?.blockName || observation?.blockId || null
    : null;
  const notePrefix = source === "block"
    ? "Active block access intel"
    : source === "joined"
      ? `Matched recce segment ${joinedFromBlockName || joinedFromBlockId || "route block"}`
      : "Carry-forward access intel";
  const note = summary
    ? `${notePrefix}: ${summary}.`
    : `${notePrefix}: road and crossing issues are still shaping the file.`;

  return {
    hasData: true,
    source,
    observation,
    summary,
    engineeringPressure,
    hydrologyPressure,
    timingPressure,
    reviewDays,
    commentLoad,
    readinessPenalty,
    rankingPenalty,
    scrutinyDelta: Number(roadLevel >= 3) + Number(crossingLevel >= 2) + Number(watershedLevel >= 3),
    blocker: blockerReasons.length > 0,
    blockerReasons,
    note,
    joinedFromBlockId,
    joinedFromBlockName,
    matchScore: joinedObservation?.score || 0,
    routeBlock
  };
}

export function getPermittingRoadAssetContext(journey) {
  const areaSummary = getRoadAssetAreaSummary(journey);
  if (!areaSummary.hasData) {
    return {
      hasData: false,
      summary: "",
      engineering: 0,
      hydrology: 0,
      timing: 0,
      publicReview: 0,
      dominantProfileId: "package-completeness",
      referralPenalty: 0,
      approvalPenalty: 0,
      note: "No road or crossing intel is currently carried on the file."
    };
  }

  const summary = areaSummary.summary;
  return {
    hasData: true,
    summary,
    engineering: areaSummary.engineeringPressure,
    hydrology: areaSummary.hydrologyPressure,
    timing: areaSummary.timingPressure,
    publicReview: areaSummary.publicReviewPressure,
    dominantProfileId: areaSummary.dominantProfileId,
    referralPenalty: areaSummary.referralPenalty,
    approvalPenalty: areaSummary.approvalPenalty,
    note: summary
      ? `Road intel on file: ${summary}.`
      : "Road and crossing observations are adding engineering pressure to the file."
  };
}

export function formatRoadAssetSummary(context) {
  if (!context?.hasData || !context.summary) {
    return "";
  }

  return context.summary;
}
