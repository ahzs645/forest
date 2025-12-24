/**
 * Permitting Mode Runner
 * Protagonist-based permit processing and stakeholder management
 * YOU are the Permitting Specialist - no crew, just pipeline and relationships
 */

import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
import { calculateDeskConsumption, applyConsumption, applyDeskRegen, getFormattedResourceStatus, DESK_RESOURCES } from '../resources.js';
import { executeDeskDay, DESK_ACTIONS } from '../journey.js';

/**
 * Run a permitting day (permit processing with referral tracking)
 * @param {Object} game - Game instance
 */
export async function runPermittingDay(game) {
  const { ui, journey } = game;
  const daysRemaining = journey.deadline - journey.day;
  let meetingsToday = 0;
  let crisisMode = daysRemaining <= 5;

  // Check for random event at start of day
  const event = checkForEvent(journey);
  if (event) {
    ui.clear();
    ui.writeHeader(`DAY ${journey.day} of ${journey.deadline} - ${(journey.currentPhase || 'PERMITTING').toUpperCase()}`);
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  // Inner loop: multiple actions per day until hours run out
  while (journey.hoursRemaining > 0) {
    ui.clear();
    ui.writeHeader(`DAY ${journey.day} of ${journey.deadline} - PERMITTING`);

    // Show protagonist status if using protagonist model
    if (journey.protagonist) {
      displayProtagonistStatus(ui, journey.protagonist);
    }

    // Show permit pipeline
    const permitProgress = Math.round((journey.permits.approved / journey.permits.target) * 100);
    ui.writeDivider('PERMIT PIPELINE');
    ui.write(`Days Remaining: ${journey.deadline - journey.day}`);
    ui.write(`Target: ${journey.permits.approved}/${journey.permits.target} approved (${permitProgress}%)`);
    ui.write('');

    const backlog = journey.permits.backlog || 0;
    const inReferral = journey.permits.inReferral || 0;
    ui.write(`Pipeline Status:`);
    ui.write(`  Backlog: ${backlog} | Drafting: ${journey.permits.drafting || 0}`);
    ui.write(`  Submitted: ${journey.permits.submitted} | In Referral: ${inReferral}`);
    ui.write(`  In Review: ${journey.permits.inReview} | Needs Revision: ${journey.permits.needsRevision}`);
    ui.write('');

    // Show relationships (protagonist mode)
    if (journey.relationships) {
      ui.writeDivider('STAKEHOLDER RELATIONSHIPS');
      ui.write(`Ministry: ${journey.relationships.ministry}%`);
      ui.write(`First Nations: ${journey.relationships.nations}%`);
      ui.write(`Agencies: ${journey.relationships.agencies}%`);
      ui.write('');
    }

    // Show resources
    ui.writeDivider('RESOURCES');
    const deskResourceStatus = getFormattedResourceStatus(journey.resources, DESK_RESOURCES);
    for (const [, status] of Object.entries(deskResourceStatus)) {
      const icon = status.level === 'critical' ? '!!' : status.level === 'low' ? '!' : ' ';
      ui.write(`${icon} ${status.label}: ${status.display}`);
    }
    ui.write(`   Hours Remaining: ${journey.hoursRemaining}`);
    ui.write('');

    // Check protagonist energy
    if (journey.protagonist && journey.protagonist.energy <= 0) {
      ui.writeWarning('You are exhausted. Taking the rest of the day to recover.');
      break;
    }

    // Legacy energy check
    if (!journey.protagonist && journey.resources.energy <= 0) {
      ui.writeWarning('You are exhausted. The day ends early.');
      break;
    }

    // Build action options
    ui.writeDivider('WHAT DO YOU DO?');

    const actionOptions = buildActionOptions(journey);

    const action = await ui.promptChoice(`${journey.hoursRemaining} hours remaining:`, actionOptions);
    const actionId = action.value || 'end_day';

    // End day early
    if (actionId === 'end_day') {
      ui.write('');
      ui.write('You call it a day and head home to rest.');
      break;
    }

    // Execute the action
    await processAction(game, actionId);

    if (actionId === 'stakeholder_meeting') {
      meetingsToday += 1;
    }
    if (actionId === 'crisis_management') {
      crisisMode = true;
    }

    // Update status panels
    ui.updateAllStatus(journey);

    // Brief pause between actions
    if (journey.hoursRemaining > 0) {
      await ui.promptChoice('', [{ label: 'Continue working...', value: 'next' }]);
    }
  }

  // End of day processing
  await endOfDayProcessing(game, meetingsToday, crisisMode);
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

  // Expertise (if available)
  if (protagonist.expertise) {
    const skills = Object.entries(protagonist.expertise)
      .map(([skill, value]) => `${capitalize(skill)}: ${value}`)
      .join(' | ');
    ui.write(`Expertise: ${skills}`);
  }

  ui.write('');
}

/**
 * Build action options based on journey state
 * @param {Object} journey - Journey state
 * @returns {Array} Action options
 */
function buildActionOptions(journey) {
  const actionOptions = [];
  const hoursLeft = journey.hoursRemaining || 8;

  // Permit-specific actions
  if (journey.permits.backlog > 0 && hoursLeft >= 2) {
    actionOptions.push({
      label: 'Draft Permit Application',
      description: '2h - Move a permit from backlog to drafting',
      value: 'draft_permit'
    });
  }

  if ((journey.permits.drafting || 0) > 0 && hoursLeft >= 2) {
    actionOptions.push({
      label: 'Submit Permit',
      description: '2h - Submit a drafted permit for review',
      value: 'submit_permit'
    });
  }

  if (journey.permits.needsRevision > 0 && hoursLeft >= 3) {
    actionOptions.push({
      label: 'Address Revisions',
      description: '3h - Fix issues on returned permits',
      value: 'revise_permit'
    });
  }

  // Referral management (permitting-specific)
  if ((journey.permits.inReferral || 0) > 0 && hoursLeft >= 2) {
    actionOptions.push({
      label: 'Follow Up on Referrals',
      description: '2h - Check status with referral agencies',
      value: 'follow_up_referrals'
    });
  }

  // Standard desk actions
  const standardActions = Object.entries(DESK_ACTIONS)
    .filter(([, action]) => action.hoursRequired <= hoursLeft)
    .map(([id, action]) => ({
      label: action.name,
      description: `${action.hoursRequired}h - ${action.description}`,
      value: id
    }));

  actionOptions.push(...standardActions);

  // Protagonist-specific actions
  if (journey.protagonist && hoursLeft >= 1) {
    actionOptions.push({
      label: 'Take a Break',
      description: '1h - Reduce stress, recover energy',
      value: 'rest'
    });
  }

  // Always add "End Day Early" option
  actionOptions.push({
    label: 'End Day Early',
    description: 'Rest and start fresh tomorrow',
    value: 'end_day'
  });

  return actionOptions;
}

/**
 * Process a selected action
 * @param {Object} game - Game instance
 * @param {string} actionId - Selected action ID
 */
async function processAction(game, actionId) {
  const { ui, journey } = game;

  // Permit-specific actions
  switch (actionId) {
    case 'draft_permit':
      if (journey.permits.backlog > 0) {
        journey.permits.backlog--;
        journey.permits.drafting = (journey.permits.drafting || 0) + 1;
        journey.hoursRemaining -= 2;
        applyProtagonistCost(journey, { energy: 8, stress: 5 });
        ui.write('Permit application drafted and ready for submission.');
      }
      return;

    case 'submit_permit':
      if ((journey.permits.drafting || 0) > 0) {
        journey.permits.drafting--;
        journey.permits.submitted++;
        journey.hoursRemaining -= 2;
        applyProtagonistCost(journey, { energy: 5, stress: 3 });

        // Some permits go to referral, some to direct review
        if (Math.random() < 0.3) {
          journey.permits.inReferral = (journey.permits.inReferral || 0) + 1;
          journey.permits.submitted--;
          ui.write('Permit submitted - sent for First Nations referral.');
        } else {
          ui.write('Permit submitted for ministry review.');
        }
      }
      return;

    case 'revise_permit':
      if (journey.permits.needsRevision > 0) {
        journey.permits.needsRevision--;
        journey.permits.submitted++;
        journey.hoursRemaining -= 3;
        applyProtagonistCost(journey, { energy: 12, stress: 8 });
        ui.write('Permit revisions completed and resubmitted.');
      }
      return;

    case 'follow_up_referrals':
      const referrals = journey.permits.inReferral || 0;
      if (referrals > 0) {
        journey.hoursRemaining -= 2;
        applyProtagonistCost(journey, { energy: 6, stress: 4 });

        // Chance to advance referrals
        if (Math.random() < 0.5) {
          journey.permits.inReferral--;
          journey.permits.inReview++;
          if (journey.relationships) {
            journey.relationships.nations = Math.min(100, journey.relationships.nations + 3);
          }
          ui.write('Referral complete - permit moved to ministry review.');
        } else {
          ui.write('Referral still in progress. Maintained good communication.');
          if (journey.relationships) {
            journey.relationships.nations = Math.min(100, journey.relationships.nations + 1);
          }
        }
      }
      return;

    case 'rest':
      if (journey.protagonist) {
        journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 15);
        journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 10);
      }
      journey.hoursRemaining -= 1;
      ui.write('You take a short break. Feeling a bit better.');
      return;

    default:
      // Fall through to standard desk actions
      break;
  }

  // Standard desk action handling
  try {
    const result = executeDeskDay(journey, actionId);
    applyProtagonistCost(journey, { energy: 10, stress: 5 });

    ui.write('');
    if (result && result.messages) {
      for (const msg of result.messages) {
        ui.write(msg);
      }
    }
  } catch (error) {
    console.error('Action execution error:', error);
    ui.writeDanger(`Error executing action: ${error.message}`);
  }
}

