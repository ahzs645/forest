/**
 * Manager Mode Runner
 * General Manager term: 12 monthly board periods, one strategic decision per
 * period, events drawn through the shared pipeline (60% boardroom desk-context,
 * 40% operational field-context radio traffic), quarterly board reviews at term
 * milestones. The compressed term is ~16 decisions rather than a 100-turn grind.
 */

import { checkForEvent } from "../events.js";
import { handleEvent } from "./shared/handleEvent.js";
import { getOperationalProgress, recordProgressMilestones } from "../journey.js";

import ceoProfiles from "../../docs/legacy_archive/game_content_datasets/ceo_profiles.json" with { type: "json" };
import certificationsData from "../../docs/legacy_archive/game_content_datasets/certifications.json" with { type: "json" };

// Corporate overhead burned each board period (month) of the term.
const PERIOD_BURN = 4000;

const STRATEGIC_BEATS = [
  "budget_allocation",
  "division_report",
  "field_visit",
  "board_prep",
];

export async function runManagerDay(game) {
  const { journey, ui } = game;
  if (!journey.flags) journey.flags = {};
  if (!journey.log) journey.log = [];
  if (!journey.decisions) journey.decisions = [];

  // Day 1: Manager Initialization (Hire CEO & Pursue Certification)
  if (journey.day === 1 && !journey.flags.managerInitComplete) {
    await runExecutiveOnboarding(game);
    return;
  }

  const progressBeforeDay = getOperationalProgress(journey);

  displayManagerHeader(ui, journey);

  // One strategic decision per day, rotating through the executive calendar
  await runStrategicDecision(game);

  // The day's event, drawn through the real selection pipeline (cooldowns,
  // context matching, scrutiny/difficulty modifiers, reporter attachment).
  const event = checkForEvent(journey);
  if (event) {
    displayManagerHeader(ui, journey);
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  await endOfManagerDay(game, progressBeforeDay);
}

/**
 * Day 1: hire a CEO, optionally pursue certification.
 */
async function runExecutiveOnboarding(game) {
  const { journey, ui } = game;

  ui.clear();
  ui.writeHeader(`MANAGER - MONTH ${journey.day}/${journey.deadline} - EXECUTIVE ONBOARDING`);
  ui.write("Welcome to the corner office. Your first order of business: Executive Hiring.");
  ui.write("");

  // Hire CEO
  const ceoOptions = ceoProfiles.ceo_candidates.map((ceo) => ({
    label: `${ceo.name} (${ceo.background}) - $${ceo.annual_fee.toLocaleString()}/yr`,
    value: ceo.id,
    hint: `Strengths: ${ceo.strengths.join(", ")}`,
  }));

  const ceoRes = await ui.promptChoice(
    "Select a CEO to execute your strategy:",
    ceoOptions,
  );
  const selectedCEO = ceoProfiles.ceo_candidates.find(
    (c) => c.id === ceoRes.value,
  );
  journey.ceo = selectedCEO;
  journey.resources.budget = Math.max(0, journey.resources.budget - selectedCEO.annual_fee);

  ui.writeSuccess(
    `Hired ${selectedCEO.name}. Budget reduced by $${selectedCEO.annual_fee.toLocaleString()}.`,
  );
  ui.write("");

  // Pursue Certification
  const certOptions = certificationsData.certifications.map((cert) => ({
    label: `${cert.name} - Initial Cost: $${cert.initial_cost.toLocaleString()}`,
    value: cert.id,
    hint: cert.description,
  }));
  certOptions.push({ label: "Skip certification for now", value: "none" });

  const certRes = await ui.promptChoice(
    "Will you pursue a forestry certification?",
    certOptions,
  );
  if (certRes.value !== "none") {
    const selectedCert = certificationsData.certifications.find(
      (c) => c.id === certRes.value,
    );
    journey.certifications.push(selectedCert);
    journey.resources.budget = Math.max(0, journey.resources.budget - selectedCert.initial_cost);
    journey.metrics.reputation = Math.min(
      100,
      journey.metrics.reputation + selectedCert.reputation_bonus * 100,
    );
    ui.writeSuccess(`Acquired ${selectedCert.name}.`);
  }

  journey.flags.managerInitComplete = true;
  journey.flags.boardBaseline = { ...journey.metrics };
  journey.day++;

  await ui.promptChoice("", [
    { label: `Continue... (Month ${journey.day} of ${journey.deadline})`, value: "next" },
  ]);
}

/**
 * Compact executive dashboard header.
 */
function displayManagerHeader(ui, journey) {
  ui.clear();
  ui.writeHeader(`MANAGER - MONTH ${journey.day}/${journey.deadline}`);

  ui.writeDivider("EXECUTIVE DASHBOARD");
  ui.write(
    `Budget: $${Math.round(journey.resources.budget).toLocaleString()}`
    + ` | Political Capital: ${Math.round(journey.resources.politicalCapital)}`
    + ` | Scrutiny: ${Math.round(journey.scrutiny || 0)}%`,
  );

  const repBar = createBar(journey.metrics.reputation, 10);
  ui.write(`Reputation: [${repBar}] ${Math.round(journey.metrics.reputation)}%`);

  ui.write(
    journey.ceo
      ? `CEO: ${journey.ceo.name} (${journey.ceo.background})`
      : "CEO: Vacant - the board is watching the empty chair",
  );

  const certs = (journey.certifications || []).map((cert) => cert.id || cert.name).join(", ");
  ui.write(`Certifications: ${certs || "None"}`);

  ui.write(
    `Metrics: ${formatMetricBar("Ops", journey.metrics.progress)}`
    + ` | ${formatMetricBar("Forest", journey.metrics.forestHealth)}`
    + ` | ${formatMetricBar("Rel", journey.metrics.relationships)}`
    + ` | ${formatMetricBar("Comp", journey.metrics.compliance)}`,
  );

  const activeCrew = (journey.crew || []).filter((member) => member.isActive);
  if (activeCrew.length > 0) {
    const avgMorale = Math.round(
      activeCrew.reduce((sum, member) => sum + member.morale, 0) / activeCrew.length,
    );
    ui.write(`Executive Crew: ${activeCrew.length} active | Avg Morale: ${avgMorale}%`);
  }

  ui.write(`Term Progress: ${getOperationalProgress(journey)}%`);
  ui.write("");
}

/**
 * One strategic decision per board period, from a rotating menu.
 */
async function runStrategicDecision(game) {
  const { journey } = game;
  const beat = STRATEGIC_BEATS[Math.max(0, journey.day - 2) % STRATEGIC_BEATS.length];

  switch (beat) {
    case "budget_allocation":
      await runBudgetAllocation(game);
      break;
    case "division_report":
      await runDivisionReport(game);
      break;
    case "field_visit":
      await runFieldVisit(game);
      break;
    default:
      await runBoardPrep(game);
      break;
  }
}

async function runBudgetAllocation(game) {
  const { journey, ui } = game;
  ui.writeDivider("STRATEGIC DECISION - DISCRETIONARY SPEND");
  ui.write("Finance has freed up discretionary room this week. Every division has opinions about it.");
  ui.write("");

  const choice = await ui.promptChoice("Where does the money go?", [
    {
      label: "Operations push",
      description: "-$6,000 | road and harvest crews get what they asked for",
      value: "operations",
    },
    {
      label: "PR campaign",
      description: "-$4,500 | glossy seedling photos, your name in the caption",
      value: "pr",
    },
    {
      label: "Compliance training",
      description: "-$3,500 | a workshop day nobody requests and everybody needs",
      value: "compliance",
    },
    {
      label: "Hold the line",
      description: "Bank it. The board loves restraint; the divisions less so",
      value: "hold",
    },
  ]);

  switch (choice.value) {
    case "operations":
      spendBudget(journey, 6000);
      adjustMetric(journey, "progress", 4);
      adjustMetric(journey, "forestHealth", 2);
      ui.writeSuccess("Crews get parts, fuel, and a rare sense of being believed. Operations tick up.");
      break;
    case "pr":
      spendBudget(journey, 4500);
      adjustMetric(journey, "reputation", 4);
      adjustMetric(journey, "relationships", 2);
      ui.writeSuccess("The campaign runs. A seedling gets more column inches than your last three audits combined.");
      break;
    case "compliance":
      spendBudget(journey, 3500);
      adjustMetric(journey, "compliance", 5);
      ui.writeSuccess("Attendance is mandatory and the sandwiches are adequate. The paperwork improves measurably.");
      break;
    default:
      adjustPoliticalCapital(journey, 2);
      adjustMetric(journey, "progress", -1);
      ui.writeInfo("You bank the room. The board notes the discipline; the divisions note the silence.");
      break;
  }

  recordDecision(journey, "budget_allocation", choice.value);
}

const DIVISIONS = [
  {
    metric: "progress",
    name: "Woodlands",
    report: (value) => `Harvest delivery sits at ${value}% of plan. The superintendent blames weather, markets, and one specific grader operator.`,
  },
  {
    metric: "forestHealth",
    name: "Forest Stewardship",
    report: (value) => `Stand health index reads ${value}%. The beetle map has acquired a new colour that nobody likes.`,
  },
  {
    metric: "relationships",
    name: "Community & Indigenous Relations",
    report: (value) => `Relationship standing reads ${value}%. Two open letters this month, one of them polite.`,
  },
  {
    metric: "compliance",
    name: "Compliance & Certification",
    report: (value) => `Audit readiness is ${value}%. The binder room has a smell the auditors will recognize.`,
  },
];

async function runDivisionReport(game) {
  const { journey, ui } = game;
  const division = DIVISIONS.reduce(
    (weakest, candidate) =>
      (journey.metrics[candidate.metric] ?? 50) < (journey.metrics[weakest.metric] ?? 50)
        ? candidate
        : weakest,
    DIVISIONS[0],
  );
  const value = Math.round(journey.metrics[division.metric] ?? 50);

  ui.writeDivider(`STRATEGIC DECISION - ${division.name.toUpperCase()} REPORT`);
  ui.write(division.report(value));
  ui.write("");

  const choice = await ui.promptChoice("Your follow-up:", [
    {
      label: "Intervene directly",
      description: "-$5,000 | put money and your calendar on the problem",
      value: "intervene",
    },
    {
      label: "Demand a corrective plan",
      description: "No cost, slower fix, the division owns it",
      value: "plan",
    },
    {
      label: "Back the division lead publicly",
      description: "Loyalty plays well, right up until it doesn't",
      value: "back",
    },
  ]);

  switch (choice.value) {
    case "intervene":
      spendBudget(journey, 5000);
      adjustMetric(journey, division.metric, 6);
      ui.writeSuccess(`You spend two days inside ${division.name}'s problem. It gets measurably smaller; so does your calendar.`);
      break;
    case "plan":
      adjustMetric(journey, division.metric, 3);
      adjustPoliticalCapital(journey, -1);
      ui.writeInfo("A plan arrives in five business days with a Gantt chart and modest ambitions. It will mostly work.");
      break;
    default:
      adjustMetric(journey, "relationships", 3);
      adjustMetric(journey, "reputation", 2);
      journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + 2);
      bumpCrewMorale(journey, 2);
      ui.writeInfo("You praise the lead at the all-hands. The numbers stay where they are, but loyalty is a real currency out here.");
      break;
  }

  recordDecision(journey, "division_report", choice.value);
}

