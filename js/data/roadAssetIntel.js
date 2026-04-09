/**
 * Road Asset Intelligence
 * Shared interpretation layer for recce-derived road, crossing, and watershed observations.
 */

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

function clampLevel(value, max = 4) {
  return Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
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

export function getPlanningRoadAssetContext(journey, blockId = null) {
  const directObservation = blockId ? getRoadAssetObservationForBlock(journey, blockId) : null;
  const areaSummary = getRoadAssetAreaSummary(journey);
  if (!directObservation && !areaSummary.hasData) {
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

  const observation = directObservation || areaSummary.primaryObservation;
  const source = directObservation ? "block" : "area";
  const roadLevel = directObservation ? getRoadLevel(directObservation) : areaSummary.maxRoadLevel;
  const crossingLevel = directObservation ? getCrossingLevel(directObservation) : areaSummary.maxCrossingLevel;
  const watershedLevel = directObservation ? getWatershedLevel(directObservation) : areaSummary.maxWatershedLevel;

  const engineeringPressure = clampLevel(roadLevel + (crossingLevel >= 2 ? 1 : 0));
  const hydrologyPressure = clampLevel(watershedLevel + (crossingLevel >= 2 ? 1 : 0));
  const timingPressure = clampLevel(crossingLevel + (watershedLevel >= 2 ? 1 : 0));
  const reviewDays = Math.max(0, Number(engineeringPressure >= 2) + Number(hydrologyPressure >= 3) + Number(timingPressure >= 3));
  const commentLoad = Number(engineeringPressure >= 3) + Number(hydrologyPressure >= 2) + Number(timingPressure >= 3);
  const readinessPenalty = engineeringPressure * 7 + hydrologyPressure * 4 + timingPressure * 3 + (source === "area" ? 2 : 0);
  const rankingPenalty = engineeringPressure * 3 + hydrologyPressure * 2 + timingPressure * 2 + (source === "area" ? 1 : 0);

  const blockerReasons = [];
  if (source === "block" && roadLevel >= 4) {
    blockerReasons.push("observed road condition is still out of service");
  }
  if (source === "block" && crossingLevel >= 3) {
    blockerReasons.push("observed crossing condition is still restricted");
  }

  const summary = summarizeObservation(observation);
  const notePrefix = source === "block" ? "Active block access intel" : "Carry-forward access intel";
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
    note
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
