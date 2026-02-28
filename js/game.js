/**
 * BC Forestry Trail - Oregon Trail Style Game
 * Main game loop and orchestration
 *
 * This is the slim orchestrator that delegates to mode-specific runners.
 */

import { TerminalUI } from './ui.js';
import { FORESTER_ROLES, OPERATING_AREAS } from './data/index.js';
import { generateCrew, generateCrewMember, processDailyUpdate, getCrewDisplayInfo, crewHasRole, awardCrewExperience } from './crew.js';
import { FIELD_ROLES, DESK_ROLES } from './data/crewNames.js';
import {
  createJourney,
  formatJourneyLog,
  FIELD_SHIFT_HOURS
} from './journey.js';
import { checkScheduledEvents, formatEventForDisplay, resolveEvent } from './events.js';
import { getCurrentSeasonInfo } from './season.js';
import { calculateScore, formatScoreDisplay, getRunningGrade, saveHighScore, getHighScores } from './scoring.js';
import { resetFieldEventCooldowns } from './data/fieldEvents.js';
import { resetDeskEventCooldowns } from './data/deskEvents.js';
import { getRandomWeather } from './data/blocks.js';

// Import mode runners
import { runReconDay } from './modes/recon.js';
import { runSilvicultureDay } from './modes/silviculture.js';
import { runPlanningDay } from './modes/planning.js';
import { runPermittingDay } from './modes/permitting.js';

// Import display mode manager
import { displayMode } from './displayMode.js';

/**
 * Apply difficulty multipliers to journey resources
 * @param {Object} journey - Journey state
 * @param {string} difficulty - 'easy', 'normal', or 'hard'
 */
function applyDifficultyMultipliers(journey, difficulty) {
  if (difficulty === 'normal') return;

  const resourceMult = difficulty === 'easy' ? 1.3 : 0.8;
  const r = journey.resources;

  for (const key of Object.keys(r)) {
    if (typeof r[key] === 'number') {
      r[key] = Math.round(r[key] * resourceMult);
    }
  }

  // Easy: crew is more resilient, won't quit unless morale is very low
  if (difficulty === 'easy') {
    journey.crewQuitThreshold = 5; // only quit below 5 morale
    journey.eventFrequencyMod = 0.7; // fewer events
  }

  // Hard: crew quits easier, more events, tighter deadlines
  if (difficulty === 'hard') {
    journey.crewQuitThreshold = 20; // quit below 20 morale
    journey.eventFrequencyMod = 1.4; // more events
    if (journey.deadline) {
      journey.deadline = Math.max(15, journey.deadline - 5); // tighter deadline
    }
  }
}