async function runFieldVisit(game) {
  const { journey, ui } = game;
  ui.writeDivider("STRATEGIC DECISION - FIELD PRESENCE");
  ui.write("Your EA has found a two-day window. The divisions have noticed how long it has been since head office wore boots.");
  ui.write("");

  const options = [
    {
      label: "Fly out to the blocks",
      description: "-$2,500 | crew morale and reputation climb when the GM shows up in rain gear",
      value: "visit",
    },
  ];
  if (journey.ceo) {
    options.push({
      label: "Send the CEO on tour",
      description: "-$1,200 | different audience, same photos",
      value: "ceo_tour",
    });
  }
  options.push({
    label: "Stay at your desk",
    description: "The inbox empties slightly. The bush notices",
    value: "desk",
  });

  const choice = await ui.promptChoice("The field window:", options);

  switch (choice.value) {
    case "visit":
      spendBudget(journey, 2500);
      bumpCrewMorale(journey, 6);
      adjustMetric(journey, "reputation", 3);
      adjustMetric(journey, "forestHealth", 1);
      ui.writeSuccess("You walk a cutblock in the rain and ask one good question. Word travels faster than the truck back to town.");
      break;
    case "ceo_tour":
      spendBudget(journey, 1200);
      adjustMetric(journey, "relationships", 2);
      bumpCrewMorale(journey, 2);
      ui.writeInfo(`${journey.ceo.name} works the coffee rooms like a campaign stop. Different audience, same photos.`);
      break;
    default:
      adjustPoliticalCapital(journey, 1);
      bumpCrewMorale(journey, -2);
      ui.writeInfo("The window closes. The inbox empties slightly. Somewhere out there, a crew decides head office is a rumour.");
      break;
  }

  recordDecision(journey, "field_visit", choice.value);
}

