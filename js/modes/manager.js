/**
 * Manager Mode Runner
 *
 * The General Manager's operating year: 12 monthly board periods, one
 * strategic decision per period, events drawn through the shared pipeline
 * (60% boardroom desk-context, 40% operational escalations from the
 * divisions), a monthly ledger (delivered m³ against the AAC, log price less
 * stumpage and logging/haul, head-office overhead, certification costs), a
 * cut-control reckoning at year end, and quarterly board reviews after
 * months 3, 6, 9 and 12.
 */

import { checkForEvent } from "../events.js";
import { runDaySituation } from '../journey/daySituation.js';
import { formatStatusLine } from '../journey/dayCard.js';
import { buildBoardChartFrames } from "../scene/textmode/scenes.js";
import { getOperationalProgress, recordProgressMilestones } from "../journey.js";
import { OPERATING_POSTURES, getOperatingPosture } from "../data/managerRoles.js";

import certificationsData from "../data/json/legacy/certifications.json" with { type: "json" };

const STRATEGIC_BEATS = [
  "budget_allocation",
  "division_report",
  "field_visit",
  "board_prep",
];

// Months after which the board sits: quarterly, on the calendar, not on a
// progress meter. endOfManagerDay advances journey.day first, so the review
// fires when the new month is one of these.
const BOARD_REVIEW_MONTHS = new Set([4, 7, 10, 13]);

// Seasonal delivery curve against the monthly plan: breakup in March-April,
// summer fire season, the winter push.
const SEASONAL_DELIVERY = [1.2, 1.2, 0.6, 0.4, 0.75, 1.05, 1.1, 1.05, 1.15, 1.2, 1.15, 0.95];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Ledger side effects of the manager desk events (js/data/json/desk/
 * managerEvents.json), keyed by event id and option index. The event
 * resolves its metric effects through the shared resolver; this is the part
 * only the ledger can carry: volume, price and cost per m³.
 */
const LEDGER_HOOKS = {
  gm_mill_curtailment: [
    { curtailment: 0.55, note: 'mill curtailment - crews parked' },
    { curtailment: 1, note: 'logging through the curtailment, wood decked' },
    { curtailment: 0.85, costShift: 4, note: 'volume diverted to pulp and a second sawmill' },
  ],
  gm_bcts_bid: [
    { bonusVolume: 9000, stumpageShift: 1, note: 'BCTS sale won at appraisal plus bonus' },
    { bonusVolume: 12000, stumpageShift: 3, note: 'BCTS sale won on a high bid' },
    {},
  ],
  gm_softwood_duty_deposit: [
    { priceShift: -4, note: 'log supply agreement re-priced' },
    { priceShift: -1, note: 'volume shopped to other mills' },
    { priceShift: -2, note: 'three-year supply agreement' },
  ],
  gm_fn_revenue_sharing: [
    { costShift: 2, note: 'revenue-sharing per m³ on territory volume' },
    { costShift: 1.5, note: 'revenue-sharing at the countered rate' },
    {},
  ],
  gm_contractor_rate_renegotiation: [
    { costShift: 2.5, note: 'fuel-indexed logging rate' },
    { costShift: 2, curtailment: 0.9, note: 'rate mediation' },
    { costShift: 3, note: 'three-year logging contract with SAFE clause' },
  ],
  gm_log_export_permit: [
    { bonusVolume: 1500, note: 'export parcel moved' },
    {},
    { bonusVolume: 1500, note: 'export parcel shipped ahead of the permit' },
  ],
};

