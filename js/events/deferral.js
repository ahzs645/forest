/**
 * What setting a situation aside costs.
 *
 * Declining is always on the card (js/journey/daySituation.js), so it has to
 * cost something or it is the only move anyone makes. Scrutiny always: the
 * file notices what you did not do. Beyond that the charge is sized to the
 * situation itself:
 *
 *   - a positive turn costs nothing but the chance;
 *   - a minor call costs scrutiny alone;
 *   - a moderate or severe call also costs the people carrying the run - a
 *     field crew's morale, a desk protagonist's stress;
 *   - an imposed situation, one where every authored option carries a cost
 *     (a budget cut, an audit, a Board report), lands anyway. The least of
 *     what answering would have cost is charged - gambles at their expected
 *     cost - without the work that would have earned anything back, and
 *     capped by the situation's weight. "Set it aside" used to cancel a 15%
 *     budget cut outright.
 *
 * Every deferral is logged as a situation, so the debrief's compliance tally
 * counts it against the file instead of pretending it never happened.
 *
 * On a planner's or permitter's desk a set-aside never comes out cheaper than
 * answering: the charge is the cheapest lawful answer's expected cost in full,
 * minor cards included, with only the budget capped. Scaled down by weight it
 * was the cheapest way through a budget cut or a Nation's engagement request,
 * well under the "Delay engagement" it amounts to, which paid silence.
 *
 * Nobody sets a hurt crew member aside for free either. On an injury or an
 * illness card the crew makes the call without you, and it goes the hard way:
 * the least answer's worst band lands in full, crew effect included (the
 * evacuation, the injury). "Set it aside" on a chainsaw kickback used to charge
 * a little fuel and morale and leave the bleeding crew member on the block,
 * the cheapest line on the card. A safety investigation is priced in full too.
 */

import { applyEventEffects, describeGoodwillChange, handleCrewEffect, readGoodwill } from './resolution.js';
import { deriveOptionRiskTag, INVERTED_EFFECT_KEYS, STEEP_EFFECT_THRESHOLDS } from './display.js';
import { getOptionShortfall } from './affordability.js';
import { getDayRng } from './dayRng.js';

/** Effect keys that are not a cost the day can be charged. */
const NON_COST_KEYS = new Set(['timeUsed', 'progressMode', 'permits_approved', 'discoveryTags', 'blockSelection']);

/** Downside a key has no authored steep threshold for (js/events/display.js). */
const DEFAULT_STEEP_THRESHOLD = -6;

/** The negative, non-inverted numeric effects of an option: what it costs. */
function negativeCosts(effects) {
  const costs = {};
  for (const [key, raw] of Object.entries(effects || {})) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value >= 0) continue;
    if (INVERTED_EFFECT_KEYS.has(key) || NON_COST_KEYS.has(key)) continue;
    costs[key] = value;
  }
  return costs;
}

/** Cost in "steep units": one steep hit on any key is 1. */
function downsideScore(effects) {
  let total = 0;
  for (const [key, value] of Object.entries(negativeCosts(effects))) {
    total += Math.abs(value) / Math.abs(STEEP_EFFECT_THRESHOLDS[key] ?? DEFAULT_STEEP_THRESHOLD);
  }
  return total;
}

/** How bad an option is to take, counting exposure that is not on its effects. */
function optionDownside(option, effects) {
  let score = downsideScore(effects);
  if (option?.crewEffect) score += 1;
  if (option?.schedulesEvent || option?.failureSchedulesEvent) score += 0.5;
  if (typeof option?.riskInjury === 'number') score += option.riskInjury * 2;
  if (typeof (option?.riskCompliance ?? option?.riskRejection) === 'number') score += 0.5;
  return score;
}

/** Desk roles whose set-aside is priced at the cheapest lawful answer in full. */
const FULL_PRICE_JOURNEYS = new Set(['planning', 'permitting']);

/** Cards where somebody on the crew is already hurt or sick. */
const CREW_CASUALTY_TYPES = new Set(['injury', 'illness']);

/**
 * Whether this card is somebody hurt or sick on the crew: setting it aside
 * does not make them well, so the worst of the least answer lands.
 * @param {Object} event
 * @returns {boolean}
 */
