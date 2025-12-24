/**
 * Planning Mode Runner
 * Protagonist-based strategic planning for landscape-level forest plans
 * YOU are the Strategic Planner - no crew, just resources and decisions
 */

import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
import { getCurrentSeasonInfo, advanceDay as advanceSeasonDay } from '../season.js';

/**
 * Run a planning day (landscape plan development mode)
 * @param {Object} game - Game instance
 */
export async function runPlanningDay(game) {
  const { ui, journey } = game;
  const seasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;

  ui.clear();
  ui.writeHeader(`DAY ${journey.day} - STRATEGIC PLANNING`);

  if (seasonInfo) {
    ui.write(`${seasonInfo.icon} ${seasonInfo.name} - Year ${seasonInfo.year}`);
  }
  ui.write('');

  // Show protagonist status (if using protagonist model)
  if (journey.protagonist) {
    displayProtagonistStatus(ui, journey.protagonist);
  }

  // Show plan phase
  const phaseNames = {
    data_gathering: 'Data Gathering',
    analysis: 'Analysis',
    stakeholder_review: 'Stakeholder Review',
    ministerial_approval: 'Ministerial Approval'
  };

  ui.writeDivider(`PHASE: ${phaseNames[journey.plan.phase] || journey.plan.phase}`);
  ui.write(`Data Completeness: ${journey.plan.dataCompleteness}%`);
  ui.write(`Analysis Quality: ${journey.plan.analysisQuality}%`);
  ui.write(`Stakeholder Buy-in: ${journey.plan.stakeholderBuyIn}%`);
  ui.write(`Ministerial Confidence: ${journey.plan.ministerialConfidence}%`);
  ui.write('');

  // Show values balance
  ui.writeDivider('VALUES BALANCE');
  ui.write(`Biodiversity: ${journey.values.biodiversity}%`);
  ui.write(`Timber Supply: ${journey.values.timberSupply}%`);
  ui.write(`Community Needs: ${journey.values.communityNeeds}%`);
  ui.write(`First Nations: ${journey.values.firstNationsValues}%`);
  ui.write('');

  // Show resources
  ui.writeDivider('RESOURCES');
  ui.write(`Budget: $${journey.resources.budget.toLocaleString()}`);
  ui.write(`Political Capital: ${journey.resources.politicalCapital}`);
  ui.write(`Data Credits: ${journey.resources.dataCredits}`);
  ui.write(`Hours Remaining: ${journey.hoursRemaining}`);
  ui.write('');

  // Check for event
  const event = checkForEvent(journey);
  if (event) {
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  // Check protagonist energy if using protagonist model
  if (journey.protagonist && journey.protagonist.energy <= 0) {
    ui.writeWarning('You are exhausted. Taking the day to recover.');
    journey.protagonist.energy = 30;
    journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 20);
    await advanceToNextDay(game);
    return;
  }

  // Actions based on phase
  const actionOptions = buildActionOptions(journey);

  const action = await ui.promptChoice('Choose your action:', actionOptions);

  // Process action
  await processAction(game, action.value);

  // End of day processing
  if (journey.hoursRemaining <= 0 || action.value === 'end') {
    await advanceToNextDay(game);
  }

  // Check game over conditions
  checkGameOver(game);

  ui.updateAllStatus(journey);
  await ui.promptChoice('', [{ label: 'Continue...', value: 'next' }]);
}

/**
 * Display protagonist status
 * @param {Object} ui - UI instance
 * @param {Object} protagonist - Protagonist state
 */
function displayProtagonistStatus(ui, protagonist) {
  ui.writeDivider('YOUR STATUS');

  // Energy bar
  const energyBar = createBar(protagonist.energy, 10);
  ui.write(`Energy: [${energyBar}] ${protagonist.energy}%`);

  // Stress level
  const stressLevel = protagonist.stress > 70 ? 'HIGH' : protagonist.stress > 40 ? 'MODERATE' : 'LOW';
  ui.write(`Stress: ${stressLevel} (${protagonist.stress}%)`);

  // Reputation
  ui.write(`Reputation: ${protagonist.reputation}`);

  // Expertise
  if (protagonist.expertise) {
    const skills = Object.entries(protagonist.expertise)
      .map(([skill, value]) => `${capitalize(skill)}: ${value}`)
      .join(' | ');
    ui.write(`Expertise: ${skills}`);
  }

  ui.write('');
}

