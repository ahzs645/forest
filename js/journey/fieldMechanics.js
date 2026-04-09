/**
 * Field Mechanics
 * Travel calculations and field day execution
 */

import { PACE_OPTIONS, BASE_DAILY_TRAVEL_KM, DAILY_TRAVEL_VARIANCE } from './constants.js';
import {
  getCurrentBlock,
  getNextBlock,
  advanceBlocksForDistance,
  getCumulativeDistanceToIndex,
  getCurrentSegmentLength,
  getDistanceIntoCurrentSegment
} from './blockNav.js';
import { getOperationalProgress, recordProgressMilestones } from './progress.js';
import {
  applyRandomInjury,
  applyStatusEffect,
  getActiveCrewCount,
  getTotalWorkCapacity,
  processDailyUpdate
} from '../crew.js';
import {
  calculateFieldConsumption,
  applyConsumption,
  checkResourceStatus,
  FIELD_RESOURCES
} from '../resources.js';
import { TERRAIN_TYPES, getRandomWeather, getTemperature } from '../data/blocks.js';
import { addDiscoveryTags, inferDiscoveryTagsFromAccess } from '../data/discoveryTags.js';

const ACCESS_NO_GO_HAZARDS = new Set([
  'washout',
  'glacial_outburst',
  'karst_collapse',
  'hidden_cavities',
  'flood',
  'cultural_protocol'
]);

const ACCESS_HELI_HAZARDS = new Set([
  'rockslide',
  'glacial_current',
  'weather_delay',
  'narrow'
]);

const ACCESS_WINTER_HAZARDS = new Set([
  'bog',
  'subsidence',
  'permafrost',
  'road_damage',
  'river_crossing',
  'fish_timing',
  'snow'
]);

const ACCESS_REHAB_HAZARDS = new Set([
  'deadfall',
  'falling_timber',
  'windthrow',
  'hang_ups',
  'brush',
  'erosion',
  'tire_damage',
  'grade',
  'visual_constraint',
  'water_intake',
  'traffic',
  'industrial',
  'h2s',
  'caribou',
  'restrictions',
  'wildlife',
  'moose',
  'grizzly',
  'bridge_weight'
]);

const ACCESS_AIR_FEATURES = new Set([
  'remote_camp',
  'helicopter',
  'bush_plane'
]);

const ACCESS_SENSITIVE_FEATURES = new Set([
  'community_water',
  'watershed',
  'salmon_river',
  'fish_habitat',
  'first_nation',
  'cultural_site',
  'culturally_modified_trees',
  'caribou_habitat',
  'sensitive_area',
  'visual_quality_zone'
]);

const ROAD_WEAR_HAZARDS = new Set([
  'road_damage',
  'grade',
  'traffic',
  'industrial',
  'tire_damage',
  'bridge_weight'
]);

const WATER_SENSITIVE_FEATURES = new Set([
  'community_water',
  'watershed',
  'water_intake',
  'salmon_river',
  'fish_habitat'
]);

const WATER_SENSITIVE_HAZARDS = new Set([
  'river_crossing',
  'flood',
  'washout',
  'erosion',
  'bog',
  'subsidence'
]);

function normalizeAccessToken(value) {
  return String(value || '').trim().toLowerCase();
}

function labelizeAccessToken(value) {
  return normalizeAccessToken(value).replace(/_/g, ' ');
}

function addUniqueReason(bucket, reason) {
  if (!reason || bucket.includes(reason)) {
    return;
  }
  bucket.push(reason);
}

function buildAccessSummary(verdictId, reasons, weather) {
  const leadReasons = (reasons || []).slice(0, 2).map(labelizeAccessToken).filter(Boolean);
  const leadText = leadReasons.length > 0 ? leadReasons.join(' and ') : '';
  const weatherText = weather?.name ? `${labelizeAccessToken(weather.name)} weather` : '';
  const joined = [leadText, weatherText].filter(Boolean).join(' with ');

  switch (verdictId) {
    case 'no_go':
      return joined ? `${joined} makes this a no-go.` : 'This block is a no-go for now.';
    case 'heli_only':
      return joined ? `${joined} points to heli-only access.` : 'Heli-only access is the cleanest option here.';
    case 'winter_only':
      return joined ? `${joined} reads as winter-only until the ground firms up.` : 'Winter-only access looks safer here.';
    case 'rehab_needed':
      return joined ? `${joined} means this block needs rehab before it is cleanly usable.` : 'This block needs rehab before it is cleanly usable.';
    default:
      return leadText
        ? `Routine access for now, with ${leadText} to keep watching.`
        : 'Routine access for now.';
  }
}

function getAccessStance(routePlan, paceId) {
  if (routePlan?.shortLabel === 'shortcut' || paceId === 'grueling' || paceId === 'fast') {
    return 'aggressive';
  }
  if (routePlan?.shortLabel === 'detour' || paceId === 'slow') {
    return 'cautious';
  }
  return 'observe';
}

