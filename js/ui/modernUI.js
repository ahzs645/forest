/**
 * Modern UI Module
 * Handles modern mode UI updates (header badges, metrics sidebar, stat cards)
 */

import { displayMode } from '../displayMode.js';
import { getActiveCrewCount, getAverageMorale } from '../crew.js';

/**
 * Modern UI mixin
 */
export const ModernUIMixin = {
  /**
   * Update modern mode UI elements (header badges, metrics sidebar, stat cards)
   * @param {Object} journey - Journey state
   * @param {boolean} isProtagonistMode - Whether in protagonist mode
   */
  _updateModernUI(journey, isProtagonistMode) {
    const progress = this._calculateProgress(journey);
    const isFieldType = journey.journeyType === 'field' || journey.journeyType === 'recon';

    // Header context badges
    if (this.badgeSeasonValue) {
      const seasonName = journey.season?.currentSeason || journey.season?.name || 'UNKNOWN';
      this.badgeSeasonValue.textContent = seasonName.toUpperCase();
    }

    if (this.badgeRoleValue) {
      const roleLabels = {
        planner: 'PLANNER',
        permitter: 'PERMITTER',
        recce: 'RECCE',
        silviculture: 'SILVIC'
      };
      this.badgeRoleValue.textContent = roleLabels[journey.role] || journey.role?.toUpperCase() || 'OPERATOR';
    }

    if (this.badgeZoneValue) {
      const zoneName = journey.area?.name || journey.zone || 'UNKNOWN';
      this.badgeZoneValue.textContent = zoneName.toUpperCase();
    }

    // Metrics sidebar
    if (this.metricProgressValue) {
      this.metricProgressValue.textContent = `${progress}%`;
    }
    if (this.metricProgressFill) {
      this.metricProgressFill.style.width = `${progress}%`;
    }

    // Energy/Stress based on protagonist or crew
    if (isProtagonistMode && journey.protagonist) {
      const energy = journey.protagonist.energy || 100;
      const stress = journey.protagonist.stress || 0;

      if (this.metricEnergyValue) this.metricEnergyValue.textContent = `${energy}%`;
      if (this.metricEnergyFill) {
        this.metricEnergyFill.style.width = `${energy}%`;
        this.metricEnergyFill.classList.toggle('low', energy < 50);
        this.metricEnergyFill.classList.toggle('critical', energy < 25);
      }

      if (this.metricStressValue) this.metricStressValue.textContent = `${stress}%`;
      if (this.metricStressFill) this.metricStressFill.style.width = `${stress}%`;
    } else if (journey.crew) {
      // Use morale as "energy" proxy
      const morale = Math.round(getAverageMorale(journey.crew));
      if (this.metricEnergyValue) this.metricEnergyValue.textContent = `${morale}%`;
      if (this.metricEnergyFill) {
        this.metricEnergyFill.style.width = `${morale}%`;
        this.metricEnergyFill.classList.toggle('low', morale < 50);
        this.metricEnergyFill.classList.toggle('critical', morale < 25);
      }

      // Calculate stress from injuries
      const injuredCount = journey.crew.filter(c => c.status === 'injured').length;
      const stressPercent = journey.crew.length > 0 ? Math.round((injuredCount / journey.crew.length) * 100) : 0;
      if (this.metricStressValue) this.metricStressValue.textContent = `${stressPercent}%`;
      if (this.metricStressFill) this.metricStressFill.style.width = `${stressPercent}%`;
    }

    // Budget (from resources)
    if (journey.resources?.budget !== undefined) {
      const maxBudget = journey.resources.maxBudget || 10000;
      const budgetPercent = Math.round((journey.resources.budget / maxBudget) * 100);
      if (this.metricBudgetValue) this.metricBudgetValue.textContent = `${budgetPercent}%`;
      if (this.metricBudgetFill) {
        this.metricBudgetFill.style.width = `${budgetPercent}%`;
        this.metricBudgetFill.classList.toggle('low', budgetPercent < 30);
        this.metricBudgetFill.classList.toggle('critical', budgetPercent < 15);
      }
    }

    // Directive text
    if (this.directiveText) {
      const directives = {
        recon: 'Complete reconnaissance of all blocks while managing crew fatigue.',
        field: 'Complete field operations while maintaining safety standards.',
        silviculture: 'Meet planting and survey targets within budget constraints.',
        planning: 'Build ministerial confidence through careful data analysis.',
        permitting: 'Process permit applications before deadline.',
        desk: 'Complete administrative tasks efficiently.'
      };
      this.directiveText.textContent = directives[journey.journeyType] || directives.desk;
    }

    // Stat cards (duplicate of status bar for modern layout)
    if (this.statDayLabel) {
      this.statDayLabel.textContent = isFieldType ? 'SHIFT' : 'DAY';
    }
    if (this.statDayValue) {
      this.statDayValue.textContent = journey.day;
    }
    if (this.statProgressValue) {
      this.statProgressValue.textContent = `${progress}%`;
    }
    if (this.statProgressFill) {
      this.statProgressFill.style.width = `${progress}%`;
    }

    if (isProtagonistMode && journey.protagonist) {
      if (this.statCrewValue) this.statCrewValue.textContent = `⚡ ${journey.protagonist.energy || 100}%`;
      if (this.statMoraleValue) this.statMoraleValue.textContent = `😰 ${journey.protagonist.stress || 0}%`;
    } else if (journey.crew) {
      const active = getActiveCrewCount(journey.crew);
      const total = journey.crew.length;
      const morale = Math.round(getAverageMorale(journey.crew));
      if (this.statCrewValue) this.statCrewValue.textContent = `${active}/${total}`;
      if (this.statMoraleValue) this.statMoraleValue.textContent = `${morale}%`;
    }
  },

  /**
   * Calculate progress based on journey type
   * @param {Object} journey - Journey state
   * @returns {number} Progress percentage
   */
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
  },

  /**
   * Handle display mode changes
   * @param {string} mode - 'classic' or 'modern'
   */
  _onDisplayModeChange(mode) {
    // Re-render current choices if any are displayed
    if (this._currentOptions && this._choiceHandler) {
      this._showChoices(this._currentOptions);
    }
  },

  /**
   * Set layout class based on journey type (for modern mode)
   * @param {string} journeyType - Journey type
   */
  setJourneyLayout(journeyType) {
    if (!displayMode.isModern()) return;

    const wrapper = document.querySelector('.game-wrapper');
    if (!wrapper) return;

    // Remove existing layout classes
    wrapper.classList.remove('layout--field', 'layout--desk');

    // Apply appropriate layout based on journey type
    const isFieldType = ['recon', 'silviculture', 'field'].includes(journeyType);
    wrapper.classList.add(isFieldType ? 'layout--field' : 'layout--desk');
  }
};
