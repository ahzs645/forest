/**
 * Terminal UI Module
 * Handles all display and input for the Oregon Trail-style interface
 */

import { progressBar, box, BOX, PROGRESS, healthIndicator } from './ascii.js';
import { getCrewDisplayInfo, getActiveCrewCount, getAverageMorale } from './crew.js';
import { FIELD_RESOURCES, DESK_RESOURCES, getResourcePercentage } from './resources.js';
import { GLOSSARY_TERMS } from './data/glossary.js';
import { LEGACY_GLOSSARY_TERMS } from './data/legacyGlossary.js';

export class TerminalUI {
  constructor() {
    // DOM elements
    this.terminal = document.getElementById('terminal');
    this.choices = document.getElementById('choices');
    this.inputWrapper = document.getElementById('input-wrapper');
    this.textInput = document.getElementById('text-input');
    this.submitBtn = document.getElementById('submit-btn');

    // Status bar elements
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

    // State
    this._pending = null;
    this._choiceHandler = null;
    this._keyHandler = null;
    this._onRestart = null;
    this._isPanelOpen = false;

    // Initialize event listeners
    this._initEventListeners();
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
    if (this.crewValue) {
      this.crewValue.textContent = `${data.crewActive || 0}/${data.crewTotal || 5}`;
    }
    if (this.moraleValue) {
      this.moraleValue.textContent = `${data.morale || 0}%`;
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

    this.locationPanel.innerHTML = `
      <div class="location-name">${data.name || 'Unknown'}</div>
      <div class="location-info">${data.description || ''}</div>
      ${data.terrain ? `<div class="location-info">Terrain: ${data.terrain}</div>` : ''}
      ${data.weather ? `<div class="location-weather">Weather: ${data.weather}</div>` : ''}
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
    // Status bar
    this.updateStatusBar({
      day: journey.day,
      progress: this._calculateProgress(journey),
      crewActive: getActiveCrewCount(journey.crew),
      crewTotal: journey.crew.length,
      morale: Math.round(getAverageMorale(journey.crew))
    });

    // Panels
    this.updateCrewPanel(journey.crew);
    this.updateResourcesPanel(journey.resources, journey.journeyType);

    // Location
    if (journey.journeyType === 'field') {
      const block = journey.blocks?.[journey.currentBlockIndex];
      this.updateLocationPanel({
        name: block?.name || 'Unknown Location',
        description: block?.description,
        terrain: block?.terrain,
        weather: journey.weather?.name,
        hazards: block?.hazards
      });
    } else {
      this.updateLocationPanel({
        name: `Day ${journey.day} of ${journey.deadline}`,
        description: `${journey.deadline - journey.day} days remaining`,
        weather: journey.currentPhase
      });
    }
  }

  _calculateProgress(journey) {
    if (journey.journeyType === 'field') {
      return Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
    } else {
      return Math.round((journey.day / journey.deadline) * 100);
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
        <p>Travel through forest blocks. Manage fuel, food, and equipment.</p>
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
      return `<div class="log-entry log-${entry.type}">
        <span class="log-day">Day ${entry.day}</span>
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
      `Day ${journey.day} | ${block?.name || 'Unknown'}`,
      `Weather: ${journey.weather?.name || 'Clear'}`,
      '',
      `Progress: ${progressBarText} ${progress}%`,
      `Distance: ${Math.round(journey.distanceTraveled)}/${journey.totalDistance} km`,
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

    // Reset status bar
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
  }
}