export function isCrewCasualtySituation(event) {
  if (String(event?.severity || '').toLowerCase() === 'positive') return false;
  return CREW_CASUALTY_TYPES.has(String(event?.type || '').toLowerCase());
}

/** A safety card (an injury, an illness, a WorkSafeBC investigation): never cheaper to walk away from. */
function isSafetySituation(event) {
  return isCrewCasualtySituation(event) || String(event?.type || '').toLowerCase() === 'safety';
}

/**
 * The worst band of an option, crew effect included: what the crew gets when
 * it answers a casualty card without you. An option's own crewEffect belongs
 * to its good band (js/events/resolution.js); a worse band that authors none
 * of its own still carries it here, because the hurt hand goes out whichever
 * way the road goes ("the ER stabilizes him").
 */
function worstBand(option) {
  const own = option?.crewEffect || null;
  const bands = [{ effects: option?.effects || {}, crewEffect: own, outcome: option?.outcome }];
  if (typeof option?.chancePartial === 'number' && option.partialEffects) {
    bands.push({ effects: option.partialEffects, crewEffect: option.partialCrewEffect || own, outcome: option.partialOutcome });
  }
  if (typeof option?.chanceSuccess === 'number' && option.failureEffects) {
    bands.push({ effects: option.failureEffects, crewEffect: option.failureCrewEffect || own, outcome: option.failureOutcome });
  }
  const score = (band) => downsideScore(band.effects) + (band.crewEffect ? 1 : 0);
  return bands.reduce((worst, band) => (score(band) > score(worst) ? band : worst));
}

/** An unlawful answer on an ordinary card: setting the card aside is not choosing it. */
function isOffBook(option) {
  return option?.riskTag === 'OFF-BOOK';
}

/**
 * Whether the situation is one nobody walks away from for free: moderate or
 * worse, and every authored option carries a cost or a risk. On a desk a
 * minor card counts too: "Woodlands Wants Your Budget" cost a point of
 * scrutiny to ignore when every answer cost money or goodwill.
 * @param {Object} event
 * @param {number} weight - situationWeight(event), 1-3
 * @param {Object} [context]
 * @param {boolean} [context.desk] - price it the desk way (see above)
 * @param {boolean} [context.safety] - an injury, illness or safety card
 * @returns {boolean}
 */
export function isImposedSituation(event, weight, { desk = false, safety = isSafetySituation(event) } = {}) {
  const options = Array.isArray(event?.options) ? event.options : [];
  if (!options.length) return false;
  // Somebody is hurt, or WorkSafeBC is asking: there is no free way out.
  if (safety) return true;
  if (weight < (desk ? 1 : 2)) return false;
  return options.every((option) => deriveOptionRiskTag(option) !== 'SAFE');
}

/**
 * How much of an imposed situation a deferral may land, by weight. Past this
 * the charge is scaled down, never refused: walking away from a moderate call
 * costs at most two steep hits on the file, a severe one three, and the
 * budget at most a small share of what the run started with. Setting aside a
 * billing dispute once charged $18,000 - a quarter of an Old Growth budget -
 * because the only certain option on the card was paying the invoice.
 */
const DEFERRAL_CAP_STEEP_UNITS = { 2: 2, 3: 3 };
const DEFERRAL_BUDGET_SHARE = { 1: 0.04, 2: 0.06, 3: 0.1 };

/**
 * What an option costs on average. A certain option costs its effects; a
 * gamble costs its bands weighted by the authored odds, so a 60% chance of
 * getting away clean is not priced as if it always failed, nor as if it
 * never could.
 */
function expectedCosts(option) {
  if (typeof option?.chanceSuccess !== 'number') return negativeCosts(option?.effects);
  const odds = Math.max(0, Math.min(1, option.chanceSuccess));
  const good = option.effects || {};
  const bad = option.failureEffects || option.effects || {};
  const blended = {};
  for (const key of new Set([...Object.keys(good), ...Object.keys(bad)])) {
    const a = Number(good[key] || 0);
    const b = Number(bad[key] || 0);
    if (Number.isFinite(a) && Number.isFinite(b)) blended[key] = odds * a + (1 - odds) * b;
  }
  return negativeCosts(blended);
}

