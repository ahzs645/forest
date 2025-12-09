/**
 * BC Forestry Trail - Oregon Trail Style Game
 * Main game loop and orchestration
 */

import { TerminalUI } from './ui.js';
import { FORESTER_ROLES, OPERATING_AREAS } from './data/index.js';
import { generateCrew, processDailyUpdate, getCrewDisplayInfo, applyStatusEffect } from './crew.js';
import { createFieldJourney, createDeskJourney, executeFieldDay, executeDeskDay, PACE_OPTIONS, DESK_ACTIONS, getFieldProgressInfo, formatJourneyLog } from './journey.js';
import { checkForEvent, resolveEvent, formatEventForDisplay, checkScheduledEvents } from './events.js';
import { calculateFieldConsumption, calculateDeskConsumption, applyConsumption, checkResourceStatus, getFormattedResourceStatus, FIELD_RESOURCES, DESK_RESOURCES } from './resources.js';

class ForestryTrailGame {
  constructor() {
    this.ui = new TerminalUI();
    this.journey = null;
    this.gameOver = false;
    this.victory = false;
    this._restartConfirmOpen = false;

    this.ui.onRestartRequest(() => this._promptRestart());
    this.ui.onLogRequest(() => this._showLog());
    this._bindKeyboard();
  }

  _showLog() {
    if (!this.journey) {
      this.ui.showLog([]);
      return;
    }
    const logEntries = formatJourneyLog(this.journey);
    this.ui.showLog(logEntries);
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (this.ui.isModalOpen()) return;
        event.preventDefault();
        this._promptRestart();
      }
    });
  }

  _promptRestart() {
    if (this._restartConfirmOpen) return;
    this._restartConfirmOpen = true;

    this.ui.openModal({
      title: 'Abandon Expedition?',
      dismissible: true,
      onClose: () => { this._restartConfirmOpen = false; },
      buildContent: (container) => {
        const msg = document.createElement('p');
        msg.textContent = 'Starting over abandons your current crew and returns to role selection.';
        msg.style.marginTop = '0';
        container.appendChild(msg);
      },
      actions: [
        {
          label: 'Abandon',
          primary: true,
          onSelect: () => {
            this.ui.closeModal();
            this.gameOver = false;
            this.victory = false;
            this.start();
          }
        },
        {
          label: 'Continue',
          onSelect: () => { this.ui.closeModal(); }
        }
      ]
    });
  }

  async start() {
    this.ui.prepareForNewGame();
    this.ui.clear();
    this.gameOver = false;
    this.victory = false;

    // Title screen
    this.ui.writeHeader('BC FORESTRY TRAIL');
    this.ui.write('');
    this.ui.write('The year is 2024. You have been assigned to lead');
    this.ui.write('a forestry operation in northern British Columbia.');
    this.ui.write('');
    this.ui.write('Your decisions will determine whether your crew');
    this.ui.write('completes their mission... or faces disaster.');
    this.ui.write('');

    // Character creation
    const crewName = await this.ui.promptText('Name your crew:', 'The Timber Wolves');

    // Role selection
    this.ui.writeDivider('SELECT YOUR ROLE');
    const roleOptions = FORESTER_ROLES.map(role => ({
      label: role.name,
      description: role.description,
      value: role.id
    }));

    const roleChoice = await this.ui.promptChoice('What is your specialization?', roleOptions);
    const roleId = roleChoice.value || roleChoice.label.toLowerCase().replace(/\s+/g, '_');
    const role = FORESTER_ROLES.find(r => r.id === roleId) || FORESTER_ROLES[0];

    // Area selection
    this.ui.writeDivider('SELECT OPERATING AREA');
    const areaOptions = OPERATING_AREAS.map(area => ({
      label: area.name,
      description: area.description,
      value: area.id
    }));

    const areaChoice = await this.ui.promptChoice('Where will you operate?', areaOptions);
    const areaId = areaChoice.value || areaChoice.label.toLowerCase().replace(/\s+/g, '_');
    const area = OPERATING_AREAS.find(a => a.id === areaId) || OPERATING_AREAS[0];

    // Create journey based on role type
    const journeyType = role.journeyType || 'field';
    const crew = generateCrew(5, journeyType);

    if (journeyType === 'field') {
      this.journey = createFieldJourney({
        crewName,
        role,
        area,
        crew
      });
    } else {
      this.journey = createDeskJourney({
        crewName,
        role,
        area,
        crew
      });
    }

    // Show starting info
    this.ui.write('');
    this.ui.writeHeader(`${crewName.toUpperCase() || 'YOUR CREW'} - ${role.name}`);
    this.ui.write(`Operating Area: ${area.name}`);
    this.ui.write(`BEC Zone: ${area.becZone}`);
    if (area.dominantTrees?.length) {
      this.ui.write(`Dominant Species: ${area.dominantTrees.join(', ')}`);
    }
    this.ui.write('');

    // Show crew
    this.ui.writeDivider('YOUR CREW');
    for (const member of crew) {
      const info = getCrewDisplayInfo(member);
      this.ui.write(`${info.name} - ${info.role}`);
    }
    this.ui.write('');

    // Journey-specific intro
    if (journeyType === 'field') {
      this.ui.write(`Mission: Travel ${this.journey.totalDistance}km through ${this.journey.blocks.length} forest blocks.`);
      this.ui.write('Manage your fuel, food, and equipment. Keep your crew healthy.');
      this.ui.write('');
      this.ui.write('Starting supplies:');
      this.ui.write(`  Fuel: ${this.journey.resources.fuel} gallons`);
      this.ui.write(`  Food: ${this.journey.resources.food} days worth`);
      this.ui.write(`  Equipment: ${this.journey.resources.equipment}% condition`);
      this.ui.write(`  First Aid: ${this.journey.resources.firstAid} kits`);
    } else {
      this.ui.write(`Mission: Complete permit approvals within ${this.journey.deadline} days.`);
      this.ui.write(`Target: ${this.journey.permits.target} permits approved.`);
      this.ui.write('Manage your budget, political capital, and team energy.');
      this.ui.write('');
      this.ui.write('Starting resources:');
      this.ui.write(`  Budget: $${this.journey.resources.budget.toLocaleString()}`);
      this.ui.write(`  Political Capital: ${this.journey.resources.politicalCapital}`);
      this.ui.write(`  Daily Energy: ${this.journey.hoursRemaining} hours`);
    }

    await this.ui.promptChoice('Press any key to begin...', [{ label: 'Begin Journey', value: 'start' }]);

    // Main game loop
    await this._mainLoop();
  }

  async _mainLoop() {
    while (!this.gameOver && !this.victory) {
      // Update UI
      this.ui.updateAllStatus(this.journey);

      // Check for scheduled events first
      const scheduledEvent = checkScheduledEvents(this.journey);
      if (scheduledEvent) {
        await this._handleEvent(scheduledEvent);
        if (this.gameOver) break;
      }

      // Run daily phase
      if (this.journey.journeyType === 'field') {
        await this._runFieldDay();
      } else {
        await this._runDeskDay();
      }

      // Check end conditions
      this._checkEndConditions();
    }

    // Show end screen
    await this._showEndScreen();
  }

  async _runFieldDay() {
    const journey = this.journey;
    const currentBlock = journey.blocks[journey.currentBlockIndex];
    const progressInfo = getFieldProgressInfo(journey);

    this.ui.clear();
    this.ui.writeHeader(`DAY ${journey.day} - ${currentBlock?.name || 'Unknown Territory'}`);

    // Show current status with visual progress bar
    const progressBarWidth = 20;
    const filledWidth = Math.round((progressInfo.overallProgress / 100) * progressBarWidth);
    const progressBar = '█'.repeat(filledWidth) + '░'.repeat(progressBarWidth - filledWidth);

    this.ui.write(`Journey: [${progressBar}] ${progressInfo.overallProgress}%`);
    this.ui.write(`Distance: ${journey.distanceTraveled}/${journey.totalDistance} km`);
    this.ui.write(`Blocks: ${progressInfo.blocksCompleted}/${progressInfo.totalBlocks} completed`);
    if (progressInfo.nextBlock !== 'Destination') {
      this.ui.write(`Next stop: ${progressInfo.nextBlock} (${progressInfo.distanceToNextBlock} km away)`);
    } else {
      this.ui.write(`Final destination ahead!`);
    }
    this.ui.write('');
    this.ui.write(`Weather: ${journey.weather?.name || 'Clear'} | Terrain: ${currentBlock?.terrain || 'unknown'}`);
    this.ui.write('');

    // Show resources
    this.ui.writeDivider('SUPPLIES');
    const resourceStatus = getFormattedResourceStatus(journey.resources, FIELD_RESOURCES);
    for (const [key, status] of Object.entries(resourceStatus)) {
      const icon = status.level === 'critical' ? '!!' : status.level === 'low' ? '!' : ' ';
      this.ui.write(`${icon} ${status.label}: ${status.display}`);
    }
    this.ui.write('');

    // Show crew status
    this._displayCrewStatus();

    // Check for random event
    const event = checkForEvent(journey);
    if (event) {
      await this._handleEvent(event);
      if (this.gameOver) return;
    }

    // Daily action choice
    this.ui.writeDivider('WHAT DO YOU DO?');

    const paceOptions = Object.entries(PACE_OPTIONS)
      .filter(([id]) => id !== 'resting') // Resting handled separately
      .map(([id, pace]) => ({
        label: `Travel ${pace.name}`,
        description: `${Math.round(pace.distanceMultiplier * 100)}% speed`,
        value: id
      }));

    paceOptions.push({
      label: 'Rest here',
      description: 'Crew heals, morale improves',
      value: 'rest'
    });

    const action = await this.ui.promptChoice('Choose your action:', paceOptions);
    const actionId = action.value || 'normal';

    // Execute the day
    if (actionId === 'rest') {
      this.ui.write('');
      this.ui.write('The crew takes the day to rest and recover.');
      // Heal crew
      for (const member of journey.crew) {
        if (member.isActive) {
          member.health = Math.min(100, member.health + 10);
          member.morale = Math.min(100, member.morale + 15);
        }
      }
      // Light resource use
      journey.resources.food = Math.max(0, journey.resources.food - 1);
    } else {
      // Travel
      const result = executeFieldDay(journey, actionId);

      this.ui.write('');
      for (const msg of result.messages) {
        this.ui.write(msg);
      }

      // Apply resource consumption
      const activeCrewCount = journey.crew.filter(m => m.isActive).length;
      const consumption = calculateFieldConsumption({
        pace: actionId,
        terrain: currentBlock?.terrain,
        weather: journey.temperature,
        weatherCondition: journey.weather
      }, activeCrewCount);

      const consumptionResult = applyConsumption(journey.resources, consumption, FIELD_RESOURCES);
      journey.resources = consumptionResult.resources;

      if (consumptionResult.warnings.length > 0) {
        this.ui.write('');
        for (const warning of consumptionResult.warnings) {
          this.ui.writeWarning(warning);
        }
      }
    }

    // Update crew conditions
    this._updateCrewConditions();

    // Advance day only for rest (executeFieldDay already advances for travel)
    if (actionId === 'rest') {
      journey.day++;
    }

    // Small pause
    await this.ui.promptChoice('', [{ label: 'Continue...', value: 'next' }]);
  }

  async _runDeskDay() {
    const journey = this.journey;

    this.ui.clear();
    this.ui.writeHeader(`DAY ${journey.day} of ${journey.deadline} - ${journey.currentPhase.toUpperCase()}`);

    // Show progress
    const daysRemaining = journey.deadline - journey.day;
    const permitProgress = Math.round((journey.permits.approved / journey.permits.target) * 100);

    this.ui.write(`Days Remaining: ${daysRemaining}`);
    this.ui.write(`Permits: ${journey.permits.approved}/${journey.permits.target} approved (${permitProgress}%)`);
    this.ui.write(`Pipeline: ${journey.permits.submitted} submitted, ${journey.permits.inReview} in review`);
    this.ui.write('');

    // Show resources
    this.ui.writeDivider('RESOURCES');
    const deskResourceStatus = getFormattedResourceStatus(journey.resources, DESK_RESOURCES);
    for (const [key, status] of Object.entries(deskResourceStatus)) {
      const icon = status.level === 'critical' ? '!!' : status.level === 'low' ? '!' : ' ';
      this.ui.write(`${icon} ${status.label}: ${status.display}`);
    }
    this.ui.write(`   Hours Today: ${journey.hoursRemaining}`);
    this.ui.write('');

    // Show crew/team status
    this._displayCrewStatus();

    // Check for random event
    const event = checkForEvent(journey);
    if (event) {
      await this._handleEvent(event);
      if (this.gameOver) return;
    }

    // Daily action choice
    this.ui.writeDivider('DAILY PRIORITIES');

    const actionOptions = Object.entries(DESK_ACTIONS).map(([id, action]) => ({
      label: action.name,
      description: `${action.hoursRequired}h, ${action.description}`,
      value: id
    }));

    const action = await this.ui.promptChoice('How will you spend today?', actionOptions);
    const actionId = action.value || 'process_permits';

    // Execute the day
    const result = executeDeskDay(journey, actionId);

    this.ui.write('');
    for (const msg of result.messages) {
      this.ui.write(msg);
    }

    // Apply resource consumption
    const activeCrewCount = journey.crew.filter(m => m.isActive).length;
    const consumption = calculateDeskConsumption({
      daysRemaining,
      crewMorale: journey.crew.reduce((sum, m) => sum + (m.isActive ? m.morale : 0), 0) / activeCrewCount,
      hoursWorked: 8 - journey.hoursRemaining
    }, activeCrewCount);

    const consumptionResult = applyConsumption(journey.resources, consumption, DESK_RESOURCES);
    journey.resources = consumptionResult.resources;

    if (consumptionResult.warnings.length > 0) {
      this.ui.write('');
      for (const warning of consumptionResult.warnings) {
        this.ui.writeWarning(warning);
      }
    }

    // Update crew conditions
    this._updateCrewConditions();

    // Reset daily energy (day is advanced in executeDeskDay)
    journey.hoursRemaining = 8;

    // Small pause
    await this.ui.promptChoice('', [{ label: 'Continue...', value: 'next' }]);
  }

  async _handleEvent(event) {
    const formatted = formatEventForDisplay(event);

    this.ui.write('');
    this.ui.writeHeader(`EVENT: ${formatted.title}`);
    this.ui.write(event.description);
    this.ui.write('');

    // Build options with effect previews
    const options = formatted.options.map((opt, index) => ({
      label: opt.label,
      description: opt.hint ? `[${opt.hint}]` : '',
      value: index
    }));

    const choice = await this.ui.promptChoice('What do you do?', options);
    const optionIndex = typeof choice.value === 'number' ? choice.value : 0;
    const selectedOption = event.options[optionIndex];

    // Resolve event
    const result = resolveEvent(this.journey, event, selectedOption);

    this.ui.write('');
    for (const msg of result.messages) {
      this.ui.write(msg);
    }

    // Check for game-ending events
    if (selectedOption.gameOver) {
      this.gameOver = true;
      this.journey.endReason = selectedOption.gameOverReason || 'Event outcome';
    }
  }

  _displayCrewStatus() {
    // Only show brief crew summary in terminal (detailed view in side panel via [S])
    const activeCount = this.journey.crew.filter(m => m.isActive).length;
    const totalCount = this.journey.crew.length;
    const avgHealth = Math.round(
      this.journey.crew.filter(m => m.isActive).reduce((sum, m) => sum + m.health, 0) / activeCount
    );
    const injured = this.journey.crew.filter(m => m.isActive && m.statusEffects?.length > 0).length;

    this.ui.write(`Crew: ${activeCount}/${totalCount} active | Avg Health: ${avgHealth}%${injured > 0 ? ` | ${injured} injured` : ''}`);
    this.ui.write('(Press [S] for detailed crew status)');
    this.ui.write('');
  }

  _miniBar(value, width = 5) {
    const filled = Math.round((value / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }

  _updateCrewConditions() {
    const journey = this.journey;
    const conditions = {
      isResting: journey.pace === 'resting',
      hasFood: journey.journeyType === 'field' ? journey.resources.food > 0 : true,
      hasFirstAid: journey.journeyType === 'field' ? journey.resources.firstAid > 0 : true,
      weatherSeverity: journey.weather?.severity || 0
    };

    for (const member of journey.crew) {
      if (!member.isActive) continue;

      const update = processDailyUpdate(member, conditions);

      // Check for critical events
      if (update.died) {
        this.ui.writeWarning(`${member.name} has died from their injuries!`);
        member.isActive = false;
      } else if (update.incapacitated) {
        this.ui.writeWarning(`${member.name} is too injured to continue and must be evacuated!`);
        member.isActive = false;
      } else if (update.quit) {
        this.ui.writeWarning(`${member.name} has had enough and quit the expedition!`);
        member.isActive = false;
      }

      // Report recoveries
      for (const recovery of update.recovered) {
        this.ui.write(`${member.name} has recovered from ${recovery}.`);
      }
    }

    // Update crew count in UI
    this.ui.updateAllStatus(journey);
  }

  _checkEndConditions() {
    const journey = this.journey;
    const activeCrewCount = journey.crew.filter(m => m.isActive).length;

    // Universal: No crew left
    if (activeCrewCount === 0) {
      this.gameOver = true;
      journey.endReason = 'All crew members lost';
      return;
    }

    if (journey.journeyType === 'field') {
      // Victory: Reached destination
      if (journey.distanceTraveled >= journey.totalDistance) {
        this.victory = true;
        journey.endReason = 'Expedition completed!';
        return;
      }

      // Game over: Stranded (no fuel, no food)
      if (journey.resources.fuel <= 0 && journey.resources.food <= 0) {
        this.gameOver = true;
        journey.endReason = 'Stranded with no supplies';
        return;
      }

    } else {
      // Victory: Met permit target by deadline
      if (journey.permits.approved >= journey.permits.target) {
        this.victory = true;
        journey.endReason = 'Permit targets achieved!';
        return;
      }

      // Game over: Deadline passed
      if (journey.day > journey.deadline) {
        if (journey.permits.approved >= journey.permits.target * 0.8) {
          // Partial success
          this.victory = true;
          journey.endReason = 'Deadline reached with acceptable progress';
        } else {
          this.gameOver = true;
          journey.endReason = 'Failed to meet deadline';
        }
        return;
      }

      // Game over: Budget depleted
      if (journey.resources.budget <= 0) {
        this.gameOver = true;
        journey.endReason = 'Budget exhausted';
        return;
      }

      // Game over: Political capital gone (fired)
      if (journey.resources.politicalCapital <= 0) {
        this.gameOver = true;
        journey.endReason = 'Lost political support - removed from position';
        return;
      }
    }
  }

  async _showEndScreen() {
    this.ui.clear();

    if (this.victory) {
      this.ui.writeHeader('EXPEDITION SUCCESSFUL');
      this.ui.write('');
      this.ui.write(this.journey.endReason);
    } else {
      this.ui.writeHeader('EXPEDITION FAILED');
      this.ui.write('');
      this.ui.writeWarning(this.journey.endReason);
    }

    this.ui.write('');
    this.ui.writeDivider('FINAL STATISTICS');

    const journey = this.journey;

    if (journey.journeyType === 'field') {
      const progressPct = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
      this.ui.write(`Distance Traveled: ${journey.distanceTraveled}/${journey.totalDistance} km (${progressPct}%)`);
      this.ui.write(`Days Elapsed: ${journey.day - 1}`);
      this.ui.write(`Blocks Completed: ${journey.currentBlockIndex}/${journey.blocks.length}`);
    } else {
      this.ui.write(`Permits Approved: ${journey.permits.approved}/${journey.permits.target}`);
      this.ui.write(`Days Used: ${journey.day - 1}/${journey.deadline}`);
      this.ui.write(`Budget Remaining: $${journey.resources.budget.toLocaleString()}`);
    }

    this.ui.write('');
    this.ui.writeDivider('CREW FATE');

    for (const member of journey.crew) {
      const info = getCrewDisplayInfo(member);
      let fate;
      if (!member.isActive) {
        if (member.health <= 0) {
          fate = 'Died during expedition';
        } else if (member.morale <= 0) {
          fate = 'Quit the expedition';
        } else {
          fate = 'Evacuated for medical care';
        }
      } else if (this.victory) {
        fate = 'Completed the journey';
      } else {
        fate = 'Stranded';
      }
      this.ui.write(`${info.name} (${info.role}): ${fate}`);
    }

    // Show journey log highlights
    if (journey.log?.length > 0) {
      this.ui.write('');
      this.ui.writeDivider('KEY EVENTS');
      const highlights = journey.log.slice(-5);
      for (const entry of highlights) {
        this.ui.write(`Day ${entry.day}: ${entry.eventTitle || entry.type}`);
      }
    }

    this.ui.write('');
    this.ui.write('Press ESC to start a new expedition.');

    // Wait for restart
    await this.ui.promptChoice('', [{ label: 'New Expedition', value: 'restart' }]);
    this.start();
  }
}

// Initialize game on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const game = new ForestryTrailGame();
  game.start();
});
