/**
 * Recon Mode Runner
 * Field-based reconnaissance operations with crew mechanics
 */

import {
  applyRandomInjury,
  crewHasRole,
  generateCrewMember,
  getCrewComment,
  getCrewDisplayInfo,
  hasActiveFirstAidAttendant,
  healCrewMember,
  needsTreatment,
  treatCrewCondition
} from '../crew.js';
import { FIELD_ROLES, STATUS_EFFECTS } from '../data/crewNames.js';
import { getFieldProgressInfo } from '../journey.js';
import {
  getPackageBlocks,
  getPackageProgress,
  getPackagesFinalized,
  getPackageTarget,
  isPackageBlock
} from '../journey/packages.js';
import { getWeatherTempC } from '../data/blocks.js';
import {
  executeFieldAction,
  endFieldDay,
  formatAccessVerdict,
  formatInfrastructureStatus,
  getBlockAccessVerdict,
  recordAccessVerdict
} from '../journey/fieldMechanics.js';
import { checkForEvent } from '../events.js';
import { handleEvent } from './shared/handleEvent.js';
import { runDaySituation } from '../journey/daySituation.js';
import {
  getCondemnedCrossingPenalty,
  getMachineDownPenalty,
  getCampBearDrain,
  isBlockEnjoined
} from '../events/consequences.js';
import { renderJourneyMap } from '../scene/areaMap.js';
import {
  getCrossingContext,
  getCrossingOptions,
  resolveCrossingChoice
} from '../journey/riverCrossing.js';
import { getCurrentSegmentLength, getDistanceIntoCurrentSegment } from '../journey/blockNav.js';
import { getActiveRouteConstraint, reopenReportedConstraints, resolveRouteConstraint } from '../journey/routeConstraints.js';
import { presentDayCard, formatStatusLine } from '../journey/dayCard.js';
import { PACE_OPTIONS } from '../journey/constants.js';
import { recordTrailMarker, markersForBlock, formatTrailMarker } from '../journey/trailMarkers.js';
import { buildCrossingApproachFrames, buildCrossingResolveFrames } from '../scene/crossing.js';
import { buildCampfireFrames } from '../scene/textmode/effects.js';
import { buildNightCampFrames } from '../scene/textmode/scenes.js';
import { FIELD_RESOURCES, formatDollars } from '../resources.js';
import {
  addDiscoveryTags,
  getDiscoveryTagDefinition,
  getDiscoveryTagNotes,
  inferDiscoveryTagsFromAccess
} from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';
import { startDay, spendDay, dayIsSpent, dayPrompt, settleDayPass } from '../journey/dayPlan.js';

const TREATMENT_PRIORITY = [
  'infection',
  'dysentery',
  'food_poisoning',
  'hypothermia',
  'concussion',
  'broken_leg',
  'broken_arm',
  'exhaustion',
  'sprained_ankle',
  'flu',
  'cold'
];

const ROUTE_PRESETS = {
  detour: {
    label: 'Safe Detour',
    shortLabel: 'detour',
    distanceMultiplier: 0.82,
    fuelMultiplier: 1.18,
    equipmentMultiplier: 0.88,
    injuryRisk: 0.03,
    moraleDelta: 1
  },
  mainline: {
    label: 'Stay Mainline',
    shortLabel: 'mainline',
    distanceMultiplier: 1,
    fuelMultiplier: 1,
    equipmentMultiplier: 1,
    injuryRisk: 0.08,
    moraleDelta: 0
  },
  shortcut: {
    label: 'Risky Shortcut',
    shortLabel: 'shortcut',
    distanceMultiplier: 1.24,
    fuelMultiplier: 0.92,
    equipmentMultiplier: 1.28,
    injuryRisk: 0.22,
    moraleDelta: -2
  }
};

const RECON_WATER_FEATURES = new Set([
  'community_water',
  'watershed',
  'water_intake',
  'salmon_river',
  'fish_habitat'
]);

const RECON_VISIBILITY_FEATURES = new Set([
  'visual_quality_zone',
  'recreation',
  'trail',
  'community_interface'
]);

const RECON_ACCESS_HAZARDS = new Set([
  'washout',
  'road_damage',
  'erosion',
  'bridge_weight',
  'subsidence',
  'river_crossing',
  'bog',
  'glacial_outburst',
  'karst_collapse',
  'hidden_cavities',
  'debris_flow'
]);

// Stream features and the riparian class a layout crew would call them in
// the field (FPPR s.47 widths). Fish presence is assumed until a fish
// sampling says otherwise; the sweep flags what needs sampling.
const RECON_STREAM_FEATURES = {
  river: { label: 'main river', cls: 'S1', rma: '70 m RMA, 50 m RRZ' },
  salmon_river: { label: 'salmon river', cls: 'S1', rma: '70 m RMA, 50 m RRZ' },
  salmon_stream: { label: 'salmon stream', cls: 'S2', rma: '50 m RMA, 30 m RRZ' },
  fish_habitat: { label: 'fish stream', cls: 'S2/S3', rma: '40-50 m RMA' },
  creek: { label: 'creek', cls: 'S4 (S6 if fish sampling comes back empty)', rma: '30 m RMA, no RRZ' },
  watershed: { label: 'community watershed tributary', cls: 'S3', rma: '40 m RMA, 20 m RRZ' },
  community_water: { label: 'intake stream', cls: 'S3', rma: '40 m RMA, 20 m RRZ' },
  wetland: { label: 'wetland', cls: 'W1-W3', rma: '30-50 m RMA' },
  wetland_buffer: { label: 'wetland', cls: 'W3', rma: '30 m RMA' },
  lake: { label: 'lakeshore', cls: 'L1-B', rma: '10 m RRZ, no management zone' },
  flood_channel: { label: 'outburst channel', cls: 'S3 (non-classified drainage)', rma: 'keep the road out of it' },
};

// Fuel the return visit to an earlier block burns, in litres.
const NOTEBOOK_FUEL_L = 16;
// Fuel a run to a marked emergency cache burns, in litres.
const CACHE_FUEL_L = 12;
// A cardlock fuel run: one shift, this much fuel, priced by remoteness.
const FUEL_RUN_LITRES = 80;
const FUEL_RUN_BASE_COST = 150;
// A grocery run to town: one shift, this much food, priced by remoteness.
const GROCERY_RUN_FOOD = 25;
const GROCERY_RUN_BASE_COST = 180;
// A replacement OFA 3 attendant driven out from town: one shift and this
// much money, priced by remoteness.
const ATTENDANT_REPLACEMENT_COST = 400;
// Rolls of flagging a boundary shift hangs.
const FLAGGING_PER_BLOCK = 3;

