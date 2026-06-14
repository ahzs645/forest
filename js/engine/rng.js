// Small, dependency-free seeded RNG so a full seasonal run can be reproduced
// from a single seed (balance sims, deterministic tests, bug reports).
//
// The seasonal engine already threads an `rng` argument through every random
// draw (content selection, weighted picks, range rolls, risk resolution), so a
// controller that owns one of these and passes it down makes an entire year
// deterministic without touching global Math.random.

const UINT32 = 0x100000000;

function lcg(stateRef) {
  // Numerical Recipes LCG — same constants the e2e harness uses for its
  // deterministic Math.random override, so seeded runs line up across tools.
  stateRef.value = (1664525 * stateRef.value + 1013904223) >>> 0;
  return stateRef.value / UINT32;
}

/**
 * Create a seeded RNG function. The returned function behaves like Math.random
 * (returns a float in [0, 1)) and exposes:
 *   - fork():   a new independent RNG that continues from the current state,
 *               letting callers "peek" at upcoming draws without disturbing the
 *               main stream (used for the crisis-round issue preview).
 *   - state():  the current internal state, for snapshotting/debugging.
 */
export function makeRng(seed = Date.now()) {
  const stateRef = { value: normalizeSeed(seed) };
  const rng = () => lcg(stateRef);
  rng.fork = () => makeRng(stateRef.value);
  rng.state = () => stateRef.value;
  return rng;
}

function normalizeSeed(seed) {
  const numeric = Number(seed);
  const truncated = Number.isFinite(numeric) ? Math.floor(Math.abs(numeric)) >>> 0 : 0;
  // Avoid the LCG fixed point at 0.
  return truncated === 0 ? 0x9e3779b9 : truncated;
}

/** True when a value is one of our seeded RNGs (vs. bare Math.random). */
export function isForkableRng(rng) {
  return typeof rng === "function" && typeof rng.fork === "function";
}
