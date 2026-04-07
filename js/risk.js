/**
 * Risk Resolution Engine
 * Resolves gambling-style mischief option outcomes based on game state.
 */

/**
 * Resolve a risk-based option outcome.
 * @param {object} state  – current game state (has state.metrics, state.flags)
 * @param {object} risk   – { baseSuccess, successEffects, failEffects, successOutcome, failOutcome, successFlags, failFlags }
 * @param {function} rng  – random number generator (defaults to Math.random)
 * @returns {{ success: boolean, effects: object, outcome: string, flags?: object }}
 */
export function resolveRisk(state, risk, rng = Math.random) {
  // 1. Start with base success chance
  let successChance = risk.baseSuccess;

  // 2. Higher compliance makes it harder to cheat: ±25%
  successChance -= (state.metrics.compliance - 50) * 0.005;

  // 3. Better relationships = people look the other way: ±15%
  successChance += (state.metrics.relationships - 50) * 0.003;

  // 4. Clamp to [0.1, 0.9]
  successChance = Math.max(0.1, Math.min(0.9, successChance));

  // 5. Roll and resolve
  const roll = rng();
  const success = roll < successChance;

  const result = {
    success,
    effects: success ? risk.successEffects : risk.failEffects,
    outcome: success ? risk.successOutcome : risk.failOutcome,
  };

  const flags = success ? risk.successFlags : risk.failFlags;
  if (flags) {
    result.flags = flags;
  }

  return result;
}
