import test from "node:test";
import assert from "node:assert/strict";

import { TuiGameController } from "../tui/controller.js";
import {
  createInitialState,
  applyRoundConsequences,
  buildSummary,
  computeManagementStyle,
  describeConsequences,
  makeRng,
} from "../js/engine.js";

// Drive the real controller to the end of a year, always taking the first
// option (Continue / first choice), with a seeded RNG for reproducibility.
function runFullYear(seed = 2024) {
  const controller = new TuiGameController({ rng: makeRng(seed), onExit: () => {} });
  controller.setInputText("Invariant Co");
  controller.submitCurrent(); // -> role select
  controller.selectOption(0); // first seasonal role
  controller.selectOption(0); // first area -> starts the year
  let guard = 0;
  while (controller.getState().mode !== "end" && guard < 1000) {
    guard += 1;
    controller.selectOption(0);
  }
  return controller;
}

test("seasonal play records exactly one timeline entry per completed season", () => {
  const controller = runFullYear();
  const gs = controller.gs;
  const seasonEntries = gs.timeline.filter((entry) => entry.round > 0);
  assert.equal(seasonEntries.length, gs.totalRounds);
  const rounds = seasonEntries.map((entry) => entry.round);
  assert.deepEqual(rounds, [1, 2, 3, 4]);
  for (const entry of seasonEntries) {
    assert.ok(entry.metrics, "timeline entry should snapshot metrics");
    assert.equal(typeof entry.season, "string");
  }
});

test("buildSummary always returns style and roleLens", () => {
  const controller = runFullYear();
  const summary = buildSummary(controller.gs);
  assert.ok("style" in summary, "summary should expose style");
  assert.ok("roleLens" in summary, "summary should expose roleLens");
  assert.equal(typeof summary.style.label, "string");
});

test("computeManagementStyle never mutates state", () => {
  const controller = runFullYear();
  const before = JSON.stringify(controller.gs);
  computeManagementStyle(controller.gs);
  assert.equal(JSON.stringify(controller.gs), before);
});

test("describeConsequences only describes consequences applied this round", () => {
  const state = createInitialState({ companyName: "T", roleId: "recce", areaId: "fort-st-john-plateau" });
  state.round = 2;
  state.metrics.relationships = 30; // trust deficit fires this round
  const ids = applyRoundConsequences(state);
  assert.ok(ids.includes("trust-deficit"));

  const thisRound = describeConsequences(state, ids).find((entry) => entry.id === "trust-deficit");
  assert.ok(thisRound.effectText, "current-round consequence should carry its applied effect");

  // The same ids viewed from a later round have no matching applied effect.
  state.round = 3;
  const laterRound = describeConsequences(state, ids).find((entry) => entry.id === "trust-deficit");
  assert.equal(laterRound.effectText, "");
});

test("dashboard-facing snapshot fields exist even before any decision", () => {
  const controller = new TuiGameController({ rng: makeRng(7), onExit: () => {} });
  controller.setInputText("Fresh Co");
  controller.submitCurrent();
  controller.selectOption(0);
  controller.selectOption(0); // year started, no decision taken yet

  const snapshot = controller.getState().gameState;
  assert.ok(snapshot, "gameState snapshot should exist once the year starts");
  assert.deepEqual(snapshot.lastChoiceEffects, {});
  assert.equal(snapshot.managementStyle.total, 0);
  assert.deepEqual(snapshot.seasonTimeline, []);
});
