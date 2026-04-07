/**
 * BC Forestry Trail - Oregon Trail Style Game
 * Main game loop and orchestration
 *
 * This is the slim orchestrator that delegates to mode-specific runners.
 */

import { TerminalUI } from '../ui.js';
import { FORESTER_ROLES, OPERATING_AREAS } from '../data/index.js';
import { generateCrew, processDailyUpdate, getCrewDisplayInfo, crewHasRole } from '../crew.js';
import {
  createJourney,
  formatJourneyLog,
  FIELD_SHIFT_HOURS,
  getSurveyedBlockCount
} from '../journey.js';
import { checkScheduledEvents, formatEventForDisplay, resolveEvent } from '../events.js';
import { getCurrentSeasonInfo } from '../season.js';
import { calculateScore, formatScoreDisplay } from '../scoring.js';

// Import mode runners
import { runReconDay } from '../modes/recon.js';
import { runSilvicultureDay } from '../modes/silviculture.js';
import { runPlanningDay } from '../modes/planning.js';
import { runPermittingDay } from '../modes/permitting.js';
import { runManagerDay } from '../modes/manager.js';
import { checkEndConditions as evaluateEndConditions } from '../modes/shared/endConditions.js';

// Import display mode manager
import { displayMode } from '../displayMode.js';

// Import extracted display modules
import { showJourneyIntro } from './intro.js';
import { showEndScreen } from './endScreen.js';

/**
 * Apply difficulty multipliers to journey resources
 */
function applyDifficultyMultipliers(journey, difficulty) {
  if (difficulty === 'normal') return;

  const resourceMult = difficulty === 'easy' ? 1.3 : 0.8;
  const r = journey.resources;
  const excludedKeys = new Set();

  if (journey.journeyType === 'silviculture') {
    excludedKeys.add('seedlings');
  }

  for (const key of Object.keys(r)) {
    if (!excludedKeys.has(key) && typeof r[key] === 'number') {
      r[key] = Math.round(r[key] * resourceMult);
    }
  }

  if (journey.journeyType === 'planning' && Number.isFinite(journey.deadline)) {
    journey.deadline += difficulty === 'easy' ? 2 : -1;
  }
}

export class ForestryTrailGame {
  constructor() {
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

    const init = await new Promise((resolve) => {
      const handleFallback = (e) => {
        window.removeEventListener('initFlowComplete', handleFallback);
        resolve(e.detail);
      };
      window.addEventListener('initFlowComplete', handleFallback);

      this.ui.runInitializationFlow({
        defaultCrewName: 'The Timber Wolves',
        roles: FORESTER_ROLES,
        areas: OPERATING_AREAS
      }).then(resolve);
    });

    const crewName = init?.crewName || 'The Timber Wolves';
    const role = init?.role || FORESTER_ROLES[0];
    const area = init?.area || OPERATING_AREAS[0];

    // Difficulty selection
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

    const legacyJourneyType = role.journeyType || 'field';
    const crew = generateCrew(5, legacyJourneyType);

    this.journey = createJourney({
      crewName,
      role,
      area,
      crew
    });

    this.journey.difficulty = difficulty;
    applyDifficultyMultipliers(this.journey, difficulty);

    this.ui.write('');
    this.ui.writeHeader(`${crewName.toUpperCase() || 'YOUR CREW'} - ${role.name}`);
    this.ui.write(`Operating Area: ${area.name}`);
    this.ui.write(`BEC Zone: ${area.becZone}`);
    if (area.dominantTrees?.length) {
      this.ui.write(`Dominant Species: ${area.dominantTrees.join(', ')}`);
    }
    this.ui.write('');

    this.ui.writeDivider('YOUR CREW');
    for (const member of crew) {
      const info = getCrewDisplayInfo(member);
      this.ui.write(`${info.name} - ${info.role}`);
    }
    this.ui.write('');

    showJourneyIntro(this.ui, this.journey);

    await this.ui.promptChoice('Press any key to begin...', [{ label: 'Begin Journey', value: 'start' }]);

    await this._mainLoop();
  }

  async _mainLoop() {
    while (!this.gameOver && !this.victory) {
      try {
        this.ui.updateAllStatus(this.journey);

        const scheduledEvent = checkScheduledEvents(this.journey);
        if (scheduledEvent) {
          await this._handleEvent(scheduledEvent);
          if (this.gameOver) break;
        }

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
          case 'manager':
            await runManagerDay(this);
            break;
          case 'field':
            await runReconDay(this);
            break;
          case 'desk':
          default:
            await runPermittingDay(this);
            break;
        }

        this._checkEndConditions();
      } catch (error) {
        console.error('Main loop error:', error);
        this.ui.writeDanger(`Error: ${error.message}. Please refresh to restart.`);
        break;
      }
    }

    await showEndScreen(this.ui, this.journey, this.victory);

    await this.ui.promptChoice('', [{ label: 'New Expedition', value: 'restart' }]);
    this.start();
  }

  async _handleEvent(event) {
    const formatted = formatEventForDisplay(event, this.journey?.journeyType);

    this.ui.write('');
    const headerLabel = event.reporter ? 'RADIO CHECK' : 'EVENT';
    this.ui.writeHeader(`${headerLabel}: ${formatted.title}`);
    this.ui.write(formatted.description);
    this.ui.write('');

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

    const result = resolveEvent(this.journey, event, selectedOption);

    this.ui.write('');
    for (const msg of result.messages) {
      this.ui.write(msg);
    }

    if (selectedOption.gameOver) {
      this.gameOver = true;
      this.journey.endReason = selectedOption.gameOverReason || 'Event outcome';
    }
  }

  _displayCrewStatus() {
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

      const wasAlive = !member.isDead;
      const wasActive = !member.hasQuit;

      const update = processDailyUpdate(member, conditions);

      if (wasAlive && member.isDead) {
        this.ui.writeWarning(`${member.name} has died from their injuries!`);
      } else if (wasActive && member.hasQuit) {
        this.ui.writeWarning(`${member.name} has had enough and quit the expedition!`);
      }

      if (update.messages && update.messages.length > 0) {
        for (const msg of update.messages) {
          this.ui.write(msg);
        }
      }
    }

    this.ui.updateAllStatus(journey);
  }

  _checkEndConditions() {
    const result = evaluateEndConditions(this.journey);
    if (!result) {
      return;
    }

    if (result.gameOver) {
      this.gameOver = true;
      this.journey.endReason = result.reason || this.journey.gameOverReason || 'Operations halted';
      return;
    }

    if (result.victory) {
      this.victory = true;
      this.journey.endReason = result.reason || this.journey.endReason || 'Expedition completed!';
    }
  }
}
