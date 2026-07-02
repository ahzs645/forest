/**
 * BC Forestry Trail - Oregon Trail Style Game
 * Main game loop and orchestration
 *
 * This is the slim orchestrator that delegates to mode-specific runners.
 */

import { TerminalUI } from '../ui.js';
import { FORESTER_ROLES, OPERATING_AREAS } from '../data/index.js';
import { generateCrew, getCrewDisplayInfo } from '../crew.js';
import {
  createJourney,
  formatJourneyLog,
  FIELD_SHIFT_HOURS,
  getSurveyedBlockCount
} from '../journey.js';
import { checkScheduledEvents } from '../events.js';
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
import { runFinalDebrief } from './debrief.js';
import { handleEvent } from '../modes/shared/handleEvent.js';
import { saveActiveRun, loadActiveRun, clearActiveRun } from './saveLoad.js';

/**
 * Apply difficulty multipliers to journey resources
 * (exported for the campaign, which builds its own journeys per season)
 */
export function applyDifficultyMultipliers(journey, difficulty) {
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
  constructor(ui = null) {
    displayMode.apply();

    this.ui = ui || new TerminalUI();
    this.journey = null;
    this.gameOver = false;
    this.victory = false;
    this._restartConfirmOpen = false;

    this.ui.onRestartRequest(() => this._promptRestart());
    this.ui.onLogRequest(() => this._showLog());
    this._bindKeyboard();

    // Dev/test hook: lets automated tests inspect or fast-forward a run.
    if (typeof window !== 'undefined') {
      window.__forestGame = this;
    }
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
            clearActiveRun();
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

    // Deep link from the retired standalone TUI page (tui.html forwards
    // here): jump straight into the seasonal game. One-shot — the param is
    // stripped so quitting back out lands on the normal hub.
    if (typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('mode') === 'seasonal') {
      window.history.replaceState(null, '', window.location.pathname);
      const { runSeasonalGame } = await import('./seasonalAdapter.js');
      this.ui._hideLandingScreen?.();
      await runSeasonalGame(this.ui);
      this.start();
      return;
    }

    // A saved run survives refreshes, tab evictions, and crashes
    const savedRun = loadActiveRun();
    if (savedRun) {
      const resume = await this._promptResume(savedRun);
      if (resume) {
        await this._resumeSavedRun(savedRun);
        return;
      }
      clearActiveRun();
    }

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

    // Load Data on the landing screen resumes the auto-saved run directly.
    if (init?.action === 'load' && init.journey) {
      await this._resumeSavedRun(init.journey);
      return;
    }

    // Seasonal Strategy plays in this same terminal via the adapter; when the
    // year ends (or the player quits out), fall back to the landing screen.
    if (init?.action === 'seasonal') {
      const { runSeasonalGame } = await import('./seasonalAdapter.js');
      await runSeasonalGame(this.ui);
      this.start();
      return;
    }

    // Campaign — the unified year (see docs/unified_campaign.md).
    if (init?.action === 'campaign') {
      const { runCampaign } = await import('./campaign.js');
      await runCampaign(this);
      this.start();
      return;
    }

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

    await this.ui.promptChoice('Ready to move out?', [{ label: 'Begin Journey', value: 'start' }]);

    saveActiveRun(this.journey);
    await this._mainLoop();
  }

  /**
   * Restore a saved expedition and hand control back to the main loop.
   * @private
   */
  async _resumeSavedRun(savedRun) {
    this.journey = savedRun;
    this.gameOver = false;
    this.victory = false;
    this.ui.writeHeader('EXPEDITION RESUMED');
    this.ui.write(`${savedRun.companyName || 'Your crew'} — ${savedRun.area?.name || 'the operating area'}, day ${savedRun.day}.`);
    this.ui.write('The daybook is where you left it. Back to work.', 'term-dim');
    this.ui.write('');
    await this._mainLoop();
  }

  /**
   * Offer to resume a saved expedition. Resolves true to resume.
   * @private
   */
  _promptResume(savedRun) {
    return new Promise((resolve) => {
      this.ui.openModal({
        title: 'Expedition in Progress',
        dismissible: false,
        buildContent: (container) => {
          const msg = document.createElement('p');
          const roleName = savedRun.role?.name || 'Forester';
          msg.textContent = `${savedRun.companyName || 'Your crew'} — ${roleName}, `
            + `${savedRun.area?.name || 'operating area'}, day ${savedRun.day}.`;
          msg.style.marginTop = '0';
          container.appendChild(msg);
        },
        actions: [
          {
            label: 'Resume Expedition',
            primary: true,
            onSelect: () => { this.ui.closeModal(); resolve(true); }
          },
          {
            label: 'Start Fresh',
            onSelect: () => { this.ui.closeModal(); resolve(false); }
          }
        ]
      });
    });
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

        // Day boundary: persist so refresh/eviction never loses the run
        if (!this.gameOver && !this.victory) {
          saveActiveRun(this.journey);
        }
      } catch (error) {
        // A crash must not reach the debrief or poison the career record.
        // The last day-boundary save survives, so a reload offers Resume.
        console.error('Main loop error:', error);
        this.ui.write('');
        this.ui.writeDanger(`Something broke in the field office: ${error.message}`);

        // Debug context — enough to triage from the screen, not just the console.
        this.ui.write(`Mode: ${this.journey?.journeyType || 'unknown'} | Day: ${this.journey?.day ?? '?'}`, 'term-dim');
        const isDevBuild = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
        if (isDevBuild && error.stack) {
          this.ui.write(error.stack, 'term-dim');
        }
        this.ui.write('Your expedition is saved up to the start of this day.', 'term-dim');

        // Offer recovery and a clean break, so a bug on resume is not a trap.
        const recovery = await this.ui.promptChoice('', [
          { label: 'Reload & Resume', value: 'reload' },
          { label: 'Start Fresh', value: 'fresh' }
        ]);
        if (recovery.value === 'fresh') {
          clearActiveRun();
        }
        window.location.reload();
        return;
      }
    }

    try {
      await runFinalDebrief(this.ui, this.journey, this.victory);
    } catch (error) {
      // The debrief must never fail silently. A crash here used to leave the
      // player mid-sequence with no explanation and no way forward; surface
      // it explicitly (same idiom as the day-loop crash handler above) and
      // still hand back control instead of stranding the run.
      console.error('Final debrief error:', error);
      this.ui.write('');
      this.ui.writeDanger(`Something broke while closing out the expedition: ${error.message}`);
      this.ui.write(`Mode: ${this.journey?.journeyType || 'unknown'} | Victory: ${this.victory}`, 'term-dim');
      const isDevBuild = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
      if (isDevBuild && error.stack) {
        this.ui.write(error.stack, 'term-dim');
      }
    }

    // Clear the autosave only once the debrief has fully played out. Clearing
    // it up front meant a page reload mid-debrief lost the finished run — no
    // resume, no service record — and looked like the game "forgot" the win.
    clearActiveRun();

    await this.ui.promptChoice('', [{ label: 'New Expedition', value: 'restart' }]);
    this.start();
  }

  async _handleEvent(event) {
    await handleEvent(this, event);
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
