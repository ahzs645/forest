/**
 * Planning Mode Runner
 * Protagonist-based strategic planning for landscape-level forest plans
 * Multi-action days with values tradeoffs
 */

import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
import { getCurrentSeasonInfo, advanceDay as advanceSeasonDay } from '../season.js';
import { pickPlanningBlockOptions, summarizePlanningBlock } from '../data/planningBlocks.js';

/**
 * Run a planning day with multi-action system
 * @param {Object} game - Game instance
 */
export async function runPlanningDay(game) {
  const { ui, journey } = game;
  const seasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;

  // Reset hours for new day
  if (!journey.hoursRemaining || journey.hoursRemaining <= 0) {
    journey.hoursRemaining = 8;
  }

  // Periodic real-data block decision: selected block influences events and values.
  await maybePromptForBlockSelection(game, seasonInfo);

  // Apply daily values consequences (Phase 4.1)
  applyValuesConsequences(journey);

  // Check for event at start of day
  const event = checkForEvent(journey);
  if (event) {
    displayPlanningHeader(ui, journey, seasonInfo);
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  // Check protagonist energy
  if (journey.protagonist && journey.protagonist.energy <= 0) {
    displayPlanningHeader(ui, journey, seasonInfo);
    ui.writeWarning('You are exhausted. Taking the day to recover.');
    journey.protagonist.energy = 30;
    journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 20);
    await advanceToNextDay(game);
    return;
  }

  // Multi-action loop (Phase 2.3)
  while (journey.hoursRemaining > 0) {
    displayPlanningHeader(ui, journey, seasonInfo);

    // Check protagonist energy mid-day
    if (journey.protagonist && journey.protagonist.energy <= 0) {
      ui.writeWarning('You are exhausted. The rest of the day is lost to recovery.');
      journey.protagonist.energy = 15;
      break;
    }

    const actionOptions = buildActionOptions(journey);

    const action = await ui.promptChoice(`${journey.hoursRemaining}h remaining:`, actionOptions);

    if (action.value === 'end') {
      break;
    }

    ui.write('');
    await processAction(game, action.value);

    ui.updateAllStatus(journey);

    if (journey.hoursRemaining > 0) {
      await ui.promptChoice('', [{ label: 'Continue working...', value: 'next' }]);
    }
  }

  // End of day
  await advanceToNextDay(game);

  // Check game over conditions
  checkGameOver(game);

  ui.updateAllStatus(journey);

  // Contextual continue (Phase 6.1)
  const phaseNames = {
    data_gathering: 'Data Gathering',
    analysis: 'Analysis',
    stakeholder_review: 'Stakeholder Review',
    ministerial_approval: 'Ministerial Approval'
  };
  const continueLabel = `Continue... (Phase: ${phaseNames[journey.plan.phase] || journey.plan.phase}, Day ${journey.day})`;
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
}

/**
 * Display compact planning header (Phase 6.2)
 */
function displayPlanningHeader(ui, journey, seasonInfo) {
  ui.clear();
  ui.writeHeader(`DAY ${journey.day} - STRATEGIC PLANNING`);

  if (seasonInfo) {
    ui.write(`${seasonInfo.icon} ${seasonInfo.name} - Year ${seasonInfo.year} | Hours: ${journey.hoursRemaining}h`);
  }
  ui.write('');

  // Protagonist status
  if (journey.protagonist) {
    const energyBar = createBar(journey.protagonist.energy, 10);
    const stressLevel = journey.protagonist.stress > 70 ? 'HIGH' : journey.protagonist.stress > 40 ? 'MODERATE' : 'LOW';
    ui.write(`Energy: [${energyBar}] ${journey.protagonist.energy}% | Stress: ${stressLevel} (${journey.protagonist.stress}%) | Rep: ${journey.protagonist.reputation}`);
  }

  // Phase and plan metrics
  const phaseNames = {
    data_gathering: 'Data Gathering',
    analysis: 'Analysis',
    stakeholder_review: 'Stakeholder Review',
    ministerial_approval: 'Ministerial Approval'
  };
  ui.write(`Phase: ${phaseNames[journey.plan.phase] || journey.plan.phase}`);
  ui.write(`Data: ${journey.plan.dataCompleteness}% | Analysis: ${journey.plan.analysisQuality}% | Buy-in: ${journey.plan.stakeholderBuyIn}% | Confidence: ${journey.plan.ministerialConfidence}%`);

  // Values balance (Phase 4.1 - these now matter)
  ui.write(`Values: Bio ${journey.values.biodiversity}% | Timber ${journey.values.timberSupply}% | Community ${journey.values.communityNeeds}% | FN ${journey.values.firstNationsValues}%`);

  // Resources
  ui.write(`Budget: $${journey.resources.budget.toLocaleString()} | Political Capital: ${journey.resources.politicalCapital} | Data: ${journey.resources.dataCredits}`);

  if (journey.blockPlanning?.activeSummary) {
    ui.write(`Active Block: ${journey.blockPlanning.activeSummary}`);
    if (journey.blockPlanning.nextSelectionDay) {
      ui.write(`Next block review: Day ${journey.blockPlanning.nextSelectionDay}`);
    }
  }
  ui.write('');
}