function normalizeReconToken(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Moose, grizzly and caribou are mainland animals; Vancouver Island has none
 * of them (js/data/operatingAreas.js "mainland" tag). A journey with no area
 * (bare fixtures) keeps the mainland defaults.
 */
function isMainlandJourney(journey) {
  const tags = journey?.area?.tags;
  return !Array.isArray(tags) || tags.includes('mainland');
}

function ensureReconIntelState(journey) {
  if (!journey.reconIntel) {
    journey.reconIntel = { byBlock: {} };
  }
  if (!journey.reconIntel.byBlock) {
    journey.reconIntel.byBlock = {};
  }
  return journey.reconIntel;
}

function getReconBlockIntel(journey, block) {
  const state = ensureReconIntelState(journey);
  const key = block?.id || `block-${journey?.currentBlockIndex || 0}`;
  if (!state.byBlock[key]) {
    state.byBlock[key] = {
      // Road and crossing notes — written on arrival by truck.
      accessGroundTruthed: false,
      // Boundary walked and ribboned, streams classified, terrain and soils
      // noted — the first shift on the ground.
      layoutWalked: false,
      // WTP candidates, wildlife features, CH/archaeology overview — the
      // second shift on the ground.
      valuesSwept: false,
      assessmentComplete: false,
      lastAccessDay: 0,
      lastLayoutDay: 0,
      lastValuesDay: 0
    };
  }
  const intel = state.byBlock[key];
  // Saves from before the layout shift existed: a swept block had walked it.
  if (intel.layoutWalked === undefined) intel.layoutWalked = Boolean(intel.valuesSwept);
  return intel;
}

/**
 * The steps a block package needs, in the order the crew does them. Only
 * cutblocks have packages; a staging lot or a bridge is a waypoint
 * (js/journey/packages.js).
 */
function getReconMissingSteps(journey, block) {
  if (!isPackageBlock(block)) return [];
  const intel = getReconBlockIntel(journey, block);
  const missing = [];
  if (!intel.accessGroundTruthed) missing.push('road & crossing notes');
  if (!intel.layoutWalked) missing.push('boundary, streams & terrain');
  if (!intel.valuesSwept) missing.push('WTP, wildlife & CH sweep');
  return missing;
}

function getReconOpenPackages(journey) {
  return getPackageBlocks(journey)
    .map((block) => {
      const intel = getReconBlockIntel(journey, block);
      if (intel.assessmentComplete) return null;
      const missing = getReconMissingSteps(journey, block);
      return missing.length > 0
        ? { block, intel, sweep: getReconValueSweepProfile(block, journey), missing }
        : null;
    })
    .filter(Boolean);
}

/**
 * Write the road and crossing notes for a stop the crew just drove into.
 * The truck did the check; the layout shift does not need to repeat it.
 */
function recordArrivalRoadNotes(journey, block) {
  if (!block) return;
  const intel = getReconBlockIntel(journey, block);
  if (intel.accessGroundTruthed) return;
  intel.accessGroundTruthed = true;
  intel.lastAccessDay = journey.day;
}

function maybeFinalizeReconAssessment(ui, journey, block) {
  if (!block) {
    return false;
  }

  const intel = getReconBlockIntel(journey, block);
  if (intel.assessmentComplete) {
    return false;
  }

  // A block under injunction or stop-work cannot be signed off, however much
  // groundwork is already done (js/events/consequences.js). The player has to
  // re-plan the season around ground they can no longer touch.
  if (isBlockEnjoined(journey, block)) {
    return false;
  }

  if (!isPackageBlock(block)) {
    return false;
  }
  if (getReconMissingSteps(journey, block).length > 0) {
    return false;
  }

  const target = getPackageTarget(journey);
  intel.assessmentComplete = true;
  journey.blocksAssessed = Math.min(target, (journey.blocksAssessed || 0) + 1);
  journey.verifiedBlocks = Math.min(target, (journey.verifiedBlocks || 0) + 1);
  ui.writePositive(`Package finalized for ${block.name}: boundary, streams, terrain, WTP and CH notes in the file. Packages: ${journey.blocksAssessed}/${target}.`);
  return true;
}

/**
 * What the WTP / wildlife / cultural heritage shift finds on this block,
 * read off its features. Every cutblock needs the sweep; what it produces
 * is the block's own content, not a generic checklist.
 */
export function getReconValueSweepProfile(block, journey) {
  const features = new Set((block?.features || []).map(normalizeReconToken).filter(Boolean));
  const hazards = new Set((block?.hazards || []).map(normalizeReconToken).filter(Boolean));
  const tags = new Set();
  const notes = [];
  const wtp = [];
  const wildlife = [];
  const cultural = [];

  if (!isPackageBlock(block)) {
    return { needed: false, notes, tags: [], wtp, wildlife, cultural };
  }

  // Wildlife tree patches and retention.
  if (features.has('old_growth') || features.has('cedar_stand')) {
    wtp.push('veteran cedar and hemlock on the bench — the obvious WTP anchor, with the largest snags inside it');
  }
  if (features.has('beetle_kill') || features.has('wildfire_scar') || features.has('burn_recovery')) {
    wtp.push('grey snags with cavities — keep a patch of the safest ones and a danger-tree assessment on the rest');
  }
  if (features.has('fire_veterans')) {
    wtp.push('fire-scarred veterans with thick bark — the old survivors anchor the WTP, and the snags beside them stay if they are safe');
  }
  if (features.has('blowdown') || hazards.has('windthrow')) {
    wtp.push('windfirm edge retention on the exposed side; the WTP goes in the lee');
  }
  if (features.has('wetland') || features.has('wetland_buffer') || features.has('lake')) {
    wtp.push('riparian reserve doubles as retention; anchor the WTP on the wetland edge');
  }
  if (features.has('spruce_forest') || features.has('mixedwood') || features.has('subalpine_forest')) {
    wtp.push('a mixedwood corner with the biggest stems for the 7% retention target');
  }
  if (wtp.length === 0) {
    wtp.push('a windfirm corner with the biggest stems for the retention target');
  }

  // Wildlife features and habitat.
  if (features.has('caribou_habitat') || hazards.has('caribou')) {
    wildlife.push('caribou sign and lichen on the flats — check the UWR/WHA boundary and the GAR order timing window');
    tags.add('winter_access');
  }
  const mainland = isMainlandJourney(journey);
  if (features.has('murrelet_habitat')) {
    wildlife.push('moss platforms on the big limbs — potential marbled murrelet nesting habitat; check the WHA and the survey window before the boundary is final');
  }
  if (features.has('elk_range')) {
    wildlife.push('Roosevelt elk trails and a wallow in the draw — check the ungulate winter range line and record the wallow for the site plan');
  }
  if (features.has('mule_deer_winter_range')) {
    wildlife.push('mule deer winter range on the south aspect — the UWR order sets the retention and the snow-interception cover');
  }
  if (mainland && (hazards.has('moose') || features.has('wetland') || features.has('wetland_buffer'))) {
    wildlife.push('moose browse and a wallow on the wetland edge — record as a wildlife feature for the site plan');
  }
  if (hazards.has('grizzly') || features.has('wildlife')) {
    wildlife.push(mainland && hazards.has('grizzly')
      ? 'grizzly sign and a day bed — a wildlife feature for the site plan and a note for the tailgate'
      : 'bear sign and a day bed — a wildlife feature for the site plan and a note for the tailgate');
  }
  if (hazards.has('cougar')) {
    wildlife.push('cougar scrape and tracks on the game trail — a note for the tailgate and the working-alone check-ins');
  }
  if (features.has('karst') || features.has('sensitive_area')) {
    wildlife.push('karst sinks and disappearing streams — each one a reserve and a terrain note');
  }
  if (features.has('alpine') || features.has('subalpine_forest')) {
    wildlife.push('goat and wolverine sign above tree line — a wildlife feature and a note for the biologist');
  }
  if (wildlife.length === 0) {
    wildlife.push('raptor nest search in the biggest trees on the block and a den search on the south aspect');
  }

  // Cultural heritage.
  if (features.has('culturally_modified_trees') || features.has('cedar_harvest')) {
    // Redcedar where it grows; inland the stripped trees are pine and spruce.
    const stripped = features.has('cedar_stand') || features.has('cedar_harvest') ? 'bark-stripped cedar' : 'bark-stripped trees';
    cultural.push(`${stripped} (CMTs) — flag, photograph, GPS, do not disturb; AOA/PFR and a referral before the boundary is final`);
    tags.add('cultural_hold');
  }
  if (features.has('first_nation') || hazards.has('cultural_protocol')) {
    cultural.push('a trail and possible cache pits — record for the Nation; engagement before layout, not after');
    tags.add('cultural_hold');
  }
  if (features.has('cultural_site')) {
    cultural.push('a registered heritage site nearby — HCA applies; the archaeology overview decides the buffer');
    tags.add('cultural_hold');
  }
  if (cultural.length === 0) {
    cultural.push('no CH indicators seen; note the AOA result and the Nation\'s referral status on the site plan');
  }

  // Carry-forward tags off the same features.
  if ([...features].some((feature) => RECON_WATER_FEATURES.has(feature)) || [...hazards].some((hazard) => hazard === 'river_crossing' || hazard === 'flood' || hazard === 'washout')) {
    tags.add('watershed_watch');
  }
  if ([...features].some((feature) => RECON_VISIBILITY_FEATURES.has(feature)) || hazards.has('visual_constraint')) {
    tags.add('community_visibility');
    notes.push('the block is inside a VQO polygon; the visible slope needs a visual design before the boundary is final');
  }
  if ([...hazards].some((hazard) => RECON_ACCESS_HAZARDS.has(hazard))) {
    tags.add('access_rehab');
  }
  if (normalizeReconToken(journey?.weather?.id) === 'storm') {
    tags.add('access_rehab');
    notes.push('storm damage and drainage concerns recorded for the road file');
  }

  notes.unshift(`WTP: ${wtp[0]}`, `Wildlife: ${wildlife[0]}`, `CH: ${cultural[0]}`);

  return {
    needed: true,
    notes,
    tags: [...tags],
    wtp,
    wildlife,
    cultural
  };
}

/**
 * What the boundary shift produces on this block: the ribbon, the streams
 * it crossed and the class it called them, terrain and soils, danger trees.
 */
export function getReconLayoutProfile(block) {
  const features = new Set((block?.features || []).map(normalizeReconToken).filter(Boolean));
  const hazards = new Set((block?.hazards || []).map(normalizeReconToken).filter(Boolean));
  const streams = [];
  for (const [feature, stream] of Object.entries(RECON_STREAM_FEATURES)) {
    if (features.has(feature)) {
      streams.push(`${stream.label}: ${stream.cls} — ${stream.rma}`);
    }
  }
  if (streams.length === 0) {
    streams.push('no defined channels crossed; two non-classified drainages noted for the site plan');
  }

  const terrain = [];
  const terrainId = normalizeReconToken(block?.terrain);
  if (terrainId === 'steep' || hazards.has('grade')) terrain.push('slopes over 60% on the upper boundary — terrain stability field card, likely Class IV');
  if (hazards.has('rockslide') || features.has('moraine') || features.has('glacial_terrain')) terrain.push('unstable till and slide scars — road location wants the bench, not the toe');
  if (hazards.has('debris_flow')) terrain.push('a debris-flow gully above the fan — the terrain stability assessment covers the channel above the road, not just the block');
  if (hazards.has('avalanche')) terrain.push('snow avalanche paths above the upper boundary — the avalanche assessment decides where the line stops');
  if (terrainId === 'muskeg' || hazards.has('bog') || hazards.has('subsidence') || features.has('permafrost')) terrain.push('organic soils and standing water — frozen-ground harvest window, no summer machine traffic');
  if (features.has('karst')) terrain.push('karst: sinks, grikes and a disappearing stream — each one flagged and buffered');
  if (hazards.has('erosion') || features.has('watershed') || features.has('community_water')) terrain.push('fine-textured soils on the lower slope — sediment control notes for every crossing');
  if (terrain.length === 0) terrain.push('gentle ground, well-drained morainal soils, no stability concerns noted');

  const dangerTrees = [];
  if (hazards.has('snag_hazard') || hazards.has('falling_timber') || features.has('beetle_kill') || features.has('wildfire_scar')) dangerTrees.push('dangerous-tree assessment on the snags along the boundary; the worst ones flagged for the faller before anyone works under them');
  if (hazards.has('windthrow') || hazards.has('hang_ups') || features.has('blowdown')) dangerTrees.push('hang-ups and root-sprung stems along the north line — flagged, walked around, no one under them');
  if (dangerTrees.length === 0) dangerTrees.push('no danger trees on the line beyond the usual dead tops');

  return { streams, terrain, dangerTrees };
}

function getReconAccessSeverity(verdict) {
  switch (verdict?.id) {
    case 'no_go':
      return 3;
    case 'heli_only':
    case 'winter_only':
      return 2;
    case 'rehab_needed':
      return 1;
    default:
      return 0;
  }
}

function getDisplayedAccessVerdict(journey, block) {
  if (block && !getReconBlockIntel(journey, block).accessGroundTruthed) {
    return {
      id: 'unverified',
      label: 'Not checked yet',
      summary: 'Road check: not recorded yet. The truck writes it on arrival; the map alone does not confirm access.'
    };
  }
  const recorded = block?.id ? journey.accessVerdicts?.[block.id] : null;
  if (recorded
    && recorded.day === journey.day
    && recorded.weatherId === (journey.weather?.id || null)) {
    return recorded;
  }
  return getBlockAccessVerdict(block, journey.weather, journey);
}

/**
 * Run a recon day (enhanced field day with survey mechanics)
 * @param {Object} game - Game instance
 */
export async function runReconDay(game) {
  // Run the field day mechanics
  await runFieldDay(game);
}

function ensureActiveReconShift(journey, pendingEvent = null) {
  const existing = journey.activeReconShift;
  if (existing?.day === journey.day) return existing;
  journey.activeReconShift = {
    day: journey.day,
    hasTraveled: false,
    dayResolved: false,
    pendingEvent
  };
  return journey.activeReconShift;
}

function checkpointReconShift(game, shift, pendingEvent) {
  shift.hasTraveled = Boolean(shift.hasTraveled);
  shift.dayResolved = Boolean(shift.dayResolved);
  shift.pendingEvent = pendingEvent || null;
  game.checkpoint?.();
}

async function acknowledgeActionResult(ui) {
  await ui.promptChoice('', [{
    label: 'Continue',
    presentation: 'continue',
    value: 'continue'
  }]);
}

function summarizeFieldMessages(messages = []) {
  const conditionGroups = new Map();
  const remaining = [];
  for (const message of messages) {
    const match = String(message || '').match(/^(.+?) now has (.+)\.$/);
    if (!match) {
      remaining.push(message);
      continue;
    }
    const [, name, condition] = match;
    if (!conditionGroups.has(condition)) conditionGroups.set(condition, []);
    conditionGroups.get(condition).push(name);
  }
  for (const [condition, names] of conditionGroups) {
    if (names.length === 1) remaining.push(`${names[0]} now has ${condition}.`);
    else remaining.push(`${names.length} crew members gained ${condition}: ${names.join(', ')}.`);
  }
  return remaining.filter(Boolean);
}

function writeFieldMessages(ui, messages = []) {
  for (const message of summarizeFieldMessages(messages)) ui.write(message);
}

function logReconAction(journey, summary, detail = '') {
  journey.log ||= [];
  journey.log.push({
    day: journey.day,
    type: 'action',
    summary,
    detail,
    location: journey.blocks?.[journey.currentBlockIndex]?.name || 'Unknown'
  });
}

/**
 * Run a field day: one job, then whatever the bush sends.
 *
 * A shift is a single substantive action — travel a leg, ground-truth a
 * block, sweep values, write up a package, run a resupply — plus the day's
 * event and the day's consequences. Consulting the map or re-reading the
 * briefing costs nothing and leaves the shift unspent. See
 * js/journey/dayPlan.js for why the hour budget went away.
 * @param {Object} game - Game instance
 */
async function runFieldDay(game) {
  const { ui, journey } = game;

  const resumingShift = journey.activeReconShift?.day === journey.day;
  startDay(journey, { resuming: resumingShift });
  if (!resumingShift) {
    const reopened = reopenReportedConstraints(journey);
    if (reopened.length) journey.routeNews = { day: journey.day, text: reopened.join(' ') };
  }

  let hasTraveled = Boolean(resumingShift && journey.activeReconShift.hasTraveled);
  // Tracks whether this shift's daily resolution (resource burn, crew updates,
  // hardships) has already run via executeFieldAction. The calendar itself only
  // rolls over once, at the very end of the shift, via endFieldDay().
  let dayResolved = Boolean(resumingShift && journey.activeReconShift.dayResolved);

  // Roll the day's random event, but hold it: Oregon Trail's rhythm is that
  // trouble finds you ON the trail, so the event fires mid-travel (the strip
  // pauses for it). If the shift never travels, it lands on camp instead.
  // The first shift teaches the base loop — nothing fires on day 1.
  let pendingEvent = resumingShift
    ? (journey.activeReconShift.pendingEvent || null)
    : (journey.day > 1 ? checkForEvent(journey) : null);
  const shiftState = ensureActiveReconShift(journey, pendingEvent);
  checkpointReconShift(game, shiftState, pendingEvent);

  // A crew that camped on the near bank of a crossing wakes up to the same
  // river under new weather.
  if (journey.pendingCrossing) {
    const waitedBlock = journey.blocks.find((b) => b.id === journey.pendingCrossing);
    journey.pendingCrossing = null;
    if (waitedBlock) {
      displayDayHeader(ui, journey);
      ui.write('First light on the near bank. The river has had all night to think it over.');
      await runRiverCrossingBeat(game, waitedBlock);
      if (game.gameOver) return;
    }
  }

  // Check for weather-forced camp day (Phase 3.3)
  const weatherForcesCamp = journey.weather &&
    (journey.weather.id === 'storm' || journey.weather.id === 'heavy_snow');

  if (weatherForcesCamp) {
    displayDayHeader(ui, journey);
    ui.writeDanger(`${journey.weather.name} has grounded all operations. The crew hunkers down.`);
    ui.write('');
    if (pendingEvent) {
      ui.write('The weather does not mean the day is quiet.');
      const interruptingEvent = pendingEvent;
      pendingEvent = null;
      checkpointReconShift(game, shiftState, pendingEvent);
      // The card redraws the screen, so the grounding has to ride on the
      // card itself, and no option may promise that work continues.
      const grounded = `${journey.weather.name} has grounded all operations. The crew hunkers down.`;
      await handleEvent(game, {
        ...interruptingEvent,
        heldInCamp: `${journey.weather.name.toLowerCase()} holds the crew in camp`,
      }, {
        dayHeader: buildReconDayHeader(journey),
        statusLine: grounded,
        context: buildReconContextLines(journey),
        onRender: () => updateReconMissionStatus(ui, journey),
      });
      if (game.gameOver) return;
    }
    spendDay(journey);
    const result = executeFieldAction(journey, 'resting');
    ui.writeHeader('SHIFT CONSEQUENCES');
    writeFieldMessages(ui, result.messages);
    shiftState.dayResolved = true;
    checkpointReconShift(game, shiftState, null);
    ui.updateAllStatus(journey);

    // The current shift remains the source of truth until the player has read
    // its consequences. Only then does the calendar/weather roll forward.
    const nextBlock = journey.blocks[journey.currentBlockIndex];
    await ui.promptChoice('', [{
      label: `Begin Shift ${journey.day + 1} at ${nextBlock?.name || 'Unknown'}`,
      value: 'next'
    }]);
    journey.activeReconShift = null;
    endFieldDay(journey);
    ui.updateAllStatus(journey);
    game.checkpoint?.();
    return;
  }

  if (foodBeatDue(journey)) {
    displayDayHeader(ui, journey);
    await maybeHandleFoodDecision(game);
    ui.updateAllStatus(journey);
    updateReconMissionStatus(ui, journey);
    logReconAction(journey, 'Ration decision', `Food remaining: ${Math.round(journey.resources.food || 0)} person-days`);
    checkpointReconShift(game, shiftState, pendingEvent);
    await acknowledgeActionResult(ui);
  }

  // One job a shift. Free look-ups (map, briefing) leave the shift unspent,
  // so the loop comes back around to the real decision; the tally closes a
  // shift whose menu turns out to be nothing but look-ups.
  const freeChoices = { count: 0 };
  while (!dayIsSpent(journey)) {
    const currentBlock = journey.blocks[journey.currentBlockIndex];
    const hasNextBlock = journey.currentBlockIndex < journey.blocks.length - 1;
    const canTravel = !hasTraveled && hasNextBlock && journey.resources.fuel > 0 && journey.resources.equipment > 0;
    const blockIntel = getReconBlockIntel(journey, currentBlock);
    const routeConstraint = getActiveRouteConstraint(journey);
    const attendantOnCrew = hasActiveFirstAidAttendant(journey.crew);

    updateReconMissionStatus(ui, journey);

    // The day's situation, if the bush sent one. The event IS the shift: you
    // answer it, or you decide it is not worth the day and drive on with it
    // unanswered. That second option is the whole trade the old chore menu
    // was missing — dealing with things properly is paid for in ground.
    if (pendingEvent) {
      const situation = pendingEvent;
      const outcome = await runDaySituation(game, situation, {
        frame: {
          dayHeader: buildReconDayHeader(journey),
          statusLine: buildReconStatusLine(journey),
          context: buildReconContextLines(journey),
          onRender: () => updateReconMissionStatus(ui, journey),
        },
        setAsideDescription: 'Not today. Take the shift back and spend it on your own work.',
      });
      if (outcome.gameOver) return;

      pendingEvent = null;
      checkpointReconShift(game, shiftState, pendingEvent);

      if (outcome.spendsDay) {
        spendDay(journey);
        shiftState.hasTraveled = hasTraveled;
        checkpointReconShift(game, shiftState, pendingEvent);
        ui.updateAllStatus(journey);
        continue;
      }

      // Either it was small enough to handle over coffee, or it was set aside.
      // Both leave the shift with the player, and the loop falls through to the
      // quiet card on the next pass. Setting aside is deliberately NOT a forced
      // drive-on: block work only happens on days the player owns, and if
      // declining always put the crew on the road, an eleven-block traverse
      // could never be worked at all.
      if (outcome.setAside) {
        logReconAction(journey, `Set aside: ${situation.title}`, 'Kept the shift for the crew\'s own work');
      }
      ui.updateAllStatus(journey);
      settleDayPass(journey, freeChoices, ui);
      continue;
    }

    // A quiet shift: nothing on the radio, so the crew's day is the player's
    // to spend. This is where the old nine-item chore menu went — it is no
    // longer the default shape of a day, it is what you do with a gift.
    // Pace left this menu entirely: it is a carried setting now (Set the
    // tempo, below), not four of nine slots asking the same question.
    // Kept deliberately short. The point of moving to a card was to give the
    // log pane back its screen: on a 390x844 phone the old nine-item list took
    // 66% of the viewport and left the game seven rows. A list of twelve is
    // not an improvement on a list of nine, so the outstanding block work
    // collapses into one option, camp upkeep goes back behind one door, and
    // the reference material lives in the card's free "More context".
    const options = [];

    // WorkSafeBC: no Level 3 attendant with an ETV, no line work more than
    // twenty minutes from hospital. The crew can drive, camp and resupply.
    if (!attendantOnCrew) {
      options.push({
        label: 'Drive to town for a replacement attendant',
        description: `One shift and about $${priceByRemoteness(journey, ATTENDANT_REPLACEMENT_COST)}; the crew cannot work more than 20 minutes from hospital without a Level 3 attendant and ETV`,
        value: 'replace_attendant'
      });
    }

    const blockWorkPending = attendantOnCrew && currentBlock && isPackageBlock(currentBlock) && !blockIntel.assessmentComplete
      ? (!blockIntel.layoutWalked ? 'layout' : (!blockIntel.valuesSwept ? 'values' : null))
      : null;

    if (blockWorkPending === 'layout') {
      options.push({
        label: 'Work the block',
        description: 'Walk the boundary and ribbon it; classify every stream you cross; note terrain, soils and danger trees. Uses this shift.',
        value: 'ground_truth'
      });
    } else if (blockWorkPending === 'values') {
      options.push({
        label: 'Work the block',
        description: 'Locate WTP candidates, wildlife features and cultural indicators; record them for the site plan and the Nation. Uses this shift.',
        value: 'values_sweep'
      });
    }

    if (routeConstraint && routeConstraint.status !== 'reported') {
      options.push({
        label: 'Report it and work the near side',
        description: `${routeConstraint.title} blocks ${routeConstraint.toBlockName}. Flag it, photograph it, call the road permit holder — uses this shift`,
        tag: 'TRADEOFF',
        value: 'report_route_constraint'
      });
    }
    if (routeConstraint) {
      options.push({
        label: routeConstraint.kind === 'landslide' ? 'Take the old spur around' : 'Walk in from the last sound approach',
        description: `Bypass ${routeConstraint.title.toLowerCase()} on the old line with extra fuel and rougher travel — uses this shift`,
        tag: 'TRADEOFF',
        value: 'detour_route_constraint'
      });
    }

    if (canTravel && !routeConstraint) {
      const nextBlock = journey.blocks[journey.currentBlockIndex + 1];
      options.push({
        label: `Move on to ${nextBlock?.name || 'the next stop'}`,
        description: `${isPackageBlock(nextBlock) ? 'Next block on the file' : 'Waypoint — travel, camp or supply'}; cover ground at ${PACE_OPTIONS[getReconPace(journey)]?.name || 'Standard'} pace`,
        value: 'travel'
      });
    }

    const notebookTargets = attendantOnCrew ? getReconNotebookTargets(journey) : [];
    if (notebookTargets.length > 0 && (journey.resources.fuel || 0) >= NOTEBOOK_FUEL_L) {
      const nextPackage = notebookTargets[0];
      options.push({
        label: 'Follow up missed fieldwork',
        description: `Return to ${nextPackage.block.name} for one missing check (${nextPackage.missing[0]}), then rejoin camp — uses this shift and ${NOTEBOOK_FUEL_L} L`,
        value: 'field_notebook'
      });
    }

    if (currentBlock?.hasSupply) {
      options.push({
        label: 'Run into the supply point',
        description: 'Fuel, food, repairs, kits',
        value: 'resupply'
      });
    }

    options.push({
      label: 'Camp & crew',
      description: 'Stand down, work on the gear, patch someone up, drive the next leg ahead in one truck',
      value: 'camp_menu'
    });

    // Free, and therefore never the day. The area map and the briefing moved
    // into "More context" — reading your own reference material should not
    // cost a slot on the decision list.
    options.push({
      label: 'Set the tempo',
      description: `${PACE_OPTIONS[getReconPace(journey)]?.name || 'Standard'}, ${journey.rationPlan?.mode === 'short' ? 'short rations' : 'full rations'} (free)`,
      value: 'set_tempo'
    });

    const campOptions = [
      {
        label: 'Stand down',
        description: 'Give the shift to the crew: health and morale back, no ground gained',
        value: 'end_shift'
      },
      {
        label: 'Work on the gear',
        description: 'A shift on the trucks, the saws, and the radios',
        value: 'maintain'
      }
    ];
    const hasAnyInjured = journey.crew.some(needsTreatment);
    if (hasAnyInjured && journey.resources.firstAid > 0) {
      campOptions.push({
        label: 'Patch up the crew',
        description: 'Treat whoever is carrying an injury',
        value: 'triage'
      });
    }
    if (!attendantOnCrew) {
      campOptions.push({
        label: 'Drive to town for a replacement attendant',
        description: `One shift, about $${priceByRemoteness(journey, ATTENDANT_REPLACEMENT_COST)}`,
        value: 'replace_attendant'
      });
    }
    if (journey.currentBlockIndex < journey.blocks.length - 1) {
      campOptions.push({
        label: 'Drive the next leg ahead in one truck',
        description: 'Look at the road and the next stop before the crew commits to it',
        value: 'scout'
      });
    }
    if (canPullRationCache(journey, currentBlock) && (journey.resources.food || 0) <= FIELD_RESOURCES.food.warning) {
      campOptions.push({
        label: `Pull the emergency crate from the cache at ${currentBlock.name}`,
        description: `Sealed field rations, one crate per cache; ${CACHE_FUEL_L} L to get there and back`,
        value: 'food_cache'
      });
    }
    // A run to town the card cannot pay for is not offered as a shift's
    // work; the camp prompt says what it would take instead.
    const cashOnHand = Number(journey.resources.budget || 0);
    const unaffordableRuns = [];
    const fuelRunCost = priceByRemoteness(journey, FUEL_RUN_BASE_COST);
    const groceryRunCost = priceByRemoteness(journey, GROCERY_RUN_BASE_COST);
    if ((journey.resources.fuel || 0) <= FIELD_RESOURCES.fuel.max - FUEL_RUN_LITRES && cashOnHand < fuelRunCost) {
      unaffordableRuns.push(`fuel run $${fuelRunCost}, $${Math.ceil(fuelRunCost - cashOnHand)} short`);
    } else if ((journey.resources.fuel || 0) <= FIELD_RESOURCES.fuel.max - FUEL_RUN_LITRES) {
      campOptions.push({
        label: 'Fuel run',
        description: `Send the driver to the nearest cardlock: +${FUEL_RUN_LITRES} L, about $${priceByRemoteness(journey, FUEL_RUN_BASE_COST)}; uses this shift`,
        value: 'fuel_run'
      });
    }
    if ((journey.resources.food || 0) <= FIELD_RESOURCES.food.max - GROCERY_RUN_FOOD && cashOnHand < groceryRunCost) {
      unaffordableRuns.push(`grocery run $${groceryRunCost}, $${Math.ceil(groceryRunCost - cashOnHand)} short`);
    } else if ((journey.resources.food || 0) <= FIELD_RESOURCES.food.max - GROCERY_RUN_FOOD) {
      campOptions.push({
        label: 'Grocery run',
        description: `Send the driver to town for a rations restock: +${GROCERY_RUN_FOOD} person-days, about $${priceByRemoteness(journey, GROCERY_RUN_BASE_COST)}; uses this shift`,
        value: 'grocery_run'
      });
    }
    if (journey.campBear) {
      campOptions.push({
        label: 'Clean up the attractants',
        description: 'Burn the grease, move the food to the truck cab and the bear cache, wash the camp down — uses this shift',
        value: 'bear_cleanup'
      });
      // One call per bear. The CO Service logs it once; ringing the RAPP
      // line again about the same animal is not another finding.
      if (!journey.bearReported) {
        campOptions.push({
          label: 'Report the habituated bear (RAPP)',
          description: 'Call it in to the Conservation Officer Service — brief response; work continues',
          value: 'bear_report'
        });
      }
    }

    let actionId = await presentDayCard(ui, {
      dayHeader: buildReconDayHeader(journey),
      statusLine: buildReconStatusLine(journey),
      label: 'QUIET SHIFT',
      title: buildQuietShiftTitle(journey),
      body: buildQuietShiftBody(journey),
      context: buildReconContextLines(journey),
      prompt: dayPrompt(journey),
      options,
      onRender: () => { maybeSpeakCrew(ui, journey); },
    });

    if (actionId === 'camp_menu') {
      const camp = await ui.promptChoice(unaffordableRuns.length
        ? `Camp & crew (not enough cash: ${unaffordableRuns.join('; ')}):`
        : 'Camp & crew:', [
        ...campOptions,
        { label: 'Back', description: 'Return to the shift', value: 'camp_back' }
      ]);
      // Backing out is a free look-up, not a spent shift; settleDayPass below
      // counts it against FREE_LOOKUPS_PER_DAY so the loop cannot spin.
      actionId = camp.value === 'camp_back' ? 'noop' : (camp.value || 'noop');
    }

    ui.write('');

    // Process the chosen action
    if (actionId === 'end_shift') {
      // Standing down is a real use of the shift, not a leftover-time sweep.
      // It resolves the day, so the end-of-shift camp_work pass below must
      // not fire a second time. The calendar advances once, after the loop,
      // via endFieldDay().
      const result = executeFieldAction(journey, 'resting');
      dayResolved = true;
      if (typeof ui.playScene === 'function') {
        await ui.playScene(buildNightCampFrames({ seed: journey.day * 5 + 1 }), {
          ambient: 'camp',
          delay: 170,
          loops: 2,
        });
      }
      ui.writeHeader('SHIFT CONSEQUENCES');
      writeFieldMessages(ui, result.messages);
      spendDay(journey);
      shiftState.dayResolved = true;
      shiftState.hasTraveled = hasTraveled;
      checkpointReconShift(game, shiftState, pendingEvent);
      ui.updateAllStatus(journey);
      break;
    }

    if (actionId === 'travel') {
      const leg = await runReconTravelLeg(game, { currentBlock, shiftState, pendingEvent });
      if (leg.gameOver) return;
      hasTraveled = true;
      dayResolved = true;
      await acknowledgeActionResult(ui);
    } else if (actionId === 'set_tempo') {
      await handleSetTempo(ui, journey);
    } else if (actionId === 'ground_truth') {
      spendDay(journey);
      handleLayoutShift(ui, journey, currentBlock);
      logReconAction(journey, 'Walked the boundary and classified streams', currentBlock?.name || 'Current block');
    } else if (actionId === 'values_sweep') {
      spendDay(journey);
      handleValuesSweep(ui, journey, currentBlock);
      logReconAction(journey, 'Completed WTP, wildlife and CH sweep', currentBlock?.name || 'Current block');
    } else if (actionId === 'replace_attendant') {
      spendDay(journey);
      handleReplaceAttendant(ui, journey);
      logReconAction(journey, 'Drove to town for a replacement attendant');
    } else if (actionId === 'fuel_run') {
      spendDay(journey);
      handleFuelRun(ui, journey);
      logReconAction(journey, 'Fuel run', `Fuel: ${Math.round(journey.resources.fuel || 0)} L`);
    } else if (actionId === 'grocery_run') {
      spendDay(journey);
      handleGroceryRun(ui, journey);
      logReconAction(journey, 'Grocery run', `Food: ${Math.round(journey.resources.food || 0)} person-days`);
    } else if (actionId === 'bear_cleanup') {
      spendDay(journey);
      journey.campBear = false;
      ui.writeHeader('CAMP CLEANUP');
      ui.write('The crew burns the grease pit, scrubs the cook tent, and moves every scrap of food into the truck cab and the bear cache on the far side of the landing.');
      ui.writePositive('Nothing to come back for. It will test the camp once more and move on.');
      logReconAction(journey, 'Cleaned up the camp attractants');
    } else if (actionId === 'bear_report' && !journey.bearReported) {
      ui.writeHeader('RAPP CALL');
      ui.write('You call the habituated bear in to the Conservation Officer Service on the RAPP line with the camp location and what it has been into.');
      journey.scrutiny = Math.max(0, (journey.scrutiny || 0) - 1);
      journey.bearReported = true;
      ui.write('Logged. Brief response; the shift is still yours.', 'term-dim');
      logReconAction(journey, 'Reported the habituated bear (RAPP)');
    } else if (actionId === 'field_notebook') {
      if (handleFieldNotebook(ui, journey)) {
        spendDay(journey);
        logReconAction(journey, 'Followed up missed fieldwork');
      }
    } else if (actionId === 'food_cache') {
      spendDay(journey);
      retrieveCachedRations(ui, journey);
      logReconAction(journey, 'Retrieved cached rations', `Food remaining: ${Math.round(journey.resources.food || 0)} person-days`);
    } else if (actionId === 'maintain') {
      spendDay(journey);
      await handleMaintenance(game);
      logReconAction(journey, 'Maintained equipment', `Equipment: ${Math.round(journey.resources.equipment || 0)}%`);
    } else if (actionId === 'triage') {
      spendDay(journey);
      await handleTriage(game);
      logReconAction(journey, 'Treated crew injuries', `First-aid kits remaining: ${journey.resources.firstAid || 0}`);
    } else if (actionId === 'resupply') {
      spendDay(journey);
      await handleResupply(game, currentBlock);
      logReconAction(journey, 'Visited supply point', currentBlock?.name || 'Supply point');
    } else if (actionId === 'scout') {
      spendDay(journey);
      handleScoutAhead(ui, journey);
      logReconAction(journey, 'Scouted the next block');
    } else if (actionId === 'report_route_constraint' || actionId === 'detour_route_constraint') {
      const constraint = getActiveRouteConstraint(journey);
      if (!constraint) {
        ui.write('No route obstruction is active on the next leg.');
      } else {
        spendDay(journey);
        const result = resolveRouteConstraint(
          journey,
          constraint.id,
          actionId === 'detour_route_constraint' ? 'detour' : 'report'
        );
        for (const message of result.messages) {
          if (actionId === 'detour_route_constraint') ui.writeWarning(message);
          else ui.write(message);
        }
        logReconAction(journey, result.messages[0] || 'Resolved route obstruction');
      }
    }

    ui.updateAllStatus(journey);
    updateReconMissionStatus(ui, journey);
    shiftState.hasTraveled = hasTraveled;
    shiftState.dayResolved = dayResolved;
    checkpointReconShift(game, shiftState, pendingEvent);

    const acknowledgedActions = {
      ground_truth: 'Boundary shift',
      values_sweep: 'Values sweep',
      field_notebook: 'Return field visit',
      food_cache: 'Cached-ration retrieval',
      maintain: 'Maintenance',
      triage: 'Triage',
      resupply: 'Resupply',
      scout: 'Scouting',
      replace_attendant: 'Replacement attendant',
      fuel_run: 'Fuel run',
      grocery_run: 'Grocery run',
      bear_cleanup: 'Camp cleanup',
      report_route_constraint: 'Route report',
      detour_route_constraint: 'Route detour'
    };
    if (acknowledgedActions[actionId]) {
      await acknowledgeActionResult(ui);
    }

    settleDayPass(journey, freeChoices, ui);

  }

  // A held event that never met the trail finds the crew in camp instead.
  if (pendingEvent) {
    ui.write('');
    ui.writeHeader('EVENT BEFORE LIGHTS-OUT');
    ui.write('Trouble reaches camp before lights-out.');
    const campEvent = pendingEvent;
    pendingEvent = null;
    checkpointReconShift(game, shiftState, pendingEvent);
    await handleEvent(game, campEvent);
    if (game.gameOver) return;
  }

  // End of shift — if no action resolved the day yet (no travel, no rest), run
  // a camp_work pass so the day's resource/crew effects apply exactly once.
  if (!dayResolved) {
    const result = executeFieldAction(journey, 'camp_work');
    ui.writeHeader('SHIFT CONSEQUENCES');
    writeFieldMessages(ui, result.messages);
    dayResolved = true;
    shiftState.dayResolved = true;
    checkpointReconShift(game, shiftState, pendingEvent);
  }

  // Milestones crossed by field inspections or package verification get their camp beat here rather than mid-travel.
  await celebrateNewMilestones(game);

  // A fed bear keeps coming back. Charged at the end of every shift until the
  // crew does something about it (js/events/consequences.js).
  const bear = getCampBearDrain(journey);
  if (bear.note) {
    journey.resources.food = Math.max(0, journey.resources.food + bear.food);
    for (const member of journey.crew) {
      if (member.isActive) member.morale = Math.max(0, member.morale + bear.morale);
    }
    ui.writeWarning(`${bear.note} Food ${bear.food}, morale ${bear.morale}.`);
  }

  // Anyone flown or driven out today gets their incident marker before the
  // day closes.
  await maybeMarkIncidents(game);

  ui.updateAllStatus(journey);

  // Keep the completed shift's day, weather, and location together on
  // screen. The next shift starts only after this acknowledgement.
  const nextBlock = journey.blocks[journey.currentBlockIndex];
  await ui.promptChoice('', [{
    label: `Begin Shift ${journey.day + 1} at ${nextBlock?.name || 'Unknown'}`,
    value: 'next'
  }]);
  journey.activeReconShift = null;
  endFieldDay(journey);
  ui.updateAllStatus(journey);
  game.checkpoint?.();
}

/**
 * Show markers left by earlier runs at a block the crew just reached.
 * A run never sees its own fresh markers (epoch cutoff).
 */
function showTrailMarkers(ui, journey, block) {
  if (!block) return;
  if (!journey.trailMarkerEpoch) journey.trailMarkerEpoch = Date.now();
  if (!journey.seenMarkerBlocks) journey.seenMarkerBlocks = [];
  if (journey.seenMarkerBlocks.includes(block.id)) return;
  journey.seenMarkerBlocks.push(block.id);

  const markers = markersForBlock(journey.areaId, block.id, { before: journey.trailMarkerEpoch });
  if (!markers.length) return;

  ui.write('');
  ui.write(markers.length === 1
    ? 'A weathered marker stands off the cutline:'
    : `${markers.length} weathered markers stand off the cutline:`);
  for (const marker of markers.slice(-3)) {
    const art = formatTrailMarker(marker);
    if (typeof ui.writeBox === 'function') ui.writeBox(art);
    else ui.write(art);
  }
  ui.write('The crew is quiet for a minute. Then the work goes on.', 'term-dim');
}

/**
 * Offer a marker for anyone evacuated today. Nobody dies on this crew; the
 * marker is an incident flag at the spot, with the player's own line on it —
 * it will stand at this block for every future run.
 */
async function maybeMarkIncidents(game) {
  const { ui, journey } = game;
  if (!journey.trailMarkerEpoch) journey.trailMarkerEpoch = Date.now();
  if (!journey.memorializedIds) journey.memorializedIds = [];

  for (const member of journey.crew) {
    const evacuated = !member.isActive && !member.hasQuit && !member.isDead;
    if (!evacuated || journey.memorializedIds.includes(member.id)) continue;
    journey.memorializedIds.push(member.id);

    const block = journey.blocks[journey.currentBlockIndex];
    const lastEffect = member.statusEffects?.[member.statusEffects.length - 1];
    const cause = lastEffect
      ? `${String(lastEffect.effectId).replace(/_/g, ' ')}, flown out`
      : 'evacuated';

    ui.write('');
    ui.writeHeader(`INCIDENT — ${member.name}`);
    const choice = await ui.promptChoice('Flag the incident site?', [
      { label: 'Hang a marker', description: 'Write a line for whoever works this ground next', value: 'carve' },
      { label: 'Just the incident report', description: 'No marker. WorkSafeBC gets the paperwork; the crew will remember.', value: 'skip' },
    ]);
    if (choice.value !== 'carve') {
      ui.write('The crew stands a moment, then shoulders their packs.');
      continue;
    }

    let epitaph = null;
    if (typeof ui.promptText === 'function') {
      epitaph = (await ui.promptText('Marker line (one line):', 'Watch your footing here'))
        || 'Watch your footing here';
    }
    const marker = recordTrailMarker({
      name: member.name,
      epitaph: epitaph || 'Watch your footing here',
      areaId: journey.areaId,
      blockId: block?.id,
      blockName: block?.name,
      day: journey.day,
      cause,
    });
    const art = formatTrailMarker(marker);
    if (typeof ui.writeBox === 'function') ui.writeBox(art);
    else ui.write(art);
    ui.write('It will stand here for whoever comes next.', 'term-dim');
  }
}

/**
 * Trail wildlife odds by pace: a quiet crew sees the country, a hammering
 * one sees the trail. Returns a critter kind for the travel strip or null.
 */
function pickTrailWildlife(journey, paceId) {
  const chance = { slow: 0.28, normal: 0.16, fast: 0.08, grueling: 0.03 }[paceId] || 0;
  if (Math.random() >= chance) return null;
  const block = journey.blocks[journey.currentBlockIndex];
  const mainland = isMainlandJourney(journey);
  const kinds = mainland ? ['moose', 'deer'] : ['deer', 'deer'];
  if (block?.hazards?.some((h) => /grizzly|bear/.test(h))) kinds.push('bear', 'bear');
  if (block?.hazards?.some((h) => /moose|wildlife/.test(h))) kinds.push(mainland ? 'moose' : 'bear');
  return kinds[Math.floor(Math.random() * kinds.length)];
}

/**
 * The water-crossing set piece: gauge readout, a decision that depends on
 * what the crossing physically is (ford, bridge, ferry, culvert — see
 * js/journey/riverCrossing.js), animated resolution, consequences on the
 * shared systems. No-op for blocks without a crossing.
 */
async function runRiverCrossingBeat(game, block) {
  const { ui, journey } = game;
  let ctx = getCrossingContext(journey, block);
  if (!ctx) return;

  const heading = {
    bridge: 'BRIDGE',
    ferry: 'FERRY',
    culvert: 'WASHOUT',
    ford: 'WATER CROSSING',
  }[ctx.mode] || 'WATER CROSSING';
  ui.write('');
  ui.writeHeader(`${heading} — ${block.name}`);

  while (true) {
    ctx = getCrossingContext(journey, block);
    if (typeof ui.playScene === 'function') {
      await ui.playScene(buildCrossingApproachFrames(ctx, { seed: journey.day * 7 + ctx.gaugeIndex }), {
        delay: 150,
        loops: 2,
        holdLastFrame: true,
      });
    }
    ui.write(`The gauge reads ${ctx.gaugeLabel}. ${ctx.gaugeDescription}`);
    if (ctx.holdMessage) {
      ui.writeWarning(ctx.holdMessage);
    }
    if (ctx.scouted && ctx.mode === 'ford') {
      ui.write('You know the line now. The odds are better than they look.', 'term-dim');
    }

    // The crossing is part of the shift that walked into it, so its choices
    // trade risk and gear rather than hours off a clock.
    const options = getCrossingOptions(ctx);
    const prompt = {
      bridge: 'The deck is right there:',
      ferry: 'The landing is right there:',
      culvert: 'The road prism is right there:',
      ford: 'The far bank is right there:',
    }[ctx.mode] || 'The far bank is right there:';
    const choice = await ui.promptChoice(prompt, options);
    ui.write('');

    if (choice.value === 'noop') {
      continue;
    }

    if (choice.value === 'wait') {
      spendDay(journey);
      journey.pendingCrossing = block.id;
      ui.write('The crew makes camp on the near bank and listens to the water all night.');
      break;
    }

    const result = resolveCrossingChoice(journey, ctx, choice.value);

    if (result.severity === 'scouted') {
      for (const msg of result.messages) ui.write(msg);
      ui.write('');
      continue;
    }

    if (result.severity === 'refused' || !result.crossed) {
      for (const msg of result.messages) ui.writeWarning(msg);
      ui.write('');
      continue;
    }

    if (typeof ui.playScene === 'function' && choice.value !== 'reroute') {
      await ui.playScene(buildCrossingResolveFrames(ctx, result, { seed: journey.day * 13 + 5 }), {
        delay: 140,
      });
    }
    for (const msg of result.messages) {
      if (result.mishap) ui.writeWarning(msg);
      else ui.write(msg);
    }
    journey.log?.push({
      day: journey.day,
      type: 'crossing',
      summary: `${block.name}: ${ctx.gaugeLabel} water, ${ctx.mode} ${choice.value}${result.mishap ? ' — mishap' : ''}`,
      severity: result.severity === 'swept' ? 'high' : result.mishap ? 'medium' : 'low',
    });
    break;
  }

  ui.updateAllStatus(journey);
}

/**
 * Celebrate progress milestones that haven't had their camp beat yet:
 * campfire scene, a voice from the crew, and a small choice about morale
 * versus supplies. Tracks celebrations on the journey so saves stay honest.
 */
async function celebrateNewMilestones(game) {
  const { journey } = game;
  const reached = journey.milestonesReached || [];
  if (!journey.milestonesCelebrated) journey.milestonesCelebrated = [];
  for (const threshold of reached) {
    if (journey.milestonesCelebrated.includes(threshold)) continue;
    journey.milestonesCelebrated.push(threshold);
    await runMilestoneCamp(game, threshold);
    if (game.gameOver) return;
  }
}

async function runMilestoneCamp(game, threshold) {
  const { ui, journey } = game;
  ui.write('');
  ui.writeHeader(`TRAIL BREAK — ${threshold}% OF THE JOB DONE`);
  if (typeof ui.playScene === 'function') {
    await ui.playScene(buildCampfireFrames({ frames: 14, seed: threshold + journey.day * 3 }), {
      ambient: 'camp',
      delay: 160,
      loops: 2,
    });
  }

  // Someone always has something to say around a fire.
  const active = journey.crew.filter((m) => m.isActive);
  let voice = null;
  for (const member of active) {
    voice = getCrewComment(member, journey);
    if (voice) {
      voice = `${member.name}: "${voice}"`;
      break;
    }
  }
  if (!voice && active.length) {
    const speaker = active[Math.floor(Math.random() * active.length)];
    voice = `${speaker.name} pokes the fire and says nothing, which around here counts as high praise.`;
  }
  if (voice) ui.write(voice);

  const canSplurge = (journey.resources.food || 0) > FIELD_RESOURCES.food.warning;
  const choice = await ui.promptChoice('The tailgate talk winds down:', [
    {
      label: 'Keep it lean',
      description: 'Bank the supplies; back to the shift',
      value: 'lean',
    },
    canSplurge
      ? {
        label: 'Break out the good coffee (-3 food)',
        description: 'A morale break - the crew has earned it',
        value: 'splurge',
      }
      : {
        label: 'Ration watch',
        description: 'Too thin to celebrate; the crew understands. Mostly.',
        value: 'lean',
      },
  ]);

  if (choice.value === 'splurge') {
    journey.resources.food = Math.max(0, journey.resources.food - 3);
    for (const member of active) {
      member.morale = Math.min(100, member.morale + 6);
    }
    ui.writePositive('Real coffee, a dry log to sit on, and the job visibly shrinking. Morale climbs.');
  } else {
    ui.write('The crew banks the supplies and gets back to the shift.');
  }
  ui.updateAllStatus(journey);
}

/** Refresh the mission pane without clearing the action result on screen. */
export function updateReconMissionStatus(ui, journey) {
  const currentBlock = journey.blocks?.[journey.currentBlockIndex];
  const progressInfo = getFieldProgressInfo(journey);
  const totalBlocks = getPackageTarget(journey);
  const packagesDone = getPackagesFinalized(journey);
  const completionPct = getPackageProgress(journey);
  const packagesRemaining = Math.max(0, totalBlocks - packagesDone);
  const scrutiny = Math.round(Math.max(0, Number(journey.scrutiny ?? journey.heat ?? 0)));
  const tempC = getWeatherTempC(journey.weather, currentBlock);
  const facts = [
    { label: 'Weather', value: `${journey.weather?.name || 'Clear'}${tempC === null ? '' : ` ${tempC}°C`}` },
    { label: 'Terrain', value: currentBlock?.terrain || 'unknown' },
    { label: 'Days left', value: Number.isFinite(journey.deadline) ? `${Math.max(0, journey.deadline - journey.day)}` : '—' },
    { label: 'Traverse', value: `${Math.round(journey.distanceTraveled)}/${Math.round(journey.totalDistance)} km` },
    { label: 'Stops', value: `${progressInfo.blocksCompleted + 1}/${progressInfo.totalBlocks}` },
    {
      label: 'Scrutiny',
      value: `${scrutiny}%`,
      tone: scrutiny > 60 ? 'danger' : scrutiny > 30 ? 'warn' : undefined
    }
  ];
  const checklist = [];

  if (currentBlock && isPackageBlock(currentBlock)) {
    const intel = getReconBlockIntel(journey, currentBlock);
    const finalized = intel.assessmentComplete || getReconMissingSteps(journey, currentBlock).length === 0;
    checklist.push({ label: 'road & crossing notes', done: intel.accessGroundTruthed });
    checklist.push({ label: 'boundary walked & ribboned', done: intel.layoutWalked });
    checklist.push({ label: 'streams classified (S1–S6)', done: intel.layoutWalked });
    checklist.push({ label: 'terrain / soils noted', done: intel.layoutWalked });
    checklist.push({ label: 'WTP & wildlife features flagged', done: intel.valuesSwept });
    checklist.push({ label: 'CH / archaeology overview', done: intel.valuesSwept });
    checklist.push({ label: 'package finalized', done: finalized });
    facts.push({
      label: 'Intel',
      value: `road ${intel.accessGroundTruthed ? 'noted' : 'pending'} · layout ${intel.layoutWalked ? 'walked' : 'pending'} · values ${intel.valuesSwept ? 'swept' : 'pending'}`
    });
  } else if (currentBlock) {
    checklist.push({ label: 'road & crossing notes', done: getReconBlockIntel(journey, currentBlock).accessGroundTruthed });
    facts.push({ label: 'Intel', value: 'waypoint — no package here' });
  }

  const alerts = [];
  const routeConstraint = getActiveRouteConstraint(journey);
  if (routeConstraint) {
    alerts.push({
      level: 'danger',
      text: routeConstraint.status === 'reported'
        ? `${routeConstraint.title} reported; the road to ${routeConstraint.toBlockName} is shut until it has been looked at.`
        : `${routeConstraint.title} blocks ${routeConstraint.toBlockName}; clear it or mark a detour before travelling.`
    });
  }
  const currentAccessVerdict = getDisplayedAccessVerdict(journey, currentBlock);
  if (currentAccessVerdict.id === 'no_go' || currentAccessVerdict.id === 'heli_only') {
    alerts.push({ level: 'danger', text: formatAccessVerdict(currentAccessVerdict) });
  } else if (currentAccessVerdict.id !== 'passable_now') {
    alerts.push({ level: 'warn', text: formatAccessVerdict(currentAccessVerdict) });
  }
  if (journey.rationPlan?.mode === 'short') {
    alerts.push({
      level: 'warn',
      text: `Short rations (${journey.rationPlan.shortRationStreak} day${journey.rationPlan.shortRationStreak === 1 ? '' : 's'}): ${SHORT_RATION_MORALE_COST} morale a shift each`
    });
  }

  const status = {
    objective: packagesRemaining > 0
      ? `Finalize every block package — ${packagesRemaining} still open`
      : `All ${totalBlocks} packages finalized — demob when ready.`,
    meter: { label: 'Packages', value: completionPct, text: `${packagesDone}/${totalBlocks}` },
    facts,
    checklist,
    alerts
  };
  ui.setMissionStatus?.(status);
  return status;
}

/**
 * What it costs to drive away from something you did not deal with.
 *
 * Walking away has to be a real option or "the event is the day" just means
 * the traverse stalls — but it cannot be free, or it is the only option anyone
 * ever takes. So it costs scrutiny (the file notices what you did not do) and
 * a little morale (the crew notices too), scaled by how bad the thing was.
 */
/**
 * Drive one leg of the traverse.
 *
 * Extracted so both ways of spending a shift on the road reach the same code:
 * choosing to move on from a quiet card, and walking away from a situation
 * you decided not to deal with. The day's event no longer interrupts the
 * strip partway through — the event has already been answered (or explicitly
 * abandoned) by the time the trucks move, because the event IS the day now.
 */
async function runReconTravelLeg(game, { currentBlock, shiftState, pendingEvent }) {
  const { ui, journey } = game;

  // The pace is the standing order the player already set; the route is the
  // one call worth making at the moment of leaving, because it is the only one
  // that depends on what is actually ahead. It used to be asked *after* the
  // player had already committed to an intensity.
  const paceId = getReconPace(journey);
  if (journey.routePlan?.day !== journey.day) {
    await maybePromptRouteChoice(game, currentBlock);
    checkpointReconShift(game, shiftState, pendingEvent);
  }
  applyReconTravelIntelPenalty(ui, journey, currentBlock, paceId);

  // Losing the machine for the season is paid on every leg after it, not once.
  const machine = getMachineDownPenalty(journey);
  if (machine.note) {
    journey.travelSetback = Math.min(0.75, (journey.travelSetback || 0) + (1 - machine.paceFactor));
    for (const member of journey.crew) {
      if (member.isActive) member.health = Math.max(0, member.health + machine.crewHealth);
    }
    ui.writeWarning(machine.note);
  }

  spendDay(journey);
  const progressBefore = journey.totalDistance > 0
    ? journey.distanceTraveled / journey.totalDistance
    : 0;
  const blockIndexBefore = journey.currentBlockIndex;
  const result = executeFieldAction(journey, paceId);
  const progressAfter = journey.totalDistance > 0
    ? journey.distanceTraveled / journey.totalDistance
    : progressBefore;

  if (typeof ui.playTravelStrip === 'function') {
    await ui.playTravelStrip({
      weatherId: journey.weather?.id,
      terrain: currentBlock?.terrain,
      pace: paceId,
      wildlife: pickTrailWildlife(journey, paceId),
      seed: journey.day * 31 + journey.currentBlockIndex,
      progressBefore,
      progressAfter,
    });
  }

  ui.writeHeader('TRAVEL RESULTS');
  writeFieldMessages(ui, result.messages);
  // The panel has to agree with the results on screen, not catch up after
  // the next Continue.
  ui.updateAllStatus(journey);
  updateReconMissionStatus(ui, journey);
  shiftState.hasTraveled = true;
  shiftState.dayResolved = true;

  // Reaching a water crossing is a played decision, not terrain math. The
  // truck's own arrival is the road and crossing check for the file.
  if (journey.currentBlockIndex !== blockIndexBefore) {
    const arrivedBlock = journey.blocks[journey.currentBlockIndex];
    await runRiverCrossingBeat(game, arrivedBlock);
    if (game.gameOver) return { gameOver: true };
    recordArrivalRoadNotes(journey, arrivedBlock);
    if (isPackageBlock(arrivedBlock)) {
      ui.write('Road and crossing notes recorded on arrival. Two shifts on the ground close the package.', 'term-dim');
    }
    showTrailMarkers(ui, journey, arrivedBlock);
  }

  // A crossed progress milestone earns the crew a fire and a breather.
  await celebrateNewMilestones(game);
  if (game.gameOver) return { gameOver: true };
  ui.updateAllStatus(journey);
  checkpointReconShift(game, shiftState, pendingEvent);
  return { gameOver: false };
}

/** Paces the player can carry. Ordered easiest-first for the tempo prompt. */
const RECON_PACE_IDS = ['slow', 'normal', 'fast', 'grueling'];

/**
 * The crew's carried pace.
 *
 * Pace used to be four of the nine daily menu items — the same verb at four
 * intensities, asked again every shift, and asked *before* the route ahead was
 * described. It is a standing order now: set once, changed when the country or
 * the crew changes, the way Oregon Trail has always done it.
 */
function getReconPace(journey) {
  const carried = journey.paceSetting || journey.pace;
  return RECON_PACE_IDS.includes(carried) ? carried : 'normal';
}

/**
 * Change the carried pace and ration policy. Free — setting a standing order
 * is not how a shift gets spent — so it returns without touching the day.
 */
async function handleSetTempo(ui, journey) {
  const current = getReconPace(journey);
  const paceChoice = await ui.promptChoice('Standing order for the crew:', [
    ...RECON_PACE_IDS.map((id) => ({
      label: `${PACE_OPTIONS[id].name}${id === current ? ' (current)' : ''}`,
      description: `${Math.round(PACE_OPTIONS[id].distanceMultiplier * 100)}% coverage - ${PACE_OPTIONS[id].description.toLowerCase()}`,
      value: id,
    })),
    { label: 'Leave it', description: 'Keep the current standing order', value: 'keep' },
  ]);

  if (paceChoice.value !== 'keep') {
    journey.paceSetting = paceChoice.value;
    ui.write(`Standing order: ${PACE_OPTIONS[paceChoice.value].name}.`);
  }

  const rations = ensureRationPlan(journey);
  const rationChoice = await ui.promptChoice('Rations:', [
    {
      label: `Full rations${rations.mode !== 'short' ? ' (current)' : ''}`,
      description: 'Normal draw on food; the crew holds up better',
      value: 'normal',
    },
    {
      label: `Short rations${rations.mode === 'short' ? ' (current)' : ''}`,
      description: '65% portions; stretches the food, the crew feels it',
      value: 'short',
    },
  ]);

  if (rationChoice.value === 'short' && rations.mode !== 'short') {
    rations.mode = 'short';
    rations.shortRationStreak = 1;
    rations.orderedAtFood = Number(journey.resources.food || 0);
    ui.writeWarning(`Short rations ordered: ${SHORT_RATION_MORALE_COST} morale a shift for everyone. They hold until you change them, the box is restocked, or someone gets close to walking.`);
  } else if (rationChoice.value === 'normal' && rations.mode === 'short') {
    rations.mode = 'normal';
    rations.shortRationStreak = 0;
    rations.orderedAtFood = null;
    ui.write('Back on full rations.');
  }
}

/** An occasional voice from the crew — not a daily ritual. */
function maybeSpeakCrew(ui, journey) {
  const activeCrew = journey.crew.filter((m) => m.isActive);
  if (activeCrew.length === 0 || Math.random() >= 0.35) return;
  const speaker = activeCrew[Math.floor(Math.random() * activeCrew.length)];
  const comment = getCrewComment(speaker, journey);
  if (comment) ui.write(comment);
}

/**
 * A quiet shift still needs to read like a morning, not like a form. The title
 * and body come off the actual state so two quiet days in different weather at
 * different points in the season do not open with identical text.
 */
function buildQuietShiftTitle(journey) {
  if (journey.recentSituationContext?.day === journey.day) return 'AFTER THE CALL';
  const weather = normalizeReconToken(journey.weather?.id);
  if (weather === 'light_rain' || weather === 'heavy_rain') return 'A WET START';
  if (weather === 'light_snow' || weather === 'heavy_snow' || weather === 'freezing') return 'SNOW ON THE TRUCKS';
  if (weather === 'fog') return 'SOCKED IN';
  if (weather === 'clear' && (getWeatherTempC(journey.weather) ?? 0) >= 18) return 'ALREADY WARM AT SEVEN';
  if ((journey.resources.food || 0) <= FIELD_RESOURCES.food.warning) return 'THIN IN THE FOOD BOX';
  if (journey.crew.some((m) => m.isActive && m.health < 60)) return 'A SLOW MORNING IN CAMP';
  return 'NOTHING ON THE RADIO';
}

function buildQuietShiftBody(journey) {
  const currentBlock = journey.blocks[journey.currentBlockIndex];
  const openHere = currentBlock ? isPackageBlock(currentBlock) && !getReconBlockIntel(journey, currentBlock).assessmentComplete : false;
  const daysLeft = Number.isFinite(journey.deadline) ? Math.max(0, journey.deadline - journey.day) : null;

  const recent = journey.recentSituationContext?.day === journey.day
    ? journey.recentSituationContext
    : null;
  const parts = [recent
    ? `${recent.setAside ? 'You left' : 'You handled'} ${recent.title}. The rest of the shift is still yours to decide.`
    : 'The radio stays quiet through breakfast. Whatever today is, it is yours to decide.'];
  if (journey.routeNews?.day === journey.day) {
    parts.push(journey.routeNews.text);
  }
  const constraint = getActiveRouteConstraint(journey);
  if (constraint?.status === 'reported') {
    parts.push(`The road past the ${constraint.title.toLowerCase()} is shut until the office has had it looked at. Work this side today, or take the old spur around.`);
  }
  if (openHere) {
    parts.push(`${currentBlock.name} is still open in the file.`);
  }
  if (daysLeft !== null && daysLeft <= 5) {
    parts.push(`The layout deadline is ${daysLeft} day${daysLeft === 1 ? '' : 's'} out.`);
  }
  return parts.join(' ');
}

/**
 * The day card's header line: which shift, and where the crew is standing.
 */
function buildReconDayHeader(journey) {
  const currentBlock = journey.blocks[journey.currentBlockIndex];
  return `SHIFT ${journey.day} - ${currentBlock?.name || 'Unknown Territory'}`;
}

/**
 * The drumbeat under the header: weather, how far to the next named place,
 * how much season is left, and what is in the truck. One row, because on a
 * phone the card body is competing with the option list for the same pixels
 * (docs/day_as_situation.md section 4).
 */
function buildReconStatusLine(journey) {
  const nextBlock = journey.blocks[journey.currentBlockIndex + 1];
  const tempC = getWeatherTempC(journey.weather, journey.blocks[journey.currentBlockIndex]);
  const segments = [`${journey.weather?.name || 'Clear'}${tempC === null ? '' : ` ${tempC}°C`}`];

  if (nextBlock) {
    const segment = getCurrentSegmentLength(journey.blocks, journey.currentBlockIndex);
    const into = getDistanceIntoCurrentSegment(journey);
    segments.push(`${Math.max(0, segment - into).toFixed(1)} km to ${nextBlock.name}`);
  } else {
    segments.push('final block');
  }

  if (Number.isFinite(journey.deadline)) {
    const left = Math.max(0, journey.deadline - journey.day);
    segments.push(`${left} day${left === 1 ? '' : 's'} left`);
  }

  segments.push(`food ${Math.round(journey.resources.food || 0)} pd`);
  segments.push(`fuel ${Math.round(journey.resources.fuel || 0)} L`);

  return formatStatusLine(segments);
}

/**
 * Reference material, free and behind "More context": the block strip, the
 * traverse total, and whatever the last shift left on the table. This used to
 * be printed into the log every single day, where it pushed the actual
 * decision off a seven-row pane.
 */
function buildReconContextLines(journey) {
  const lines = [buildBlockMap(journey), '* supply point'];
  lines.push(`Traverse: ${Math.round(journey.distanceTraveled)}/${Math.round(journey.totalDistance)} km`);
  lines.push(`Packages: ${getPackagesFinalized(journey)}/${getPackageTarget(journey)} finalized`);

  // The briefing used to cost a slot on the decision list. It is reference
  // material, so it belongs here, behind the card's free "More context".
  const currentBlock = journey.blocks[journey.currentBlockIndex];
  const verdict = getDisplayedAccessVerdict(journey, currentBlock);
  lines.push(formatAccessVerdict(verdict));
  const infrastructure = formatInfrastructureStatus(verdict);
  if (infrastructure) lines.push(infrastructure);

  const scrutinyValue = Number(journey.scrutiny ?? journey.heat ?? 0);
  if (Number.isFinite(scrutinyValue)) {
    lines.push(`Scrutiny: ${Math.round(Math.max(0, scrutinyValue))}%`);
  }
  const areaSituation = getAreaSituationSummary(journey);
  if (areaSituation) lines.push(`Area: ${areaSituation}`);
  const discoveryNotes = getDiscoveryTagNotes(journey, journey.roleId || 'recce', 2);
  if (discoveryNotes.length > 0) lines.push(`Carry-forward: ${discoveryNotes.join(' | ')}`);

  // The Braille area map, likewise: a set piece worth looking at, not worth a
  // slot competing with "move on".
  const mapFrame = renderJourneyMap(journey);
  if (mapFrame) {
    lines.push('-- area map --');
    for (const row of String(mapFrame).split('\n')) lines.push(row);
  }

  if (Array.isArray(journey.lastActionRecap) && journey.lastActionRecap.length) {
    lines.push('-- last leg --');
    for (const line of journey.lastActionRecap) lines.push(line);
  }

  return lines.filter(Boolean);
}

/**
 * Display compact day header with status (Phase 6.2)
 */
function displayDayHeader(ui, journey) {
  const currentBlock = journey.blocks[journey.currentBlockIndex];

  ui.clear();
  ui.writeHeader(`SHIFT ${journey.day} - ${currentBlock?.name || 'Unknown Territory'}`);

  // ASCII block map (Phase 5.4)
  ui.write(buildBlockMap(journey));
  ui.write('* supply point', 'term-dim');

  // The landmark drumbeat: how far to the next named place, how far come.
  const nextBlock = journey.blocks[journey.currentBlockIndex + 1];
  if (nextBlock) {
    const segment = getCurrentSegmentLength(journey.blocks, journey.currentBlockIndex);
    const into = getDistanceIntoCurrentSegment(journey);
    const kmToNext = Math.max(0, segment - into);
    ui.write(
      `NEXT: ${nextBlock.name} — ${kmToNext.toFixed(1)} km   ·   TRAVELED: ${Math.round(journey.distanceTraveled)}/${Math.round(journey.totalDistance)} km`,
      'term-dim'
    );
  }

  // Recap of the previous action's results (set by the travel branch), shown
  // here because this header clears the screen those results were printed on.
  if (Array.isArray(journey.lastActionRecap) && journey.lastActionRecap.length) {
    ui.write('\u2500\u2500 last leg \u2500\u2500', 'term-dim');
    for (const line of journey.lastActionRecap) ui.write(line, 'term-dim');
    journey.lastActionRecap = null;
  }

  updateReconMissionStatus(ui, journey);

  // Crew dialogue (Phase 5.1) — an occasional voice, not a daily ritual
  const activeCrew = journey.crew.filter(m => m.isActive);
  if (activeCrew.length > 0 && Math.random() < 0.35) {
    const speaker = activeCrew[Math.floor(Math.random() * activeCrew.length)];
    const comment = getCrewComment(speaker, journey);
    if (comment) {
      ui.write(comment);
      ui.write('');
    }
  }
}


/**
 * Build ASCII block progress map (Phase 5.4)
 * Shows block-by-block journey with current position marker
 */
function buildBlockMap(journey) {
  const blocks = journey.blocks || [];
  const currentIdx = journey.currentBlockIndex;

  // Show at most 7 blocks centered on current position
  const windowSize = 7;
  let startIdx = Math.max(0, currentIdx - 3);
  let endIdx = Math.min(blocks.length, startIdx + windowSize);
  startIdx = Math.max(0, endIdx - windowSize);

  const parts = [];
  if (startIdx > 0) parts.push('...');

  for (let i = startIdx; i < endIdx; i++) {
    const block = blocks[i];
    const shortName = abbreviateBlockName(block.name);
    const supplyMarker = block.hasSupply ? '*' : '';

    if (i === currentIdx) {
      parts.push(`>>>${shortName}${supplyMarker}<<<`);
    } else if (i < currentIdx) {
      parts.push(`[${shortName}${supplyMarker}]`);
    } else {
      parts.push(`(${shortName}${supplyMarker})`);
    }
  }

  if (endIdx < blocks.length) parts.push('...');

  return parts.join('\u2500');
}

/**
 * Abbreviate a block name to ~8 chars for the map
 */
function abbreviateBlockName(name) {
  if (!name) return '???';
  if (name.length <= 8) return name;
  // "Block FP-03 - Blackwater Salvage" reads as its block code on the strip,
  // not as the word "Block" seven times over.
  const code = name.match(/^Block\s+([A-Z]{1,3}-\d+[A-Z]?)/i);
  if (code) return code[1];
  // Take first word, truncate if needed
  const words = name.split(/[\s-]+/);
  if (words[0].length <= 8) return words[0];
  return name.substring(0, 7) + '.';
}

function ensureRationPlan(journey) {
  if (!journey.rationPlan) {
    journey.rationPlan = {
      mode: 'normal',
      shortRationStreak: 0,
      lastDecisionDay: 0
    };
  }

  return journey.rationPlan;
}

function formatTerrainLabel(terrainId) {
  if (!terrainId) return 'unknown';
  return terrainId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** "glacial_current" reads as "glacial current" to the player. */
function formatHazardLabel(hazardId) {
  return String(hazardId || '').replace(/_/g, ' ');
}

function getRouteHazardSummary(currentBlock, nextBlock, weather) {
  const hazardSet = new Set(nextBlock?.hazards || []);
  const details = [];

  if (nextBlock?.terrain) {
    details.push(`${formatTerrainLabel(nextBlock.terrain)} terrain`);
  }
  if (hazardSet.size > 0) {
    details.push(`hazards: ${Array.from(hazardSet).slice(0, 2).map(formatHazardLabel).join(', ')}`);
  }
  if (weather?.dangerous) {
    details.push(weather.name.toLowerCase());
  }
  if (nextBlock?.hasSupply) {
    details.push('supply point ahead');
  }

  return details.length > 0
    ? `${nextBlock?.name || 'Next block'} ahead: ${details.join(' | ')}.`
    : '';
}

/**
 * What the detour actually goes around, in the words a crew would use for
 * this leg's ground: snag patches on a beetle-kill road, soft spots on
 * muskeg, the steepest pitches on a grade, the roughest ground otherwise.
 */
function describeDetourObstacle(nextBlock, currentBlock) {
  const hazards = new Set([...(nextBlock?.hazards || []), ...(currentBlock?.hazards || [])].map(normalizeReconToken));
  const terrain = normalizeReconToken(nextBlock?.terrain || currentBlock?.terrain);
  if (hazards.has('snag_hazard') || hazards.has('falling_timber') || hazards.has('deadfall') || hazards.has('windthrow')) {
    return 'the worst of the snag patches';
  }
  if (terrain === 'muskeg' || hazards.has('bog') || hazards.has('subsidence') || hazards.has('permafrost')) {
    return 'the worst of the soft spots';
  }
  if (hazards.has('washout') || hazards.has('erosion')) {
    return 'the washed-out stretch';
  }
  if (terrain === 'steep' || hazards.has('grade') || hazards.has('rockslide') || hazards.has('narrow')) {
    return 'the steepest pitches';
  }
  return 'the roughest ground';
}

function buildRoutePlan(choiceId, journey, currentBlock, nextBlock) {
  const preset = ROUTE_PRESETS[choiceId] || ROUTE_PRESETS.mainline;
  const terrainLabel = formatTerrainLabel(nextBlock?.terrain || currentBlock?.terrain || 'unknown').toLowerCase();
  const hazardCount = (currentBlock?.hazards?.length || 0) + (nextBlock?.hazards?.length || 0);
  let note = 'You hold to the existing line and keep the crew on a steady tempo.';

  if (choiceId === 'detour') {
    note = `You take the longer, better-graded line around ${describeDetourObstacle(nextBlock, currentBlock)} and lose time, but the crew gets a cleaner ${terrainLabel} leg.`;
  } else if (choiceId === 'shortcut') {
    note = `You cut a rough shortcut through the ${terrainLabel}, gambling that the extra speed is worth the wear.`;
  } else if (hazardCount > 0) {
    note = `You stay on the mainline and thread through the hazards instead of giving up time on a detour.`;
  }

  return {
    ...preset,
    day: journey.day,
    note
  };
}

function chooseTreatmentEffect(member) {
  // A splinted arm needs time, not a second kit; treat whatever else is wrong.
  const activeEffects = (member.statusEffects || [])
    .filter((effect) => !(effect.treated && STATUS_EFFECTS[effect.effectId]?.healsWithTime))
    .map((effect) => effect.effectId);
  if (!activeEffects.length) return null;

  for (const effectId of TREATMENT_PRIORITY) {
    if (activeEffects.includes(effectId)) {
      return effectId;
    }
  }

  return activeEffects[0] || null;
}

/** A crew member this low is a few short-ration shifts from walking (crew.js quits at 10). */
export const SHORT_RATION_MORALE_FLOOR = 30;
/** What a shift on short rations costs each crew member (js/crew.js processDailyUpdate). */
const SHORT_RATION_MORALE_COST = 4;

/**
 * Whether a short-rations order should come off by itself, and why.
 *
 * Short rations are a standing order (Set the tempo), but an order is given
 * for a reason, and it lapses when the reason does: the box has been
 * restocked past the warning line, or the crew is close enough to walking
 * that the food saved is not worth the person lost. A thin box keeps the
 * order; the morning beat says what it is costing instead.
 * @param {Object} journey
 * @returns {{reason: 'restocked'|'morale', food: number, member?: Object}|null}
 */
export function reviewShortRations(journey) {
  const rations = ensureRationPlan(journey);
  if (rations.mode !== 'short') return null;
  const food = Number(journey.resources?.food || 0);
  if (food <= 0) return null;
  // Restocked: back above the warning line, and more than the order was
  // given on (an order given on a full box to stretch it lapses at the next
  // restock, not the next morning).
  const orderedAt = Number(rations.orderedAtFood);
  const restocked = food > FIELD_RESOURCES.food.warning
    && (!Number.isFinite(orderedAt) || food > orderedAt);
  if (restocked) return { reason: 'restocked', food };
  if (food <= FIELD_RESOURCES.food.critical) return null;
  const active = (journey.crew || []).filter((member) => member.isActive);
  const lowest = active.reduce((low, member) => (!low || member.morale < low.morale ? member : low), null);
  if (lowest && lowest.morale <= SHORT_RATION_MORALE_FLOOR) return { reason: 'morale', food, member: lowest };
  return null;
}

/**
 * Lift a lapsed short-rations order and say why. Returns true when it lifted.
 * Called on the morning food beat and straight after anything that restocks
 * the box, so a grocery run does not leave the crew on 65% for the night.
 */
function liftLapsedShortRations(ui, journey) {
  const review = reviewShortRations(journey);
  if (!review) return false;
  const rations = ensureRationPlan(journey);
  rations.mode = 'normal';
  rations.shortRationStreak = 0;
  rations.orderedAtFood = null;
  const food = Math.round(review.food * 10) / 10;
  if (review.reason === 'restocked') {
    ui.writePositive(`Food is back up to ${food} person-days. Short rations lift; the crew is back on full meals.`);
  } else {
    ui.writeWarning(`${review.member.name} is at morale ${Math.round(review.member.morale)} and short rations cost everyone ${SHORT_RATION_MORALE_COST} a shift. You put the crew back on full meals; the box (${food} person-days) can carry it for now.`);
  }
  return true;
}

/**
 * Whether this morning opens on the food box. Once a day, and only when there
 * is something to say: an empty box, a crew already on short rations running
 * critically low, or a thin box on full rations that wants a decision.
 */
function foodBeatDue(journey) {
  const rations = ensureRationPlan(journey);
  const food = journey.resources.food || 0;
  if (rations.lastDecisionDay === journey.day) return false;
  if (reviewShortRations(journey)) return true;
  if (food > FIELD_RESOURCES.food.warning) return false;
  if (food <= 0) return true;
  // Short rations are a carried standing order (Set the tempo). A crew
  // already on them is not asked again every morning; it hears about it
  // again only when the box is nearly empty.
  if (rations.mode === 'short') return food <= FIELD_RESOURCES.food.critical;
  return true;
}

async function maybeHandleFoodDecision(game) {
  const { ui, journey } = game;
  const rations = ensureRationPlan(journey);

  if (!foodBeatDue(journey)) {
    return;
  }
  rations.lastDecisionDay = journey.day;
  const foodLevel = journey.resources.food || 0;

  if (liftLapsedShortRations(ui, journey)) {
    ui.write('');
    return;
  }

  // An empty box is not a rationing decision; full or short of nothing is
  // nothing. Say what the day costs and what fixes it.
  if (foodLevel <= 0) {
    const hungryDays = Number(journey.resourcePressure?.hungryDays || 0);
    ui.writeDanger(hungryDays > 0
      ? `The food box has been empty for ${hungryDays} shift${hungryDays === 1 ? '' : 's'}. The crew is working on nothing, and it shows.`
      : 'The food box is empty. Nobody eats today unless you get food in.');
    ui.write('A grocery run, the supply point or a ration cache (Camp & crew) is the only fix. Rest does not heal a crew with nothing to eat.');
    ui.write('');
    return;
  }

  if (rations.mode === 'short') {
    ui.writeWarning(`Food is down to ${Math.round(foodLevel * 10) / 10} person-days, and the crew is ${rations.shortRationStreak || 1} day${rations.shortRationStreak === 1 ? '' : 's'} into short rations at ${SHORT_RATION_MORALE_COST} morale a shift each. Get food in before the box is empty.`);
    ui.write('');
    return;
  }

  const prompt = foodLevel <= FIELD_RESOURCES.food.critical
    ? 'Food stores are critically low. Decide how to handle the crew\'s meals.'
    : 'Food stores are running thin. Decide how to handle rations.';

  // Setting the ration policy is a call, not a job. Actually going out to
  // the cache is a shift's work and lives on the shift menu instead.
  const choice = await ui.promptChoice(prompt, [
    {
      label: 'Keep Full Rations',
      description: 'Normal food use; keeps the crew steadier if you can afford it',
      value: 'full'
    },
    {
      label: 'Short Rations and Push On',
      description: '65% portions until you change the order; the crew will feel it',
      value: 'short'
    }
  ]);

  if (choice.value === 'short') {
    rations.mode = 'short';
    rations.shortRationStreak = 1;
    rations.orderedAtFood = foodLevel;
    ui.writeWarning(`Short rations ordered: ${SHORT_RATION_MORALE_COST} morale a shift for everyone. They hold until you change them under Set the tempo, the box is restocked, or someone gets close to walking.`);
    ui.write('');
    return;
  }

  rations.mode = 'normal';
  rations.shortRationStreak = 0;
  ui.write('You keep the crew on full rations and accept the extra draw on supplies.');
  ui.write('');
}

async function maybePromptRouteChoice(game, currentBlock) {
  const { ui, journey } = game;
  const nextBlock = journey.blocks[journey.currentBlockIndex + 1];

  if (!nextBlock) {
    return;
  }

  // A flat leg with nothing on it is not a decision. The route call is only
  // worth asking when the ground or the sky give it something to trade.
  const flatQuietLeg = normalizeReconToken(nextBlock.terrain) === 'flat'
    && (nextBlock.hazards || []).length === 0
    && !journey.weather?.dangerous;
  if (flatQuietLeg) {
    journey.routePlan = buildRoutePlan('mainline', journey, currentBlock, nextBlock);
    journey.routePlan.note = `Good road to ${nextBlock.name}. The crew rides easy and talks about lunch.`;
    return;
  }

  const hazardSummary = getRouteHazardSummary(currentBlock, nextBlock, journey.weather);
  const choice = await ui.promptChoice(
    hazardSummary || `Choose today's route to ${nextBlock.name}.`,
    [
      {
        label: 'Safe Detour',
        description: 'Lower injury risk, lower wear, slower progress, higher fuel burn',
        value: 'detour'
      },
      {
        label: 'Stay Mainline',
        description: 'Balanced progress, wear, and risk',
        value: 'mainline'
      },
      {
        label: 'Risky Shortcut',
        description: 'Faster progress and less fuel, but more wear and mishap risk',
        value: 'shortcut'
      }
    ]
  );

  journey.routePlan = buildRoutePlan(choice.value, journey, currentBlock, nextBlock);
}

function applyReconTravelIntelPenalty(ui, journey, currentBlock, actionId) {
  if (!currentBlock) {
    return;
  }

  const blockIntel = getReconBlockIntel(journey, currentBlock);
  const accessVerdict = getBlockAccessVerdict(currentBlock, journey.weather, journey);
  const accessSeverity = getReconAccessSeverity(accessVerdict);
  const pacePressure = actionId === 'grueling' ? 2 : actionId === 'fast' ? 1 : 0;

  if (!blockIntel.accessGroundTruthed && accessSeverity > 0) {
    const equipmentLoss = accessSeverity + pacePressure;
    const fuelLoss = Math.max(1, accessSeverity - 1 + pacePressure) * 4;
    journey.resources.equipment = Math.max(0, journey.resources.equipment - equipmentLoss);
    journey.resources.fuel = Math.max(0, journey.resources.fuel - fuelLoss);
    journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + accessSeverity);
    ui.writeWarning(`You moved without recording the road check. ${accessVerdict.summary} Equipment -${equipmentLoss}, fuel -${fuelLoss} L, scrutiny +${accessSeverity}.`);

    if (Math.random() < (0.08 * accessSeverity) + (pacePressure * 0.04)) {
      const activeCrew = journey.crew.filter((member) => member.isActive);
      const victim = activeCrew.length ? activeCrew[Math.floor(Math.random() * activeCrew.length)] : null;
      if (victim) {
        const injury = applyRandomInjury(victim, accessSeverity >= 2 ? 'moderate' : 'minor');
        ui.writeWarning(`Access mistake! ${injury.message}`);
      }
    }
  }

  const valuesSweep = getReconValueSweepProfile(currentBlock, journey);
  if (isPackageBlock(currentBlock) && !blockIntel.assessmentComplete && (!blockIntel.layoutWalked || !blockIntel.valuesSwept)) {
    const scrutinyGain = Math.min(3, Math.max(1, valuesSweep.tags.length));
    journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + scrutinyGain);
    ui.writeWarning(`${currentBlock.name} leaves the file open: ${getReconMissingSteps(journey, currentBlock).join(', ')} still to do. Scrutiny +${scrutinyGain}.`);
  }
}

