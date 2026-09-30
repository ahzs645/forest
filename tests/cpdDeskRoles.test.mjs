import test from "node:test";
import assert from "node:assert/strict";

import { TuiGameController } from "../tui/controller.js";
import { FORESTER_ROLES, OPERATING_AREAS } from "../js/data/index.js";
import { chooseOption } from "../js/engine/simulate.js";
import { getSeasonalPlayableRoles } from "../js/engine/seasonalContract.js";
import { getCpdShortfall } from "../js/engine/professional.js";
import { makeRng } from "../js/engine/rng.js";
import { applyRoundConsequences } from "../js/engine/effects.js";
import { createInitialState } from "../js/engine/state.js";
import { drawCalendarReminder, drawIssue } from "../js/engine/content.js";
import { buildSeasonContext } from "../js/engine.js";

const CPD_TITLE = "CPD Log Behind the FPBC Year";

function playYear(roleId, strategy, seed = 3000) {
  const playable = getSeasonalPlayableRoles(FORESTER_ROLES);
  const controller = new TuiGameController({ rng: makeRng(seed), storage: null, onExit() {} });
  const policyRng = makeRng((seed ^ 0x9e3779b9) >>> 0);
  controller.setInputText("CPD Co");
  controller.submitCurrent();
  controller.selectOption(playable.findIndex((role) => role.id === roleId));
  controller.selectOption(OPERATING_AREAS.findIndex((area) => area.id === "fraser-plateau"));
  const cpdCards = [];
  for (let guard = 0; controller.getState().mode !== "end" && guard < 1000; guard += 1) {
    const view = controller.getState();
    if (!view.options?.length) break;
    if (view.contentData?.title === CPD_TITLE) cpdCards.push({ round: controller.gs.round });
    const opts = view.options.map((_, index) => view.contentData?.optionDetails?.[index] || {});
    controller.selectOption(chooseOption(strategy, opts, view.gameState?.metrics || {}, roleId, policyRng));
  }
  return { state: controller.getState().gameState, cpdCards };
}

for (const roleId of ["planner", "permitter"]) {
  test(`a careful ${roleId} keeps pace with the CPD year without the reminder card`, () => {
    const careful = playYear(roleId, "cautious");
    assert.equal(careful.cpdCards.length, 0, "a log kept up is never handed the card");
    assert.ok(careful.state.professional.cpdHours >= 30, `careful year logged ${careful.state.professional.cpdHours} h`);
  });

  test(`a ${roleId} who lets the log slide is handed it once, as an extra card`, () => {
    const pushed = playYear(roleId, "aggressive");
    assert.equal(pushed.cpdCards.length, 1, "at most once a year");
    assert.equal(pushed.cpdCards[0].round, 3, "it lands after the log is more than a season behind at mid-year");
    const round3Issues = pushed.state.history.filter((entry) => entry.type === "issue" && entry.round === 3);
    assert.ok(
      round3Issues.some((entry) => entry.id !== "cpd-log-behind"),
      "the season still deals its own contested calls",
    );
    assert.equal(pushed.state.professional.cpdHours, 0, "leaving the log for next year logs nothing");
    const careful = playYear(roleId, "cautious");
    assert.ok(
      pushed.state.professional.competenceRisk > careful.state.professional.competenceRisk,
      "an unlogged year carries more competence risk",
    );
  });
}

test("the CPD shortfall is prorated across the year", () => {
  const state = { round: 2, totalRounds: 4, professional: { cpdTarget: 30, cpdHours: 5 } };
  assert.deepEqual(getCpdShortfall(state), { hours: 5, target: 30, expected: 15, gap: 10 });
  assert.equal(getCpdShortfall(state, 4).gap, 25);
});

// A seasonal year as the controller opens it: the season context puts the
// professional file on the 30-hour FPBC year.
function neutralYear(roleId = "planner") {
  const state = createInitialState({ companyName: "Cal", roleId, areaId: "fraser-plateau" });
  state.totalRounds = 4;
  state.round = 1;
  state.currentSeasonContext = buildSeasonContext(state);
  return state;
}

test("a season run to the standards logs its share of the year; a pushed one logs none", () => {
  const careful = neutralYear();
  careful.round = 1;
  careful.history.push({ type: "assignment", id: "a", round: 1, stance: "cautious" });
  applyRoundConsequences(careful);
  assert.equal(getCpdShortfall(careful, 1).gap, 0);

  const pushed = neutralYear();
  pushed.round = 1;
  pushed.history.push({ type: "assignment", id: "a", round: 1, stance: "aggressive" });
  applyRoundConsequences(pushed);
  assert.equal(pushed.professional.cpdHours, 0);

  const shortcut = neutralYear();
  shortcut.round = 1;
  shortcut.history.push({ type: "temptation", id: "t", round: 1, band: "clean" });
  applyRoundConsequences(shortcut);
  assert.equal(shortcut.professional.cpdHours, 0, "a shortcut taken is not a season kept to the standards");
});

test("the CPD reminder is a calendar card: never in the issue draw, dealt once when due", () => {
  const state = neutralYear();
  for (let round = 1; round <= 2; round += 1) {
    state.round = round;
    state.history.push({ type: "assignment", id: `a${round}`, round, stance: "aggressive" });
    applyRoundConsequences(state);
  }
  assert.equal(state.flags.cpdReminderDue, true, "two pushed seasons put the log more than a season behind");
  assert.deepEqual(state.pendingIssues || [], [], "the reminder is not queued into the issue slot");
  state.round = 3;
  const rng = makeRng(11);
  for (let i = 0; i < 200; i += 1) {
    assert.notEqual(drawIssue(structuredClone(state), rng)?.id, "cpd-log-behind");
  }
  const card = drawCalendarReminder(state);
  assert.equal(card?.id, "cpd-log-behind");
  assert.equal(drawCalendarReminder(state), null, "dealing it clears it");
  state.history.push({ type: "assignment", id: "a3", round: 3, stance: "aggressive" });
  applyRoundConsequences(state);
  assert.equal(state.flags.cpdReminderDue, undefined, "and it does not come back the same year");
});

test("the reminder reads the log at mid-year: a log that slips only after it is left to the year end", () => {
  const state = neutralYear();
  const stances = { 1: "cautious", 2: "aggressive", 3: "aggressive" };
  for (let round = 1; round <= 3; round += 1) {
    state.round = round;
    state.history.push({ type: "assignment", id: `a${round}`, round, stance: stances[round] });
    applyRoundConsequences(state);
  }
  assert.ok(getCpdShortfall(state, 3).gap >= 10, "the log is behind by the fall");
  assert.equal(state.flags.cpdReminderDue, undefined, "but a middling year that slipped late is not handed the card");
});

test("a reminder an older save queued as a pending issue is dealt as the extra card", () => {
  const state = neutralYear();
  state.round = 2;
  state.pendingIssues = [{ id: "cpd-log-behind", delay: 0 }];
  assert.notEqual(drawIssue(state, makeRng(3))?.id, "cpd-log-behind");
  assert.equal(drawCalendarReminder(state)?.id, "cpd-log-behind");
  assert.equal(state.pendingIssues.length, 0);
});
