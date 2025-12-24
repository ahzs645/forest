/**
 * Terminal UI Module
 * Handles all display and input for the Oregon Trail-style interface
 */

import { progressBar, box, BOX, PROGRESS, healthIndicator } from './ascii.js';
import { getCrewDisplayInfo, getActiveCrewCount, getAverageMorale } from './crew.js';
import { FIELD_RESOURCES, DESK_RESOURCES, getResourcePercentage } from './resources.js';
import { GLOSSARY_TERMS } from './data/glossary.js';
import { LEGACY_GLOSSARY_TERMS } from './data/legacyGlossary.js';

// Role icons mapping (ASCII/text symbols)
const ROLE_ICONS = {
  planner: '[P]',
  permitter: '[/]',
  recce: '[R]',
  silviculture: '[S]',
  default: '[*]'
};

export class TerminalUI {
  constructor() {
    // DOM elements
    this.terminal = document.getElementById('terminal');
    this.choices = document.getElementById('choices');
    this.inputWrapper = document.getElementById('input-wrapper');
    this.textInput = document.getElementById('text-input');
    this.submitBtn = document.getElementById('submit-btn');

    // Status bar elements
    this.dayLabel = document.getElementById('day-label');
    this.dayValue = document.getElementById('day-value');
    this.progressValue = document.getElementById('progress-value');
    this.crewValue = document.getElementById('crew-value');
    this.moraleValue = document.getElementById('morale-value');

    // Side panel elements
    this.sidePanel = document.getElementById('side-panel');
    this.crewPanel = document.getElementById('crew-panel');
    this.resourcesPanel = document.getElementById('resources-panel');
    this.locationPanel = document.getElementById('location-panel');
    this.panelBackdrop = document.getElementById('panel-backdrop');

    // Header buttons
    this.statusBtn = document.getElementById('status-btn');
    this.helpBtn = document.getElementById('help-btn');
    this.glossaryBtn = document.getElementById('glossary-btn');
    this.restartBtn = document.getElementById('restart-btn');
    this.closePanel = document.getElementById('close-panel');

    // Modal elements
    this.modal = document.getElementById('modal');
    this.modalTitle = document.getElementById('modal-title');
    this.modalBody = document.getElementById('modal-body');
    this.modalActions = document.getElementById('modal-actions');

    // Landing screen elements
    this.landingScreen = document.getElementById('landing-screen');
    this.newGameBtn = document.getElementById('new-game-btn');
    this.loadGameBtn = document.getElementById('load-game-btn');
    this.helpLandingBtn = document.getElementById('help-landing-btn');
    this.settingsBtn = document.getElementById('settings-btn');

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
    this.areaList = document.getElementById('area-list');
    this.areaDetail = document.getElementById('area-detail');
    this.areaGlossaryBtn = document.getElementById('area-glossary-btn');

    // State
    this._pending = null;
    this._choiceHandler = null;
    this._keyHandler = null;
    this._onRestart = null;
    this._isPanelOpen = false;
    this._initState = { roleId: null, areaId: null };
    this._roleGlossaryTerms = [];
    this._areaGlossaryTerms = [];

    // Initialize event listeners
    this._initEventListeners();
    this._initLandingScreen();
    this._initIntroFlow();
  }

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

    if (this.roleGlossaryBtn) {
      this.roleGlossaryBtn.addEventListener('click', () => {
        this._openContextGlossary('Role Glossary', this._roleGlossaryTerms);
      });
    }

    if (this.areaGlossaryBtn) {
      this.areaGlossaryBtn.addEventListener('click', () => {
        this._openContextGlossary('Operating Area Glossary', this._areaGlossaryTerms);
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Number keys for choices
      if (/^[1-9]$/.test(e.key) && this._choiceHandler) {
        const index = parseInt(e.key, 10) - 1;
        const buttons = this.choices?.querySelectorAll('.choice-btn');
        if (buttons && buttons[index]) {
          e.preventDefault();
          buttons[index].click();
        }
      }

      // S for status panel
      if (e.key === 's' && !this._isInputFocused()) {
        e.preventDefault();
        this.togglePanel();
      }

      // L for journey log
      if (e.key === 'l' && !this._isInputFocused()) {
        e.preventDefault();
        if (this._onLogRequest) this._onLogRequest();
      }

      // G for glossary
      if (e.key === 'g' && !this._isInputFocused()) {
        e.preventDefault();
        this.showGlossary();
      }

      // Escape to close panel or modal
      if (e.key === 'Escape') {
        if (!this.modal?.hidden) {
          this.closeModal();
        } else if (this._isPanelOpen) {
          this.closeStatusPanel();
        }
      }
    });
  }

