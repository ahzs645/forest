/**
 * Panels Module
 * Handles status bar, side panel, and panel content updates
 */

import { progressBar, box, PROGRESS } from '../ascii.js';
import { displayMode } from '../displayMode.js';
import { getCrewDisplayInfo, getActiveCrewCount, getAverageMorale } from '../crew.js';
import { FIELD_RESOURCES, DESK_RESOURCES, getResourcePercentage } from '../resources.js';

/**
 * Panel management mixin
 */
export const PanelsMixin = {
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
        <div class="resource-bar">
          <div class="resource-fill ${fillClass}" style="width: ${percentage}%"></div>
        </div>
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