export async function runManagerDay(game) {
  const { journey, ui } = game;
  if (!journey.flags) journey.flags = {};
  if (!journey.log) journey.log = [];
  if (!journey.decisions) journey.decisions = [];
  ensureLedger(journey);

  // Month 1: the operating plan with the woodlands team.
  if (journey.day === 1 && !journey.flags.managerInitComplete) {
    await runOperatingPlan(game);
    return;
  }

  const progressBeforeDay = getOperationalProgress(journey);

  displayManagerHeader(ui, journey);

  await runStrategicDecision(game);

  const event = journey.day > 1 ? checkForEvent(journey) : null;
  if (event) {
    const monthsLeft = Math.max(0, (journey.deadline || 0) - journey.day);
    const logBefore = journey.log.length;
    const outcome = await runDaySituation(game, event, {
      frame: {
        dayHeader: `${monthName(journey.day).toUpperCase()} - MONTH ${journey.day}/${journey.deadline} - GENERAL MANAGER`,
        statusLine: formatStatusLine([
          `$${Math.round((journey.resources.budget || 0) / 1000)}k treasury`,
          `${Math.round(journey.ledger.deliveredYtd).toLocaleString()} m³ delivered YTD`,
          `${monthsLeft} month${monthsLeft === 1 ? '' : 's'} left in the year`,
        ]),
        onRender: () => updateManagerMissionStatus(ui, journey),
      },
      setAsideDescription: 'Delegate it. Keep the month for the business.',
    });
    if (outcome.gameOver) return;
    // Manager months have no dayPlan action budget - the board period runs
    // regardless - so a situation costs its effects, not the month.
    applyLedgerHooks(ui, journey, event, logBefore);
  }

  await endOfManagerDay(game, progressBeforeDay);
}

function monthName(day) {
  return MONTH_NAMES[Math.max(0, Math.min(11, (Number(day) || 1) - 1))];
}

/**
 * Ledger state for a journey that predates it (older saves).
 */
function ensureLedger(journey) {
  if (!journey.ledger) {
    journey.ledger = {
      aac: 240000,
      monthlyPlan: 20000,
      deliveredYtd: 0,
      logPrice: 105,
      stumpage: 27,
      loggingHaul: 62,
      overhead: 290000,
      startTreasury: journey.resources?.budget || 850000,
      curtailmentFactor: 1,
      bonusVolume: 0,
      costShiftPerM3: 0,
      months: [],
      cutControl: null,
    };
  }
  journey.ledger.months ||= [];
  return journey.ledger;
}

/**
 * Month 1: set the year's operating plan with the woodlands team, then the
 * certification call.
 */
async function runOperatingPlan(game) {
  const { journey, ui } = game;
  const ledger = journey.ledger;
  const woodlands = (journey.crew || []).find((member) => member.role === 'woodlands') || journey.crew?.[0] || null;
  const chiefForester = (journey.crew || []).find((member) => member.role === 'chief_forester');
  const cfo = (journey.crew || []).find((member) => member.role === 'cfo');

  ui.clear();
  ui.writeHeader(`GENERAL MANAGER - MONTH ${journey.day}/${journey.deadline} - OPERATING PLAN`);
  ui.write(`January. The woodlands team is in the boardroom with the cut plan, the stumpage forecast and last year's cut-control statement${woodlands ? `; ${woodlands.name}, your woodlands manager, has the floor` : ''}.`);
  ui.write('');
  ui.write(`AAC ${ledger.aac.toLocaleString()} m³ · plan ${ledger.monthlyPlan.toLocaleString()} m³/month · log price $${ledger.logPrice}/m³ · stumpage $${ledger.stumpage} · logging & haul $${ledger.loggingHaul} · overhead $${ledger.overhead.toLocaleString()}/month · treasury $${Math.round(journey.resources.budget).toLocaleString()}`);
  if (cfo) ui.write(`${cfo.name} (CFO) notes that spring breakup takes deliveries to a third of plan and the overhead does not move.`);
  ui.write('');

  const postureOptions = OPERATING_POSTURES.map((posture) => ({
    label: posture.name,
    value: posture.id,
    description: posture.summary,
    hint: `Strengths: ${posture.strengths.join(', ')} | Watch: ${posture.weaknesses.join(', ')}`,
  }));

  const postureRes = await ui.promptChoice(
    "Set the year's operating posture with the woodlands team:",
    postureOptions,
  );
  const posture = getOperatingPosture(postureRes.value);
  journey.ceo = {
    id: posture.id,
    name: woodlands?.name || 'the woodlands manager',
    background: 'Woodlands Manager',
    posture: posture.name,
    decision_making_style: posture.decision_making_style,
    volumeFactor: posture.volumeFactor,
    costPerM3: posture.costPerM3,
    quarterly: { ...posture.quarterly },
  };
  ui.writeSuccess(`Operating posture set: ${posture.name}. ${woodlands ? `${woodlands.name} takes it to the contractors.` : ''}`);
  ui.write('');

  // Certification
  const certOptions = certificationsData.certifications.map((cert) => ({
    label: `${cert.name} - $${cert.initial_cost.toLocaleString()} system and audit cost, $${cert.annual_cost.toLocaleString()}/yr, +$${certificationPremium(ledger, cert)}/m³ on certified fibre`,
    value: cert.id,
    hint: cert.description,
  }));
  certOptions.push({ label: "Skip certification for now", value: "none", hint: 'Hold the cash; the customers keep asking.' });

  const certRes = await ui.promptChoice(
    `${chiefForester ? `${chiefForester.name} (Chief Forester) asks: ` : ''}Certification - hold or pursue a standard this year?`,
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
    ui.writeSuccess(`${selectedCert.name} audit booked. Treasury -$${selectedCert.initial_cost.toLocaleString()}.`);
  }

  // January's wood was logged under last year's plan; it goes on this
  // year's cut-control statement.
  const januaryVolume = Math.round(ledger.monthlyPlan * SEASONAL_DELIVERY[0] * 0.98);
  ledger.deliveredYtd += januaryVolume;
  ui.write(`January deliveries under the winter program: ${januaryVolume.toLocaleString()} m³ on the cut-control statement.`);

  journey.flags.managerInitComplete = true;
  journey.flags.boardBaseline = { ...journey.metrics };
  journey.day++;

  await ui.promptChoice("", [
    { label: `Continue... (${monthName(journey.day)}, month ${journey.day} of ${journey.deadline})`, value: "next" },
  ]);
}

