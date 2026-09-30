import test from "node:test";
import assert from "node:assert/strict";

import { lintSeasonalContent } from "../scripts/lint-seasonal-content.mjs";

// Gate authored content on the engine's structural guarantees so it can grow
// without quietly breaking card generation or scheduled-issue resolution.
test("seasonal content passes the structural linter with no errors", () => {
  const { errors, warnings } = lintSeasonalContent();
  assert.ok(Array.isArray(warnings));
  assert.deepEqual(errors, [], `seasonal content lint errors:\n${errors.join("\n")}`);
});

test("the seasonal linter fails on issues that can never surface", async () => {
  const { ISSUE_LIBRARY } = await import("../js/data/index.js");
  const base = {
    title: "Probe",
    description: "A probe card for the linter.",
    roles: ["planner"],
    options: [
      { label: "A", effects: { compliance: 1 } },
      { label: "B", effects: { progress: 1 } },
    ],
  };
  ISSUE_LIBRARY.push(
    { ...base, id: "lint-probe-bad-tag", areaTags: ["community-forest"] },
    { ...base, id: "lint-probe-dead-flag", requiresFlags: ["noSuchFlagAnywhere"] },
    {
      ...base,
      id: "lint-probe-dead-chain",
      options: [...base.options, { label: "C", effects: { progress: 1 }, scheduleIssues: { id: "lint-probe-bad-tag", delay: 1 } }],
    },
  );
  try {
    const { errors } = lintSeasonalContent();
    const has = (id, pattern) => errors.some((line) => line.startsWith(`issue:${id}:`) && pattern.test(line));
    assert.ok(has("lint-probe-bad-tag", /areaTags no operating area carries/));
    assert.ok(has("lint-probe-bad-tag", /can never be drawn/));
    assert.ok(has("lint-probe-dead-flag", /noSuchFlagAnywhere/));
    assert.ok(has("lint-probe-dead-chain", /schedules "lint-probe-bad-tag"/));
  } finally {
    ISSUE_LIBRARY.splice(ISSUE_LIBRARY.length - 3, 3);
  }
});
