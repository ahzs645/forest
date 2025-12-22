/**
 * BC Forestry Trail - Oregon Trail Style Game
 * Main game loop and orchestration
 */

import { TerminalUI } from './ui.js';
import { FORESTER_ROLES, OPERATING_AREAS } from './data/index.js';
import { generateCrew, processDailyUpdate, getCrewDisplayInfo, healCrewMember, removeStatusEffect, applyRandomInjury, crewHasRole } from './crew.js';
import { createFieldJourney, createDeskJourney, executeFieldDay, executeDeskDay, PACE_OPTIONS, DESK_ACTIONS, getFieldProgressInfo, formatJourneyLog } from './journey.js';
import { checkForEvent, resolveEvent, formatEventForDisplay, checkScheduledEvents } from './events.js';
import { calculateDeskConsumption, applyConsumption, applyDeskRegen, getFormattedResourceStatus, FIELD_RESOURCES, DESK_RESOURCES } from './resources.js';

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
      this.ui.write(`  Cash: $${this.journey.resources.budget.toLocaleString()}`);
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
      try {
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
      } catch (error) {
        console.error('Main loop error:', error);
        this.ui.writeDanger(`Error: ${error.message}. Please refresh to restart.`);
        break;
      }
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
    for (const [, status] of Object.entries(resourceStatus)) {
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

    const actionOptions = [];

    const canTravel = journey.resources.fuel > 0 && journey.resources.equipment > 0;

    if (canTravel) {
      // Travel actions
      for (const [id, pace] of Object.entries(PACE_OPTIONS)) {
        if (id === 'resting' || id === 'camp_work') continue;
        actionOptions.push({
          label: `Travel ${pace.name}`,
          description: `${Math.round(pace.distanceMultiplier * 100)}% pace`,
          value: id
        });
      }
    } else {
      this.ui.writeWarning('Travel is impossible without fuel and functioning equipment.');
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
      label: 'Maintenance Day (Camp Work)',
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

    const action = await this.ui.promptChoice('Choose your action:', actionOptions);
    const actionId = action.value || 'normal';

    this.ui.write('');

    // Execute the day (field updates, consumption, weather/day advancement all live in executeFieldDay)
    if (actionId === 'resupply') {
      await this._handleResupply(currentBlock);
      const result = executeFieldDay(journey, 'camp_work');
      for (const msg of result.messages) this.ui.write(msg);
    } else if (actionId === 'triage') {
      await this._handleTriage();
      const result = executeFieldDay(journey, 'camp_work');
      for (const msg of result.messages) this.ui.write(msg);
    } else if (actionId === 'maintain') {
      await this._handleMaintenance();
      const result = executeFieldDay(journey, 'camp_work');
      for (const msg of result.messages) this.ui.write(msg);
    } else if (actionId === 'forage') {
      const result = executeFieldDay(journey, 'camp_work');
      for (const msg of result.messages) this.ui.write(msg);
      this._applyForageResults();
    } else {
      const paceId = actionId;
      const result = executeFieldDay(journey, paceId);
      for (const msg of result.messages) this.ui.write(msg);
    }

    // Update status panels to reflect changes
    this.ui.updateAllStatus(this.journey);

    // Small pause
    await this.ui.promptChoice('', [{ label: 'Continue...', value: 'next' }]);
  }

  async _handleResupply(block) {
    const journey = this.journey;
    const cash = journey.resources.budget || 0;
    this.ui.writeHeader(`RESUPPLY: ${block?.name || 'Supply Point'}`);
    this.ui.write(`Cash on hand: $${Math.round(cash).toLocaleString()}`);
    this.ui.write('');

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

      const choice = await this.ui.promptChoice(`Buy supplies (cash: $${Math.round(money).toLocaleString()}):`, options);
      if (choice.value === 'done') break;

      const offer = offers.find(o => o.id === choice.value);
      if (!offer) continue;

      if (money < offer.cost) {
        this.ui.writeWarning('Not enough cash for that.');
        continue;
      }

      journey.resources.budget = Math.max(0, money - offer.cost);
      offer.apply();
      this.ui.writePositive(`Purchased ${offer.label}.`);
    }

    this.ui.write('');
  }

  async _handleTriage() {
    const journey = this.journey;
    if ((journey.resources.firstAid || 0) <= 0) {
      this.ui.writeWarning('No first aid kits left.');
      return;
    }

    const candidates = journey.crew.filter(m => m.isActive && (m.health < 100 || (m.statusEffects?.length || 0) > 0));
    if (candidates.length === 0) {
      this.ui.write('Nobody needs treatment today.');
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

    const choice = await this.ui.promptChoice('Treat who?', options);
    const target = journey.crew.find(m => m.id === choice.value);
    if (!target || !target.isActive) return;

    journey.resources.firstAid = Math.max(0, (journey.resources.firstAid || 0) - 1);

    if ((target.statusEffects?.length || 0) > 0) {
      const effectId = target.statusEffects[0].effectId;
      const removed = removeStatusEffect(target, effectId);
      if (removed.message) this.ui.writePositive(removed.message);
      const healed = healCrewMember(target, 15);
      if (healed.message) this.ui.writePositive(healed.message);
    } else {
      const healed = healCrewMember(target, 25);
      if (healed.message) this.ui.writePositive(healed.message);
    }
  }

  async _handleMaintenance() {
    const journey = this.journey;
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

    const choice = await this.ui.promptChoice('How do you handle maintenance?', options);

    if (choice.value === 'pro') {
      if (cash < 250) {
        this.ui.writeWarning('Not enough cash to hire a mechanic.');
        return;
      }
      journey.resources.budget = Math.max(0, cash - 250);
      journey.resources.equipment = Math.min(100, journey.resources.equipment + 25);
      this.ui.writePositive('Equipment serviced and patched up.');
      return;
    }

    // DIY maintenance
    const bonus = hasMechanic ? 14 : 10;
    journey.resources.equipment = Math.min(100, journey.resources.equipment + bonus);
    this.ui.writePositive('You tighten bolts, swap filters, and grease fittings.');

    if (Math.random() < 0.10) {
      const victim = journey.crew.find(m => m.isActive) || null;
      if (victim) {
        const result = applyRandomInjury(victim, 'minor');
        this.ui.writeWarning(`Accident during maintenance! ${result.message}`);
      }
    }
  }

  _applyForageResults() {
    const journey = this.journey;
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

    this.ui.write('');
    this.ui.writeHeader('FORAGE RESULTS');
    this.ui.writePositive(`Found food: +${foodFound} rations`);
    if (fuelFound > 0) this.ui.writePositive(`Recovered fuel: +${fuelFound} gallons`);
    if (cashFound > 0) this.ui.writePositive(`Sold salvage: +$${cashFound.toLocaleString()}`);

    if (Math.random() < 0.12) {
      const activeCrew = journey.crew.filter(m => m.isActive);
      const victim = activeCrew.length ? activeCrew[Math.floor(Math.random() * activeCrew.length)] : null;
      if (victim) {
        const injury = applyRandomInjury(victim, 'minor');
        this.ui.writeWarning(`Foraging accident! ${injury.message}`);
      }
    }
  }

  async _runDeskDay() {
    const journey = this.journey;
    const daysRemaining = journey.deadline - journey.day;
    let meetingsToday = 0;
    let crisisMode = daysRemaining <= 5;

    // Check for random event at start of day
    const event = checkForEvent(journey);
    if (event) {
      this.ui.clear();
      this.ui.writeHeader(`DAY ${journey.day} of ${journey.deadline} - ${journey.currentPhase.toUpperCase()}`);
      await this._handleEvent(event);
      if (this.gameOver) return;
    }

    // Inner loop: multiple actions per day until hours run out
    while (journey.hoursRemaining > 0) {
      this.ui.clear();
      this.ui.writeHeader(`DAY ${journey.day} of ${journey.deadline} - ${journey.currentPhase.toUpperCase()}`);

      // Show progress
      const permitProgress = Math.round((journey.permits.approved / journey.permits.target) * 100);
      this.ui.write(`Days Remaining: ${journey.deadline - journey.day}`);
      this.ui.write(`Permits: ${journey.permits.approved}/${journey.permits.target} approved (${permitProgress}%)`);
      const backlog = journey.permits.backlog || 0;
      this.ui.write(`Pipeline: ${journey.permits.submitted} submitted, ${journey.permits.inReview} in review, ${journey.permits.needsRevision} revisions, ${backlog} backlog`);
      this.ui.write('');

      // Show resources
      this.ui.writeDivider('RESOURCES');
      const deskResourceStatus = getFormattedResourceStatus(journey.resources, DESK_RESOURCES);
      for (const [, status] of Object.entries(deskResourceStatus)) {
        const icon = status.level === 'critical' ? '!!' : status.level === 'low' ? '!' : ' ';
        this.ui.write(`${icon} ${status.label}: ${status.display}`);
      }
      this.ui.write(`   Hours Remaining: ${journey.hoursRemaining}`);
      this.ui.write('');

      // Show crew/team status
      this._displayCrewStatus();

      if (journey.resources.energy <= 0) {
        this.ui.writeWarning('The team is exhausted. You end the day early.');
        break;
      }

      // Build action options - only show actions we have time for
      this.ui.writeDivider('WHAT DO YOU DO?');

      const actionOptions = Object.entries(DESK_ACTIONS)
        .filter(([, action]) => action.hoursRequired <= journey.hoursRemaining)
        .map(([id, action]) => ({
          label: action.name,
          description: `${action.hoursRequired}h - ${action.description}`,
          value: id
        }));

      // Always add "End Day Early" option
      actionOptions.push({
        label: 'End Day Early',
        description: 'Rest and start fresh tomorrow',
        value: 'end_day'
      });

      const action = await this.ui.promptChoice(`${journey.hoursRemaining} hours remaining:`, actionOptions);
      const actionId = action.value || 'end_day';

      // End day early
      if (actionId === 'end_day') {
        this.ui.write('');
        this.ui.write('You call it a day and head home to rest.');
        break;
      }

      // Execute the action (action functions handle hour deduction internally)
      let result;
      try {
        result = executeDeskDay(journey, actionId);
      } catch (error) {
        console.error('Action execution error:', error);
        this.ui.writeDanger(`Error executing action: ${error.message}`);
        continue;
      }

      this.ui.write('');
      if (result && result.messages) {
        for (const msg of result.messages) {
          this.ui.write(msg);
        }
      }

      if (actionId === 'stakeholder_meeting') {
        meetingsToday += 1;
      }
      if (actionId === 'crisis_management') {
        crisisMode = true;
      }

      // Update status panels
      this.ui.updateAllStatus(this.journey);

      // Brief pause between actions
      if (journey.hoursRemaining > 0) {
        await this.ui.promptChoice('', [{ label: 'Continue working...', value: 'next' }]);
      }
    }

    // End of day processing
    this.ui.write('');
    this.ui.write('--- End of Day ---');

    try {
      // Apply daily resource consumption
      const consumption = calculateDeskConsumption({
        meetings: meetingsToday,
        crisisMode
      });

      const consumptionResult = applyConsumption(journey.resources, consumption, DESK_RESOURCES);
      journey.resources = applyDeskRegen(consumptionResult.resources);

      if (consumptionResult.warnings.length > 0) {
        for (const warning of consumptionResult.warnings) {
          // Format warning object as string
          this.ui.writeWarning(`${warning.resource}: ${warning.value} ${warning.unit} remaining`);
        }
      }

      // Update crew conditions
      this._updateCrewConditions();

      // Advance to next day
      journey.day++;
      journey.hoursRemaining = 8;
      journey.currentPhase = this._getDeskPhase(journey);

      // Update status panels
      this.ui.updateAllStatus(this.journey);
    } catch (error) {
      console.error('End of day processing error:', error);
      this.ui.writeDanger('An error occurred. Please try again.');
    }

    // Pause before next day
    await this.ui.promptChoice('', [{ label: 'Start next day...', value: 'next' }]);
  }

  async _handleEvent(event) {
    const formatted = formatEventForDisplay(event, this.journey?.journeyType);

    this.ui.write('');
    this.ui.writeHeader(`EVENT: ${formatted.title}`);
    this.ui.write(event.description);
    this.ui.write('');

    // Build options with effect previews
    const options = formatted.options.map((opt, index) => {
      const raw = event.options[index] || {};
      const requirement = raw.requiresRole ? `Requires ${this._formatRoleName(raw.requiresRole)}` : '';
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
      const choice = await this.ui.promptChoice('What do you do?', options);
      const optionIndex = typeof choice.value === 'number' ? choice.value : 0;
      const candidate = event.options[optionIndex];
      if (candidate?.requiresRole && !crewHasRole(this.journey.crew, candidate.requiresRole)) {
        this.ui.writeWarning(`You need a ${this._formatRoleName(candidate.requiresRole)} to do that.`);
        continue;
      }
      selectedOption = candidate;
    }

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
    const activeCrew = this.journey.crew.filter(m => m.isActive);
    const activeCount = activeCrew.length;
    const totalCount = this.journey.crew.length;
    const avgHealth = activeCount > 0
      ? Math.round(activeCrew.reduce((sum, m) => sum + m.health, 0) / activeCount)
      : 0;
    const injured = activeCrew.filter(m => m.statusEffects?.length > 0).length;

    this.ui.write(`Crew: ${activeCount}/${totalCount} active | Avg Health: ${avgHealth}%${injured > 0 ? ` | ${injured} injured` : ''}`);
    this.ui.write('(Press [S] for detailed crew status)');
    this.ui.write('');
  }

  _getDeskPhase(journey) {
    const day = journey.day;
    const deadline = journey.deadline || 30;
    const phaseLength = Math.max(1, Math.floor(deadline / 3));

    if (day > deadline - 4) return 'crunch';
    if (day > phaseLength * 2) return 'approval';
    if (day > phaseLength) return 'review';
    return 'planning';
  }

  _formatRoleName(roleId) {
    if (!roleId) return 'specialist';
    const formatted = roleId.replace(/[_-]+/g, ' ').trim();
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  _miniBar(value, width = 5) {
    const filled = Math.round((value / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }

  _updateCrewConditions() {
    const journey = this.journey;
    const conditions = {
      restDay: journey.journeyType === 'desk' || journey.pace === 'resting',
      gruelingPace: journey.pace === 'grueling',
      lowFood: journey.journeyType === 'field' ? journey.resources.food <= 0 : false,
      coldWeather: journey.journeyType === 'field' && (journey.temperature === 'cold' || journey.temperature === 'freezing'),
      shelter: journey.journeyType === 'desk'
    };

    for (const member of journey.crew) {
      if (!member.isActive) continue;

      // Track state before update
      const wasAlive = !member.isDead;
      const wasActive = !member.hasQuit;

      const update = processDailyUpdate(member, conditions);

      // Check for death (processDailyUpdate sets member.isDead = true)
      if (wasAlive && member.isDead) {
        this.ui.writeWarning(`${member.name} has died from their injuries!`);
      }
      // Check for quitting (processDailyUpdate sets member.hasQuit = true)
      else if (wasActive && member.hasQuit) {
        this.ui.writeWarning(`${member.name} has had enough and quit the expedition!`);
      }

      // Report any messages (recoveries, status changes, etc.)
      if (update.messages && update.messages.length > 0) {
        for (const msg of update.messages) {
          this.ui.write(msg);
        }
      }
    }

    // Update crew count in UI
    this.ui.updateAllStatus(journey);
  }

  _checkEndConditions() {
    const journey = this.journey;
    const activeCrewCount = journey.crew.filter(m => m.isActive).length;

    if (journey.isGameOver) {
      this.gameOver = true;
      journey.endReason = journey.gameOverReason || 'Operations halted';
      return;
    }

    if (journey.isComplete) {
      this.victory = true;
      journey.endReason = journey.endReason || 'Expedition completed!';
      return;
    }

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