async function maybePromptForBlockSelection(game, seasonInfo) {
  const { ui, journey } = game;
  const plannerState = journey.blockPlanning;
  if (!plannerState) return;
  if (journey.day < (plannerState.nextSelectionDay || 1)) return;

  const options = pickPlanningBlockOptions(journey.areaId, plannerState.history, 3);
  if (!options.length) return;

  displayPlanningHeader(ui, journey, seasonInfo);
  ui.writeHeader('CUTBLOCK PRIORITY DECISION');
  ui.write('Choose which real block/opening to prioritize for the next planning window.');
  ui.write('');

  const promptOptions = options.map((block) => {
    const timber = Math.round(block?.metrics?.timberOpportunity || 0);
    const eco = Math.round(block?.metrics?.biodiversitySensitivity || 0);
    const fn = Math.round(block?.metrics?.firstNationsSensitivity || 0);
    const areaHa = Number(block.areaHa || 0).toFixed(1);
    const source = block.sourceType === 'planned-cutblock' ? 'Planned Cutblock' : 'Untreated Opening';
    return {
      label: `${source}: ${block.label}`,
      description: `${areaHa} ha | ${block.adminDistrict} | Timber ${timber} | Eco ${eco} | FN ${fn}`,
      value: block.id
    };
  });

  const selected = await ui.promptChoice('Select active block focus:', promptOptions);
  const chosen = options.find((block) => block.id === selected.value) || options[0];
  applySelectedBlockImpact(journey, chosen);

  ui.write('');
  ui.writePositive(`Active focus selected: ${chosen.label}`);
  ui.write(chosen.summary);
  ui.write(`Values shift -> Bio ${formatDelta(chosen.valueEffects.biodiversity)} | Timber ${formatDelta(chosen.valueEffects.timberSupply)} | Community ${formatDelta(chosen.valueEffects.communityNeeds)} | FN ${formatDelta(chosen.valueEffects.firstNationsValues)}`);
  await ui.promptChoice('', [{ label: 'Continue to day planning...', value: 'next' }]);
}

function formatDelta(value) {
  const num = Number(value || 0);
  return num > 0 ? `+${num}` : `${num}`;
}

function applySelectedBlockImpact(journey, block) {
  if (!journey.blockPlanning || !block) return;

  const state = journey.blockPlanning;
  state.activeBlockId = block.id;
  state.activeBlock = block;
  state.activeSummary = summarizePlanningBlock(block);
  state.activeEventBias = block.eventBias || null;
  state.history = Array.isArray(state.history) ? [...state.history, block.id].slice(-30) : [block.id];
  state.nextSelectionDay = journey.day + (state.cadenceDays || 3);

  const effects = block.valueEffects || {};
  journey.values.biodiversity = clampValue(journey.values.biodiversity + (effects.biodiversity || 0));
  journey.values.timberSupply = clampValue(journey.values.timberSupply + (effects.timberSupply || 0));
  journey.values.communityNeeds = clampValue(journey.values.communityNeeds + (effects.communityNeeds || 0));
  journey.values.firstNationsValues = clampValue(journey.values.firstNationsValues + (effects.firstNationsValues || 0));
}

function clampValue(value) {
  return Math.max(0, Math.min(100, value));
}

/**
 * Apply daily consequences from values imbalance (Phase 4.1)
 */
function applyValuesConsequences(journey) {
  // Low values create daily penalties
  if (journey.values.biodiversity < 30) {
    journey.plan.stakeholderBuyIn = Math.max(0, journey.plan.stakeholderBuyIn - 2);
  }
  if (journey.values.timberSupply < 30) {
    journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 1);
  }
  if (journey.values.firstNationsValues < 30 && journey.plan.phase === 'stakeholder_review') {
    // Stalls stakeholder phase progress
    journey.plan.stakeholderBuyIn = Math.max(0, journey.plan.stakeholderBuyIn - 3);
  }
  if (journey.values.communityNeeds < 30 && journey.protagonist) {
    journey.protagonist.stress = Math.min(100, journey.protagonist.stress + 3);
  }
}

/**
 * Build action options based on current phase and resources
 */
