import test from "node:test";
import assert from "node:assert/strict";

import { CHAINED_ISSUES, ISSUE_LIBRARY, OPERATING_AREAS } from "../js/data/index.js";
import { SEASONS } from "../js/engine/constants.js";
import { matchesAreaContext, matchesAreaIds } from "../js/engine/seasonalContract.js";
import { listSeasonalRoleIds, simulateMatrix, simulateRun } from "../js/engine/simulate.js";

// The matrix the dealing guards read: every role and area, a careful, a
// middling and a pushed player.
const MATRIX = simulateMatrix({ strategies: ["balanced", "random", "aggressive"], runs: 3, seedBase: 1000 });
const ALL_ISSUES = [...ISSUE_LIBRARY, ...CHAINED_ISSUES];

test("the summer contested call is the season's draw, not one card every year", () => {
  const summerIds = new Set();
  for (const run of MATRIX) {
    // Round 2 carries one contested call; the calendar card is extra.
    for (const id of run.issuesByRound?.[2] || []) summerIds.add(id);
  }
  assert.ok(summerIds.size >= 20, `only ${summerIds.size} distinct summer issues were dealt`);
});

test("the CPD reminder lands at most once a year, only for a log let slide, and never alone in a season", () => {
  let years = 0;
  for (const run of MATRIX) {
    const rounds = Object.entries(run.issuesByRound || {})
      .filter(([, ids]) => ids.includes("cpd-log-behind"));
    assert.ok(rounds.length <= 1, `${run.role}/${run.area}/${run.strategy}: the reminder came ${rounds.length} times`);
    for (const [, ids] of rounds) {
      assert.ok(ids.some((id) => id !== "cpd-log-behind"), "the season kept its own contested call");
    }
    if (rounds.length) {
      years += 1;
      assert.notEqual(run.strategy, "balanced", "a year kept to the standards is not behind on CPD");
    }
  }
  assert.ok(years / MATRIX.length < 0.45, `the reminder came in ${years} of ${MATRIX.length} years`);
});

test("an issue or event answered once is not dealt again the same year", () => {
  for (const run of MATRIX) {
    assert.deepEqual(run.repeatedEvents, [], `${run.role}/${run.area}/${run.strategy} repeated an event`);
    // A follow-up an earlier choice scheduled is the one card allowed back.
    assert.deepEqual(run.repeatedIssues.filter((id) => !run.scheduledIssues.includes(id)), [],
      `${run.role}/${run.area}/${run.strategy} repeated an issue`);
  }
});

// Every issue written for one season, played where its gates open, is dealt
// in that season. The CPD reminder used to own the summer slot and left four
// summer-only issues at zero draws in 15,120 years.
function fittingPlaces(issue) {
  const round = SEASONS.indexOf(issue.seasonBias[0]) + 1;
  const places = [];
  for (const roleId of listSeasonalRoleIds().filter((id) => issue.roles.includes(id))) {
    for (const area of OPERATING_AREAS) {
      if (!matchesAreaIds(issue, area.id)) continue;
      if (issue.areaTags?.length && !matchesAreaContext(issue.areaTags, area.tags || [])) continue;
      places.push({ roleId, areaId: area.id, round });
    }
  }
  return places;
}

const ONE_SEASON_ISSUES = ALL_ISSUES.filter((entry) => entry.seasonBias?.length === 1 && !entry.calendarReminder);

test("every one-season issue is dealt in its season where it fits", () => {
  const missing = [];
  for (const issue of ONE_SEASON_ISSUES) {
    const places = fittingPlaces(issue);
    assert.ok(places.length, `${issue.id} fits no role and area`);
    // A flag-gated follow-up needs the call that opens it: the random policy
    // makes it sometimes.
    const strategies = issue.requiresFlags?.length || issue.requiresAnyFlags?.length ? ["random"] : ["balanced", "random"];
    let seen = false;
    for (let seed = 2000; seed < 2040 && !seen; seed += 1) {
      for (const place of places) {
        const run = simulateRun({ ...place, strategy: strategies[seed % strategies.length], seed });
        if (run.issuesByRound[place.round]?.includes(issue.id)) {
          seen = true;
          break;
        }
      }
    }
    if (!seen) missing.push(issue.id);
  }
  assert.deepEqual(missing, [], "never dealt in their own season");
});
