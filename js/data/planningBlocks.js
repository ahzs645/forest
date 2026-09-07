/**
 * Planning Block Intelligence
 * Provides real-data block options for strategic planning mode.
 */

import blockOptionsData from "./json/planning/blockOptions.json" with { type: "json" };

const DEFAULT_CADENCE_DAYS = 3;
const WATER_TIMING_SEASONS = new Set(["spring", "fall"]);
const WATER_HYDROLOGY_TAGS = new Set(["karst", "salmon", "watershed", "wetland", "community-water"]);
const PLANNING_TRIAGE_PROFILES = {
  access: {
    label: "Access first",
    description: "Favor the cleaner ground and lower engineering lift. You give up some upside to avoid rework and access surprises.",
    scrutinyDelta: -1,
    weights: {
      technicalComplexity: -1.8,
      timberOpportunity: 0.2,
      biodiversitySensitivity: -0.1,
      firstNationsSensitivity: -0.1,
    },
  },
  water: {
    label: "Water and ecology first",
    description: "Favor the wetter, fishier, or more habitat-sensitive pieces getting the slower pass. Stronger defensibility, narrower volume pick.",
    scrutinyDelta: -2,
    weights: {
      technicalComplexity: -0.4,
      timberOpportunity: 0.1,
      biodiversitySensitivity: -1.7,
      firstNationsSensitivity: -0.2,
    },
  },
  community: {
    label: "Engagement-led sequencing",
    description: "Lead with the blocks where engagement with the Nations is furthest along and the heritage screen is clean. Slower on volume, defensible on the record.",
    scrutinyDelta: -2,
    weights: {
      technicalComplexity: -0.2,
      timberOpportunity: 0.1,
      biodiversitySensitivity: -0.2,
      firstNationsSensitivity: -1.7,
    },
  },
  timber: {
    label: "Timber first",
    description: "Favor the stronger volume blocks. Faster supply gain, but you knowingly accept a harder follow-up and more scrutiny.",
    scrutinyDelta: 2,
    weights: {
      technicalComplexity: 0.25,
      timberOpportunity: 1.8,
      biodiversitySensitivity: -0.1,
      firstNationsSensitivity: -0.1,
    },
  },
};