function getSeasonId(journey) {
  return normalizeAccessToken(journey?.season?.currentSeason || null);
}

function clampObservationScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function getLifecycleBand(score, bands) {
  for (const band of bands) {
    if (score <= band.max) {
      return band;
    }
  }

  return bands[bands.length - 1];
}

function classifyRoadLifecycle(score) {
  return getLifecycleBand(score, [
    { max: 12, id: 'good', label: 'Good' },
    { max: 28, id: 'watch', label: 'Watch' },
    { max: 48, id: 'rough', label: 'Rough' },
    { max: 68, id: 'repair_needed', label: 'Repair Needed' },
    { max: 100, id: 'out_of_service', label: 'Out of Service' }
  ]);
}

function classifyCrossingCondition(score) {
  return getLifecycleBand(score, [
    { max: 6, id: 'clear_window', label: 'Clear Window' },
    { max: 14, id: 'timing_sensitive', label: 'Timing Sensitive' },
    { max: 24, id: 'high_water', label: 'High Water' },
    { max: 100, id: 'restricted', label: 'Restricted' }
  ]);
}

function classifyWatershedPressure(score) {
  return getLifecycleBand(score, [
    { max: 4, id: 'low', label: 'Low' },
    { max: 10, id: 'watch', label: 'Watch' },
    { max: 18, id: 'elevated', label: 'Elevated' },
    { max: 100, id: 'critical', label: 'Critical' }
  ]);
}

function ensureRoadAssets(journey) {
  if (!journey) {
    return { byBlock: {}, observations: [] };
  }

  if (!journey.roadAssets) {
    journey.roadAssets = {
      byBlock: {},
      observations: []
    };
  }

  if (!journey.roadAssets.byBlock) {
    journey.roadAssets.byBlock = {};
  }

  if (!Array.isArray(journey.roadAssets.observations)) {
    journey.roadAssets.observations = [];
  }

  return journey.roadAssets;
}

function summarizeInfrastructure(infra) {
  if (!infra) {
    return '';
  }

  const pieces = [];
  if (infra.roadLifecycleLabel) {
    pieces.push(`road ${infra.roadLifecycleLabel.toLowerCase()}`);
  }
  if (infra.crossingConditionLabel) {
    pieces.push(`crossing ${infra.crossingConditionLabel.toLowerCase()}`);
  }
  if (infra.watershedPressureLabel) {
    pieces.push(`watershed ${infra.watershedPressureLabel.toLowerCase()}`);
  }

  return pieces.join('; ');
}