function certificationPremium(ledger, cert) {
  return Math.round((ledger?.logPrice || 105) * (Number(cert?.revenue_premium) || 0) * 0.25);
}

/**
 * Compact executive dashboard header.
 */
function displayManagerHeader(ui, journey) {
  ui.clear();
  ui.writeHeader(`GENERAL MANAGER - ${monthName(journey.day).toUpperCase()} - MONTH ${journey.day}/${journey.deadline}`);
  ui.updateAllStatus(journey);
  updateManagerMissionStatus(ui, journey);
}

function updateManagerMissionStatus(ui, journey) {
  const budgetOk = journey.resources.budget > 0;
  const repOk = (journey.metrics.reputation ?? 50) > 40;
  const ledger = journey.ledger || {};
  const delivered = Math.round(ledger.deliveredYtd || 0);
  const cutPace = ledger.aac ? delivered / (ledger.aac * Math.min(1, Math.max(1, journey.day - 1) / 12)) : 1;

  const facts = [
    { label: 'Reputation', value: `${Math.round(journey.metrics.reputation)}%`, tone: repOk ? undefined : 'danger' },
    { label: 'Scrutiny', value: `${Math.round(journey.scrutiny || 0)}%`, tone: (journey.scrutiny || 0) > 70 ? 'warn' : undefined },
    { label: 'Posture', value: journey.ceo ? `${journey.ceo.posture || journey.ceo.name}` : 'Unset', tone: journey.ceo ? undefined : 'warn' },
    { label: 'Delivered', value: ledger.aac ? `${delivered.toLocaleString()} / ${ledger.aac.toLocaleString()} m³` : '—', tone: cutPace < 0.85 ? 'warn' : undefined },
    { label: 'Certifications', value: (journey.certifications || []).map((cert) => cert.id || cert.name).join(', ') || 'None' },
    { label: 'Ops', value: `${Math.round(journey.metrics.progress)}%` },
    { label: 'Forest', value: `${Math.round(journey.metrics.forestHealth)}%` },
    { label: 'Relations', value: `${Math.round(journey.metrics.relationships)}%` },
    { label: 'Compliance', value: `${Math.round(journey.metrics.compliance)}%` }
  ];

  const checklist = [
    { label: 'books solvent', done: budgetOk },
    { label: 'reputation above 40%', done: repOk },
    { label: 'cut inside the control band', done: cutPace >= 0.9 && cutPace <= 1.1 }
  ];

  const alerts = [];
  if (!journey.ceo) {
    alerts.push({ level: 'warn', text: 'No operating posture set - the woodlands team is running last year\'s plan.' });
  }
  if (ledger.curtailmentFactor && ledger.curtailmentFactor < 1) {
    alerts.push({ level: 'warn', text: `Deliveries curtailed next month (${Math.round(ledger.curtailmentFactor * 100)}% of plan).` });
  }

  ui.setMissionStatus?.({
    objective: `Run the licensee's ${journey.deadline}-month operating year: deliver the cut, keep the books and the board onside.`,
    meter: { label: 'Year', value: getOperationalProgress(journey), text: `${monthName(journey.day)} (${journey.day}/${journey.deadline})` },
    facts,
    checklist,
    alerts
  });
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
  ui.write("The CFO has freed up discretionary room this month. Every division has opinions about it.");
  ui.write("");

  const choice = await ui.promptChoice("Where does the money go?", [
    {
      label: "Operations push",
      description: "-$30,000 | road and logging contractors get the parts, the gravel and the second shift they asked for",
      value: "operations",
    },
    {
      label: "Community and Nation relations",
      description: "-$22,500 | the Guardians program, the open house, the mill tour for the band council",
      value: "pr",
    },
    {
      label: "Compliance and safety training",
      description: "-$17,500 | FRPA refresher for the layout crews, SAFE Companies audit prep, a WorkSafeBC day nobody requests and everybody needs",
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
      spendBudget(journey, 30000);
      adjustMetric(journey, "progress", 4);
      adjustMetric(journey, "forestHealth", 2);
      ui.writeSuccess("Crews get parts, gravel, and a rare sense of being believed. Deliveries tick up.");
      break;
    case "pr":
      spendBudget(journey, 22500);
      adjustMetric(journey, "reputation", 4);
      adjustMetric(journey, "relationships", 2);
      ui.writeSuccess("The open house runs. A seedling gets more column inches than your last three audits combined; the council leaves with the mill tour photos.");
      break;
    case "compliance":
      spendBudget(journey, 17500);
      adjustMetric(journey, "compliance", 5);
      ui.writeSuccess("Attendance is mandatory and the sandwiches are adequate. The site plans improve measurably.");
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
    report: (value) => `Harvest delivery sits at ${value}% of plan. The woodlands manager blames breakup, the log market, and one specific grader operator.`,
  },
  {
    metric: "forestHealth",
    name: "Forest Stewardship",
    report: (value) => `Stand health index reads ${value}%. The beetle map has acquired a new colour that nobody likes, and the chief forester wants the FSP amendment moved up.`,
  },
  {
    metric: "relationships",
    name: "Community & Indigenous Relations",
    report: (value) => `Relationship standing reads ${value}%. Two letters this month, one from the Nation's referral coordinator, one of them polite.`,
  },
  {
    metric: "compliance",
    name: "Compliance & Certification",
    report: (value) => `Audit readiness is ${value}%. The binder room has a smell the certification auditors and the C&E officer will both recognize.`,
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
      description: "-$25,000 | put money and your calendar on the problem",
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
      spendBudget(journey, 25000);
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
      description: "-$12,500 | crew morale and reputation climb when the GM shows up in rain gear",
      value: "visit",
    },
  ];
  if (journey.ceo) {
    options.push({
      label: "Send the woodlands manager on tour",
      description: "-$6,000 | the contractors' camps and the band office; different audience, same photos",
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
      spendBudget(journey, 12500);
      bumpCrewMorale(journey, 6);
      adjustMetric(journey, "reputation", 3);
      adjustMetric(journey, "forestHealth", 1);
      ui.writeSuccess("You walk a cutblock in the rain and ask one good question. Word travels faster than the truck back to town.");
      break;
    case "ceo_tour":
      spendBudget(journey, 6000);
      adjustMetric(journey, "relationships", 2);
      bumpCrewMorale(journey, 2);
      ui.writeInfo(`${journey.ceo.name} works the contractor camps and the band office like a campaign stop. Different audience, same photos.`);
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
      description: "Political capital climbs when nobody can catch you flat-footed on stumpage variance",
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
 * Ledger consequences of a resolved manager desk event: the last log entry
 * names the event and the option label, which maps back to LEDGER_HOOKS.
 */
function applyLedgerHooks(ui, journey, event, logBefore) {
  const hooks = LEDGER_HOOKS[event?.id];
  if (!hooks || journey.log.length <= logBefore) return;
  const entry = journey.log[journey.log.length - 1];
  if (entry?.type !== 'event' || entry.eventId !== event.id) return;
  const index = (event.options || []).findIndex((option) => option.label === entry.optionLabel);
  const hook = hooks[index];
  if (!hook || !Object.keys(hook).length) return;
  const ledger = journey.ledger;
  if (hook.curtailment) ledger.curtailmentFactor = Math.min(ledger.curtailmentFactor, hook.curtailment);
  if (hook.bonusVolume) ledger.bonusVolume += hook.bonusVolume;
  if (hook.costShift) ledger.costShiftPerM3 += hook.costShift;
  if (hook.priceShift) ledger.logPrice = Math.max(60, ledger.logPrice + hook.priceShift);
  if (hook.stumpageShift) ledger.stumpage += hook.stumpageShift;
  if (hook.note) ui.writeInfo(`Ledger: ${hook.note}.`);
}

/**
 * End of month: the ledger, the posture's quarterly initiative, the month
 * advance, milestones, the quarterly board review, the continue prompt.
 */
async function endOfManagerDay(game, progressBeforeDay) {
  const { journey, ui } = game;

  ui.write("");
  ui.write(`--- ${monthName(journey.day)} ledger ---`);
  runMonthlyLedger(ui, journey);

  applyPostureInitiative(ui, journey);

  journey.day++;
  ui.updateAllStatus(journey);

  const milestoneMessages = [];
  recordProgressMilestones(
    journey,
    progressBeforeDay,
    milestoneMessages,
    Math.max(1, journey.day - 1),
  );
  for (const message of milestoneMessages) {
    ui.writePositive(message);
  }

  if (journey.day > journey.deadline) {
    runCutControl(ui, journey);
  }

  if (BOARD_REVIEW_MONTHS.has(journey.day) && !journey.flags[`boardReview_${journey.day}`]) {
    journey.flags[`boardReview_${journey.day}`] = true;
    await runBoardReview(game, journey.day - 1);
  }

  const monthsLeft = journey.deadline - journey.day;
  const continueLabel = monthsLeft >= 0
    ? `Continue... (${monthName(journey.day)}, month ${journey.day} of ${journey.deadline}, $${Math.round(journey.resources.budget).toLocaleString()} treasury)`
    : "Continue... (YEAR COMPLETE)";
  await ui.promptChoice("", [{ label: continueLabel, value: "next" }]);
}

/**
 * The month's ledger: delivered m³ × (log price − stumpage − logging/haul)
 * less overhead and certification costs. Prices drift; posture and events
 * move volume and cost.
 */
function runMonthlyLedger(ui, journey) {
  const ledger = ensureLedger(journey);
  const month = Math.max(1, Math.min(12, journey.day));
  const seasonal = SEASONAL_DELIVERY[month - 1];
  const opsFactor = Math.max(0.85, Math.min(1.1, (Number(journey.metrics?.progress) || 50) / 50));
  const postureVolume = Number(journey.ceo?.volumeFactor) || 1;
  const noise = 0.94 + Math.random() * 0.12;
  const planned = ledger.monthlyPlan * seasonal;
  let delivered = Math.round(planned * opsFactor * postureVolume * ledger.curtailmentFactor * noise);
  const bonus = Math.round(ledger.bonusVolume || 0);
  delivered += bonus;
  ledger.bonusVolume = 0;
  const curtailed = ledger.curtailmentFactor < 1;
  ledger.curtailmentFactor = 1;

  // The log market drifts around its long-run level; certification earns a
  // premium on the price.
  const longRunPrice = 105;
  ledger.logPrice = Math.max(80, Math.min(140, Math.round(ledger.logPrice + (longRunPrice - ledger.logPrice) * 0.3 + (Math.random() - 0.5) * 10)));
  const premium = (journey.certifications || []).reduce((sum, cert) => sum + certificationPremium(ledger, cert), 0);
  const cost = ledger.loggingHaul + (Number(journey.ceo?.costPerM3) || 0) + (ledger.costShiftPerM3 || 0);
  const margin = ledger.logPrice + premium - ledger.stumpage - cost;
  const revenue = Math.round(delivered * margin);
  const certCost = Math.round((journey.certifications || []).reduce((sum, cert) => sum + (Number(cert.annual_cost) || 0), 0) / 12);
  const net = revenue - ledger.overhead - certCost;

  ledger.deliveredYtd += delivered;
  journey.resources.budget = Math.max(0, journey.resources.budget + net);
  ledger.months.push({ month, delivered, logPrice: ledger.logPrice, margin, revenue, overhead: ledger.overhead, certCost, net });

  ui.write(`Delivered: ${delivered.toLocaleString()} m³ (plan ${Math.round(planned).toLocaleString()}${curtailed ? ', curtailed' : ''}${bonus ? `, incl. ${bonus.toLocaleString()} m³ from the sale` : ''}; year to date ${Math.round(ledger.deliveredYtd).toLocaleString()} / ${ledger.aac.toLocaleString()} m³ AAC)`);
  ui.write(`Log price $${ledger.logPrice}${premium ? ` + $${premium} certified premium` : ''} - stumpage $${ledger.stumpage} - logging & haul $${Math.round(cost)} = $${Math.round(margin)}/m³ margin -> ${revenue >= 0 ? '+' : '-'}$${Math.abs(revenue).toLocaleString()}`);
  ui.write(`Overhead -$${ledger.overhead.toLocaleString()}${certCost ? ` · certification -$${certCost.toLocaleString()}` : ''}`);
  const netLine = `Net ${net >= 0 ? '+' : '-'}$${Math.abs(net).toLocaleString()} -> treasury $${Math.round(journey.resources.budget).toLocaleString()}`;
  if (net >= 0) ui.writeSuccess(netLine); else ui.writeWarning(netLine);

  // Budget health: the treasury against where the year started.
  journey.metrics.budget = clampPercentValue(Math.round(50 + ((journey.resources.budget - ledger.startTreasury) / ledger.startTreasury) * 50));
  if (journey.resources.budget <= 0) {
    ui.writeDanger('The treasury is empty. The bank calls the covenant.');
  }
}

/**
 * Year end: the cut-control statement against the AAC.
 */
function runCutControl(ui, journey) {
  const ledger = ensureLedger(journey);
  if (ledger.cutControl) return;
  const ratio = ledger.aac ? ledger.deliveredYtd / ledger.aac : 1;
  const pct = Math.round(ratio * 100);
  ui.write('');
  ui.writeDivider('CUT-CONTROL STATEMENT');
  if (ratio < 0.9) {
    const short = Math.round(ledger.aac - ledger.deliveredYtd);
    ledger.cutControl = `undercut ${pct}%`;
    adjustPoliticalCapital(journey, -4);
    adjustMetric(journey, 'reputation', -3);
    ui.writeWarning(`Undercut: ${ledger.deliveredYtd.toLocaleString()} of ${ledger.aac.toLocaleString()} m³ (${pct}%). ${short.toLocaleString()} m³ short of the AAC; the volume is lost to the cut-control period and the board reads it as margin left in the bush.`);
  } else if (ratio > 1.1) {
    const excess = Math.round(ledger.deliveredYtd - ledger.aac * 1.1);
    const penalty = excess * 10;
    ledger.cutControl = `overcut ${pct}%`;
    adjustMetric(journey, 'compliance', -8);
    journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + 6);
    journey.resources.budget = Math.max(0, journey.resources.budget - penalty);
    ui.writeWarning(`Overcut: ${ledger.deliveredYtd.toLocaleString()} of ${ledger.aac.toLocaleString()} m³ (${pct}%), past the 110% ceiling. C&E opens a file; the penalty on ${excess.toLocaleString()} m³ is $${penalty.toLocaleString()}.`);
  } else {
    ledger.cutControl = `within band ${pct}%`;
    adjustPoliticalCapital(journey, 3);
    adjustMetric(journey, 'compliance', 2);
    ui.writeSuccess(`Cut control: ${ledger.deliveredYtd.toLocaleString()} of ${ledger.aac.toLocaleString()} m³ (${pct}%), inside the band. The statement goes to the District Manager without a covering letter.`);
  }
}

/**
 * The posture's quarterly initiative: what the woodlands team does with it on
 * its own, every third month.
 */
function applyPostureInitiative(ui, journey) {
  if (!journey.ceo || journey.day % 3 !== 0) return;
  const quarterly = journey.ceo.quarterly || getOperatingPosture(journey.ceo.id).quarterly || {};
  const labels = { compliance: 'Compliance', relationships: 'Relationships', progress: 'Deliveries', forestHealth: 'Forest health', reputation: 'Reputation' };
  const parts = [];
  for (const [key, delta] of Object.entries(quarterly)) {
    adjustMetric(journey, key, delta);
    parts.push(`${labels[key] || key} ${delta > 0 ? '+' : ''}${delta}`);
  }
  if (!parts.length) return;
  ui.writeInfo(`${journey.ceo.name} runs the quarter on the ${journey.ceo.posture || 'chosen'} posture: ${parts.join(', ')}.`);
}

/**
 * Quarterly board review after months 3, 6, 9 and 12.
 */
async function runBoardReview(game, monthClosed) {
  const { journey, ui } = game;
  const baseline = journey.flags.boardBaseline || { ...journey.metrics };
  const quarter = Math.max(1, Math.min(4, Math.ceil(monthClosed / 3)));

  ui.clear();
  ui.writeHeader(`QUARTERLY BOARD REVIEW - Q${quarter} (${monthName(monthClosed).toUpperCase()} CLOSE)`);
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

  if (typeof ui.playScene === "function") {
    await ui.playScene(buildBoardChartFrames(
      Object.entries(metricLabels).map(([key, label]) => ({
        label,
        value: journey.metrics[key] ?? 50,
      }))
    ), { delay: 110 });
  }
  let weakQuarter = false;
  for (const [key, label] of Object.entries(metricLabels)) {
    const before = Math.round(baseline[key] ?? 50);
    const now = Math.round(journey.metrics[key] ?? 50);
    const delta = now - before;
    if (delta < 0) weakQuarter = true;
    ui.write(`${label}: ${before} -> ${now} (${delta > 0 ? "+" : ""}${delta})`);
  }
  const ledger = journey.ledger || {};
  const quarterMonths = (ledger.months || []).slice(-3);
  const quarterNet = quarterMonths.reduce((sum, entry) => sum + (entry.net || 0), 0);
  const quarterVolume = quarterMonths.reduce((sum, entry) => sum + (entry.delivered || 0), 0);
  ui.write(
    `Treasury: $${Math.round(journey.resources.budget).toLocaleString()}`
    + ` | Quarter: ${quarterVolume.toLocaleString()} m³, net ${quarterNet >= 0 ? '+' : '-'}$${Math.abs(quarterNet).toLocaleString()}`
    + ` | YTD ${Math.round(ledger.deliveredYtd || 0).toLocaleString()} / ${(ledger.aac || 0).toLocaleString()} m³`
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
      description: "Lumber prices, breakup, Ottawa - anything but the plan",
      value: "deflect",
    },
  ]);

  switch (choice.value) {
    case "transparent":
      adjustPoliticalCapital(journey, 5);
      adjustMetric(journey, "compliance", 3);
      if (weakQuarter) {
        adjustMetric(journey, "reputation", -2);
        ui.write("The board respects the honesty more than they enjoy it. The audit committee nods; the share-price watchers wince.");
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
    threshold: quarter * 25,
    quarter,
    stance: choice.value,
    summary: `Q${quarter} board review (${choice.value})`,
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