  _initLandingScreen() {
    if (!this.landingScreen) return;

    // New Game button
    this.newGameBtn?.addEventListener('click', () => {
      this._hideLandingScreen();
      if (this._resolveNewGame) {
        this._resolveNewGame();
        this._resolveNewGame = null;
      }
    });

    // Load Game button (placeholder for now)
    this.loadGameBtn?.addEventListener('click', () => {
      this.showModal({
        title: 'LOAD DATA',
        content: 'Save/Load functionality coming soon.',
        actions: [{ label: 'OK', primary: true }]
      });
    });

    // Help button on landing
    this.helpLandingBtn?.addEventListener('click', () => {
      this.showHelp();
    });

    // Settings button (placeholder)
    this.settingsBtn?.addEventListener('click', () => {
      this.showModal({
        title: 'SETTINGS',
        content: 'Settings menu coming soon.',
        actions: [{ label: 'OK', primary: true }]
      });
    });

    // Keyboard shortcuts on landing
    document.addEventListener('keydown', (e) => {
      if (!this.landingScreen || this.landingScreen.hidden) return;
      if (this.isModalOpen()) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this.newGameBtn?.click();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        this.loadGameBtn?.click();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        this.helpLandingBtn?.click();
      }
    });
  }

  _showLandingScreen() {
    if (this.landingScreen) {
      this.landingScreen.hidden = false;
      this.landingScreen.style.display = 'flex';
    }
  }

  _hideLandingScreen() {
    if (this.landingScreen) {
      this.landingScreen.hidden = true;
      this.landingScreen.style.display = 'none';
    }
  }

  _initIntroFlow() {
    if (!this.initOverlay) return;

    this.introContinueBtn?.addEventListener('click', () => {
      this._switchInitStep('role');
    });

    this.roleContinueBtn?.addEventListener('click', () => {
      this._switchInitStep('area');
    });

    if (this.areaContinueBtn) {
      this.areaContinueBtn.addEventListener('click', () => {
        const payload = this._buildInitPayload();
        this._hideInitOverlay();

        // Try to resolve the promise first
        if (this._resolveInitFlow) {
          const resolve = this._resolveInitFlow;
          this._resolveInitFlow = null;
          resolve(payload);
        }

        // Always dispatch the fallback event as a safety net
        window.dispatchEvent(new CustomEvent('initFlowComplete', { detail: payload }));
      });
    }
  }

  _switchInitStep(step) {
    if (!this.initOverlay) return;

    const stepOrder = [
      { id: 'intro', el: this.introStep },
      { id: 'role', el: this.roleStep },
      { id: 'area', el: this.areaStep }
    ];

    stepOrder.forEach(({ id, el }) => {
      if (!el) return;
      const isMatch = id === step;
      // Use only class-based toggling (CSS handles display)
      el.classList.toggle('active', isMatch);
      // Remove hidden attribute to let CSS control display
      el.removeAttribute('hidden');
    });
  }

  _showInitOverlay() {
    if (!this.initOverlay) return;
    this.initOverlay.hidden = false;
    this.initOverlay.style.display = 'flex';
  }

  _hideInitOverlay() {
    if (!this.initOverlay) return;
    this.initOverlay.hidden = true;
    this.initOverlay.style.display = 'none';
  }

  _buildInitPayload() {
    const crewName = this.crewNameInput?.value?.trim() || 'The Timber Wolves';
    const role = this._initRoles?.find((r) => r.id === this._initState.roleId) || this._initRoles?.[0];
    const area = this._initAreas?.find((a) => a.id === this._initState.areaId) || this._initAreas?.[0];

    return {
      crewName,
      role,
      area,
    };
  }

  _renderRoleCards(roles = []) {
    if (!this.roleGrid) return;

    this.roleGrid.innerHTML = '';

    roles.forEach((role, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      const isSelected = this._initState.roleId === role.id;
      card.className = `role-card ${isSelected ? 'selected' : ''}`;

      const icon = ROLE_ICONS[role.id] || ROLE_ICONS.default;

      card.innerHTML = `
        <div class="role-icon-box">
          <span class="role-icon">${icon}</span>
        </div>
        <div class="role-info">
          <div class="role-header">
            <span class="role-id">0${index + 1} ::</span>
            <h3 class="role-name">${role.name.toUpperCase()}</h3>
          </div>
          <p class="role-desc">${role.description}</p>
        </div>
      `;
      card.addEventListener('click', () => {
        this._initState.roleId = role.id;
        this._renderRoleCards(roles);
        // Update zone display based on role ID (new journey types)
        if (this.initZoneDisplay) {
          const journeyTypeLabels = {
            recce: 'RECON_OPS',
            silviculture: 'SILV_OPS',
            planner: 'PLANNING',
            permitter: 'PERMITTING'
          };
          const modeLabel = journeyTypeLabels[role.id] || (role.journeyType === 'field' ? 'FIELD_OPS' : 'DESK_OPS');
          this.initZoneDisplay.textContent = `MODE: ${modeLabel}`;
        }
      });

      this.roleGrid.appendChild(card);
    });
  }

  _setRoleGlossaryTerms() {
    this._roleGlossaryTerms = ['Silviculture', 'Referral', 'Hydrology Assessment']
      .map((term) => this._findGlossaryTerm(term))
      .filter(Boolean);

    this._syncGlossaryButtonState(this.roleGlossaryBtn, this._roleGlossaryTerms);
  }

  _renderAreaList(areas = []) {
    if (!this.areaList) return;
    this.areaList.innerHTML = '';

    areas.forEach((area, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `area-item ${this._initState.areaId === area.id ? 'selected' : ''}`;
      item.setAttribute('role', 'listitem');
      item.innerHTML = `
        <div class="area-number">[${String(index + 1).padStart(2, '0')}]</div>
        <div>
          <strong>${area.name}</strong>
          <div class="muted">${area.description}</div>
        </div>
      `;
      item.addEventListener('click', () => {
        this._initState.areaId = area.id;
        this._renderAreaList(areas);
        this._renderAreaDetail(area);
        this._renderAreaGlossary(area);
      });

      this.areaList.appendChild(item);
    });
  }

  _renderAreaDetail(area) {
    if (!this.areaDetail || !area) return;

    this.areaDetail.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = area.name;
    this.areaDetail.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = area.description;
    desc.className = 'muted';
    this.areaDetail.appendChild(desc);

    const meta = document.createElement('div');
    meta.className = 'area-meta';
    meta.innerHTML = `
      <div>
        <div class="detail-label">BEC ZONE</div>
        <div class="detail-value">${area.becZone}</div>
      </div>
      <div>
        <div class="detail-label">DOMINANT SPECIES</div>
        <div class="detail-value">${area.dominantTrees?.join(', ')}</div>
      </div>
      <div>
        <div class="detail-label">COMMUNITIES</div>
        <div class="detail-value">${area.communities?.join(', ')}</div>
      </div>
    `;
    this.areaDetail.appendChild(meta);

    if (area.focusTopics?.length) {
      const focus = document.createElement('div');
      focus.innerHTML = '<div class="detail-label">FOCUS TOPICS</div>';
      const chips = document.createElement('div');
      chips.className = 'chip-row';
      area.focusTopics.forEach((topic) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = topic;
        chips.appendChild(chip);
      });
      focus.appendChild(chips);
      this.areaDetail.appendChild(focus);
    }

    if (area.indigenousPartners?.length) {
      const partners = document.createElement('div');
      partners.innerHTML = '<div class="detail-label">INDIGENOUS PARTNERS</div>';
      const chips = document.createElement('div');
      chips.className = 'chip-row';
      area.indigenousPartners.forEach((partner) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = partner;
        chips.appendChild(chip);
      });
      partners.appendChild(chips);
      this.areaDetail.appendChild(partners);
    }
  }

  _renderAreaGlossary(area) {
    const entries = [this._findGlossaryTerm('BEC Zone'), this._findGlossaryTerm('Riparian Reserve')].filter(Boolean);

    if (area?.tags?.includes('wildfire')) {
      const wildfire = this._findGlossaryTerm('Wildfire Hazard Abatement');
      if (wildfire) entries.push(wildfire);
    }

    this._areaGlossaryTerms = entries;
    this._syncGlossaryButtonState(this.areaGlossaryBtn, this._areaGlossaryTerms);
  }

  _syncGlossaryButtonState(button, terms = []) {
    if (!button) return;
    const hasEntries = Array.isArray(terms) && terms.length > 0;
    button.disabled = !hasEntries;
    button.setAttribute('aria-disabled', hasEntries ? 'false' : 'true');
  }

  _openContextGlossary(title, terms = []) {
    const entries = Array.isArray(terms) ? terms : [];

    if (!entries.length) {
      this.showModal({
        title,
        content: '<p>No glossary terms available yet.</p>',
        actions: [{ label: 'Close', primary: true }]
      });
      return;
    }

    this.openModal({
      title,
      dismissible: true,
      buildContent: (container) => {
        const list = document.createElement('div');
        list.className = 'modal-glossary-list';

        entries.forEach((term) => {
          const row = document.createElement('div');
          row.className = 'modal-glossary-term';

          const termTitle = document.createElement('div');
          termTitle.className = 'modal-glossary-title';
          termTitle.textContent = term.term;

          const desc = document.createElement('div');
          desc.className = 'modal-glossary-desc';
          desc.textContent = term.description;

          row.appendChild(termTitle);
          row.appendChild(desc);
          list.appendChild(row);
        });

        container.appendChild(list);
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  }

  _findGlossaryTerm(term) {
    return (
      GLOSSARY_TERMS.find((entry) => entry.term === term) || LEGACY_GLOSSARY_TERMS.find((entry) => entry.term === term)
    );
  }

  async runInitializationFlow({ roles = [], areas = [], defaultCrewName = 'The Timber Wolves' } = {}) {
    // Show landing screen first and wait for New Game click
    if (this.landingScreen) {
      this._showLandingScreen();
      await new Promise((resolve) => {
        this._resolveNewGame = resolve;
      });
    }

    if (!this.initOverlay) {
      return { crewName: defaultCrewName, role: roles[0], area: areas[0] };
    }

    this._initRoles = roles;
    this._initAreas = areas;
    this._initState.roleId = roles[0]?.id;
    this._initState.areaId = areas[0]?.id;

    if (this.crewNameInput) {
      this.crewNameInput.value = defaultCrewName;
    }

    this._renderRoleCards(roles);
    this._setRoleGlossaryTerms();
    this._renderAreaList(areas);
    this._renderAreaDetail(areas[0]);
    this._renderAreaGlossary(areas[0]);
    this._switchInitStep('intro');
    this._showInitOverlay();

    // Update initial zone display based on role ID
    if (this.initZoneDisplay && roles[0]) {
      const journeyTypeLabels = {
        recce: 'RECON_OPS',
        silviculture: 'SILV_OPS',
        planner: 'PLANNING',
        permitter: 'PERMITTING'
      };
      const modeLabel = journeyTypeLabels[roles[0].id] || (roles[0].journeyType === 'field' ? 'FIELD_OPS' : 'DESK_OPS');
      this.initZoneDisplay.textContent = `MODE: ${modeLabel}`;
    }

    // Store resolve function for the areaContinueBtn click handler
    return new Promise((resolve) => {
      this._resolveInitFlow = resolve;
    });
  }

  _isInputFocused() {
    const active = document.activeElement;
    return active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
  }

  // ============ Terminal Output ============

  /**
   * Write a line to the terminal
   * @param {string} text - Text to display
   * @param {string} className - Optional CSS class
   */
  write(text, className = '') {
    if (!this.terminal) return;

    const line = document.createElement('div');
    line.className = `term-line ${className}`.trim();
    line.textContent = text;
    this.terminal.appendChild(line);
    this._scrollToBottom();
  }

  /**
   * Write HTML content to the terminal
   * @param {string} html - HTML string
   */
  writeHTML(html) {
    if (!this.terminal) return;

    const div = document.createElement('div');
    div.className = 'term-line';
    div.innerHTML = html;
    this.terminal.appendChild(div);
    this._scrollToBottom();
  }

  /**
   * Write a header line
   * @param {string} text - Header text
   */
  writeHeader(text) {
    this.write(text, 'term-header');
  }

  /**
   * Write a divider
   * @param {string} label - Optional label
   */
  writeDivider(label = '') {
    if (!this.terminal) return;

    const div = document.createElement('div');
    div.className = 'term-divider';
    div.textContent = label || '─'.repeat(40);
    this.terminal.appendChild(div);
    this._scrollToBottom();
  }

  /**
   * Write a warning message
   * @param {string} text - Warning text
   */
  writeWarning(text) {
    this.write(`⚠ ${text}`, 'term-warning');
  }

  /**
   * Write a danger/error message
   * @param {string} text - Error text
   */
  writeDanger(text) {
    this.write(`✗ ${text}`, 'term-danger');
  }

  /**
   * Write a positive/success message
   * @param {string} text - Success text
   */
  writePositive(text) {
    this.write(`✓ ${text}`, 'term-positive');
  }

  /**
   * Write a pre-formatted ASCII box
   * @param {string} content - Pre-formatted content
   */
  writeBox(content) {
    if (!this.terminal) return;

    const div = document.createElement('div');
    div.className = 'term-box ascii-box';
    div.textContent = content;
    this.terminal.appendChild(div);
    this._scrollToBottom();
  }

  /**
   * Clear the terminal
   */
  clear() {
    if (this.terminal) {
      this.terminal.innerHTML = '';
    }
  }

  _scrollToBottom() {
    if (this.terminal) {
      this.terminal.scrollTop = this.terminal.scrollHeight;
    }
  }

  // ============ Input Methods ============

  /**
   * Prompt for text input
   * @param {string} prompt - Prompt message
   * @param {string} placeholder - Input placeholder
   * @returns {Promise<string>} User input
   */
  async promptText(prompt, placeholder = 'Type here...') {
    this.write(prompt);
    this._hideChoices();
    this._showInput(placeholder);

    return new Promise((resolve) => {
      this._pending = resolve;
    });
  }

  /**
   * Prompt for a choice selection
   * @param {string} prompt - Prompt message
   * @param {Object[]} options - Array of { label, value, hint }
   * @returns {Promise<Object>} Selected option
   */
  async promptChoice(prompt, options) {
    this.write(prompt);
    this._hideInput();
    this._showChoices(options);

    return new Promise((resolve) => {
      this._choiceHandler = resolve;
    });
  }

  _showInput(placeholder) {
    if (!this.inputWrapper || !this.textInput) return;

    this.inputWrapper.hidden = false;
    this.textInput.placeholder = placeholder;
    this.textInput.value = '';
    this.textInput.focus();
  }

  _hideInput() {
    if (this.inputWrapper) {
      this.inputWrapper.hidden = true;
    }
  }

  _showChoices(options) {
    if (!this.choices) return;

    this.choices.innerHTML = '';

    options.forEach((option, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';

      const label = document.createElement('span');
      label.className = 'choice-label';
      label.textContent = `[${index + 1}] ${option.label}`;
      btn.appendChild(label);

      if (option.hint || option.description) {
        const hint = document.createElement('span');
        hint.className = 'choice-hint';
        hint.textContent = option.hint || option.description;
        btn.appendChild(hint);
      }

      btn.addEventListener('click', () => {
        // Save handler before hiding choices (which clears it)
        const handler = this._choiceHandler;
        this.write(`> ${option.label}`, 'term-dim');
        this._hideChoices();
        if (handler) {
          handler(option);
        }
      });

      this.choices.appendChild(btn);
    });

    // Focus first button
    const firstBtn = this.choices.querySelector('.choice-btn');
    if (firstBtn) firstBtn.focus();
  }

  _hideChoices() {
    if (this.choices) {
      this.choices.innerHTML = '';
    }
    this._choiceHandler = null;
  }

  _handleTextSubmit() {
    if (!this.textInput || !this._pending) return;

    const value = this.textInput.value.trim();
    if (!value) return;

    this.write(`> ${value}`, 'term-dim');
    this._hideInput();

    const resolver = this._pending;
    this._pending = null;
    resolver(value);
  }

  // ============ Status Bar ============

  /**
   * Update the quick status bar
   * @param {Object} data - Status data
   */
  updateStatusBar(data) {
    if (this.dayValue) {
      this.dayValue.textContent = data.day || '1';
    }
    if (this.progressValue) {
      this.progressValue.textContent = `${data.progress || 0}%`;
    }

    // Check for protagonist mode vs crew mode
    if (data.protagonist) {
      // Protagonist mode - show energy
      if (this.crewValue) {
        this.crewValue.textContent = `${data.protagonist.energy || 0}%`;
      }
      if (this.moraleValue) {
        const stressLevel = data.protagonist.stress > 70 ? 'HIGH' : data.protagonist.stress > 40 ? 'MED' : 'LOW';
        this.moraleValue.textContent = stressLevel;
      }
    } else {
      // Crew mode - traditional display
      if (this.crewValue) {
        this.crewValue.textContent = `${data.crewActive || 0}/${data.crewTotal || 5}`;
      }
      if (this.moraleValue) {
        this.moraleValue.textContent = `${data.morale || 0}%`;
      }
    }
  }

  // ============ Side Panel ============

  /**
   * Update the crew panel
   * @param {Object[]} crew - Crew members
   */
  updateCrewPanel(crew) {
    if (!this.crewPanel) return;

    this.crewPanel.innerHTML = '';

    if (!crew || crew.length === 0) {
      this.crewPanel.innerHTML = '<div class="panel-placeholder">No crew assigned yet</div>';
      return;
    }

    for (const member of crew) {
      const info = getCrewDisplayInfo(member);
      const div = document.createElement('div');

      let statusClass = '';
      if (!info.isActive) statusClass = 'inactive';
      else if (info.health < 30) statusClass = 'critical';
      else if (info.effects.length > 0) statusClass = 'injured';

      div.className = `crew-member ${statusClass}`.trim();

      div.innerHTML = `
        <div class="crew-name">${info.name}</div>
        <div class="crew-role">${info.role}</div>
        <div class="crew-stats">
          <span>HP: ${progressBar(info.health, 8, true)}</span>
        </div>
        ${info.status !== 'Good' ? `<div class="crew-status">[${info.status}]</div>` : ''}
      `;

      this.crewPanel.appendChild(div);
    }
  }

  /**
   * Update the protagonist panel (for protagonist modes)
   * @param {Object} protagonist - Protagonist state
   */
  updateProtagonistPanel(protagonist) {
    if (!this.crewPanel) return;

    this.crewPanel.innerHTML = '';

    if (!protagonist) {
      this.crewPanel.innerHTML = '<div class="panel-placeholder">You</div>';
      return;
    }

    // Create protagonist status display
    const div = document.createElement('div');
    div.className = 'protagonist-status';

    // Determine stress level for styling
    const stressLevel = protagonist.stress > 70 ? 'critical' : protagonist.stress > 40 ? 'stressed' : '';

    div.innerHTML = `
      <div class="protagonist-header">YOUR STATUS</div>
      <div class="protagonist-stat">
        <span class="stat-label">Energy:</span>
        <span class="stat-value">${progressBar(protagonist.energy, 10, true)}</span>
      </div>
      <div class="protagonist-stat ${stressLevel}">
        <span class="stat-label">Stress:</span>
        <span class="stat-value">${progressBar(protagonist.stress, 10, true)}</span>
      </div>
      <div class="protagonist-stat">
        <span class="stat-label">Reputation:</span>
        <span class="stat-value">${protagonist.reputation || 50}</span>
      </div>
    `;

    // Add expertise if available
    if (protagonist.expertise) {
      const expertiseDiv = document.createElement('div');
      expertiseDiv.className = 'protagonist-expertise';
      expertiseDiv.innerHTML = '<div class="expertise-header">EXPERTISE</div>';

      for (const [skill, value] of Object.entries(protagonist.expertise)) {
        const skillName = skill.charAt(0).toUpperCase() + skill.slice(1);
        const skillDiv = document.createElement('div');
        skillDiv.className = 'expertise-skill';
        skillDiv.innerHTML = `
          <span class="skill-name">${skillName}:</span>
          <span class="skill-value">${value}</span>
        `;
        expertiseDiv.appendChild(skillDiv);
      }

      div.appendChild(expertiseDiv);
    }

    this.crewPanel.appendChild(div);
  }

  /**
   * Update the resources panel
   * @param {Object} resources - Current resources
   * @param {string} journeyType - 'field' or 'desk'
   */
  updateResourcesPanel(resources, journeyType) {
    if (!this.resourcesPanel) return;

    this.resourcesPanel.innerHTML = '';

    if (!resources || Object.keys(resources).length === 0) {
      this.resourcesPanel.innerHTML = '<div class="panel-placeholder">Supplies not loaded</div>';
      return;
    }

    const definitions = journeyType === 'field' ? FIELD_RESOURCES : DESK_RESOURCES;

    for (const [key, value] of Object.entries(resources)) {
      const def = definitions[key];
      if (!def) continue;

      const percentage = getResourcePercentage(value, def);
      let fillClass = '';
      if (percentage <= def.critical / def.max * 100) fillClass = 'critical';
      else if (percentage <= def.warning / def.max * 100) fillClass = 'low';

      const row = document.createElement('div');
      row.className = 'resource-row';

      row.innerHTML = `
        <span class="resource-label">${def.shortLabel}</span>
        <div class="resource-bar">
          <div class="resource-fill ${fillClass}" style="width: ${percentage}%"></div>
        </div>
        <span class="resource-value">${Math.round(value)}</span>
      `;

      this.resourcesPanel.appendChild(row);
    }
  }

  /**
   * Update the location panel
   * @param {Object} data - Location data
   */
  updateLocationPanel(data) {
    if (!this.locationPanel) return;

    if (!data || !data.name) {
      this.locationPanel.innerHTML = '<div class="panel-placeholder">Select your destination</div>';
      return;
    }

    // Build season display if available
    let seasonHtml = '';
    if (data.season) {
      const seasonIcons = { spring: '🌱', summer: '☀️', fall: '🍂', winter: '❄️' };
      const seasonNames = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };
      const icon = seasonIcons[data.season.currentSeason] || '';
      const name = seasonNames[data.season.currentSeason] || data.season.currentSeason;
      seasonHtml = `<div class="location-season">${icon} ${name} Y${data.season.year}</div>`;
    }

    this.locationPanel.innerHTML = `
      ${seasonHtml}
      <div class="location-name">${data.name || 'Unknown'}</div>
      <div class="location-info">${data.description || ''}</div>
      ${data.terrain ? `<div class="location-info">Terrain: ${data.terrain}</div>` : ''}
      ${data.weather ? `<div class="location-weather">Weather: ${data.weather}</div>` : ''}
      ${data.phase ? `<div class="location-info">Phase: ${data.phase}</div>` : ''}
      ${data.hazards?.length ? `<div class="location-info">Hazards: ${data.hazards.join(', ')}</div>` : ''}
    `;
  }

  /**
   * Toggle the status panel
   */
  togglePanel() {
    if (this._isPanelOpen) {
      this.closeStatusPanel();
    } else {
      this.openStatusPanel();
    }
  }

  /**
   * Open the status panel
   */
  openStatusPanel() {
    if (this.sidePanel) {
      this.sidePanel.classList.add('open');
    }
    if (this.panelBackdrop) {
      this.panelBackdrop.hidden = false;
    }
    this._isPanelOpen = true;
  }

  /**
   * Close the status panel
   */
  closeStatusPanel() {
    if (this.sidePanel) {
      this.sidePanel.classList.remove('open');
    }
    if (this.panelBackdrop) {
      this.panelBackdrop.hidden = true;
    }
    this._isPanelOpen = false;
  }

  // ============ Full Status Update ============

  /**
   * Update all status displays
   * @param {Object} journey - Journey state
   */
  updateAllStatus(journey) {
    // Status bar - label varies by journey type
    if (this.dayLabel) {
      const isFieldType = journey.journeyType === 'field' || journey.journeyType === 'recon';
      this.dayLabel.textContent = isFieldType ? 'SHIFT' : 'DAY';
    }

    // Check for protagonist mode vs crew mode
    const isProtagonistMode = journey.protagonist && (!journey.crew || journey.crew.length === 0);

    if (isProtagonistMode) {
      // Protagonist mode - show energy instead of crew
      this.updateStatusBar({
        day: journey.day,
        progress: this._calculateProgress(journey),
        crewActive: null,  // Signal protagonist mode
        crewTotal: null,
        morale: null,
        protagonist: journey.protagonist
      });
      // Show protagonist panel instead of crew panel
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
      // Panels
      this.updateCrewPanel(journey.crew);
    }

    // Resource panel type mapping
    const resourceType = (journey.journeyType === 'field' || journey.journeyType === 'recon') ? 'field' : 'desk';
    this.updateResourcesPanel(journey.resources, resourceType);

    // Location panel varies by journey type
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

  _calculateProgress(journey) {
    switch (journey.journeyType) {
      case 'recon':
      case 'field':
        if (!journey.totalDistance) return 0;
        return Math.round((journey.distanceTraveled / journey.totalDistance) * 100);

      case 'silviculture':
        // Progress based on planting and surveys
        if (!journey.planting?.blocksToPlant) return 0;
        const plantingDone = journey.planting.blocksPlanted || 0;
        const surveysDone = journey.surveys?.freeGrowingComplete || 0;
        const surveysTarget = journey.surveys?.freeGrowingTarget || 1;
        return Math.round(((plantingDone / journey.planting.blocksToPlant) * 50) +
                         ((surveysDone / surveysTarget) * 50));

      case 'planning':
        // Progress based on ministerial confidence
        return journey.plan?.ministerialConfidence || 0;

      case 'permitting':
      case 'desk':
      default:
        const target = journey.permits?.target || 0;
        if (target <= 0) return 0;
        return Math.round((journey.permits.approved / target) * 100);
    }
  }

  // ============ Modal ============

  /**
   * Show a modal dialog
   * @param {Object} options - Modal options
   */
  showModal(options) {
    const { title, content, actions = [] } = options;

    if (this.modalTitle) {
      this.modalTitle.textContent = title || '';
    }

    if (this.modalBody) {
      if (typeof content === 'string') {
        this.modalBody.innerHTML = `<p>${content}</p>`;
      } else if (content instanceof HTMLElement) {
        this.modalBody.innerHTML = '';
        this.modalBody.appendChild(content);
      }
    }

    if (this.modalActions) {
      this.modalActions.innerHTML = '';

      const buttons = actions.length ? actions : [{ label: 'OK', primary: true }];

      for (const action of buttons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `modal-btn ${action.primary ? 'primary' : ''}`.trim();
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          this.closeModal();
          if (action.onClick) action.onClick();
        });
        this.modalActions.appendChild(btn);
      }
    }

    if (this.modal) {
      this.modal.hidden = false;
    }
  }

  /**
   * Close the modal
   */
  closeModal() {
    if (this.modal) {
      this.modal.hidden = true;
    }
    if (this._modalOnClose) {
      this._modalOnClose();
      this._modalOnClose = null;
    }
  }

  /**
   * Show help modal
   */
  showHelp() {
    this.showModal({
      title: 'HOW TO PLAY',
      content: `
        <p><strong>BC FORESTRY TRAIL</strong></p>
        <p>Guide your crew through the northern BC wilderness.</p>
        <br>
        <p><strong>Controls:</strong></p>
        <p>[1-9] - Select options</p>
        <p>[S] - Toggle status panel</p>
        <p>[L] - View journey log</p>
        <p>[ESC] - Close panels</p>
        <br>
        <p><strong>Field Roles:</strong></p>
        <p>Survey forest blocks during 8-9 hour shifts. Keep radio contact while managing fuel, food, and equipment.</p>
        <br>
        <p><strong>Desk Roles:</strong></p>
        <p>Process permits against a deadline. Manage budget and stakeholders.</p>
        <br>
        <p><strong>Keep your crew healthy and reach your goal!</strong></p>
      `,
      actions: [{ label: 'Got it!', primary: true }]
    });
  }

  showGlossary() {
    const combined = [...(Array.isArray(GLOSSARY_TERMS) ? GLOSSARY_TERMS : []), ...(Array.isArray(LEGACY_GLOSSARY_TERMS) ? LEGACY_GLOSSARY_TERMS : [])]
      .filter((t) => t && typeof t.term === 'string' && typeof t.description === 'string');

    const seen = new Set();
    const terms = combined.filter((t) => {
      const key = t.term.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.term.localeCompare(b.term));

    this.openModal({
      title: 'GLOSSARY',
      dismissible: true,
      buildContent: (container) => {
        const wrapper = document.createElement('div');

        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search terms...';
        input.className = 'text-input';
        input.style.width = '100%';
        input.style.marginBottom = '12px';

        const list = document.createElement('div');
        list.style.maxHeight = '52vh';
        list.style.overflow = 'auto';

        const render = (query) => {
          const q = (query || '').trim().toLowerCase();
          const filtered = q
            ? terms.filter((t) => t.term.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
            : terms;

          list.innerHTML = '';

          if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No matches.';
            empty.className = 'term-dim';
            list.appendChild(empty);
            return;
          }

          for (const t of filtered.slice(0, 80)) {
            const row = document.createElement('div');
            row.style.marginBottom = '10px';

            const title = document.createElement('div');
            title.textContent = t.term;
            title.style.fontWeight = '700';

            const desc = document.createElement('div');
            desc.textContent = t.description;
            desc.className = 'term-dim';
            desc.style.marginTop = '2px';

            row.appendChild(title);
            row.appendChild(desc);
            list.appendChild(row);
          }
        };

        input.addEventListener('input', () => render(input.value));

        wrapper.appendChild(input);
        wrapper.appendChild(list);
        container.appendChild(wrapper);

        render('');
        setTimeout(() => input.focus(), 0);
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  }

  /**
   * Show journey log modal
   * @param {Object[]} logEntries - Formatted log entries
   */
  showLog(logEntries) {
    if (!logEntries || logEntries.length === 0) {
      this.showModal({
        title: 'JOURNEY LOG',
        content: '<p>No events recorded yet.</p>',
        actions: [{ label: 'Close', primary: true }]
      });
      return;
    }

    // Build log content
    const logHtml = logEntries.map(entry => {
      const icon = entry.icon || '·';
      const detail = entry.detail ? ` - ${entry.detail}` : '';
      const dayLabel = entry.dayLabel || 'Day';
      return `<div class="log-entry log-${entry.type}">
        <span class="log-day">${dayLabel} ${entry.day}</span>
        <span class="log-icon">${icon}</span>
        <span class="log-summary">${entry.summary}${detail}</span>
      </div>`;
    }).join('');

    this.showModal({
      title: 'JOURNEY LOG',
      content: `<div class="log-list">${logHtml}</div>`,
      actions: [{ label: 'Close', primary: true }]
    });
  }

  /**
   * Show restart confirmation
   */
  confirmRestart() {
    return new Promise((resolve) => {
      this.showModal({
        title: 'RESTART GAME?',
        content: 'Your current progress will be lost.',
        actions: [
          { label: 'Cancel', onClick: () => resolve(false) },
          { label: 'Restart', primary: true, onClick: () => resolve(true) }
        ]
      });
    });
  }

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

  /**
   * Check if modal is currently open
   * @returns {boolean}
   */
  isModalOpen() {
    return this.modal && !this.modal.hidden;
  }

  /**
   * Open a modal dialog (game.js-style interface)
   * @param {Object} options - Modal options
   */
  openModal(options) {
    const { title, dismissible = false, buildContent, actions = [], onClose } = options;

    if (this.modalTitle) {
      this.modalTitle.textContent = title || '';
    }

    if (this.modalBody) {
      this.modalBody.innerHTML = '';
      if (buildContent) {
        buildContent(this.modalBody);
      }
    }

    if (this.modalActions) {
      this.modalActions.innerHTML = '';

      for (const action of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `modal-btn ${action.primary ? 'primary' : ''}`.trim();
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          if (action.onSelect) action.onSelect();
        });
        this.modalActions.appendChild(btn);
      }
    }

    this._modalOnClose = onClose;
    this._modalDismissible = dismissible;

    if (this.modal) {
      this.modal.hidden = false;
    }
  }

  // ============ ASCII Status Display ============

  /**
   * Render a detailed ASCII status box for field journey
   * @param {Object} journey - Journey state
   * @returns {string} ASCII art status display
   */
  renderFieldStatusBox(journey) {
    const block = journey.blocks?.[journey.currentBlockIndex];
    const progress = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
    const progressBarText = this._makeProgressBar(progress, 20);

    const lines = [
      `Shift ${journey.day} | ${block?.name || 'Unknown'}`,
      `Weather: ${journey.weather?.name || 'Clear'}`,
      '',
      `Progress: ${progressBarText} ${progress}%`,
      `Traverse: ${Math.round(journey.distanceTraveled)}/${journey.totalDistance} km`,
      '',
      `Crew: ${getActiveCrewCount(journey.crew)}/${journey.crew.length} active`,
      `Morale: ${Math.round(getAverageMorale(journey.crew))}%`
    ];

    return box(lines, { double: true, title: 'STATUS' });
  }

  /**
   * Render a detailed ASCII status box for desk journey
   * @param {Object} journey - Journey state
   * @returns {string} ASCII art status display
   */
  renderDeskStatusBox(journey) {
    const daysRemaining = journey.deadline - journey.day;
    const approvalRate = journey.permits.target > 0
      ? Math.round((journey.permits.approved / journey.permits.target) * 100)
      : 0;

    const lines = [
      `Day ${journey.day} of ${journey.deadline} | ${daysRemaining} days remaining`,
      '',
      `Permits: ${journey.permits.approved}/${journey.permits.target} approved (${approvalRate}%)`,
      `Pipeline: ${journey.permits.submitted} submitted, ${journey.permits.inReview} in review`,
      '',
      `Team: ${getActiveCrewCount(journey.crew)}/${journey.crew.length} active`,
      `Budget: $${Math.round(journey.resources.budget).toLocaleString()}`
    ];

    return box(lines, { double: true, title: 'STATUS' });
  }

  _makeProgressBar(percent, width) {
    const filled = Math.round((percent / 100) * width);
    return PROGRESS.FULL.repeat(filled) + PROGRESS.EMPTY.repeat(width - filled);
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
  }

  /**
   * Show landing screen for restart
   */
  showLandingForRestart() {
    this._showLandingScreen();
    this._hideInitOverlay();
    this.closeModal();
  }
}
