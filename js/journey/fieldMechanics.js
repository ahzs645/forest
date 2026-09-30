/**
 * Field Mechanics
 * Travel calculations and field day execution
 */

import {
  PACE_OPTIONS,
  BASE_DAILY_TRAVEL_KM,
  DAILY_TRAVEL_VARIANCE,
  ARRIVAL_SNAP_KM,
  MAX_EVENT_TRAVEL_BONUS_KM,
  STARVATION_WALKOFF_DAYS
} from './constants.js';
import {
  getCurrentBlock,
  getNextBlock,
  advanceBlocksForDistance,
  getCurrentSegmentLength,
  getDistanceIntoCurrentSegment
} from './blockNav.js';
import { ensureRouteConstraints, getActiveRouteConstraint } from './routeConstraints.js';
import { getOperationalProgress, recordProgressMilestones } from './progress.js';
import {
  applyRandomInjury,
  applyStatusEffect,
  describeDeparture,
  evacuateIfInjuryRequires,
  getActiveCrewCount,
  getTotalWorkCapacity,
  hasActiveFirstAidAttendant,
  processDailyUpdate
} from '../crew.js';
import { getDayRng } from '../events/dayRng.js';
import { checkScheduledEvents } from '../events/scheduled.js';
import {
  calculateFieldConsumption,
  applyConsumption,
  checkResourceStatus,
  FIELD_RESOURCES
} from '../resources.js';
import { TERRAIN_TYPES, getRandomWeather, getTemperature } from '../data/blocks.js';
import { advanceDay as advanceSeasonDay, getSeasonModifiers } from '../season.js';
import { addDiscoveryTags, inferDiscoveryTagsFromAccess } from '../data/discoveryTags.js';
import { JOURNEY_MILESTONES, MILESTONE_COPY } from './constants.js';
import { allPackagesFinalized, getPackageProgress, isPackageBlock } from './packages.js';

// The road verdict is about the road: fill, grade, crossings, drainage. Values
// constraints — moose winter range, caribou, VQO, CMTs, a Nation's protocol —
// belong to the values sweep and the site plan, not to whether a truck can get
// there today. They used to score here too, which is how a public road came
// out "heli-only" and a territory marker came out "no-go".
const ACCESS_NO_GO_HAZARDS = new Set([
  'washout',
  'glacial_outburst',
  'karst_collapse',
  'hidden_cavities',
  'flood'
]);

// A rockslide-prone grade or a one-lane canyon road is rough road, not a
// reason to fly. Air access comes from features (a fly-in camp) below.
const ACCESS_HELI_HAZARDS = new Set([
  'weather_delay'
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
  'rough_surface',
  'grade',
  'rockslide',
  'narrow',
  'traffic',
  'industrial',
  'h2s',
  'bridge_weight'
]);

const ACCESS_AIR_FEATURES = new Set([
  'remote_camp',
  'helicopter',
  'bush_plane'
]);

const ROAD_WEAR_HAZARDS = new Set([
  'road_damage',
  'grade',
  'traffic',
  'industrial',
  'tire_damage',
  'bridge_weight',
  'washout',
  'flood',
  'glacial_outburst'
]);

// Reasons that mean the crossing, not the road surface, is what needs work.
const CROSSING_REASON_PATTERN = /crossing|water|river|washout|bridge|culvert|outburst|flood|freshet/i;

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

function buildAccessSummary(verdictId, reasons) {
  const leadReasons = (reasons || []).slice(0, 2).map(labelizeAccessToken).filter(Boolean);
  const lead = leadReasons.length > 0 ? leadReasons.join(' and ') : '';

  switch (verdictId) {
    case 'no_go':
      return lead ? `Do not proceed: ${lead}.` : 'Do not proceed under current conditions.';
    case 'heli_only':
      return lead ? `Air access only: ${lead}.` : 'Air access only.';
    case 'winter_only':
      return lead ? `Frozen-ground access only: ${lead}.` : 'Frozen-ground access only.';
    case 'rehab_needed':
      return lead ? `Road work needed before routine use: ${lead}.` : 'Road work needed before routine use.';
    default:
      return lead ? `Routine truck access; keep an eye on ${lead}.` : 'Routine truck access.';
  }
}

/**
 * The two answers a road check actually gives the file: can the crew truck
 * get in today, and what does development need before harvest traffic.
 * @param {string} verdictId
 * @param {string[]} reasons
 * @param {Object|null} weather
 * @param {Object} infrastructure
 * @returns {{todayAccess: string, developmentAccess: string}}
 */
