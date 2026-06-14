import test from "node:test";
import assert from "node:assert/strict";

import { TuiGameController } from "../tui/controller.js";

function startedRun() {
  let exits = 0;
  const controller = new TuiGameController({ seed: 42, onExit: () => { exits += 1; } });
  controller.setInputText("Confirm Co");
  controller.submitCurrent();        // name -> role select
  controller.selectOption(0);        // role -> area select
  controller.selectOption(0);        // area -> playing
  return { controller, exits: () => exits };
}

test("q during a live run opens a confirm overlay instead of exiting", () => {
  const { controller, exits } = startedRun();
  assert.equal(controller.getState().mode, "playing");

  controller.handleKey({ name: "q" });
  const state = controller.getState();
  assert.equal(state.mode, "confirm-exit");
  assert.equal(state.contentData.type, "confirm");
  assert.deepEqual(state.options, ["Continue run", "Main menu"]);
  assert.equal(exits(), 0, "should not exit until confirmed");
});

test("choosing Continue run restores the prior card and keeps playing", () => {
  const { controller, exits } = startedRun();
  const before = controller.getState();

  controller.handleKey({ name: "q" });
  controller.selectOption(0); // Continue run

  const after = controller.getState();
  assert.equal(after.mode, "playing");
  assert.equal(after.contentData, before.contentData);
  assert.deepEqual(after.options, before.options);
  assert.equal(exits(), 0);
});

test("Escape cancels the confirm overlay", () => {
  const { controller, exits } = startedRun();
  controller.handleKey({ name: "q" });
  assert.equal(controller.getState().mode, "confirm-exit");

  controller.handleKey({ name: "escape" });
  assert.equal(controller.getState().mode, "playing");
  assert.equal(exits(), 0);
});

test("choosing Main menu exits", () => {
  const { controller, exits } = startedRun();
  controller.handleKey({ name: "q" });
  controller.selectOption(1); // Main menu
  assert.equal(exits(), 1);
});

test("Escape on a live run also routes through the confirm overlay", () => {
  const { controller, exits } = startedRun();
  controller.handleKey({ name: "escape" });
  assert.equal(controller.getState().mode, "confirm-exit");
  assert.equal(exits(), 0);
});