/**
 * The first shift on a block: boundary walked and ribboned, streams
 * classified, terrain and soils noted, danger trees flagged. Writes the road
 * check too if the truck never did (a block the crew started on).
 */
function handleLayoutShift(ui, journey, block) {
  if (!block) {
    ui.write('There is no active block to work.');
    return;
  }

  const intel = getReconBlockIntel(journey, block);
  const recordedRoad = !intel.accessGroundTruthed;
  const verdict = recordedRoad
    ? recordAccessVerdict(journey, block, getBlockAccessVerdict(block, journey.weather, journey), journey.weather)
    : (journey.accessVerdicts?.[block.id] || getBlockAccessVerdict(block, journey.weather, journey));
  if (recordedRoad) {
    intel.accessGroundTruthed = true;
    intel.lastAccessDay = journey.day;
    addDiscoveryTags(journey, inferDiscoveryTagsFromAccess(block, verdict, journey.weather), {
      source: `ground-truth:${block.id}`,
      severity: verdict.id === 'no_go' ? 3 : verdict.id === 'heli_only' || verdict.id === 'winter_only' ? 2 : 1,
      note: verdict.summary,
      details: { blockId: block.id, verdict: verdict.id }
    });
  }
  intel.layoutWalked = true;
  intel.lastLayoutDay = journey.day;

  const layout = getReconLayoutProfile(block);
  ui.writeHeader('BOUNDARY SHIFT');
  const rolls = Math.min(FLAGGING_PER_BLOCK, Number(journey.resources.flaggingTape) || 0);
  if (Number.isFinite(journey.resources.flaggingTape)) {
    journey.resources.flaggingTape = Math.max(0, journey.resources.flaggingTape - FLAGGING_PER_BLOCK);
  }
  ui.write(rolls >= FLAGGING_PER_BLOCK
    ? `Boundary walked and ribboned; ${rolls} rolls of flagging hung, corners tied in with the GPS.`
    : 'Boundary walked; the crew is out of flagging and ties the corners with survey tape and a promise to come back with ribbon.');
  for (const line of layout.streams) ui.write(`Stream: ${line}.`);
  for (const line of layout.terrain) ui.write(`Terrain: ${line}.`);
  for (const line of layout.dangerTrees) ui.write(`Danger trees: ${line}.`);

  if (recordedRoad) {
    ui.write('');
    if (verdict.id === 'passable_now') ui.writePositive(formatAccessVerdict(verdict));
    else if (verdict.id === 'no_go' || verdict.id === 'heli_only') ui.writeDanger(formatAccessVerdict(verdict));
    else ui.writeWarning(formatAccessVerdict(verdict));
    const infrastructureLine = formatInfrastructureStatus(verdict);
    if (infrastructureLine) ui.write(infrastructureLine);
    ui.write('Road check recorded. This is a field observation, not authorization to build a road or use a damaged crossing.');
  }

  journey.scrutiny = Math.max(0, (journey.scrutiny || 0) - 1);
  ui.write('Traverse notes and stream cards go in the file. One more shift on the ground closes the package.', 'term-dim');
  maybeFinalizeReconAssessment(ui, journey, block);
}

