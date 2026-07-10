/**
 * Init Flow Module
 * Handles landing screen and game initialization flow
 */

import { getRoleAreaBriefing } from "../data/roleAreaIntel.js";
import { getPlanningAreaSnapshot } from "../data/planningBlocks.js";
import { getRoleProfessionalContext } from "../data/professionalPractice.js";
import { loadActiveRun } from "../game/saveLoad.js";

// Role icons mapping (Unicode symbols matching reference)
export const ROLE_ICONS = {
  planner: '☐',      // Empty checkbox - planning/analysis
  permitter: '☑',    // Checked box - permits/approvals
  recce: '⛷',        // Person figure - field recon
  silviculture: '☘', // Plant/seedling - silviculture
  default: '◉'
};

// Newer expedition roles that are playable but less battle-tested than the
// field roles. Flagged in the picker so first-time players know what to expect.
export const EXPERIMENTAL_ROLE_IDS = new Set(['manager']);

function getAreaScrutinyProfile(area) {
  const tags = Array.isArray(area?.tags) ? area.tags : [];
  let score = 20;
  if (tags.includes('community-interface')) score += 18;
  if (tags.includes('community-water') || tags.includes('watershed')) score += 16;
  if (tags.includes('caribou')) score += 12;
  if (tags.includes('salmon') || tags.includes('karst')) score += 14;
  if (tags.includes('gas-interface')) score += 10;

  if (score >= 60) return { label: 'HIGH', score };
  if (score >= 40) return { label: 'ELEVATED', score };
  return { label: 'LOW', score };
}

function formatSnapshotDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

function formatDistrictList(snapshot) {
  if (!snapshot?.districts?.length) return 'No district snapshot';
  return snapshot.districts.join(', ');
}

function getSnapshotIndicatorEntries(snapshot) {
  const counts = snapshot?.signalCounts || {};
  return [
    counts.ogmaNearby ? `OGMA ${counts.ogmaNearby}` : '',
    counts.whaNoHarvestNearby ? `WHA ${counts.whaNoHarvestNearby}` : '',
    counts.speciesAtRiskNearby ? `SAR ${counts.speciesAtRiskNearby}` : '',
    counts.firstNationsReserveNearby ? `Consult ${counts.firstNationsReserveNearby}` : '',
  ].filter(Boolean);
}

function shouldShowSampleFileIds(role) {
  return role?.id === 'planner' || role?.id === 'permitter';
}

function formatProcessHookSummary(hook) {
  if (!hook) return '';
  const wait = hook.minimumWait?.label ? ` | ${hook.minimumWait.label}` : '';
  const docs = Array.isArray(hook.documents) && hook.documents.length
    ? ` | Docs: ${hook.documents.slice(0, 2).join(', ')}`
    : '';
  return `${hook.title}${wait}${docs}`;
}