async function runBoardPrep(game) {
  const { journey, ui } = game;
  ui.writeDivider("STRATEGIC DECISION - BOARD PREP");
  ui.write("The next board package is due. The chair reads everything; the rest read the executive summary and the font.");
  ui.write("");

  const choice = await ui.promptChoice("How do you prepare?", [
    {
      label: "Rehearse the numbers cold",
      description: "Political capital climbs when nobody can catch you flat-footed",
      value: "rehearse",
    },
    {
      label: "Polish the narrative deck",
      description: "Reputation climbs; very polished decks invite very pointed questions",
      value: "polish",
    },
    {
      label: "Wing it",
      description: "Confidence is free. Usually",
      value: "wing",
    },
  ]);

  switch (choice.value) {
    case "rehearse":
      adjustPoliticalCapital(journey, 4);
      adjustMetric(journey, "compliance", 1);
      ui.writeSuccess("You can now recite stumpage variance in your sleep. Unfortunately, you do.");
      break;
    case "polish":
      adjustMetric(journey, "reputation", 3);
      journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + 2);
      ui.writeInfo("The deck is beautiful. Decks this beautiful invite questions about what they're hiding.");
      break;
    default:
      adjustPoliticalCapital(journey, -2);
      adjustMetric(journey, "reputation", 1);
      ui.writeInfo("Confidence carries the room further than it should. One director takes up fact-checking as a hobby.");
      break;
  }

  recordDecision(journey, "board_prep", choice.value);
}

