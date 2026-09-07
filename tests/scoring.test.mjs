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
import {
  calculateScore,
  formatScoreDisplay,
  isSituationClosedClean,
  scoreSituationsClosedClean,
  scoreSweetSpot,
  SCORE_WEIGHT_PERCENTS,
} from "../js/scoring.js";

function stateWith(metrics, roleId = "planner") {
  const state = createInitialState({ companyName: "T", roleId, areaId: "fraser-plateau" });
  Object.assign(state.metrics, metrics);
  return state;
}

test("deriveTier ranks the four outcome bands", () => {
  assert.equal(deriveTier({ progress: 85, forestHealth: 85, relationships: 85, compliance: 85, budget: 85 }), "outstanding");
  assert.equal(deriveTier({ progress: 70, forestHealth: 62, relationships: 62, compliance: 70, budget: 60 }), "solid");
  assert.equal(deriveTier({ progress: 50, forestHealth: 48, relationships: 48, compliance: 50, budget: 45 }), "mixed");
  assert.equal(deriveTier({ progress: 30, forestHealth: 30, relationships: 30, compliance: 30, budget: 30 }), "stumbled");
});

test("deriveTier reflects the calibrated economy: a typical good year is solid", () => {
  // Near the top-third of sensible play per the balance sims — this shape of
  // year used to land in "mixed" because gates assumed metrics the economy
  // never produces (forest health ≥ 58, weighted average ≥ 64).
  assert.equal(deriveTier({ progress: 48, forestHealth: 52, relationships: 58, compliance: 72, budget: 44 }), "solid");
});

test("deriveTier does not promote a turtled year with no delivery past mixed", () => {
  // Elite compliance/relationships but almost nothing shipped: progress
  // floors gate both solid (35 / stewardship 30) and outstanding (38).
  assert.equal(deriveTier({ progress: 22, forestHealth: 58, relationships: 78, compliance: 92, budget: 52 }), "mixed");
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

test("scoreRun explains fired consequences in plain language", () => {
  const state = stateWith({});
  state.history.push({ type: "consequence", id: "audit-escalation", effects: {}, round: 2 });
  state.history.push({ type: "consequence", id: "trust-deficit", effects: {}, round: 3 });
  const result = scoreRun(state);
  assert.ok(result.reasons.includes("2 earlier calls came back on you this year."), result.reasons.join(" | "));
});

test("recce is judged on the defensibility of the field notes first", () => {
  const objective = getRoleObjective("recce");
  assert.equal(objective.primary, "compliance");
  assert.deepEqual(objective.secondary, ["progress", "relationships"]);
});

// ── Expedition grade (js/scoring.js) ─────────────────────────────────────────

test("expedition weights put delivery and the file ahead of speed and leftovers", () => {
  assert.deepEqual(SCORE_WEIGHT_PERCENTS, { objectives: 30, compliance: 25, crewWelfare: 25, resourceEfficiency: 10, speed: 10 });
  assert.equal(Object.values(SCORE_WEIGHT_PERCENTS).reduce((sum, value) => sum + value, 0), 100);
});

test("carrying margin home is never penalised; running out is", () => {
  assert.equal(scoreSweetSpot(0.9), 1);
  assert.equal(scoreSweetSpot(0.4), 1);
  assert.ok(scoreSweetSpot(0.05) < scoreSweetSpot(0.3));
  assert.equal(scoreSweetSpot(0), 0);
});

test("situations are scored by the share closed clean, not by how many happened", () => {
  const clean = { type: "event", effects: { compliance: 2 } };
  const dirty = { type: "event", effects: { compliance: -3 } };
  const injury = { type: "event", effects: {}, victimName: "Sam" };
  assert.equal(isSituationClosedClean(clean), true);
  assert.equal(isSituationClosedClean(dirty), false);
  assert.equal(isSituationClosedClean(injury), false);

  const busyAndDirty = scoreSituationsClosedClean({ log: [clean, dirty, dirty, injury, dirty, dirty, dirty, dirty, dirty] });
  const quietAndClean = scoreSituationsClosedClean({ log: [clean, clean, clean] });
  assert.ok(quietAndClean.score > busyAndDirty.score);
  assert.equal(scoreSituationsClosedClean({ log: [clean, clean, dirty, clean, dirty, clean, clean, clean, clean] }).label, "7 of 9 situations closed clean");
});

test("the grade display reconciles and names the compliance line", () => {
  const journey = {
    journeyType: "recon", day: 9, blocks: new Array(6).fill({}), distanceTraveled: 60, totalDistance: 60,
    crew: [{ isActive: true, health: 80, morale: 75 }], resources: { fuel: 70, food: 30, equipment: 80 },
    log: [{ type: "event", effects: { compliance: 1 } }, { type: "event", effects: { compliance: -2 } }],
    scrutiny: 10,
  };
  const result = calculateScore(journey, true);
  assert.ok(result.components.compliance, "compliance component present");
  assert.equal(result.components.compliance.label, "1 of 2 situations closed clean");
  const lines = formatScoreDisplay(result).join("\n");
  assert.match(lines, /Compliance/);
  assert.match(lines, /Time/);
  assert.doesNotMatch(lines, /events handled/);
});