const ROLE_GLOSSARY_TERMS = {
  planner: ['BEC Zone', 'Forest Operations Map (FOM)', 'Professional Discretion', 'Forest Professionals BC (FPBC)'],
  permitter: ['Referral', 'Cutting Permit', 'Road Permit', 'Special Use Permit', 'Forest Professionals BC (FPBC)'],
  recce: ['Road Use Permit', 'Riparian Reserve', 'Archaeological Impact Assessment (AIA)', 'Forest Professionals BC (FPBC)'],
  silviculture: ['Silviculture', 'Free Growing', 'Continuing Professional Development (CPD)', 'Forest Professionals BC (FPBC)'],
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

    // Experimental modes (Crisis Command) stay hidden until the core loop is
    // solid. Reveal them only when the player explicitly opts in.
    if (this.crisisModeBtn && this._isExperimentalEnabled()) {
      this.crisisModeBtn.hidden = false;
    }

    // Campaign — the unified year-long mode (all four seasons, four hats).
    this.campaignBtn?.addEventListener('click', () => {
      this._hideLandingScreen();
      if (this._resolveLanding) {
        const resolve = this._resolveLanding;
        this._resolveLanding = null;
        resolve({ action: 'campaign' });
      }
    });

    // New Game button
    this.newGameBtn?.addEventListener('click', () => {
      this._hideLandingScreen();
      if (this._resolveLanding) {
        const resolve = this._resolveLanding;
        this._resolveLanding = null;
        resolve({ action: 'new' });
      }
    });

    // Seasonal Strategy now runs inside this terminal (js/game/seasonalAdapter.js)
    // instead of navigating to the separate React app — one site, one UI.
    this.tuiModeBtn?.addEventListener('click', () => {
      this._hideLandingScreen();
      if (this._resolveLanding) {
        const resolve = this._resolveLanding;
        this._resolveLanding = null;
        resolve({ action: 'seasonal' });
      }
    });

    this.crisisModeBtn?.addEventListener('click', () => {
      // Stays inert while hidden so a stray programmatic click cannot launch an
      // experimental mode the player never opted into.
      if (this.crisisModeBtn.hidden) return;
      window.location.assign('./tui.html?mode=crisis-command');
    });

    // Load Data button — resumes the auto-saved expedition if one exists.
    // Runs persist at every in-game day boundary, so this is the same run the
    // resume prompt offers after a refresh; there is no separate save slot.
    this.loadGameBtn?.addEventListener('click', () => {
      const savedRun = loadActiveRun();
      if (savedRun) {
        this._hideLandingScreen();
        if (this._resolveLanding) {
          const resolve = this._resolveLanding;
          this._resolveLanding = null;
          resolve({ action: 'load', journey: savedRun });
        }
        return;
      }

      this.showModal({
        title: 'LOAD DATA',
        content: 'No saved expedition found. Runs save automatically at the end of '
          + 'each in-game day — reload the page anytime to pick one back up, and '
          + 'you will be asked before anything is overwritten.',
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
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        this.tuiModeBtn?.click();
      } else if (e.key === 'c' || e.key === 'C') {
        // [C] belongs to the Campaign; Crisis Command (also C, experimental)
        // only claims the key when it is visible and Campaign is not.
        e.preventDefault();
        if (this.campaignBtn) {
          this.campaignBtn.click();
        } else if (this.crisisModeBtn && !this.crisisModeBtn.hidden) {
          this.crisisModeBtn.click();
        }
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
   * Whether experimental modes should be exposed on the landing screen.
   * Opt in with ?experimental=1 in the URL or localStorage forestExperimental=1.
   * @private
   */
  _isExperimentalEnabled() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('experimental') === '1' || params.has('dev')) return true;
      return window.localStorage?.getItem('forestExperimental') === '1';
    } catch {
      return false;
    }
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
    // A mission belongs to a run; back on the landing hub there isn't one.
    this.clearMissionStatus?.();
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

    // The status footer advertises "[ENTER] CONFIRM SELECTION" — make it true.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (!this.initOverlay || this.initOverlay.hidden) return;
      if (this.isModalOpen()) return;

      const continueBtn = this.introStep?.classList.contains('active') ? this.introContinueBtn
        : this.roleStep?.classList.contains('active') ? this.roleContinueBtn
        : this.areaStep?.classList.contains('active') ? this.areaContinueBtn
        : null;
      if (!continueBtn) return;

      // If another button has focus (e.g. a role/area card reached via Tab),
      // let the browser's native Enter-activates-it behaviour run instead.
      const active = document.activeElement;
      if (active && active.tagName === 'BUTTON' && active !== continueBtn) return;

      e.preventDefault();
      continueBtn.click();
    });
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
      const isExperimental = EXPERIMENTAL_ROLE_IDS.has(role.id);
      if (isExperimental) {
        card.classList.add('experimental');
      }
      const experimentalBadge = isExperimental
        ? '<span class="role-experimental" title="Newer mode — less playtested than the field roles">EXPERIMENTAL</span>'
        : '';

      card.innerHTML = `
        <div class="role-icon-box">
          <span class="role-icon">${icon}</span>
        </div>
        <div class="role-info">
          <div class="role-header">
            <span class="role-id">0${index + 1} ::</span>
            <h3 class="role-name">${role.name.toUpperCase()}</h3>
            ${experimentalBadge}
          </div>
          <p class="role-desc">${role.description}</p>
        </div>
      `;
      card.addEventListener('click', () => {
        this._initState.roleId = role.id;
        this._renderRoleCards(roles);
        this._setRoleGlossaryTerms(role);
        const activeArea = this._initAreas?.find((candidate) => candidate.id === this._initState.areaId) || this._initAreas?.[0];
        if (activeArea) {
          this._renderAreaDetail(activeArea, role);
        }
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
  _setRoleGlossaryTerms(role = null) {
    const selectedRole = role || this._initRoles?.find((candidate) => candidate.id === this._initState.roleId) || this._initRoles?.[0];
    const terms = ROLE_GLOSSARY_TERMS[selectedRole?.id] || ['Silviculture', 'Referral', 'Hydrology Assessment'];

    this._roleGlossaryTerms = terms
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
      const snapshot = getPlanningAreaSnapshot(area.id, area, { sampleCount: 2 });
      const selectionLine = [
        area.becCode || area.becZone,
        snapshot.districts?.[0] || '',
        snapshot.blockCount ? `${snapshot.blockCount} snapshot files` : ''
      ].filter(Boolean).join(' | ');
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `area-item ${this._initState.areaId === area.id ? 'selected' : ''}`;
      item.setAttribute('role', 'listitem');
      item.innerHTML = `
        <div class="area-number">[${String(index + 1).padStart(2, '0')}]</div>
        <div>
          <strong>${area.name}</strong>
          <div class="muted">${area.description}</div>
          <div class="muted">${selectionLine}</div>
        </div>
      `;
      item.addEventListener('click', () => {
        this._initState.areaId = area.id;
        this._renderAreaList(areas);
        const activeRole = this._initRoles?.find((candidate) => candidate.id === this._initState.roleId) || this._initRoles?.[0];
        this._renderAreaDetail(area, activeRole);
        this._renderAreaGlossary(area);
      });

      this.areaList.appendChild(item);
    });
  },

  /**
   * Render area detail panel
   * @private
   */
  _renderAreaDetail(area, role = null) {
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
      <div>
        <div class="detail-label">BASE SCRUTINY</div>
        <div class="detail-value">${getAreaScrutinyProfile(area).label}</div>
      </div>
    `;
    this.areaDetail.appendChild(meta);

    const briefing = getRoleAreaBriefing(role?.id, area, { maxFinds: 4 });
    const planningSnapshot = briefing.planningSnapshot || getPlanningAreaSnapshot(area.id, area);
    const professionalContext = role
      ? getRoleProfessionalContext(role.id, { area })
      : { obligations: [], paperwork: [], enforcement: [], breaches: [] };

    if (briefing.zoneSummary) {
      const zoneReality = document.createElement('div');
      zoneReality.innerHTML = '<div class="detail-label">ZONE REALITY</div>';

      const note = document.createElement('p');
      note.className = 'detail-note';
      note.textContent = briefing.zoneSummary;
      zoneReality.appendChild(note);
      this.areaDetail.appendChild(zoneReality);
    }

    if (planningSnapshot?.blockCount) {
      const snapshot = document.createElement('div');
      snapshot.innerHTML = '<div class="detail-label">CURRENT SNAPSHOT</div>';

      const note = document.createElement('p');
      note.className = 'detail-note';
      const updatedOn = formatSnapshotDate(planningSnapshot.generatedAt);
      const updateLabel = updatedOn ? ` Snapshot updated ${updatedOn}.` : '';
      note.textContent = `${planningSnapshot.blockCount} cached BC OpenMaps planning candidates from ${formatDistrictList(planningSnapshot)}.${updateLabel}`;
      snapshot.appendChild(note);

      const chips = document.createElement('div');
      chips.className = 'chip-row';

      const chipLabels = [
        `TRIAGE ${planningSnapshot.recommendedTriageLabel || 'Balanced'}`,
        ...getSnapshotIndicatorEntries(planningSnapshot),
      ];

      chipLabels.forEach((label) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = label;
        chips.appendChild(chip);
      });

      if (chipLabels.length) {
        snapshot.appendChild(chips);
      }

      if (shouldShowSampleFileIds(role) && planningSnapshot.sampleBlocks?.length) {
        const sampleList = document.createElement('ul');
        sampleList.className = 'intel-list';

        planningSnapshot.sampleBlocks.forEach((block) => {
          const item = document.createElement('li');
          const species = block.species ? ` | ${block.species}` : '';
          item.textContent = `Example public file: ${block.compactId} (${block.areaHa.toFixed(1)} ha${species})`;
          sampleList.appendChild(item);
        });

        snapshot.appendChild(sampleList);
      } else if (planningSnapshot.dominantConstraint?.label) {
        const watchout = document.createElement('p');
        watchout.className = 'detail-note';
        watchout.textContent = `Snapshot watchout: ${planningSnapshot.dominantConstraint.label} is leading in the current candidate set.`;
        snapshot.appendChild(watchout);
      }

      this.areaDetail.appendChild(snapshot);
    }

    if (professionalContext.areaBurden) {
      const burden = document.createElement('div');
      burden.innerHTML = '<div class="detail-label">COMPLIANCE BURDEN</div>';

      const note = document.createElement('p');
      note.className = 'detail-note';
      note.textContent = professionalContext.areaBurden.title;
      burden.appendChild(note);

      const chips = document.createElement('div');
      chips.className = 'chip-row';

      [
        `Paperwork ${professionalContext.areaBurden.paperworkLoad}`,
        `Audit ${professionalContext.areaBurden.auditExposure}`,
      ].forEach((label) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = label;
        chips.appendChild(chip);
      });

      burden.appendChild(chips);

      if (professionalContext.areaBurden.watchouts?.length) {
        const list = document.createElement('ul');
        list.className = 'intel-list';
        professionalContext.areaBurden.watchouts.slice(0, 2).forEach((item) => {
          const row = document.createElement('li');
          row.textContent = item;
          list.appendChild(row);
        });
        burden.appendChild(list);
      }

      this.areaDetail.appendChild(burden);
    }

    if (
      professionalContext.obligations?.length ||
      briefing.processHooks?.length ||
      professionalContext.enforcement?.length ||
      professionalContext.breaches?.length
    ) {
      const professional = document.createElement('div');
      professional.innerHTML = '<div class="detail-label">PROFESSIONAL WATCH</div>';

      const obligation = professionalContext.obligations?.[0];
      if (obligation) {
        const note = document.createElement('p');
        note.className = 'detail-note';
        note.textContent = obligation.summary;
        professional.appendChild(note);
      }

      if ((briefing.processHooks || professionalContext.paperwork)?.length) {
        const list = document.createElement('ul');
        list.className = 'intel-list';
        (briefing.processHooks || professionalContext.paperwork).slice(0, 2).forEach((item) => {
          const row = document.createElement('li');
          row.textContent = formatProcessHookSummary(item);
          list.appendChild(row);
        });
        professional.appendChild(list);
      }

      if (professionalContext.enforcement?.[0]) {
        const note = document.createElement('p');
        note.className = 'detail-note';
        note.textContent = `Enforcement pattern: ${professionalContext.enforcement[0].title}.`;
        professional.appendChild(note);
      }

      if (professionalContext.breaches?.[0]) {
        const note = document.createElement('p');
        note.className = 'detail-note';
        note.textContent = `Compliance trap: ${professionalContext.breaches[0].summary}`;
        professional.appendChild(note);
      }

      this.areaDetail.appendChild(professional);
    }

    if (briefing.seasonalSignals?.length) {
      const watchouts = document.createElement('div');
      watchouts.innerHTML = '<div class="detail-label">SEASONAL WATCHOUTS</div>';

      const list = document.createElement('ul');
      list.className = 'intel-list';
      briefing.seasonalSignals.slice(0, 3).forEach((signal) => {
        const item = document.createElement('li');
        item.textContent = signal;
        list.appendChild(item);
      });

      watchouts.appendChild(list);
      this.areaDetail.appendChild(watchouts);
    }

    if (briefing.likelyFinds?.length) {
      const finds = document.createElement('div');
      const label = role ? `LIKELY FINDS FOR ${role.name.toUpperCase()}` : 'LIKELY FINDS';
      finds.innerHTML = `<div class="detail-label">${label}</div>`;

      const list = document.createElement('ul');
      list.className = 'intel-list';
      briefing.likelyFinds.forEach((finding) => {
        const item = document.createElement('li');
        item.textContent = finding;
        list.appendChild(item);
      });

      finds.appendChild(list);
      this.areaDetail.appendChild(finds);
    }

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
    // Show landing screen first and wait for the player to pick New Game or
    // Load Data. Load Data short-circuits the role/area flow and resumes a run.
    if (this.landingScreen) {
      this._showLandingScreen();
      const landingChoice = await new Promise((resolve) => {
        this._resolveLanding = resolve;
      });
      if (landingChoice?.action === 'load' && landingChoice.journey) {
        this._hideLandingScreen();
        return { action: 'load', journey: landingChoice.journey };
      }
      if (landingChoice?.action === 'seasonal' || landingChoice?.action === 'campaign') {
        this._hideLandingScreen();
        return { action: landingChoice.action };
      }
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
    this._setRoleGlossaryTerms(roles[0]);
    this._renderAreaList(areas);
    this._renderAreaDetail(areas[0], roles[0]);
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
