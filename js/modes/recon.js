/**
 * Recon Mode Runner
 * Field-based reconnaissance operations with crew mechanics
 */

import { getCrewDisplayInfo, healCrewMember, removeStatusEffect, applyRandomInjury, crewHasRole, getCrewComment, awardCrewExperience } from '../crew.js';
import { executeFieldDay, PACE_OPTIONS, getFieldProgressInfo } from '../journey.js';
import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
import { getFormattedResourceStatus, FIELD_RESOURCES } from '../resources.js';

// Block discovery flavor text — unique finds that reward exploration
const BLOCK_DISCOVERIES = [
  { text: 'Your crew discovers a stand of old-growth western red cedar — massive trunks untouched for centuries.', effect: 'morale', value: 12, compliance: 3 },
  { text: 'GPS survey reveals an unmapped creek crossing. This will change the access planning.', effect: 'data', value: 5 },
  { text: 'Old survey markers from the 1970s found nailed to a spruce. Historical data confirmed.', effect: 'data', value: 3 },
  { text: 'An abandoned trapper\'s cabin in fair condition. Could serve as emergency shelter.', effect: 'shelter', value: 1 },
  { text: 'Rare plant species identified — lady\'s slipper orchid. Flagged for protection.', effect: 'morale', value: 8, compliance: 5 },
  { text: 'A natural mineral lick with fresh ungulate tracks everywhere. Great wildlife data.', effect: 'morale', value: 6 },
  { text: 'Crew finds a cache of forgotten equipment — jerry cans and tools in a weathered tarp.', effect: 'supplies', fuel: 10, equipment: 5 },
  { text: 'Eagle nest spotted in a veteran Douglas fir. Noted as a wildlife tree retention.', effect: 'morale', value: 5, compliance: 2 },
  { text: 'Fresh bear den signs near the cutblock boundary. Critical safety information documented.', effect: 'data', value: 4 },
  { text: 'Crystal-clear spring bubbling from the hillside. The crew fills water bottles and rests.', effect: 'morale', value: 10 },
  { text: 'Petroglyphs on a rock face near the creek. Cultural heritage site flagged for protection.', effect: 'cultural', value: 8, compliance: 8 },
  { text: 'Excellent viewpoint overlooking the entire valley. Perfect for landscape-level assessment.', effect: 'data', value: 6 },
  { text: 'Patch of wild huckleberries — the crew takes a welcome snack break.', effect: 'food', value: 3 },
  { text: 'Signs of recent wildfire — regeneration study opportunity identified.', effect: 'data', value: 5 },
  { text: 'Beaver dam complex creating wetland habitat. Noted for hydrological assessment.', effect: 'data', value: 4, compliance: 3 }
];

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

    // Block discovery chance (35% on each new block)
    if (Math.random() < 0.35) {
      if (!journey._usedDiscoveries) journey._usedDiscoveries = [];
      const available = BLOCK_DISCOVERIES.filter((_, i) => !journey._usedDiscoveries.includes(i));
      if (available.length > 0) {
        const idx = BLOCK_DISCOVERIES.indexOf(available[Math.floor(Math.random() * available.length)]);
        const discovery = BLOCK_DISCOVERIES[idx];
        journey._usedDiscoveries.push(idx);
        ui.write('');
        ui.writePositive(`DISCOVERY: ${discovery.text}`);

        // Apply discovery effects
        if (discovery.effect === 'morale' && journey.crew) {
          for (const m of journey.crew) {
            if (m.isActive) m.morale = Math.min(100, m.morale + (discovery.value || 5));
          }
        }
        if (discovery.effect === 'supplies') {
          if (discovery.fuel) journey.resources.fuel += discovery.fuel;
          if (discovery.equipment) journey.resources.equipment = Math.min(100, journey.resources.equipment + discovery.equipment);
        }
        if (discovery.effect === 'food') {
          journey.resources.food += (discovery.value || 3);
        }
        if (discovery.compliance) {
          // Track for scoring
          if (!journey.complianceBonus) journey.complianceBonus = 0;
          journey.complianceBonus += discovery.compliance;
        }

        // Award XP to spotter if present
        const spotter = journey.crew?.find(m => m.isActive && m.role === 'spotter');
        if (spotter) {
          const xpMsg = awardCrewExperience(spotter);
          if (xpMsg) ui.write(xpMsg);
        }
      }
    }
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

  // Multi-action loop: keep going while hours remain
  while (journey.hoursRemaining > 0) {
    const currentBlock = journey.blocks[journey.currentBlockIndex];

    displayDayHeader(ui, journey);

    // Build action options based on remaining hours and state
    const actionOptions = [];
    const canTravel = !hasTraveled && journey.resources.fuel > 0 && journey.resources.equipment > 0;

    if (canTravel) {
      // Travel options (4-6 hours depending on pace)
      actionOptions.push({
        label: 'Cautious Recon (4h)',
        description: '60% coverage, low risk',
        value: 'slow'
      });
      if (journey.hoursRemaining >= 5) {
        actionOptions.push({
          label: 'Standard Recon (5h)',
          description: '100% coverage, normal risk',
          value: 'normal'
        });
      }
      if (journey.hoursRemaining >= 6) {
        actionOptions.push({
          label: 'Extended Recon (6h)',
          description: '140% coverage, higher risk',
          value: 'fast'
        });
      }
      if (journey.hoursRemaining >= 8) {
        actionOptions.push({
          label: 'Max Effort (8h)',
          description: '180% coverage, grueling',
          value: 'grueling'
        });
      }
    }

    // Camp actions (available anytime)
    if (journey.hoursRemaining >= 2) {
      actionOptions.push({
        label: 'Forage & Scout (2h)',
        description: 'Find supplies; small injury risk',
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
      applyForageResults(ui, journey);
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

    // Auto-continue between actions (no friction prompt)
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

  // Weather, terrain, and forecast
  const weatherName = journey.weather?.name || 'Clear';
  const terrainName = currentBlock?.terrain || 'unknown';
  const forecast = journey.weatherForecast ? ` | Tomorrow: ${journey.weatherForecast}` : '';
  ui.write(`Weather: ${weatherName} | Terrain: ${terrainName} | Hours: ${journey.hoursRemaining || 0}h${forecast}`);

  // Travel conditions modifier
  const weatherMod = journey.weather?.travelModifier || 1;
  const conditionPct = Math.round(weatherMod * 100);
  const conditionLabel = conditionPct >= 90 ? 'GOOD' : conditionPct >= 60 ? 'FAIR' : conditionPct >= 40 ? 'POOR' : 'SEVERE';
  ui.write(`Travel Conditions: ${conditionLabel} (${conditionPct}% of normal speed)`);
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
