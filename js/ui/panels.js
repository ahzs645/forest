/**
 * Panels Module
 * Handles status bar, side panel, and panel content updates
 */

import { progressBar, box, PROGRESS } from '../ascii.js';
import { displayMode } from '../displayMode.js';
import { getCrewDisplayInfo, getActiveCrewCount, getAverageMorale } from '../crew.js';
import { FIELD_RESOURCES, DESK_RESOURCES, getResourcePercentage } from '../resources.js';
import { getOperationalProgress } from '../journey.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Panel management mixin
 */
export const PanelsMixin = {
  /**
   * Set the mission dashboard: the structured status a mode used to print as
   * prose into the log every day. Screen-composed like the seasonal TUI's
   * Dashboard pane — the content view keeps only narrative.
   *
   * All fields optional:
   * @param {Object} status
   * @param {string} status.objective - The win condition / current goal
   * @param {Object} status.meter - Headline progress: { label, value(0-100), text }
   * @param {Array}  status.facts - [{ label, value, tone? }] quick state rows
   * @param {Array}  status.checklist - [{ label, done }] current-step checklist
   * @param {string} status.guidance - Next best move
   * @param {Array}  status.alerts - [{ level: 'ok'|'warn'|'danger', text }]
   */
  setMissionStatus(status) {
    this._missionStatus = status || null;
    this._renderMissionPanel();
  },

  clearMissionStatus() {
    this._missionStatus = null;
    this._renderMissionPanel();
  },

  /** @private */
  _renderMissionPanel() {
    const status = this._missionStatus;

    if (this.missionSection) {
      this.missionSection.hidden = !status;
    }
    if (this.missionStrip) {
      this.missionStrip.hidden = !status;
    }
    if (!status) {
      if (this.missionPanel) this.missionPanel.innerHTML = '';
      if (this.missionStrip) this.missionStrip.innerHTML = '';
      return;
    }

    const parts = [];

    if (status.objective) {
      parts.push(`<div class="mission-objective">${escapeHtml(status.objective)}</div>`);
    }

    if (status.meter && Number.isFinite(status.meter.value)) {
      const v = Math.max(0, Math.min(100, Math.round(status.meter.value)));
      parts.push(`
        <div class="mission-meter">
          <div class="mission-meter-head">
            <span class="mission-meter-label">${escapeHtml(status.meter.label || 'Progress')}</span>
            <span class="mission-meter-value">${escapeHtml(status.meter.text || `${v}%`)}</span>
          </div>
          <div class="mission-meter-track"><div class="mission-meter-fill" style="width: ${v}%"></div></div>
        </div>
      `);
    }

    if (Array.isArray(status.facts) && status.facts.length) {
      const rows = status.facts
        .filter(f => f && f.value !== undefined && f.value !== null && f.value !== '')
        .map(f => `
          <div class="mission-fact${f.tone ? ` tone-${escapeHtml(f.tone)}` : ''}">
            <span class="mission-fact-label">${escapeHtml(f.label)}</span>
            <span class="mission-fact-value">${escapeHtml(f.value)}</span>
          </div>
        `).join('');
      parts.push(`<div class="mission-facts">${rows}</div>`);
    }

    if (Array.isArray(status.checklist) && status.checklist.length) {
      const rows = status.checklist.map(item => `
        <div class="mission-check ${item.done ? 'done' : 'open'}">
          <span class="mission-check-box">${item.done ? '[x]' : '[ ]'}</span>
          <span class="mission-check-label">${escapeHtml(item.label)}</span>
        </div>
      `).join('');
      parts.push(`<div class="mission-checklist">${rows}</div>`);
    }

    if (status.guidance) {
      parts.push(`<div class="mission-guidance">❯ ${escapeHtml(status.guidance)}</div>`);
    }

    if (Array.isArray(status.alerts) && status.alerts.length) {
      const rows = status.alerts
        .filter(a => a && a.text)
        .map(a => `<div class="mission-alert ${escapeHtml(a.level || 'warn')}">${escapeHtml(a.text)}</div>`)
        .join('');
      parts.push(rows);
    }

    if (this.missionPanel) {
      this.missionPanel.innerHTML = parts.join('');
    }

    // Compact strip for mobile, where the dashboard hides behind [S]:
    // headline meter + objective on one line.
    if (this.missionStrip) {
      const v = status.meter && Number.isFinite(status.meter.value)
        ? Math.max(0, Math.min(100, Math.round(status.meter.value)))
        : null;
      const meterHtml = v === null ? '' : `
        <span class="strip-meter">${progressBar(v, 6, false)}</span>
        <span class="strip-meter-text">${escapeHtml(status.meter.text || `${v}%`)}</span>
      `;
      const objective = status.objective || status.guidance || '';
      this.missionStrip.innerHTML = `${meterHtml}<span class="strip-objective">${escapeHtml(objective)}</span>`;
    }
  },

  /**
   * Update the quick status bar
   * @param {Object} data - Status data
   */
  updateStatusBar(data) {
    if (this.dayValue) {
      this.dayValue.textContent = data.day || '1';
    }
    if (this.progressValue) {
      // Progress is a goal meter, not a health meter — never colored as risk.
      this._setMeterValue(this.progressValue, data.progress || 0, '%', false, false);
    }

    // Check for protagonist mode vs crew mode
    if (data.protagonist) {
      // Protagonist (desk) mode: these tiles show the protagonist's own energy
      // and stress — label them as such. (They used to keep the CREW/MORALE
      // labels, so "MORALE HIGH" actually meant *stress* was high.)
      if (this.crewLabel) {
        this.crewLabel.textContent = 'ENERGY';
      }
      if (this.crewValue) {
        this._setMeterValue(this.crewValue, data.protagonist.energy || 0, '%');
      }
      if (this.moraleLabel) {
        this.moraleLabel.textContent = 'STRESS';
      }
      if (this.moraleValue) {
        // Stress reads inverted: high is bad.
        this._setMeterValue(this.moraleValue, data.protagonist.stress || 0, '%', true);
      }
    } else {
      // Crew mode - traditional display
      if (this.crewLabel) {
        this.crewLabel.textContent = 'CREW';
      }
      if (this.crewValue) {
        this.crewValue.textContent = `${data.crewActive || 0}/${data.crewTotal || 5}`;
      }
      if (this.moraleLabel) {
        this.moraleLabel.textContent = 'MORALE';
      }
      if (this.moraleValue) {
        this._setMeterValue(this.moraleValue, data.morale || 0, '%');
      }
    }
  },

  /**
   * Render "▓▓▓░░░ 42%" into a status-bar value slot: a compact ASCII meter
   * plus the number. Meter color flags trouble (low value — or high, when
   * inverted, for stress-like stats).
   * @private
   */
  _setMeterValue(el, value, suffix = '', inverted = false, colorByRisk = true) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    const risk = inverted ? v : 100 - v;
    const riskClass = colorByRisk
      ? (risk >= 75 ? 'danger' : risk >= 50 ? 'warn' : '')
      : '';
    el.innerHTML = `<span class="status-meter ${riskClass}">${progressBar(v, 8, false)}</span> ${v}${suffix}`;
  },

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

      // Members who are gone (quit, left, dead) get no HP bar: a departed
      // member with a healthy-looking bar reads as still on the roster.
      const showHp = info.isActive;
      div.innerHTML = `
        <div class="crew-name">${info.name}</div>
        <div class="crew-role">${info.role}</div>
        ${showHp ? `<div class="crew-stats">
          <span>HP: ${progressBar(info.health, 8, true)}</span>
        </div>` : ''}
        ${info.status !== 'Good' ? `<div class="crew-status">[${info.status}]</div>` : ''}
      `;

      this.crewPanel.appendChild(div);
    }
  },

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
  },

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
        <span class="resource-bar-text ${fillClass}">${progressBar(percentage, 10, false)}</span>
        <span class="resource-value">${Math.round(value)}</span>
      `;

      this.resourcesPanel.appendChild(row);
    }
  },

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
      // Text glyphs, not emoji — emoji break the terminal aesthetic
      const seasonIcons = { spring: '❀', summer: '☼', fall: '❧', winter: '❄' };
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
  },

  /**
   * Toggle the status panel
   */
  togglePanel() {
    if (this._isPanelOpen) {
      this.closeStatusPanel();
    } else {
      this.openStatusPanel();
    }
  },

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
  },

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
  },

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
  },

  /**
   * Render a detailed ASCII status box for desk journey
   * @param {Object} journey - Journey state
   * @returns {string} ASCII art status display
   */
  renderDeskStatusBox(journey) {
    const hasPermits = Boolean(journey.permits?.target);
    // The manager term is denominated in months; every other desk journey in
    // days. Displayed day clamps to the deadline so the debrief never shows
    // "Day 13 of 12 | -1 remaining" after the final period ticks over.
    const unit = journey.journeyType === 'manager' ? 'Month' : 'Day';
    const shownDay = Number.isFinite(journey.deadline)
      ? Math.min(journey.day, journey.deadline)
      : journey.day;
    const daysRemaining = Number.isFinite(journey.deadline)
      ? Math.max(0, journey.deadline - journey.day)
      : null;
    const progress = getOperationalProgress(journey);
    const lines = [
      Number.isFinite(journey.deadline)
        ? `${unit} ${shownDay} of ${journey.deadline} | ${daysRemaining} ${unit.toLowerCase()}s remaining`
        : `${unit} ${shownDay} | ${journey.plan?.phase || journey.currentPhase || 'operations'}`,
      ''
    ];

    if (hasPermits) {
      const approvalRate = journey.permits.target > 0
        ? Math.round((journey.permits.approved / journey.permits.target) * 100)
        : 0;
      lines.push(`Permits: ${journey.permits.approved}/${journey.permits.target} approved (${approvalRate}%)`);
      lines.push(`Pipeline: ${journey.permits.submitted} submitted, ${journey.permits.inReview} in review`);
    } else {
      lines.push(`Progress: ${progress}% complete`);
      lines.push(`Phase: ${journey.plan?.phase || journey.currentPhase || 'planning'}`);
    }

    lines.push('');
    lines.push(`Team: ${getActiveCrewCount(journey.crew)}/${journey.crew?.length || 0} active`);
    lines.push(`Budget: $${Math.round(journey.resources.budget).toLocaleString()}`);

    return box(lines, { double: true, title: 'STATUS' });
  },

  /**
   * Create ASCII progress bar
   * @private
   */
  _makeProgressBar(percent, width) {
    const filled = Math.round((percent / 100) * width);
    return PROGRESS.FULL.repeat(filled) + PROGRESS.EMPTY.repeat(width - filled);
  }
};
