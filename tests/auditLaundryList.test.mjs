import test from "node:test";
import assert from "node:assert/strict";

import { ISSUE_LIBRARY } from "../js/data/issues.js";
import { buildSeasonContext, createInitialState, drawIssue } from "../js/engine.js";
import { makeRng } from "../js/engine/rng.js";

const AUDIT_ID = "audit-laundry-list";
const audit = ISSUE_LIBRARY.find((issue) => issue.id === AUDIT_ID);

function draws(flags, { roleId = "planner", areaId = "fort-st-john-plateau", tries = 400 } = {}) {
  let hits = 0;
  for (let seed = 1; seed <= tries; seed += 1) {
    const state = createInitialState({ companyName: "Test", roleId, areaId });
    state.round = 4;
    Object.assign(state.flags, flags);
    state.currentSeasonContext = buildSeasonContext(state);
    if (drawIssue(state, makeRng(Math.imul(seed, 2654435761) >>> 0))?.id === AUDIT_ID) hits += 1;
  }
  return hits;
}

test("the FPB audit reads true for a licensee's forester in any area", () => {
  const copy = [audit.description, ...audit.options.flatMap((option) => [option.label, option.outcome])].join(" ");
  assert.doesNotMatch(copy, /community forest|consulting practice|council/i);
  assert.deepEqual(audit.roles.sort(), ["permitter", "planner", "recce", "silviculture"]);
});

test("the FPB audit follows a year that gave it something to find, not a cold draw", () => {
  assert.equal(draws({}), 0, "a clean file never draws the audit cold");
  assert.ok(draws({ auditEscalationActive: true }) > 0, "an audit escalation opens it");
  assert.ok(draws({ streamMisclassified: true }, { roleId: "recce", areaId: "skeena-nass" }) > 0);
});
