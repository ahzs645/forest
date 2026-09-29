// Seasonal shortcut offers read as a legal and ethical call and price the
// gamble honestly: odds from the real roll, bands that match what applies,
// fallout that names the shortcut, and no promise that cannot land.
import test from "node:test";
import assert from "node:assert/strict";

import { ILLEGAL_ACTS } from "../js/data/illegalActs.js";
import {
  adaptIllegalActTemptation,
  applyOptionOutcome,
  createInitialState,
  describeCardCause,
} from "../js/engine.js";
import { resolveRisk } from "../js/risk.js";
import {
  TuiGameController,
  buildShortcutBrief,
  projectAppliedEffects,
  riskHoldChance,
} from "../tui/controller.js";
import { collectShortcutLines, promptSeasonalCard } from "../js/game/seasonalAdapter.js";

const ACT = ILLEGAL_ACTS.find((entry) => entry.id === "planner-fake-fsp-amendment");

function plannerState(overrides = {}) {
  const gs = createInitialState({ companyName: "Shortcut Test", roleId: "planner", areaId: "bulkley-valley" });
  gs.round = 2;
  Object.assign(gs.metrics, overrides);
  return gs;
}

function presentOffer(gs, card, rng = () => 0.5) {
  const controller = new TuiGameController({ rng, storage: null });
  controller.gs = gs;
  controller.queue = [
    { type: "temptation", data: card },
    { type: "message", text: "Checkpoint", body: "Captures the outcome notice." },
  ];
  controller.processNext();
  return controller;
}

test("the hold chance is read from resolveRisk itself", () => {
  for (const [compliance, relationships] of [[50, 50], [83, 65], [20, 90], [100, 0]]) {
    const gs = plannerState({ compliance, relationships });
    const risk = { baseSuccess: 0.34 };
    const chance = riskHoldChance(gs, risk);
    assert.ok(chance >= 0.1 && chance <= 0.9, `clamped: ${chance}`);
    assert.equal(resolveRisk(gs, risk, () => chance - 1e-4).success, true);
    assert.equal(resolveRisk(gs, risk, () => chance + 1e-4).success, false);
  }
});

test("an offer card carries its odds, its catcher, and bands that match the applied effects", () => {
  const gs = plannerState({ compliance: 60, relationships: 55 });
  const card = adaptIllegalActTemptation(ACT, gs, () => 0.5);
  const controller = presentOffer(gs, card);
  const data = controller.getState().contentData;
  const take = card.options.find((option) => option.risk);

  assert.equal(data.type, "temptation");
  assert.ok(data.shortcut, "the card ships a shortcut brief");
  const { odds } = data.shortcut;
  assert.equal(odds.clean + odds.caught + odds.bad, 100);
  assert.equal(odds.clean, Math.round(riskHoldChance(gs, take.risk) * 100));
  assert.match(data.shortcut.oddsText, new RegExp(`holds ${odds.clean}% · caught ${odds.caught}%`));
  assert.match(data.shortcut.offerText, /the CP package goes in this month/);
  assert.equal(data.shortcut.declineText, "Saying no costs nothing.");

  // The take option states the same odds, band by band.
  const takeDetail = data.optionDetails[data.shortcut.takeIndex];
  assert.equal(takeDetail.riskLevel, "high");
  assert.match(takeDetail.preview, new RegExp(`^Holds ${odds.clean}%: .* \\| Caught ${odds.caught}%: `));
  // …and each band is what applying that branch would actually move.
  const { effects: held } = projectAppliedEffects(gs, take.risk.successEffects);
  for (const [key, value] of Object.entries(held)) {
    if (!value) continue;
    assert.ok(takeDetail.bands[0].text.includes(`${value > 0 ? "+" : ""}${value}`), `${key} ${value} in ${takeDetail.bands[0].text}`);
  }

  // Decline stays first, so a stray Enter refuses.
  assert.equal(controller.getState().selected, 0);
  assert.match(data.optionDetails[0].label, /^(Decline|Say no)$/);
});

test("offer framing names the act and who checks, not a metric swing or tag soup", () => {
  const gs = plannerState();
  const card = adaptIllegalActTemptation(ACT, gs, () => 0.5);
  const data = presentOffer(gs, card).getState().contentData;

  assert.match(data.headline, /^Summer: This breaks the rules, and Compliance and Enforcement \(C&E\) is who checks\.$/);
  assert.doesNotMatch(data.headline, /upside/i);
  assert.doesNotMatch(data.description, /Pressure points/);
  assert.doesNotMatch(data.description, /\bPermitter\b/);
  assert.equal(data.flavor, "");
  assert.equal(data.context.objective, data.decisionPrompt);
  assert.doesNotMatch(data.decisionPrompt, /\bfile\b/);
});

test("odds and payoff the engine puts on the card win over the local read", () => {
  const gs = plannerState();
  const card = adaptIllegalActTemptation(ACT, gs, () => 0.5);
  const takeIndex = card.options.findIndex((option) => option.risk);
  card.options[takeIndex] = {
    ...card.options[takeIndex],
    odds: { clean: 0.3, caught: 0.5, bad: 0.2 },
    payoffChip: "+$8k",
  };
  const brief = buildShortcutBrief(gs, card);
  assert.deepEqual(brief.odds, { clean: 30, caught: 50, bad: 20 });
  assert.equal(brief.bands.length, 3);
  assert.match(brief.bands[2].text, /^Badly wrong 20%/);
  assert.match(brief.offerText, /^On offer: \+\$8k — /);
});