function handleValuesSweep(ui, journey, block) {
  if (!block) {
    ui.write('There is no active block to sweep.');
    return;
  }

  const sweep = getReconValueSweepProfile(block, journey);
  const intel = getReconBlockIntel(journey, block);
  intel.valuesSwept = true;
  intel.lastValuesDay = journey.day;

  ui.writeHeader('WTP, WILDLIFE & CH SWEEP');
  if (!sweep.needed) {
    ui.write('A waypoint, not a block. Nothing to sweep here beyond the road notes.');
    return;
  }

  if (sweep.tags.length) {
    addDiscoveryTags(journey, sweep.tags, {
      source: `values-sweep:${block.id}`,
      severity: 2,
      note: sweep.notes.join(' | '),
      details: {
        blockId: block.id,
        weather: journey.weather?.id || null
      }
    });
  }

  for (const note of sweep.notes) {
    ui.write(note.charAt(0).toUpperCase() + note.slice(1) + '.');
  }
  if (sweep.tags.length) {
    const labels = sweep.tags.map((tagId) => getDiscoveryTagDefinition(tagId)?.label || tagId);
    ui.writePositive(`Carry-forward for the site plan: ${labels.join('; ')}`);
  } else {
    ui.writePositive('Recorded for the site plan. No carry-forward flags off this block.');
  }
  journey.scrutiny = Math.max(0, (journey.scrutiny || 0) - Math.min(2, Math.max(1, sweep.tags.length)));
  maybeFinalizeReconAssessment(ui, journey, block);
}