class ForestryTrailGame {
  constructor() {
    // Apply display mode early (before UI renders)
    displayMode.apply();

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

    // Create promise that can be resolved either by UI method or fallback event
    const init = await new Promise((resolve) => {
      // Listen for fallback custom event
      const handleFallback = (e) => {
        window.removeEventListener('initFlowComplete', handleFallback);
        resolve(e.detail);
      };
      window.addEventListener('initFlowComplete', handleFallback);

      // Start the initialization flow
      this.ui.runInitializationFlow({
        defaultCrewName: 'The Timber Wolves',
        roles: FORESTER_ROLES,
        areas: OPERATING_AREAS
      }).then(resolve);
    });

    const crewName = init?.crewName || 'The Timber Wolves';
    const role = init?.role || FORESTER_ROLES[0];
    const area = init?.area || OPERATING_AREAS[0];

    // Difficulty selection (Phase 6.3)
    this.ui.clear();
    this.ui.writeHeader('SELECT DIFFICULTY');
    this.ui.write('Choose your challenge level:');
    this.ui.write('');
    const difficultyChoice = await this.ui.promptChoice('Difficulty:', [
      { label: 'Greenhorn (Easy)', description: 'More resources, fewer events. Learn the ropes.', value: 'easy' },
      { label: 'Journeyman (Normal)', description: 'Standard challenge. Balanced experience.', value: 'normal' },
      { label: 'Old Growth (Hard)', description: 'Fewer resources, more events. For veterans.', value: 'hard' }
    ]);
    const difficulty = difficultyChoice.value || 'normal';

    this.ui.clear();
    this.ui.writeHeader('BC FORESTRY OPERATIONS SYSTEM');
    this.ui.write('System online. Deployment package confirmed.');
    this.ui.write('');
    this.ui.write(`Crew Handle: ${crewName}`);
    this.ui.write(`Role: ${role.name}`);
    this.ui.write(`Operating Area: ${area.name}`);
    this.ui.write(`BEC Zone: ${area.becZone}`);
    const diffLabel = difficulty === 'easy' ? 'Greenhorn' : difficulty === 'hard' ? 'Old Growth' : 'Journeyman';
    this.ui.write(`Difficulty: ${diffLabel}`);
    this.ui.write('');

    // Reset event cooldowns for new game
    resetFieldEventCooldowns();
    resetDeskEventCooldowns();

    // Crew selection — player picks 5 from available roles
    const legacyJourneyType = role.journeyType || 'field';
    const isFieldRole = legacyJourneyType === 'field';
    const availableRoles = isFieldRole ? FIELD_ROLES : DESK_ROLES;

    // Only offer crew selection for journey types that have crew
    const protagonistModes = ['planning', 'permitting'];
    const isProtagonist = protagonistModes.includes(role.id === 'planner' ? 'planning' : role.id === 'permitter' ? 'permitting' : '');
    let crew;

    if (isProtagonist) {
      crew = []; // Protagonist modes have no crew
    } else {
      this.ui.clear();
      this.ui.writeHeader('ASSEMBLE YOUR CREW');
      this.ui.write('Choose 5 crew members from the available roster.');
      this.ui.write('Each role provides unique skills. Choose wisely.');
      this.ui.write('');

      const selectedRoles = [];
      for (let pick = 1; pick <= 5; pick++) {
        const roleOptions = availableRoles.map(r => ({
          label: `${r.name}`,
          description: `${r.description} | Skills: ${r.skills.join(', ')}`,
          value: r.id
        }));

        const picked = await this.ui.promptChoice(
          `Pick crew member ${pick}/5:`,
          roleOptions
        );

        const chosenRole = availableRoles.find(r => r.id === picked.value);
        const member = generateCrewMember(legacyJourneyType, chosenRole);
        // Ensure unique names
        while (selectedRoles.some(m => m.name === member.name)) {
          const names = ['Riley', 'Jordan', 'Casey', 'Morgan', 'Taylor', 'Alex', 'Quinn', 'Drew', 'Sage', 'Blake', 'Robin', 'Dana'];
          member.name = names[Math.floor(Math.random() * names.length)];
        }
        selectedRoles.push(member);
        this.ui.write(`  ${pick}. ${member.name} — ${chosenRole.name} (Health: ${member.health}, Morale: ${member.morale})`);
      }
      crew = selectedRoles;
      this.ui.write('');
      this.ui.write('Crew assembled. Preparing deployment...');
      this.ui.write('');
    }

    this.journey = createJourney({
      crewName,
      role,
      area,
      crew
    });

    // Apply difficulty multipliers
    this.journey.difficulty = difficulty;
    applyDifficultyMultipliers(this.journey, difficulty);

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

    // Journey-specific intro based on journey type
    this._showJourneyIntro();

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

        // Run daily phase based on journey type using mode runners
        switch (this.journey.journeyType) {
          case 'recon':
            await runReconDay(this);
            break;
          case 'silviculture':
            await runSilvicultureDay(this);
            break;
          case 'planning':
            await runPlanningDay(this);
            break;
          case 'permitting':
            await runPermittingDay(this);
            break;
          case 'field':
            // Legacy field mode uses recon runner
            await runReconDay(this);
            break;
          case 'desk':
          default:
            // Legacy desk mode uses permitting runner
            await runPermittingDay(this);
            break;
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

  // ============ Event Handling ============
  // Note: Mode-specific day runners are now in /js/modes/ folder.
  // The methods below are used by the main loop for scheduled events.

  async _handleEvent(event) {
    const formatted = formatEventForDisplay(event, this.journey?.journeyType);

    this.ui.write('');
    const headerLabel = event.reporter ? 'RADIO CHECK' : 'EVENT';
    this.ui.writeHeader(`${headerLabel}: ${formatted.title}`);
    this.ui.write(formatted.description);
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

    // Award crew experience for handling events
    const activeCrew = this.journey.crew?.filter(m => m.isActive) || [];
    if (activeCrew.length > 0) {
      const randomMember = activeCrew[Math.floor(Math.random() * activeCrew.length)];
      const xpMsg = awardCrewExperience(randomMember);
      if (xpMsg) this.ui.write(xpMsg);
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

    // Check conditions based on journey type
    switch (journey.journeyType) {
      case 'recon':
      case 'field':
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
        break;

      case 'silviculture':
        // Victory: Met regeneration targets
        if (journey.planting.blocksPlanted >= journey.planting.blocksToPlant &&
            journey.surveys.freeGrowingComplete >= journey.surveys.freeGrowingTarget) {
          this.victory = true;
          journey.endReason = 'Regeneration targets achieved!';
          return;
        }
        // Game over: Budget depleted
        if (journey.resources.budget <= 0) {
          this.gameOver = true;
          journey.endReason = 'Budget exhausted - program cancelled';
          return;
        }
        // Game over: No contractor capacity
        if (journey.resources.contractorCapacity <= 0 && journey.planting.seedlingsPlanted < journey.planting.seedlingsAllocated) {
          this.gameOver = true;
          journey.endReason = 'No contractor capacity remaining';
          return;
        }
        break;

      case 'planning':
        // Victory: Ministerial approval achieved
        if (journey.plan.ministerialConfidence >= 80) {
          this.victory = true;
          journey.endReason = 'Landscape plan approved by Ministry!';
          return;
        }
        // Game over: Budget or political capital depleted
        if (journey.resources.budget <= 0) {
          this.gameOver = true;
          journey.endReason = 'Budget exhausted';
          return;
        }
        if (journey.resources.politicalCapital <= 0) {
          this.gameOver = true;
          journey.endReason = 'Lost political support';
          return;
        }
        break;

      case 'permitting':
      case 'desk':
      default:
        // Victory: Met permit target
        if (journey.permits.approved >= journey.permits.target) {
          this.victory = true;
          journey.endReason = 'Permit targets achieved!';
          return;
        }
        // Game over: Deadline passed
        if (journey.day > journey.deadline) {
          if (journey.permits.approved >= journey.permits.target * 0.8) {
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
        // Game over: Political capital gone
        if (journey.resources.politicalCapital <= 0) {
          this.gameOver = true;
          journey.endReason = 'Lost political support - removed from position';
          return;
        }
        break;
    }
  }

  async _showEndScreen() {
    this.ui.clear();
    const journey = this.journey;
    const areaName = journey.area?.name || 'the operating area';
    const crewName = journey.companyName || 'The crew';
    const daysUsed = journey.day - 1;

    // --- Narrative Epilogue ---
    if (this.victory) {
      this.ui.writeHeader('EXPEDITION SUCCESSFUL');
      this.ui.write('');
      this.ui.write(this._buildVictoryNarrative(journey, areaName, crewName, daysUsed));
    } else {
      this.ui.writeHeader('EXPEDITION FAILED');
      this.ui.write('');
      this.ui.write(this._buildDefeatNarrative(journey, areaName, crewName, daysUsed));
    }

    this.ui.write('');

    // --- Scoring ---
    const scoreResult = calculateScore(journey, this.victory);
    saveHighScore(scoreResult, journey);
    this.ui.writeDivider('PERFORMANCE REVIEW');
    const scoreLines = formatScoreDisplay(scoreResult);
    for (const line of scoreLines) {
      this.ui.write(line);
    }

    // Show high scores
    const highScores = getHighScores();
    if (highScores.length > 1) {
      this.ui.write('');
      this.ui.writeDivider('HIGH SCORES');
      for (let i = 0; i < Math.min(5, highScores.length); i++) {
        const hs = highScores[i];
        const v = hs.victory ? 'W' : 'L';
        this.ui.write(`  ${i + 1}. ${hs.grade} (${hs.score}) - ${hs.crewName} [${hs.role}] ${hs.area} (${v})`);
      }
    }

    this.ui.write('');
    this.ui.writeDivider('FINAL STATISTICS');

    switch (journey.journeyType) {
      case 'recon':
      case 'field': {
        const fieldProgressPct = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
        this.ui.write(`Traverse Covered: ${Math.round(journey.distanceTraveled)}/${journey.totalDistance} km (${fieldProgressPct}%)`);
        this.ui.write(`Shifts Elapsed: ${daysUsed}`);
        this.ui.write(`Blocks Surveyed: ${journey.currentBlockIndex}/${journey.blocks.length}`);
        if (journey.blocksAssessed !== undefined) {
          this.ui.write(`Blocks Assessed: ${journey.blocksAssessed}`);
        }
        break;
      }
      case 'silviculture': {
        const plantingPct = Math.round((journey.planting.seedlingsPlanted / journey.planting.seedlingsAllocated) * 100);
        this.ui.write(`Seedlings Planted: ${journey.planting.seedlingsPlanted.toLocaleString()}/${journey.planting.seedlingsAllocated.toLocaleString()} (${plantingPct}%)`);
        this.ui.write(`Blocks Planted: ${journey.planting.blocksPlanted}/${journey.planting.blocksToPlant}`);
        this.ui.write(`Brushing Complete: ${journey.brushing.hectaresComplete}/${journey.brushing.hectaresTarget} ha`);
        this.ui.write(`Free-Growing Surveys: ${journey.surveys.freeGrowingComplete}/${journey.surveys.freeGrowingTarget}`);
        this.ui.write(`Days Elapsed: ${daysUsed}`);
        this.ui.write(`Budget Remaining: $${Math.round(journey.resources.budget).toLocaleString()}`);
        break;
      }
      case 'planning':
        this.ui.write(`Final Phase: ${journey.plan.phase}`);
        this.ui.write(`Data Completeness: ${journey.plan.dataCompleteness}%`);
        this.ui.write(`Analysis Quality: ${journey.plan.analysisQuality}%`);
        this.ui.write(`Stakeholder Buy-in: ${journey.plan.stakeholderBuyIn}%`);
        this.ui.write(`Ministerial Confidence: ${journey.plan.ministerialConfidence}%`);
        this.ui.write(`Days Elapsed: ${daysUsed}`);
        this.ui.write(`Budget Remaining: $${Math.round(journey.resources.budget).toLocaleString()}`);
        break;

      case 'permitting':
      case 'desk':
      default:
        this.ui.write(`Permits Approved: ${journey.permits.approved}/${journey.permits.target}`);
        this.ui.write(`Days Used: ${daysUsed}/${journey.deadline}`);
        this.ui.write(`Budget Remaining: $${Math.round(journey.resources.budget).toLocaleString()}`);
        break;
    }

    // --- Crew Fate (narrative) ---
    if (journey.crew?.length > 0) {
      this.ui.write('');
      this.ui.writeDivider('CREW FATE');

      for (const member of journey.crew) {
        const info = getCrewDisplayInfo(member);
        let fate;
        if (!member.isActive) {
          if (member.isDead) {
            fate = 'Lost to the wilderness. Their sacrifice will be remembered.';
          } else if (member.hasQuit) {
            fate = 'Packed their bags and headed home early.';
          } else {
            fate = 'Evacuated for medical care.';
          }
        } else if (this.victory) {
          if (member.health > 80 && member.morale > 70) {
            fate = 'Returned triumphant and in high spirits.';
          } else if (member.health < 40) {
            fate = 'Completed the journey, but battered and bruised.';
          } else {
            fate = 'Completed the journey.';
          }
        } else {
          fate = 'Awaits rescue.';
        }
        this.ui.write(`${info.name} (${info.role}): ${fate}`);
      }
    }

    // --- Key Events ---
    if (journey.log?.length > 0) {
      const eventHighlights = journey.log.filter(e => e.type === 'event' || e.type === 'milestone');
      if (eventHighlights.length > 0) {
        this.ui.write('');
        this.ui.writeDivider('KEY EVENTS');
        const dayLabel = journey.journeyType === 'field' || journey.journeyType === 'recon' ? 'Shift' : 'Day';
        const toShow = eventHighlights.slice(-5);
        for (const entry of toShow) {
          this.ui.write(`${dayLabel} ${entry.day}: ${entry.eventTitle || entry.summary || entry.type}`);
        }
      }
    }

    this.ui.write('');
    this.ui.write('Press ESC to start a new expedition.');

    // Wait for restart
    await this.ui.promptChoice('', [{ label: 'New Expedition', value: 'restart' }]);
    this.start();
  }

  _buildVictoryNarrative(journey, areaName, crewName, daysUsed) {
    const seasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;
    const seasonName = seasonInfo ? seasonInfo.name.toLowerCase() : 'the season';

    switch (journey.journeyType) {
      case 'recon':
      case 'field': {
        const blocksCount = journey.blocks?.length || 0;
        const activeCrew = journey.crew.filter(m => m.isActive).length;
        return `${crewName} completed the ${journey.totalDistance} km traverse through ${areaName} as ${seasonName} settled in. ` +
          `${activeCrew} crew members surveyed all ${blocksCount} blocks over ${daysUsed} shifts. ` +
          `The reconnaissance data will guide forest operations in this area for years to come.`;
      }
      case 'silviculture':
        return `After ${daysUsed} days of hard work, the silviculture program in ${areaName} reached its targets. ` +
          `${journey.planting.blocksPlanted} blocks planted, ${journey.surveys.freeGrowingComplete} free-growing surveys completed. ` +
          `A new generation of trees will rise from this ground.`;
      case 'planning':
        return `The landscape plan for ${areaName} received ministerial approval after ${daysUsed} days of analysis, ` +
          `stakeholder engagement, and careful balancing of competing values. ` +
          `The plan will shape forestry operations in the region for the next decade.`;
      case 'permitting':
      case 'desk':
        return `${journey.permits.approved} permits approved out of ${journey.permits.target} targeted. ` +
          `The permit pipeline in ${areaName} is flowing smoothly after ${daysUsed} days of diligent processing ` +
          `and relationship building.`;
      default:
        return journey.endReason || 'Expedition completed successfully.';
    }
  }

  _buildDefeatNarrative(journey, areaName, crewName, daysUsed) {
    const reason = journey.endReason || journey.gameOverReason || 'The expedition ground to a halt.';

    switch (journey.journeyType) {
      case 'recon':
      case 'field': {
        const progress = journey.totalDistance > 0
          ? Math.round((journey.distanceTraveled / journey.totalDistance) * 100) : 0;
        const lastBlock = journey.blocks?.[journey.currentBlockIndex]?.name || 'an unknown location';
        return `The expedition stalled at ${lastBlock}, ${progress}% of the way through the traverse. ` +
          `${reason} After ${daysUsed} shifts, ${crewName} could go no further.`;
      }
      case 'silviculture':
        return `The silviculture program in ${areaName} fell short of its targets after ${daysUsed} days. ` +
          `${reason} The unplanted blocks will need to wait for next season.`;
      case 'planning':
        return `The landscape plan for ${areaName} failed to achieve approval after ${daysUsed} days. ` +
          `${reason} The planning process will need to restart with a new approach.`;
      case 'permitting':
      case 'desk':
        return `The permitting office in ${areaName} could not meet its targets. ` +
          `${reason} After ${daysUsed} days, the backlog remains.`;
      default:
        return reason;
    }
  }

  /**
   * Show journey-specific intro based on journey type
   */
  _showJourneyIntro() {
    const journey = this.journey;
    const journeyType = journey.journeyType;

    // Show season info if available
    if (journey.season) {
      const seasonInfo = getCurrentSeasonInfo(journey.season);
      this.ui.write(`Season: ${seasonInfo.icon} ${seasonInfo.name} - Year ${seasonInfo.year}`);
      this.ui.write('');
    }

    switch (journeyType) {
      case 'recon':
        this.ui.write(`Mission: Survey ${journey.totalDistance} km of traverse across ${journey.blocks.length} forest blocks.`);
        this.ui.write(`Each shift is about ${FIELD_SHIFT_HOURS} hours. Complete the survey before the season ends.`);
        this.ui.write('Manage fuel, food, and equipment while documenting hazards and cultural sites.');
        this.ui.write('');
        this.ui.write('Starting supplies:');
        this.ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
        this.ui.write(`  Fuel: ${journey.resources.fuel} gallons`);
        this.ui.write(`  Food: ${journey.resources.food} days worth`);
        this.ui.write(`  Equipment: ${journey.resources.equipment}% condition`);
        this.ui.write(`  GPS Units: ${journey.resources.gpsUnits || 5}`);
        break;

      case 'silviculture':
        this.ui.write(`Mission: Meet regeneration targets for the ${journey.planting.blocksToPlant} blocks in your program.`);
        this.ui.write('Manage planting contractors, herbicide applications, and survival surveys.');
        this.ui.write('Spring is critical for planting. Summer for brushing. Fall for assessments.');
        this.ui.write('');
        this.ui.write('Program targets:');
        this.ui.write(`  Seedlings to plant: ${journey.planting.seedlingsAllocated.toLocaleString()}`);
        this.ui.write(`  Brushing hectares: ${journey.brushing.hectaresTarget} ha`);
        this.ui.write(`  Free-growing surveys: ${journey.surveys.freeGrowingTarget}`);
        this.ui.write('');
        this.ui.write('Starting resources:');
        this.ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
        this.ui.write(`  Seedling inventory: ${journey.resources.seedlings?.toLocaleString() || 0}`);
        this.ui.write(`  Contractor capacity: ${journey.resources.contractorCapacity} days`);
        break;

      case 'planning':
        this.ui.write('Mission: Develop and achieve ministerial approval for a landscape-level forest plan.');
        this.ui.write('Progress through phases: Data Gathering → Analysis → Stakeholder Review → Ministerial Approval');
        this.ui.write('Balance values: biodiversity, timber supply, community needs, First Nations interests.');
        this.ui.write('');
        this.ui.write('Current phase: Data Gathering');
        this.ui.write(`  Cutblocks to plan: ${journey.cutblocks.proposed}`);
        this.ui.write('');
        this.ui.write('Starting resources:');
        this.ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
        this.ui.write(`  Political Capital: ${journey.resources.politicalCapital}`);
        this.ui.write(`  Data Credits: ${journey.resources.dataCredits}`);
        this.ui.write(`  Consultant Days: ${journey.resources.consultantDays}`);
        break;

      case 'permitting':
        this.ui.write(`Mission: Complete ${journey.permits.target} permit approvals within ${journey.deadline} days.`);
        this.ui.write('Manage the permit pipeline: drafting → referral → review → approval.');
        this.ui.write('Build stakeholder relationships to smooth the approval process.');
        this.ui.write('');
        this.ui.write('Permit pipeline:');
        this.ui.write(`  Target: ${journey.permits.target} approvals`);
        this.ui.write(`  In backlog: ${journey.permits.backlog}`);
        this.ui.write(`  Submitted: ${journey.permits.submitted}`);
        this.ui.write(`  In review: ${journey.permits.inReview}`);
        this.ui.write('');
        this.ui.write('Starting resources:');
        this.ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
        this.ui.write(`  Political Capital: ${journey.resources.politicalCapital}`);
        break;

      case 'field':
        this.ui.write(`Mission: Survey ${journey.totalDistance} km of traverse across ${journey.blocks.length} forest blocks.`);
        this.ui.write(`Each shift is about ${FIELD_SHIFT_HOURS} hours. The crew returns to camp nightly.`);
        this.ui.write('Manage fuel, food, and equipment while keeping radio contact.');
        this.ui.write('');
        this.ui.write('Starting supplies:');
        this.ui.write(`  Cash: $${journey.resources.budget?.toLocaleString() || 0}`);
        this.ui.write(`  Fuel: ${journey.resources.fuel} gallons`);
        this.ui.write(`  Food: ${journey.resources.food} days worth`);
        this.ui.write(`  Equipment: ${journey.resources.equipment}% condition`);
        this.ui.write(`  First Aid: ${journey.resources.firstAid} kits`);
        break;

      case 'desk':
      default:
        this.ui.write(`Mission: Complete permit approvals within ${journey.deadline} days.`);
        this.ui.write(`Target: ${journey.permits.target} permits approved.`);
        this.ui.write('Manage your budget, political capital, and team energy.');
        this.ui.write('');
        this.ui.write('Starting resources:');
        this.ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
        this.ui.write(`  Political Capital: ${journey.resources.politicalCapital}`);
        this.ui.write(`  Daily Energy: ${journey.hoursRemaining} hours`);
        break;
    }
  }
}

// Initialize game on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const game = new ForestryTrailGame();
  game.start();
});
