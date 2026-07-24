/**
 * Event Display
 * Formatting events and effect hints for UI presentation
 */

import { isFieldJourney } from './constants.js';

/**
 * Give field events one consistent radio lead without making the reporter's
 * task compete grammatically with the event itself.
 */
export function formatRadioReport(description, reporter) {
  if (!reporter) return description;

  const roleLabel = reporter.role || 'Crew';
  return `Radio from ${reporter.name} (${roleLabel}): ${description}`;
}

/**
 * Format event for display
 * @param {Object} event - Event object
 * @param {string} journeyType - Journey type
 * @returns {Object} Display-ready event info
 */
export function formatEventForDisplay(event, journeyType = 'field') {
  const reporter = isFieldJourney(journeyType) ? event.reporter : null;
  const description = formatRadioReport(event.description, reporter);
  const title = event.title;

  return {
    title,
    description,
    severity: event.severity,
    type: event.type,
    options: event.options.map((opt, index) => ({
      index: index + 1,
      label: opt.label,
      hint: getOptionHint(opt, journeyType)
    }))
  };
}

// Which way the losing branch hurts, in the order a player cares about.
const DOWNSIDE_LABELS = [
  ['budget', (v) => (Math.abs(v) >= 1000 ? `-$${Math.round(Math.abs(v) / 1000)}k` : `-$${Math.abs(v)}`)],
  ['compliance', (v) => `${v} compliance`],
  ['politicalCapital', (v) => `${v} capital`],
  ['reputation', (v) => `${v} standing`],
  ['relationships', (v) => `${v} relations`],
  ['crew_morale', (v) => `${v} morale`],
  ['equipment', (v) => `${v}% equip`],
  ['scrutiny', (v) => `+${v} scrutiny`]
];

/**
 * Compress a failure branch into the two or three costs worth reading before
 * committing to the bet.
 */
function summarizeDownside(failureEffects, journeyType) {
  if (!failureEffects) return '';
  const parts = [];
  for (const [key, format] of DOWNSIDE_LABELS) {
    const value = failureEffects[key];
    if (typeof value !== 'number' || value === 0) continue;
    if (key === 'scrutiny' && value < 0) continue;
    if (key !== 'scrutiny' && value > 0) continue;
    if (key === 'equipment' && !isFieldJourney(journeyType)) continue;
    parts.push(format(value));
    if (parts.length === 3) break;
  }
  return parts.join(', ');
}

/**
 * Generate a hint about an option's effects
 */
function getOptionHint(option, journeyType) {
  // Options flagged hiddenOutcome keep their cards close to the chest
  if (option.hiddenOutcome) return 'Outcome uncertain';

  const hints = [];
  const isField = isFieldJourney(journeyType);

  if (option.effects) {
    if (option.effects.fuel !== undefined) {
      hints.push(option.effects.fuel > 0 ? `+${option.effects.fuel} fuel` : `${option.effects.fuel} fuel`);
    }
    if (option.effects.food !== undefined) {
      hints.push(option.effects.food > 0 ? `+${option.effects.food} food` : `${option.effects.food} food`);
    }
    if (option.effects.equipment !== undefined) {
      hints.push(option.effects.equipment > 0 ? `+${option.effects.equipment}% equip` : `${option.effects.equipment}% equip`);
    }
    if (option.effects.firstAid !== undefined) {
      hints.push(option.effects.firstAid > 0 ? `+${option.effects.firstAid} med` : `${option.effects.firstAid} med`);
    }
    if (option.effects.budget !== undefined) {
      const amount = option.effects.budget;
      const budgetStr = Math.abs(amount) >= 1000
        ? `$${Math.round(Math.abs(amount) / 1000)}k`
        : `$${Math.abs(amount)}`;
      const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
      hints.push(`${sign}${budgetStr}`);
    }

    if (option.effects.crew_health !== undefined) {
      hints.push(option.effects.crew_health > 0 ? `+${option.effects.crew_health} health` : `${option.effects.crew_health} health`);
    }
    if (option.effects.crew_morale !== undefined) {
      hints.push(option.effects.crew_morale > 0 ? `+${option.effects.crew_morale} morale` : `${option.effects.crew_morale} morale`);
    }

    if (option.effects.relationships !== undefined) {
      hints.push(option.effects.relationships > 0 ? `+${option.effects.relationships} relations` : `${option.effects.relationships} relations`);
    }
    if (option.effects.compliance !== undefined) {
      hints.push(option.effects.compliance > 0 ? `+${option.effects.compliance} compliance` : `${option.effects.compliance} compliance`);
    }
    if (option.effects.politicalCapital !== undefined) {
      hints.push(option.effects.politicalCapital > 0 ? `+${option.effects.politicalCapital} capital` : `${option.effects.politicalCapital} capital`);
    }

    if (option.effects.data !== undefined && option.effects.data !== 0) {
      hints.push(option.effects.data > 0 ? `+${option.effects.data} data` : `${option.effects.data} data`);
    }
    if (option.effects.progress !== undefined && option.effects.progress !== 0) {
      const unit = journeyType === 'field' || journeyType === 'recon' ? ' km traverse' : ' progress';
      hints.push(option.effects.progress > 0
        ? `+${option.effects.progress}${unit}`
        : `${option.effects.progress}${unit}`);
    }
    if (option.effects.permits_approved !== undefined) {
      const amount = option.effects.permits_approved;
      const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
      hints.push(`${sign}${Math.abs(amount)} permits`);
    }
  }

  if (option.riskInjury) {
    const riskPct = Math.round(option.riskInjury * 100);
    hints.push(`${riskPct}% injury risk`);
  }

  if (typeof option.chanceSuccess === 'number') {
    // A gamble has two prices. Showing only the winning branch made every
    // "high risk" option read as a free upside with a percentage attached.
    const failPct = Math.round((1 - option.chanceSuccess) * 100);
    hints.push(`${failPct}% it goes wrong`);
    const downside = summarizeDownside(option.failureEffects, journeyType);
    if (downside) hints.push(`then ${downside}`);
  }

  // Managers have no hours mechanic — don't advertise a cost that never lands
  const timeUsed = option.timeUsed ?? option.effects?.timeUsed;
  if (typeof timeUsed === 'number' && timeUsed > 0 && journeyType !== 'manager') {
    hints.push(`-${timeUsed}h`);
  }

  return hints.length > 0 ? hints.join(', ') : 'Safe choice';
}

/**
 * Format effect preview for display in UI
 * @param {Object} option - Event option
 * @param {string} journeyType - Journey type
 * @returns {string} Formatted effect preview
 */
export function formatOptionEffects(option, journeyType = 'field') {
  return getOptionHint(option, journeyType);
}