/**
 * Drive to town and bring back a Level 3 attendant. One shift, paid by
 * remoteness; the crew is legal to work again tomorrow.
 */
function handleReplaceAttendant(ui, journey) {
  const cost = priceByRemoteness(journey, ATTENDANT_REPLACEMENT_COST);
  const cash = Number(journey.resources.budget || 0);
  ui.writeHeader('REPLACEMENT ATTENDANT');
  if (cash < cost) {
    ui.writeWarning(`The office will not release a Level 3 without $${cost} on the card. Cash on hand: ${formatDollars(cash)}.`);
    ui.write('The crew stays in camp on light duties. Nobody works a line until an attendant is back.');
    return;
  }
  journey.resources.budget = Math.max(0, cash - cost);
  const role = FIELD_ROLES.find((r) => r.id === 'medic');
  const replacement = generateCrewMember('field', role || null);
  const names = new Set(journey.crew.map((m) => m.name));
  let guard = 0;
  while (names.has(replacement.name) && guard++ < 20) {
    replacement.name = generateCrewMember('field', role || null).name;
  }
  journey.crew.push(replacement);
  ui.writePositive(`${replacement.name} (OFA 3, with the ETV) rides back out with the driver. $${cost} on the card.`);
  chargeCondemnedCrossings(ui, journey);
  ui.write('WorkSafeBC first aid coverage is back in place. The crew can work the line tomorrow.');
}

