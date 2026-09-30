/**
 * Event Display
 * Formatting events and effect hints for UI presentation
 */

import { isFieldJourney } from './constants.js';
import { formatOptionTimeCost } from './timePolicy.js';
import { FUEL_EFFECT_SCALE, planningStandingDelta, projectAppliedEffects } from './resolution.js';

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
 * @param {Object} [journey] - the run, when the card can read it: a desk
 *   option that would spend the last of the district's goodwill says so
 * @returns {Object} Display-ready event info
 */
export function formatEventForDisplay(event, journeyType = 'field', journey = null) {
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
      // The warning leads, so a narrow screen that clips the tail keeps it.
      hint: [describeGoodwillStakes(opt, journey), getOptionHint(opt, journeyType, event)].filter(Boolean).join(', '),
      // An option can name its own chip: a shortcut is OFF-BOOK, which says
      // more than the RISKY every ordinary gamble carries.
      tag: opt.riskTag || deriveEventOptionTag(opt, event)
    }))
  };
}

/** Goodwill under this after a choice is a warning; at zero a desk run ends. */
export const GOODWILL_LAST_WARNING = 5;

/**
 * Before the choice, what an option could do to the last of a desk's
 * goodwill (js/modes/shared/endConditions.js ends the run at zero). The
 * outcome's "nearly spent" line came only after the fact: at goodwill 2 a
 * spill card printed its -2 and -8 goodwill bands without saying either one
 * ends the file. Reads every band the option can land, and a caught
 * shortcut's determination on top of its caught band.
 * @param {Object} option
 * @param {Object|null} journey
 * @returns {string} empty when no band comes near
 */
export function describeGoodwillStakes(option, journey) {
  if (!journey || !DESK_PROTAGONIST_TYPES.has(journey.journeyType)) return '';
  const goodwill = Number(journey.resources?.politicalCapital);
  if (!Number.isFinite(goodwill) || goodwill <= 0) return '';
  const gamble = typeof option?.chanceSuccess === 'number';
  const drop = (...bands) => bands.reduce((sum, band) => sum
    + (band ? Number(projectAppliedEffects(band, journey.journeyType).politicalCapital) || 0 : 0), 0);
  const outcomes = [drop(option?.effects)];
  if (gamble && option.partialEffects) outcomes.push(drop(option.partialEffects));
  if (gamble && (option.failureEffects || option.failureFallout)) {
    outcomes.push(drop(option.failureEffects, option.failureFallout?.effects));
  }
  const worst = Math.round(goodwill + Math.min(...outcomes));
  if (worst >= GOODWILL_LAST_WARNING || worst >= goodwill) return '';
  // Certain when every band lands it there, not just the worst one.
  const certain = outcomes.every((delta) => {
    const after = Math.round(goodwill + delta);
    return worst <= 0 ? after <= 0 : after === worst;
  });
  const now = Math.round(goodwill);
  if (worst <= 0) {
    return certain
      ? `ENDS THE RUN: goodwill ${now} → 0`
      : `at worst goodwill ${now} → 0, and the run ends`;
  }
  return `${certain ? '' : 'at worst '}leaves goodwill at ${worst} (the run ends at 0)`;
}

/**
 * The chip for an option on this particular card. A shortcut's determination
 * (the fallout card) is already decided: answering it costs exactly what the
 * card prints, with no roll, so it is a TRADEOFF however steep, never RISKY.
 * @param {Object} option
 * @param {Object} [event]
 * @returns {string}
 */
