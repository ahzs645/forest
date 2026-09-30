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

// ── Desk roles: planner and permitter ───────────────────────────────────────

function permitterAt({ day, approved, budget = 40000, stress = 30, energy = 70, politicalCapital = 30 }) {
  return {
    journeyType: "permitting", day, deadline: 30, budgetStart: 58000,
    permits: { target: 15, approved },
    resources: { budget, politicalCapital },
    protagonist: { stress, energy },
    log: [], scrutiny: 30, crew: [],
  };
}

test("being pulled off the file early never earns more Time than winning", () => {
  const firedEarly = calculateScore(permitterAt({ day: 12, approved: 11, politicalCapital: 0 }), false);
  const won = calculateScore(permitterAt({ day: 19, approved: 15 }), true);
  assert.equal(firedEarly.components.speed.score, 0, "a file that was not delivered earns no Time");
  assert.match(firedEarly.components.speed.label, /not delivered/);
  assert.ok(won.components.speed.score > firedEarly.components.speed.score);
  assert.ok(won.totalScore > firedEarly.totalScore);
});

test("failing early does not outscore running the clock out with more of the file done", () => {
  const base = {
    journeyType: "planning", deadline: 33, budgetStart: 66000, crew: [], log: [], scrutiny: 40,
    values: { biodiversity: 50, timberSupply: 55, communityNeeds: 50, firstNationsValues: 50 },
    protagonist: { stress: 40, energy: 60 },
  };
  const firedDay19 = calculateScore({
    ...base, day: 20, resources: { budget: 45000, politicalCapital: 0 },
    plan: { phase: "ministerial_approval", dataCompleteness: 85, analysisQuality: 80, stakeholderBuyIn: 60, ministerialConfidence: 20 },
  }, false);
  const ranOut = calculateScore({
    ...base, day: 34, resources: { budget: 29900, politicalCapital: 15 },
    plan: { phase: "ministerial_approval", dataCompleteness: 95, analysisQuality: 90, stakeholderBuyIn: 80, ministerialConfidence: 55 },
  }, false);
  assert.ok(ranOut.totalScore > firedDay19.totalScore, `ran out ${ranOut.totalScore} vs fired ${firedDay19.totalScore}`);
});

test("an idle failed run is not rewarded for the budget it never spent", () => {
  const idle = calculateScore(permitterAt({ day: 31, approved: 1, budget: 57000, politicalCapital: 60 }), false);
  const worked = calculateScore(permitterAt({ day: 19, approved: 15, budget: 30000, politicalCapital: 30 }), true);
  assert.ok(idle.components.resourceEfficiency.score < 20, `idle resources ${idle.components.resourceEfficiency.score}`);
  assert.ok(worked.components.resourceEfficiency.score > idle.components.resourceEfficiency.score);
});

test("the desk roles measure spending against the budget they started with", () => {
  const journey = permitterAt({ day: 19, approved: 15, budget: 12000 });
  journey.budgetStart = 107000;
  const lean = calculateScore(journey, true).components.resourceEfficiency.score;
  journey.budgetStart = 20000;
  const flush = calculateScore(journey, true).components.resourceEfficiency.score;
  assert.ok(flush > lean, "$12k left of $107k is thinner than $12k left of $20k");
});

test("the desk roles' welfare line is the planner's own, not a constant", () => {
  const calm = calculateScore(permitterAt({ day: 19, approved: 15, stress: 10, energy: 90 }), true);
  const frayed = calculateScore(permitterAt({ day: 19, approved: 15, stress: 90, energy: 15 }), true);
  assert.ok(calm.components.crewWelfare.score > frayed.components.crewWelfare.score);
  assert.notEqual(calm.components.crewWelfare.score, 50);
  const lines = formatScoreDisplay(calm).join("\n");
  assert.match(lines, /Wellbeing/);
  assert.match(lines, /Your stress 10%, energy 90%/);
});

test("a planner's objectives read the balance of values and the packages sent back unread", () => {
  const journey = {
    journeyType: "planning", day: 24, deadline: 34, crew: [], log: [], scrutiny: 30,
    resources: { budget: 40000, politicalCapital: 50 }, protagonist: { stress: 30, energy: 70 },
    plan: { phase: "ministerial_approval", dataCompleteness: 90, analysisQuality: 90, stakeholderBuyIn: 80, ministerialConfidence: 82 },
    values: { biodiversity: 62, timberSupply: 60, communityNeeds: 58, firstNationsValues: 64 },
  };
  const balanced = calculateScore(journey, true).components.objectives;
  const timberFirst = calculateScore({
    ...journey,
    values: { biodiversity: 41, timberSupply: 80, communityNeeds: 45, firstNationsValues: 42 },
    plan: { ...journey.plan, submissionsReturned: 4 },
  }, true).components.objectives;
  assert.ok(balanced.score > timberFirst.score);
  assert.match(timberFirst.label, /4 submissions returned/);
});

test("the seasonal ending tier is read off the displayed score", async () => {
  const { tierForScore } = await import("../js/engine/scoring.js");
  const { simulateMatrix } = await import("../js/engine/simulate.js");
  // The playtest pair: an Outstanding 69 beside a Solid 70.
  const permitter = scoreRun(stateWith({ progress: 54, forestHealth: 73, relationships: 76, compliance: 79, budget: 48 }, "permitter"));
  assert.equal(permitter.tier, tierForScore(permitter.score));

  const runs = simulateMatrix({ areas: ["fraser-plateau", "kootenay-wetbelt"], runs: 2, seedBase: 40 });
  for (const run of runs) {
    assert.equal(run.endingTier, tierForScore(run.score), `${run.role}/${run.area}/${run.strategy}: ${run.endingTier} at ${run.score}`);
  }
});

test("a meter gate caps the score below the next band and says why", () => {
  // A strong score with Progress under the Solid floor stays Mixed.
  const result = scoreRun(stateWith({ progress: 20, forestHealth: 80, relationships: 85, compliance: 90, budget: 70 }));
  assert.equal(result.tier, "mixed");
  assert.equal(result.score, 59);
  assert.match(result.reasons[0], /^Held to Mixed: Progress finished under 35\.$/);
});