/**
 * A cardlock fuel run: one truck, one shift, priced by how far out the crew is.
 */
function handleFuelRun(ui, journey) {
  const cost = priceByRemoteness(journey, FUEL_RUN_BASE_COST);
  const cash = Number(journey.resources.budget || 0);
  ui.writeHeader('FUEL RUN');
  if (cash < cost) {
    ui.writeWarning(`The cardlock wants $${cost} and the card has ${formatDollars(cash)} on it. The driver comes back with coffee and no fuel.`);
    return;
  }
  journey.resources.budget = Math.max(0, cash - cost);
  journey.resources.fuel = Math.min(FIELD_RESOURCES.fuel.max, (journey.resources.fuel || 0) + FUEL_RUN_LITRES);
  ui.writePositive(`The driver fills two jerry cans and the tank at the cardlock. Fuel +${FUEL_RUN_LITRES} L, $${cost}. Fuel now ${Math.round(journey.resources.fuel)} L.`);
  chargeCondemnedCrossings(ui, journey);
}

/**
 * A grocery run to town: one truck, one shift, a crate and the camp box
 * refilled, priced by how far out the crew is.
 */
function handleGroceryRun(ui, journey) {
  const cost = priceByRemoteness(journey, GROCERY_RUN_BASE_COST);
  const cash = Number(journey.resources.budget || 0);
  ui.writeHeader('GROCERY RUN');
  if (cash < cost) {
    ui.writeWarning(`The store wants $${cost} and the card has ${formatDollars(cash)} on it. The driver comes back with a bag of apples and an apology.`);
    return;
  }
  journey.resources.budget = Math.max(0, cash - cost);
  journey.resources.food = Math.min(FIELD_RESOURCES.food.max, (journey.resources.food || 0) + GROCERY_RUN_FOOD);
  ui.writePositive(`The driver fills the cooler and the dry box in town. Food +${GROCERY_RUN_FOOD} person-days, $${cost}. Food now ${Math.round(journey.resources.food)} person-days.`);
  chargeCondemnedCrossings(ui, journey);
  liftLapsedShortRations(ui, journey);
}