/**
 * Scale a charge down to what the situation's weight allows. Non-budget
 * costs shrink together, so the shape of the hit survives; the budget is
 * capped on its own against the run's starting budget.
 */
function capDeferredCost(costs, weight, budgetBase, { fullPrice = false, uncappedBudget = false } = {}) {
  const capped = {};
  const { budget, ...rest } = costs;
  const units = downsideScore(rest);
  const limit = DEFERRAL_CAP_STEEP_UNITS[weight] ?? DEFERRAL_CAP_STEEP_UNITS[3];
  const scale = !fullPrice && units > limit ? limit / units : 1;
  for (const [key, value] of Object.entries(rest)) {
    const charged = Math.round(value * scale);
    if (charged < 0) capped[key] = charged;
  }
  if (typeof budget === 'number') {
    const share = DEFERRAL_BUDGET_SHARE[weight] ?? DEFERRAL_BUDGET_SHARE[3];
    const ceiling = !uncappedBudget && Number(budgetBase) > 0
      ? Math.floor((Number(budgetBase) * share) / 100) * 100
      : Infinity;
    const charged = Math.max(-ceiling, Math.round(budget / 100) * 100);
    if (charged < 0) capped.budget = charged;
  }
  return capped;
}

/**
 * The cost that lands when an imposed situation is deferred: the least of
 * what answering it would have cost, capped by the situation's weight.
 *
 * Every option is priced on the same footing - a certain option by its
 * effects, a gamble by its expected cost - and the cheapest is charged, a
 * certain option winning a tie. Null when the situation is not imposed, or
 * when the cheapest answer costs nothing fixed (it is all risk).
 * @param {Object} event
 * @param {number} weight
 * @param {Object} [context]
 * @param {number} [context.budgetBase] - the run's starting budget, for the cap
 * @param {Object} [context.journey] - when given, an option the card left off
 *   because the crew could not pay for it (js/events/affordability.js) is not
 *   the cost that lands either: a $3,000 medevac the card never offered
 * On a crew casualty card the least answer's worst band lands instead, in
 * full and with its crew effect: the crew answers it without you.
 * @returns {{option: Object, effects: Object, uncapped: Object, crewEffect?: Object, outcome?: string}|null}
 */
export function pickDeferredCost(event, weight, { budgetBase, journey = null } = {}) {
  const desk = FULL_PRICE_JOURNEYS.has(journey?.journeyType);
  // A GM hears about the injury from a division; the crew on the block is
  // not the executive team, so head office prices it the ordinary way.
  const field = journey?.journeyType !== 'manager';
  const safety = field && isSafetySituation(event);
  const casualty = field && isCrewCasualtySituation(event);
  const fullPrice = desk || safety;
  if (!isImposedSituation(event, weight, { desk, safety })) return null;
  const lawful = event.options.filter((option) => !isOffBook(option));
  const payable = journey ? lawful.filter((option) => !getOptionShortfall(journey, option)) : [];
  const offered = payable.length ? payable : lawful.length ? lawful : event.options;
  const candidates = offered.map((option, index) => {
    const costs = expectedCosts(option);
    return {
      option,
      costs,
      score: optionDownside(option, costs),
      gamble: typeof option?.chanceSuccess === 'number',
      index,
    };
  });
  candidates.sort((a, b) => (a.score - b.score) || (a.gamble - b.gamble) || (a.index - b.index));
  const least = candidates[0];
  if (casualty) {
    const band = worstBand(least.option);
    const costs = negativeCosts(band.effects);
    // Scrutiny is inverted (a rise is the cost), so negativeCosts drops it;
    // the incident review the worst band opens still lands.
    const scrutiny = Number(band.effects?.scrutiny);
    const effects = {
      ...capDeferredCost(costs, weight, budgetBase, { fullPrice, uncappedBudget: true }),
      ...(scrutiny > 0 ? { scrutiny } : {}),
    };
    if (!Object.keys(effects).length && !band.crewEffect) return null;
    return { option: least.option, effects, uncapped: costs, crewEffect: band.crewEffect, outcome: band.outcome };
  }
  const effects = capDeferredCost(least.costs, weight, budgetBase, { fullPrice, uncappedBudget: safety });
  return Object.keys(effects).length ? { option: least.option, effects, uncapped: least.costs } : null;
}

