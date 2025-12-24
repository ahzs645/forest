/**
 * Silviculture Mode Runner
 * Crew + contractor management for reforestation operations
 */

import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
import { getCurrentSeasonInfo, advanceDay as advanceSeasonDay } from '../season.js';
import { crewHasRole } from '../crew.js';

/**
 * Run a silviculture day (contractor management mode)
 * @param {Object} game - Game instance
 */
export async function runSilvicultureDay(game) {
  const { ui, journey } = game;
  const seasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;

  ui.clear();
  ui.writeHeader(`DAY ${journey.day} - SILVICULTURE OPERATIONS`);

  if (seasonInfo) {
    ui.write(`${seasonInfo.icon} ${seasonInfo.name} - Year ${seasonInfo.year} (Day ${seasonInfo.dayInSeason}/${seasonInfo.daysRemaining + seasonInfo.dayInSeason})`);
  }
  ui.write('');

  // Show program progress
  const plantingPct = Math.round((journey.planting.seedlingsPlanted / journey.planting.seedlingsAllocated) * 100);
  const brushingPct = Math.round((journey.brushing.hectaresComplete / journey.brushing.hectaresTarget) * 100);
  const surveyPct = Math.round((journey.surveys.freeGrowingComplete / journey.surveys.freeGrowingTarget) * 100);

  ui.writeDivider('PROGRAM STATUS');
  ui.write(`Planting: ${journey.planting.seedlingsPlanted.toLocaleString()}/${journey.planting.seedlingsAllocated.toLocaleString()} seedlings (${plantingPct}%)`);
  ui.write(`Brushing: ${journey.brushing.hectaresComplete}/${journey.brushing.hectaresTarget} ha (${brushingPct}%)`);
  ui.write(`Surveys: ${journey.surveys.freeGrowingComplete}/${journey.surveys.freeGrowingTarget} (${surveyPct}%)`);
  ui.write('');

  // Show crew (your direct reports)
  if (journey.crew && journey.crew.length > 0) {
    ui.writeDivider('YOUR TEAM');
    for (const member of journey.crew) {
      if (member.isActive) {
        const morale = member.morale || 100;
        ui.write(`${member.name} (${member.role}): ${morale}% morale`);
      }
    }
    ui.write('');
  }

  // Show contractors
  ui.writeDivider('CONTRACTORS');
  for (const contractor of journey.contractors) {
    const status = contractor.isActive ? `${contractor.productivity}% productivity` : 'INACTIVE';
    ui.write(`${contractor.name} (${contractor.specialty}): ${status}`);
  }
  ui.write('');

  // Show resources
  ui.writeDivider('RESOURCES');
  ui.write(`Budget: $${journey.resources.budget.toLocaleString()}`);
  ui.write(`Seedlings: ${journey.resources.seedlings.toLocaleString()}`);
  ui.write(`Contractor Days: ${journey.resources.contractorCapacity}`);
  ui.write('');

  // Check for random event
  const event = checkForEvent(journey);
  if (event) {
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  // Action options based on season
  const currentSeason = seasonInfo?.id || 'summer';
  const actionOptions = [];

  if (currentSeason === 'spring' && journey.resources.seedlings > 0 && journey.resources.contractorCapacity > 0) {
    actionOptions.push({
      label: 'Deploy Planting Crew',
      description: 'Send contractors to plant a block',
      value: 'plant'
    });
  }

  if ((currentSeason === 'summer' || currentSeason === 'spring') && journey.resources.contractorCapacity > 0) {
    actionOptions.push({
      label: 'Herbicide Application',
      description: 'Spray competing vegetation',
      value: 'herbicide'
    });
  }

  if (currentSeason !== 'winter') {
    actionOptions.push({
      label: 'Conduct Survey',
      description: 'Check planting survival rates',
      value: 'survey'
    });
  }

  actionOptions.push({
    label: 'Contractor Meeting',
    description: 'Manage contractor relations',
    value: 'meeting'
  });

  // Crew-based actions (when you have a crew)
  if (journey.crew && journey.crew.length > 0) {
    actionOptions.push({
      label: 'Team Briefing',
      description: 'Boost team morale and coordination',
      value: 'briefing'
    });
  }

  actionOptions.push({
    label: 'End Day',
    description: 'Wrap up and move to next day',
    value: 'end'
  });

  const action = await ui.promptChoice('Choose your action:', actionOptions);

  // Process action
  switch (action.value) {
    case 'plant':
      await handlePlanting(game);
      break;

    case 'herbicide':
      await handleHerbicide(game);
      break;

    case 'survey':
      await handleSurvey(game);
      break;

    case 'meeting':
      handleContractorMeeting(game);
      break;

    case 'briefing':
      handleTeamBriefing(game);
      break;

    default:
      break;
  }

  // Advance day and season
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

  ui.updateAllStatus(journey);
  await ui.promptChoice('', [{ label: 'Continue...', value: 'next' }]);
}

/**
 * Handle planting operation
 * @param {Object} game - Game instance
 */
async function handlePlanting(game) {
  const { ui, journey } = game;

  // Calculate seedlings to plant based on contractor productivity
  const activeContractors = journey.contractors.filter(c => c.isActive && c.specialty === 'planting');
  const avgProductivity = activeContractors.length > 0
    ? activeContractors.reduce((sum, c) => sum + c.productivity, 0) / activeContractors.length
    : 50;

  const baseSeedlings = 15000;
  const seedlingsToPlant = Math.min(
    Math.round(baseSeedlings * (avgProductivity / 100)),
    journey.resources.seedlings
  );

  journey.planting.seedlingsPlanted += seedlingsToPlant;
  journey.resources.seedlings -= seedlingsToPlant;
  journey.resources.contractorCapacity -= 5;
  journey.resources.budget -= 2000;

  ui.write(`Planted ${seedlingsToPlant.toLocaleString()} seedlings.`);

  // Check if block is complete
  const seedlingsPerBlock = Math.ceil(journey.planting.seedlingsAllocated / journey.planting.blocksToPlant);
  const blocksCompleted = Math.floor(journey.planting.seedlingsPlanted / seedlingsPerBlock);

  if (blocksCompleted > journey.planting.blocksPlanted) {
    journey.planting.blocksPlanted = blocksCompleted;
    ui.write(`Block ${blocksCompleted} planting complete!`);
  }
}

/**
 * Handle herbicide application
 * @param {Object} game - Game instance
 */
async function handleHerbicide(game) {
  const { ui, journey } = game;

  const activeContractors = journey.contractors.filter(c => c.isActive && c.specialty === 'brushing');
  const avgProductivity = activeContractors.length > 0
    ? activeContractors.reduce((sum, c) => sum + c.productivity, 0) / activeContractors.length
    : 50;

  const baseHectares = 30;
  const hectaresTreated = Math.round(baseHectares * (avgProductivity / 100) * (0.8 + Math.random() * 0.4));

  journey.brushing.hectaresComplete += hectaresTreated;
  journey.resources.contractorCapacity -= 3;
  journey.resources.budget -= 1500;

  ui.write(`Treated ${hectaresTreated} hectares of competing vegetation.`);
}

/**
 * Handle survey operation
 * @param {Object} game - Game instance
 */
async function handleSurvey(game) {
  const { ui, journey } = game;

  journey.surveys.regenerationSurveys++;
  journey.resources.budget -= 500;

  // Success rate affected by crew expertise if available
  const hasSurveyor = journey.crew ? crewHasRole(journey.crew, 'surveyor') : false;
  const successChance = hasSurveyor ? 0.55 : 0.40;

  if (Math.random() < successChance) {
    journey.surveys.freeGrowingComplete++;
    ui.write('Survey complete - block declared free-growing!');
  } else {
    ui.write('Survey complete - more monitoring needed.');
  }
}

/**
 * Handle contractor meeting
 * @param {Object} game - Game instance
 */
function handleContractorMeeting(game) {
  const { ui, journey } = game;

  for (const contractor of journey.contractors) {
    contractor.morale = Math.min(100, contractor.morale + 10);
    contractor.productivity = Math.min(100, contractor.productivity + 5);
  }

  ui.write('Contractor relations improved.');
}

/**
 * Handle team briefing (for crew)
 * @param {Object} game - Game instance
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
 * Handle an event
 * @param {Object} game - Game instance
 * @param {Object} event - Event to handle
 */
async function handleEvent(game, event) {
  const { ui, journey } = game;
  const formatted = formatEventForDisplay(event, journey.journeyType);

  ui.write('');
  ui.writeHeader(`EVENT: ${formatted.title}`);
  ui.write(formatted.description);
  ui.write('');

  // Build options
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