function buildFieldInfrastructureProfile(block, weather, journey, existingState = null) {
  const terrain = normalizeAccessToken(block?.terrain);
  const hazards = new Set((block?.hazards || []).map(normalizeAccessToken).filter(Boolean));
  const features = new Set((block?.features || []).map(normalizeAccessToken).filter(Boolean));
  const seasonId = getSeasonId(journey);
  const paceId = normalizeAccessToken(journey?.pace);
  const routeLabel = normalizeAccessToken(journey?.routePlan?.shortLabel);

  let roadWear = clampObservationScore(existingState?.roadWear);
  let crossingWear = clampObservationScore(existingState?.crossingWear);
  let watershedPressure = clampObservationScore(existingState?.watershedPressure);

  if (terrain === 'steep' || terrain === 'hilly') {
    roadWear += 2;
  } else if (terrain === 'river') {
    roadWear += 1;
    crossingWear += 3;
  } else if (terrain === 'muskeg') {
    roadWear += 1;
    crossingWear += 1;
  }

  for (const hazard of hazards) {
    if (ROAD_WEAR_HAZARDS.has(hazard)) {
      roadWear += hazard === 'bridge_weight' ? 3 : hazard === 'road_damage' ? 2 : 1;
    }
    if (WATER_SENSITIVE_HAZARDS.has(hazard)) {
      crossingWear += hazard === 'flood' || hazard === 'washout' ? 3 : 2;
      watershedPressure += 1;
    }
    if (hazard === 'fish_timing') {
      watershedPressure += 1;
    }
  }

  for (const feature of features) {
    if (!WATER_SENSITIVE_FEATURES.has(feature)) {
      continue;
    }

    watershedPressure += feature === 'water_intake' || feature === 'community_water' ? 2 : 1;
    crossingWear += feature === 'water_intake' || feature === 'community_water' ? 1 : 0;
  }

  if (weather?.id === 'storm' || weather?.id === 'heavy_rain') {
    roadWear += 2;
    crossingWear += 3;
    watershedPressure += 2;
  } else if (weather?.id === 'heavy_snow') {
    roadWear += 1;
    crossingWear += terrain === 'river' || hazards.has('river_crossing') ? 1 : 0;
  } else if (weather?.id === 'freezing') {
    roadWear += 1;
    crossingWear -= terrain === 'river' || hazards.has('river_crossing') ? 2 : 0;
  } else if (weather?.id === 'fog') {
    roadWear += 1;
  }

  if (seasonId === 'spring' && (crossingWear > 0 || watershedPressure > 0)) {
    crossingWear += 2;
    watershedPressure += 2;
  }

  if (seasonId === 'summer' || seasonId === 'fall') {
    watershedPressure += features.has('community_water') || features.has('water_intake') ? 1 : 0;
  }

  if (routeLabel === 'shortcut' || paceId === 'grueling' || paceId === 'fast') {
    roadWear += 1;
    crossingWear += 1;
  } else if (routeLabel === 'detour' || paceId === 'slow') {
    roadWear = Math.max(0, roadWear - 1);
    crossingWear = Math.max(0, crossingWear - 1);
  }

  roadWear = clampObservationScore(roadWear);
  crossingWear = clampObservationScore(crossingWear);
  watershedPressure = clampObservationScore(watershedPressure);

  const roadLifecycle = classifyRoadLifecycle(roadWear);
  const crossingCondition = classifyCrossingCondition(crossingWear);
  const watershedCondition = classifyWatershedPressure(watershedPressure);

  let scrutinyDelta = 0;
  if (roadLifecycle.id === 'repair_needed') {
    scrutinyDelta += 1;
  } else if (roadLifecycle.id === 'out_of_service') {
    scrutinyDelta += 2;
  }
  if (crossingCondition.id === 'high_water') {
    scrutinyDelta += 1;
  } else if (crossingCondition.id === 'restricted') {
    scrutinyDelta += 2;
  }
  if (watershedCondition.id === 'critical') {
    scrutinyDelta += 1;
  }

  return {
    roadWear,
    crossingWear,
    watershedPressure,
    roadLifecycleId: roadLifecycle.id,
    roadLifecycleLabel: roadLifecycle.label,
    crossingConditionId: crossingCondition.id,
    crossingConditionLabel: crossingCondition.label,
    watershedPressureId: watershedCondition.id,
    watershedPressureLabel: watershedCondition.label,
    scrutinyDelta,
    summary: summarizeInfrastructure({
      roadLifecycleLabel: roadLifecycle.label,
      crossingConditionLabel: crossingCondition.label,
      watershedPressureLabel: watershedCondition.label
    })
  };
}

function recordRoadObservation(journey, block, verdict, weather = null) {
  if (!journey || !block?.id || !verdict) {
    return null;
  }

  const roadAssets = ensureRoadAssets(journey);
  const existing = roadAssets.byBlock[block.id] || null;
  const profile = buildFieldInfrastructureProfile(block, weather, journey, existing);

  const observation = {
    blockId: block.id,
    blockName: block.name || block.id,
    day: journey.day || null,
    weatherId: weather?.id || null,
    verdictId: verdict.id || null,
    roadWear: profile.roadWear,
    crossingWear: profile.crossingWear,
    watershedPressure: profile.watershedPressure,
    roadLifecycleId: profile.roadLifecycleId,
    roadLifecycleLabel: profile.roadLifecycleLabel,
    crossingConditionId: profile.crossingConditionId,
    crossingConditionLabel: profile.crossingConditionLabel,
    watershedPressureId: profile.watershedPressureId,
    watershedPressureLabel: profile.watershedPressureLabel,
    summary: profile.summary
  };

  roadAssets.byBlock[block.id] = observation;
  roadAssets.observations.unshift(observation);
  if (roadAssets.observations.length > 24) {
    roadAssets.observations.length = 24;
  }

  return observation;
}

export function formatInfrastructureStatus(verdict) {
  if (!verdict) {
    return '';
  }

  const pieces = [];
  if (verdict.roadLifecycleLabel) {
    pieces.push(`Road: ${verdict.roadLifecycleLabel}`);
  }
  if (verdict.crossingConditionLabel) {
    pieces.push(`Crossing: ${verdict.crossingConditionLabel}`);
  }
  if (verdict.watershedPressureLabel) {
    pieces.push(`Watershed: ${verdict.watershedPressureLabel}`);
  }

  return pieces.length > 0 ? pieces.join(' | ') : '';
}

export function recordAccessVerdict(journey, block, verdict, weather = null) {
  if (!journey || !block?.id || !verdict) {
    return verdict;
  }

  if (!journey.accessVerdicts) {
    journey.accessVerdicts = {};
  }

  journey.accessVerdicts[block.id] = {
    ...verdict,
    weatherId: weather?.id || null,
    weatherName: weather?.name || null,
    day: journey.day || null
  };

  recordRoadObservation(journey, block, verdict, weather);

  return journey.accessVerdicts[block.id];
}

