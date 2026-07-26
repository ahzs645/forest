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
      hint: getOptionHint(opt, journeyType),
      tag: deriveOptionRiskTag(opt)
    }))
  };
}

/**
 * Grade an option's downside into one readable chip: SAFE / TRADEOFF / RISKY.
 *
 * The seasonal TUI has graded its options this way since it shipped
 * (`deriveRiskLevel`, tui/controller.js:234) but the event decks never called
 * it, so every authored option on an event card rendered bare — the only chip
 * a player ever saw was the TRADEOFF on "Set it aside", which is the option
 * that declines to play.
 *
 * Graded on the *shape* of the downside, never the upside, so the chip hints at
 * exposure without spoiling the outcome:
 *   - an explicit gamble, a crew member on the line, or a queued consequence
 *     is RISKY by definition — its downside is uncertain or severe
 *   - a steep single hit, a compliance dive, or broad across-the-board costs
 *     read as RISKY
 *   - a contained, single-meter cost reads as a TRADEOFF
 * @param {Object} option
 * @returns {string} 'SAFE' | 'TRADEOFF' | 'RISKY'
 */
export function deriveOptionRiskTag(option) {
  if (!option) return 'SAFE';

  // An authored roll, an injury exposure, a compliance/rejection gamble, a crew
  // consequence, or a scheduled follow-on all mean the real cost is not on the
  // effects object at all.
  if (typeof option.chanceSuccess === 'number'
    || typeof option.riskInjury === 'number'
    || typeof option.riskCompliance === 'number'
    || typeof option.riskRejection === 'number'
    || option.crewEffect
    || option.schedulesEvent
    || option.gameOver) {
    return 'RISKY';
  }

  const effects = option.effects;
  if (!effects || typeof effects !== 'object') return 'SAFE';

  const negatives = Object.entries(effects)
    .map(([key, value]) => [key, Number(value)])
    // A falling number is not always a cost. Scrutiny going down is the file
    // getting cleaner; counting it as a downside made a good effect push an
    // option toward a scarier chip.
    .filter(([key, value]) => Number.isFinite(value) && value < 0 && !INVERTED_EFFECT_KEYS.has(key));
  if (!negatives.length) return 'SAFE';

  // Graded per key, because event effects are not one scale. The seasonal
  // TUI's grader compares everything against a flat -6, which is right for its
  // 0-100 metrics and nonsense here: it reads -$500 and -15% equipment as
  // equally dire and tags three options in five RISKY, which tells the player
  // nothing.
  const steep = negatives.filter(([key, value]) => value <= (STEEP_EFFECT_THRESHOLDS[key] ?? -6));
  if (steep.length > 0 || negatives.length >= 3) return 'RISKY';
  return 'TRADEOFF';
}

/** Effect keys where a negative number is a good thing for the player. */
const INVERTED_EFFECT_KEYS = new Set(['scrutiny', 'heat', 'paperwork', 'stress', 'backlog']);

/**
 * What counts as a steep single hit, per effect key. Sized against the actual
 * authored ranges in the field and desk event decks under js/data/json, and the
 * starting stockpiles in js/resources.js — a number here should mean "this one
 * line hurts", not "this line is nonzero".
 */
const STEEP_EFFECT_THRESHOLDS = {
  budget: -800,
  fuel: -15,
  food: -12,
  equipment: -15,
  firstAid: -2,
  crew_health: -10,
  crew_morale: -10,
  compliance: -4,
  relationships: -6,
  politicalCapital: -6,
  reputation: -6,
  progress: -8,
  permits_approved: -2,
  data: -15,
};

/**
 * State an option's authored odds.
 *
 * A three-band option cannot be described by one percentage. "50% success
 * odds" on a 50/32/18 split reads as a coin flip when in fact four times in
 * five it does not go badly — which would make the honest number more
 * frightening than the mechanic. Both ends get named instead.
 *
 * These are the authored base odds, before js/events/odds.js shifts them for
 * the state of the run. Deliberately so: the shifts depend on things the
 * player can see for themselves (a dirty file, a tired crew, weather), and
 * quoting a live number here would turn every card into a spreadsheet.
 * @param {Object} option
 * @returns {string} empty when the option carries no roll
 */
function formatOddsHint(option) {
  if (typeof option.chanceSuccess !== 'number') return '';
  const good = Math.round(option.chanceSuccess * 100);
  if (typeof option.chancePartial !== 'number') return `${good}% success odds`;
  const bad = Math.max(0, 100 - good - Math.round(option.chancePartial * 100));
  return `${good}% clean, ${bad}% badly wrong`;
}

/**
 * Generate a hint about an option's effects
 */
function getOptionHint(option, journeyType) {
  // Options flagged hiddenOutcome keep their effects close to the chest — but
  // an authored gamble still names its odds. Previously this returned before
  // the chanceSuccess line below could ever run, and since both options in the
  // whole corpus carrying chanceSuccess are also hiddenOutcome, the "% success
  // odds" hint was unreachable: the game rolled a number it could not show.
  if (option.hiddenOutcome) {
    return formatOddsHint(option) || 'Outcome uncertain';
  }

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

  const oddsHint = formatOddsHint(option);
  if (oddsHint) {
    hints.push(oddsHint);
  }

  // Managers have no hours mechanic — don't advertise a cost that never lands
  const timeUsed = option.timeUsed ?? option.effects?.timeUsed;
  if (typeof timeUsed === 'number' && timeUsed > 0 && journeyType !== 'manager') {
    hints.push(`-${timeUsed}h`);
  }

  // Mechanics that resolveEvent really applies but this builder used to ignore,
  // so the option fell through to the literal string 'Safe choice'. That put
  // "Safe choice" under things like "Ignore it — we're always compliant" (which
  // queues an inspection) and "Have them rest in camp" (which can cost a crew
  // member outright). An unadvertised consequence is worse than a blunt one.
  // crewEffect is keyed by what it does (js/events/resolution.js:580) — injury,
  // illness with an optional riskWorsen gate, lose_member/leave — not a `type`
  // string. riskWorsen is a real probability the engine rolls against, so it
  // gets stated rather than hidden behind the word "risk".
  const crewEffect = option.crewEffect;
  if (crewEffect) {
    if (crewEffect.lose_member || crewEffect.leave) {
      hints.push('someone may not come back');
    } else if (crewEffect.illness) {
      hints.push(typeof crewEffect.riskWorsen === 'number'
        ? `${Math.round(crewEffect.riskWorsen * 100)}% illness risk`
        : 'illness risk');
    } else if (crewEffect.injury) {
      hints.push('injures someone');
    }
  }
  if (option.schedulesEvent) hints.push('this comes back');
  // riskRejection is an alias, not a second mechanic: resolution.js:108 reads
  // `option.riskCompliance ?? option.riskRejection` and both land the same
  // compliance blowback. Advertising one of them as a "rejection risk" would
  // promise the player a rejection the engine never delivers.
  const complianceRisk = option.riskCompliance ?? option.riskRejection;
  if (typeof complianceRisk === 'number') {
    hints.push(`${Math.round(complianceRisk * 100)}% chance it comes back on you`);
  }
  if (option.effects?.scrutiny) {
    const value = option.effects.scrutiny;
    hints.push(value > 0 ? `+${value} scrutiny` : `${value} scrutiny`);
  }
  if (option.effects?.reputation) {
    const value = option.effects.reputation;
    hints.push(value > 0 ? `+${value} reputation` : `${value} reputation`);
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