/**
 * Freight economics for anything bought out here: the deeper into the
 * traverse, the more everything costs.
 */
function priceByRemoteness(journey, base) {
  const remoteness = journey.totalDistance > 0
    ? Math.min(1, journey.distanceTraveled / journey.totalDistance)
    : 0;
  const priceFactor = 1 + remoteness * 0.45 + (journey.day > 15 ? 0.1 : 0);
  return Math.round((base * priceFactor) / 10) * 10;
}

// Keep the saved action value for compatibility, but require real fieldwork.
// A follow-up returns to an earlier visited block and back to camp; it never
// awards traverse progress or completes both inspections in one shift.
function getReconNotebookTargets(journey) {
  const blocks = Array.isArray(journey?.blocks) ? journey.blocks : [];
  const currentIndex = Number(journey?.currentBlockIndex || 0);
  return getReconOpenPackages(journey).filter(({ block }) => {
    const index = blocks.indexOf(block);
    return index > -1 && index < currentIndex && !isBlockEnjoined(journey, block);
  });
}

/**
 * A crossing the crew broke behind them keeps costing, but only the trips
 * that go back over it: a run to town, a return visit to a block on the far
 * side. The traverse itself only goes forward and never recrosses it. This is
 * the standing half of a bad band that would otherwise have been a one-day
 * bill (js/events/consequences.js).
 * @param {Object} ui
 * @param {Object} journey
 * @param {number} [backToIndex=-1] - the stop the trip goes back to; -1 is town
 */
function chargeCondemnedCrossings(ui, journey, backToIndex = -1) {
  const recrossed = (journey.condemnedCrossings || []).filter((id) => {
    const index = (journey.blocks || []).findIndex((block) => block.id === id);
    return index > backToIndex && index <= journey.currentBlockIndex;
  });
  const toll = getCondemnedCrossingPenalty({ condemnedCrossings: recrossed });
  if (toll.fuel <= 0 && toll.equipment <= 0) return;
  journey.resources.fuel = Math.max(0, journey.resources.fuel - toll.fuel);
  journey.resources.equipment = Math.max(0, journey.resources.equipment - toll.equipment);
  ui.writeWarning(`${toll.note} Fuel -${toll.fuel} L, equipment -${toll.equipment}.`);
}

function handleFieldNotebook(ui, journey) {
  const target = getReconNotebookTargets(journey)[0];
  if (!target) {
    ui.write('No earlier blocks need a field follow-up. Use Work the block for checks at your current location.');
    return false;
  }
  if ((journey.resources.fuel || 0) < NOTEBOOK_FUEL_L) {
    ui.writeWarning(`The return field visit needs ${NOTEBOOK_FUEL_L} L. Resupply before sending the crew.`);
    return false;
  }

  journey.resources.fuel -= NOTEBOOK_FUEL_L;
  ui.writeHeader('RETURN FIELD VISIT');
  ui.write(`The crew revisits ${target.block.name}, then returns to camp. Fuel used: ${NOTEBOOK_FUEL_L} L.`);
  chargeCondemnedCrossings(ui, journey, journey.blocks.indexOf(target.block));
  if (!target.intel.layoutWalked) {
    handleLayoutShift(ui, journey, target.block);
  } else {
    handleValuesSweep(ui, journey, target.block);
  }
  return true;
}

/**
 * Scout ahead to reveal next block conditions (Phase 4.3)
 */
