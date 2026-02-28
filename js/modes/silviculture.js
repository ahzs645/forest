/**
 * Silviculture Mode Runner
 * Crew + contractor management for reforestation operations
 * Multi-action days with seasonal gating and contractor events
 */

import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
import { getCurrentSeasonInfo, advanceDay as advanceSeasonDay, getSeasonModifiers } from '../season.js';
import { crewHasRole } from '../crew.js';

// Contractor event templates (Phase 4.2)
const CONTRACTOR_EVENTS = [
  {
    id: 'camp_demand',
    trigger: (c) => c.morale < 60,
    title: 'Camp Facilities Demand',
    getText: (c) => `${c.name} is complaining about camp conditions and wants better facilities.`,
    options: [
      { label: 'Upgrade camp ($3,000)', value: 'pay', cost: 3000, moraleGain: 15, prodGain: 5 },
      { label: 'Deny request', value: 'deny', cost: 0, moraleGain: -15, prodGain: -5 }
    ]
  },
  {
    id: 'quality_dispute',
    trigger: (c) => c.specialty === 'planting',
    title: 'Planting Quality Dispute',
    getText: (c) => `Spot-check reveals ${c.name} has been cutting corners on spacing.`,
    options: [
      { label: 'Inspect & retrain (3h)', value: 'inspect', cost: 0, moraleGain: -5, prodGain: 10, hours: 3 },
      { label: 'Let it slide', value: 'slide', cost: 0, moraleGain: 5, prodGain: 0 }
    ]
  },
  {
    id: 'crew_illness',
    trigger: () => Math.random() < 0.3,
    title: 'Contractor Crew Illness',
    getText: (c) => `Several workers from ${c.name} called in sick. Operations slowed.`,
    options: [
      { label: 'Send medic (1h)', value: 'medic', cost: 500, moraleGain: 5, prodGain: 0, hours: 1 },
      { label: 'Push through', value: 'push', cost: 0, moraleGain: -10, prodGain: -10 }
    ]
  },
  {
    id: 'weather_delay',
    trigger: () => true,
    title: 'Weather Delay Request',
    getText: (c) => `${c.name} wants to take the day off due to rain. "Safety first," they say.`,
    options: [
      { label: 'Grant rest day', value: 'rest', cost: 0, moraleGain: 10, prodGain: 0 },
      { label: 'Push through', value: 'push', cost: 0, moraleGain: -8, prodGain: -5 }
    ]
  },
  {
    id: 'poaching',
    trigger: (c) => c.productivity > 85,
    title: 'Contractor Bidding on Another Job',
    getText: (c) => `${c.name} has been offered a contract elsewhere. They want a $5,000 retention bonus.`,
    options: [
      { label: 'Pay retention ($5,000)', value: 'pay', cost: 5000, moraleGain: 10, prodGain: 5 },
      { label: 'Let them consider', value: 'wait', cost: 0, moraleGain: -5, prodGain: -10 }
    ]
  }
];

/**
 * Run a silviculture day with multi-action system
 * @param {Object} game - Game instance
 */