/**
 * Apply protagonist costs
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
 * End of day processing
 * @param {Object} game - Game instance
 * @param {number} meetingsToday - Number of meetings held
 * @param {boolean} crisisMode - Whether in crisis mode
 */
async function endOfDayProcessing(game, meetingsToday, crisisMode) {
  const { ui, journey } = game;

  ui.write('');
  ui.write('--- End of Day ---');

  try {
    // Process permit pipeline (automatic advancement)
    processPermitPipeline(ui, journey);

    // Apply daily resource consumption (legacy support)
    if (!journey.protagonist) {
      const consumption = calculateDeskConsumption({
        meetings: meetingsToday,
        crisisMode
      });

      const consumptionResult = applyConsumption(journey.resources, consumption, DESK_RESOURCES);
      journey.resources = applyDeskRegen(consumptionResult.resources);

      if (consumptionResult.warnings.length > 0) {
        for (const warning of consumptionResult.warnings) {
          ui.writeWarning(`${warning.resource}: ${warning.value} ${warning.unit} remaining`);
        }
      }
    }

    // Protagonist recovery
    if (journey.protagonist) {
      journey.protagonist.energy = Math.min(100, journey.protagonist.energy + 25);
      journey.protagonist.stress = Math.max(0, journey.protagonist.stress - 8);
    }

    // Advance to next day
    journey.day++;
    journey.hoursRemaining = 8;
    journey.currentPhase = getDeskPhase(journey);

    // Update status panels
    ui.updateAllStatus(journey);
  } catch (error) {
    console.error('End of day processing error:', error);
    ui.writeDanger('An error occurred. Please try again.');
  }

  // Pause before next day
  await ui.promptChoice('', [{ label: 'Start next day...', value: 'next' }]);
}