function handleScoutAhead(ui, journey) {
  const nextIndex = journey.currentBlockIndex + 1;
  if (nextIndex >= journey.blocks.length) {
    ui.write('You are at the final block. No further scouting needed.');
    return;
  }

  const nextBlock = journey.blocks[nextIndex];
  const hasSpotter = journey.crew.some(m => m.isActive && m.role === 'spotter');

  ui.writeHeader('ROAD SCOUT');
  ui.write(`Next: ${nextBlock.name}${isPackageBlock(nextBlock) ? ' (block)' : ' (waypoint)'}`);
  ui.write(`Terrain: ${nextBlock.terrain} | Distance: ${nextBlock.distance} km`);
  ui.write(`Description: ${nextBlock.description}`);

  if (nextBlock.hazards && nextBlock.hazards.length > 0) {
    ui.writeWarning(`Hazards: ${nextBlock.hazards.map(formatHazardLabel).join(', ')}`);
  }

  const accessVerdict = recordAccessVerdict(
    journey,
    nextBlock,
    getBlockAccessVerdict(nextBlock, journey.weather, journey),
    journey.weather
  );
  addDiscoveryTags(journey, inferDiscoveryTagsFromAccess(nextBlock, accessVerdict, journey.weather), {
    source: `scout:${nextBlock.id}`,
    severity: accessVerdict.id === 'no_go' ? 3 : 2,
    note: accessVerdict.summary,
    details: {
      blockId: nextBlock.id,
      verdict: accessVerdict.id
    }
  });
  const accessLine = formatAccessVerdict(accessVerdict);
  if (accessVerdict.id === 'passable_now') {
    ui.writePositive(accessLine);
  } else if (accessVerdict.id === 'no_go' || accessVerdict.id === 'heli_only') {
    ui.writeDanger(accessLine);
  } else {
    ui.writeWarning(accessLine);
  }
  const infrastructureLine = formatInfrastructureStatus(accessVerdict);
  if (infrastructureLine) {
    ui.write(infrastructureLine);
  }

  if (nextBlock.hasSupply) {
    ui.writePositive('Supply point available at this location.');
  }

  if (hasSpotter) {
    // Bonus info from spotter
    const blocksAhead = journey.blocks.slice(nextIndex + 1, nextIndex + 3);
    if (blocksAhead.length > 0) {
      const supplyBlocks = blocksAhead.filter(b => b.hasSupply);
      if (supplyBlocks.length > 0) {
        ui.writePositive(`The compassman reports a supply point at ${supplyBlocks[0].name} (${supplyBlocks[0].distance} km on).`);
      } else {
        ui.write('The compassman sees no supply points in the next few stops.');
      }
    }
  }
}

/**
 * Handle resupply at a trading post
 * @param {Object} game - Game instance
 * @param {Object} block - Current block with supply point
 */
export async function handleResupply(game, block) {
  const { ui, journey } = game;
  const cash = journey.resources.budget || 0;
  ui.writeHeader(`RESUPPLY: ${block?.name || 'Supply Point'}`);
  ui.write(`Cash on hand: ${formatDollars(cash)}`);

  // Freight economics: the deeper into the traverse, the more everything
  // costs — buy early or pay the remoteness premium.
  const remoteness = journey.totalDistance > 0
    ? Math.min(1, journey.distanceTraveled / journey.totalDistance)
    : 0;
  const priceFactor = 1 + remoteness * 0.45 + (journey.day > 15 ? 0.1 : 0);
  const priced = (base) => Math.round((base * priceFactor) / 10) * 10;
  if (priceFactor > 1.15) {
    ui.write('Prices out here carry the freight bill.', 'term-dim');
  }
  ui.write('');

  const clampToMax = (resourceId, value) => {
    const def = FIELD_RESOURCES[resourceId];
    if (!def) return value;
    return Math.max(0, Math.min(def.max ?? value, value));
  };
  const FLAGGING_MAX = 60;
  const roomFor = (resourceId) => {
    const max = resourceId === 'flaggingTape' ? FLAGGING_MAX : FIELD_RESOURCES[resourceId]?.max;
    return Math.max(0, (max ?? Infinity) - (Number(journey.resources[resourceId]) || 0));
  };

  // A single item sells only what the truck can hold, at a pro-rated price;
  // paying $180 for a crate that does not fit used to print "Purchased" and
  // change nothing.
  const single = (id, resourceId, amount, unit, name, description, baseCost) => () => {
    const qty = Math.min(amount, Math.floor(roomFor(resourceId)));
    if (qty <= 0) return null;
    const cost = qty === amount
      ? priced(baseCost)
      : Math.max(10, Math.round((priced(baseCost) * qty / amount) / 10) * 10);
    return {
      id,
      label: qty === amount ? `${name} (+${amount}${unit})` : `${name}, part (+${qty}${unit}, all that fits)`,
      description,
      cost,
      apply: () => {
        journey.resources[resourceId] = resourceId === 'flaggingTape'
          ? Math.min(FLAGGING_MAX, (journey.resources.flaggingTape || 0) + qty)
          : clampToMax(resourceId, journey.resources[resourceId] + qty);
      }
    };
  };

  // The restock is a freight bundle at a bundle price, charged for what the
  // truck actually takes: a full list is $700 against about $1,090 bought
  // item by item, and a part-load pays the same share of the bundle. With
  // room for only one of its lines it is that single item at a discount, so
  // it comes off the shelf; the single item is still there.
  const RESTOCK = [
    { resourceId: 'fuel', amount: 200, unit: ' L fuel', rate: 360 / 200, min: 50 },
    { resourceId: 'food', amount: 25, unit: ' person-days food', rate: 160 / 20, min: 6 },
    { resourceId: 'equipment', amount: 20, unit: '% equipment', rate: 220 / 15, min: 5 },
    { resourceId: 'firstAid', amount: 2, unit: ' kits', rate: 120, min: 1 }
  ];
  const restock = () => {
    const lines = RESTOCK.map((line) => ({ ...line, qty: Math.min(line.amount, Math.floor(roomFor(line.resourceId))) }));
    if (lines.filter((line) => line.qty >= line.min).length < 2) return null;
    const full = lines.every((line) => line.qty === line.amount);
    const value = lines.reduce((sum, line) => sum + line.qty * line.rate, 0);
    const listValue = RESTOCK.reduce((sum, line) => sum + line.amount * line.rate, 0);
    const cost = full ? priced(700) : Math.max(10, Math.round((priced(700) * value / listValue) / 10) * 10);
    const landing = lines.filter((line) => line.qty > 0);
    return {
      id: 'full_restock',
      label: full ? 'Full restock' : 'Restock, part (all that fits)',
      description: landing.map((line) => `+${line.qty}${line.unit}`).join(', '),
      cost,
      apply: () => {
        for (const line of landing) {
          journey.resources[line.resourceId] = clampToMax(line.resourceId, journey.resources[line.resourceId] + line.qty);
        }
      }
    };
  };
  const SHELF_NAMES = {
    fuel_drum: 'Fuel drum', rations: 'Rations crate', first_aid: 'First aid kit',
    flagging: 'Flagging', field_repair: 'Field repair', full_restock: 'Full restock'
  };

  const offerBuilders = [
    single('fuel_drum', 'fuel', 200, ' L', 'Fuel drum', 'A 205 L drum of diesel, pumped into the tanks and the cans', 360),
    single('rations', 'food', 20, ' person-days', 'Rations crate', 'Four days of camp food for five', 160),
    single('first_aid', 'firstAid', 1, ' kit', 'First aid kit', 'Level 3 kit restock', 120),
    single('flagging', 'flaggingTape', 12, ' rolls', 'Flagging', 'Ribbon for the next four boundaries', 60),
    single('field_repair', 'equipment', 15, '% equipment', 'Field repair', 'Tires, a fuel filter, a chain and bar', 220),
    restock
  ];

  // Positions hold for the whole visit: an item that stops fitting, or that
  // the card can no longer cover, stays in its row, disabled with the reason,
  // so a number key never slides onto the next item on the shelf.
  const shelf = offerBuilders.map((build) => build()?.id ?? null);
  while (true) {
    const money = journey.resources.budget || 0;
    const built = offerBuilders.map((build) => build());
    const offers = built.filter(Boolean);
    const affordableOffers = offers.filter((offer) => money >= offer.cost);

    if (offers.length === 0) {
      ui.write('The truck is full. Nothing here it can carry.');
      break;
    }
    if (affordableOffers.length === 0) {
      // What the card cannot cover is still named with its price, the way an
      // event card says what it could not pay for.
      for (const offer of offers) {
        ui.write(`${offer.label} ($${offer.cost}): $${Math.ceil(offer.cost - money)} short.`, 'term-dim');
      }
      ui.writeWarning('You cannot afford anything at this stop. Better keep moving.');
      break;
    }

    const options = [];
    shelf.forEach((id, index) => {
      const offer = built[index];
      if (offer) {
        const short = money < offer.cost;
        options.push({
          label: `${offer.label} ($${offer.cost})`,
          description: short ? `$${Math.ceil(offer.cost - money)} short` : offer.description,
          value: offer.id,
          ...(short ? { disabled: true } : {})
        });
      } else if (id) {
        options.push({ label: SHELF_NAMES[id] || id, description: 'No room left on the truck for it', value: id, disabled: true });
      }
    });
    options.push({ label: 'Done', description: 'Finish shopping', value: 'done' });

    const choice = await ui.promptChoice(`Buy supplies (cash: ${formatDollars(money)}):`, options);
    if (!choice || choice.value === 'done') break;

    const offer = affordableOffers.find(o => o.id === choice.value);
    if (!offer) continue;

    journey.resources.budget = Math.max(0, money - offer.cost);
    offer.apply();
    ui.writePositive(`Purchased ${offer.label}.`);
    liftLapsedShortRations(ui, journey);
    ui.updateAllStatus(journey);
    updateReconMissionStatus(ui, journey);
  }

  ui.write('');
}

/**
 * Handle triage - treating injured crew members
 * @param {Object} game - Game instance
 */
export async function handleTriage(game) {
  const { ui, journey } = game;

  if ((journey.resources.firstAid || 0) <= 0) {
    ui.writeWarning('No first aid kits left.');
    return;
  }

  const candidates = journey.crew.filter(m => m.isActive && (m.health < 100 || needsTreatment(m)));
  if (candidates.length === 0) {
    ui.write('Nobody needs treatment today.');
    return;
  }

  const options = candidates.map(m => {
    const info = getCrewDisplayInfo(m);
    // Every condition they carry, not just the first one on the list.
    const effect = info.effects?.length ? `, ${[...new Set(info.effects.map((e) => e.name))].join(', ')}` : '';
    return {
      label: `${info.name} (${info.health}% HP${effect})`,
      description: info.role,
      value: m.id
    };
  });

  const choice = await ui.promptChoice('Treat who?', options);
  const target = journey.crew.find(m => m.id === choice.value);
  if (!target || !target.isActive) return;

  const effectId = chooseTreatmentEffect(target);
  if (effectId) {
    const treated = treatCrewCondition(target, effectId, journey.day);
    if (treated.kitUsed === false) {
      // Nothing a kit can do; it stays in the box.
      if (treated.message) ui.write(treated.message);
      return;
    }
    journey.resources.firstAid = Math.max(0, (journey.resources.firstAid || 0) - 1);
    if (treated.message) ui.writePositive(treated.message);
    const healthBefore = target.health;
    const healed = healCrewMember(target, treated.cleared ? 14 : 8);
    if (healed.message && target.health > healthBefore) ui.writePositive(healed.message);
    if (!treated.cleared && !treated.healsWithTime) {
      ui.write('They are stabilized for now, but this will take another treatment day or a rest shift to finish.');
    }
  } else {
    journey.resources.firstAid = Math.max(0, (journey.resources.firstAid || 0) - 1);
    const healed = healCrewMember(target, 25);
    if (healed.message) ui.writePositive(healed.message);
  }
}

/**
 * Handle maintenance - equipment repairs
 * @param {Object} game - Game instance
 */
export async function handleMaintenance(game) {
  const { ui, journey } = game;
  const hasMechanic = crewHasRole(journey.crew, 'mechanic');
  const cash = journey.resources.budget || 0;

  const options = [
    {
      label: hasMechanic ? 'DIY Maintenance' : 'DIY Maintenance (No mechanic)',
      description: '+10% equipment, 10% injury risk',
      value: 'diy'
    },
    {
      label: 'Hire Mobile Mechanic',
      description: '+25% equipment, costs $600 (call-out and mileage)',
      value: 'pro'
    }
  ];

  const choice = await ui.promptChoice('How do you handle maintenance?', options);

  if (choice.value === 'pro') {
    if (cash < 600) {
      ui.writeWarning('Not enough cash to hire a mechanic.');
      return;
    }
    journey.resources.budget = Math.max(0, cash - 600);
    journey.resources.equipment = Math.min(100, journey.resources.equipment + 25);
    ui.writePositive('Equipment serviced and patched up.');
    return;
  }

  // DIY maintenance
  const bonus = hasMechanic ? 14 : 10;
  journey.resources.equipment = Math.min(100, journey.resources.equipment + bonus);
  ui.writePositive('You tighten bolts, swap filters, and grease fittings.');

  if (Math.random() < 0.10) {
    const victim = journey.crew.find(m => m.isActive) || null;
    if (victim) {
      const result = applyRandomInjury(victim, 'minor');
      ui.writeWarning(`Accident during maintenance! ${result.message}`);
    }
  }
}

/**
 * Whether this stop has an emergency crate the crew has not already pulled.
 * One crate per cache — a supply point, a fire cache or a fuel cache — for
 * the whole season. It used to be raided every day.
 */
function canPullRationCache(journey, block) {
  if (!block?.id) return false;
  const features = new Set((block.features || []).map(normalizeReconToken));
  const cached = block.hasSupply || features.has('fire_cache') || features.has('fuel_cache');
  if (!cached) return false;
  if ((journey.resources.fuel || 0) < CACHE_FUEL_L) return false;
  return !(journey.rationCacheUsedAtBlockIds || []).includes(block.id);
}

/** Recover a known emergency cache instead of treating wildlife as routine provisioning. */
function retrieveCachedRations(ui, journey) {
  const block = journey.blocks[journey.currentBlockIndex];
  if (!canPullRationCache(journey, block)) {
    ui.writeWarning('There is no sealed crate left at this stop.');
    return;
  }
  journey.rationCacheUsedAtBlockIds = journey.rationCacheUsedAtBlockIds || [];
  journey.rationCacheUsedAtBlockIds.push(block.id);

  const foodBefore = Number(journey.resources.food || 0);
  const fuelBefore = Number(journey.resources.fuel || 0);
  const foodRecovered = Math.min(12, Math.max(0, FIELD_RESOURCES.food.max - foodBefore));
  const fuelUsed = Math.min(CACHE_FUEL_L, fuelBefore);

  journey.resources.food = foodBefore + foodRecovered;
  journey.resources.fuel = Math.max(0, fuelBefore - fuelUsed);

  ui.write('');
  ui.writeHeader('RATION CACHE');
  ui.writePositive(`The sealed crate was where the map said. ${foodRecovered} person-days.`);
  ui.write(`Fuel used reaching the cache: ${fuelUsed} L. Food now ${Math.round(journey.resources.food)} person-days.`);
  liftLapsedShortRations(ui, journey);
}