export async function runSilvicultureDay(game) {
  const { ui, journey } = game;
  const seasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;
  const currentSeason = seasonInfo?.id || 'summer';

  // Initialize hours for the day
  if (!journey.hoursRemaining || journey.hoursRemaining <= 0) {
    journey.hoursRemaining = 10;
  }

  // Apply daily contractor productivity decay (Phase 4.2)
  for (const contractor of journey.contractors) {
    if (contractor.isActive) {
      contractor.productivity = Math.max(20, contractor.productivity - 2);
      contractor.morale = Math.max(0, contractor.morale - 1);
    }
  }

  // Apply daily overhead cost
  journey.resources.budget -= 500;

  // Check for contractor event (~20% chance per day)
  if (Math.random() < 0.20) {
    const activeContractors = journey.contractors.filter(c => c.isActive);
    if (activeContractors.length > 0) {
      const targetContractor = activeContractors[Math.floor(Math.random() * activeContractors.length)];
      const applicableEvents = CONTRACTOR_EVENTS.filter(e => e.trigger(targetContractor));
      if (applicableEvents.length > 0) {
        const cEvent = applicableEvents[Math.floor(Math.random() * applicableEvents.length)];
        await handleContractorEvent(game, cEvent, targetContractor);
        if (game.gameOver) return;
      }
    }
  }

  // Check for random event
  const event = checkForEvent(journey);
  if (event) {
    displaySilvicultureHeader(ui, journey, seasonInfo);
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  // Multi-action loop
  while (journey.hoursRemaining > 0) {
    displaySilvicultureHeader(ui, journey, seasonInfo);

    // Get seasonal modifiers
    const seasonMods = journey.season
      ? getSeasonModifiers(currentSeason, 'silviculture')
      : {};

    // Build action options based on season and hours
    const actionOptions = buildSilvicultureActions(journey, currentSeason, seasonMods);

    const action = await ui.promptChoice(`${journey.hoursRemaining}h remaining:`, actionOptions);

    ui.write('');

    if (action.value === 'end') {
      break;
    }

    // Process action
    await processAction(game, action.value, currentSeason, seasonMods);

    ui.updateAllStatus(journey);

    if (journey.hoursRemaining > 0) {
      await ui.promptChoice('', [{ label: 'Continue working...', value: 'next' }]);
    }
  }

  // End of day processing
  journey.day++;
  if (journey.season) {
    const { state, transition } = advanceSeasonDay(journey.season);
    journey.season = state;

    if (transition.seasonChanged) {
      ui.write('');
      ui.writeHeader(`SEASON CHANGE: ${transition.newSeason.toUpperCase()}`);
      if (transition.yearChanged) {
        ui.write(`Year ${transition.newYear} begins!`);
      }
    }
  }

  // Check contractor walkoffs (below 10 morale)
  for (const contractor of journey.contractors) {
    if (contractor.isActive && contractor.morale <= 10 && Math.random() < 0.4) {
      contractor.isActive = false;
      ui.writeDanger(`${contractor.name} has walked off the job!`);
    }
  }

  // Check victory conditions
  if (journey.planting.blocksPlanted >= journey.planting.blocksToPlant &&
      journey.surveys.freeGrowingComplete >= journey.surveys.freeGrowingTarget) {
    journey.isComplete = true;
    journey.endReason = 'Regeneration targets achieved!';
  }

  // Check game over
  if (journey.resources.budget <= 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'Budget exhausted';
  }

  // Reset hours for next day
  journey.hoursRemaining = 0;

  ui.updateAllStatus(journey);

  // Contextual continue (Phase 6.1)
  const nextSeasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;
  const contractorHint = journey.contractors.filter(c => c.isActive && c.morale < 40).length;
  const continueLabel = contractorHint > 0
    ? `Continue... (Day ${journey.day}, ${nextSeasonInfo?.name || ''}, ${contractorHint} unhappy contractor${contractorHint > 1 ? 's' : ''})`
    : `Continue... (Day ${journey.day}, ${nextSeasonInfo?.name || ''})`;
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
}

/**
 * Display compact silviculture header (Phase 6.2)
 */
function displaySilvicultureHeader(ui, journey, seasonInfo) {
  ui.clear();
  ui.writeHeader(`DAY ${journey.day} - SILVICULTURE OPERATIONS`);

  if (seasonInfo) {
    ui.write(`${seasonInfo.icon} ${seasonInfo.name} - Year ${seasonInfo.year} | Hours: ${journey.hoursRemaining}h`);
  }
  ui.write('');

  // Compact program status
  const plantPct = Math.round((journey.planting.seedlingsPlanted / journey.planting.seedlingsAllocated) * 100);
  const brushPct = Math.round((journey.brushing.hectaresComplete / journey.brushing.hectaresTarget) * 100);
  const surveyPct = Math.round((journey.surveys.freeGrowingComplete / journey.surveys.freeGrowingTarget) * 100);

  ui.write(`Plant: ${plantPct}% (${journey.planting.blocksPlanted}/${journey.planting.blocksToPlant} blocks) | Brush: ${brushPct}% | Survey: ${surveyPct}% (${journey.surveys.freeGrowingComplete}/${journey.surveys.freeGrowingTarget})`);

  // Compact contractors
  const contractorStatus = journey.contractors
    .map(c => c.isActive ? `${c.name.split(' ')[0]}: ${c.productivity}%P/${c.morale}%M` : `${c.name.split(' ')[0]}: OFF`)
    .join(' | ');
  ui.write(`Contractors: ${contractorStatus}`);

  // Resources
  ui.write(`Budget: $${journey.resources.budget.toLocaleString()} | Seedlings: ${journey.resources.seedlings.toLocaleString()} | Capacity: ${journey.resources.contractorCapacity} days`);
  ui.write('');
}

/**
 * Build available actions based on season and hours
 */
function buildSilvicultureActions(journey, currentSeason, seasonMods) {
  const actionOptions = [];
  const hoursLeft = journey.hoursRemaining;

  // Planting - primarily spring, marginally in summer/fall, impossible in winter
  const plantingEff = seasonMods?.plantingEfficiency ?? 1.0;
  if (plantingEff > 0 && journey.resources.seedlings > 0 && journey.resources.contractorCapacity > 0 && hoursLeft >= 4) {
    const seasonNote = plantingEff >= 1.2 ? ' (peak season!)' : plantingEff < 1.0 ? ' (reduced efficiency)' : '';
    actionOptions.push({
      label: `Deploy Planting Crew (4h)${seasonNote}`,
      description: `Send contractors to plant a block`,
      value: 'plant'
    });
  } else if (plantingEff <= 0 && hoursLeft >= 4) {
    // Show disabled option so player knows why
    actionOptions.push({
      label: 'Deploy Planting Crew (FROZEN)',
      description: 'Ground is frozen. Planting impossible in winter.',
      value: 'plant_disabled'
    });
  }

  // Herbicide - primarily summer
  const brushingEff = seasonMods?.brushingEfficiency ?? 1.0;
  if (journey.resources.contractorCapacity > 0 && hoursLeft >= 3 && currentSeason !== 'winter') {
    const seasonNote = brushingEff >= 1.2 ? ' (peak season!)' : '';
    actionOptions.push({
      label: `Herbicide Application (3h)${seasonNote}`,
      description: 'Spray competing vegetation',
      value: 'herbicide'
    });
  }

  // Survey - best in fall, not in winter
  const surveyEff = seasonMods?.surveyEfficiency ?? 1.0;
  if (currentSeason !== 'winter' && hoursLeft >= 3) {
    const seasonNote = surveyEff >= 1.2 ? ' (peak season!)' : '';
    actionOptions.push({
      label: `Conduct Survey (3h)${seasonNote}`,
      description: 'Check planting survival rates',
      value: 'survey'
    });
  }

  // Site inspection (new - Phase 2.2)
  if (hoursLeft >= 2 && journey.planting.blocksPlanted > 0) {
    actionOptions.push({
      label: 'Site Inspection (2h)',
      description: 'Check planting quality and survival',
      value: 'inspect'
    });
  }

  // Contractor meeting - choose specific contractor (Phase 4.2)
  if (hoursLeft >= 2) {
    actionOptions.push({
      label: 'Contractor Meeting (2h)',
      description: 'Meet with a specific contractor',
      value: 'meeting'
    });
  }

  // Team briefing
  if (journey.crew && journey.crew.length > 0 && hoursLeft >= 1) {
    actionOptions.push({
      label: 'Team Briefing (1h)',
      description: 'Boost crew morale',
      value: 'briefing'
    });
  }

  actionOptions.push({
    label: 'End Day',
    description: 'Wrap up and rest',
    value: 'end'
  });

  return actionOptions;
}

/**
 * Process a selected action with seasonal modifiers
 */
async function processAction(game, actionId, currentSeason, seasonMods) {
  const { ui, journey } = game;

  switch (actionId) {
    case 'plant':
      await handlePlanting(game, seasonMods);
      journey.hoursRemaining -= 4;
      break;

    case 'plant_disabled':
      ui.writeWarning('Ground is frozen. Planting is impossible in winter.');
      break;

    case 'herbicide':
      await handleHerbicide(game, seasonMods);
      journey.hoursRemaining -= 3;
      break;

    case 'survey':
      await handleSurvey(game, seasonMods);
      journey.hoursRemaining -= 3;
      break;

    case 'inspect':
      handleSiteInspection(game);
      journey.hoursRemaining -= 2;
      break;

    case 'meeting':
      await handleContractorMeeting(game);
      journey.hoursRemaining -= 2;
      break;

    case 'briefing':
      handleTeamBriefing(game);
      journey.hoursRemaining -= 1;
      break;

    default:
      break;
  }
}

/**
 * Handle planting with seasonal efficiency
 */
async function handlePlanting(game, seasonMods) {
  const { ui, journey } = game;
  const plantingEff = seasonMods?.plantingEfficiency ?? 1.0;

  const activeContractors = journey.contractors.filter(c => c.isActive && c.specialty === 'planting');
  const avgProductivity = activeContractors.length > 0
    ? activeContractors.reduce((sum, c) => sum + c.productivity, 0) / activeContractors.length
    : 50;

  const baseSeedlings = 15000;
  const seedlingsToPlant = Math.min(
    Math.round(baseSeedlings * (avgProductivity / 100) * plantingEff),
    journey.resources.seedlings
  );

  journey.planting.seedlingsPlanted += seedlingsToPlant;
  journey.resources.seedlings -= seedlingsToPlant;
  journey.resources.contractorCapacity -= 5;
  journey.resources.budget -= 3000;

  ui.write(`Planted ${seedlingsToPlant.toLocaleString()} seedlings.`);
  if (plantingEff >= 1.2) {
    ui.writePositive('Spring conditions boosted planting efficiency!');
  } else if (plantingEff < 1.0 && plantingEff > 0) {
    ui.writeWarning('Off-season planting reduced efficiency.');
  }

  // Check if block is complete
  const seedlingsPerBlock = Math.ceil(journey.planting.seedlingsAllocated / journey.planting.blocksToPlant);
  const blocksCompleted = Math.floor(journey.planting.seedlingsPlanted / seedlingsPerBlock);

  if (blocksCompleted > journey.planting.blocksPlanted) {
    journey.planting.blocksPlanted = blocksCompleted;
    ui.writePositive(`Block ${blocksCompleted} planting complete!`);
  }
}

/**
 * Handle herbicide with seasonal efficiency
 */
async function handleHerbicide(game, seasonMods) {
  const { ui, journey } = game;
  const brushingEff = seasonMods?.brushingEfficiency ?? 1.0;

  const activeContractors = journey.contractors.filter(c => c.isActive && c.specialty === 'brushing');
  const avgProductivity = activeContractors.length > 0
    ? activeContractors.reduce((sum, c) => sum + c.productivity, 0) / activeContractors.length
    : 50;

  const baseHectares = 30;
  const hectaresTreated = Math.round(
    baseHectares * (avgProductivity / 100) * brushingEff * (0.8 + Math.random() * 0.4)
  );

  journey.brushing.hectaresComplete += hectaresTreated;
  journey.resources.contractorCapacity -= 3;
  journey.resources.budget -= 2000;

  ui.write(`Treated ${hectaresTreated} hectares of competing vegetation.`);
  if (brushingEff >= 1.2) {
    ui.writePositive('Summer heat improved herbicide effectiveness!');
  }
}

/**
 * Handle survey with seasonal efficiency
 */
async function handleSurvey(game, seasonMods) {
  const { ui, journey } = game;
  const surveyEff = seasonMods?.surveyEfficiency ?? 1.0;

  journey.surveys.regenerationSurveys++;
  journey.resources.budget -= 500;

  const hasSurveyor = journey.crew
    ? (crewHasRole(journey.crew, 'surveyor') || crewHasRole(journey.crew, 'spotter'))
    : false;
  const baseChance = hasSurveyor ? 0.65 : 0.50;
  const successChance = Math.min(0.85, baseChance * surveyEff);

  if (Math.random() < successChance) {
    journey.surveys.freeGrowingComplete++;
    ui.writePositive('Survey complete - block declared free-growing!');
    if (surveyEff >= 1.2) {
      ui.write('Fall conditions provided ideal assessment conditions.');
    }
  } else {
    ui.write('Survey complete - more monitoring needed.');
  }
}

/**
 * Handle site inspection (new action)
 */
function handleSiteInspection(game) {
  const { ui, journey } = game;
  const survivalRate = 70 + Math.floor(Math.random() * 25);
  journey.planting.survivalRate = survivalRate;

  ui.writeHeader('SITE INSPECTION');
  ui.write(`Estimated survival rate: ${survivalRate}%`);

  if (survivalRate >= 85) {
    ui.writePositive('Excellent survival! Planting quality is high.');
  } else if (survivalRate >= 70) {
    ui.write('Acceptable survival. Some fill planting may be needed.');
  } else {
    ui.writeWarning('Poor survival. Consider replanting affected areas.');
  }
}

/**
 * Handle contractor meeting - choose specific contractor (Phase 4.2)
 */
async function handleContractorMeeting(game) {
  const { ui, journey } = game;
  const activeContractors = journey.contractors.filter(c => c.isActive);

  if (activeContractors.length === 0) {
    ui.write('No active contractors to meet with.');
    return;
  }

  const options = activeContractors.map(c => ({
    label: `${c.name} (${c.specialty})`,
    description: `Productivity: ${c.productivity}% | Morale: ${c.morale}%`,
    value: c.id
  }));

  const choice = await ui.promptChoice('Meet with which contractor?', options);
  const contractor = journey.contractors.find(c => c.id === choice.value);
  if (!contractor) return;

  // Meeting effects depend on contractor state
  if (contractor.morale < 40) {
    contractor.morale = Math.min(100, contractor.morale + 15);
    contractor.productivity = Math.min(100, contractor.productivity + 5);
    ui.write(`${contractor.name} appreciated the attention. Morale improved significantly.`);
  } else {
    contractor.morale = Math.min(100, contractor.morale + 8);
    contractor.productivity = Math.min(100, contractor.productivity + 8);
    ui.write(`Good meeting with ${contractor.name}. Relations and productivity improved.`);
  }
}

/**
 * Handle team briefing (for crew)
 */
function handleTeamBriefing(game) {
  const { ui, journey } = game;
  if (!journey.crew) return;

  for (const member of journey.crew) {
    if (member.isActive) {
      member.morale = Math.min(100, (member.morale || 50) + 15);
    }
  }

  ui.write('Team morale boosted. Your crew is ready to tackle the day.');
}

/**
 * Handle contractor event (Phase 4.2)
 */
async function handleContractorEvent(game, cEvent, contractor) {
  const { ui, journey } = game;

  ui.clear();
  ui.writeHeader(`CONTRACTOR EVENT: ${cEvent.title}`);
  ui.write(cEvent.getText(contractor));
  ui.write('');

  const options = cEvent.options.map(opt => ({
    label: opt.label,
    description: '',
    value: opt.value
  }));

  const choice = await ui.promptChoice('How do you respond?', options);
  const selected = cEvent.options.find(o => o.value === choice.value);

  if (selected) {
    if (selected.cost > 0) {
      if (journey.resources.budget < selected.cost) {
        ui.writeWarning(`Not enough budget! ($${selected.cost} needed)`);
        // Apply the negative effect instead
        contractor.morale = Math.max(0, contractor.morale - 10);
        return;
      }
      journey.resources.budget -= selected.cost;
    }
    contractor.morale = Math.max(0, Math.min(100, contractor.morale + selected.moraleGain));
    contractor.productivity = Math.max(20, Math.min(100, contractor.productivity + selected.prodGain));

    if (selected.hours) {
      journey.hoursRemaining = Math.max(0, journey.hoursRemaining - selected.hours);
    }

    if (selected.moraleGain > 0) {
      ui.writePositive(`${contractor.name} morale improved.`);
    } else if (selected.moraleGain < 0) {
      ui.writeWarning(`${contractor.name} is unhappy with the decision.`);
    }
  }
}

/**
 * Handle an event
 */
async function handleEvent(game, event) {
  const { ui, journey } = game;
  const formatted = formatEventForDisplay(event, journey.journeyType);

  ui.write('');
  ui.writeHeader(`EVENT: ${formatted.title}`);
  ui.write(formatted.description);
  ui.write('');

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
    if (candidate?.requiresRole && journey.crew && !crewHasRole(journey.crew, candidate.requiresRole)) {
      ui.writeWarning(`You need a ${formatRoleName(candidate.requiresRole)} to do that.`);
      continue;
    }
    selectedOption = candidate;
  }

  const result = resolveEvent(journey, event, selectedOption);

  ui.write('');
  for (const msg of result.messages) {
    ui.write(msg);
  }

  if (selectedOption.gameOver) {
    game.gameOver = true;
    journey.endReason = selectedOption.gameOverReason || 'Event outcome';
  }
}

function formatRoleName(roleId) {
  if (!roleId) return 'specialist';
  const formatted = roleId.replace(/[_-]+/g, ' ').trim();
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
