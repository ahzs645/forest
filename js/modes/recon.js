/**
 * Recon Mode Runner
 * Field-based reconnaissance operations with crew mechanics
 */

import {
  applyRandomInjury,
  applyStatusEffect,
  crewHasRole,
  getCrewComment,
  getCrewDisplayInfo,
  healCrewMember,
  treatCrewCondition
} from '../crew.js';
import { getFieldProgressInfo, getSurveyedBlockCount } from '../journey.js';
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
  scoutCrossing,
  winchCrossing,
  fordCrossing
} from '../journey/riverCrossing.js';
import { getCurrentSegmentLength, getDistanceIntoCurrentSegment } from '../journey/blockNav.js';
import { presentDayCard, formatStatusLine } from '../journey/dayCard.js';
import { PACE_OPTIONS } from '../journey/constants.js';
import { recordTrailMarker, markersForBlock, formatTrailMarker } from '../journey/trailMarkers.js';
import { buildCrossingApproachFrames, buildCrossingResolveFrames } from '../scene/crossing.js';
import { buildCampfireFrames } from '../scene/textmode/effects.js';
import { buildNightCampFrames } from '../scene/textmode/scenes.js';
import { FIELD_RESOURCES } from '../resources.js';
import {
  addDiscoveryTags,
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

const RECON_CULTURAL_FEATURES = new Set([
  'first_nation',
  'cultural_site',
  'culturally_modified_trees'
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
  'hidden_cavities'
]);

function normalizeReconToken(value) {
  return String(value || '').trim().toLowerCase();
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
      accessGroundTruthed: false,
      valuesSwept: false,
      assessmentComplete: false,
      lastAccessDay: 0,
      lastValuesDay: 0
    };
  }
  return state.byBlock[key];
}

function getReconOpenPackages(journey) {
  const blocks = Array.isArray(journey?.blocks) ? journey.blocks : [];
  return blocks
    .map((block) => {
      const intel = getReconBlockIntel(journey, block);
      const sweep = getReconValueSweepProfile(block, journey);
      if (intel.assessmentComplete) {
        return null;
      }

      const missing = [];
      if (!intel.accessGroundTruthed) {
        missing.push('access check');
      }
      if (sweep.needed && !intel.valuesSwept) {
        missing.push('values sweep');
      }

      return missing.length > 0
        ? { block, intel, sweep, missing }
        : null;
    })
    .filter(Boolean);
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

  const sweep = getReconValueSweepProfile(block, journey);
  const assessmentReady = intel.accessGroundTruthed && (!sweep.needed || intel.valuesSwept);
  if (!assessmentReady) {
    return false;
  }

  intel.assessmentComplete = true;
  journey.blocksAssessed = Math.min((journey.blocks?.length || 0), (journey.blocksAssessed || 0) + 1);
  journey.verifiedBlocks = Math.min((journey.blocks?.length || 0), (journey.verifiedBlocks || 0) + 1);
  ui.writePositive(`Assessment package complete for ${block.name}. Blocks assessed: ${journey.blocksAssessed}/${journey.blocks?.length || 0}.`);
  return true;
}