/**
 * Process permit pipeline - automatic advancement
 * @param {Object} ui - UI instance
 * @param {Object} journey - Journey state
 */
function processPermitPipeline(ui, journey) {
  // Submitted permits may advance to inReview
  if (journey.permits.submitted > 0) {
    const advancing = Math.floor(journey.permits.submitted * 0.3);
    if (advancing > 0) {
      journey.permits.submitted -= advancing;
      journey.permits.inReview += advancing;
      ui.write(`${advancing} permit(s) moved to active review.`);
    }
  }

  // InReview permits may be approved or need revision
  if (journey.permits.inReview > 0) {
    const reviewed = Math.ceil(journey.permits.inReview * 0.4);
    const approved = Math.floor(reviewed * 0.7);
    const revisions = reviewed - approved;

    if (approved > 0) {
      journey.permits.inReview -= approved;
      journey.permits.approved += approved;
      ui.writePositive(`${approved} permit(s) APPROVED!`);
    }
    if (revisions > 0) {
      journey.permits.inReview -= revisions;
      journey.permits.needsRevision += revisions;
      ui.writeWarning(`${revisions} permit(s) returned for revision.`);
    }
  }
}

/**
 * Get current desk phase based on day
 * @param {Object} journey - Journey state
 * @returns {string} Phase name
 */
function getDeskPhase(journey) {
  const day = journey.day;
  const deadline = journey.deadline || 30;
  const phaseLength = Math.max(1, Math.floor(deadline / 3));

  if (day > deadline - 4) return 'crunch';
  if (day > phaseLength * 2) return 'approval';
  if (day > phaseLength) return 'review';
  return 'planning';
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