export function getBlockAccessVerdict(block, weather = null, journey = null) {
  const terrain = normalizeAccessToken(block?.terrain);
  const hazards = new Set((block?.hazards || []).map(normalizeAccessToken).filter(Boolean));
  const features = new Set((block?.features || []).map(normalizeAccessToken).filter(Boolean));
  const weatherId = normalizeAccessToken(weather?.id);
  const weatherDangerous = Boolean(weather?.dangerous || ['storm', 'heavy_rain', 'heavy_snow', 'freezing'].includes(weatherId));
  const infrastructure = buildFieldInfrastructureProfile(
    block,
    weather,
    journey,
    journey?.roadAssets?.byBlock?.[block?.id] || null
  );

  const scores = {
    no_go: 0,
    heli_only: 0,
    winter_only: 0,
    rehab_needed: 0
  };

  const reasons = {
    no_go: [],
    heli_only: [],
    winter_only: [],
    rehab_needed: []
  };

  if (infrastructure.roadLifecycleId === 'rough') {
    scores.rehab_needed += 1;
    addUniqueReason(reasons.rehab_needed, 'rough road asset');
  } else if (infrastructure.roadLifecycleId === 'repair_needed') {
    scores.rehab_needed += 2;
    addUniqueReason(reasons.rehab_needed, 'road repair required');
  } else if (infrastructure.roadLifecycleId === 'out_of_service') {
    scores.no_go += 1;
    addUniqueReason(reasons.no_go, 'road out of service');
  }

  if (infrastructure.crossingConditionId === 'timing_sensitive') {
    scores.winter_only += 1;
    addUniqueReason(reasons.winter_only, 'water timing window');
  } else if (infrastructure.crossingConditionId === 'high_water') {
    scores.no_go += 1;
    addUniqueReason(reasons.no_go, 'high water crossing');
  } else if (infrastructure.crossingConditionId === 'restricted') {
    scores.no_go += 2;
    addUniqueReason(reasons.no_go, 'crossing restricted');
  }

  if (infrastructure.watershedPressureId === 'elevated') {
    scores.rehab_needed += 1;
    addUniqueReason(reasons.rehab_needed, 'community watershed watch');
  } else if (infrastructure.watershedPressureId === 'critical') {
    scores.no_go += 1;
    addUniqueReason(reasons.no_go, 'community watershed pressure');
  }

  if (terrain === 'river') {
    scores.winter_only += 1;
    addUniqueReason(reasons.winter_only, 'river crossing');
  } else if (terrain === 'steep') {
    scores.heli_only += 1;
    scores.rehab_needed += 1;
    addUniqueReason(reasons.heli_only, 'steep ground');
  } else if (terrain === 'muskeg') {
    scores.winter_only += 1;
    addUniqueReason(reasons.winter_only, 'muskeg');
  } else if (terrain === 'cutblock') {
    scores.rehab_needed += 1;
    addUniqueReason(reasons.rehab_needed, 'active cutblock');
  } else if (terrain === 'hilly') {
    scores.rehab_needed += 1;
  }

  for (const hazard of hazards) {
    if (ACCESS_NO_GO_HAZARDS.has(hazard)) {
      scores.no_go += 4;
      addUniqueReason(reasons.no_go, hazard);
      continue;
    }

    if (ACCESS_HELI_HAZARDS.has(hazard)) {
      scores.heli_only += 3;
      addUniqueReason(reasons.heli_only, hazard);
      continue;
    }

    if (ACCESS_WINTER_HAZARDS.has(hazard)) {
      scores.winter_only += 2;
      addUniqueReason(reasons.winter_only, hazard);
      continue;
    }

    if (ACCESS_REHAB_HAZARDS.has(hazard)) {
      scores.rehab_needed += 1;
      addUniqueReason(reasons.rehab_needed, hazard);
    }
  }

  if (features.has('bridge')) {
    scores.rehab_needed = Math.max(0, scores.rehab_needed - 1);
  }

  if (ACCESS_AIR_FEATURES.has('remote_camp') && features.has('remote_camp')) {
    scores.heli_only += 2;
    addUniqueReason(reasons.heli_only, 'remote camp staging');
  }
  if (features.has('helicopter')) {
    scores.heli_only += 2;
    addUniqueReason(reasons.heli_only, 'helicopter staging');
  }
  if (features.has('bush_plane')) {
    scores.heli_only += 2;
    addUniqueReason(reasons.heli_only, 'bush plane staging');
  }

  for (const feature of features) {
    if (!ACCESS_SENSITIVE_FEATURES.has(feature)) {
      continue;
    }

    if (feature === 'community_water' || feature === 'watershed' || feature === 'salmon_river' || feature === 'fish_habitat') {
      scores.rehab_needed += 1;
      addUniqueReason(reasons.rehab_needed, feature);
      continue;
    }

    if (feature === 'caribou_habitat' || feature === 'sensitive_area') {
      scores.winter_only += 1;
      addUniqueReason(reasons.winter_only, feature);
      continue;
    }

    if (feature === 'first_nation' || feature === 'cultural_site' || feature === 'culturally_modified_trees') {
      scores.rehab_needed += 1;
      addUniqueReason(reasons.rehab_needed, feature);
      continue;
    }

    scores.rehab_needed += 1;
    addUniqueReason(reasons.rehab_needed, feature);
  }

  if (weatherId === 'freezing' || weatherId === 'heavy_snow') {
    const winterSensitive = hazards.has('bog')
      || hazards.has('subsidence')
      || hazards.has('permafrost')
      || hazards.has('road_damage')
      || hazards.has('river_crossing')
      || terrain === 'muskeg'
      || terrain === 'river';

    if (winterSensitive && scores.winter_only > 0 && scores.no_go < 4) {
      scores.winter_only = Math.max(0, scores.winter_only - 1);
      addUniqueReason(reasons.winter_only, 'frozen window');
    }
  }

  if (weatherId === 'storm' || weatherId === 'heavy_rain') {
    if (hazards.has('flood') || hazards.has('washout') || hazards.has('erosion') || terrain === 'river') {
      scores.no_go += 2;
      addUniqueReason(reasons.no_go, weatherId === 'storm' ? 'storm conditions' : 'heavy rain');
    } else {
      scores.heli_only += 1;
    }
  }

  if (weatherId === 'fog' && (terrain === 'steep' || terrain === 'river' || features.has('viewpoint'))) {
    scores.heli_only += 1;
    addUniqueReason(reasons.heli_only, 'low visibility');
  }

  if (weatherDangerous && (terrain === 'steep' || terrain === 'river')) {
    scores.no_go += 1;
  }

  let verdictId = 'passable_now';
  if (scores.no_go >= 4) {
    verdictId = 'no_go';
  } else if (scores.heli_only >= 4 && scores.heli_only >= scores.winter_only && scores.heli_only >= scores.rehab_needed) {
    verdictId = 'heli_only';
  } else if (scores.winter_only >= 3 && scores.winter_only >= scores.rehab_needed) {
    verdictId = 'winter_only';
  } else if (scores.rehab_needed >= 2) {
    verdictId = 'rehab_needed';
  }

  const summary = buildAccessSummary(verdictId, reasons[verdictId], weather);

  return {
    id: verdictId,
    label: {
      passable_now: 'Passable now',
      rehab_needed: 'Rehab needed',
      winter_only: 'Winter-only',
      heli_only: 'Heli-only',
      no_go: 'No-go'
    }[verdictId] || 'Passable now',
    summary,
    reasons: reasons[verdictId] || [],
    weatherId: weatherId || null,
    terrain: terrain || null,
    roadLifecycleId: infrastructure.roadLifecycleId,
    roadLifecycleLabel: infrastructure.roadLifecycleLabel,
    crossingConditionId: infrastructure.crossingConditionId,
    crossingConditionLabel: infrastructure.crossingConditionLabel,
    watershedPressureId: infrastructure.watershedPressureId,
    watershedPressureLabel: infrastructure.watershedPressureLabel,
    scrutinyDelta: infrastructure.scrutinyDelta,
    infrastructureSummary: infrastructure.summary
  };
}

