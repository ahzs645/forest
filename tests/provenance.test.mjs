import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  applyEffects,
  applyOptionOutcome,
  drawIssue,
  describeCardCause,
} from "../js/engine.js";
import { ILLEGAL_ACTS } from "../js/data/index.js";
import { adaptIllegalActTemptation } from "../js/engine/content.js";

test("applyEffects records raw effects, applied effects, and the modifiers that fired", () => {
  const state = createInitialState({ companyName: "T", roleId: "planner", areaId: "fraser-plateau" });
  state.metrics.compliance = 99;

  const applied = applyEffects(state, { compliance: 10 }, {
    type: "task",
    id: "x",
    title: "X",
    option: "o",
    round: 1,
  });

  const entry = state.history[state.history.length - 1];
  assert.equal(entry.rawEffects.compliance, 10);
  assert.ok("effects" in entry, "applied effects retained as effects for back-compat");
  assert.deepEqual(entry.effects, applied);
  // Near the cap, the swing is softened (diminishing returns) and/or clamped.
  assert.ok(entry.modifiers.length > 0, `expected modifiers, got ${JSON.stringify(entry.modifiers)}`);
});

test("a delayed issue carries the decision that scheduled it, and describeCardCause explains it", () => {
  const state = createInitialState({ companyName: "T", roleId: "silviculture", areaId: "muskwa-foothills" });
  state.round = 3;
  state.currentSeasonContext = { season: "Fall Integration" };

  const act = ILLEGAL_ACTS.find((entry) => entry.id === "slash-burn-party");
  const temptation = adaptIllegalActTemptation(act, state, () => 0.5);
  const risky = temptation.options.find((option) => option.risk);

  const originalRandom = Math.random;
  Math.random = () => 0.99; // force the shortcut to fail and schedule fallout
  try {
    applyOptionOutcome(state, risky, {
      type: "temptation",
      id: temptation.id,
      title: temptation.title,
      option: risky.label,
      round: state.round,
    });
  } finally {
    Math.random = originalRandom;
  }

  assert.ok(state.pendingIssues[0]?.causedBy, "scheduled issue should carry provenance");

  const issue = drawIssue(state, () => 0);
  assert.ok(issue.causedBy, "drawn issue should carry provenance forward");
  const sentence = describeCardCause(issue);
  assert.match(sentence, /Connected to your Fall Integration decision/);
  assert.match(sentence, new RegExp(risky.label.slice(0, 8)));
});

test("describeCardCause returns empty string when there is no provenance", () => {
  assert.equal(describeCardCause({}), "");
  assert.equal(describeCardCause(null), "");
});
