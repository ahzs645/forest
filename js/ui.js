/**
 * Terminal UI Module
 * Handles all display and input for the Oregon Trail-style interface
 *
 * This module composes functionality from smaller, focused modules:
 * - terminal.js: Terminal output methods (write, clear, etc.)
 * - input.js: Input handling (text input, choices)
 * - panels.js: Status bar and side panels
 * - modal.js: Modal dialogs, help, glossary, settings
 * - initFlow.js: Landing screen and initialization flow
 * - modernUI.js: Modern mode UI updates
 */

import { displayMode } from './displayMode.js';
import { getActiveCrewCount, getAverageMorale } from './crew.js';

// Import all mixins
import {
  TerminalMixin,
  InputMixin,
  PanelsMixin,
  ModalMixin,
  InitFlowMixin,
  ModernUIMixin,
  applyMixins
} from './ui/index.js';

/**
 * TerminalUI Class
 * Main UI controller that composes all UI functionality
 */
export class TerminalUI {
  constructor() {
    this._initDOMReferences();
    this._initState();
    this._initEventListeners();
    this._initLandingScreen();
    this._initIntroFlow();

    // Listen for display mode changes
    displayMode.onChange((mode) => this._onDisplayModeChange(mode));
  }

  /**
   * Initialize all DOM element references
   * @private
   */
  _initDOMReferences() {
    // Core terminal elements
    this.terminal = document.getElementById('terminal');
    this.choices = document.getElementById('choices');
    this.inputWrapper = document.getElementById('input-wrapper');
    this.textInput = document.getElementById('text-input');
    this.submitBtn = document.getElementById('submit-btn');

    // Status bar elements
    this.dayLabel = document.getElementById('day-label');
    this.dayValue = document.getElementById('day-value');
    this.progressValue = document.getElementById('progress-value');
    this.crewLabel = document.getElementById('crew-label');
    this.crewValue = document.getElementById('crew-value');
    this.moraleLabel = document.getElementById('morale-label');
    this.moraleValue = document.getElementById('morale-value');

    // Side panel elements
    this.sidePanel = document.getElementById('side-panel');
    this.missionSection = document.getElementById('mission-section');
    this.missionPanel = document.getElementById('mission-panel');
    this.missionStrip = document.getElementById('mission-strip');
    this.choicesHint = document.getElementById('choices-hint');
    this.crewPanel = document.getElementById('crew-panel');
    this.resourcesPanel = document.getElementById('resources-panel');
    this.locationPanel = document.getElementById('location-panel');
    this.panelBackdrop = document.getElementById('panel-backdrop');

    // Header buttons
    this.statusBtn = document.getElementById('status-btn');
    this.helpBtn = document.getElementById('help-btn');
    this.glossaryBtn = document.getElementById('glossary-btn');
    this.intelBtn = document.getElementById('intel-btn');
    this.restartBtn = document.getElementById('restart-btn');
    this.closePanel = document.getElementById('close-panel');

    // Modal elements
    this.modal = document.getElementById('modal');
    this.modalTitle = document.getElementById('modal-title');
    this.modalBody = document.getElementById('modal-body');
    this.modalActions = document.getElementById('modal-actions');

    // Landing screen elements
    this.landingScreen = document.getElementById('landing-screen');
    this.campaignBtn = document.getElementById('campaign-btn');
    this.newGameBtn = document.getElementById('new-game-btn');
    this.tuiModeBtn = document.getElementById('tui-mode-btn');
    this.crisisModeBtn = document.getElementById('crisis-mode-btn');
    this.loadGameBtn = document.getElementById('load-game-btn');
    this.helpLandingBtn = document.getElementById('help-landing-btn');
    this.settingsBtn = document.getElementById('settings-btn');
    this.complianceIntelLandingBtn = document.getElementById('compliance-intel-landing-btn');

    // Initialization overlay elements
    this.initOverlay = document.getElementById('init-overlay');
    this.introStep = document.getElementById('intro-step');
    this.roleStep = document.getElementById('role-step');
    this.areaStep = document.getElementById('area-step');
    this.initZoneDisplay = document.getElementById('init-zone-display');
    this.crewNameInput = document.getElementById('crew-name-input');
    this.introContinueBtn = document.getElementById('intro-continue-btn');
    this.roleContinueBtn = document.getElementById('role-continue-btn');
    this.areaContinueBtn = document.getElementById('area-continue-btn');
    this.roleGrid = document.getElementById('role-grid');
    this.roleGlossaryBtn = document.getElementById('role-glossary-btn');
    this.roleIntelBtn = document.getElementById('role-intel-btn');
    this.areaList = document.getElementById('area-list');
    this.areaDetail = document.getElementById('area-detail');
    this.areaGlossaryBtn = document.getElementById('area-glossary-btn');
    this.areaIntelBtn = document.getElementById('area-intel-btn');

    // Modern mode header elements
    this.modernHeader = document.getElementById('modern-header');
    this.modernSettingsBtn = document.getElementById('modern-settings-btn');
    this.badgeSeasonValue = document.getElementById('badge-season-value');
    this.badgeRoleValue = document.getElementById('badge-role-value');
    this.badgeZoneValue = document.getElementById('badge-zone-value');

    // Modern mode metrics sidebar elements
    this.metricsSidebar = document.getElementById('metrics-sidebar');
    this.metricProgressValue = document.getElementById('metric-progress-value');
    this.metricProgressFill = document.getElementById('metric-progress-fill');
    this.metricEnergyValue = document.getElementById('metric-energy-value');
    this.metricEnergyFill = document.getElementById('metric-energy-fill');
    this.metricStressValue = document.getElementById('metric-stress-value');
    this.metricStressFill = document.getElementById('metric-stress-fill');
    this.metricBudgetValue = document.getElementById('metric-budget-value');
    this.metricBudgetFill = document.getElementById('metric-budget-fill');
    this.metricsExtra = document.getElementById('metrics-extra');
    this.directiveText = document.getElementById('directive-text');

    // Modern mode stat cards (in header area)
    this.statDayLabel = document.getElementById('stat-day-label');
    this.statDayValue = document.getElementById('stat-day-value');
    this.statProgressValue = document.getElementById('stat-progress-value');
    this.statProgressFill = document.getElementById('stat-progress-fill');
    this.statCrewLabel = document.getElementById('stat-crew-label');
    this.statCrewValue = document.getElementById('stat-crew-value');
    this.statMoraleLabel = document.getElementById('stat-morale-label');
    this.statMoraleValue = document.getElementById('stat-morale-value');

    // Modern mode stats row (year / funds / eco-health / zone)
    this.modernYearValue = document.getElementById('modern-year-value');
    this.modernFundsValue = document.getElementById('modern-funds-value');
    this.modernEcoValue = document.getElementById('modern-eco-value');
    this.modernEcoFill = document.getElementById('modern-eco-fill');
    this.modernZoneValue = document.getElementById('modern-zone-value');

    // Modern mode footer buttons
    this.footerGlossaryBtn = document.getElementById('footer-glossary-btn');
    this.logBtn = document.getElementById('log-btn');
    this.footerLogBtn = document.getElementById('footer-log-btn');
    this.footerIntelBtn = document.getElementById('footer-intel-btn');
    this.footerRestartBtn = document.getElementById('footer-restart-btn');
  }