function recordAccessDiscoveryTags(journey, block, verdict, weather = null) {
  const tagIds = inferDiscoveryTagsFromAccess(block, verdict, weather);
  if (!tagIds.length) {
    return [];
  }

  return addDiscoveryTags(journey, tagIds, {
    source: `access:${block?.id || 'unknown'}`,
    severity: verdict?.id === 'no_go' ? 3 : 2,
    note: verdict?.summary || null,
    details: {
      blockId: block?.id || null,
      verdict: verdict?.id || null
    }
  });
}

export function applyAccessVerdictPressure(journey, verdict, context = {}) {
  if (!journey || !verdict?.id) {
    return 0;
  }

  const stance = normalizeAccessToken(context.stance || 'observe');
  const baseByVerdict = {
    passable_now: 0,
    rehab_needed: 0,
    winter_only: 1,
    heli_only: 2,
    no_go: 2
  };
  const stanceAdjustment = {
    cautious: -1,
    observe: 0,
    aggressive: 1
  };

  let delta = (baseByVerdict[verdict.id] || 0) + (stanceAdjustment[stance] || 0) + (Number(verdict.scrutinyDelta) || 0);

  if (verdict.id === 'passable_now' && stance === 'cautious') {
    delta = -1;
  }

  delta = Math.max(-1, Math.min(3, delta));

  if (delta !== 0) {
    const current = Number(journey.scrutiny ?? journey.heat ?? 0);
    const next = Math.max(0, current + delta);
    journey.scrutiny = next;
    if (Object.prototype.hasOwnProperty.call(journey, 'heat')) {
      journey.heat = next;
    }
  }

  return delta;
}

