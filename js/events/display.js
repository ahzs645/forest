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

/**
 * Format an effects object as signed-delta clauses.
 * Shared between the success branch and a gamble's failure branch so both
 * sides of a bet read in the same vocabulary. Time is normally appended by
 * getOptionHint (option-level and effects-level timeUsed merge there), so it
 * is only included here when formatting a failure branch on its own.
 */
function formatEffectDeltas(effects, journeyType, { includeTime = false } = {}) {
  const parts = [];
  if (!effects) return parts;

  if (effects.fuel !== undefined) {
    parts.push(effects.fuel > 0 ? `+${effects.fuel} fuel` : `${effects.fuel} fuel`);
  }
  if (effects.food !== undefined) {
    parts.push(effects.food > 0 ? `+${effects.food} food` : `${effects.food} food`);
  }
  if (effects.equipment !== undefined) {
    parts.push(effects.equipment > 0 ? `+${effects.equipment}% equip` : `${effects.equipment}% equip`);
  }
  if (effects.firstAid !== undefined) {
    parts.push(effects.firstAid > 0 ? `+${effects.firstAid} med` : `${effects.firstAid} med`);
  }
  if (effects.budget !== undefined) {
    const amount = effects.budget;
    const budgetStr = Math.abs(amount) >= 1000
      ? `$${Math.round(Math.abs(amount) / 1000)}k`
      : `$${Math.abs(amount)}`;
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
    parts.push(`${sign}${budgetStr}`);
  }

  if (effects.crew_health !== undefined) {
    parts.push(effects.crew_health > 0 ? `+${effects.crew_health} health` : `${effects.crew_health} health`);
  }
  if (effects.crew_morale !== undefined) {
    parts.push(effects.crew_morale > 0 ? `+${effects.crew_morale} morale` : `${effects.crew_morale} morale`);
  }

  if (effects.relationships !== undefined) {
    parts.push(effects.relationships > 0 ? `+${effects.relationships} relations` : `${effects.relationships} relations`);
  }
  if (effects.compliance !== undefined) {
    parts.push(effects.compliance > 0 ? `+${effects.compliance} compliance` : `${effects.compliance} compliance`);
  }
  if (effects.politicalCapital !== undefined) {
    parts.push(effects.politicalCapital > 0 ? `+${effects.politicalCapital} capital` : `${effects.politicalCapital} capital`);
  }
  // Scrutiny and reputation land on real meters in resolution.js; hiding them
  // made risky options read cheaper than they are.
  if (effects.scrutiny !== undefined && effects.scrutiny !== 0) {
    parts.push(effects.scrutiny > 0 ? `+${effects.scrutiny} scrutiny` : `${effects.scrutiny} scrutiny`);
  }
  if (effects.reputation !== undefined && effects.reputation !== 0) {
    parts.push(effects.reputation > 0 ? `+${effects.reputation} reputation` : `${effects.reputation} reputation`);
  }

  if (effects.data !== undefined && effects.data !== 0) {
    parts.push(effects.data > 0 ? `+${effects.data} data` : `${effects.data} data`);
  }
  if (effects.progress !== undefined && effects.progress !== 0) {
    const unit = journeyType === 'field' || journeyType === 'recon' ? ' km traverse' : ' progress';
    parts.push(effects.progress > 0
      ? `+${effects.progress}${unit}`
      : `${effects.progress}${unit}`);
  }
  if (effects.permits_approved !== undefined) {
    const amount = effects.permits_approved;
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
    parts.push(`${sign}${Math.abs(amount)} permits`);
  }

  if (includeTime && typeof effects.timeUsed === 'number' && effects.timeUsed > 0 && journeyType !== 'manager') {
    parts.push(`-${effects.timeUsed}h`);
  }

  return parts;
}

/**
 * Crew consequences resolve on a random member (see resolution.js), so the
 * hint names the kind of hit, not a number. `rest` is a no-op in resolution
 * and earns no clause — advertising it would invent a mechanic.
 */
function formatCrewEffect(crewEffect) {
  if (!crewEffect) return [];
  const parts = [];
  if (crewEffect.injury) parts.push('crew injury');
  if (crewEffect.illness) {
    parts.push(typeof crewEffect.riskWorsen === 'number'
      ? `${Math.round(crewEffect.riskWorsen * 100)}% illness risk`
      : 'crew illness');
  }
  if (crewEffect.lose_member || crewEffect.leave) parts.push('crew member leaves');
  if (crewEffect.evacuate || crewEffect.evacuate_sick) parts.push('crew member out');
  return parts;
}

/**
 * Generate a hint about an option's effects.
 *
 * One vocabulary throughout: every clause states a fact — a signed delta, a
 * probability, or a named consequence. The hint never editorialises about
 * safety; "no cost" is the strongest claim the fallback may make, and only
 * when the option genuinely has nothing modelled on it. Anything softer-
 * sounding ("Safe choice") was a promise resolution.js couldn't keep.
 */
function getOptionHint(option, journeyType) {
  // Options flagged hiddenOutcome keep their cards close to the chest
  if (option.hiddenOutcome) return 'outcome unknown';

  const hints = [];

  // A run-ender outranks every other clause, so it leads.
  if (option.gameOver) {
    hints.push('ends the run');
  }

  hints.push(...formatEffectDeltas(option.effects, journeyType));
  hints.push(...formatCrewEffect(option.crewEffect));

  if (option.riskInjury) {
    const riskPct = Math.round(option.riskInjury * 100);
    hints.push(`${riskPct}% injury risk`);
  }

  // Both keys resolve to the same delayed compliance hit in resolution.js
  const complianceRisk = option.riskCompliance ?? option.riskRejection;
  if (typeof complianceRisk === 'number' && complianceRisk > 0) {
    hints.push(`${Math.round(complianceRisk * 100)}% compliance risk`);
  }

  // Gambles show the downside branch: the failure chance and what it costs,
  // in the same delta vocabulary as the success effects listed above.
  if (typeof option.chanceSuccess === 'number' && option.chanceSuccess < 1) {
    const failPct = Math.round((1 - option.chanceSuccess) * 100);
    const failCosts = formatEffectDeltas(option.failureEffects, journeyType, { includeTime: true });
    hints.push(failCosts.length > 0
      ? `${failPct}% it goes wrong, then ${failCosts.join(', ')}`
      : `${failPct}% it goes wrong`);
  }

  // Managers have no hours mechanic — don't advertise a cost that never lands
  const timeUsed = option.timeUsed ?? option.effects?.timeUsed;
  if (typeof timeUsed === 'number' && timeUsed > 0 && journeyType !== 'manager') {
    hints.push(`-${timeUsed}h`);
  }

  // Mirrors the "This may have consequences later..." message resolution.js
  // prints when the follow-up is queued.
  if (option.schedulesEvent) {
    hints.push('consequences later');
  }

  return hints.length > 0 ? hints.join(', ') : 'no cost';
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