/**
 * Build action options based on current phase and resources
 * @param {Object} journey - Journey state
 * @returns {Array} Action options
 */
function buildActionOptions(journey) {
  const actionOptions = [];
  const hoursLeft = journey.hoursRemaining || 8;

  if (journey.plan.phase === 'data_gathering' && journey.resources.dataCredits > 0 && hoursLeft >= 3) {
    actionOptions.push({
      label: 'Gather Data',
      description: 'Compile LiDAR, inventory, and baseline data (3 hrs)',
      value: 'gather_data'
    });
  }

  if (journey.plan.phase === 'analysis' && hoursLeft >= 4) {
    actionOptions.push({
      label: 'Run Analysis',
      description: 'Spatial analysis and modeling (4 hrs)',
      value: 'analyze'
    });
  }

  if (journey.plan.phase === 'stakeholder_review' && hoursLeft >= 4) {
    actionOptions.push({
      label: 'Stakeholder Session',
      description: 'Host consultation session (4 hrs)',
      value: 'stakeholder'
    });
  }

  if (journey.plan.phase === 'ministerial_approval' && hoursLeft >= 6) {
    actionOptions.push({
      label: 'Prepare Submission',
      description: 'Package plan for ministry (6 hrs)',
      value: 'submit'
    });
  }

  // Always available actions
  if (hoursLeft >= 3) {
    actionOptions.push({
      label: 'Values Workshop',
      description: 'Balance competing interests (3 hrs)',
      value: 'values'
    });
  }

  if (hoursLeft >= 2) {
    actionOptions.push({
      label: 'Network',
      description: 'Build political capital (2 hrs)',
      value: 'network'
    });
  }

  if (hoursLeft >= 2 && journey.protagonist) {
    actionOptions.push({
      label: 'Take a Break',
      description: 'Reduce stress, recover energy (2 hrs)',
      value: 'rest'
    });
  }

  actionOptions.push({
    label: 'End Day',
    description: 'Wrap up work',
    value: 'end'
  });

  return actionOptions;
}

/**
 * Process a selected action
 * @param {Object} game - Game instance
 * @param {string} actionValue - Selected action value
 */
