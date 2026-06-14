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
