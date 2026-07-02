import test from "node:test";
import assert from "node:assert/strict";

import {
  STRATEGIES,
  simulateRun,
  simulateMatrix,
  listSeasonalRoleIds,
  listAreaIds,
} from "../js/engine/simulate.js";

// A modest but representative matrix: every role × every area × every strategy
// across a handful of seeds. Kept deterministic so the assertions are stable.
const SEEDS = 8;
const MATRIX = simulateMatrix({
  roles: listSeasonalRoleIds(),
  areas: listAreaIds(),
  strategies: STRATEGIES,
  runs: SEEDS,
  seedBase: 1000,
});

test("every role × area × strategy finishes a full seasonal year", () => {
  const unfinished = MATRIX.filter((run) => !run.completed);
  assert.equal(unfinished.length, 0, `${unfinished.length} runs did not complete`);
});

test("Outstanding is reachable under a known seed", () => {
  // Regression guard for the reachable-Outstanding tuning pass. The witness
  // seed is re-picked whenever draw-order changes shift the RNG stream (last:
  // the 2026-07 temptation-frequency bump).
  const run = simulateRun({
    roleId: "permitter",
    areaId: "fort-st-john-plateau",
    strategy: "greedy",
    seed: 1001,
  });
  assert.equal(run.endingTier, "outstanding");
});

test("Outstanding shows up across the matrix without being common", () => {
  const outstanding = MATRIX.filter((run) => run.endingTier === "outstanding");
  assert.ok(outstanding.length > 0, "expected at least one outstanding ending in the matrix");
  // It should stay aspirational — well under a tenth of all runs.
  assert.ok(
    outstanding.length / MATRIX.length < 0.1,
    `outstanding rate ${(100 * outstanding.length / MATRIX.length).toFixed(1)}% is too high`,
  );
});

test("both professional consequences fire somewhere in the matrix", () => {
  const fired = new Set();
  for (const run of MATRIX) {
    for (const id of run.consequences) fired.add(id);
  }
  assert.ok(fired.has("registration-lapse"), "registration-lapse never fired");
  assert.ok(fired.has("professional-audit"), "professional-audit never fired");
});

test("no single issue dominates the matrix beyond a cap", () => {
  const counts = new Map();
  for (const run of MATRIX) {
    for (const id of run.issuesSeen) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const [topId, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const share = topCount / MATRIX.length;
  // The flattened issue weighting keeps the most frequent issue near ~22% of
  // runs; 30% is a regression guard, not a target.
  assert.ok(
    share <= 0.3,
    `top issue ${topId} appeared in ${(100 * share).toFixed(1)}% of runs (cap 30%)`,
  );
});
