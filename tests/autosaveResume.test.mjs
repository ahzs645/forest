import test from "node:test";
import assert from "node:assert/strict";

import { TuiGameController } from "../tui/controller.js";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    has: (k) => map.has(k),
  };
}

function newController(storage, seed = 7) {
  return new TuiGameController({ seed, storage, onExit: () => {} });
}

function startRun(controller) {
  controller.setInputText("Save Co");
  controller.submitCurrent();
  controller.selectOption(0); // role
  controller.selectOption(0); // area
}

// Drive a controller forward by always taking the first option. Optionally stop
// once a given season has begun (so the run is interrupted mid-year with a
// resumable save on disk).
function play(controller, { stopAtRound = Infinity, maxSteps = 500 } = {}) {
  let steps = 0;
  while (controller.getState().mode !== "end" && steps < maxSteps) {
    steps += 1;
    const view = controller.getState();
    if (view.mode === "resume") {
      controller.selectOption(0); // Resume
      continue;
    }
    if ((view.gameState?.round || 0) >= stopAtRound) return;
    if (!(view.options || []).length) break;
    controller.selectOption(0);
  }
}

test("an interrupted run leaves a resumable save; a finished run clears it", () => {
  const storage = memoryStorage();
  const a = newController(storage);
  startRun(a);
  play(a, { stopAtRound: 2 });

  assert.equal(a.getState().mode, "playing");
  assert.ok(storage.has("bc-forestry-trail/seasonal-run/v1"), "a save should exist mid-run");

  play(a); // finish the year
  assert.equal(a.getState().mode, "end");
  assert.ok(!storage.has("bc-forestry-trail/seasonal-run/v1"), "completing the year clears the save");
});

test("a fresh controller offers resume and restores the parked season", () => {
  const storage = memoryStorage();
  const a = newController(storage);
  startRun(a);
  play(a, { stopAtRound: 2 });
  const parkedMetrics = { ...a.getState().gameState.metrics };

  // A brand-new controller sees the save and opens on the resume prompt.
  const b = newController(storage);
  const prompt = b.getState();
  assert.equal(prompt.mode, "resume");
  assert.deepEqual(prompt.options, ["Resume seasonal run", "Start a new run"]);

  b.selectOption(0); // Resume seasonal run
  assert.equal(b.getState().mode, "playing");
  assert.deepEqual(b.getState().gameState.metrics, parkedMetrics, "resume restores the parked metrics");
});

test("resuming mid-run reaches the same end state as an uninterrupted run", () => {
  // Baseline: a single uninterrupted run.
  const baselineStore = memoryStorage();
  const baseline = newController(baselineStore, 99);
  startRun(baseline);
  play(baseline);
  const expected = { ...baseline.getState().gameState.metrics };

  // Interrupted: play into season 2, drop the controller, then resume from
  // storage in a fresh controller (same seed) and finish.
  const store = memoryStorage();
  const first = newController(store, 99);
  startRun(first);
  play(first, { stopAtRound: 2 });

  const resumed = newController(store, 99);
  assert.equal(resumed.getState().mode, "resume");
  play(resumed); // resumes, then finishes

  assert.equal(resumed.getState().mode, "end");
  assert.deepEqual(
    resumed.getState().gameState.metrics,
    expected,
    "a resumed run is deterministic with the uninterrupted run",
  );
});

test("Start a new run discards the save and returns to setup", () => {
  const storage = memoryStorage();
  const a = newController(storage);
  startRun(a);
  play(a, { stopAtRound: 2 });

  const b = newController(storage);
  assert.equal(b.getState().mode, "resume");
  b.selectOption(1); // Start a new run

  assert.equal(b.getState().mode, "setup-name");
  assert.ok(!storage.has("bc-forestry-trail/seasonal-run/v1"), "starting fresh clears the save");
});
