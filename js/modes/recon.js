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
import { renderJourneyMap } from '../scene/areaMap.js';
import {
  getCrossingContext,
  scoutCrossing,
  winchCrossing,
  fordCrossing
} from '../journey/riverCrossing.js';
import { getCurrentSegmentLength, getDistanceIntoCurrentSegment } from '../journey/blockNav.js';
import { buildCrossingApproachFrames, buildCrossingResolveFrames } from '../scene/crossing.js';
import { buildCampfireFrames } from '../scene/textmode/effects.js';
import { FIELD_RESOURCES } from '../resources.js';
import {
  addDiscoveryTags,
  getDiscoveryTagNotes,
  inferDiscoveryTagsFromAccess
} from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';

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

/**
 * Run a recon day (enhanced field day with survey mechanics)
 * @param {Object} game - Game instance
 */
export async function runReconDay(game) {
  const { ui, journey } = game;

  // Run the field day mechanics
  await runFieldDay(game);
}

/**
 * Run a field day with multi-action system
 * Players get 9 hours per shift, travel costs 4-6h, camp actions fill remaining time
 * @param {Object} game - Game instance
 */
async function runFieldDay(game) {
  const { ui, journey } = game;

  // Initialize hours for the day
  if (!journey.hoursRemaining || journey.hoursRemaining <= 0) {
    journey.hoursRemaining = journey.difficulty === 'easy'
      ? 10
      : journey.difficulty === 'hard'
        ? 8
        : 9;
  }

  let hasTraveled = false;
  // Tracks whether this shift's daily resolution (resource burn, crew updates,
  // hardships) has already run via executeFieldAction. The calendar itself only
  // rolls over once, at the very end of the shift, via endFieldDay().
  let dayResolved = false;

  // Roll the day's random event, but hold it: Oregon Trail's rhythm is that
  // trouble finds you ON the trail, so the event fires mid-travel (the strip
  // pauses for it). If the shift never travels, it lands on camp instead.
  // The first shift teaches the base loop — nothing fires on day 1.
  let pendingEvent = journey.day > 1 ? checkForEvent(journey) : null;

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
      await handleEvent(game, pendingEvent);
      pendingEvent = null;
      if (game.gameOver) return;
    }
    journey.hoursRemaining = 0;
    const result = executeFieldAction(journey, 'resting');
    for (const msg of result.messages) ui.write(msg);
    endFieldDay(journey);
    ui.updateAllStatus(journey);

    // Contextual continue (Phase 6.1)
    const nextBlock = journey.blocks[journey.currentBlockIndex];
    await ui.promptChoice('', [{
      label: `Continue... (Tomorrow: ${nextBlock?.name || 'Unknown'})`,
      value: 'next'
    }]);
    return;
  }

  if ((journey.resources.food || 0) <= FIELD_RESOURCES.food.warning) {
    displayDayHeader(ui, journey);
    await maybeHandleFoodDecision(game);
  }

  // Multi-action loop: keep going while hours remain
  while (journey.hoursRemaining > 0) {
    const currentBlock = journey.blocks[journey.currentBlockIndex];
    const openPackages = getReconOpenPackages(journey);
    const hasNextBlock = journey.currentBlockIndex < journey.blocks.length - 1;
    const canTravel = !hasTraveled && hasNextBlock && journey.resources.fuel > 0 && journey.resources.equipment > 0;
    const blockIntel = getReconBlockIntel(journey, currentBlock);
    const accessVerdict = currentBlock ? getBlockAccessVerdict(currentBlock, journey.weather, journey) : null;
    const valuesSweep = getReconValueSweepProfile(currentBlock, journey);

    if (canTravel && journey.currentBlockIndex < journey.blocks.length - 1 && journey.routePlan?.day !== journey.day) {
      displayDayHeader(ui, journey);
      await maybePromptRouteChoice(game, currentBlock);
    }

    displayDayHeader(ui, journey);

    // The shift menu is split so each turn reads as a decision, not an audit:
    //   primary  = the main work choices (travel / verify / notebook) + resupply
    //   support  = camp upkeep and orientation, one level down behind "Camp & Support"
    const primaryOptions = [];
    const supportOptions = [];

    if (canTravel) {
      const routeSuffix = journey.routePlan ? ` via ${journey.routePlan.shortLabel}` : '';
      // Travel options (4-6 hours depending on pace)
      primaryOptions.push({
        label: `Cautious Recon${routeSuffix} (4h)`,
        description: '60% coverage, low risk',
        value: 'slow'
      });
      if (journey.hoursRemaining >= 5) {
        primaryOptions.push({
          label: `Standard Recon${routeSuffix} (5h)`,
          description: '100% coverage, normal risk',
          value: 'normal'
        });
      }
      if (journey.hoursRemaining >= 6) {
        primaryOptions.push({
          label: `Extended Recon${routeSuffix} (6h)`,
          description: '140% coverage, higher risk',
          value: 'fast'
        });
      }
      if (journey.hoursRemaining >= 8) {
        primaryOptions.push({
          label: `Max Effort${routeSuffix} (8h)`,
          description: '180% coverage, grueling',
          value: 'grueling'
        });
      }
    }

    if (currentBlock && !blockIntel.accessGroundTruthed && journey.hoursRemaining >= 2) {
      primaryOptions.push({
        label: 'Ground-Truth Access (2h)',
        description: `Verify crossings, road condition, and approach risk before moving on (${accessVerdict?.label || 'current access check'})`,
        value: 'ground_truth'
      });
    }

    if (currentBlock && valuesSweep.needed && !blockIntel.valuesSwept && journey.hoursRemaining >= 2) {
      primaryOptions.push({
        label: 'Values Sweep (2h)',
        description: `Ground-check riparian, cultural, wildlife, and visibility notes (${valuesSweep.notes[0]})`,
        value: 'values_sweep'
      });
    }

    const notebookTargets = getReconNotebookTargets(journey);
    if (notebookTargets.length > 0 && journey.hoursRemaining >= 2) {
      const nextPackage = notebookTargets[0];
      primaryOptions.push({
        label: 'Field Notebook (2h)',
        description: `Write up a visited block from notes and GPS marks (${nextPackage.block.name}: ${nextPackage.missing.join(', ')}) — paper-truthing draws scrutiny`,
        value: 'field_notebook'
      });
    }

    if (currentBlock?.hasSupply && journey.hoursRemaining >= 2) {
      primaryOptions.push({
        label: 'Resupply (2h)',
        description: 'Buy fuel, food, repairs, kits',
        value: 'resupply'
      });
    }

    // Camp actions (available anytime), one level down to keep the turn clean.
    if (journey.hoursRemaining >= 2) {
      supportOptions.push({
        label: 'Forage & Hunt (2h)',
        description: 'Search for food and salvage; moderate risk',
        value: 'forage'
      });
      supportOptions.push({
        label: 'Maintenance (2h)',
        description: 'Repair equipment',
        value: 'maintain'
      });
    }

    // Scouting (Phase 4.3)
    if (journey.hoursRemaining >= 2 && journey.currentBlockIndex < journey.blocks.length - 1) {
      supportOptions.push({
        label: 'Scout Ahead (2h)',
        description: 'Reveal next block conditions',
        value: 'scout'
      });
    }

    const hasAnyInjured = journey.crew.some(m => m.isActive && (m.health < 85 || (m.statusEffects?.length || 0) > 0));
    if (hasAnyInjured && journey.resources.firstAid > 0 && journey.hoursRemaining >= 1) {
      supportOptions.push({
        label: 'Triage (1h)',
        description: 'Treat an injured crew member',
        value: 'triage'
      });
    }

    // Orientation is always free
    supportOptions.push({
      label: 'Consult the Area Map',
      description: 'Plot the traverse, camps, and remaining blocks',
      value: 'consult_map'
    });
    supportOptions.push({
      label: 'Review the Briefing',
      description: 'Access intel, area situation, and carry-forward notes',
      value: 'briefing'
    });

    if (supportOptions.length > 0) {
      primaryOptions.push({
        label: 'Camp & Support ▸',
        description: 'Forage, repairs, triage, scouting, map and briefing',
        value: 'support_menu'
      });
    }

    primaryOptions.push({
      label: 'Rest & End Shift',
      description: 'Recover health/morale, end the day',
      value: 'end_shift'
    });

    // Resolve the menu, drilling into the support submenu when chosen.
    let actionId = 'end_shift';
    while (true) {
      const action = await ui.promptChoice(`${journey.hoursRemaining}h remaining:`, primaryOptions);
      const chosen = action.value || 'end_shift';
      if (chosen === 'support_menu') {
        const sub = await ui.promptChoice('Camp & support:', [
          ...supportOptions,
          { label: 'Back', description: 'Return to the main shift menu', value: 'support_back' }
        ]);
        const subChoice = sub.value || 'support_back';
        if (subChoice === 'support_back') {
          displayDayHeader(ui, journey);
          continue;
        }
        actionId = subChoice;
        break;
      }
      actionId = chosen;
      break;
    }

    ui.write('');

    // Process the chosen action
    if (actionId === 'end_shift') {
      // End the shift early with rest benefits. This resolves the day, so the
      // end-of-shift camp_work pass below must not fire a second time. The
      // calendar advances once, after the loop, via endFieldDay().
      const result = executeFieldAction(journey, 'resting');
      dayResolved = true;
      for (const msg of result.messages) ui.write(msg);
      journey.hoursRemaining = 0;
      break;
    }

    if (['slow', 'normal', 'fast', 'grueling'].includes(actionId)) {
      applyReconTravelIntelPenalty(ui, journey, currentBlock, actionId);
      // Travel action — costs hours based on pace
      const hoursCost = { slow: 4, normal: 5, fast: 6, grueling: 8 };
      journey.hoursRemaining -= hoursCost[actionId];
      const progressBefore = journey.totalDistance > 0
        ? journey.distanceTraveled / journey.totalDistance
        : 0;
      const blockIndexBefore = journey.currentBlockIndex;
      const result = executeFieldAction(journey, actionId);
      dayResolved = true;

      const progressAfter = journey.totalDistance > 0
        ? journey.distanceTraveled / journey.totalDistance
        : progressBefore;
      const stripCtx = {
        weatherId: journey.weather?.id,
        terrain: currentBlock?.terrain,
        pace: actionId,
        wildlife: pickTrailWildlife(journey, actionId),
        seed: journey.day * 31 + journey.currentBlockIndex,
      };

      if (typeof ui.playTravelStrip === 'function') {
        if (pendingEvent) {
          // The day's event interrupts the traverse: the strip runs partway,
          // trouble happens, and the crew moves on.
          const midProgress = progressBefore + (progressAfter - progressBefore) * 0.45;
          await ui.playTravelStrip({
            ...stripCtx,
            progressBefore,
            progressAfter: midProgress,
            frameCount: 8,
          });
          const interruptingEvent = pendingEvent;
          pendingEvent = null;
          await handleEvent(game, interruptingEvent);
          if (game.gameOver) return;
          await ui.playTravelStrip({
            ...stripCtx,
            progressBefore: midProgress,
            progressAfter,
            frameCount: 8,
          });
        } else {
          await ui.playTravelStrip({ ...stripCtx, progressBefore, progressAfter });
        }
      } else if (pendingEvent) {
        const interruptingEvent = pendingEvent;
        pendingEvent = null;
        await handleEvent(game, interruptingEvent);
        if (game.gameOver) return;
      }
      for (const msg of result.messages) ui.write(msg);
      hasTraveled = true;

      // Reaching a water crossing is a played decision, not terrain math.
      if (journey.currentBlockIndex !== blockIndexBefore) {
        const arrivedBlock = journey.blocks[journey.currentBlockIndex];
        await runRiverCrossingBeat(game, arrivedBlock);
        if (game.gameOver) return;
      }

      // A crossed progress milestone earns the crew a fire and a breather.
      await celebrateNewMilestones(game);
      // The next header wipes the screen, so instead of pausing on a bare
      // Continue every travel beat (two Continues per shift added up), the
      // results are carried into the next screen as a recap block.
      if (journey.hoursRemaining > 0) {
        journey.lastActionRecap = result.messages.slice(0, 6);
      }
    } else if (actionId === 'consult_map') {
      handleConsultMap(ui, journey);
      await ui.promptChoice('', [{ label: 'Fold the map', value: 'next' }]);
    } else if (actionId === 'briefing') {
      displayReconBriefing(ui, journey);
      await ui.promptChoice('', [{ label: 'Back to work', value: 'next' }]);
    } else if (actionId === 'ground_truth') {
      journey.hoursRemaining -= 2;
      handleGroundTruthAccess(ui, journey, currentBlock);
    } else if (actionId === 'values_sweep') {
      journey.hoursRemaining -= 2;
      handleValuesSweep(ui, journey, currentBlock);
    } else if (actionId === 'field_notebook') {
      journey.hoursRemaining -= 2;
      handleFieldNotebook(ui, journey);
    } else if (actionId === 'forage') {
      journey.hoursRemaining -= 2;
      applyForageResults(ui, journey, 'forage');
    } else if (actionId === 'maintain') {
      journey.hoursRemaining -= 2;
      await handleMaintenance(game);
    } else if (actionId === 'triage') {
      journey.hoursRemaining -= 1;
      await handleTriage(game);
    } else if (actionId === 'resupply') {
      journey.hoursRemaining -= 2;
      await handleResupply(game, currentBlock);
    } else if (actionId === 'scout') {
      journey.hoursRemaining -= 2;
      handleScoutAhead(ui, journey);
    }

    ui.updateAllStatus(journey);

    // If there are still hours, prompt between actions
  }

  // A held event that never met the trail finds the crew in camp instead.
  if (pendingEvent) {
    ui.write('');
    ui.write('Trouble finds camp anyway.');
    await handleEvent(game, pendingEvent);
    pendingEvent = null;
    if (game.gameOver) return;
  }

  // End of shift — if no action resolved the day yet (no travel, no rest), run
  // a camp_work pass so the day's resource/crew effects apply exactly once.
  if (!dayResolved) {
    const result = executeFieldAction(journey, 'camp_work');
    for (const msg of result.messages) ui.write(msg);
  }

  // Milestones crossed by desk-side progress (notebook write-ups, package
  // verification) get their camp beat here rather than mid-travel.
  await celebrateNewMilestones(game);

  // Advance the calendar exactly once, now that the shift is genuinely over.
  endFieldDay(journey);

  ui.updateAllStatus(journey);

  // Contextual continue with next-day info (Phase 6.1)
  const nextBlock = journey.blocks[journey.currentBlockIndex];
  const continueLabel = nextBlock
    ? `Continue... (Next: ${nextBlock.name}, ${nextBlock.terrain})`
    : 'Continue...';
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
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
    if (!ctx.scouted && journey.hoursRemaining >= 2) {
      options.push({
        label: 'Walk the line first (2h)',
        description: 'Probe the crossing on foot — halves the risk',
        value: 'scout',
      });
    }
    if (ctx.canWinch && journey.hoursRemaining >= 3) {
      options.push({
        label: 'Rig a winch line (3h, fuel & gear)',
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
      journey.hoursRemaining = Math.max(0, journey.hoursRemaining - 2);
      const result = scoutCrossing(journey, ctx);
      for (const msg of result.messages) ui.write(msg);
      ui.write('');
      continue;
    }

    if (choice.value === 'wait') {
      journey.hoursRemaining = 0;
      journey.pendingCrossing = block.id;
      ui.write('The crew makes camp on the near bank and listens to the water all night.');
      break;
    }

    let result;
    if (choice.value === 'winch') {
      journey.hoursRemaining = Math.max(0, journey.hoursRemaining - 3);
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

/**
 * Display compact day header with status (Phase 6.2)
 */
function displayDayHeader(ui, journey) {
  const currentBlock = journey.blocks[journey.currentBlockIndex];
  const progressInfo = getFieldProgressInfo(journey);

  ui.clear();
  ui.writeHeader(`SHIFT ${journey.day} - ${currentBlock?.name || 'Unknown Territory'}`);

  // ASCII block map (Phase 5.4)
  ui.write(buildBlockMap(journey));

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

  // The status picture renders in the mission dashboard pane, not as prose.
  // Recon is won by closing every block package, so the headline meter tracks
  // Package Completion with this block's checklist underneath; resources and
  // crew live in their own panes already.
  const totalBlocks = progressInfo.totalBlocks || journey.blocks?.length || 0;
  const packagesDone = Math.min(totalBlocks, journey.blocksAssessed || 0);
  const completionPct = totalBlocks > 0 ? Math.round((packagesDone / totalBlocks) * 100) : 0;
  const packagesRemaining = Math.max(0, totalBlocks - packagesDone);

  const facts = [
    { label: 'Weather', value: journey.weather?.name || 'Clear' },
    { label: 'Terrain', value: currentBlock?.terrain || 'unknown' },
    { label: 'Hours left', value: `${journey.hoursRemaining || 0}h` },
    { label: 'Traverse', value: `${Math.round(journey.distanceTraveled)}/${journey.totalDistance} km` },
    { label: 'Block', value: `${progressInfo.blocksCompleted}/${progressInfo.totalBlocks}` }
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
      value: `access ${intel.accessGroundTruthed ? 'verified' : 'unverified'} \u00b7 values ${sweep.needed ? (intel.valuesSwept ? 'swept' : 'pending') : 'quiet'}`
    });
  }

  const alerts = [];
  const currentAccessVerdict = getBlockAccessVerdict(currentBlock, journey.weather, journey);
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

  ui.setMissionStatus?.({
    objective: packagesRemaining > 0
      ? `Finalize every block package \u2014 ${packagesRemaining} still open`
      : `Win condition met: all ${totalBlocks} block packages finalized`,
    meter: { label: 'Packages', value: completionPct, text: `${packagesDone}/${totalBlocks}` },
    facts,
    checklist,
    alerts
  });

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
 * The long-form picture, on demand: intel, situation, plans, carry-forward
 */
function displayReconBriefing(ui, journey) {
  const currentBlock = journey.blocks[journey.currentBlockIndex];

  ui.write('');
  ui.writeHeader('FIELD BRIEFING');

  const currentAccessVerdict = getBlockAccessVerdict(currentBlock, journey.weather, journey);
  ui.write(formatAccessVerdict(currentAccessVerdict));
  const currentInfrastructureLine = formatInfrastructureStatus(currentAccessVerdict);
  if (currentInfrastructureLine) {
    ui.write(currentInfrastructureLine);
  }

  const routeText = journey.routePlan ? `${journey.routePlan.label}` : 'Route undecided';
  const rationText = journey.rationPlan?.mode === 'short'
    ? `Short rations (${journey.rationPlan.shortRationStreak} day${journey.rationPlan.shortRationStreak === 1 ? '' : 's'})`
    : 'Full rations';
  ui.write(`Route: ${routeText} | Rations: ${rationText}`);

  const blockIntel = getReconBlockIntel(journey, currentBlock);
  const valuesSweep = getReconValueSweepProfile(currentBlock, journey);
  const accessIntelLabel = blockIntel.accessGroundTruthed ? 'ground-truthed' : 'unverified';
  const valuesIntelLabel = valuesSweep.needed
    ? (blockIntel.valuesSwept ? 'swept' : 'pending')
    : 'quiet';
  ui.write(`Current Intel: access ${accessIntelLabel} | values ${valuesIntelLabel}`);
  ui.write(`Assessment: ${journey.blocksAssessed || 0}/${journey.blocks?.length || 0} blocks verified`);

  const openPackages = getReconOpenPackages(journey);
  if (openPackages.length > 0) {
    const nextPackage = openPackages[0];
    ui.write(`Field Notebook: ${nextPackage.block.name} needs ${nextPackage.missing.join(' + ')}`);
  }

  const scrutinyValue = Number(journey.scrutiny ?? journey.heat ?? 0);
  if (Number.isFinite(scrutinyValue)) {
    ui.write(`Scrutiny / Heat: ${Math.max(0, scrutinyValue)}`);
  }
  const areaSituation = getAreaSituationSummary(journey);
  if (areaSituation) {
    ui.write(`Area Situation: ${areaSituation}`);
  }
  const discoveryNotes = getDiscoveryTagNotes(journey, journey.roleId || 'recce', 2);
  if (discoveryNotes.length > 0) {
    ui.write(`Carry-forward: ${discoveryNotes.join(' | ')}`);
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
  const hazardSet = new Set([
    ...(currentBlock?.hazards || []),
    ...(nextBlock?.hazards || [])
  ]);
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
    return;
  }

  const foodLevel = journey.resources.food || 0;
  const prompt = foodLevel <= FIELD_RESOURCES.food.critical
    ? 'Food stores are critically low. Decide how to handle the crew\'s meals.'
    : 'Food stores are running thin. Decide how to handle rations today.';
  const options = [];

  if ((journey.hoursRemaining || 0) >= 2) {
    options.push({
      label: 'Hunt & Forage Before Moving (2h)',
      description: 'Best chance to restock food, but it can cost time, blood, or clean meat',
      value: 'hunt'
    });
  }

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

  if (choice.value === 'hunt') {
    rations.mode = 'normal';
    rations.shortRationStreak = 0;
    journey.hoursRemaining = Math.max(0, (journey.hoursRemaining || 0) - 2);
    ui.write('You burn the first part of the shift trying to fill the food bins before pushing deeper.');
    applyForageResults(ui, journey, 'hunt');
    ui.write('');
    return;
  }

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
  ui.write('');

  const clampToMax = (resourceId, value) => {
    const def = FIELD_RESOURCES[resourceId];
    if (!def) return value;
    return Math.max(0, Math.min(def.max ?? value, value));
  };

  const offers = [
    { id: 'fuel_drum', label: 'Fuel Drum', description: '+40 fuel', cost: 180, apply: () => { journey.resources.fuel = clampToMax('fuel', journey.resources.fuel + 40); } },
    { id: 'rations', label: 'Rations Crate', description: '+20 food', cost: 160, apply: () => { journey.resources.food = clampToMax('food', journey.resources.food + 20); } },
    { id: 'first_aid', label: 'First Aid Kit', description: '+1 kit', cost: 120, apply: () => { journey.resources.firstAid = clampToMax('firstAid', journey.resources.firstAid + 1); } },
    { id: 'field_repair', label: 'Field Repair', description: '+15% equipment', cost: 220, apply: () => { journey.resources.equipment = clampToMax('equipment', journey.resources.equipment + 15); } },
    {
      id: 'full_restock',
      label: 'Full Restock',
      description: '+50 fuel, +25 food, +20% equip, +2 kits',
      cost: 650,
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

/**
 * Apply forage results - finding supplies in the field
 * @param {Object} ui - UI instance
 * @param {Object} journey - Journey state
 * @param {string} strategy - 'forage' or 'hunt'
 */
function applyForageResults(ui, journey, strategy = 'forage') {
  const active = journey.crew.filter(m => m.isActive).length || 1;
  const isHunt = strategy === 'hunt';
  const spotterBonus = crewHasRole(journey.crew, 'spotter') ? 1.1 : 1;
  const foodBase = isHunt ? 10 : 6;
  const foodVariance = isHunt ? 12 : 10;
  const foodFound = Math.round((foodBase + Math.random() * foodVariance) * (active / 5) * spotterBonus);
  const fuelFound = !isHunt && Math.random() < 0.25 ? Math.round(5 + Math.random() * 10) : 0;
  const cashFound = !isHunt && Math.random() < 0.15 ? Math.round(120 + Math.random() * 480) : 0;

  journey.resources.food = Math.min(FIELD_RESOURCES.food.max, journey.resources.food + foodFound);
  if (fuelFound > 0) {
    journey.resources.fuel = Math.min(FIELD_RESOURCES.fuel.max, journey.resources.fuel + fuelFound);
  }
  if (cashFound > 0) {
    journey.resources.budget = Math.min(FIELD_RESOURCES.budget.max, journey.resources.budget + cashFound);
  }

  ui.write('');
  ui.writeHeader(isHunt ? 'HUNT RESULTS' : 'FORAGE RESULTS');
  ui.writePositive(`Found food: +${foodFound} rations`);
  if (fuelFound > 0) ui.writePositive(`Recovered fuel: +${fuelFound} gallons`);
  if (cashFound > 0) ui.writePositive(`Sold salvage: +$${cashFound.toLocaleString()}`);
  if (isHunt) {
    ui.write('The crew spends extra time tracking sign, dressing game, and packing meat back to camp.');
  }

  const complicationRoll = Math.random();
  const injuryChance = isHunt ? 0.18 : 0.12;
  const illnessChance = isHunt ? 0.10 : 0.05;
  if (complicationRoll < injuryChance) {
    const activeCrew = journey.crew.filter(m => m.isActive);
    const victim = activeCrew.length ? activeCrew[Math.floor(Math.random() * activeCrew.length)] : null;
    if (victim) {
      const injury = applyRandomInjury(victim, isHunt ? 'moderate' : 'minor');
      ui.writeWarning(`${isHunt ? 'Hunting' : 'Foraging'} accident! ${injury.message}`);
    }
  } else if (complicationRoll < injuryChance + illnessChance) {
    const activeCrew = journey.crew.filter(m => m.isActive);
    const victim = activeCrew.length ? activeCrew[Math.floor(Math.random() * activeCrew.length)] : null;
    if (victim) {
      const illnessId = isHunt && Math.random() < 0.5 ? 'food_poisoning' : 'dysentery';
      const illness = applyStatusEffect(victim, illnessId);
      ui.writeWarning(`Bad field prep catches up with the crew. ${illness.message}`);
    }
  }
}






/**
 * Render the Braille area map of the traverse
 * @param {Object} ui - TerminalUI instance
 * @param {Object} journey - Journey state
 */
function handleConsultMap(ui, journey) {
  const frame = renderJourneyMap(journey);
  if (!frame) {
    ui.write('The map tube is empty. Someone left the area map at the office.');
    return;
  }
  ui.write('');
  ui.writeHeader('AREA MAP');
  ui.writeBox(frame);
  ui.write('You trace the route with a finger and feel better about where you stand.', 'term-dim');
}
