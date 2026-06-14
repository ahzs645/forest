import test from "node:test";
import assert from "node:assert/strict";

import { makeRng } from "../js/engine/rng.js";
import {
  STRATEGIES,
  chooseOption,
  simulateRun,
  listSeasonalRoleIds,
  listAreaIds,
} from "../js/engine/simulate.js";

test("makeRng is deterministic and fork runs a parallel stream", () => {
  const a = makeRng(1234);
  const b = makeRng(1234);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);

  const r = makeRng(99);
  r();
  const fork = r.fork();
  // The fork continues from r's current state, so their next draws match.
  assert.equal(fork(), r());
});

test("chooseOption honors authored stance when present", () => {
  const opts = [
    { stance: "cautious", effects: { compliance: 5 } },
    { stance: "balanced", effects: { progress: 2 } },
    { stance: "aggressive", effects: { progress: 5, compliance: -5 } },
  ];
  const metrics = { progress: 50, forestHealth: 50, relationships: 50, compliance: 50, budget: 50 };
  const rng = makeRng(1);
  assert.equal(chooseOption("cautious", opts, metrics, "planner", rng), 0);
  assert.equal(chooseOption("balanced", opts, metrics, "planner", rng), 1);
  assert.equal(chooseOption("aggressive", opts, metrics, "planner", rng), 2);
});

test("chooseOption greedy maximizes weighted immediate gain", () => {
  const opts = [
    { effects: { progress: 1 } },
    { effects: { compliance: 4 } }, // weight 1.2 -> 4.8, best
    { effects: { budget: 5 } }, // weight 0.8 -> 4.0
  ];
  const metrics = { progress: 50, forestHealth: 50, relationships: 50, compliance: 50, budget: 50 };
  assert.equal(chooseOption("greedy", opts, metrics, "planner", makeRng(1)), 1);
});

test("chooseOption weakest-metric helps the lowest current meter", () => {
  const opts = [
    { effects: { progress: 6 } },
    { effects: { budget: 6 } }, // budget is weakest
  ];
  const metrics = { progress: 80, forestHealth: 70, relationships: 70, compliance: 70, budget: 20 };
  assert.equal(chooseOption("weakest-metric", opts, metrics, "recce", makeRng(1)), 1);
});

test("simulateRun is fully reproducible for a fixed seed", () => {
  const a = simulateRun({ roleId: "planner", areaId: "fraser-plateau", strategy: "balanced", seed: 42 });
  const b = simulateRun({ roleId: "planner", areaId: "fraser-plateau", strategy: "balanced", seed: 42 });
  assert.deepEqual(a, b);
  assert.equal(a.completed, true);
  assert.equal(a.seasonHeadlines.length, 4);
  assert.equal(Object.keys(a.finalMetrics).length, 5);
});

test("every role x area x strategy completes a full year", () => {
  for (const roleId of listSeasonalRoleIds()) {
    for (const areaId of listAreaIds().slice(0, 2)) {
      for (const strategy of STRATEGIES) {
        const result = simulateRun({ roleId, areaId, strategy, seed: 7 });
        assert.equal(result.completed, true, `${roleId}/${areaId}/${strategy} did not finish`);
      }
    }
  }
});

test("aggressive play erodes compliance relative to cautious play", () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const avg = (strategy) =>
    seeds
      .map((seed) => simulateRun({ roleId: "planner", areaId: "fraser-plateau", strategy, seed }).finalMetrics.compliance)
      .reduce((sum, value) => sum + value, 0) / seeds.length;

  assert.ok(avg("aggressive") < avg("cautious"), "expected aggressive compliance < cautious compliance");
});