export function formatAccessVerdict(verdict) {
  if (!verdict?.id) {
    return 'Access verdict: Passable now';
  }

  const base = `Access verdict: ${verdict.label}${verdict.summary ? ` - ${verdict.summary}` : ''}`;
  const infrastructure = formatInfrastructureStatus(verdict);
  return infrastructure ? `${base} | ${infrastructure}` : base;
}

function getCrewTravelModifier(journey) {
  const activeCrew = getActiveCrewCount(journey.crew);
  if (activeCrew <= 0) {
    return 0;
  }

  const totalCapacity = getTotalWorkCapacity(journey.crew);
  const averageCapacity = totalCapacity / activeCrew;
  return Math.max(0.45, Math.min(1, 0.5 + averageCapacity * 0.5));
}

function getRationFactor(journey) {
  return journey.rationPlan?.mode === 'short' ? 0.65 : 1;
}

function travelDistanceForDay(journey, paceId) {
  const pace = PACE_OPTIONS[paceId] || PACE_OPTIONS.normal;
  if (!pace.distanceMultiplier || pace.distanceMultiplier <= 0) {
    return 0;
  }

  const currentBlock = getCurrentBlock(journey);
  const terrain = TERRAIN_TYPES[currentBlock?.terrain] || TERRAIN_TYPES.flat;
  const weatherMod = journey.weather?.travelModifier || 1;
  const routeMod = journey.routePlan?.distanceMultiplier ?? 1;
  const crewTravelMod = getCrewTravelModifier(journey);

  const delayHours = Math.min(8, Math.max(0, journey.travelDelayHours || 0));
  const timeModifier = Math.max(0, 1 - delayHours / 8);
  const variance = 1 + (Math.random() * 2 - 1) * DAILY_TRAVEL_VARIANCE;
  const distance = BASE_DAILY_TRAVEL_KM * pace.distanceMultiplier * terrain.speed * weatherMod * variance * timeModifier * routeMod * crewTravelMod;
  return Math.max(0, distance);
}

/**
 * Calculate travel distance for a day
 * @param {Object} journey - Journey state
 * @param {string} paceId - Selected pace
 * @returns {Object} Distance info
 */
export function calculateTravelDistance(journey, paceId) {
  const currentBlock = getCurrentBlock(journey);
  const nextBlock = getNextBlock(journey);
  const terrain = TERRAIN_TYPES[currentBlock?.terrain] || TERRAIN_TYPES.flat;

  const distance = travelDistanceForDay(journey, paceId);

  if (!nextBlock) {
    return { distance: 0, reachesBlock: false, blockName: null };
  }

  const segmentLength = getCurrentSegmentLength(journey.blocks, journey.currentBlockIndex);
  const distanceIntoSegment = getDistanceIntoCurrentSegment(journey);
  const remaining = Math.max(0, segmentLength - distanceIntoSegment);
  const reachesBlock = distance >= remaining && remaining > 0;

  return {
    distance: Math.round(distance * 10) / 10,
    reachesBlock: Boolean(reachesBlock),
    blockName: reachesBlock ? nextBlock.name : null,
    terrain: terrain.name,
    weatherEffect: journey.weather?.name
  };
}

/**
 * Execute a day of field travel
 * @param {Object} journey - Journey state
 * @param {string} paceId - Selected pace
 * @returns {Object} Result with updated journey and messages
 */