export function deriveEventOptionTag(option, event = null) {
  const certain = ['chanceSuccess', 'riskInjury', 'riskCompliance', 'riskRejection']
    .every((key) => typeof option?.[key] !== 'number')
    && !option?.crewEffect && !option?.schedulesEvent && !option?.gameOver;
  if (event?.temptationStage === 'fallout' && certain) {
    const tag = deriveOptionRiskTag(option);
    return tag === 'RISKY' ? 'TRADEOFF' : tag;
  }
  return deriveOptionRiskTag(option);
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
export const INVERTED_EFFECT_KEYS = new Set(['scrutiny', 'heat', 'paperwork', 'stress', 'backlog']);

/**
 * What counts as a steep single hit, per effect key. Sized against the actual
 * authored ranges in the field and desk event decks under js/data/json, and the
 * starting stockpiles in js/resources.js — a number here should mean "this one
 * line hurts", not "this line is nonzero".
 */
export const STEEP_EFFECT_THRESHOLDS = {
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
  // A temptation carries the odds computed for this run today (`liveOdds`,
  // js/events/selection.js): the file, the crew and who is already watching
  // are all in the number, so the card tells the truth about this gamble.
  // All three bands, named, so "badly wrong" is never left undefined.
  if (option.liveOdds && typeof option.liveOdds.good === 'number') {
    const good = Math.round(option.liveOdds.good * 100);
    const bad = Math.round((option.liveOdds.bad || 0) * 100);
    const partial = Math.max(0, 100 - good - bad);
    const catcher = option.caughtBy ? ` by ${option.caughtBy}` : '';
    return `today: ${good}% clean · ${partial}% noticed · ${bad}% caught${catcher}`;
  }
  const good = Math.round(option.chanceSuccess * 100);
  if (typeof option.chancePartial !== 'number') return `${good}% success odds`;
  const bad = Math.max(0, 100 - good - Math.round(option.chancePartial * 100));
  return `${good}% clean, ${bad}% badly wrong`;
}

/** Effect keys that say how long something takes; the time hint covers them. */
const TIME_EFFECT_KEYS = new Set(['timeUsed', 'progressMode']);

/**
 * Whether a hidden-outcome option has to print its stakes anyway: an
 * off-book answer always does, and on a desk so does one whose good band
 * already costs something (the chip must equal what lands).
 */
function hiddenOptionShowsStakes(option, journeyType) {
  if (option.riskTag === 'OFF-BOOK') return true;
  if (!DESK_PROTAGONIST_TYPES.has(journeyType)) return false;
  const projected = projectAppliedEffects(option.effects, journeyType);
  return Object.entries(projected).some(([key, raw]) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value === 0 || TIME_EFFECT_KEYS.has(key)) return false;
    return INVERTED_EFFECT_KEYS.has(key) ? value > 0 : value < 0;
  });
}

/**
 * Generate a hint about an option's effects
 */
