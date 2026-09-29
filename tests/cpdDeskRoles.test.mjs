import test from "node:test";
import assert from "node:assert/strict";

import { TuiGameController } from "../tui/controller.js";
import { FORESTER_ROLES, OPERATING_AREAS } from "../js/data/index.js";
import { chooseOption } from "../js/engine/simulate.js";
import { getSeasonalPlayableRoles } from "../js/engine/seasonalContract.js";
import { getCpdShortfall } from "../js/engine/professional.js";
import { makeRng } from "../js/engine/rng.js";

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
    if (view.contentData?.title === "CPD Log Behind the FPBC Year") cpdCards.push({ round: controller.gs.round });
    const opts = view.options.map((_, index) => view.contentData?.optionDetails?.[index] || {});
    controller.selectOption(chooseOption(strategy, opts, view.gameState?.metrics || {}, roleId, policyRng));
  }
  return { state: controller.getState().gameState, cpdCards };
}

for (const roleId of ["planner", "permitter"]) {
  test(`a ${roleId} is handed the CPD log, and logging it lowers competence risk`, () => {
    const careful = playYear(roleId, "cautious");
    assert.ok(careful.cpdCards.length >= 1, "the CPD card reaches a desk role's year");
    assert.equal(careful.cpdCards[0].round, 2, "it lands the season after the log falls behind");
    assert.equal(careful.state.professional.cpdHours, 15);

    const pushed = playYear(roleId, "aggressive");
    assert.equal(pushed.state.professional.cpdHours, 0, "leaving the log for next year logs nothing");
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
