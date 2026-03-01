#!/usr/bin/env node
/**
 * Generate planning block options from BC OpenMaps WFS layers.
 *
 * Output:
 *   js/data/json/planning/blockOptions.json
 *
 * This script snapshots a practical set of real cutblock/opening candidates
 * per in-game operating area and enriches each with ecological/context signals.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const OUTPUT_PATH = path.join(
  ROOT_DIR,
  'js',
  'data',
  'json',
  'planning',
  'blockOptions.json'
);

const MAX_OPTIONS_PER_AREA = 24;
const FTA_TARGET_PER_AREA = 14;
const RESULTS_TARGET_PER_AREA = 10;
const BLOCK_SELECTION_CADENCE_DAYS = 3;

const AREA_CONFIGS = [
  {
    id: 'fort-st-john-plateau',
    name: 'Fort St. John Plateau',
    bbox4326: [-123.4, 55.25, -119.6, 57.35],
    communities: ['Fort St. John', 'Charlie Lake']
  },
  {
    id: 'muskwa-foothills',
    name: 'Muskwa Foothills',
    bbox4326: [-125.8, 57.0, -121.0, 59.7],
    communities: ['Fort Nelson', 'Toad River']
  },
  {
    id: 'bulkley-valley',
    name: 'Bulkley Valley Escarpment',
    bbox4326: [-128.8, 54.2, -125.4, 55.5],
    communities: ['Smithers', 'Telkwa']
  },
  {
    id: 'fraser-plateau',
    name: 'Fraser Plateau Uplands',
    bbox4326: [-124.8, 53.1, -121.0, 54.9],
    communities: ['Prince George', 'Hixon']
  },
  {
    id: 'skeena-nass',
    name: 'Skeena-Nass Transition',
    bbox4326: [-131.4, 54.6, -127.0, 56.8],
    communities: ['Terrace', 'New Aiyansh']
  },
  {
    id: 'tahltan-highland',
    name: 'Tahltan Highland',
    bbox4326: [-132.8, 56.3, -128.2, 59.5],
    communities: ['Iskut', 'Dease Lake']
  }
];

const WFS = {
  fta: {
    url: 'https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW/wfs',
    typeName: 'pub:WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW'
  },
  results: {
    url: 'https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.RSLT_OPENING_SVW/wfs',
    typeName: 'pub:WHSE_FOREST_VEGETATION.RSLT_OPENING_SVW'
  },
  ogma: {
    url: 'https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW/wfs',
    typeName: 'pub:WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW'
  },
  wha: {
    url: 'https://openmaps.gov.bc.ca/geo/pub/WHSE_WILDLIFE_MANAGEMENT.WCP_WILDLIFE_HABITAT_AREA_POLY/wfs',
    typeName: 'pub:WHSE_WILDLIFE_MANAGEMENT.WCP_WILDLIFE_HABITAT_AREA_POLY'
  },
  cdc: {
    url: 'https://openmaps.gov.bc.ca/geo/pub/WHSE_TERRESTRIAL_ECOLOGY.BIOT_OCCR_NON_SENS_AREA_SVW/wfs',
    typeName: 'pub:WHSE_TERRESTRIAL_ECOLOGY.BIOT_OCCR_NON_SENS_AREA_SVW'
  },
  reserves: {
    url: 'https://openmaps.gov.bc.ca/geo/pub/WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES/wfs',
    typeName: 'pub:WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES'
  },
  vri: {
    url: 'https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY/wfs',
    typeName: 'pub:WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY'
  }
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = new Date();
const ONE_YEAR_AGO = new Date(TODAY.getTime() - 365 * ONE_DAY_MS);
const FIVE_YEARS_AHEAD = new Date(TODAY.getTime() + 365 * 5 * ONE_DAY_MS);

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function toHaFromSqm(sqm) {
  const n = asNumber(sqm, 0);
  return n > 0 ? round(n / 10000, 1) : 0;
}

function centroidFromGeometry(geometry, fallbackBbox = null) {
  if (!geometry || !geometry.coordinates) {
    if (!fallbackBbox) return null;
    return {
      lon: round((fallbackBbox[0] + fallbackBbox[2]) / 2, 6),
      lat: round((fallbackBbox[1] + fallbackBbox[3]) / 2, 6)
    };
  }

  let ring = null;

  if (geometry.type === 'Polygon') {
    ring = geometry.coordinates?.[0];
  } else if (geometry.type === 'MultiPolygon') {
    ring = geometry.coordinates?.[0]?.[0];
  }

  if (!Array.isArray(ring) || ring.length === 0) {
    if (!fallbackBbox) return null;
    return {
      lon: round((fallbackBbox[0] + fallbackBbox[2]) / 2, 6),
      lat: round((fallbackBbox[1] + fallbackBbox[3]) / 2, 6)
    };
  }

  let lon = 0;
  let lat = 0;
  let count = 0;

  for (const coord of ring) {
    if (!Array.isArray(coord) || coord.length < 2) continue;
    lon += asNumber(coord[0], 0);
    lat += asNumber(coord[1], 0);
    count += 1;
  }

  if (count === 0) {
    return {
      lon: round((fallbackBbox[0] + fallbackBbox[2]) / 2, 6),
      lat: round((fallbackBbox[1] + fallbackBbox[3]) / 2, 6)
    };
  }

  return {
    lon: round(lon / count, 6),
    lat: round(lat / count, 6)
  };
}

function buildWfsUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function fetchFeatures({ baseUrl, typeName, bbox, count = 500, cqlFilter, propertyName }) {
  const url = buildWfsUrl(baseUrl, {
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    count,
    bbox: `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]},EPSG:4326`,
    CQL_FILTER: cqlFilter,
    propertyName
  });

  const payload = await fetchJson(url);
  return Array.isArray(payload.features) ? payload.features : [];
}

async function hasFeatureHit({ baseUrl, typeName, bbox, cqlFilter }) {
  const url = buildWfsUrl(baseUrl, {
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    resultType: 'hits',
    bbox: `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]},EPSG:4326`,
    CQL_FILTER: cqlFilter
  });

  const xml = await fetchText(url);
  const match = xml.match(/numberMatched="(\d+)"/);
  return match ? Number(match[1]) > 0 : false;
}

function pointBbox(point, delta) {
  return [
    round(point.lon - delta, 6),
    round(point.lat - delta, 6),
    round(point.lon + delta, 6),
    round(point.lat + delta, 6)
  ];
}

function toCandidateFromFta(feature, area) {
  const p = feature.properties || {};
  const plannedDate = toIsoDate(p.PLANNED_HARVEST_DATE);
  const plannedDateValue = plannedDate ? new Date(plannedDate) : null;
  const areaHa = toHaFromSqm(p.FEATURE_AREA_SQM || p.FEATURE_AREA * 10000);
  const centroid = centroidFromGeometry(feature.geometry, area.bbox4326);
  const district =
    p.ADMIN_DISTRICT_NAME ||
    p.GEOGRAPHIC_DISTRICT_NAME ||
    'Unknown district';
  const labelCore =
    p.MAP_LABEL ||
    (p.CUT_BLOCK_ID ? `Cutblock ${p.CUT_BLOCK_ID}` : `Cutblock ${p.OBJECTID}`);

  return {
    id: `fta-${p.OBJECTID}`,
    source: 'forest-tenure-cutblock-polygons-fta-4-0',
    sourceType: 'planned-cutblock',
    label: labelCore,
    adminDistrict: district,
    mapLabel: p.MAP_LABEL || labelCore,
    cutBlockId: p.CUT_BLOCK_ID || null,
    openingId: p.OPENING_ID ?? null,
    timberMark: p.TIMBER_MARK || null,
    areaHa,
    plannedHarvestDate: plannedDate,
    plannedHarvestYear: plannedDate ? Number(plannedDate.slice(0, 4)) : null,
    approveDate: null,
    centroid,
    baseProperties: {
      blockStatusCode: p.BLOCK_STATUS_CODE || null,
      lifecycleStatusCode: p.LIFE_CYCLE_STATUS_CODE || null,
      clientName: p.CLIENT_NAME || null,
      harvestAuthForestFileId: p.HARVEST_AUTH_FOREST_FILE_ID || null
    },
    _sorting: {
      planned: plannedDateValue?.getTime() || 0,
      areaHa
    }
  };
}

function toCandidateFromResults(feature, area) {
  const p = feature.properties || {};
  const approveDate = toIsoDate(p.APPROVE_DATE);
  const approveDateValue = approveDate ? new Date(approveDate) : null;
  const areaHa = toHaFromSqm(p.FEATURE_AREA_SQM || p.FEATURE_AREA * 10000);
  const centroid = centroidFromGeometry(feature.geometry, area.bbox4326);
  const labelCore =
    p.MAP_LABEL ||
    p.OPENING_NUMBER ||
    (p.CUT_BLOCK_ID ? `Opening ${p.CUT_BLOCK_ID}` : `Opening ${p.OBJECTID}`);

  return {
    id: `results-${p.OBJECTID}`,
    source: 'results-openings-svw',
    sourceType: 'untreated-opening',
    label: labelCore,
    adminDistrict: p.DISTRICT_NAME || 'Unknown district',
    mapLabel: p.MAP_LABEL || labelCore,
    cutBlockId: p.CUT_BLOCK_ID || null,
    openingId: p.OPENING_ID ?? null,
    timberMark: p.TIMBER_MARK || null,
    areaHa,
    plannedHarvestDate: null,
    plannedHarvestYear: null,
    approveDate,
    approveYear: approveDate ? Number(approveDate.slice(0, 4)) : null,
    centroid,
    baseProperties: {
      openingStatusCode: p.OPENING_STATUS_CODE || null,
      openingCategoryCode: p.OPENING_CATEGORY_CODE || null,
      denudationCount: asNumber(p.DENUDATION_COUNT, 0),
      plantingCount: asNumber(p.PLANTING_COUNT, 0),
      clientName: p.CLIENT_NAME || null,
      averageElevation: asNumber(p.AVERAGE_ELEVATION, 0)
    },
    _sorting: {
      approved: approveDateValue?.getTime() || 0,
      areaHa
    }
  };
}

function withinWindow(dateIso, fromDate, toDate) {
  if (!dateIso) return false;
  const value = new Date(dateIso).getTime();
  return value >= fromDate.getTime() && value <= toDate.getTime();
}

function filterFtaCandidates(candidates) {
  return candidates.filter((candidate) => {
    const areaOk = candidate.areaHa >= 0.5;
    const hasEnded = candidate.baseProperties.lifecycleStatusCode === 'RETIRED';
    const plannedDateOk = !candidate.plannedHarvestDate ||
      withinWindow(candidate.plannedHarvestDate, ONE_YEAR_AGO, FIVE_YEARS_AHEAD);
    return areaOk && !hasEnded && plannedDateOk;
  });
}

function filterResultsCandidates(candidates) {
  return candidates.filter((candidate) => {
    const areaOk = candidate.areaHa > 0;
    const approveOk = candidate.approveDate
      ? new Date(candidate.approveDate).getTime() >= ONE_YEAR_AGO.getTime()
      : false;
    const noDenudation = asNumber(candidate.baseProperties.denudationCount, 0) === 0;
    const noPlanting = asNumber(candidate.baseProperties.plantingCount, 0) === 0;
    return areaOk && approveOk && noDenudation && noPlanting;
  });
}

function pickCandidates(ftaCandidates, resultsCandidates) {
  const picked = [];
  const seen = new Set();

  const ftaSorted = [...ftaCandidates].sort((a, b) => {
    const plannedDelta = b._sorting.planned - a._sorting.planned;
    if (plannedDelta !== 0) return plannedDelta;
    return b._sorting.areaHa - a._sorting.areaHa;
  });

  const resultsSorted = [...resultsCandidates].sort((a, b) => {
    const approvedDelta = b._sorting.approved - a._sorting.approved;
    if (approvedDelta !== 0) return approvedDelta;
    return b._sorting.areaHa - a._sorting.areaHa;
  });

  for (const candidate of ftaSorted) {
    if (picked.length >= MAX_OPTIONS_PER_AREA) break;
    if (picked.filter((v) => v.sourceType === 'planned-cutblock').length >= FTA_TARGET_PER_AREA) break;
    if (seen.has(candidate.id)) continue;
    picked.push(candidate);
    seen.add(candidate.id);
  }

  for (const candidate of resultsSorted) {
    if (picked.length >= MAX_OPTIONS_PER_AREA) break;
    if (picked.filter((v) => v.sourceType === 'untreated-opening').length >= RESULTS_TARGET_PER_AREA) break;
    if (seen.has(candidate.id)) continue;
    picked.push(candidate);
    seen.add(candidate.id);
  }

  for (const candidate of ftaSorted) {
    if (picked.length >= MAX_OPTIONS_PER_AREA) break;
    if (seen.has(candidate.id)) continue;
    picked.push(candidate);
    seen.add(candidate.id);
  }

  for (const candidate of resultsSorted) {
    if (picked.length >= MAX_OPTIONS_PER_AREA) break;
    if (seen.has(candidate.id)) continue;
    picked.push(candidate);
    seen.add(candidate.id);
  }

  return picked.slice(0, MAX_OPTIONS_PER_AREA);
}

async function fetchVriSample(point) {
  const deltas = [0.005, 0.015, 0.03];
  for (const delta of deltas) {
    const bbox = pointBbox(point, delta);
    try {
      const features = await fetchFeatures({
        baseUrl: WFS.vri.url,
        typeName: WFS.vri.typeName,
        bbox,
        count: 8
      });
      if (features.length > 0) {
        const preferred = features.find((f) => f?.properties?.SPECIES_CD_1) || features[0];
        const p = preferred.properties || {};
        return {
          speciesCd1: p.SPECIES_CD_1 || null,
          speciesPct1: asNumber(p.SPECIES_PCT_1, 0),
          speciesCd2: p.SPECIES_CD_2 || null,
          speciesPct2: asNumber(p.SPECIES_PCT_2, 0),
          projectedAge: asNumber(p.PROJ_AGE_1, 0),
          quadDiam125: asNumber(p.QUAD_DIAM_125, 0),
          quadDiam175: asNumber(p.QUAD_DIAM_175, 0),
          quadDiam225: asNumber(p.QUAD_DIAM_225, 0)
        };
      }
    } catch {
      // Try next search radius when VRI query fails for a local window.
    }
  }

  return {
    speciesCd1: null,
    speciesPct1: 0,
    speciesCd2: null,
    speciesPct2: 0,
    projectedAge: 0,
    quadDiam125: 0,
    quadDiam175: 0,
    quadDiam225: 0
  };
}

async function hasWhaNoHarvestNearby(point) {
  const bbox = pointBbox(point, 0.012);
  try {
    const features = await fetchFeatures({
      baseUrl: WFS.wha.url,
      typeName: WFS.wha.typeName,
      bbox,
      count: 6
    });
    return features.some((feature) => {
      const code = feature?.properties?.TIMBER_HARVEST_CODE;
      return code === 'NO HARVEST ZONE';
    });
  } catch {
    return false;
  }
}

function buildFallbackEnrichedCandidate(candidate) {
  return {
    id: candidate.id,
    source: candidate.source,
    sourceType: candidate.sourceType,
    label: candidate.label,
    mapLabel: candidate.mapLabel,
    adminDistrict: candidate.adminDistrict,
    cutBlockId: candidate.cutBlockId,
    openingId: candidate.openingId,
    timberMark: candidate.timberMark,
    areaHa: round(candidate.areaHa, 1),
    plannedHarvestDate: candidate.plannedHarvestDate,
    plannedHarvestYear: candidate.plannedHarvestYear || null,
    approveDate: candidate.approveDate,
    approveYear: candidate.approveYear || null,
    centroid: candidate.centroid,
    indicators: {
      ogmaNearby: false,
      whaNoHarvestNearby: false,
      speciesAtRiskNearby: false,
      firstNationsReserveNearby: false
    },
    forestData: {
      speciesCd1: null,
      speciesPct1: 0,
      speciesCd2: null,
      speciesPct2: 0,
      projectedAge: 0,
      quadDiam125: 0,
      quadDiam175: 0,
      quadDiam225: 0
    },
    metrics: {
      timberOpportunity: 52,
      biodiversitySensitivity: 42,
      firstNationsSensitivity: 40,
      technicalComplexity: 48
    },
    valueEffects: {
      biodiversity: 0,
      timberSupply: 1,
      communityNeeds: 0,
      firstNationsValues: 0
    },
    eventBias: {
      stakeholder: 1,
      compliance: 1,
      technical: 1,
      political: 1,
      policy: 1,
      issue: 1
    },
    summary: `${candidate.sourceType === 'planned-cutblock' ? 'Planned cutblock' : 'Untreated opening'} in ${candidate.adminDistrict} | ${round(candidate.areaHa, 1)} ha`
  };
}

function computeDerivedMetrics(candidate, signals, vriSample) {
  const areaScore = clamp(candidate.areaHa / 2.5, 0, 40);
  const plannedSoonBoost = candidate.plannedHarvestDate ? 14 : 0;
  const untreatedOpeningBoost = candidate.sourceType === 'untreated-opening' ? 7 : 0;
  const age = asNumber(vriSample.projectedAge, 0);

  const timberOpportunity = clamp(
    28 +
      areaScore +
      plannedSoonBoost +
      untreatedOpeningBoost +
      (age >= 20 && age <= 120 ? 10 : 0) +
      (vriSample.quadDiam125 > 18 ? 8 : 0) -
      (signals.ogmaNearby ? 10 : 0) -
      (signals.whaNoHarvestNearby ? 12 : 0),
    5,
    95
  );

  const biodiversitySensitivity = clamp(
    18 +
      (signals.ogmaNearby ? 35 : 0) +
      (signals.whaNoHarvestNearby ? 32 : 0) +
      (signals.speciesAtRiskNearby ? 18 : 0) +
      (age >= 250 ? 18 : age >= 120 ? 10 : 0),
    5,
    98
  );

  const firstNationsSensitivity = clamp(
    12 +
      (signals.firstNationsReserveNearby ? 38 : 0) +
      (signals.speciesAtRiskNearby ? 6 : 0) +
      (signals.ogmaNearby ? 4 : 0),
    5,
    95
  );

  const technicalComplexity = clamp(
    22 +
      (candidate.sourceType === 'untreated-opening' ? 10 : 0) +
      (signals.speciesAtRiskNearby ? 8 : 0) +
      (candidate.areaHa > 80 ? 12 : candidate.areaHa > 30 ? 6 : 0),
    10,
    90
  );

  const valueEffects = {
    biodiversity: clamp(Math.round((45 - biodiversitySensitivity) / 10), -8, 4),
    timberSupply: clamp(Math.round((timberOpportunity - 45) / 8), -4, 8),
    communityNeeds: clamp(
      (candidate.sourceType === 'untreated-opening' ? 2 : 0) + (candidate.areaHa > 50 ? 1 : 0),
      -2,
      4
    ),
    firstNationsValues: clamp(Math.round((40 - firstNationsSensitivity) / 10), -7, 4)
  };

  const eventBias = {
    stakeholder: round(clamp(1 + firstNationsSensitivity / 170 + (signals.firstNationsReserveNearby ? 0.2 : 0), 0.8, 2.2), 3),
    compliance: round(clamp(1 + biodiversitySensitivity / 180 + (signals.ogmaNearby || signals.whaNoHarvestNearby ? 0.18 : 0), 0.85, 2.3), 3),
    technical: round(clamp(1 + technicalComplexity / 240, 0.9, 1.9), 3),
    political: round(clamp(0.95 + timberOpportunity / 260, 0.8, 1.8), 3),
    policy: round(clamp(1 + (biodiversitySensitivity + firstNationsSensitivity) / 280, 0.9, 2.3), 3),
    issue: round(clamp(1 + (biodiversitySensitivity + technicalComplexity) / 300, 0.9, 2.1), 3)
  };

  const primarySpecies = [vriSample.speciesCd1, vriSample.speciesCd2].filter(Boolean).join('/');
  const summaryParts = [
    `${candidate.sourceType === 'planned-cutblock' ? 'Planned cutblock' : 'Untreated opening'} in ${candidate.adminDistrict}`,
    `${round(candidate.areaHa, 1)} ha`,
    primarySpecies ? `species ${primarySpecies}` : null,
    age > 0 ? `proj. age ${Math.round(age)}` : null,
    signals.ogmaNearby ? 'OGMA nearby' : null,
    signals.whaNoHarvestNearby ? 'WHA no-harvest nearby' : null,
    signals.speciesAtRiskNearby ? 'species-at-risk nearby' : null,
    signals.firstNationsReserveNearby ? 'First Nations reserve nearby' : null
  ].filter(Boolean);

  return {
    timberOpportunity,
    biodiversitySensitivity,
    firstNationsSensitivity,
    technicalComplexity,
    valueEffects,
    eventBias,
    summary: summaryParts.join(' | ')
  };
}

async function enrichCandidate(candidate) {
  const point = candidate.centroid;
  if (!point) {
    return buildFallbackEnrichedCandidate(candidate);
  }

  const nearBlockBbox = pointBbox(point, 0.01);
  const speciesBbox = pointBbox(point, 0.02);

  const [ogmaNearby, whaNoHarvestNearby, speciesAtRiskNearby, firstNationsReserveNearby, vriSample] = await Promise.all([
    hasFeatureHit({
      baseUrl: WFS.ogma.url,
      typeName: WFS.ogma.typeName,
      bbox: nearBlockBbox
    }).catch(() => false),
    hasWhaNoHarvestNearby(point),
    hasFeatureHit({
      baseUrl: WFS.cdc.url,
      typeName: WFS.cdc.typeName,
      bbox: speciesBbox
    }).catch(() => false),
    hasFeatureHit({
      baseUrl: WFS.reserves.url,
      typeName: WFS.reserves.typeName,
      bbox: nearBlockBbox
    }).catch(() => false),
    fetchVriSample(point)
  ]);

  const signals = {
    ogmaNearby,
    whaNoHarvestNearby,
    speciesAtRiskNearby,
    firstNationsReserveNearby
  };

  const derived = computeDerivedMetrics(candidate, signals, vriSample);

  return {
    id: candidate.id,
    source: candidate.source,
    sourceType: candidate.sourceType,
    label: candidate.label,
    mapLabel: candidate.mapLabel,
    adminDistrict: candidate.adminDistrict,
    cutBlockId: candidate.cutBlockId,
    openingId: candidate.openingId,
    timberMark: candidate.timberMark,
    areaHa: round(candidate.areaHa, 1),
    plannedHarvestDate: candidate.plannedHarvestDate,
    plannedHarvestYear: candidate.plannedHarvestYear || null,
    approveDate: candidate.approveDate,
    approveYear: candidate.approveYear || null,
    centroid: candidate.centroid,
    indicators: signals,
    forestData: vriSample,
    metrics: {
      timberOpportunity: derived.timberOpportunity,
      biodiversitySensitivity: derived.biodiversitySensitivity,
      firstNationsSensitivity: derived.firstNationsSensitivity,
      technicalComplexity: derived.technicalComplexity
    },
    valueEffects: derived.valueEffects,
    eventBias: derived.eventBias,
    summary: derived.summary
  };
}

async function mapWithConcurrency(items, mapper, concurrency = 5) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

async function buildAreaOptions(area) {
  console.log(`\n[${area.id}] Fetching cutblocks/openings...`);

  const [ftaFeatures, resultsFeatures] = await Promise.all([
    fetchFeatures({
      baseUrl: WFS.fta.url,
      typeName: WFS.fta.typeName,
      bbox: area.bbox4326,
      count: 400
    }),
    fetchFeatures({
      baseUrl: WFS.results.url,
      typeName: WFS.results.typeName,
      bbox: area.bbox4326,
      count: 400
    })
  ]);

  const ftaCandidates = filterFtaCandidates(
    ftaFeatures.map((feature) => toCandidateFromFta(feature, area))
  );
  const resultsCandidates = filterResultsCandidates(
    resultsFeatures.map((feature) => toCandidateFromResults(feature, area))
  );

  const picked = pickCandidates(ftaCandidates, resultsCandidates);
  console.log(`[${area.id}] picked ${picked.length} candidate blocks for enrichment`);

  const enriched = await mapWithConcurrency(
    picked,
    async (candidate) => {
      try {
        return await enrichCandidate(candidate);
      } catch {
        return buildFallbackEnrichedCandidate(candidate);
      }
    },
    6
  );

  return {
    id: area.id,
    name: area.name,
    bbox4326: area.bbox4326,
    communities: area.communities,
    options: enriched
  };
}

async function main() {
  const areaOutputs = {};

  for (const area of AREA_CONFIGS) {
    try {
      const output = await buildAreaOptions(area);
      areaOutputs[area.id] = output;
    } catch (error) {
      console.error(`[${area.id}] failed: ${error.message}`);
      areaOutputs[area.id] = {
        id: area.id,
        name: area.name,
        bbox4326: area.bbox4326,
        communities: area.communities,
        options: []
      };
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    cadenceDays: BLOCK_SELECTION_CADENCE_DAYS,
    dataWindow: {
      oneYearAgo: toIsoDate(ONE_YEAR_AGO),
      fiveYearsAhead: toIsoDate(FIVE_YEARS_AHEAD)
    },
    sources: {
      plannedCutblocks: 'forest-tenure-cutblock-polygons-fta-4-0',
      untreatedOpenings: 'results-openings-svw',
      oldGrowth: 'old-growth-management-areas-legal-current',
      wildlifeHabitatNoHarvest: 'wildlife-habitat-areas-approved',
      speciesAtRisk: 'species-and-ecosystems-at-risk-publicly-available-occurrences-cdc',
      firstNationsProxy: 'indian-reserves-administrative-boundaries',
      forestData: 'vri-2024-forest-vegetation-composite-rank-1-layer-r1-'
    },
    areas: areaOutputs
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
