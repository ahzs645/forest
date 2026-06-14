import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRoundConsequences,
  createInitialState,
  deriveTier,
  scoreRiskLoad,
} from "../js/engine.js";

function makeState(roleId = "recce") {
  return createInitialState({
    companyName: "Balance Test",
    roleId,
    areaId: "fort-st-john-plateau",
  });
}

// ── Reachable professional consequences (review items 4) ─────────────────────

test("a compliance collapse drives professional audit exposure upward", () => {
  const state = makeState();
  state.round = 1;
  state.metrics.compliance = 18; // below the audit line
  const before = state.professional.auditExposure;
  applyRoundConsequences(state);
  assert.ok(
    state.professional.auditExposure >= before + 5,
    "letting compliance fall below the audit line should raise audit exposure",
  );
});

test("professional-audit fires once audit exposure crosses the line through play", () => {
  const state = makeState();
  state.round = 2;
  state.metrics.compliance = 20; // keeps adding scrutiny
  state.professional.auditExposure = 33;
  const consequences = applyRoundConsequences(state);
  assert.ok(consequences.includes("professional-audit"));
});

test("registration lapses on a deep, sustained collapse and then drags compliance", () => {
  const state = makeState();
  state.round = 4;
  state.metrics.compliance = 18;
  state.flags.auditEscalationActive = true;
  state.professional.auditExposure = 40;
  state.professional.competenceRisk = 35;

  const consequences = applyRoundConsequences(state);
  assert.equal(state.professional.registrationStatus, "lapsed");
  assert.ok(consequences.includes("registration-lapse"));
});

test("a healthy file never lapses registration or draws a professional audit", () => {
  const state = makeState("planner");
  for (let round = 1; round <= 4; round += 1) {
    state.round = round;
    state.metrics.compliance = 80;
    state.metrics.relationships = 70;
    const consequences = applyRoundConsequences(state);
    assert.ok(!consequences.includes("registration-lapse"));
    assert.ok(!consequences.includes("professional-audit"));
  }
  assert.equal(state.professional.registrationStatus, "active");
});

// ── Recovery levers (review item 3) ──────────────────────────────────────────

test("operational dividend rebounds budget for a clean file without a risk penalty", () => {
  const state = makeState("planner");
  state.round = 2;
  state.metrics = { progress: 50, forestHealth: 50, relationships: 70, compliance: 75, budget: 40 };
  const consequences = applyRoundConsequences(state);
  assert.ok(consequences.includes("operational-dividend"));
  assert.equal(state.metrics.budget, 45);
  // The dividend is recorded as a recovery, not a consequence, so it must not
  // count against the run's risk-load score.
  assert.equal(scoreRiskLoad(state), 0);
});

test("comeback window steadies the weakest meter late in a salvageable run", () => {
  const state = makeState("recce");
  state.round = 3;
  state.metrics = { progress: 30, forestHealth: 50, relationships: 50, compliance: 50, budget: 50 };
  const consequences = applyRoundConsequences(state);
  assert.ok(consequences.includes("comeback-window"));
  assert.equal(state.metrics.progress, 35);
});

test("comeback window stays shut when the run is already collapsing", () => {
  const state = makeState("recce");
  state.round = 4;
  state.metrics = { progress: 10, forestHealth: 20, relationships: 20, compliance: 20, budget: 20 };
  const consequences = applyRoundConsequences(state);
  assert.ok(!consequences.includes("comeback-window"));
});

// ── Reachable Outstanding (review item 3) ────────────────────────────────────

test("outstanding is reachable via the stewardship path", () => {
  assert.equal(
    deriveTier({ progress: 52, forestHealth: 57, relationships: 85, compliance: 90, budget: 50 }),
    "outstanding",
  );
});

test("outstanding is reachable via the ecology path", () => {
  assert.equal(
    deriveTier({ progress: 62, forestHealth: 68, relationships: 74, compliance: 78, budget: 52 }),
    "outstanding",
  );
});

test("a collapsed meter blocks outstanding even with elite compliance and relationships", () => {
  assert.notEqual(
    deriveTier({ progress: 52, forestHealth: 57, relationships: 85, compliance: 90, budget: 30 }),
    "outstanding",
  );
});
