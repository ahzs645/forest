/**
 * Init Flow Module
 * Handles landing screen and game initialization flow
 */

// Role icons mapping (Unicode symbols matching reference)
export const ROLE_ICONS = {
  planner: '☐',      // Empty checkbox - planning/analysis
  permitter: '☑',    // Checked box - permits/approvals
  recce: '⛷',        // Person figure - field recon
  silviculture: '☘', // Plant/seedling - silviculture
  default: '◉'
};

/**
 * Init flow mixin
 */
export const InitFlowMixin = {
  /**
   * Initialize landing screen event listeners
   * @private
   */
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

    // Settings button - open settings modal
    this.settingsBtn?.addEventListener('click', () => {
      this.showSettingsModal();
    });

    // Modern settings button (in header)
    this.modernSettingsBtn?.addEventListener('click', () => {
      this.showSettingsModal();
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
  },

  /**
   * Show landing screen
   * @private
   */
  _showLandingScreen() {
    if (this.landingScreen) {
      this.landingScreen.hidden = false;
      this.landingScreen.style.display = 'flex';
    }
  },

  /**
   * Hide landing screen
   * @private
   */
  _hideLandingScreen() {
    if (this.landingScreen) {
      this.landingScreen.hidden = true;
      this.landingScreen.style.display = 'none';
    }
  },

  /**
   * Initialize intro flow event listeners
   * @private
   */
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
  },

  /**
   * Switch to a specific init step
   * @private
   */
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
  },

  /**
   * Show init overlay
   * @private
   */
  _showInitOverlay() {
    if (!this.initOverlay) return;
    this.initOverlay.hidden = false;
    this.initOverlay.style.display = 'flex';
  },

  /**
   * Hide init overlay
   * @private
   */
  _hideInitOverlay() {
    if (!this.initOverlay) return;
    this.initOverlay.hidden = true;
    this.initOverlay.style.display = 'none';
  },

  /**
   * Build init payload from current state
   * @private
   */
  _buildInitPayload() {
    const crewName = this.crewNameInput?.value?.trim() || 'The Timber Wolves';
    const role = this._initRoles?.find((r) => r.id === this._initState.roleId) || this._initRoles?.[0];
    const area = this._initAreas?.find((a) => a.id === this._initState.areaId) || this._initAreas?.[0];

    return {
      crewName,
      role,
      area,
    };
  },

  /**
   * Render role selection cards
   * @private
   */
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
  },

  /**
   * Set role glossary terms
   * @private
   */
  _setRoleGlossaryTerms() {
    this._roleGlossaryTerms = ['Silviculture', 'Referral', 'Hydrology Assessment']
      .map((term) => this._findGlossaryTerm(term))
      .filter(Boolean);

    this._syncGlossaryButtonState(this.roleGlossaryBtn, this._roleGlossaryTerms);
  },

  /**
   * Render area list
   * @private
   */
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
  },

  /**
   * Render area detail panel
   * @private
   */
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
  },

  /**
   * Render area-specific glossary terms
   * @private
   */
  _renderAreaGlossary(area) {
    const entries = [this._findGlossaryTerm('BEC Zone'), this._findGlossaryTerm('Riparian Reserve')].filter(Boolean);

    if (area?.tags?.includes('wildfire')) {
      const wildfire = this._findGlossaryTerm('Wildfire Hazard Abatement');
      if (wildfire) entries.push(wildfire);
    }

    this._areaGlossaryTerms = entries;
    this._syncGlossaryButtonState(this.areaGlossaryBtn, this._areaGlossaryTerms);
  },

  /**
   * Sync glossary button state
   * @private
   */
  _syncGlossaryButtonState(button, terms = []) {
    if (!button) return;
    const hasEntries = Array.isArray(terms) && terms.length > 0;
    button.disabled = !hasEntries;
    button.setAttribute('aria-disabled', hasEntries ? 'false' : 'true');
  },

  /**
   * Run the full initialization flow
   * @param {Object} options - Init options
   * @returns {Promise<Object>} Init result
   */
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
  },

  /**
   * Show landing screen for restart
   */
  showLandingForRestart() {
    this._showLandingScreen();
    this._hideInitOverlay();
    this.closeModal();
  }
};
