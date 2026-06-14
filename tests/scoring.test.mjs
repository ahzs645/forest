import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState } from "../js/engine.js";
import {
  scoreRun,
  scoreMetricHealth,
  scoreRolePerformance,
  scoreRiskLoad,
  deriveTier,
} from "../js/engine/scoring.js";
import { getRoleObjective } from "../js/engine/roleObjectives.js";

function stateWith(metrics, roleId = "planner") {
  const state = createInitialState({ companyName: "T", roleId, areaId: "fraser-plateau" });
  Object.assign(state.metrics, metrics);
  return state;
}

test("deriveTier preserves the original summary thresholds", () => {
  assert.equal(deriveTier({ progress: 85, forestHealth: 85, relationships: 85, compliance: 85, budget: 85 }), "outstanding");
  assert.equal(deriveTier({ progress: 70, forestHealth: 62, relationships: 62, compliance: 70, budget: 60 }), "solid");
  assert.equal(deriveTier({ progress: 50, forestHealth: 48, relationships: 48, compliance: 50, budget: 45 }), "mixed");
  assert.equal(deriveTier({ progress: 30, forestHealth: 30, relationships: 30, compliance: 30, budget: 30 }), "stumbled");
});

test("scoreMetricHealth weights compliance above budget", () => {
  const compliant = scoreMetricHealth({ progress: 50, forestHealth: 50, relationships: 50, compliance: 80, budget: 50 });
  const flush = scoreMetricHealth({ progress: 50, forestHealth: 50, relationships: 50, compliance: 50, budget: 80 });
  assert.ok(compliant > flush, "a compliance lead should score higher than an equal budget lead");
});

test("scoreRolePerformance rewards the role's primary metric", () => {
  const objective = getRoleObjective("silviculture");
  assert.equal(objective.primary, "forestHealth");
  const strong = scoreRolePerformance(stateWith({ forestHealth: 85 }, "silviculture"));
  const weak = scoreRolePerformance(stateWith({ forestHealth: 25 }, "silviculture"));
  assert.ok(strong > weak);
});

test("scoreRiskLoad penalizes fired consequences and collapsed meters", () => {
  const clean = stateWith({});
  assert.equal(scoreRiskLoad(clean), 0);

  const stressed = stateWith({ budget: 10 });
  stressed.history.push({ type: "consequence", id: "audit-escalation", effects: {}, round: 2 });
  assert.ok(scoreRiskLoad(stressed) < 0);
});

test("scoreRun returns a tier, bounded score, and reasons", () => {
  const result = scoreRun(stateWith({ progress: 70, forestHealth: 65, relationships: 62, compliance: 72, budget: 55 }));
  assert.ok(["outstanding", "solid", "mixed", "stumbled"].includes(result.tier));
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(Array.isArray(result.reasons) && result.reasons.length > 0);
});
