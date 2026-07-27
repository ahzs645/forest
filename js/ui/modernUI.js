/**
 * Modern UI Module
 * Handles modern mode UI updates (stats row, metrics sidebar, stat cards)
 */

import { displayMode } from '../displayMode.js';
import { getActiveCrewCount, getAverageMorale } from '../crew.js';
import { getOperationalProgress } from '../journey.js';

/**
 * Modern UI mixin
 */
export const ModernUIMixin = {
  /**
   * Update modern mode UI elements (stats row, metrics sidebar, stat cards)
   * @param {Object} journey - Journey state
   * @param {boolean} isProtagonistMode - Whether in protagonist mode
   */
  _updateModernUI(journey, isProtagonistMode) {
    const progress = this._calculateProgress(journey);
    const isFieldType = journey.journeyType === 'field' || journey.journeyType === 'recon';

    // Stats row (year / funds / eco-health / zone) — live data, not the static
    // placeholders that used to ship in the markup.
    if (this.modernYearValue) {
      this.modernYearValue.textContent = journey.season?.year ? `Year ${journey.season.year}` : `Day ${journey.day}`;
    }
    if (this.modernFundsValue) {
      const budget = Math.round(journey.resources?.budget ?? 0);
      this.modernFundsValue.textContent = `$${budget.toLocaleString()}`;
    }
    if (this.modernZoneValue) {
      // becZone reads "SBSmc2 – Sub-Boreal Spruce moist cold"; the card is a
      // one-line slot, so it gets the subzone code and leaves the prose out.
      const becZone = journey.area?.becZone?.split('–')[0].trim();
      this.modernZoneValue.textContent = becZone || journey.area?.name || journey.zone || '—';
    }
    // Eco-health maps to whatever the mode tracks: forest health, then
    // biodiversity, falling back to a neutral dash when neither applies.
    const ecoHealth = journey.metrics?.forestHealth ?? journey.values?.biodiversity;
    if (this.modernEcoValue) {
      this.modernEcoValue.textContent = Number.isFinite(ecoHealth) ? `${Math.round(ecoHealth)}%` : '—';
    }
    if (this.modernEcoFill) {
      this.modernEcoFill.style.width = `${Number.isFinite(ecoHealth) ? Math.round(ecoHealth) : 0}%`;
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

      if (this.metricStressLabel) this.metricStressLabel.textContent = 'STRESS';
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

      // A crew has no stress meter; the same slot reports how much of it is
      // laid up instead.
      const injuredCount = journey.crew.filter(c => c.status === 'injured').length;
      const injuredPercent = journey.crew.length > 0 ? Math.round((injuredCount / journey.crew.length) * 100) : 0;
      if (this.metricStressLabel) this.metricStressLabel.textContent = 'INJURED';
      if (this.metricStressValue) this.metricStressValue.textContent = `${injuredPercent}%`;
      if (this.metricStressFill) this.metricStressFill.style.width = `${injuredPercent}%`;
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
        manager: 'Lead the company through the full term with the books and the board onside.',
        desk: 'Complete administrative tasks efficiently.'
      };
      this.directiveText.textContent = directives[journey.journeyType] || directives.desk;
    }

    // Stat cards (duplicate of status bar for modern layout)
    if (this.statDayLabel) {
      this.statDayLabel.textContent = isFieldType
        ? 'SHIFT'
        : journey.journeyType === 'manager' ? 'MONTH' : 'DAY';
    }
    if (this.statDayValue) {
      this.statDayValue.textContent = Number.isFinite(journey.deadline)
        ? Math.min(journey.day, journey.deadline)
        : journey.day;
    }
    if (this.statProgressValue) {
      this.statProgressValue.textContent = `${progress}%`;
    }
    if (this.statProgressFill) {
      this.statProgressFill.style.width = `${progress}%`;
    }

    if (isProtagonistMode && journey.protagonist) {
      // Desk roles have no crew; these cards show the protagonist's own
      // energy and stress, so label them that way.
      if (this.statCrewLabel) this.statCrewLabel.textContent = 'ENERGY';
      if (this.statCrewValue) this.statCrewValue.textContent = `${journey.protagonist.energy || 100}%`;
      if (this.statMoraleLabel) this.statMoraleLabel.textContent = 'STRESS';
      if (this.statMoraleValue) this.statMoraleValue.textContent = `${journey.protagonist.stress || 0}%`;
    } else if (journey.crew) {
      const active = getActiveCrewCount(journey.crew);
      const total = journey.crew.length;
      const morale = Math.round(getAverageMorale(journey.crew));
      if (this.statCrewLabel) this.statCrewLabel.textContent = 'CREW';
      if (this.statCrewValue) this.statCrewValue.textContent = `${active}/${total}`;
      if (this.statMoraleLabel) this.statMoraleLabel.textContent = 'MORALE';
      if (this.statMoraleValue) this.statMoraleValue.textContent = `${morale}%`;
    }
  },

  /**
   * Calculate progress based on journey type
   * @param {Object} journey - Journey state
   * @returns {number} Progress percentage
   */
  _calculateProgress(journey) {
    return getOperationalProgress(journey);
  },

  /**
   * Handle display mode changes
   * @param {string} mode - 'classic' or 'modern'
   */
  _onDisplayModeChange(mode) {
    // The grid renderer projects the DOM, so it toggles on top of classic
    if (mode === 'grid') this.gridView?.enable();
    else this.gridView?.disable();

    // The status pass skips the modern chrome while it is hidden, so fill it
    // in on the way back rather than showing last-mode numbers until the
    // next turn.
    if (mode === 'modern' && this._currentJourney) {
      const journey = this._currentJourney;
      this._updateModernUI(journey, Boolean(journey.protagonist) && !journey.crew?.length);
    }

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