const PLANNING_TRIAGE_ORDER = ["access", "water", "community", "timber"];
const ACCESS_AREA_TAGS = new Set(["steep", "remote-camps", "winter-road", "peatland", "glacial"]);
const WATER_AREA_TAGS = new Set(["karst", "salmon", "watershed", "wetland", "community-water"]);
const COMMUNITY_AREA_TAGS = new Set(["community-interface", "visuals"]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomizeCopy(items = []) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatDistrictName(name) {
  return String(name || "Unknown district").replace(/\s+Natural Resource District$/i, " NRD");
}

function formatSpecies(block) {
  return [block?.forestData?.speciesCd1, block?.forestData?.speciesCd2].filter(Boolean).join("/");
}

function blockIdentifier(block) {
  if (!block) return "Unknown";
  if (block.sourceType === "planned-cutblock") {
    const compactId = [block.timberMark, block.cutBlockId].filter(Boolean).join("-");
    return compactId || block.label || block.id;
  }
  return block.openingId || block.label || block.id;
}

function compactBlockIdentifier(block) {
  const parts = [block?.timberMark, block?.cutBlockId].filter(Boolean);
  if (parts.length) {
    return parts.join("-");
  }
  if (block?.openingId) {
    return `OPEN-${block.openingId}`;
  }
  return blockIdentifier(block);
}

function getArea(areaId, area = null) {
  if (area) return area;
  return blockOptionsData?.areas?.[areaId] || null;
}

function buildFallbackPlanningSnapshot(areaId, area = null) {
  const resolvedArea = area || null;
  const districts = resolvedArea?.communities?.length ? resolvedArea.communities : [resolvedArea?.name || "BC district"];
  const sampleBlocks = [
    {
      id: `${areaId}-fallback-1`,
      label: `Cutblock ${String(resolvedArea?.name || "Regional")} A`,
      compactId: `${String(areaId || "area").slice(0, 4).toUpperCase()}-A`,
      district: districts[0],
      sourceType: "planned-cutblock",
      areaHa: 48,
      species: (resolvedArea?.dominantTrees || []).slice(0, 2).join("/"),
      summary: "Fallback regional block sample used until a richer planning-block snapshot is generated for this area.",
    },
    {
      id: `${areaId}-fallback-2`,
      label: `Cutblock ${String(resolvedArea?.name || "Regional")} B`,
      compactId: `${String(areaId || "area").slice(0, 4).toUpperCase()}-B`,
      district: districts[1] || districts[0],
      sourceType: "planned-cutblock",
      areaHa: 36,
      species: (resolvedArea?.dominantTrees || []).slice(1, 3).join("/"),
      summary: "Fallback planning option emphasizing local road, water, and community constraints from the area profile.",
    },
  ];

  return {
    areaId,
    generatedAt: null,
    generatedOn: null,
    blockCount: sampleBlocks.length,
    districts,
    signalCounts: {
      ogmaNearby: 1,
      whaNoHarvestNearby: 0,
      speciesAtRiskNearby: 1,
      firstNationsReserveNearby: 1,
    },
    dominantConstraint: {
      key: "community",
      label: "Heritage / engagement",
      severity: 24,
      count: 2,
    },
    recommendedTriageKey: getAreaConstraintPreference(resolvedArea) || "access",
    recommendedTriageLabel: getPlanningTriageLabel(getAreaConstraintPreference(resolvedArea) || "access"),
    sampleBlocks,
  };
}

function getAreaTags(area) {
  return new Set(Array.isArray(area?.tags) ? area.tags : []);
}

function listUnique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function getSeasonId(seasonInfo) {
  return seasonInfo?.currentSeason || seasonInfo?.id || null;
}

function getSeasonFromMonth(month) {
  const numericMonth = Number(month);
  if (!Number.isFinite(numericMonth)) return null;
  if (numericMonth >= 3 && numericMonth <= 5) return "spring";
  if (numericMonth >= 6 && numericMonth <= 8) return "summer";
  if (numericMonth >= 9 && numericMonth <= 11) return "fall";
  return "winter";
}

function getPlannedMonth(block) {
  const date = block?.plannedHarvestDate || block?.approveDate;
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCMonth() + 1;
}

function getAreaConstraintPreference(area) {
  const tags = getAreaTags(area);

  if ([...WATER_AREA_TAGS].some((tag) => tags.has(tag))) {
    return "water";
  }

  if ([...COMMUNITY_AREA_TAGS].some((tag) => tags.has(tag))) {
    return "community";
  }

  if ([...ACCESS_AREA_TAGS].some((tag) => tags.has(tag))) {
    return "access";
  }

  return null;
}

const WATER_GATE_LABELS = { clear: "CLEAR", watch: "WINDOW", hold: "HOLD" };

/**
 * Display label for a water gate: CLEAR / WINDOW / HOLD. The internal gate
 * ids ('clear' | 'watch' | 'hold') are persisted on the FOM tracker, so only
 * the label changes here.
 */
export function formatWaterGateLabel(gate) {
  return WATER_GATE_LABELS[gate] || String(gate || "clear").toUpperCase();
}

/**
 * Heritage/referral load: how much engagement and heritage work a block
 * brings to the file. Built from what the snapshot carries (the Nation
 * sensitivity metric, riparian ground as an AOA-potential proxy, whether the
 * licence has an agreement with more than one Nation in the area) and a
 * deterministic CMT/heritage screen where the snapshot is silent — never
 * from reserve proximity, which says nothing about a Nation's territory.
 *
 * @returns {{score: number, className: 'light'|'moderate'|'heavy', label: string, notes: string[]}}
 */
export function getPlanningBlockHeritageLoad(block, area = null) {
  const metrics = block?.metrics || {};
  const indicators = block?.indicators || {};
  const notes = [];
  let score = clamp(Number(metrics.firstNationsSensitivity || 0), 0, 100);

  const riparian = Boolean(indicators.ogmaNearby || indicators.whaNoHarvestNearby || indicators.speciesAtRiskNearby);
  if (riparian) {
    score += 10;
    notes.push("AOA potential high on riparian ground");
  } else {
    notes.push("AOA potential low");
  }

  // Known CMT / heritage sites: the snapshot does not carry the RAAD layer,
  // so screen deterministically off the block identity.
  let hash = 0;
  for (const char of String(block?.id || block?.label || "")) {
    hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  }
  const heritageScreen = hash % 3;
  if (heritageScreen === 2) {
    score += 16;
    notes.push("CMT/heritage sites recorded within 1 km");
  } else if (heritageScreen === 1) {
    score += 8;
    notes.push("heritage screen flags one recorded site nearby");
  } else {
    notes.push("heritage screen clean");
  }

  const partners = Array.isArray(area?.indigenousPartners) ? area.indigenousPartners : [];
  if (partners.length >= 2) {
    score -= 10;
    notes.push(`agreement in place with ${partners[0]}`);
  } else if (partners.length === 1) {
    notes.push(`engagement with ${partners[0]} ongoing`);
  }

  score = clamp(Math.round(score), 0, 100);
  const className = score >= 60 ? "heavy" : score >= 30 ? "moderate" : "light";
  return {
    score,
    className,
    label: `Heritage/referral ${score}`,
    notes,
  };
}

function getBlockConstraintSignals(block, area = null) {
  const areaTags = getAreaTags(area);
  const signals = [];
  const tech = Number(block?.metrics?.technicalComplexity || 0);
  const timber = Number(block?.metrics?.timberOpportunity || 0);
  const eco = Number(block?.metrics?.biodiversitySensitivity || 0);
  const fn = Number(block?.metrics?.firstNationsSensitivity || 0);
  const indicators = block?.indicators || {};
  const indicatorWaterLoad = Number(Boolean(indicators.ogmaNearby) || Boolean(indicators.whaNoHarvestNearby) || Boolean(indicators.speciesAtRiskNearby));
  const heritage = getPlanningBlockHeritageLoad(block, area);
  const indicatorCommunityLoad = heritage.className === "heavy" ? 1 : 0;

  const accessAreaBoost = areaTags.has("steep") || areaTags.has("remote-camps") || areaTags.has("winter-road") || areaTags.has("glacial") ? 8 : 0;
  const waterAreaBoost = areaTags.has("karst") || areaTags.has("salmon") || areaTags.has("watershed") || areaTags.has("wetland") || areaTags.has("community-water") ? 10 : 0;
  const communityAreaBoost = areaTags.has("community-interface") || areaTags.has("visuals") ? 8 : 0;

  if (tech >= 18 || accessAreaBoost > 0) {
    signals.push({
      key: "access",
      label: "Access / engineering",
      severity: tech + accessAreaBoost,
      note: tech >= 18 ? "technical lift is part of the job" : "area context suggests access will shape the window",
    });
  }

  if (eco >= 18 || indicatorWaterLoad > 0 || waterAreaBoost > 0) {
    signals.push({
      key: "water",
      label: "Water / habitat",
      severity: eco + (indicatorWaterLoad * 10) + waterAreaBoost,
      note: eco >= 18 ? "water, habitat, or wet-ground risk is material" : "area context points to water or habitat sensitivity",
    });
  }

  if (fn >= 18 || indicatorCommunityLoad > 0 || communityAreaBoost > 0) {
    signals.push({
      key: "community",
      label: "Heritage / engagement",
      severity: heritage.score + communityAreaBoost,
      note: fn >= 18 ? "heritage and referral load is part of the block story" : "area context suggests engagement or public-interface friction",
    });
  }

  if (timber >= 50) {
    signals.push({
      key: "timber",
      label: "Timber opportunity",
      severity: timber,
      note: "timber value is strong enough to influence the pick",
    });
  }

  return signals.sort((a, b) => b.severity - a.severity || a.label.localeCompare(b.label));
}

export function getPlanningBlockWaterContext(block, area = null, seasonInfo = null) {
  const areaTags = getAreaTags(area);
  const indicators = block?.indicators || {};
  const plannedMonth = getPlannedMonth(block);
  const plannedSeason = getSeasonFromMonth(plannedMonth);
  const currentSeason = getSeasonId(seasonInfo);

  const hydrologyTagCount = [...WATER_HYDROLOGY_TAGS].filter((tag) => areaTags.has(tag)).length;
  const watershedPressure = Number(areaTags.has("watershed") || areaTags.has("community-water"));
  const fishPressure = Number(areaTags.has("salmon") || Boolean(indicators.ogmaNearby) || Boolean(indicators.whaNoHarvestNearby));
  const habitatPressure = Number(areaTags.has("wetland") || areaTags.has("karst") || Boolean(indicators.speciesAtRiskNearby));
  const timingPressure = Number(
    watershedPressure * 2 +
    fishPressure * 2 +
    habitatPressure +
    hydrologyTagCount +
    (plannedSeason && WATER_TIMING_SEASONS.has(plannedSeason) ? 2 : 0) +
    (currentSeason && WATER_TIMING_SEASONS.has(currentSeason) ? 1 : 0) +
    (plannedSeason && currentSeason && plannedSeason === currentSeason && WATER_TIMING_SEASONS.has(plannedSeason) ? 1 : 0),
  );

  const gate = timingPressure >= 6 ? "hold" : timingPressure >= 3 ? "watch" : "clear";
  const hydrologyLabel = watershedPressure || fishPressure
    ? "community watershed hydrology"
    : habitatPressure
      ? "water and habitat hydrology"
      : "water timing";

  const note = gate === "hold"
    ? `${hydrologyLabel} — in-stream work window applies (WSA s.11); works in and about a stream review needed before submission.`
    : gate === "watch"
      ? `${hydrologyLabel} — in-stream work window applies (WSA s.11); keep the timing window on the map.`
      : `${hydrologyLabel} — no in-stream timing constraint on this block.`;

  const readiness = clamp(100 - (timingPressure * 12) - (watershedPressure ? 4 : 0), 20, 100);
  const reviewDays = gate === "hold" ? 3 : gate === "watch" ? 2 : 1;
  const rankingBonus = gate === "clear" ? 6 : gate === "watch" ? 1 : -8;
  const commentCount = gate === "hold" ? 2 : gate === "watch" ? 1 : 0;

  return {
    sensitive: timingPressure > 0,
    timingPressure,
    gate,
    gateLabel: formatWaterGateLabel(gate),
    note,
    hydrologyLabel,
    plannedSeason,
    currentSeason,
    readiness,
    reviewDays,
    rankingBonus,
    commentCount,
  };
}

function summarizeConstraintSignals(signals, maxSignals = 2) {
  if (!signals.length) return "Low-constraint ground";
  return signals.slice(0, maxSignals).map((signal) => signal.label).join(" / ");
}

function scorePlanningBlockForTriage(block, triageKey, area = null, seasonInfo = null) {
  const profile = PLANNING_TRIAGE_PROFILES[triageKey];
  if (!profile) {
    return (Number(block?.metrics?.timberOpportunity || 0) + Number(block?.metrics?.technicalComplexity || 0));
  }

  const metrics = block?.metrics || {};
  const indicators = block?.indicators || {};
  const areaTags = getAreaTags(area);
  const waterContext = getPlanningBlockWaterContext(block, area, seasonInfo);
  let score = 0;

  for (const [metricName, weight] of Object.entries(profile.weights)) {
    score += Number(metrics[metricName] || 0) * weight;
  }

  if (triageKey === "water") {
    if (indicators.ogmaNearby) score -= 8;
    if (indicators.whaNoHarvestNearby) score -= 8;
    if (indicators.speciesAtRiskNearby) score -= 4;
    if (areaTags.has("karst") || areaTags.has("salmon") || areaTags.has("watershed") || areaTags.has("wetland")) score -= 2;
  }

  if (triageKey === "community") {
    const heritage = getPlanningBlockHeritageLoad(block, area);
    score -= heritage.score * 0.3;
    if (areaTags.has("community-interface") || areaTags.has("visuals")) score -= 2;
  }

  if (triageKey === "access") {
    if (areaTags.has("steep") || areaTags.has("remote-camps") || areaTags.has("winter-road") || areaTags.has("glacial")) score -= 2;
  }

  if (waterContext.sensitive) {
    score += waterContext.rankingBonus;
    if (triageKey === "water") {
      score += waterContext.rankingBonus;
      score += Math.round(waterContext.readiness / 25);
    }
  }

  return score;
}

function getTriageEvidenceValue(block, triageKey, area = null, seasonInfo = null) {
  const metrics = block?.metrics || {};
  if (triageKey === "access") return Math.round(Number(metrics.technicalComplexity || 0));
  if (triageKey === "water") {
    const water = getPlanningBlockWaterContext(block, area, seasonInfo);
    return Math.round(Number(metrics.biodiversitySensitivity || 0) + water.timingPressure * 5);
  }
  if (triageKey === "community") {
    return getPlanningBlockHeritageLoad(block, area).score;
  }
  return Math.round(Number(metrics.timberOpportunity || 0));
}

function selectDiverseTriageOptions(blocks, count, triageKey, area = null, seasonInfo = null) {
  if (!triageKey) return blocks.slice(0, count);
  const selected = [];
  const seenEvidence = new Set();

  for (const block of blocks) {
    const evidence = getTriageEvidenceValue(block, triageKey, area, seasonInfo);
    if (seenEvidence.has(evidence)) continue;
    selected.push(block);
    seenEvidence.add(evidence);
    if (selected.length >= count) return selected;
  }

  for (const block of blocks) {
    if (!selected.includes(block)) selected.push(block);
    if (selected.length >= count) break;
  }
  return selected;
}

export function formatPlanningBlockTriageEvidence(block, triageKey, candidates = [], area = null, seasonInfo = null) {
  const rank = Math.max(1, candidates.findIndex((candidate) => candidate?.id === block?.id) + 1);
  const count = Math.max(1, candidates.length);
  const metrics = block?.metrics || {};

  if (triageKey === "access") {
    return `Access evidence: engineering complexity ${Math.round(Number(metrics.technicalComplexity || 0))}/100 · fit rank ${rank}/${count} (lower lift is better)`;
  }
  if (triageKey === "water") {
    const water = getPlanningBlockWaterContext(block, area, seasonInfo);
    return `Water evidence: habitat sensitivity ${Math.round(Number(metrics.biodiversitySensitivity || 0))}/100 · water gate ${water.gateLabel} · fit rank ${rank}/${count}`;
  }
  if (triageKey === "community") {
    const heritage = getPlanningBlockHeritageLoad(block, area);
    return `Engagement evidence: heritage/referral load ${heritage.score}/100 (${heritage.className}) · ${heritage.notes[0] || "no heritage notes"} · fit rank ${rank}/${count}`;
  }
  if (triageKey === "timber") {
    return `Timber evidence: opportunity ${Math.round(Number(metrics.timberOpportunity || 0))}/100 · fit rank ${rank}/${count} (higher opportunity is better)`;
  }
  return "Balanced evidence: compare timber, habitat, heritage/referral load, and engineering together.";
}

function getTriageOptions(recommendedKey) {
  const orderedKeys = [
    recommendedKey,
    ...PLANNING_TRIAGE_ORDER.filter((key) => key !== recommendedKey),
  ];

  return orderedKeys.map((key) => {
    const profile = PLANNING_TRIAGE_PROFILES[key];
    return {
      label: profile.label,
      description: profile.description,
      value: key,
    };
  });
}

export function formatPlanningBlockLabel(block) {
  const sourceLabel = block?.sourceType === "planned-cutblock" ? "Cutblock" : "Opening";
  return `${sourceLabel} ${blockIdentifier(block)}`;
}

export function getPlanningTriageLabel(triageKey) {
  return PLANNING_TRIAGE_PROFILES[triageKey]?.label || "Balanced";
}

export function getPlanningTriageScrutinyDelta(triageKey) {
  return Number(PLANNING_TRIAGE_PROFILES[triageKey]?.scrutinyDelta || 0);
}

export function summarizePlanningBlockConstraints(block, area = null) {
  return summarizeConstraintSignals(getBlockConstraintSignals(block, area));
}

export function buildPlanningConstraintTriage(areaId, area = null, blocks = []) {
  const resolvedArea = getArea(areaId, area);
  const pool = Array.isArray(blocks) ? blocks : [];
  const totals = new Map(
    PLANNING_TRIAGE_ORDER.map((key) => [key, { key, label: PLANNING_TRIAGE_PROFILES[key].label, severity: 0, count: 0 }]),
  );

  for (const block of pool) {
    for (const signal of getBlockConstraintSignals(block, resolvedArea)) {
      const entry = totals.get(signal.key);
      if (!entry) continue;
      entry.severity += signal.severity;
      entry.count += 1;
    }
  }

  const ranked = [...totals.values()]
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.severity - a.severity || b.count - a.count);

  const areaPreference = getAreaConstraintPreference(resolvedArea);
  const recommendedKey = areaPreference && totals.get(areaPreference)?.count
    ? areaPreference
    : ranked[0]?.key || "access";

  const leading = ranked[0];
  const secondary = ranked[1];
  const summary = ranked.length
    ? [
        leading ? `Strongest area signal: ${leading.label}` : "",
        secondary ? `second: ${secondary.label}` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    : "This area is relatively even on its main operating constraints.";

  return {
    areaId,
    area: resolvedArea,
    recommendedKey,
    summary: resolvedArea?.zoneSummary ? `${resolvedArea.zoneSummary} | ${summary}` : summary,
    drivers: ranked,
    options: getTriageOptions(recommendedKey),
  };
}

export function formatPlanningBlockPromptDescription(block, area = null, seasonInfo = null) {
  if (!block) return "No block details available.";

  const timber = Math.round(block?.metrics?.timberOpportunity || 0);
  const eco = Math.round(block?.metrics?.biodiversitySensitivity || 0);
  const heritage = getPlanningBlockHeritageLoad(block, area);
  const blockArea = Number(block.areaHa || 0).toFixed(1);
  const species = formatSpecies(block);
  const timing = block.plannedHarvestYear || block.approveYear;
  const constraints = summarizePlanningBlockConstraints(block, area);
  const waterContext = getPlanningBlockWaterContext(block, area, seasonInfo);

  return [
    `${blockArea} ha`,
    formatDistrictName(block.adminDistrict),
    species ? `Species ${species}` : "",
    `Timber ${timber}`,
    `Habitat ${eco}`,
    heritage.label,
    constraints ? `Constraints ${constraints}` : "",
    waterContext.sensitive ? `Water ${waterContext.gateLabel}: ${waterContext.note}` : "",
    timing ? `Target ${timing}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export function getPlanningCadenceDays() {
  const cadence = Number(blockOptionsData?.cadenceDays);
  return Number.isFinite(cadence) && cadence > 0 ? cadence : DEFAULT_CADENCE_DAYS;
}

export function getPlanningAreaBlockPool(areaId) {
  return blockOptionsData?.areas?.[areaId]?.options || [];
}

export function getPlanningAreaSnapshot(areaId, area = null, options = {}) {
  const pool = getPlanningAreaBlockPool(areaId);
  const sampleCount = clamp(Number(options.sampleCount) || 3, 1, 5);
  const resolvedArea = getArea(areaId, area);
  if (!pool.length && resolvedArea) {
    return buildFallbackPlanningSnapshot(areaId, resolvedArea);
  }
  const triage = buildPlanningConstraintTriage(areaId, resolvedArea, pool);

  const signalCounts = pool.reduce(
    (counts, block) => {
      if (block?.indicators?.ogmaNearby) counts.ogmaNearby += 1;
      if (block?.indicators?.whaNoHarvestNearby) counts.whaNoHarvestNearby += 1;
      if (block?.indicators?.speciesAtRiskNearby) counts.speciesAtRiskNearby += 1;
      if (block?.indicators?.firstNationsReserveNearby) counts.firstNationsReserveNearby += 1;
      const heritage = getPlanningBlockHeritageLoad(block, resolvedArea);
      if (heritage.className === "heavy") counts.heritageHeavy += 1;
      if (heritage.className !== "light") counts.heritageReferral += 1;
      return counts;
    },
    {
      ogmaNearby: 0,
      whaNoHarvestNearby: 0,
      speciesAtRiskNearby: 0,
      firstNationsReserveNearby: 0,
      heritageHeavy: 0,
      heritageReferral: 0,
    },
  );

  const districts = listUnique(
    pool.map((block) => formatDistrictName(block?.adminDistrict || block?.district || "")),
  );

  const sampleBlocks = [...pool]
    .sort((a, b) => Number(b?.areaHa || 0) - Number(a?.areaHa || 0) || String(a?.label || "").localeCompare(String(b?.label || "")))
    .slice(0, sampleCount)
    .map((block) => ({
      id: block.id,
      label: formatPlanningBlockLabel(block),
      compactId: compactBlockIdentifier(block),
      district: formatDistrictName(block?.adminDistrict || block?.district || ""),
      sourceType: block?.sourceType || "planned-cutblock",
      areaHa: Number(block?.areaHa || 0),
      species: formatSpecies(block),
      summary: block?.summary || "",
    }));

  const generatedAt = blockOptionsData?.generatedAt || null;

  return {
    areaId,
    generatedAt,
    generatedOn: generatedAt ? String(generatedAt).slice(0, 10) : null,
    blockCount: pool.length,
    districts,
    signalCounts,
    dominantConstraint: triage?.drivers?.[0] || null,
    recommendedTriageKey: triage?.recommendedKey || null,
    recommendedTriageLabel: triage ? getPlanningTriageLabel(triage.recommendedKey) : "",
    sampleBlocks,
  };
}

export function getPlanningBlockById(areaId, blockId) {
  const pool = getPlanningAreaBlockPool(areaId);
  return pool.find((block) => block.id === blockId) || null;
}

export function rankPlanningBlockOptions(blocks = [], triageKey = null, area = null, seasonInfo = null) {
  if (!Array.isArray(blocks) || !blocks.length) return [];
  const resolvedArea = area || null;

  return [...blocks]
    .map((block, index) => ({
      block,
      index,
      score: scorePlanningBlockForTriage(block, triageKey, resolvedArea, seasonInfo),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.block);
}

/**
 * Pick a fresh set of candidate block options for the player's area.
 * Prioritizes unseen blocks, then allows repeats when exhausted.
 */
export function pickPlanningBlockOptions(areaId, historyIds = [], count = 3, triageKey = null, area = null, seasonInfo = null) {
  const pool = getPlanningAreaBlockPool(areaId);
  if (!pool.length) return [];

  const historySet = new Set(historyIds);
  const unseen = pool.filter((block) => !historySet.has(block.id));
  const seen = pool.filter((block) => historySet.has(block.id));
  const resolvedArea = getArea(areaId, area);

  const rankedUnseen = triageKey
    ? rankPlanningBlockOptions(randomizeCopy(unseen), triageKey, resolvedArea, seasonInfo)
    : randomizeCopy(unseen).sort((a, b) => {
        const aScore = (a?.metrics?.timberOpportunity || 0) + (a?.metrics?.technicalComplexity || 0);
        const bScore = (b?.metrics?.timberOpportunity || 0) + (b?.metrics?.technicalComplexity || 0);
        const aWater = getPlanningBlockWaterContext(a, resolvedArea, seasonInfo).rankingBonus;
        const bWater = getPlanningBlockWaterContext(b, resolvedArea, seasonInfo).rankingBonus;
        return (bScore + bWater) - (aScore + aWater);
      });

  const rankedSeen = triageKey
    ? rankPlanningBlockOptions(randomizeCopy(seen), triageKey, resolvedArea, seasonInfo)
    : randomizeCopy(seen).sort((a, b) => {
        const aScore = (a?.metrics?.biodiversitySensitivity || 0) + (a?.metrics?.firstNationsSensitivity || 0);
        const bScore = (b?.metrics?.biodiversitySensitivity || 0) + (b?.metrics?.firstNationsSensitivity || 0);
        const aWater = getPlanningBlockWaterContext(a, resolvedArea, seasonInfo).rankingBonus;
        const bWater = getPlanningBlockWaterContext(b, resolvedArea, seasonInfo).rankingBonus;
        return (bScore + bWater) - (aScore + aWater);
      });

  const optionCount = clamp(count, 1, 6);
  return selectDiverseTriageOptions(
    [...rankedUnseen, ...rankedSeen],
    optionCount,
    triageKey,
    resolvedArea,
    seasonInfo,
  );
}

export function summarizePlanningBlock(block, area = null, triageKey = null, seasonInfo = null) {
  if (!block) return 'No active block';
  const blockArea = Number(block.areaHa || 0).toFixed(1);
  const timber = Math.round(block?.metrics?.timberOpportunity || 0);
  const eco = Math.round(block?.metrics?.biodiversitySensitivity || 0);
  const heritage = getPlanningBlockHeritageLoad(block, area);
  const constraints = summarizePlanningBlockConstraints(block, area);
  const triageLabel = triageKey ? getPlanningTriageLabel(triageKey) : "";
  const waterContext = getPlanningBlockWaterContext(block, area, seasonInfo);
  return [
    `${formatPlanningBlockLabel(block)} (${blockArea} ha)`,
    formatDistrictName(block.adminDistrict),
    `Timber ${timber}`,
    `Habitat ${eco}`,
    heritage.label,
    constraints ? `Constraints ${constraints}` : "",
    waterContext.sensitive ? `Water ${waterContext.gateLabel}` : "",
    triageLabel ? `Triage ${triageLabel}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export function getPlanningDataAttribution() {
  return {
    generatedAt: blockOptionsData?.generatedAt || null,
    sources: blockOptionsData?.sources || {}
  };
}