/**
 * End of period: burn rate, CEO periodic effect, month advance, milestones,
 * quarterly board reviews, continue prompt.
 */
async function endOfManagerDay(game, progressBeforeDay) {
  const { journey, ui } = game;

  ui.write("");
  ui.write("--- End of Month ---");

  journey.resources.budget = Math.max(0, journey.resources.budget - PERIOD_BURN);
  ui.write(`Corporate overhead: -$${PERIOD_BURN.toLocaleString()}`);

  applyCeoInitiative(ui, journey);

  journey.day++;
  ui.updateAllStatus(journey);

  const milestoneMessages = [];
  const crossed = recordProgressMilestones(
    journey,
    progressBeforeDay,
    milestoneMessages,
    Math.max(1, journey.day - 1),
  );
  for (const message of milestoneMessages) {
    ui.writePositive(message);
  }
  for (const threshold of crossed) {
    await runBoardReview(game, threshold);
  }

  const monthsLeft = journey.deadline - journey.day;
  const continueLabel = monthsLeft >= 0
    ? `Continue... (Month ${journey.day} of ${journey.deadline}, $${Math.round(journey.resources.budget).toLocaleString()} on hand)`
    : "Continue... (TERM COMPLETE)";
  await ui.promptChoice("", [{ label: continueLabel, value: "next" }]);
}

/**
 * CEO periodic effect, fired each quarter (every third month of the term).
 */
function applyCeoInitiative(ui, journey) {
  if (!journey.ceo || journey.day % 3 !== 0) return;

  ui.writeInfo(`${journey.ceo.name} has implemented a strategic initiative.`);
  if (journey.ceo.decision_making_style === "conservative") {
    journey.metrics.compliance = Math.min(
      100,
      (journey.metrics.compliance || 50) + 5,
    );
    ui.writeSuccess("Compliance improved under conservative leadership.");
  } else {
    journey.metrics.relationships = Math.min(
      100,
      (journey.metrics.relationships || 50) + 5,
    );
    ui.writeSuccess("Stakeholder relationships improved under collaborative leadership.");
  }
}

/**
 * Quarterly board review, fired when term progress crosses a milestone
 * threshold (25/50/75/90).
 */