async function processAction(game, actionValue) {
  const { ui, journey } = game;

  switch (actionValue) {
    case 'gather_data':
      journey.plan.dataCompleteness = Math.min(100, journey.plan.dataCompleteness + 15);
      journey.resources.dataCredits -= 10;
      journey.hoursRemaining -= 3;
      applyProtagonistCost(journey, { energy: 10, stress: 5 });
      ui.write(`Data gathering progressed. Completeness: ${journey.plan.dataCompleteness}%`);
      if (journey.plan.dataCompleteness >= 80) {
        journey.plan.phase = 'analysis';
        ui.write('Data phase complete! Moving to Analysis.');
      }
      break;

    case 'analyze':
      journey.plan.analysisQuality = Math.min(100, journey.plan.analysisQuality + 20);
      journey.hoursRemaining -= 4;
      applyProtagonistCost(journey, { energy: 15, stress: 10 });
      ui.write(`Analysis progressed. Quality: ${journey.plan.analysisQuality}%`);
      if (journey.plan.analysisQuality >= 80) {
        journey.plan.phase = 'stakeholder_review';
        ui.write('Analysis complete! Moving to Stakeholder Review.');
      }
      break;

    case 'stakeholder':
      journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 15);
      journey.resources.politicalCapital -= 5;
      journey.hoursRemaining -= 4;
      applyProtagonistCost(journey, { energy: 20, stress: 15 });
      // Increase reputation on success
      if (journey.protagonist) {
        journey.protagonist.reputation = Math.min(100, journey.protagonist.reputation + 3);
      }
      ui.write(`Stakeholder buy-in improved to ${journey.plan.stakeholderBuyIn}%`);
      if (journey.plan.stakeholderBuyIn >= 75) {
        journey.plan.phase = 'ministerial_approval';
        ui.write('Stakeholder review complete! Moving to Ministerial Approval.');
      }
      break;

    case 'submit':
      journey.plan.ministerialConfidence += 25;
      journey.hoursRemaining -= 6;
      journey.resources.budget -= 2000;
      applyProtagonistCost(journey, { energy: 25, stress: 20 });
      ui.write(`Submission prepared. Confidence: ${journey.plan.ministerialConfidence}%`);
      if (journey.plan.ministerialConfidence >= 80) {
        journey.isComplete = true;
        journey.endReason = 'Landscape plan approved by Ministry!';
      }
      break;

    case 'values':
      journey.values.biodiversity = Math.min(100, journey.values.biodiversity + 5);
      journey.values.communityNeeds = Math.min(100, journey.values.communityNeeds + 5);
      journey.values.firstNationsValues = Math.min(100, journey.values.firstNationsValues + 5);
      journey.hoursRemaining -= 3;
      applyProtagonistCost(journey, { energy: 10, stress: 5 });
      ui.write('Values workshop improved stakeholder alignment.');
      break;

    case 'network':
      journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 8);
      journey.hoursRemaining -= 2;
      applyProtagonistCost(journey, { energy: 8, stress: 3 });
      if (journey.protagonist) {
        journey.protagonist.reputation = Math.min(100, journey.protagonist.reputation + 2);
      }
      ui.write('Networking successful. Political capital increased.');
      break;

    case 'rest':
      if (journey.protagonist) {
        journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 25);
        journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 15);
      }
      journey.hoursRemaining -= 2;
      ui.write('You take a break. Feeling refreshed.');
      break;

    default:
      break;
  }
}

/**
 * Apply protagonist costs (energy, stress)
 * @param {Object} journey - Journey state
 * @param {Object} costs - { energy, stress }
 */
function applyProtagonistCost(journey, costs) {
  if (!journey.protagonist) return;

  if (costs.energy) {
    journey.protagonist.energy = Math.max(0, journey.protagonist.energy - costs.energy);
  }
  if (costs.stress) {
    journey.protagonist.stress = Math.min(100, journey.protagonist.stress + costs.stress);
  }
}

/**
 * Advance to next day
 * @param {Object} game - Game instance
 */
async function advanceToNextDay(game) {
  const { ui, journey } = game;

  journey.day++;
  journey.hoursRemaining = 8;

  // Protagonist recovery
  if (journey.protagonist) {
    journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 30);
    journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 10);
  } else {
    journey.resources.energy = Math.min(100, (journey.resources.energy || 50) + 30);
  }

  // Advance season
  if (journey.season) {
    const { state, transition } = advanceSeasonDay(journey.season);
    journey.season = state;
    if (transition.seasonChanged) {
      ui.write(`Season changed to ${transition.newSeason}`);
    }
  }
}

/**
 * Check game over conditions
 * @param {Object} game - Game instance
 */
function checkGameOver(game) {
  const journey = game.journey;

  if (journey.resources.budget <= 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'Budget exhausted';
  }

  if (journey.resources.politicalCapital <= 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'Lost political support';
  }

  // Protagonist burnout
  if (journey.protagonist && journey.protagonist.stress >= 100) {
    journey.isGameOver = true;
    journey.gameOverReason = 'Burnout - you need to step back from this project';
  }
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
    const pieces = [];
    if (opt.hint) pieces.push(opt.hint);
    return {
      label: opt.label,
      description: pieces.length ? `[${pieces.join(' | ')}]` : '',
      value: index
    };
  });

  const choice = await ui.promptChoice('What do you do?', options);
  const optionIndex = typeof choice.value === 'number' ? choice.value : 0;
  const selectedOption = event.options[optionIndex];

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
 * Create a visual progress bar
 * @param {number} value - Current value (0-100)
 * @param {number} width - Bar width in characters
 * @returns {string} Progress bar string
 */
function createBar(value, width) {
  const filled = Math.round((value / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Capitalize first letter
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
