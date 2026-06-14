import test from "node:test";
import assert from "node:assert/strict";

import { buildObjectiveStrip, createInitialState } from "../js/engine.js";

function stateWith(roleId, metrics = {}) {
  const state = createInitialState({ companyName: "Strip Co", roleId, areaId: "fraser-plateau" });
  state.metrics = { ...state.metrics, ...metrics };
  return state;
}

test("objective strip carries the role mandate and win condition", () => {
  const strip = buildObjectiveStrip(stateWith("permitter"));
  assert.ok(strip, "permitter should have an objective strip");
  assert.equal(strip.primaryMetric, "compliance");
  assert.match(strip.goal, /compliance/i);
  assert.equal(strip.winCondition, "Clean approval pipeline");
});

test("strip reports all-stable at the baseline 50/50 metrics", () => {
  const strip = buildObjectiveStrip(stateWith("planner"));
  assert.equal(strip.risks.length, 0);
  assert.match(strip.pressure, /stable/i);
});

test("strip flags a collapsing meter as the pressing pressure", () => {
  const strip = buildObjectiveStrip(stateWith("recce", { budget: 10, compliance: 30 }));
  const metrics = strip.risks.map((risk) => risk.metric);
  assert.ok(metrics.includes("budget"), "budget at 10 should read as at-risk");
  assert.ok(metrics.includes("compliance"), "compliance at 30 should read as at-risk");
  // budget at 10 is the deepest below its warning band, so it should be the
  // single most pressing pressure.
  assert.match(strip.pressure, /budget/i);
});

test("no objective strip for an unknown role", () => {
  assert.equal(buildObjectiveStrip({ role: { id: "nope" }, metrics: {} }), null);
});