/**
 * Charge the journey for a situation the player set aside, and log it.
 *
 * @param {Object} journey
 * @param {Object} event
 * @param {Object} options
 * @param {number} options.weight - situationWeight(event)
 * @param {boolean} [options.imposedCost=true] - false when the mode already
 *   carries the deferral forward itself (a recon obstruction stays on the
 *   route until cleared, which is its cost)
 * @returns {{messages: string[], effects: Object}}
 */
export function applyDeferredSituation(journey, event, { weight, imposedCost = true }) {
  const messages = [];
  const severity = String(event?.severity || 'minor').toLowerCase();
  const scrutinyBefore = Number(journey.scrutiny || 0);
  const goodwillBefore = readGoodwill(journey);
  let applied = {};

  if (severity === 'positive') {
    messages.push('You let it pass. Nothing lost but the moment.');
  } else {
    const budgetBase = Number(journey.budgetStart) > 0 ? journey.budgetStart : journey.resources?.budget;
    const deferred = imposedCost ? pickDeferredCost(event, weight, { budgetBase, journey }) : null;
    if (deferred?.crewEffect !== undefined) {
      // A crew casualty: the crew answers it without you, the hard way.
      messages.push('Nobody sets a hurt crew member aside. The crew makes the call without you, and it goes the hard way:');
      if (deferred.outcome) messages.push(deferred.outcome);
      applyEventEffects(journey, deferred.effects, messages);
      if (deferred.crewEffect) {
        handleCrewEffect(journey, deferred.crewEffect, messages, getDayRng(journey, `set-aside:${event?.id || 'event'}`));
      }
      applied = deferred.effects;
    } else if (deferred) {
      messages.push('You set it aside. It lands anyway — the least of it:');
      applyEventEffects(journey, deferred.effects, messages);
      applied = deferred.effects;
    }

    journey.scrutiny = Math.min(100, Number(journey.scrutiny || 0) + weight);

    // The human cost lands on whoever is carrying the run, and only for
    // things that mattered: a player triaging well declines a dozen-plus
    // situations in a season, and charging for every deferred phone call
    // turns judgement into an attrition spiral.
    const humanCost = weight >= 2 ? weight : 0;
    let humanLine = '';
    if (humanCost > 0) {
      const crew = Array.isArray(journey.crew) ? journey.crew.filter((m) => m.isActive) : [];
      if (crew.length > 0) {
        for (const member of crew) member.morale = Math.max(0, member.morale - humanCost);
        humanLine = journey.journeyType === 'manager'
          ? `; the executive team notices (morale -${humanCost})`
          : `; the crew notices (morale -${humanCost})`;
      } else if (journey.protagonist) {
        journey.protagonist.stress = Math.min(100, (journey.protagonist.stress || 0) + humanCost);
        humanLine = `; it sits with you (stress +${humanCost})`;
      }
    }

    const scrutinyDelta = Math.round(Number(journey.scrutiny || 0) - scrutinyBefore);
    // At the ceiling there is no more for the file to notice; "+0" read as free.
    const tail = scrutinyDelta > 0 || scrutinyBefore < 100
      ? `Scrutiny +${scrutinyDelta}${humanLine}.`
      : `Scrutiny is already at 100%${humanLine}.`;
    messages.push(deferred
      ? `You did not decide, and the file notices. ${tail}`
      : weight >= 2
        ? `You leave it. ${tail}`
        : `You leave it for ${journey.journeyType === 'manager' ? 'another month' : 'another day'}. ${tail}`);
    messages.push(...describeGoodwillChange(journey, goodwillBefore));
    applied = { ...applied, scrutiny: scrutinyDelta };
  }

  if (!journey.log) journey.log = [];
  journey.log.push({
    day: journey.day,
    type: 'event',
    eventId: event?.id,
    eventTitle: event?.title,
    optionLabel: 'Set it aside',
    setAside: true,
    outcome: messages[0] || '',
    consequences: messages.slice(1),
    effects: applied,
    severity: event?.severity,
  });

  return { messages, effects: applied };
}