  /**
   * Initialize internal state
   * @private
   */
  _initState() {
    this._pending = null;
    this._choiceHandler = null;
    this._keyHandler = null;
    this._onRestart = null;
    this._onLogRequest = null;
    this._isPanelOpen = false;
    this._initState = { roleId: null, areaId: null };
    this._currentJourney = null;
    this._roleGlossaryTerms = [];
    this._areaGlossaryTerms = [];
    this._currentOptions = null;
    this._modalOnClose = null;
    this._modalDismissible = false;
  }

  /**
   * Initialize core event listeners
   * @private
   */
  _initEventListeners() {
    // Text input submit
    if (this.submitBtn) {
      this.submitBtn.addEventListener('click', () => this._handleTextSubmit());
    }

    if (this.textInput) {
      this.textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._handleTextSubmit();
        }
      });
    }

    // Panel toggle
    if (this.statusBtn) {
      this.statusBtn.addEventListener('click', () => this.togglePanel());
    }

    if (this.closePanel) {
      this.closePanel.addEventListener('click', () => this.closeStatusPanel());
    }

    if (this.panelBackdrop) {
      this.panelBackdrop.addEventListener('click', () => this.closeStatusPanel());
    }

    // Restart button
    if (this.restartBtn) {
      this.restartBtn.addEventListener('click', () => {
        if (this._onRestart) this._onRestart();
      });
    }

    // Help button
    if (this.helpBtn) {
      this.helpBtn.addEventListener('click', () => this.showHelp());
    }

    if (this.glossaryBtn) {
      this.glossaryBtn.addEventListener('click', () => this.showGlossary());
    }

    if (this.intelBtn) {
      this.intelBtn.addEventListener('click', () => this.showProfessionalComplianceIntel());
    }

    if (this.complianceIntelLandingBtn) {
      this.complianceIntelLandingBtn.addEventListener('click', () => this.showProfessionalComplianceIntel());
    }

    if (this.roleGlossaryBtn) {
      this.roleGlossaryBtn.addEventListener('click', () => {
        this._openContextGlossary('Role Glossary', this._roleGlossaryTerms);
      });
    }

    if (this.roleIntelBtn) {
      this.roleIntelBtn.addEventListener('click', () => this.showProfessionalComplianceIntel());
    }

    if (this.areaGlossaryBtn) {
      this.areaGlossaryBtn.addEventListener('click', () => {
        this._openContextGlossary('Operating Area Glossary', this._areaGlossaryTerms);
      });
    }

    if (this.areaIntelBtn) {
      this.areaIntelBtn.addEventListener('click', () => this.showProfessionalComplianceIntel());
    }

    // Modern footer buttons
    if (this.footerGlossaryBtn) {
      this.footerGlossaryBtn.addEventListener('click', () => this.showGlossary());
    }

    if (this.logBtn) {
      this.logBtn.addEventListener('click', () => {
        if (this._onLogRequest) this._onLogRequest();
      });
    }

    if (this.footerLogBtn) {
      this.footerLogBtn.addEventListener('click', () => {
        if (this._onLogRequest) this._onLogRequest();
      });
    }

    if (this.footerIntelBtn) {
      this.footerIntelBtn.addEventListener('click', () => this.showProfessionalComplianceIntel());
    }

    if (this.footerRestartBtn) {
      this.footerRestartBtn.addEventListener('click', () => {
        if (this._onRestart) this._onRestart();
      });
    }

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const canUseGameplayShortcuts = this._canUseGameplayShortcuts();

      // Number keys for choices (works in both classic and modern mode).
      // 1-9 map directly; 0 is the accelerator for a 10th option so menus that
      // reach ten choices are never left with an unreachable last item.
      if (canUseGameplayShortcuts && /^[0-9]$/.test(e.key) && this._choiceHandler) {
        const index = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
        const buttons = this.choices?.querySelectorAll('.choice-btn, .decision-card');
        if (buttons && buttons[index]) {
          e.preventDefault();
          buttons[index].click();
        }
      }

      // S for status panel
      if (canUseGameplayShortcuts && e.key === 's' && !this._isInputFocused()) {
        e.preventDefault();
        this.togglePanel();
      }

      // L for journey log
      if (canUseGameplayShortcuts && e.key === 'l' && !this._isInputFocused()) {
        e.preventDefault();
        if (this._onLogRequest) this._onLogRequest();
      }

      // G for glossary
      if (canUseGameplayShortcuts && e.key === 'g' && !this._isInputFocused()) {
        e.preventDefault();
        this.showGlossary();
      }

      // P for professional/compliance intel
      if (canUseGameplayShortcuts && !this.isModalOpen() && e.key === 'p' && !this._isInputFocused()) {
        e.preventDefault();
        this.showProfessionalComplianceIntel();
      }

      // Escape to close panel or modal. Consume the event so later Escape
      // handlers (the game's restart prompt) don't fire on the same press.
      if (e.key === 'Escape') {
        if (!this.modal?.hidden) {
          e.preventDefault();
          this.closeModal();
        } else if (this._isPanelOpen) {
          e.preventDefault();
          this.closeStatusPanel();
        }
      }
    });
  }

  /**
   * Check whether the landing screen is currently visible
   * @private
   */
  _isLandingVisible() {
    return Boolean(this.landingScreen && !this.landingScreen.hidden);
  }

  /**
   * Check whether the initialization overlay is currently visible
   * @private
   */
  _isInitOverlayVisible() {
    return Boolean(this.initOverlay && !this.initOverlay.hidden);
  }

  /**
   * Gameplay-only shortcuts should stay dormant while setup UI is visible
   * @private
   */
  _canUseGameplayShortcuts() {
    return !this._isLandingVisible() && !this._isInitOverlayVisible();
  }

  // ============ Full Status Update ============

  /**
   * Update all status displays
   * @param {Object} journey - Journey state
   */
  updateAllStatus(journey) {
    this._currentJourney = journey || null;
    // Set layout for modern mode
    this.setJourneyLayout(journey.journeyType);

    // Status bar - label varies by journey type
    if (this.dayLabel) {
      const isFieldType = journey.journeyType === 'field' || journey.journeyType === 'recon';
      this.dayLabel.textContent = isFieldType
        ? 'SHIFT'
        : journey.journeyType === 'manager' ? 'MONTH' : 'DAY';
    }

    // Check for protagonist mode vs crew mode
    const isProtagonistMode = journey.protagonist && (!journey.crew || journey.crew.length === 0);

    if (isProtagonistMode) {
      // Protagonist mode - show energy instead of crew
      this.updateStatusBar({
        day: journey.day,
        progress: this._calculateProgress(journey),
        crewActive: null,
        crewTotal: null,
        morale: null,
        protagonist: journey.protagonist
      });
      this.updateProtagonistPanel(journey.protagonist);
    } else {
      // Crew mode - traditional display
      this.updateStatusBar({
        day: journey.day,
        progress: this._calculateProgress(journey),
        crewActive: getActiveCrewCount(journey.crew),
        crewTotal: journey.crew?.length || 0,
        morale: Math.round(getAverageMorale(journey.crew))
      });
      this.updateCrewPanel(journey.crew);
    }

    // Resource panel type mapping
    const resourceType = (journey.journeyType === 'field' || journey.journeyType === 'recon') ? 'field' : 'desk';
    this.updateResourcesPanel(journey.resources, resourceType);

    // Location panel varies by journey type
    this._updateLocationPanelByJourneyType(journey);

    // Update modern mode UI elements
    this._updateModernUI(journey, isProtagonistMode);
  }

  /**
   * Update location panel based on journey type
   * @private
   */
  _updateLocationPanelByJourneyType(journey) {
    switch (journey.journeyType) {
      case 'recon':
      case 'field':
        const block = journey.blocks?.[journey.currentBlockIndex];
        this.updateLocationPanel({
          name: block?.name || 'Unknown Location',
          description: block?.description,
          terrain: block?.terrain,
          weather: journey.weather?.name,
          hazards: block?.hazards,
          season: journey.season
        });
        break;

      case 'silviculture':
        this.updateLocationPanel({
          name: `Silviculture Program`,
          description: `Day ${journey.day}`,
          phase: journey.season?.currentSeason || 'Active',
          season: journey.season
        });
        break;

      case 'planning':
        const phaseLabels = {
          data_gathering: 'Data Gathering',
          analysis: 'Analysis',
          stakeholder_review: 'Stakeholder Review',
          ministerial_approval: 'Ministerial Approval'
        };
        this.updateLocationPanel({
          name: `Strategic Planning`,
          description: `Phase: ${phaseLabels[journey.plan?.phase] || 'Planning'}`,
          phase: journey.plan?.phase,
          season: journey.season
        });
        break;

      case 'permitting':
      case 'desk':
      default:
        this.updateLocationPanel({
          name: `Day ${journey.day} of ${journey.deadline}`,
          description: `${journey.deadline - journey.day} days remaining`,
          phase: journey.currentPhase,
          season: journey.season
        });
        break;
    }
  }

  // ============ Callback Setters ============

  /**
   * Set restart handler
   * @param {Function} handler - Restart callback
   */
  onRestart(handler) {
    this._onRestart = handler;
  }

  /**
   * Alias for onRestart (backward compat)
   */
  onRestartRequest(handler) {
    this._onRestart = handler;
  }

  /**
   * Set log request handler
   * @param {Function} handler - Log request callback
   */
  onLogRequest(handler) {
    this._onLogRequest = handler;
  }

  // ============ Utility ============

  /**
   * Prepare UI for a new game
   */
  prepareForNewGame() {
    this.clear();
    this._hideChoices();
    this._hideInput();
    this.closeStatusPanel();
    this.closeModal();
    this._hideInitOverlay();
    this._hideLandingScreen();

    // Reset status bar
    if (this.dayLabel) {
      this.dayLabel.textContent = 'DAY';
    }
    this.updateStatusBar({
      day: 1,
      progress: 0,
      crewActive: 5,
      crewTotal: 5,
      morale: 75
    });

    // Reset panels with placeholder text
    this.updateCrewPanel([]);
    this.updateResourcesPanel({}, 'field');
    this.updateLocationPanel({});

    // Reset init state
    this._initState = { roleId: null, areaId: null };
    this._currentJourney = null;
  }
}

// Apply all mixins to TerminalUI
applyMixins(
  TerminalUI,
  TerminalMixin,
  InputMixin,
  PanelsMixin,
  ModalMixin,
  InitFlowMixin,
  ModernUIMixin
);