function buildActionOptions(journey) {
  const actionOptions = [];
  const hoursLeft = journey.hoursRemaining || 8;

  // Phase-specific primary actions
  if (journey.plan.phase === 'data_gathering' && journey.resources.dataCredits > 0 && hoursLeft >= 3) {
    actionOptions.push({
      label: 'Gather Data (3h)',
      description: 'Compile LiDAR, inventory, and baseline data',
      value: 'gather_data'
    });
  }

  if (journey.plan.phase === 'analysis' && hoursLeft >= 4) {
    actionOptions.push({
      label: 'Run Analysis (4h)',
      description: 'Spatial analysis and modeling',
      value: 'analyze'
    });
  }

  if (journey.plan.phase === 'stakeholder_review' && hoursLeft >= 4) {
    // Check values gate (Phase 4.1)
    const valuesOk = journey.values.biodiversity >= 25 && journey.values.timberSupply >= 25 &&
      journey.values.communityNeeds >= 25 && journey.values.firstNationsValues >= 25;
    if (valuesOk) {
      actionOptions.push({
        label: 'Stakeholder Session (4h)',
        description: 'Host consultation session',
        value: 'stakeholder'
      });
    } else {
      actionOptions.push({
        label: 'Stakeholder Session (BLOCKED)',
        description: 'All values must be ≥25% to proceed',
        value: 'stakeholder_blocked'
      });
    }
  }

  if (journey.plan.phase === 'ministerial_approval' && hoursLeft >= 6) {
    const valuesOk = journey.values.biodiversity >= 25 && journey.values.timberSupply >= 25 &&
      journey.values.communityNeeds >= 25 && journey.values.firstNationsValues >= 25;
    if (valuesOk) {
      actionOptions.push({
        label: 'Prepare Submission (6h)',
        description: 'Package plan for ministry',
        value: 'submit'
      });
    } else {
      actionOptions.push({
        label: 'Prepare Submission (BLOCKED)',
        description: 'All values must be ≥25% to submit',
        value: 'submit_blocked'
      });
    }
  }

  // Values workshop - now with tradeoffs (Phase 4.1)
  if (hoursLeft >= 3) {
    actionOptions.push({
      label: 'Values Workshop (3h)',
      description: 'Balance competing interests (tradeoffs required)',
      value: 'values'
    });
  }

  // Timber assessment (new - Phase 4.1)
  if (hoursLeft >= 3) {
    actionOptions.push({
      label: 'Timber Assessment (3h)',
      description: 'Assess timber supply (+timber, -biodiversity)',
      value: 'timber'
    });
  }

  // Quick actions (Phase 2.3)
  if (hoursLeft >= 1) {
    actionOptions.push({
      label: 'Check Email (1h)',
      description: 'Handle correspondence (random small effect)',
      value: 'email'
    });
  }

  if (hoursLeft >= 2) {
    actionOptions.push({
      label: 'Network (2h)',
      description: 'Build political capital',
      value: 'network'
    });
  }

  if (hoursLeft >= 2 && journey.protagonist) {
    actionOptions.push({
      label: 'Take a Break (2h)',
      description: 'Reduce stress, recover energy',
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
        ui.writePositive('Data phase complete! Moving to Analysis.');
      }
      break;

    case 'analyze':
      journey.plan.analysisQuality = Math.min(100, journey.plan.analysisQuality + 20);
      journey.hoursRemaining -= 4;
      applyProtagonistCost(journey, { energy: 15, stress: 10 });
      ui.write(`Analysis progressed. Quality: ${journey.plan.analysisQuality}%`);
      if (journey.plan.analysisQuality >= 80) {
        journey.plan.phase = 'stakeholder_review';
        ui.writePositive('Analysis complete! Moving to Stakeholder Review.');
      }
      break;

    case 'stakeholder':
      journey.plan.stakeholderBuyIn = Math.min(100, journey.plan.stakeholderBuyIn + 15);
      journey.resources.politicalCapital -= 5;
      journey.hoursRemaining -= 4;
      applyProtagonistCost(journey, { energy: 20, stress: 15 });
      if (journey.protagonist) {
        journey.protagonist.reputation = Math.min(100, journey.protagonist.reputation + 3);
      }
      ui.write(`Stakeholder buy-in improved to ${journey.plan.stakeholderBuyIn}%`);
      if (journey.plan.stakeholderBuyIn >= 75) {
        journey.plan.phase = 'ministerial_approval';
        ui.writePositive('Stakeholder review complete! Moving to Ministerial Approval.');
      }
      break;

    case 'stakeholder_blocked':
    case 'submit_blocked':
      ui.writeWarning('Cannot proceed. All four values (biodiversity, timber, community, First Nations) must be at least 25%.');
      ui.write('Use Values Workshop or Timber Assessment to rebalance.');
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

    case 'values': {
      // Values workshop with tradeoffs (Phase 4.1)
      const choices = [
        { label: 'Emphasize Biodiversity', description: '+8 bio, -3 timber', value: 'bio' },
        { label: 'Emphasize Timber Supply', description: '+8 timber, -3 bio', value: 'timber_v' },
        { label: 'Emphasize Community', description: '+8 community, -3 FN values', value: 'community' },
        { label: 'Emphasize First Nations', description: '+8 FN values, -3 community', value: 'fn' },
        { label: 'Balanced Approach (5h total)', description: '+3 all values', value: 'balanced' }
      ];
      const pick = await ui.promptChoice('Choose values focus:', choices);

      switch (pick.value) {
        case 'bio':
          journey.values.biodiversity = Math.min(100, journey.values.biodiversity + 8);
          journey.values.timberSupply = Math.max(0, journey.values.timberSupply - 3);
          break;
        case 'timber_v':
          journey.values.timberSupply = Math.min(100, journey.values.timberSupply + 8);
          journey.values.biodiversity = Math.max(0, journey.values.biodiversity - 3);
          break;
        case 'community':
          journey.values.communityNeeds = Math.min(100, journey.values.communityNeeds + 8);
          journey.values.firstNationsValues = Math.max(0, journey.values.firstNationsValues - 3);
          break;
        case 'fn':
          journey.values.firstNationsValues = Math.min(100, journey.values.firstNationsValues + 8);
          journey.values.communityNeeds = Math.max(0, journey.values.communityNeeds - 3);
          break;
        case 'balanced':
          journey.values.biodiversity = Math.min(100, journey.values.biodiversity + 3);
          journey.values.timberSupply = Math.min(100, journey.values.timberSupply + 3);
          journey.values.communityNeeds = Math.min(100, journey.values.communityNeeds + 3);
          journey.values.firstNationsValues = Math.min(100, journey.values.firstNationsValues + 3);
          journey.hoursRemaining -= 2; // Extra 2h for balanced (total 5h)
          break;
      }

      journey.hoursRemaining -= 3;
      applyProtagonistCost(journey, { energy: 10, stress: 5 });
      ui.write('Values workshop completed. Balance updated.');
      break;
    }

    case 'timber':
      // New timber assessment action (Phase 4.1)
      journey.values.timberSupply = Math.min(100, journey.values.timberSupply + 15);
      journey.values.biodiversity = Math.max(0, journey.values.biodiversity - 5);
      journey.hoursRemaining -= 3;
      applyProtagonistCost(journey, { energy: 10, stress: 5 });
      ui.write(`Timber supply assessment completed. Timber: ${journey.values.timberSupply}%, Biodiversity: ${journey.values.biodiversity}%`);
      break;

    case 'email': {
      // Quick email check with random effect (Phase 2.3)
      journey.hoursRemaining -= 1;
      applyProtagonistCost(journey, { energy: 3, stress: 2 });
      const roll = Math.random();
      if (roll < 0.3) {
        journey.plan.dataCompleteness = Math.min(100, journey.plan.dataCompleteness + 3);
        ui.write('Useful data attachment in an email. Data completeness +3%.');
      } else if (roll < 0.5) {
        journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 2);
        ui.write('Supportive email from a stakeholder. Political capital +2.');
      } else if (roll < 0.7) {
        applyProtagonistCost(journey, { energy: 0, stress: 5 });
        ui.write('Angry email from a licensee. Stress increased.');
      } else {
        ui.write('Nothing urgent in the inbox.');
      }
      break;
    }

    case 'network':
      journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 5);
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

function applyProtagonistCost(journey, costs) {
  if (!journey.protagonist) return;
  if (costs.energy) {
    journey.protagonist.energy = Math.max(0, journey.protagonist.energy - costs.energy);
  }
  if (costs.stress) {
    journey.protagonist.stress = Math.min(100, journey.protagonist.stress + costs.stress);
  }
}

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

  if (journey.protagonist && journey.protagonist.stress >= 100) {
    journey.isGameOver = true;
    journey.gameOverReason = 'Burnout - you need to step back from this project';
  }
}

async function handleEvent(game, event) {
  const { ui, journey } = game;
  const formatted = formatEventForDisplay(event, journey.journeyType);

  ui.write('');
  ui.writeHeader(`EVENT: ${formatted.title}`);
  ui.write(formatted.description);
  ui.write('');

  const options = formatted.options.map((opt, index) => {
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

function createBar(value, width) {
  const filled = Math.round((value / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
