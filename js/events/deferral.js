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
 *     its authored costs is charged, without the work that would have
 *     earned anything back. "Set it aside" used to cancel a 15% budget cut
 *     outright.
 *
 * Every deferral is logged as a situation, so the debrief's compliance tally
 * counts it against the file instead of pretending it never happened.
 */

import { applyEventEffects, describeGoodwillChange, readGoodwill } from './resolution.js';
import { deriveOptionRiskTag, INVERTED_EFFECT_KEYS, STEEP_EFFECT_THRESHOLDS } from './display.js';

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

/**
 * Whether the situation is one nobody walks away from for free: moderate or
 * worse, and every authored option carries a cost or a risk.
 * @param {Object} event
 * @param {number} weight - situationWeight(event), 1-3
 * @returns {boolean}
 */
export function isImposedSituation(event, weight) {
  if (weight < 2) return false;
  const options = Array.isArray(event?.options) ? event.options : [];
  if (!options.length) return false;
  return options.every((option) => deriveOptionRiskTag(option) !== 'SAFE');
}

/**
 * The cost that lands when an imposed situation is deferred: the least-bad
 * certain option's own costs. A gamble's good band is a hope, not a cost, so
 * gambles are only considered when nothing certain is on the card, and then
 * by what happens when nobody acts - their failure band. Null when the
 * situation is not imposed, or when the least-bad option's exposure is all
 * risk and no fixed cost.
 * @param {Object} event
 * @param {number} weight
 * @returns {{option: Object, effects: Object}|null}
 */
export function pickDeferredCost(event, weight) {
  if (!isImposedSituation(event, weight)) return null;
  const certain = event.options.filter((option) => typeof option?.chanceSuccess !== 'number');
  const candidates = (certain.length ? certain : event.options).map((option) => ({
    option,
    effects: certain.length ? option.effects : (option.failureEffects || option.effects),
  }));
  candidates.sort((a, b) => optionDownside(a.option, a.effects) - optionDownside(b.option, b.effects));
  const least = candidates[0];
  const effects = negativeCosts(least?.effects);
  return Object.keys(effects).length ? { option: least.option, effects } : null;
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
    const deferred = imposedCost ? pickDeferredCost(event, weight) : null;
    if (deferred) {
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
        humanLine = `; the crew notices (morale -${humanCost})`;
      } else if (journey.protagonist) {
        journey.protagonist.stress = Math.min(100, (journey.protagonist.stress || 0) + humanCost);
        humanLine = `; it sits with you (stress +${humanCost})`;
      }
    }

    const scrutinyDelta = Math.round(Number(journey.scrutiny || 0) - scrutinyBefore);
    const tail = `Scrutiny +${scrutinyDelta}${humanLine}.`;
    messages.push(deferred
      ? `You did not decide, and the file notices. ${tail}`
      : weight >= 2
        ? `You leave it. ${tail}`
        : `You leave it for another day. ${tail}`);
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