function getOptionHint(option, journeyType, event = null) {
  const timeHint = formatOptionTimeCost(event, option, journeyType);
  // A run-ending choice must say so even when the authored outcome is hidden.
  if (option.gameOver) return ['Ends the run', timeHint].filter(Boolean).join(', ');
  // Options flagged hiddenOutcome keep their effects close to the chest — but
  // an authored gamble still names its odds. Previously this returned before
  // the chanceSuccess line below could ever run, and since both options in the
  // whole corpus carrying chanceSuccess are also hiddenOutcome, the "% success
  // odds" hint was unreachable: the game rolled a number it could not show.
  // A hidden outcome that costs something even when it goes well, or an
  // off-book one, prints its stakes like any other gamble (below): "Quietly
  // bury the allegation" showed only its odds, and its clean band alone was
  // -10 goodwill and +17 scrutiny for no payoff.
  if (option.hiddenOutcome && !hiddenOptionShowsStakes(option, journeyType)) {
    // The meters stay close to the chest, but money the card can charge is
    // named: a bad roll billed cash the chip never showed.
    const bands = ['effects', 'partialEffects', 'failureEffects'].filter((band) => option[band]);
    const charges = bands.map((band) => Number(option[band].budget) || 0);
    const cash = Math.min(0, ...charges);
    const every = charges.every((charge) => charge === cash);
    const amount = effectChips({ budget: cash }, journeyType)[0];
    const cashHint = cash >= 0 ? '' : every ? amount : `up to ${amount.slice(1)} if it goes wrong`;
    return [formatOddsHint(option) || 'Outcome uncertain', cashHint, timeHint].filter(Boolean).join(', ');
  }

  // A shortcut leads with what decides it: today's odds, then what you get.
  // The pitch's own words come after, because a narrow screen clips the tail
  // of this line and the numbers are what must survive (js/gridview).
  if (option.liveOdds && typeof option.liveOdds.good === 'number') {
    return [
      formatOddsHint(option),
      ...describeEffectChips(option.effects, journeyType),
      option.riskInjury ? `${Math.round(option.riskInjury * 100)}% injury risk` : '',
      option.payoffLine ? `offer: ${option.payoffLine}` : '',
      timeHint,
    ].filter(Boolean).join(', ');
  }

  const hints = [];
  // What the shortcut is actually offering, in the role's own currency.
  if (option.payoffLine) hints.push(`offer: ${option.payoffLine}`);
  // A lasting effect the mode applies on top of the effects object (the GM's
  // per-m³ ledger hooks, js/modes/manager.js), which would otherwise be hidden.
  if (option.ledgerHint) hints.push(option.ledgerHint);
  if (timeHint) hints.push(timeHint);
  // The chips say what lands, knock-ons included (projectAppliedEffects):
  // "-4 compliance" on a permitting desk is also -6 scrutiny and -4 goodwill.
  const projected = option.effects ? projectAppliedEffects(option.effects, journeyType) : option.effects;
  // One band's chips stay together, its scrutiny with them. The scrutiny used
  // to go on the end of the whole hint, so on a gamble the good band's
  // scrutiny printed after "if it goes wrong:" and read as a second cost of
  // the bad one.
  const mainBand = describeProjectedChips(projected, journeyType);
  const oddsHint = formatOddsHint(option);
  if (!oddsHint) hints.push(...mainBand);

  // Only a crew on a traverse has a next leg for ground to land on.
  const traverse = journeyType === 'field' || journeyType === 'recon';

  // A brief response that still costs ground (js/events/resolution.js turns
  // timeUsed into a travel setback) has to say so.
  const timeUsed = Number(option.timeUsed ?? option.effects?.timeUsed);
  if (traverse && timeUsed > 0 && ![...hints, ...mainBand].some((hint) => hint.includes('slower next travel leg'))) {
    hints.push('slower next travel leg');
  }

  if (option.riskInjury) {
    const riskPct = Math.round(option.riskInjury * 100);
    hints.push(`${riskPct}% injury risk`);
  }

  if (oddsHint) {
    hints.push(oddsHint);
    // Each band under its own label, in the same words as the chips. A failed
    // gamble used to charge cash and fuel the card never mentioned.
    // A three-band gamble names its middle band too, or the unnamed middle of
    // "40% clean, 30% badly wrong" has no price on it.
    const worst = describeEffectChips(option.failureEffects, journeyType);
    const middle = typeof option.chancePartial === 'number' && option.partialEffects
      ? describeEffectChips(option.partialEffects, journeyType)
      : [];
    const bands = [
      mainBand.length ? `if it holds: ${mainBand.join(', ')}` : '',
      middle.length ? `if it partly holds: ${middle.join(', ')}` : '',
      worst.length ? `if it goes wrong: ${worst.join(', ')}` : '',
    ].filter(Boolean);
    if (bands.length) hints.push(bands.join(' / '));
  }

  // There is no hour clock any more (js/journey/dayPlan.js): a timeUsed is
  // strain or lost ground, and the time policy line above already says
  // whether the option uses the day. No "-3h" hints.

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
    if (crewEffect.evacuate || crewEffect.evacuate_sick) {
      hints.push('evacuates a crew member');
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

  return hints.length > 0 ? hints.join(', ') : 'No direct cost';
}

/**
 * An effects object as the short chips an option hint uses ("+$25k",
 * "-10 compliance", "+30 scrutiny"). The chips describe the effects as they
 * land (projectAppliedEffects), knock-on scrutiny and goodwill included, and
 * the resolver applies the same projection, so the numbers the player reads
 * on the chip, in the stakes and in the outcome are one set of numbers.
 * @param {Object} effects - authored effects
 * @param {string} journeyType
 * @returns {string[]}
 */
export function describeEffectChips(effects, journeyType = 'field') {
  return describeProjectedChips(projectAppliedEffects(effects, journeyType), journeyType);
}

/**
 * Chips for effects that are already as they land: a projection, or the
 * difference between two projected bands (a shortcut's noticed band over
 * its clean one, js/events/selection.js describeShortcutStakes).
 * @param {Object} projected
 * @param {string} journeyType
 * @returns {string[]}
 */
export function describeProjectedChips(projected, journeyType = 'field') {
  return [...effectChips(projected, journeyType), ...standingChips(projected)];
}

function standingChips(effects) {
  const chips = [];
  if (effects?.scrutiny) {
    const value = effects.scrutiny;
    chips.push(value > 0 ? `+${value} scrutiny` : `${value} scrutiny`);
  }
  if (effects?.reputation) {
    const value = effects.reputation;
    chips.push(value > 0 ? `+${value} reputation` : `${value} reputation`);
  }
  return chips;
}

/** Desk roles with no crew: a morale effect is the protagonist's stress. */
const DESK_PROTAGONIST_TYPES = new Set(['planning', 'permitting']);

function effectChips(effects, journeyType) {
  const hints = [];
  const option = { effects };
  const field = isFieldJourney(journeyType);
  // Only a crew on a traverse has a next leg for ground to land on.
  const traverse = journeyType === 'field' || journeyType === 'recon';
  if (option.effects) {
    if (option.effects.fuel !== undefined) {
      // The deck is written in the old units; a field crew's stock is litres
      // and resolution scales the delta, so the preview has to as well.
      const fuel = field ? Math.round(option.effects.fuel * FUEL_EFFECT_SCALE) : option.effects.fuel;
      const unit = field ? ' L fuel' : ' fuel';
      hints.push(fuel > 0 ? `+${fuel}${unit}` : `${fuel}${unit}`);
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
      // Short only when short is exact: $36,600 is "$36.6k", but $1,440 is
      // "$1,440", never a "$1.4k" that the ledger then contradicts.
      const thousands = Number((Math.abs(amount) / 1000).toFixed(1));
      const budgetStr = Math.abs(amount) >= 1000 && Math.round(thousands * 1000) === Math.round(Math.abs(amount))
        ? `$${thousands}k`
        : `$${Math.round(Math.abs(amount)).toLocaleString('en-CA')}`;
      const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
      hints.push(`${sign}${budgetStr}`);
    }

    if (option.effects.crew_health !== undefined) {
      hints.push(option.effects.crew_health > 0 ? `+${option.effects.crew_health} health` : `${option.effects.crew_health} health`);
    }
    if (option.effects.crew_morale !== undefined) {
      // A planner or permitter has no crew: morale lands on your own stress
      // (js/events/resolution.js), so the chip says stress, sign flipped.
      if (DESK_PROTAGONIST_TYPES.has(journeyType)) {
        const stress = -option.effects.crew_morale;
        if (stress !== 0) hints.push(stress > 0 ? `+${stress} stress` : `${stress} stress`);
      } else {
        hints.push(option.effects.crew_morale > 0 ? `+${option.effects.crew_morale} morale` : `${option.effects.crew_morale} morale`);
      }
    }

    if (option.effects.relationships !== undefined) {
      hints.push(option.effects.relationships > 0 ? `+${option.effects.relationships} relations` : `${option.effects.relationships} relations`);
    }
    if (option.effects.compliance !== undefined && journeyType === 'planning') {
      // A planner has no compliance meter: it lands on professional standing,
      // at half the size (js/events/resolution.js planningStandingDelta).
      const standing = planningStandingDelta(option.effects.compliance);
      if (standing !== 0) hints.push(`${standing > 0 ? '+' : ''}${standing} professional standing`);
    } else if (option.effects.compliance !== undefined) {
      hints.push(option.effects.compliance > 0 ? `+${option.effects.compliance} compliance` : `${option.effects.compliance} compliance`);
    }
    // On a permit desk compliance also lands on district goodwill one for
    // one; the effects here are projected (projectAppliedEffects), so that
    // goodwill is already in politicalCapital.
    if (option.effects.politicalCapital !== undefined) {
      // The outcome line calls it district goodwill on a desk file
      // (js/events/resolution.js describeGoodwillChange); the hint should too.
      const unit = journeyType === 'manager' ? 'capital' : 'goodwill';
      const goodwill = Number(option.effects.politicalCapital) || 0;
      // A capital cost the compliance gain pays back nets to nothing: no chip.
      if (goodwill !== 0) hints.push(goodwill > 0 ? `+${goodwill} ${unit}` : `${goodwill} ${unit}`);
    }

    if (option.effects.data !== undefined && option.effects.data !== 0) {
      hints.push(option.effects.data > 0 ? `+${option.effects.data} data` : `${option.effects.data} data`);
    }
    // Explicit planning-file keys (js/events/resolution.js
    // applyPlanningMetricEffects) move the gate they name.
    if (typeof option.effects.analysis === 'number' && option.effects.analysis !== 0) {
      hints.push(`${option.effects.analysis > 0 ? '+' : ''}${option.effects.analysis} analysis`);
    }
    if (typeof option.effects.buyIn === 'number' && option.effects.buyIn !== 0) {
      hints.push(`${option.effects.buyIn > 0 ? '+' : ''}${option.effects.buyIn} buy-in`);
    }
    if (typeof option.effects.cpdHours === 'number' && option.effects.cpdHours !== 0) {
      hints.push(`${option.effects.cpdHours > 0 ? '+' : ''}${option.effects.cpdHours}h on the CPD record`);
    }
    if (option.effects.progress !== undefined && option.effects.progress !== 0) {
      const progress = option.effects.progress;
      // Field ground goes through the next leg (applyEventTravelEffect), so
      // the hint says so rather than promising a jump down the road.
      if (traverse && option.effects.progressMode === 'turn_back') {
        hints.push('turn back; slower next travel leg');
      } else if (traverse && progress < 0) {
        hints.push('slower next travel leg');
      } else if (journeyType === 'planning') {
        // On a planning file generic progress is the planner's own time
        // (js/events/resolution.js applyPlanningProgress), never a gate.
        hints.push(progress > 0 ? 'time back on the file' : 'lost time on the file');
      } else if (traverse) {
        hints.push(`up to +${progress} km on the next leg`);
      } else if (journeyType === 'permitting' || journeyType === 'desk') {
        // A permit queue moves by clock-days, five points each
        // (js/events/resolution.js applyDeskProgress).
        const days = Math.min(4, Math.max(1, Math.round(Math.abs(progress) / 5)));
        hints.push(`${days} permit clock-day${days === 1 ? '' : 's'} ${progress > 0 ? 'sooner' : 'later'}`);
      } else if (journeyType === 'silviculture') {
        // Program schedule, eight points to the day.
        const days = Math.abs(progress) / 8;
        const text = days >= 1
          ? `${Number(days.toFixed(1))} day${days >= 1.05 ? 's' : ''}`
          : days >= 0.5 ? 'half a day' : 'part of a day';
        hints.push(`${progress > 0 ? '+' : '-'}${text} on the program schedule`);
      } else {
        hints.push(progress > 0 ? `+${progress} progress` : `${progress} progress`);
      }
    }
    if (option.effects.permits_approved !== undefined) {
      const amount = option.effects.permits_approved;
      const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
      hints.push(`${sign}${Math.abs(amount)} permits`);
    }
  }
  return hints;
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