test("previews show the gain a high meter will actually take", () => {
  const gs = plannerState({ compliance: 80, relationships: 50 });
  const { effects, tapers } = projectAppliedEffects(gs, { compliance: 3, relationships: 2, progress: -1, timeUsed: 1 });
  assert.equal(effects.compliance, 1);
  assert.equal(effects.relationships, 2);
  assert.equal(effects.timeUsed, 1);
  assert.equal(tapers.compliance, "meter high");
  assert.equal(tapers.relationships, undefined);

  const card = adaptIllegalActTemptation(ACT, gs, () => 0.5);
  const data = presentOffer(gs, card).getState().contentData;
  const report = data.optionDetails.find((detail) => /Document and report/.test(detail.label));
  assert.match(report.preview, /Compliance \+1 \(tapered: meter high\)/);
});

test("a caught shortcut in the final season promises no fallout it cannot deliver", () => {
  const gs = plannerState({ compliance: 90 });
  gs.round = gs.totalRounds;
  const card = adaptIllegalActTemptation(ACT, gs, () => 0.5);
  const takeIndex = card.options.findIndex((option) => option.risk);
  assert.ok(card.options[takeIndex].risk.failScheduleIssues, "the act schedules fallout");
  const brief = buildShortcutBrief(gs, card);
  assert.doesNotMatch(brief.preview, /follow-up/);

  const controller = presentOffer(gs, card, () => 0.99);
  controller.selectOption(takeIndex);
  const notice = controller.getState().contentData.notice;
  assert.match(notice.heading, /^Caught:/);
  assert.doesNotMatch(notice.body, /Likely fallout/);
});

test("an earlier-season catch still says what is coming, sentence-cased", () => {
  const gs = plannerState({ compliance: 90 });
  const card = adaptIllegalActTemptation(ACT, gs, () => 0.5);
  const takeIndex = card.options.findIndex((option) => option.risk);
  const controller = presentOffer(gs, card, () => 0.99);
  controller.selectOption(takeIndex);
  const teaser = controller.getState().contentData.notice.body
    .split("\n\n")
    .find((paragraph) => /Likely fallout/.test(paragraph));
  assert.ok(teaser, "the catch names what is coming");
  assert.doesNotMatch(teaser, /\. [a-z]/, teaser);
});

test("fallout from a shortcut names the shortcut it came from", () => {
  const gs = plannerState({ compliance: 90 });
  gs.currentSeasonContext = { season: "summer" };
  const card = adaptIllegalActTemptation(ACT, gs, () => 0.5);
  const take = card.options.find((option) => option.risk);
  applyOptionOutcome(gs, take, {
    type: "temptation", id: card.id, title: card.title, option: take.label, round: gs.round,
  }, () => 0.99);
  const pending = gs.pendingIssues.find((entry) => entry.causedBy);
  assert.ok(pending, "the catch scheduled fallout with provenance");
  assert.equal(
    describeCardCause({ causedBy: pending.causedBy }),
    "Because you took: Claim an Amendment Nobody Submitted — your summer shortcut.",
  );
  // A title the engine stamps separately wins.
  assert.match(describeCardCause({ causedBy: { ...pending.causedBy, sourceTitle: "Other Act" } }), /^Because you took: Other Act/);
  // Other scheduled cards keep the decision line.
  assert.match(
    describeCardCause({ causedBy: { sourceType: "issue", season: "Fall", option: "Defer" } }),
    /^Connected to your Fall decision: “Defer”\.$/,
  );
});

function fakeUi() {
  const lines = [];
  return {
    lines,
    cleared: 0,
    clear() { lines.length = 0; },
    write(text, className = "") { lines.push({ text, className }); },
    writeHeader(text) { lines.push({ text, className: "term-header" }); },
    writeDivider(text) { lines.push({ text, className: "term-divider" }); },
    writeWarning(text) { lines.push({ text, className: "term-warning" }); },
    writeDanger(text) { lines.push({ text, className: "term-danger" }); },
    clearMissionStatus() { this.cleared += 1; },
    promptChoice(prompt, choices) {
      this.choices = choices;
      return Promise.resolve(choices[0]);
    },
  };
}

test("the hub prints the offer under its banner with its terms, and no More context", async () => {
  const gs = plannerState();
  const card = adaptIllegalActTemptation(ACT, gs, () => 0.5);
  const view = presentOffer(gs, card).getState();
  const ui = fakeUi();
  const picked = await promptSeasonalCard(ui, view.contentData, view.options, view.gameState);

  assert.equal(picked, 0);
  const banner = ui.lines.findIndex((line) => line.className === "term-shortcut-banner");
  const title = ui.lines.findIndex((line) => line.className === "term-header");
  assert.ok(banner >= 0 && banner < title, "banner sits above the title");
  const terms = collectShortcutLines(view.contentData);
  assert.deepEqual(terms.map((line) => line.className), ["term-shortcut-offer", "term-shortcut-odds"]);
  for (const line of terms) assert.ok(ui.lines.some((written) => written.text === line.text));
  assert.ok(!ui.choices.some((choice) => choice.value === "detail"), "no More context on an offer");
  assert.match(ui.choices[view.contentData.shortcut.takeIndex].description, /^Holds \d+%/);
});

test("the hub shows provenance under the title and clears stale meters on setup cards", async () => {
  const ui = fakeUi();
  await promptSeasonalCard(ui, {
    type: "issue",
    title: "Ministry Data Audit",
    provenance: "Because you took: Fudge the Species Composition — your fall shortcut.",
    optionDetails: [{ preview: "" }],
  }, ["Open the file"], { metrics: { progress: 50 } });
  const title = ui.lines.findIndex((line) => line.className === "term-header");
  assert.equal(ui.lines[title + 1].className, "term-provenance");
  assert.equal(ui.cleared, 0);

  await promptSeasonalCard(ui, { type: "setup", heading: "Select your Specialization" }, ["Planner"], null);
  assert.equal(ui.cleared, 1, "a setup card after Play Again clears last year's dashboard");
});