function getReconValueSweepProfile(block, journey) {
  const features = new Set((block?.features || []).map(normalizeReconToken).filter(Boolean));
  const hazards = new Set((block?.hazards || []).map(normalizeReconToken).filter(Boolean));
  const tags = new Set();
  const notes = [];

  if ([...features].some((feature) => RECON_WATER_FEATURES.has(feature)) || [...hazards].some((hazard) => hazard === 'river_crossing' || hazard === 'flood' || hazard === 'washout')) {
    tags.add('watershed_watch');
    notes.push('crossings, riparian ground, or drinking-water values need cleaner notes');
  }
  if ([...features].some((feature) => RECON_CULTURAL_FEATURES.has(feature)) || [...hazards].some((hazard) => hazard === 'cultural_protocol')) {
    tags.add('cultural_hold');
    notes.push('cultural or archaeology indicators are active on the ground');
  }
  if ([...features].some((feature) => RECON_VISIBILITY_FEATURES.has(feature)) || [...hazards].some((hazard) => hazard === 'traffic' || hazard === 'visual_constraint')) {
    tags.add('community_visibility');
    notes.push('the block sits where community or recreation eyes will stay on it');
  }
  if ([...hazards].some((hazard) => RECON_ACCESS_HAZARDS.has(hazard))) {
    tags.add('access_rehab');
    notes.push('access rehab is likely to come back as a live issue');
  }
  if (normalizeReconToken(journey?.weather?.id) === 'storm') {
    tags.add('smoke_pressure');
    notes.push('the field window is unstable enough to distort clean coverage');
  }

  return {
    needed: notes.length > 0,
    notes,
    tags: [...tags]
  };
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
      label: 'Unverified',
      summary: 'Ground-truth the crossing, road condition, and approach before relying on this route.'
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
  const { ui, journey } = game;

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

async function acknowledgeActionResult(ui, label = 'Action') {
  await ui.promptChoice('', [{
    label: 'Acknowledge results and continue',
    description: `${label} is complete; return to the shift`,
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
      await handleEvent(game, interruptingEvent);
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

  if ((journey.resources.food || 0) <= FIELD_RESOURCES.food.warning) {
    displayDayHeader(ui, journey);
    await maybeHandleFoodDecision(game);
    ui.updateAllStatus(journey);
    updateReconMissionStatus(ui, journey);
    logReconAction(journey, 'Ration decision', `Food remaining: ${Math.round(journey.resources.food || 0)} person-days`);
    checkpointReconShift(game, shiftState, pendingEvent);
    await acknowledgeActionResult(ui, 'Ration decision');
  }

  // One job a shift. Free look-ups (map, briefing) leave the shift unspent,
  // so the loop comes back around to the real decision; the tally closes a
  // shift whose menu turns out to be nothing but look-ups.
  const freeChoices = { count: 0 };
  while (!dayIsSpent(journey)) {
    const currentBlock = journey.blocks[journey.currentBlockIndex];
    const openPackages = getReconOpenPackages(journey);
    const hasNextBlock = journey.currentBlockIndex < journey.blocks.length - 1;
    const canTravel = !hasTraveled && hasNextBlock && journey.resources.fuel > 0 && journey.resources.equipment > 0;
    const blockIntel = getReconBlockIntel(journey, currentBlock);
    const valuesSweep = getReconValueSweepProfile(currentBlock, journey);

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

    const blockWorkPending = currentBlock && !blockIntel.accessGroundTruthed
      ? 'access'
      : currentBlock && valuesSweep.needed && !blockIntel.valuesSwept
        ? 'values'
        : null;

    if (blockWorkPending === 'access') {
      options.push({
        label: 'Work the block',
        description: 'Access is unverified — drive the spur, walk the crossings, log what the road actually is',
        tag: 'SAFE',
        value: 'ground_truth'
      });
    } else if (blockWorkPending === 'values') {
      options.push({
        label: 'Work the block',
        description: `Values still to sweep — ${valuesSweep.notes[0]}`,
        tag: 'SAFE',
        value: 'values_sweep'
      });
    }

    if (canTravel) {
      const nextBlock = journey.blocks[journey.currentBlockIndex + 1];
      options.push({
        label: `Move on to ${nextBlock?.name || 'the next block'}`,
        description: `Cover ground at ${PACE_OPTIONS[getReconPace(journey)]?.name || 'Standard'} pace`,
        value: 'travel'
      });
    }

    const notebookTargets = getReconNotebookTargets(journey);
    if (notebookTargets.length > 0) {
      const nextPackage = notebookTargets[0];
      options.push({
        label: 'Catch up the notebook',
        description: `Close ${nextPackage.block.name} from notes and GPS marks — +2 scrutiny`,
        tag: 'RISKY',
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
      description: 'Stand down, work on the gear, patch someone up, send a scout ahead',
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
    const hasAnyInjured = journey.crew.some(m => m.isActive && (m.health < 85 || (m.statusEffects?.length || 0) > 0));
    if (hasAnyInjured && journey.resources.firstAid > 0) {
      campOptions.push({
        label: 'Patch up the crew',
        description: 'Treat whoever is carrying an injury',
        value: 'triage'
      });
    }
    if (journey.currentBlockIndex < journey.blocks.length - 1) {
      campOptions.push({
        label: 'Send someone ahead',
        description: 'Scout the next block before the crew commits to it',
        value: 'scout'
      });
    }
    if ((journey.resources.fuel || 0) >= 3 && (journey.resources.food || 0) <= FIELD_RESOURCES.food.warning) {
      campOptions.push({
        label: 'Go get the cache',
        description: 'Detour to a marked emergency cache; restores food, costs fuel',
        value: 'food_cache'
      });
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
      const camp = await ui.promptChoice('Camp & crew:', [
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
      await acknowledgeActionResult(ui, 'Travel');
    } else if (actionId === 'set_tempo') {
      await handleSetTempo(ui, journey);
    } else if (actionId === 'ground_truth') {
      spendDay(journey);
      handleGroundTruthAccess(ui, journey, currentBlock);
      logReconAction(journey, 'Ground-truthed access', currentBlock?.name || 'Current block');
    } else if (actionId === 'values_sweep') {
      spendDay(journey);
      handleValuesSweep(ui, journey, currentBlock);
      logReconAction(journey, 'Completed values sweep', currentBlock?.name || 'Current block');
    } else if (actionId === 'field_notebook') {
      spendDay(journey);
      handleFieldNotebook(ui, journey);
      logReconAction(journey, 'Updated field notebook');
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
    }

    ui.updateAllStatus(journey);
    updateReconMissionStatus(ui, journey);
    shiftState.hasTraveled = hasTraveled;
    shiftState.dayResolved = dayResolved;
    checkpointReconShift(game, shiftState, pendingEvent);

    const acknowledgedActions = {
      ground_truth: 'Ground-truth access',
      values_sweep: 'Values sweep',
      field_notebook: 'Field notebook',
      food_cache: 'Cached-ration retrieval',
      maintain: 'Maintenance',
      triage: 'Triage',
      resupply: 'Resupply',
      scout: 'Scouting'
    };
    if (acknowledgedActions[actionId]) {
      await acknowledgeActionResult(ui, acknowledgedActions[actionId]);
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

  // Milestones crossed by desk-side progress (notebook write-ups, package
  // verification) get their camp beat here rather than mid-travel.
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

  // Anyone lost today gets their marker before the day closes.
  await maybeMemorializeFallen(game);

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
 * Offer a marker for anyone who died today. The epitaph is the player's
 * to write — it will stand at this block for every future run.
 */
async function maybeMemorializeFallen(game) {
  const { ui, journey } = game;
  if (!journey.trailMarkerEpoch) journey.trailMarkerEpoch = Date.now();
  if (!journey.memorializedIds) journey.memorializedIds = [];

  for (const member of journey.crew) {
    if (!member.isDead || journey.memorializedIds.includes(member.id)) continue;
    journey.memorializedIds.push(member.id);

    const block = journey.blocks[journey.currentBlockIndex];
    const lastEffect = member.statusEffects?.[member.statusEffects.length - 1];
    const cause = lastEffect ? String(lastEffect.effectId).replace(/_/g, ' ') : 'the trail';

    ui.write('');
    ui.writeHeader(`+ ${member.name} +`);
    const choice = await ui.promptChoice('Mark the spot?', [
      { label: 'Carve a marker', description: 'Write a line for whoever passes this way next', value: 'carve' },
      { label: 'Let the bush take it quietly', description: 'No marker. The crew will remember.', value: 'skip' },
    ]);
    if (choice.value !== 'carve') {
      ui.write('The crew stands a moment, then shoulders their packs.');
      continue;
    }

    let epitaph = null;
    if (typeof ui.promptText === 'function') {
      epitaph = (await ui.promptText('Epitaph (one line):', 'They loved this country'))
        || 'They loved this country';
    }
    const marker = recordTrailMarker({
      name: member.name,
      epitaph: epitaph || 'They loved this country',
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
  const kinds = ['moose', 'deer'];
  if (block?.hazards?.some((h) => /grizzly|bear/.test(h))) kinds.push('bear', 'bear');
  if (block?.hazards?.some((h) => /moose|wildlife/.test(h))) kinds.push('moose');
  return kinds[Math.floor(Math.random() * kinds.length)];
}

/**
 * The river-crossing set piece: gauge readout, ford/scout/winch/wait
 * decision, animated resolution, consequences on the shared systems.
 * No-op for blocks without a crossing.
 */
async function runRiverCrossingBeat(game, block) {
  const { ui, journey } = game;
  let ctx = getCrossingContext(journey, block);
  if (!ctx) return;

  ui.write('');
  ui.writeHeader(`WATER CROSSING — ${block.name}`);

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
    if (ctx.scouted) {
      ui.write('You know the line now. The odds are better than they look.', 'term-dim');
    }

    const options = [
      { label: 'Ford it now', description: 'Take the channel as it stands', value: 'ford' },
    ];
    // The crossing is part of the shift that walked into it, so its choices
    // trade risk and gear rather than hours off a clock.
    if (!ctx.scouted) {
      options.push({
        label: 'Walk the line first',
        description: 'Probe the crossing on foot — halves the risk',
        value: 'scout',
      });
    }
    if (ctx.canWinch) {
      options.push({
        label: 'Rig a winch line (fuel & gear)',
        description: 'Slow and costly, but the water never gets a vote',
        value: 'winch',
      });
    }
    options.push({
      label: 'Camp and wait for the level to drop',
      description: 'Give up the rest of the shift; tomorrow is another river',
      value: 'wait',
    });

    const choice = await ui.promptChoice('The far bank is right there:', options);
    ui.write('');

    if (choice.value === 'scout') {
      const result = scoutCrossing(journey, ctx);
      for (const msg of result.messages) ui.write(msg);
      ui.write('');
      continue;
    }

    if (choice.value === 'wait') {
      spendDay(journey);
      journey.pendingCrossing = block.id;
      ui.write('The crew makes camp on the near bank and listens to the water all night.');
      break;
    }

    let result;
    if (choice.value === 'winch') {
      result = winchCrossing(journey, ctx);
    } else {
      result = fordCrossing(journey, ctx);
    }
    if (typeof ui.playScene === 'function') {
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
      summary: `${block.name}: ${ctx.gaugeLabel} water, ${choice.value}${result.mishap ? ' — mishap' : ''}`,
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
  const { ui, journey } = game;
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
  ui.writeHeader(`TRAIL CAMP — ${threshold}% OF THE JOB DONE`);
  if (typeof ui.playScene === 'function') {
    await ui.playScene(buildCampfireFrames({ frames: 14, seed: threshold + journey.day * 3 }), {
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
  const choice = await ui.promptChoice('The fire burns down:', [
    {
      label: 'Keep it lean',
      description: 'Bank the supplies; back at it at first light',
      value: 'lean',
    },
    canSplurge
      ? {
        label: 'Break out the good coffee (-3 food)',
        description: 'A morale night — the crew has earned it',
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
    ui.write('The crew turns in early. The trail will still be there tomorrow.');
  }
  ui.updateAllStatus(journey);
}

/** Refresh the mission pane without clearing the action result on screen. */
export function updateReconMissionStatus(ui, journey) {
  const currentBlock = journey.blocks?.[journey.currentBlockIndex];
  const progressInfo = getFieldProgressInfo(journey);
  const totalBlocks = progressInfo.totalBlocks || journey.blocks?.length || 0;
  const packagesDone = Math.min(totalBlocks, journey.blocksAssessed || 0);
  const completionPct = totalBlocks > 0 ? Math.round((packagesDone / totalBlocks) * 100) : 0;
  const packagesRemaining = Math.max(0, totalBlocks - packagesDone);
  const scrutiny = Math.round(Math.max(0, Number(journey.scrutiny ?? journey.heat ?? 0)));
  const facts = [
    { label: 'Weather', value: journey.weather?.name || 'Clear' },
    { label: 'Terrain', value: currentBlock?.terrain || 'unknown' },
    { label: 'Days left', value: Number.isFinite(journey.deadline) ? `${Math.max(0, journey.deadline - journey.day)}` : '—' },
    { label: 'Traverse', value: `${Math.round(journey.distanceTraveled)}/${journey.totalDistance} km` },
    { label: 'Reached', value: `${progressInfo.blocksCompleted + 1}/${progressInfo.totalBlocks}` },
    {
      label: 'Scrutiny',
      value: `${scrutiny}%`,
      tone: scrutiny > 60 ? 'danger' : scrutiny > 30 ? 'warn' : undefined
    }
  ];
  const checklist = [];

  if (currentBlock) {
    const intel = getReconBlockIntel(journey, currentBlock);
    const sweep = getReconValueSweepProfile(currentBlock, journey);
    const finalized = intel.accessGroundTruthed && (!sweep.needed || intel.valuesSwept);
    checklist.push({ label: 'access ground-truthed', done: intel.accessGroundTruthed });
    checklist.push({
      label: sweep.needed ? 'values sweep' : 'values sweep (not flagged)',
      done: sweep.needed ? intel.valuesSwept : true
    });
    checklist.push({ label: 'package finalized', done: finalized });
    facts.push({
      label: 'Intel',
      value: `access ${intel.accessGroundTruthed ? 'verified' : 'unverified'} · values ${sweep.needed ? (intel.valuesSwept ? 'swept' : 'pending') : 'quiet'}`
    });
  }

  const alerts = [];
  const currentAccessVerdict = getDisplayedAccessVerdict(journey, currentBlock);
  if (currentAccessVerdict.id === 'no_go' || currentAccessVerdict.id === 'heli_only') {
    alerts.push({ level: 'danger', text: formatAccessVerdict(currentAccessVerdict) });
  } else if (currentAccessVerdict.id !== 'passable_now') {
    alerts.push({ level: 'warn', text: formatAccessVerdict(currentAccessVerdict) });
  }
  if (journey.rationPlan?.mode === 'short') {
    alerts.push({
      level: 'warn',
      text: `Short rations (${journey.rationPlan.shortRationStreak} day${journey.rationPlan.shortRationStreak === 1 ? '' : 's'})`
    });
  }

  const status = {
    objective: packagesRemaining > 0
      ? `Finalize every block package — ${packagesRemaining} still open`
      : `Win condition met: all ${totalBlocks} block packages finalized`,
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

  // A crossing the crew broke behind them keeps costing. This is the standing
  // half of a bad band that would otherwise have been a one-day bill
  // (js/events/consequences.js).
  const condemned = getCondemnedCrossingPenalty(journey);
  if (condemned.fuel > 0 || condemned.equipment > 0) {
    journey.resources.fuel = Math.max(0, journey.resources.fuel - condemned.fuel);
    journey.resources.equipment = Math.max(0, journey.resources.equipment - condemned.equipment);
    ui.writeWarning(`${condemned.note} Fuel -${condemned.fuel}, equipment -${condemned.equipment}.`);
  }

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
  shiftState.hasTraveled = true;
  shiftState.dayResolved = true;

  // Reaching a water crossing is a played decision, not terrain math.
  if (journey.currentBlockIndex !== blockIndexBefore) {
    const arrivedBlock = journey.blocks[journey.currentBlockIndex];
    await runRiverCrossingBeat(game, arrivedBlock);
    if (game.gameOver) return { gameOver: true };
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
    rations.shortRationStreak = Number(rations.shortRationStreak || 0) + 1;
    ui.writeWarning('Short rations ordered.');
  } else if (rationChoice.value === 'normal' && rations.mode === 'short') {
    rations.mode = 'normal';
    rations.shortRationStreak = 0;
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
  const weather = normalizeReconToken(journey.weather?.id);
  if (weather === 'rain' || weather === 'drizzle') return 'A WET START';
  if (weather === 'snow' || weather === 'heavy_snow') return 'SNOW ON THE TRUCKS';
  if (weather === 'fog') return 'SOCKED IN';
  if (weather === 'heat' || weather === 'heat_dome') return 'ALREADY HOT AT SEVEN';
  if ((journey.resources.food || 0) <= FIELD_RESOURCES.food.warning) return 'THIN IN THE FOOD BOX';
  if (journey.crew.some((m) => m.isActive && m.health < 60)) return 'A SLOW MORNING IN CAMP';
  return 'NOTHING ON THE RADIO';
}

function buildQuietShiftBody(journey) {
  const currentBlock = journey.blocks[journey.currentBlockIndex];
  const openHere = currentBlock ? !getReconBlockIntel(journey, currentBlock).assessmentComplete : false;
  const daysLeft = Number.isFinite(journey.deadline) ? Math.max(0, journey.deadline - journey.day) : null;

  const parts = ['The radio stays quiet through breakfast. Whatever today is, it is yours to decide.'];
  if (openHere) {
    parts.push(`${currentBlock.name} is still open in the file.`);
  }
  if (daysLeft !== null && daysLeft <= 5) {
    parts.push(`The season closes in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`);
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
  const segments = [journey.weather?.name || 'Clear'];

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

  segments.push(`food ${Math.round(journey.resources.food || 0)}`);
  segments.push(`fuel ${Math.round(journey.resources.fuel || 0)}`);

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
  lines.push(`Packages: ${journey.blocksAssessed || 0}/${journey.blocks?.length || 0} finalized`);

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

function getRouteHazardSummary(currentBlock, nextBlock, weather) {
  const hazardSet = new Set(nextBlock?.hazards || []);
  const details = [];

  if (nextBlock?.terrain) {
    details.push(`${formatTerrainLabel(nextBlock.terrain)} terrain`);
  }
  if (hazardSet.size > 0) {
    details.push(`hazards: ${Array.from(hazardSet).slice(0, 2).join(', ')}`);
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

function buildRoutePlan(choiceId, journey, currentBlock, nextBlock) {
  const preset = ROUTE_PRESETS[choiceId] || ROUTE_PRESETS.mainline;
  const terrainLabel = formatTerrainLabel(nextBlock?.terrain || currentBlock?.terrain || 'unknown').toLowerCase();
  const hazardCount = (currentBlock?.hazards?.length || 0) + (nextBlock?.hazards?.length || 0);
  let note = 'You hold to the existing line and keep the crew on a steady tempo.';

  if (choiceId === 'detour') {
    note = `You swing wide around the roughest ${terrainLabel} and lose time, but the crew gets a cleaner line.`;
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
  const activeEffects = (member.statusEffects || []).map((effect) => effect.effectId);

  for (const effectId of TREATMENT_PRIORITY) {
    if (activeEffects.includes(effectId)) {
      return effectId;
    }
  }

  return activeEffects[0] || null;
}

async function maybeHandleFoodDecision(game) {
  const { ui, journey } = game;
  const rations = ensureRationPlan(journey);

  if (rations.lastDecisionDay === journey.day) {
    return;
  }

  if ((journey.resources.food || 0) > FIELD_RESOURCES.food.warning) {
    // Food came back. A standing order to stretch the meals has to lift by
    // itself once it no longer applies, or short rations become a one-way door
    // the player is never asked about again — which quietly starves a crew that
    // is actually well supplied.
    if (rations.mode === 'short') {
      rations.mode = 'normal';
      rations.shortRationStreak = 0;
      ui.write('Food stores are healthy again. The crew goes back on full rations.');
    }
    return;
  }

  // Rations are a carried standing order now (Set the tempo), so this forced
  // beat only needs to fire when the player has not already made the call.
  // A crew already on short rations does not need to be asked again every
  // single morning for the rest of the season — that was a dozen-plus prompts
  // and acknowledgements per run saying nothing new.
  if (rations.mode === 'short' && (journey.resources.food || 0) > FIELD_RESOURCES.food.critical) {
    return;
  }


  const foodLevel = journey.resources.food || 0;
  const prompt = foodLevel <= FIELD_RESOURCES.food.critical
    ? 'Food stores are critically low. Decide how to handle the crew\'s meals.'
    : 'Food stores are running thin. Decide how to handle rations today.';
  const options = [];

  // Setting the day's ration policy is a call, not a job. Actually going out
  // to the cache is a shift's work and lives on the shift menu instead.
  options.push(
    {
      label: 'Keep Full Rations',
      description: 'Normal food use; keeps the crew steadier if you can afford it',
      value: 'full'
    },
    {
      label: 'Short Rations and Push On',
      description: 'Use 65% portions today; the crew will feel it',
      value: 'short'
    }
  );

  const choice = await ui.promptChoice(prompt, options);
  rations.lastDecisionDay = journey.day;

  if (choice.value === 'short') {
    rations.mode = 'short';
    rations.shortRationStreak = Number(rations.shortRationStreak || 0) + 1;
    ui.writeWarning(`Short rations ordered. This makes ${rations.shortRationStreak} reduced-meal day${rations.shortRationStreak === 1 ? '' : 's'} in a row.`);
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
    const fuelLoss = Math.max(1, accessSeverity - 1 + pacePressure);
    journey.resources.equipment = Math.max(0, journey.resources.equipment - equipmentLoss);
    journey.resources.fuel = Math.max(0, journey.resources.fuel - fuelLoss);
    journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + accessSeverity);
    ui.writeWarning(`You moved without ground-truthing the access. ${accessVerdict.summary} Equipment -${equipmentLoss}, fuel -${fuelLoss}, scrutiny +${accessSeverity}.`);

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
  if (!blockIntel.valuesSwept && valuesSweep.needed) {
    const scrutinyGain = Math.min(3, Math.max(1, valuesSweep.tags.length));
    journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + scrutinyGain);
    ui.writeWarning(`You left ${valuesSweep.notes.slice(0, 2).join(' and ')} unverified. Scrutiny +${scrutinyGain}.`);
  }
}

function handleGroundTruthAccess(ui, journey, block) {
  if (!block) {
    ui.write('There is no active block to ground-truth.');
    return;
  }

  const verdict = recordAccessVerdict(
    journey,
    block,
    getBlockAccessVerdict(block, journey.weather, journey),
    journey.weather
  );
  const intel = getReconBlockIntel(journey, block);
  intel.accessGroundTruthed = true;
  intel.lastAccessDay = journey.day;

  addDiscoveryTags(journey, inferDiscoveryTagsFromAccess(block, verdict, journey.weather), {
    source: `ground-truth:${block.id}`,
    severity: verdict.id === 'no_go' ? 3 : verdict.id === 'heli_only' || verdict.id === 'winter_only' ? 2 : 1,
    note: verdict.summary,
    details: {
      blockId: block.id,
      verdict: verdict.id
    }
  });

  ui.writeHeader('GROUND-TRUTH ACCESS');
  if (verdict.id === 'passable_now') {
    ui.writePositive(formatAccessVerdict(verdict));
  } else if (verdict.id === 'no_go' || verdict.id === 'heli_only') {
    ui.writeDanger(formatAccessVerdict(verdict));
  } else {
    ui.writeWarning(formatAccessVerdict(verdict));
  }

  const infrastructureLine = formatInfrastructureStatus(verdict);
  if (infrastructureLine) {
    ui.write(infrastructureLine);
  }

  journey.scrutiny = Math.max(0, (journey.scrutiny || 0) - 1);
  ui.write('You log the access condition before the crew commits more distance.');
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

  ui.writeHeader('VALUES SWEEP');
  if (!sweep.needed) {
    ui.write('The block reads quiet. No new water, cultural, or visibility concerns stand out today.');
    journey.scrutiny = Math.max(0, (journey.scrutiny || 0) - 1);
    return;
  }

  addDiscoveryTags(journey, sweep.tags, {
    source: `values-sweep:${block.id}`,
    severity: 2,
    note: sweep.notes.join(' | '),
    details: {
      blockId: block.id,
      weather: journey.weather?.id || null
    }
  });

  for (const note of sweep.notes) {
    ui.write(note.charAt(0).toUpperCase() + note.slice(1) + '.');
  }
  ui.writePositive(`Logged: ${sweep.tags.join(', ')}`);
  journey.scrutiny = Math.max(0, (journey.scrutiny || 0) - Math.min(2, sweep.tags.length));
  maybeFinalizeReconAssessment(ui, journey, block);
}

// Notebook write-ups only work for ground the crew has actually reached: you
// can catch up paperwork from real notes, but you cannot paper-truth a block
// you never drove to. (Unrestricted, the notebook let a run "win" from camp at
// 48% of the traverse — it dominated actually travelling.)
function getReconNotebookTargets(journey) {
  const blocks = Array.isArray(journey?.blocks) ? journey.blocks : [];
  const currentIndex = Number(journey?.currentBlockIndex || 0);
  return getReconOpenPackages(journey).filter(({ block }) => {
    const index = blocks.indexOf(block);
    return index > -1 && index <= currentIndex;
  });
}

function handleFieldNotebook(ui, journey) {
  const target = getReconNotebookTargets(journey)[0];
  if (!target) {
    const remaining = getReconOpenPackages(journey).length;
    ui.write(remaining > 0
      ? 'No visited blocks left to write up — the remaining packages need you on the ground.'
      : 'No open recon packages remain in the notebook.');
    return;
  }

  if (!target.intel.accessGroundTruthed) {
    target.intel.accessGroundTruthed = true;
    target.intel.lastAccessDay = journey.day;
  }
  if (target.sweep.needed && !target.intel.valuesSwept) {
    target.intel.valuesSwept = true;
    target.intel.lastValuesDay = journey.day;
  }

  ui.write(`Notebook catch-up closes ${target.block.name}: ${target.missing.join(', ')}.`);
  maybeFinalizeReconAssessment(ui, journey, target.block);
  // Paper-heavy files draw attention: closing from notes costs more scrutiny
  // than doing the work on the ground.
  journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + 2);
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

  ui.writeHeader('SCOUT REPORT');
  ui.write(`Next: ${nextBlock.name}`);
  ui.write(`Terrain: ${nextBlock.terrain} | Distance: ${nextBlock.distance} km`);
  ui.write(`Description: ${nextBlock.description}`);

  if (nextBlock.hazards && nextBlock.hazards.length > 0) {
    ui.writeWarning(`Hazards: ${nextBlock.hazards.join(', ')}`);
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
        ui.writePositive(`Spotter reports supply point at ${supplyBlocks[0].name} (${supplyBlocks[0].distance} km ahead).`);
      } else {
        ui.write('Spotter sees no supply points in the next few blocks.');
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
  ui.write(`Cash on hand: $${Math.round(cash).toLocaleString()}`);

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

  const offers = [
    { id: 'fuel_drum', label: 'Fuel Drum', description: '+40 fuel', cost: priced(180), apply: () => { journey.resources.fuel = clampToMax('fuel', journey.resources.fuel + 40); } },
    { id: 'rations', label: 'Rations Crate', description: '+20 food', cost: priced(160), apply: () => { journey.resources.food = clampToMax('food', journey.resources.food + 20); } },
    { id: 'first_aid', label: 'First Aid Kit', description: '+1 kit', cost: priced(120), apply: () => { journey.resources.firstAid = clampToMax('firstAid', journey.resources.firstAid + 1); } },
    { id: 'field_repair', label: 'Field Repair', description: '+15% equipment', cost: priced(220), apply: () => { journey.resources.equipment = clampToMax('equipment', journey.resources.equipment + 15); } },
    {
      id: 'full_restock',
      label: 'Full Restock',
      description: '+50 fuel, +25 food, +20% equip, +2 kits',
      cost: priced(650),
      apply: () => {
        journey.resources.fuel = clampToMax('fuel', journey.resources.fuel + 50);
        journey.resources.food = clampToMax('food', journey.resources.food + 25);
        journey.resources.equipment = clampToMax('equipment', journey.resources.equipment + 20);
        journey.resources.firstAid = clampToMax('firstAid', journey.resources.firstAid + 2);
      }
    }
  ];

  while (true) {
    const money = journey.resources.budget || 0;
    const affordableOffers = offers.filter((offer) => money >= offer.cost);

    if (affordableOffers.length === 0) {
      ui.writeWarning('You cannot afford anything at this stop. Better keep moving.');
      break;
    }

    const options = [
      ...affordableOffers.map(o => ({
        label: `${o.label} ($${o.cost})`,
        description: o.description,
        value: o.id
      })),
      { label: 'Done', description: 'Finish shopping', value: 'done' }
    ];

    const choice = await ui.promptChoice(`Buy supplies (cash: $${Math.round(money).toLocaleString()}):`, options);
    if (choice.value === 'done') break;

    const offer = affordableOffers.find(o => o.id === choice.value);
    if (!offer) continue;

    journey.resources.budget = Math.max(0, money - offer.cost);
    offer.apply();
    ui.writePositive(`Purchased ${offer.label}.`);
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

  const candidates = journey.crew.filter(m => m.isActive && (m.health < 100 || (m.statusEffects?.length || 0) > 0));
  if (candidates.length === 0) {
    ui.write('Nobody needs treatment today.');
    return;
  }

  const options = candidates.map(m => {
    const info = getCrewDisplayInfo(m);
    const effect = info.effects?.[0]?.name ? `, ${info.effects[0].name}` : '';
    return {
      label: `${info.name} (${info.health}% HP${effect})`,
      description: info.role,
      value: m.id
    };
  });

  const choice = await ui.promptChoice('Treat who?', options);
  const target = journey.crew.find(m => m.id === choice.value);
  if (!target || !target.isActive) return;

  journey.resources.firstAid = Math.max(0, (journey.resources.firstAid || 0) - 1);

  if ((target.statusEffects?.length || 0) > 0) {
    const effectId = chooseTreatmentEffect(target);
    const treated = treatCrewCondition(target, effectId, journey.day);
    if (treated.message) ui.writePositive(treated.message);
    const healed = healCrewMember(target, treated.cleared ? 14 : 8);
    if (healed.message) ui.writePositive(healed.message);
    if (!treated.cleared) {
      ui.write('They are stabilized for now, but this will take another treatment day or a rest shift to finish.');
    }
  } else {
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
      description: '+25% equipment, costs $250',
      value: 'pro'
    }
  ];

  const choice = await ui.promptChoice('How do you handle maintenance?', options);

  if (choice.value === 'pro') {
    if (cash < 250) {
      ui.writeWarning('Not enough cash to hire a mechanic.');
      return;
    }
    journey.resources.budget = Math.max(0, cash - 250);
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

/** Recover a known emergency cache instead of treating wildlife as routine provisioning. */
function retrieveCachedRations(ui, journey) {
  const foodBefore = Number(journey.resources.food || 0);
  const fuelBefore = Number(journey.resources.fuel || 0);
  const foodRecovered = Math.min(12, Math.max(0, FIELD_RESOURCES.food.max - foodBefore));
  const fuelUsed = Math.min(3, fuelBefore);

  journey.resources.food = foodBefore + foodRecovered;
  journey.resources.fuel = Math.max(0, fuelBefore - fuelUsed);

  ui.write('');
  ui.writeHeader('RATION CACHE');
  ui.writePositive(`Recovered ${foodRecovered} person-days of sealed field rations.`);
  ui.write(`Fuel used reaching the cache: ${fuelUsed}. Food now ${Math.round(journey.resources.food)} person-days.`);
}