export function executeFieldDay(journey, paceId) {
  const messages = [];
  let effectivePaceId = paceId;
  let pace = PACE_OPTIONS[paceId] || PACE_OPTIONS.normal;

  // Track previous progress for milestone detection
  const prevProgress = getOperationalProgress(journey);
  const dayNumber = journey.day;
  const startBlock = getCurrentBlock(journey);
  const nextBlockAtStart = getNextBlock(journey);
  const weatherToday = journey.weather;
  const routePlan = journey.routePlan || null;

  // Block travel if fuel or equipment is depleted
  if (pace.distanceMultiplier > 0) {
    if (journey.resources.fuel <= 0) {
      messages.push('No fuel left. The crew stays in camp.');
      effectivePaceId = 'camp_work';
      pace = PACE_OPTIONS.camp_work;
    } else if (journey.resources.equipment <= 0) {
      messages.push('Critical equipment failure. The crew stays in camp.');
      effectivePaceId = 'camp_work';
      pace = PACE_OPTIONS.camp_work;
    }
  }

  // Calculate travel
  const travelInfo = calculateTravelDistance(journey, effectivePaceId);

  // Update distance
  journey.distanceTraveled = Math.min(journey.totalDistance, journey.distanceTraveled + travelInfo.distance);
  journey.pace = effectivePaceId;

  if (travelInfo.distance > 0) {
    messages.push(`Covered ${travelInfo.distance} km of traverse at ${pace.name} pace.`);
  } else {
    if (effectivePaceId === 'resting') {
      messages.push('The crew stood down and recovered this shift.');
    } else {
      messages.push('The crew stayed in camp for the shift.');
    }
  }

  recordProgressMilestones(journey, prevProgress, messages, dayNumber);

  const arrivals = advanceBlocksForDistance(journey);
  if (arrivals.length > 0) {
    for (const block of arrivals) {
      if (!block) continue;
      messages.push(`Arrived at ${block.name}.`);
      if (block.description) {
        messages.push(block.description);
      }
      const accessVerdict = recordAccessVerdict(
        journey,
        block,
        getBlockAccessVerdict(block, weatherToday, journey),
        weatherToday
      );
      recordAccessDiscoveryTags(journey, block, accessVerdict, weatherToday);
      messages.push(formatAccessVerdict(accessVerdict));

      const scrutinyDelta = applyAccessVerdictPressure(journey, accessVerdict, {
        stance: getAccessStance(routePlan, effectivePaceId)
      });
      if (scrutinyDelta > 0) {
        messages.push(`Scrutiny rises by ${scrutinyDelta}.`);
      } else if (scrutinyDelta < 0) {
        messages.push(`Scrutiny eases by ${Math.abs(scrutinyDelta)}.`);
      }
    }
  }

  // Check for victory
  if (journey.distanceTraveled >= journey.totalDistance || journey.currentBlockIndex >= journey.blocks.length - 1) {
    journey.isComplete = true;
    messages.push('You have completed the block sequence!');
  }

  // Calculate resource consumption
  const currentBlock = getCurrentBlock(journey);
  const terrain = currentBlock?.terrain || 'flat';
  const consumption = calculateFieldConsumption(
    {
      pace: effectivePaceId,
      terrain,
      weather: journey.temperature,
      weatherCondition: journey.weather,
      rationFactor: getRationFactor(journey),
      routeFuelMultiplier: routePlan?.fuelMultiplier ?? 1,
      routeEquipmentMultiplier: routePlan?.equipmentMultiplier ?? 1
    },
    getActiveCrewCount(journey.crew)
  );

  // Apply consumption
  const consumptionResult = applyConsumption(
    journey.resources,
    consumption,
    FIELD_RESOURCES
  );
  journey.resources = consumptionResult.resources;

  // Add consumption warnings
  for (const warning of consumptionResult.warnings) {
    messages.push(`Warning: ${warning.resource} is running low (${warning.value} ${warning.unit}).`);
  }
  for (const critical of consumptionResult.critical) {
    messages.push(`CRITICAL: ${critical.resource} is almost gone! (${critical.value} ${critical.unit})`);
  }

  // Process crew daily updates
  const conditions = {
    restDay: effectivePaceId === 'resting',
    gruelingPace: effectivePaceId === 'grueling',
    shortRations: journey.rationPlan?.mode === 'short',
    lowFood: journey.resources.food <= 5,
    coldWeather: journey.temperature === 'cold' || journey.temperature === 'freezing',
    currentDay: journey.day
  };

  for (const member of journey.crew) {
    // Apply pace effects
    if (pace.healthBonus !== 0) {
      member.health = Math.max(0, Math.min(100, member.health + pace.healthBonus));
    }
    if (pace.moraleBonus !== 0) {
      member.morale = Math.max(0, Math.min(100, member.morale + pace.moraleBonus));
    }

    // Apply weather morale effects
    if (weatherToday?.moraleEffect) {
      member.morale = Math.max(0, Math.min(100, member.morale + weatherToday.moraleEffect));
    }

    // Apply health risk from extreme weather
    if (weatherToday?.healthRisk && !conditions.restDay) {
      const healthLoss = Math.floor(Math.random() * 5) + 2;
      member.health = Math.max(0, member.health - healthLoss);
      if (healthLoss > 3) {
        messages.push(`${member.name} suffers from the ${weatherToday.name.toLowerCase()}.`);
      }
    }

    const updateResult = processDailyUpdate(member, conditions);
    messages.push(...updateResult.messages);
  }

  applyRoutePlanConsequences(journey, routePlan, effectivePaceId, startBlock, nextBlockAtStart, messages);

  // Check for game over conditions
  const resourceStatus = checkResourceStatus(journey.resources, FIELD_RESOURCES);
  applyFieldHardships(journey, resourceStatus, messages);

  if (resourceStatus.depleted.some(d => d.id === 'fuel') && (PACE_OPTIONS[effectivePaceId]?.distanceMultiplier ?? 1) > 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'OUT OF FUEL - The crew is stranded.';
    messages.push(journey.gameOverReason);
  }

  if (getActiveCrewCount(journey.crew) === 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'ALL CREW LOST - No one remains to continue the journey.';
    messages.push(journey.gameOverReason);
  }

  // Update weather for next day
  journey.day++;
  journey.weather = getRandomWeather(getCurrentBlock(journey), journey.day);
  journey.temperature = getTemperature(journey.weather, getCurrentBlock(journey));
  journey.travelDelayHours = 0;
  journey.routePlan = null;
  if (journey.rationPlan) {
    journey.rationPlan.mode = 'normal';
  }

  // Log the day with more detail
  journey.log.push({
    day: dayNumber,
    type: 'travel',
    action: pace.name,
    distance: travelInfo.distance,
    location: getCurrentBlock(journey)?.name || startBlock?.name || 'Unknown',
    weather: weatherToday?.name || 'Unknown',
    summary: travelInfo.distance > 0
      ? `Covered ${travelInfo.distance} km (${pace.name})`
      : (paceId === 'resting' ? 'Rested for the shift' : 'Camp tasks for the shift')
  });

  // Log block arrival
  if (arrivals.length > 0) {
    const arrivedBlock = arrivals[arrivals.length - 1] || getCurrentBlock(journey);
    journey.log.push({
      day: dayNumber,
      type: 'arrival',
      location: arrivedBlock?.name || 'New location',
      summary: arrivedBlock?.id && journey?.accessVerdicts?.[arrivedBlock.id]
        ? `Arrived at ${arrivedBlock?.name || 'new location'} (${journey.accessVerdicts[arrivedBlock.id].label})`
        : `Arrived at ${arrivedBlock?.name || 'new location'}`
    });
  }

  return { journey, messages };
}

