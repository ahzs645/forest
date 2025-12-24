/**
 * Recon Mode Runner
 * Field-based reconnaissance operations with crew mechanics
 */

import { getCrewDisplayInfo, healCrewMember, removeStatusEffect, applyRandomInjury, crewHasRole } from '../crew.js';
import { executeFieldDay, PACE_OPTIONS, getFieldProgressInfo } from '../journey.js';
import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
import { getFormattedResourceStatus, FIELD_RESOURCES } from '../resources.js';

/**
 * Run a recon day (enhanced field day with survey mechanics)
 * @param {Object} game - Game instance
 */
export async function runReconDay(game) {
  const { ui, journey } = game;

  // Run the field day mechanics
  await runFieldDay(game);

  // Track blocks assessed (recon-specific tracking)
  if (journey.currentBlockIndex > (journey.blocksAssessed || 0)) {
    journey.blocksAssessed = journey.currentBlockIndex;
    ui.write(`Block assessment complete. Total blocks assessed: ${journey.blocksAssessed}`);
  }
}

/**
 * Run a field day with travel, events, and actions
 * @param {Object} game - Game instance
 */
async function runFieldDay(game) {
  const { ui, journey } = game;
  const currentBlock = journey.blocks[journey.currentBlockIndex];
  const progressInfo = getFieldProgressInfo(journey);

  ui.clear();
  ui.writeHeader(`SHIFT ${journey.day} - ${currentBlock?.name || 'Unknown Territory'}`);

  // Show current status with visual progress bar
  const progressBarWidth = 20;
  const filledWidth = Math.round((progressInfo.overallProgress / 100) * progressBarWidth);
  const progressBar = '█'.repeat(filledWidth) + '░'.repeat(progressBarWidth - filledWidth);

  ui.write(`Journey: [${progressBar}] ${progressInfo.overallProgress}%`);
  ui.write(`Traverse: ${journey.distanceTraveled}/${journey.totalDistance} km`);
  ui.write(`Blocks: ${progressInfo.blocksCompleted}/${progressInfo.totalBlocks} surveyed`);
  if (progressInfo.nextBlock !== 'Destination') {
    ui.write(`Next block: ${progressInfo.nextBlock} (${progressInfo.distanceToNextBlock} km of traverse)`);
  } else {
    ui.write(`Final destination ahead!`);
  }
  ui.write('');
  ui.write(`Weather: ${journey.weather?.name || 'Clear'} | Terrain: ${currentBlock?.terrain || 'unknown'}`);
  ui.write('');

  // Show resources
  ui.writeDivider('SUPPLIES');
  const resourceStatus = getFormattedResourceStatus(journey.resources, FIELD_RESOURCES);
  for (const [, status] of Object.entries(resourceStatus)) {
    const icon = status.level === 'critical' ? '!!' : status.level === 'low' ? '!' : ' ';
    ui.write(`${icon} ${status.label}: ${status.display}`);
  }
  ui.write('');

  // Show crew status
  displayCrewStatus(ui, journey);

  // Check for random event
  const event = checkForEvent(journey);
  if (event) {
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  // Daily action choice
  ui.writeDivider('WHAT DO YOU DO?');

  const actionOptions = [];

  const canTravel = journey.resources.fuel > 0 && journey.resources.equipment > 0;

  if (canTravel) {
    // Shift pacing options
    for (const [id, pace] of Object.entries(PACE_OPTIONS)) {
      if (id === 'resting' || id === 'camp_work') continue;
      actionOptions.push({
        label: `${pace.name} shift`,
        description: `${Math.round(pace.distanceMultiplier * 100)}% coverage`,
        value: id
      });
    }
  } else {
    ui.writeWarning('Field coverage is impossible without fuel and functioning equipment.');
  }

  // Camp actions
  actionOptions.push({
    label: 'Make Camp (Rest)',
    description: 'Recover health and morale',
    value: 'resting'
  });
  actionOptions.push({
    label: 'Forage & Scout (Camp Work)',
    description: 'Try to find supplies; small injury risk',
    value: 'forage'
  });
  actionOptions.push({
    label: 'Maintenance Shift (Camp Work)',
    description: 'Improve equipment condition; costs cash or sweat',
    value: 'maintain'
  });

  const hasAnyInjured = journey.crew.some(m => m.isActive && (m.health < 85 || (m.statusEffects?.length || 0) > 0));
  if (hasAnyInjured && journey.resources.firstAid > 0) {
    actionOptions.push({
      label: 'Triage (Camp Work)',
      description: 'Use a first aid kit to treat someone',
      value: 'triage'
    });
  }

  if (currentBlock?.hasSupply) {
    actionOptions.push({
      label: 'Trading Post / Resupply (Camp Work)',
      description: 'Buy fuel, rations, repairs, and kits',
      value: 'resupply'
    });
  }

  const action = await ui.promptChoice('Choose your action:', actionOptions);
  const actionId = action.value || 'normal';

  ui.write('');

  // Execute the day (field updates, consumption, weather/day advancement all live in executeFieldDay)
  if (actionId === 'resupply') {
    await handleResupply(game, currentBlock);
    const result = executeFieldDay(journey, 'camp_work');
    for (const msg of result.messages) ui.write(msg);
  } else if (actionId === 'triage') {
    await handleTriage(game);
    const result = executeFieldDay(journey, 'camp_work');
    for (const msg of result.messages) ui.write(msg);
  } else if (actionId === 'maintain') {
    await handleMaintenance(game);
    const result = executeFieldDay(journey, 'camp_work');
    for (const msg of result.messages) ui.write(msg);
  } else if (actionId === 'forage') {
    const result = executeFieldDay(journey, 'camp_work');
    for (const msg of result.messages) ui.write(msg);
    applyForageResults(ui, journey);
  } else {
    const paceId = actionId;
    const result = executeFieldDay(journey, paceId);
    for (const msg of result.messages) ui.write(msg);
  }

  // Update status panels to reflect changes
  ui.updateAllStatus(journey);

  // Small pause
  await ui.promptChoice('', [{ label: 'Continue...', value: 'next' }]);
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
    const options = [
      ...offers.map(o => ({
        label: `${o.label} ($${o.cost})`,
        description: o.description,
        value: o.id
      })),
      { label: 'Done', description: 'Finish shopping', value: 'done' }
    ];

    const choice = await ui.promptChoice(`Buy supplies (cash: $${Math.round(money).toLocaleString()}):`, options);
    if (choice.value === 'done') break;

    const offer = offers.find(o => o.id === choice.value);
    if (!offer) continue;

    if (money < offer.cost) {
      ui.writeWarning('Not enough cash for that.');
      continue;
    }

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
    const effectId = target.statusEffects[0].effectId;
    const removed = removeStatusEffect(target, effectId);
    if (removed.message) ui.writePositive(removed.message);
    const healed = healCrewMember(target, 15);
    if (healed.message) ui.writePositive(healed.message);
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
 */
function applyForageResults(ui, journey) {
  const active = journey.crew.filter(m => m.isActive).length || 1;
  const foodFound = Math.round((6 + Math.random() * 10) * (active / 5));
  const fuelFound = Math.random() < 0.25 ? Math.round(5 + Math.random() * 10) : 0;
  const cashFound = Math.random() < 0.15 ? Math.round(120 + Math.random() * 480) : 0;

  journey.resources.food = Math.min(FIELD_RESOURCES.food.max, journey.resources.food + foodFound);
  if (fuelFound > 0) {
    journey.resources.fuel = Math.min(FIELD_RESOURCES.fuel.max, journey.resources.fuel + fuelFound);
  }
  if (cashFound > 0) {
    journey.resources.budget = Math.min(FIELD_RESOURCES.budget.max, journey.resources.budget + cashFound);
  }

  ui.write('');
  ui.writeHeader('FORAGE RESULTS');
  ui.writePositive(`Found food: +${foodFound} rations`);
  if (fuelFound > 0) ui.writePositive(`Recovered fuel: +${fuelFound} gallons`);
  if (cashFound > 0) ui.writePositive(`Sold salvage: +$${cashFound.toLocaleString()}`);

  if (Math.random() < 0.12) {
    const activeCrew = journey.crew.filter(m => m.isActive);
    const victim = activeCrew.length ? activeCrew[Math.floor(Math.random() * activeCrew.length)] : null;
    if (victim) {
      const injury = applyRandomInjury(victim, 'minor');
      ui.writeWarning(`Foraging accident! ${injury.message}`);
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
