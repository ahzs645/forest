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
import { executeFieldDay, getFieldProgressInfo, getSurveyedBlockCount } from '../journey.js';
import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
import { FIELD_RESOURCES } from '../resources.js';

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

/**
 * Run a recon day (enhanced field day with survey mechanics)
 * @param {Object} game - Game instance
 */
export async function runReconDay(game) {
  const { ui, journey } = game;

  // Run the field day mechanics
  await runFieldDay(game);

  // Track blocks assessed (recon-specific tracking)
  const surveyedBlocks = getSurveyedBlockCount(journey);
  if (surveyedBlocks > (journey.blocksAssessed || 0)) {
    journey.blocksAssessed = surveyedBlocks;
    ui.write(`Block assessment complete. Total blocks assessed: ${journey.blocksAssessed}`);
  }
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
    journey.hoursRemaining = 9;
  }

  let hasTraveled = false;

  // Check for random event at start of day
  const event = checkForEvent(journey);
  if (event) {
    displayDayHeader(ui, journey);
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  // Check for weather-forced camp day (Phase 3.3)
  const weatherForcesCamp = journey.weather &&
    (journey.weather.id === 'storm' || journey.weather.id === 'heavy_snow');

  if (weatherForcesCamp) {
    displayDayHeader(ui, journey);
    ui.writeDanger(`${journey.weather.name} has grounded all operations. The crew hunkers down.`);
    ui.write('');
    journey.hoursRemaining = 0;
    const result = executeFieldDay(journey, 'resting');
    for (const msg of result.messages) ui.write(msg);
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
    const canTravel = !hasTraveled && journey.resources.fuel > 0 && journey.resources.equipment > 0;

    if (canTravel && journey.currentBlockIndex < journey.blocks.length - 1 && journey.routePlan?.day !== journey.day) {
      displayDayHeader(ui, journey);
      await maybePromptRouteChoice(game, currentBlock);
    }

    displayDayHeader(ui, journey);

    // Build action options based on remaining hours and state
    const actionOptions = [];

    if (canTravel) {
      const routeSuffix = journey.routePlan ? ` via ${journey.routePlan.shortLabel}` : '';
      // Travel options (4-6 hours depending on pace)
      actionOptions.push({
        label: `Cautious Recon${routeSuffix} (4h)`,
        description: '60% coverage, low risk',
        value: 'slow'
      });
      if (journey.hoursRemaining >= 5) {
        actionOptions.push({
          label: `Standard Recon${routeSuffix} (5h)`,
          description: '100% coverage, normal risk',
          value: 'normal'
        });
      }
      if (journey.hoursRemaining >= 6) {
        actionOptions.push({
          label: `Extended Recon${routeSuffix} (6h)`,
          description: '140% coverage, higher risk',
          value: 'fast'
        });
      }
      if (journey.hoursRemaining >= 8) {
        actionOptions.push({
          label: `Max Effort${routeSuffix} (8h)`,
          description: '180% coverage, grueling',
          value: 'grueling'
        });
      }
    }

    // Camp actions (available anytime)
    if (journey.hoursRemaining >= 2) {
      actionOptions.push({
        label: 'Forage & Hunt (2h)',
        description: 'Search for food and salvage; moderate risk',
        value: 'forage'
      });
      actionOptions.push({
        label: 'Maintenance (2h)',
        description: 'Repair equipment',
        value: 'maintain'
      });
    }

    // Scouting (Phase 4.3)
    if (journey.hoursRemaining >= 2 && journey.currentBlockIndex < journey.blocks.length - 1) {
      actionOptions.push({
        label: 'Scout Ahead (2h)',
        description: 'Reveal next block conditions',
        value: 'scout'
      });
    }

    const hasAnyInjured = journey.crew.some(m => m.isActive && (m.health < 85 || (m.statusEffects?.length || 0) > 0));
    if (hasAnyInjured && journey.resources.firstAid > 0 && journey.hoursRemaining >= 1) {
      actionOptions.push({
        label: 'Triage (1h)',
        description: 'Treat an injured crew member',
        value: 'triage'
      });
    }

    if (currentBlock?.hasSupply && journey.hoursRemaining >= 2) {
      actionOptions.push({
        label: 'Resupply (2h)',
        description: 'Buy fuel, food, repairs, kits',
        value: 'resupply'
      });
    }

    actionOptions.push({
      label: 'Rest & End Shift',
      description: 'Recover health/morale, end the day',
      value: 'end_shift'
    });

    const action = await ui.promptChoice(`${journey.hoursRemaining}h remaining:`, actionOptions);
    const actionId = action.value || 'end_shift';

    ui.write('');

    // Process the chosen action
    if (actionId === 'end_shift') {
      // End the shift early with rest benefits
      const result = executeFieldDay(journey, 'resting');
      for (const msg of result.messages) ui.write(msg);
      journey.hoursRemaining = 0;
      break;
    }

    if (['slow', 'normal', 'fast', 'grueling'].includes(actionId)) {
      // Travel action — costs hours based on pace
      const hoursCost = { slow: 4, normal: 5, fast: 6, grueling: 8 };
      journey.hoursRemaining -= hoursCost[actionId];
      const result = executeFieldDay(journey, actionId);
      for (const msg of result.messages) ui.write(msg);
      hasTraveled = true;
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
    if (journey.hoursRemaining > 0) {
      await ui.promptChoice('', [{ label: 'Continue working...', value: 'next' }]);
    }
  }

  // End of day — if we haven't traveled, still advance the day
  if (!hasTraveled) {
    const result = executeFieldDay(journey, 'camp_work');
    for (const msg of result.messages) ui.write(msg);
  }

  ui.updateAllStatus(journey);

  // Contextual continue with next-day info (Phase 6.1)
  const nextBlock = journey.blocks[journey.currentBlockIndex];
  const continueLabel = nextBlock
    ? `Continue... (Next: ${nextBlock.name}, ${nextBlock.terrain})`
    : 'Continue...';
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
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

  // Compact progress line
  const progressBarWidth = 20;
  const filledWidth = Math.round((progressInfo.overallProgress / 100) * progressBarWidth);
  const progressBar = '\u2588'.repeat(filledWidth) + '\u2591'.repeat(progressBarWidth - filledWidth);
  ui.write(`[${progressBar}] ${progressInfo.overallProgress}% | ${Math.round(journey.distanceTraveled)}/${journey.totalDistance} km | Block ${progressInfo.blocksCompleted}/${progressInfo.totalBlocks}`);

  // Weather and terrain
  ui.write(`Weather: ${journey.weather?.name || 'Clear'} | Terrain: ${currentBlock?.terrain || 'unknown'} | Hours: ${journey.hoursRemaining || 0}h`);
  const routeText = journey.routePlan
    ? `${journey.routePlan.label}`
    : 'Route undecided';
  const rationText = journey.rationPlan?.mode === 'short'
    ? `Short rations (${journey.rationPlan.shortRationStreak} day${journey.rationPlan.shortRationStreak === 1 ? '' : 's'})`
    : 'Full rations';
  ui.write(`Route: ${routeText} | Rations: ${rationText}`);
  ui.write('');

  // Compact resources
  const r = journey.resources;
  ui.write(`FUEL: ${Math.round(r.fuel)} | FOOD: ${Math.round(r.food)} | EQUIP: ${Math.round(r.equipment)}% | MEDS: ${r.firstAid} | CASH: $${Math.round(r.budget).toLocaleString()}`);

  // Crew summary
  displayCrewStatus(ui, journey);

  // Crew dialogue (Phase 5.1)
  const activeCrew = journey.crew.filter(m => m.isActive);
  if (activeCrew.length > 0) {
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
 * Display crew status summary
 * @param {Object} ui - UI instance
 * @param {Object} journey - Journey state
 */
function displayCrewStatus(ui, journey) {
  const activeCrew = journey.crew.filter(m => m.isActive);
  const activeCount = activeCrew.length;
  const totalCount = journey.crew.length;
  const avgHealth = activeCount > 0
    ? Math.round(activeCrew.reduce((sum, m) => sum + m.health, 0) / activeCount)
    : 0;
  const injured = activeCrew.filter(m => m.statusEffects?.length > 0).length;

  ui.write(`Crew: ${activeCount}/${totalCount} active | Avg Health: ${avgHealth}%${injured > 0 ? ` | ${injured} injured` : ''}`);
  ui.write('(Press [S] for detailed crew status)');
  ui.write('');
}

/**
 * Handle an event - display and resolve player choice
 * @param {Object} game - Game instance
 * @param {Object} event - Event to handle
 */
async function handleEvent(game, event) {
  const { ui, journey } = game;
  const formatted = formatEventForDisplay(event, journey.journeyType);

  ui.write('');
  const headerLabel = event.reporter ? 'RADIO CHECK' : 'EVENT';
  ui.writeHeader(`${headerLabel}: ${formatted.title}`);
  ui.write(formatted.description);
  ui.write('');

  // Build options with effect previews
  const options = formatted.options.map((opt, index) => {
    const raw = event.options[index] || {};
    const requirement = raw.requiresRole ? `Requires ${formatRoleName(raw.requiresRole)}` : '';
    const pieces = [];
    if (opt.hint) pieces.push(opt.hint);
    if (requirement) pieces.push(requirement);
    return {
      label: opt.label,
      description: pieces.length ? `[${pieces.join(' | ')}]` : '',
      value: index
    };
  });

  let selectedOption = null;
  while (!selectedOption) {
    const choice = await ui.promptChoice('What do you do?', options);
    const optionIndex = typeof choice.value === 'number' ? choice.value : 0;
    const candidate = event.options[optionIndex];
    if (candidate?.requiresRole && !crewHasRole(journey.crew, candidate.requiresRole)) {
      ui.writeWarning(`You need a ${formatRoleName(candidate.requiresRole)} to do that.`);
      continue;
    }
    selectedOption = candidate;
  }

  // Resolve event
  const result = resolveEvent(journey, event, selectedOption);

  ui.write('');
  for (const msg of result.messages) {
    ui.write(msg);
  }

  // Check for game-ending events
  if (selectedOption.gameOver) {
    game.gameOver = true;
    journey.endReason = selectedOption.gameOverReason || 'Event outcome';
  }
}

/**
 * Format role name for display
 * @param {string} roleId - Role ID
 * @returns {string} Formatted role name
 */
function formatRoleName(roleId) {
  if (!roleId) return 'specialist';
  const formatted = roleId.replace(/[_-]+/g, ' ').trim();
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