async function runBoardReview(game, threshold) {
  const { journey, ui } = game;
  const baseline = journey.flags.boardBaseline || { ...journey.metrics };

  ui.clear();
  ui.writeHeader(`QUARTERLY BOARD REVIEW - ${threshold}% OF TERM`);
  ui.write("The directors assemble. Coffee is poured. Someone has printed the deck single-sided again.");
  ui.write("");

  ui.writeDivider("METRICS SINCE LAST REVIEW");
  const metricLabels = {
    progress: "Operations",
    forestHealth: "Forest Health",
    relationships: "Relationships",
    compliance: "Compliance",
    budget: "Budget Health",
    reputation: "Reputation",
  };
  let weakQuarter = false;
  for (const [key, label] of Object.entries(metricLabels)) {
    const before = Math.round(baseline[key] ?? 50);
    const now = Math.round(journey.metrics[key] ?? 50);
    const delta = now - before;
    if (delta < 0) weakQuarter = true;
    ui.write(`${label}: ${before} -> ${now} (${delta > 0 ? "+" : ""}${delta})`);
  }
  ui.write(
    `Treasury: $${Math.round(journey.resources.budget).toLocaleString()}`
    + ` | Political Capital: ${Math.round(journey.resources.politicalCapital)}`,
  );
  ui.write("");

  const choice = await ui.promptChoice("The chair asks how the quarter really went:", [
    {
      label: "Full transparency",
      description: "Table the real numbers, including the ugly ones",
      value: "transparent",
    },
    {
      label: "Spin the narrative",
      description: "Lead with wins, bury the misses in appendix C",
      value: "spin",
    },
    {
      label: "Deflect to market conditions",
      description: "Lumber prices, weather, Ottawa - anything but the plan",
      value: "deflect",
    },
  ]);

  switch (choice.value) {
    case "transparent":
      adjustPoliticalCapital(journey, 5);
      adjustMetric(journey, "compliance", 3);
      if (weakQuarter) {
        adjustMetric(journey, "reputation", -2);
        ui.write("The board respects the honesty more than they enjoy it. The compliance committee nods; the share-price watchers wince.");
      } else {
        adjustMetric(journey, "reputation", 2);
        ui.write("Good numbers, honestly told. The rarest deck in forestry. The chair almost smiles.");
      }
      break;
    case "spin":
      adjustMetric(journey, "reputation", 5);
      adjustPoliticalCapital(journey, -2);
      journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + 6);
      ui.write("The quarter sounds magnificent. Two directors take notes for later, which is never decorative.");
      break;
    default:
      adjustPoliticalCapital(journey, -4);
      adjustMetric(journey, "relationships", -3);
      journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + 3);
      ui.write("The board's analysts have the same spreadsheets you do. The deflection is noted, in the minutes, verbatim.");
      break;
  }

  journey.flags.boardBaseline = { ...journey.metrics };
  journey.log.push({
    day: journey.day,
    type: "board_review",
    threshold,
    stance: choice.value,
    summary: `Board review at ${threshold}% of term (${choice.value})`,
  });

  ui.write("");
  await ui.promptChoice("", [{ label: "Adjourn the meeting", value: "next" }]);
}

// --- helpers ---

function clampPercentValue(value) {
  return Math.max(0, Math.min(100, value));
}

function adjustMetric(journey, key, delta) {
  journey.metrics[key] = clampPercentValue((journey.metrics[key] ?? 50) + delta);
}

function adjustPoliticalCapital(journey, delta) {
  journey.resources.politicalCapital = clampPercentValue(
    (journey.resources.politicalCapital || 0) + delta,
  );
}

function spendBudget(journey, amount) {
  journey.resources.budget = Math.max(0, journey.resources.budget - amount);
}

function bumpCrewMorale(journey, delta) {
  for (const member of journey.crew || []) {
    if (member.isActive) {
      member.morale = clampPercentValue(member.morale + delta);
    }
  }
}

function recordDecision(journey, beat, choice) {
  journey.decisions.push({ day: journey.day, type: "strategic", beat, choice });
}

function formatMetricBar(label, value) {
  return `${label} [${createBar(value, 5)}] ${Math.round(value)}`;
}

function createBar(value, width) {
  const filled = Math.round((clampPercentValue(value) / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