function classifyAccessWindows(verdictId, reasons, weather, infrastructure) {
  const weatherId = normalizeAccessToken(weather?.id);
  const frozen = weatherId === 'freezing' || weatherId === 'heavy_snow';
  const dangerous = Boolean(weather?.dangerous || ['storm', 'heavy_rain', 'heavy_snow', 'freezing'].includes(weatherId));
  const crossingProblem = (reasons || []).some((reason) => CROSSING_REASON_PATTERN.test(String(reason)))
    || infrastructure?.crossingConditionId === 'restricted';

  let todayAccess = '4x4';
  if (verdictId === 'no_go') todayAccess = 'closed';
  else if (verdictId === 'heli_only') todayAccess = 'walk-in';
  else if (verdictId === 'winter_only') todayAccess = frozen ? '4x4' : 'walk-in';
  else if (verdictId === 'rehab_needed' && dangerous) todayAccess = 'walk-in';

  let developmentAccess = 'summer road';
  if (verdictId === 'no_go') developmentAccess = crossingProblem ? 'bridge upgrade required' : 'road rebuild required';
  else if (verdictId === 'heli_only') developmentAccess = 'heli';
  else if (verdictId === 'winter_only') developmentAccess = 'winter road';
  else if (verdictId === 'rehab_needed') developmentAccess = crossingProblem ? 'bridge upgrade required' : 'summer road (rehab first)';

  return { todayAccess, developmentAccess };
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

  if (seasonId === 'spring') {
    // Breakup: soft ground and swollen crossings, whether or not anything was
    // already worn. Muskeg, hills and damaged road all pump in spring.
    if (terrain === 'muskeg' || terrain === 'hilly' || hazards.has('road_damage')) {
      roadWear += 3;
    }
    if (crossingWear > 0 || watershedPressure > 0) {
      crossingWear += 2;
      watershedPressure += 2;
    }
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

  const bridged = features.has('bridge') || features.has('ferry');
  if (infrastructure.crossingConditionId === 'timing_sensitive') {
    if (!bridged) {
      scores.winter_only += 1;
      addUniqueReason(reasons.winter_only, 'water timing window');
    }
  } else if (infrastructure.crossingConditionId === 'high_water') {
    // High water under a bridge is an inspection, not a closure.
    if (bridged) {
      scores.rehab_needed += 1;
      addUniqueReason(reasons.rehab_needed, 'bridge inspection due');
    } else {
      scores.no_go += 1;
      addUniqueReason(reasons.no_go, 'high water crossing');
    }
  } else if (infrastructure.crossingConditionId === 'restricted') {
    scores.no_go += bridged ? 1 : 2;
    addUniqueReason(reasons.no_go, bridged ? 'bridge approach restricted' : 'crossing restricted');
  }

  if (infrastructure.watershedPressureId === 'elevated') {
    scores.rehab_needed += 1;
    addUniqueReason(reasons.rehab_needed, 'community watershed watch');
  } else if (infrastructure.watershedPressureId === 'critical') {
    scores.no_go += 1;
    addUniqueReason(reasons.no_go, 'community watershed pressure');
  }

  if (terrain === 'river') {
    // A bridged or ferried river is crossed on the structure; only an
    // unbridged channel wants frozen ground.
    if (!bridged) {
      scores.winter_only += 1;
      addUniqueReason(reasons.winter_only, 'unbridged crossing');
    }
  } else if (terrain === 'steep') {
    scores.heli_only += 1;
    scores.rehab_needed += 1;
    addUniqueReason(reasons.rehab_needed, 'steep grade');
  } else if (terrain === 'muskeg') {
    scores.winter_only += 1;
    addUniqueReason(reasons.winter_only, 'muskeg');
  } else if (terrain === 'hilly') {
    scores.rehab_needed += 1;
  }

  for (const hazard of hazards) {
    if (ACCESS_NO_GO_HAZARDS.has(hazard)) {
      // A bridged river that floods in freshet is a closure risk to note,
      // not a channel the truck has to enter.
      if (hazard === 'flood' && bridged) {
        scores.rehab_needed += 1;
        addUniqueReason(reasons.rehab_needed, 'freshet closure risk');
        continue;
      }
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
      // A bridged river's "river_crossing" hazard is the bridge, not a ford.
      if (hazard === 'river_crossing' && bridged) continue;
      scores.winter_only += 2;
      addUniqueReason(reasons.winter_only, hazard);
      continue;
    }

    if (ACCESS_REHAB_HAZARDS.has(hazard)) {
      scores.rehab_needed += hazard === 'rockslide' ? 2 : 1;
      const label = hazard === 'rockslide' ? 'slide-prone grade' : hazard === 'grade' ? 'steep grade' : hazard;
      addUniqueReason(reasons.rehab_needed, label);
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
    if (hazards.has('flood') || hazards.has('washout') || hazards.has('erosion') || (terrain === 'river' && !bridged)) {
      scores.no_go += 2;
      addUniqueReason(reasons.no_go, weatherId === 'storm' ? 'storm-swollen crossing' : 'rain-swollen crossing');
    } else {
      scores.rehab_needed += 1;
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

  const summary = buildAccessSummary(verdictId, reasons[verdictId]);
  const windows = classifyAccessWindows(verdictId, reasons[verdictId], weather, infrastructure);

  return {
    id: verdictId,
    label: {
      passable_now: 'Routine access',
      rehab_needed: 'Road work needed',
      winter_only: 'Frozen-ground access',
      heli_only: 'Air access only',
      no_go: 'Do not proceed'
    }[verdictId] || 'Routine access',
    summary,
    todayAccess: windows.todayAccess,
    developmentAccess: windows.developmentAccess,
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

  // Scrutiny only eases when the check actually recorded a finding. Driving
  // the safe line into a block with nothing wrong with it is not a finding.
  if (verdict.id === 'passable_now') {
    delta = Math.max(0, delta);
  }

  delta = Math.max(-1, Math.min(3, delta));

  if (delta !== 0) {
    const current = Number(journey.scrutiny ?? journey.heat ?? 0);
    const next = Math.max(0, Math.min(100, current + delta));
    journey.scrutiny = next;
    if (Object.prototype.hasOwnProperty.call(journey, 'heat')) {
      journey.heat = next;
    }
  }

  return delta;
}

export function formatAccessVerdict(verdict) {
  if (!verdict?.id) {
    return 'Road check: routine truck access.';
  }
  if (verdict.id === 'unverified') {
    return verdict.summary || 'Road check: not recorded yet.';
  }

  const today = verdict.todayAccess || (verdict.id === 'no_go' ? 'closed' : '4x4');
  const development = verdict.developmentAccess || 'summer road';
  return `Today's access: ${today} · Development access: ${development}. ${verdict.summary || ''}`.trim();
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
  // The season drives the road: breakup and early snow slow every leg
  // (js/season.js SEASONAL_MODIFIERS). Summer is the baseline.
  const seasonMod = Number(getSeasonModifiers(getSeasonId(journey), 'recce')?.travelSpeed) || 1;

  // A day's trouble costs ground, not hours (js/events/resolution.js).
  const setback = Math.min(0.75, Math.max(0, journey.travelSetback || 0));
  const timeModifier = 1 - setback;
  const variance = 1 + (Math.random() * 2 - 1) * DAILY_TRAVEL_VARIANCE;
  const distance = BASE_DAILY_TRAVEL_KM * pace.distanceMultiplier * terrain.speed * weatherMod * variance * timeModifier * routeMod * crewTravelMod * seasonMod;
  // Ground an event banked for this leg (applyEventTravelEffect). It is added
  // here, before the leg is clamped to the next stop, so a good road can
  // never carry the crew past a stop, a crossing or a road check.
  const bonus = crewTravelMod > 0 ? Math.max(0, Math.min(MAX_EVENT_TRAVEL_BONUS_KM, journey.travelBonusKm || 0)) : 0;
  return Math.max(0, distance + bonus);
}

const EVENT_EFFECT_BANDS = ['effects', 'partialEffects', 'failureEffects'];

/**
 * Fit a card to the road that is left. At the last stop there is no next leg,
 * so "+5 km on the next leg" is a promise the season cannot keep and "the
 * next leg will be slower" a cost it never pays: the km come off every band.
 * A card about the road ahead (`needsNextLeg`: a trapper's route notes, a
 * grader for the spur) or with an option that offers nothing but ground is
 * not dealt there at all. Anywhere else the card is returned untouched.
 * @param {Object} journey
 * @param {Object|null} event
 * @returns {Object|null}
 */
export function fitEventToRemainingRoute(journey, event) {
  if (!event || !Array.isArray(event.options) || getNextBlock(journey)) return event;
  // A shortcut's payoff is sized and shown by its own builder
  // (js/events/selection.js buildTemptationPayoff); it is not rewritten here.
  if (event.type === 'temptation') return event;
  if (event.needsNextLeg) return null;
  const kmOnly = event.options.some((option) => {
    const effects = option?.effects || {};
    return Number(effects.progress) > 0
      && Object.entries(effects).every(([key, value]) => key === 'progress' || key === 'progressMode' || !value);
  });
  if (kmOnly) return null;
  let changed = false;
  const options = event.options.map((option) => {
    if (!option) return option;
    // Ground and delay both land on the next leg (a timeUsed is a setback).
    const bands = EVENT_EFFECT_BANDS.filter((band) => option[band]
      && ('progress' in option[band] || 'timeUsed' in option[band]));
    if (!bands.length && !('timeUsed' in option)) return option;
    changed = true;
    const { timeUsed: _time, ...fitted } = option;
    for (const band of bands) {
      const { progress: _progress, progressMode: _mode, timeUsed: _bandTime, ...rest } = option[band];
      fitted[band] = rest;
    }
    return fitted;
  });
  return changed ? { ...event, options } : event;
}

/** Field roles whose day runner deals a follow-up as the day's own situation. */
const FOLLOW_UP_AS_SITUATION = new Set(['recon', 'field', 'silviculture']);

/**
 * Hand a follow-up an earlier card scheduled (js/events/scheduled.js) to the
 * field day that is about to run, instead of playing it ahead of the day.
 * Played ahead, it skipped everything the mode does to a card it draws: the
 * silviculture program fit (a "-20 L fuel" chip applied nothing), the crew
 * and route fits, set-aside, and the day it says it takes. The game loop
 * calls this; the mode takes it back with `takeDueFollowUp`.
 * @param {Object} journey
 * @param {Object|null} event - the follow-up, as checkScheduledEvents gives it
 * @returns {boolean} whether the day runner will deal it
 */
export function holdFollowUpForDay(journey, event) {
  if (!event || !FOLLOW_UP_AS_SITUATION.has(journey?.journeyType)) return false;
  journey.dueFollowUp = event;
  return true;
}

/**
 * Today's follow-up, if one is due: the one the game loop held for the day,
 * else the next one on the schedule (a runner driven without the game loop,
 * as the simulations are).
 * @param {Object} journey
 * @returns {Object|null}
 */
export function takeDueFollowUp(journey) {
  const held = journey?.dueFollowUp || null;
  if (held) {
    delete journey.dueFollowUp;
    return held;
  }
  return journey ? checkScheduledEvents(journey) : null;
}

/** Each band's crew effect, with the text that narrates it. */
const CREW_EFFECT_BANDS = [
  ['crewEffect', 'outcome'],
  ['partialCrewEffect', 'partialOutcome'],
  ['failureCrewEffect', 'failureOutcome'],
];

/** What the card calls each recon role when it names the one hurt. */
const RECON_ROLE_NOUNS = {
  faller: 'layout tech',
  bucker: 'timber cruiser',
  spotter: 'compassman',
  driver: 'driver-swamper',
  medic: 'OFA 3 attendant',
  mechanic: 'mechanic',
};

/** Who runs a saw on a recon crew: the line clearers and the truck hands. */
const SAW_HANDS = new Set(['faller', 'driver', 'mechanic']);

function hurtsSomeone(crewEffect) {
  return Boolean(crewEffect && (crewEffect.injury || crewEffect.evacuate));
}

/**
 * The one an injury card hurts, named on the day's dice: never the attendant
 * who treats them unless nobody else is out there, never the hand who radioed
 * it in if anyone else could be, and a saw hand when a saw kicked back.
 */
function pickCasualty(journey, event) {
  const active = (journey.crew || []).filter((member) => member.isActive);
  const field = active.filter((member) => member.role !== 'medic');
  let pool = field.length ? field : active;
  const others = pool.filter((member) => member.id !== event.reporter?.id);
  if (others.length) pool = others;
  if (event.id === 'chainsaw_cut') {
    const saws = pool.filter((member) => SAW_HANDS.has(member.role));
    if (saws.length) pool = saws;
  }
  if (!pool.length) return null;
  const rng = getDayRng(journey, `casualty:${event.id || 'event'}`);
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Fit a card to the crew on the roster.
 *
 * "Send out your sick crew member" on a crew with nobody sick evacuated no
 * one and paid its morale anyway; the option is not offered until someone is
 * carrying a condition.
 *
 * An injury card names the one hurt, and every band lands on them: the
 * medevac used to fly out a random hand, the attendant who was treating the
 * bleed included. The way they leave follows the option taken (a medevac is
 * flown out, an ETV run goes in the ETV), and with the attendant gone the
 * options stop calling on them. The authored event is left alone.
 * @param {Object} journey
 * @param {Object|null} event
 * @returns {Object|null}
 */
export function fitEventToCrew(journey, event) {
  if (!event || !Array.isArray(event.options)) return event;
  const crew = journey?.crew || [];
  const someoneSick = crew.some((member) => member.isActive && (member.statusEffects?.length || 0) > 0);
  const options = someoneSick ? event.options : event.options.filter((option) => !option?.crewEffect?.evacuate_sick);
  if (!options.length) return null;
  const fitted = options.length === event.options.length ? event : { ...event, options };
  return fitCasualty(journey, fitted);
}

function fitCasualty(journey, event) {
  if (event.type === 'temptation') return event;
  const crew = journey.crew || [];
  const attendant = hasActiveFirstAidAttendant(crew);
  const hurts = event.options.some((option) => CREW_EFFECT_BANDS.some(([key]) => hurtsSomeone(option?.[key])));
  if (!hurts && attendant) return event;
  const victim = hurts ? pickCasualty(journey, event) : null;
  const rename = (text) => (attendant || typeof text !== 'string'
    ? text
    : text.replace(/\b([Tt])he OFA 3\b/g, (match, t) => `${t}he crew's OFA 1`));

  const fitted = { ...event };
  if (victim) {
    const who = `${victim.name}, your ${RECON_ROLE_NOUNS[victim.role] || String(victim.roleName || 'crew').toLowerCase()}`;
    const description = String(event.description || '');
    fitted.description = /^A crew member\b/.test(description)
      ? description.replace(/^A crew member\b/, `${who},`)
      : /^A saw kicks back on the block\./.test(description)
        ? description.replace(/^A saw kicks back on the block\./, `A saw kicks back on the block: ${who}.`)
        : `${description} It is ${who}.`.trim();
  }
  fitted.options = event.options.map((option) => {
    if (!option) return option;
    const copy = { ...option };
    for (const key of ['label', 'outcome', 'partialOutcome', 'failureOutcome', 'description']) {
      if (typeof option[key] === 'string') copy[key] = rename(option[key]);
    }
    if (!victim) return copy;
    for (const [key, textKey] of CREW_EFFECT_BANDS) {
      if (!hurtsSomeone(option[key])) continue;
      const withAttendant = attendant && victim.role !== 'medic';
      copy[key] = {
        ...option[key],
        victimId: victim.id,
        departure: describeDeparture(String(option[textKey] || option.outcome || ''), withAttendant),
      };
    }
    return copy;
  });
  return fitted;
}

/**
 * Route an event's "+/- N km traverse" through the travel system instead of
 * moving the crew directly.
 *
 * Moving `distanceTraveled` from an event used to teleport the crew past
 * stops: no arrival, no road check, no river crossing, and then a penalty on
 * the next leg for the road check the jump itself skipped. Ground gained is
 * banked for the next leg, which still stops at the next stop. Ground lost
 * slows the next leg. A turn-back pulls the crew back along the current
 * segment only, never behind the stop it last reached.
 * @param {Object} journey
 * @param {number} km - authored progress, in km of traverse
 * @param {Object} [options]
 * @param {boolean} [options.turnBack] - the authored option drives the crew back
 * @returns {string[]} messages for the outcome
 */
export function applyEventTravelEffect(journey, km, { turnBack = false } = {}) {
  const amount = Math.round(Math.abs(Number(km) || 0) * 10) / 10;
  if (!journey || amount === 0) return [];
  const messages = [];

  if (km > 0) {
    const nextBlock = getNextBlock(journey);
    if (!nextBlock) return ['There is no leg left on the traverse for it to shorten.'];
    journey.travelBonusKm = Math.min(MAX_EVENT_TRAVEL_BONUS_KM, (journey.travelBonusKm || 0) + amount);
    messages.push(`Worth about ${amount} km on the next leg. The crew still stops at ${nextBlock.name} for the road check.`);
    return messages;
  }

  // At the last stop there is no leg left to slow down, and saying there is
  // tells the player something false about the end of the season.
  if (!turnBack && !getNextBlock(journey)) return messages;

  let setbackKm = amount;
  if (turnBack) {
    const pulledBack = Math.round(Math.min(amount, getDistanceIntoCurrentSegment(journey)) * 10) / 10;
    if (pulledBack > 0) {
      journey.distanceTraveled = Math.max(0, journey.distanceTraveled - pulledBack);
      messages.push(`The crew pulls back ${pulledBack} km to ${getCurrentBlock(journey)?.name || 'the last stop'}.`);
    }
    setbackKm = Math.round((amount - pulledBack) * 10) / 10;
  }
  if (setbackKm > 0) {
    const setback = Math.min(0.75, setbackKm / 16);
    journey.travelSetback = Math.min(0.75, (journey.travelSetback || 0) + setback);
    messages.push(`The next leg will be slower (about ${setbackKm} km less ground).`);
  }
  return messages;
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
  // Rounded to a hundredth so binary noise never reaches the player as
  // "Covered 4.399999999999999 km", while a fractional leg still lands on
  // its boundary exactly.
  const remaining = Math.round(Math.max(0, segmentLength - distanceIntoSegment) * 100) / 100;
  // A leg that runs out within ARRIVAL_SNAP_KM of the stop walks the rest in.
  // Decided on the tenth of a kilometre the player is shown: a 7.46 km leg
  // prints "Walked 7.5 km" and leaves 1.5 km, and that has to snap too.
  const shownDistance = Math.round(distance * 10) / 10;
  const shownLeftover = Math.round((remaining - shownDistance) * 10) / 10;
  const snapsToStop = shownDistance > 0 && remaining > 0 && shownLeftover <= ARRIVAL_SNAP_KM;
  const clampedDistance = remaining > 0 ? (snapsToStop ? remaining : Math.min(shownDistance, remaining)) : 0;
  const reachesBlock = clampedDistance >= remaining && remaining > 0;

  return {
    distance: Math.min(remaining, Math.round(clampedDistance * 10) / 10),
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
export function executeFieldAction(journey, paceId) {
  const messages = [];
  ensureRouteConstraints(journey);
  let effectivePaceId = paceId;
  let pace = PACE_OPTIONS[paceId] || PACE_OPTIONS.normal;

  // Track previous progress for milestone detection. A recon file's progress
  // is packages closed, not stops reached (js/journey/packages.js).
  const isRecon = journey.journeyType === 'recon';
  const prevProgress = isRecon ? getPackageProgress(journey) : getOperationalProgress(journey);
  const dayNumber = journey.day;
  const startBlock = getCurrentBlock(journey);
  const nextBlockAtStart = getNextBlock(journey);
  const weatherToday = journey.weather;
  const routePlan = journey.routePlan || null;

  // Block travel if fuel or equipment is depleted
  if (pace.distanceMultiplier > 0) {
    const constraint = getActiveRouteConstraint(journey);
    if (constraint) {
      messages.push(`${constraint.title} still blocks travel to ${constraint.toBlockName}. Clear it or mark a detour first.`);
      return { journey, messages, blocked: true };
    }
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
    // A layout crew's traverse is walked line and road location between
    // stops, not a drive measured in shifts.
    // A leg to a bridge, a camp or a yard is road driven, not line walked.
    const toward = nextBlockAtStart?.name ? ` toward ${nextBlockAtStart.name}` : '';
    messages.push(nextBlockAtStart && !isPackageBlock(nextBlockAtStart)
      ? `Covered ${travelInfo.distance} km of road${toward} at ${pace.name} pace.`
      : `Walked ${travelInfo.distance} km of line and road location${toward} at ${pace.name} pace.`);
    journey.travelSetback = 0;
    journey.travelBonusKm = 0;
  } else {
    if (effectivePaceId === 'resting') {
      messages.push(journey.resources.food <= 0
        ? 'The crew stood down this shift, but nobody recovers on an empty food box.'
        : 'The crew stood down and recovered this shift.');
    } else {
      messages.push('The shift ends without a travel leg.');
    }
  }

  if (isRecon) {
    recordPackageMilestones(journey, prevProgress, messages, dayNumber);
  } else {
    recordProgressMilestones(journey, prevProgress, messages, dayNumber);
  }

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
      const infrastructureStatus = formatInfrastructureStatus(accessVerdict);
      if (infrastructureStatus) messages.push(infrastructureStatus);

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

  // Check for travel completion. Recon still needs verified assessments before it counts as a win.
  if (journey.distanceTraveled >= journey.totalDistance || journey.currentBlockIndex >= journey.blocks.length - 1) {
    if (journey.journeyType === 'recon') {
      if (!allPackagesFinalized(journey)) {
        messages.push('You have reached the last stop on the traverse, but packages are still open on the file.');
      }
    } else {
      journey.isComplete = true;
      messages.push('You have completed the block sequence!');
    }
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

  // Add consumption warnings. Litres print whole; person-days keep a tenth.
  const printStock = (entry) => (entry.unit === 'L' ? Math.round(entry.value) : Math.round(entry.value * 10) / 10);
  for (const warning of consumptionResult.warnings) {
    messages.push(warning.value <= 0
      ? `Warning: ${warning.resource} at zero.`
      : `Warning: ${warning.resource} is running low (${printStock(warning)} ${warning.unit}).`);
  }
  for (const critical of consumptionResult.critical) {
    messages.push(`CRITICAL: ${critical.resource} is almost gone! (${printStock(critical)} ${critical.unit})`);
  }

  // Process crew daily updates. A crew with nothing in the food box does not
  // recover on a rest day; it just gets hungrier more slowly.
  const starving = journey.resources.food <= 0;
  const conditions = {
    restDay: effectivePaceId === 'resting',
    gruelingPace: effectivePaceId === 'grueling',
    shortRations: journey.rationPlan?.mode === 'short' && !starving,
    lowFood: journey.resources.food <= 5,
    starving,
    coldWeather: journey.temperature === 'cold' || journey.temperature === 'freezing',
    currentDay: journey.day
  };

  for (const member of journey.crew) {
    // Someone sent out on the ETV or gone home is not on the hill: the pace
    // and the weather are not theirs.
    if (!member.isActive) continue;
    // Apply pace effects
    if (pace.healthBonus !== 0 && !(starving && pace.healthBonus > 0)) {
      member.health = Math.max(0, Math.min(100, member.health + pace.healthBonus));
    }
    if (pace.moraleBonus !== 0 && !(starving && pace.moraleBonus > 0)) {
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

  if (!journey.isGameOver && Number(journey.resourcePressure?.hungryDays || 0) >= STARVATION_WALKOFF_DAYS) {
    journey.isGameOver = true;
    // Whoever was still on the roster left with the trucks: the review and
    // the epilogues read this rather than a crew that looks "5/5 active".
    journey.crewWalkedOff = true;
    journey.gameOverReason = `NO FOOD - After ${journey.resourcePressure.hungryDays} shifts on an empty food box the crew drove themselves out. Nobody is left in the field to finish the season.`;
    messages.push(journey.gameOverReason);
  }

  if (resourceStatus.depleted.some(d => d.id === 'fuel') && (PACE_OPTIONS[effectivePaceId]?.distanceMultiplier ?? 1) > 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'OUT OF FUEL - The crew is stranded.';
    messages.push(journey.gameOverReason);
  }

  // A crew with nobody left in the field cannot finish the season — unless
  // the season is already finished. The end-conditions check awards the win
  // first; this guard used to fire on the same shift as the last package and
  // hand the player a loss for a file they had just closed.
  if (getActiveCrewCount(journey.crew) === 0 && !(journey.journeyType === 'recon' && allPackagesFinalized(journey))) {
    journey.isGameOver = true;
    // Nobody died: they quit or went out on the ETV. Say which.
    const quit = journey.crew.filter((member) => member.hasQuit).length;
    const sentOut = journey.crew.filter((member) => !member.isActive && !member.hasQuit).length;
    const how = [
      quit ? `${quit} quit` : null,
      sentOut ? `${sentOut} ${sentOut === 1 ? 'was' : 'were'} sent out injured or ill` : null,
    ].filter(Boolean).join(' and ');
    journey.gameOverReason = `NO CREW LEFT - ${how || 'The crew is off the block'}. Nobody is left in the field to finish the season.`;
    messages.push(journey.gameOverReason);
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

/**
 * Advance the calendar to the next shift.
 *
 * This is intentionally separate from {@link executeFieldAction}: in the recon
 * multi-action shift loop, several actions can resolve within a single shift,
 * but the day must only roll over once — at the END of the shift. Calling this
 * mid-shift is what made the header jump from Shift 1 to Shift 2, rerolled
 * weather while hours remained, and cleared the route/ration plans early.
 *
 * @param {Object} journey - Journey state to advance
 * @returns {Object} The same journey, now pointing at the next shift
 */
export function endFieldDay(journey) {
  journey.day++;
  // The season calendar ticks with the field calendar, so long traverses
  // cross into new weather regimes (summer recon runs into fall rain).
  // Silviculture advances its season in its own loop and does not come
  // through here.
  if (journey.season?.currentSeason) {
    const { state } = advanceSeasonDay(journey.season);
    journey.season = state;
  }
  journey.weather = getRandomWeather(getCurrentBlock(journey), journey.day, journey.season?.currentSeason);
  journey.temperature = getTemperature(journey.weather, getCurrentBlock(journey));
  journey.travelSetback = Math.min(0.75, Math.max(0, journey.travelSetback || 0) + Math.max(0, journey.pendingTravelSetback || 0));
  journey.pendingTravelSetback = 0;
  journey.routePlan = null;
  // Rations are a standing order, like the pace (Set the tempo): they hold
  // until the player changes them. The streak counts the days on short
  // rations, which the event odds and the mission panel read.
  if (journey.rationPlan?.mode === 'short') {
    journey.rationPlan.shortRationStreak = Number(journey.rationPlan.shortRationStreak || 0) + 1;
  }
  return journey;
}

/**
 * Resolve a field action AND immediately advance to the next shift.
 *
 * Retained for callers (and tests) that treat one action as one whole day.
 * The recon loop instead calls {@link executeFieldAction} for each in-shift
 * action and {@link endFieldDay} exactly once when the shift ends.
 */
export function executeFieldDay(journey, paceId) {
  const result = executeFieldAction(journey, paceId);
  endFieldDay(journey);
  return result;
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
      // A careful line on a graded road turns an ankle; it does not break an
      // arm. Only a genuinely risky leg (hazards stacked on a hard pace) can
      // put someone out for the season.
      const severity = actualRisk >= 0.4 ? 'severe' : actualRisk >= 0.2 ? 'moderate' : 'minor';
      const result = applyRandomInjury(victim, severity);
      messages.push(`Route mishap! ${result.message}`);
      // The crew's end-of-shift pass has already run; a fracture goes out on
      // the ETV now, not after a night in camp and a kit spent on it.
      evacuateIfInjuryRequires(victim, journey.day ?? null, messages);
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

  // An empty food box is its own failure path, not a louder version of a
  // thin one. Each shift on nothing costs more than the last, rest does not
  // offset it (executeFieldAction), and STARVATION_WALKOFF_DAYS of it ends
  // the season.
  const starving = journey.resources.food <= 0;
  pressure.hungryDays = starving ? Number(pressure.hungryDays || 0) + 1 : 0;
  // The season total, for the campaign review: a box left empty is not thrift.
  if (starving) pressure.hungryShifts = Number(pressure.hungryShifts || 0) + 1;
  if (starving) {
    const days = pressure.hungryDays;
    const healthLoss = Math.min(14, 4 + days * 2);
    const moraleLoss = Math.min(16, 6 + days * 2);
    for (const member of journey.crew) {
      if (!member.isActive) continue;
      member.health = Math.max(0, member.health - healthLoss);
      member.morale = Math.max(0, member.morale - moraleLoss);
      if (days >= 2) {
        // Still on nothing: the exhaustion does not wear off overnight, and it
        // is announced once rather than every morning.
        let worn = member.statusEffects?.find((effect) => effect.effectId === 'exhaustion');
        if (!worn) {
          const result = applyStatusEffect(member, 'exhaustion');
          if (result.message) messages.push(result.message);
          worn = member.statusEffects.find((effect) => effect.effectId === 'exhaustion');
        }
        if (worn) worn.daysRemaining = Math.max(worn.daysRemaining || 0, 3);
      }
    }
    messages.push(days === 1
      ? `Nothing in the food box. The crew goes to bed hungry: health -${healthLoss}, morale -${moraleLoss} each.`
      : `Shift ${days} with no food. The crew is weakening fast: health -${healthLoss}, morale -${moraleLoss} each.`);
    const left = STARVATION_WALKOFF_DAYS - days;
    if (left > 0 && left <= 2) {
      messages.push(`The crew has said it plainly: ${left === 1 ? 'one more shift' : 'two more shifts'} on nothing and they drive out.`);
    }
  } else if (pressure.food >= 2) {
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

  // One favour, once. After that the answer is a fuel run from camp
  // (js/modes/recon.js), not a daily bill for fuel that never arrives.
  if (pressure.fuel >= 2 && !journey.fuelFavourUsed && typeof journey.resources.budget === 'number') {
    journey.fuelFavourUsed = true;
    journey.resources.fuel = Math.min(FIELD_RESOURCES.fuel.max, (journey.resources.fuel || 0) + 40);
    journey.resources.budget = Math.max(0, journey.resources.budget - 120);
    messages.push('The neighbouring planting contractor lends a drum against a case of beer and a favour owed. Fuel +40 L, $120.');
  }
}

/**
 * Package milestones for a recon file, on the same shape recordProgressMilestones
 * writes so the camp beat in js/modes/recon.js reads them unchanged.
 */
function recordPackageMilestones(journey, previousProgress, messages = [], dayNumber = journey?.day) {
  const currentProgress = getPackageProgress(journey);
  if (!journey.milestonesReached) journey.milestonesReached = [];
  if (!journey.log) journey.log = [];
  const reached = [];
  for (const threshold of JOURNEY_MILESTONES) {
    if (previousProgress >= threshold || currentProgress < threshold || journey.milestonesReached.includes(threshold)) {
      continue;
    }
    journey.milestonesReached.push(threshold);
    journey.log.push({ day: dayNumber, type: 'milestone', threshold, summary: `Reached ${threshold}% of the packages` });
    const copy = MILESTONE_COPY.recon?.[threshold] || `Reached ${threshold}% of the packages.`;
    messages.push(`*** MILESTONE: ${copy} ***`);
    reached.push(threshold);
  }
  return reached;
}