function applyRoutePlanConsequences(journey, routePlan, paceId, fromBlock, toBlock, messages) {
  if (!routePlan || (PACE_OPTIONS[paceId]?.distanceMultiplier ?? 0) <= 0) {
    return;
  }

  const activeCrew = journey.crew.filter((member) => member.isActive);
  if (activeCrew.length === 0) {
    return;
  }

  if (routePlan.moraleDelta) {
    for (const member of activeCrew) {
      member.morale = Math.max(0, Math.min(100, member.morale + routePlan.moraleDelta));
    }
  }

  if (routePlan.note) {
    messages.push(routePlan.note);
  }

  if (routePlan.injuryRisk > 0) {
    const hazardCount =
      (fromBlock?.hazards?.length || 0) +
      (toBlock?.hazards?.length || 0);
    const paceRisk = paceId === 'grueling' ? 0.1 : paceId === 'fast' ? 0.05 : 0;
    const actualRisk = Math.min(0.75, routePlan.injuryRisk + hazardCount * 0.04 + paceRisk);

    if (Math.random() < actualRisk) {
      const victim = activeCrew[Math.floor(Math.random() * activeCrew.length)];
      const severity = actualRisk >= 0.4 ? 'severe' : 'moderate';
      const result = applyRandomInjury(victim, severity);
      messages.push(`Route mishap! ${result.message}`);
    }
  }
}

function applyFieldHardships(journey, resourceStatus, messages) {
  if (!journey?.resources || typeof journey.resources.food !== 'number') {
    return;
  }

  const pressure = journey.resourcePressure || (journey.resourcePressure = {
    fuel: 0,
    food: 0,
    equipment: 0
  });

  const criticalIds = new Set([
    ...resourceStatus.depleted.map((entry) => entry.id),
    ...resourceStatus.critical.map((entry) => entry.id)
  ]);

  for (const resourceId of ['fuel', 'food', 'equipment']) {
    pressure[resourceId] = criticalIds.has(resourceId)
      ? Number(pressure[resourceId] || 0) + 1
      : 0;
  }

  if (pressure.food >= 2) {
    messages.push('Rationing has set in. The crew is visibly weakening from sustained shortages.');
    for (const member of journey.crew) {
      if (!member.isActive) continue;
      member.health = Math.max(0, member.health - 4);
      member.morale = Math.max(0, member.morale - 6);

      if (pressure.food >= 3 && journey.resources.food <= FIELD_RESOURCES.food.critical) {
        const result = applyStatusEffect(member, 'exhaustion');
        if (result.message) {
          messages.push(result.message);
        }
      }
    }
  }

  if (pressure.equipment >= 2) {
    messages.push('Failing gear is slowing camp tasks and turning routine work into injury bait.');
    for (const member of journey.crew) {
      if (!member.isActive) continue;
      member.morale = Math.max(0, member.morale - 4);
    }

    if (pressure.equipment >= 3) {
      const victim = journey.crew.find((member) => member.isActive);
      if (victim) {
        const result = applyStatusEffect(victim, 'sprained_ankle');
        if (result.message) {
          messages.push(result.message);
        }
      }
    }
  }

  if (pressure.fuel >= 2 && typeof journey.resources.budget === 'number') {
    const scavengingCost = 120 * pressure.fuel;
    journey.resources.budget = Math.max(0, journey.resources.budget - scavengingCost);
    messages.push(`Emergency fuel scavenging burned $${scavengingCost.toLocaleString()} in cash and favors.`);
  }
}
