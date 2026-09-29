/**
 * Risk Resolution Engine
 * Resolves gambling-style option outcomes based on game state.
 *
 * A risk is two bands (success / fail) or, when it carries `chancePartial`,
 * three: clean (the payoff, buried), noticed (the payoff, and somebody wrote
 * down what they saw) and caught. The seasonal shortcut offer uses all three
 * so its odds read the way the deployment card's do.
 */

import { clamp } from "./engine/shared.js";

// The clean band never reads as certain either way: on a three-band gamble a
// serious offence keeps at least a 15% chance of going badly wrong, whatever
// the file looks like.
const MIN_CLEAN = 0.1;
const MAX_CLEAN = 0.9;
const MIN_CAUGHT = 0.15;

/**
 * The clean-band chance this state gives a risk. A file the district already
 * trusts gets the benefit of the doubt; one under scrutiny gets less; people
 * look the other way for someone they rate.
 * @param {object} state – has state.metrics
 * @param {object} risk  – { baseSuccess, chancePartial? }
 */
export function riskSuccessChance(state, risk) {
  let chance = Number(risk?.baseSuccess) || 0;
  const compliance = Number(state?.metrics?.compliance);
  const relationships = Number(state?.metrics?.relationships);
  if (Number.isFinite(compliance)) {
    chance += clamp((compliance - 50) * 0.004, -0.2, 0.1);
  }
  if (Number.isFinite(relationships)) {
    chance += clamp((relationships - 50) * 0.003, -0.09, 0.09);
  }
  const partial = Math.max(0, Number(risk?.chancePartial) || 0);
  const ceiling = partial > 0 ? Math.min(MAX_CLEAN, 1 - partial - MIN_CAUGHT) : MAX_CLEAN;
  return clamp(chance, MIN_CLEAN, Math.max(MIN_CLEAN, ceiling));
}

/**
 * The three bands as fractions for this state, summing to 1.
 * @returns {{ clean: number, noticed: number, caught: number }}
 */
export function riskBandOdds(state, risk) {
  const clean = riskSuccessChance(state, risk);
  const noticed = Math.max(0, Math.min(Number(risk?.chancePartial) || 0, 1 - clean - MIN_CAUGHT));
  return { clean, noticed, caught: Math.max(0, 1 - clean - noticed) };
}

/**
 * Resolve a risk-based option outcome.
 * @param {object} state  – current game state (has state.metrics, state.flags)
 * @param {object} risk   – { baseSuccess, successEffects, failEffects, successOutcome, failOutcome,
 *                            successFlags, failFlags, chancePartial?, partialEffects?, partialOutcome?, partialFlags? }
 * @param {function} rng  – random number generator (defaults to Math.random)
 * @returns {{ success: boolean, band: 'clean'|'noticed'|'caught', effects: object, outcome: string, flags?: object, odds: object }}
 */
export function resolveRisk(state, risk, rng = Math.random) {
  const odds = riskBandOdds(state, risk);
  const roll = rng();
  const band = roll < odds.clean ? "clean" : roll < odds.clean + odds.noticed ? "noticed" : "caught";

  // The payoff lands on both the clean and the noticed band; only the caught
  // band takes it away, so `success` keeps meaning "it landed" for callers
  // that only know two bands.
  const success = band !== "caught";
  const result = {
    success,
    band,
    odds,
    effects: band === "clean"
      ? risk.successEffects
      : band === "noticed"
        ? risk.partialEffects ?? risk.successEffects
        : risk.failEffects,
    outcome: band === "clean"
      ? risk.successOutcome
      : band === "noticed"
        ? risk.partialOutcome ?? risk.successOutcome
        : risk.failOutcome,
  };

  const flags = band === "clean"
    ? risk.successFlags
    : band === "noticed"
      ? risk.partialFlags ?? risk.successFlags
      : risk.failFlags;
  if (flags) {
    result.flags = flags;
  }

  return result;
}
