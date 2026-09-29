/**
 * Manager Mode Runner
 *
 * The General Manager's operating year: 12 monthly board periods, one
 * strategic decision per period, events drawn through the shared pipeline
 * (60% boardroom desk-context, 40% operational escalations from the
 * divisions), a monthly ledger (delivered m³ against the AAC, log price less
 * stumpage and logging/haul, head-office overhead, certification costs),
 * certification audits in May and October, a cut schedule the woodlands
 * manager runs between reviews, a cut-control reckoning at year end, and
 * quarterly board reviews after months 3, 6, 9 and 12.
 */

import { checkForEvent } from "../events.js";
import { runDaySituation } from '../journey/daySituation.js';
import { formatStatusLine } from '../journey/dayCard.js';
import { buildBoardChartFrames } from "../scene/textmode/scenes.js";
import { getOperationalProgress, recordProgressMilestones } from "../journey.js";
import { SEASONS } from "../season.js";
import {
  OPERATING_POSTURES,
  getOperatingPosture,
  CUT_CONTROL,
  classifyCutControl,
  formatCutPercent,
  HARVEST_PACES,
  getHarvestPace,
} from "../data/managerRoles.js";

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

// January's wood was logged under last year's winter program: it lands on
// this year's statement at a fixed share of plan, before any posture applies.
const JANUARY_CARRY_IN = 0.98;

const OVERHEAD_BY_DIFFICULTY = { easy: 0.92, normal: 1, hard: 1.04 };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const METRIC_LABELS = {
  progress: "Operations",
  forestHealth: "Forest Health",
  relationships: "Relationships",
  compliance: "Compliance",
  budget: "Budget Health",
  reputation: "Reputation",
};

const CERT_MECHANICS = certificationsData.mechanics || {};
const REGISTRATION_AUDIT_MONTH = Number(CERT_MECHANICS.registration_audit_month) || 5;
const SURVEILLANCE_AUDIT_MONTH = Number(CERT_MECHANICS.surveillance_audit_month) || 10;
const CERT_LOSS_REPUTATION = Number(CERT_MECHANICS.loss_penalty_reputation) || 5;

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
    // The diversion lasts as long as the curtailment: one month's haul, not the year's.
    { curtailment: 0.85, monthCostShift: 4, note: 'volume diverted to pulp and a second sawmill for the month' },
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

/**
 * Events that only make sense for some licensees. The shared pipeline has no
 * notion of a held certificate, so the manager runner drops a draw that does
 * not fit rather than serve a surveillance audit to an uncertified company.
 */
const MANAGER_EVENT_GATES = {
  gm_certification_audit_prep: (journey) => activeCertifications(journey).length > 0,
};

export async function runManagerDay(game) {
  const { journey, ui } = game;
  if (!journey.flags) journey.flags = {};
  if (!journey.log) journey.log = [];
  if (!journey.decisions) journey.decisions = [];
  ensureLedger(journey);
  syncCalendarSeason(journey);

  // Month 1: the operating plan with the woodlands team.
  if (journey.day === 1 && !journey.flags.managerInitComplete) {
    await runOperatingPlan(game);
    return;
  }

  const progressBeforeDay = getOperationalProgress(journey);

  displayManagerHeader(ui, journey);

  await maybeFlagCutProjection(game);

  await runStrategicDecision(game);

  let event = journey.day > 1 ? checkForEvent(journey) : null;
  if (event && MANAGER_EVENT_GATES[event.id] && !MANAGER_EVENT_GATES[event.id](journey)) {
    event = null;
  }
  if (event) {
    const monthsLeft = Math.max(0, (journey.deadline || 0) - journey.day);
    const logBefore = journey.log.length;
    const outcome = await runDaySituation(game, event, {
      frame: {
        dayHeader: `${monthName(journey.day).toUpperCase()} - MONTH ${journey.day}/${journey.deadline} - GENERAL MANAGER`,
        statusLine: formatStatusLine([
          `$${Math.round((journey.resources.budget || 0) / 1000).toLocaleString()}k treasury`,
          `${Math.round(journey.ledger.deliveredYtd).toLocaleString()} m³ delivered YTD`,
          monthsLeft > 0 ? `${monthsLeft} month${monthsLeft === 1 ? '' : 's'} left after this one` : 'last month of the year',
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

function lastLedgerMonth(journey) {
  return Math.min(12, Number(journey.deadline) || 12);
}

/**
 * The calendar season for the month being played, in the shape the shared
 * event pipeline reads (`journey.season.currentSeason`). Without it the GM
 * drew July heat cards in December and planting-window rows in November.
 */
function syncCalendarSeason(journey) {
  const month = Math.max(1, Math.min(12, Number(journey.day) || 1));
  const season = Object.values(SEASONS).find((entry) => entry.months.includes(month)) || SEASONS.winter;
  const previous = journey.season && typeof journey.season === 'object' ? journey.season : {};
  journey.season = {
    ...previous,
    currentSeason: season.id,
    year: previous.year || 1,
    dayInSeason: season.months.indexOf(month) + 1,
    totalDaysInSeason: season.months.length,
    totalDaysPlayed: Math.max(0, month - 1),
    seasonTransitions: previous.seasonTransitions || 0,
  };
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
  if (!Number.isFinite(journey.ledger.pace)) journey.ledger.pace = 1;
  return journey.ledger;
}

function findExecutive(journey, roleId) {
  return (journey.crew || []).find((member) => member.role === roleId && member.isActive !== false) || null;
}

/** The executive's name, or the title in lower case when the seat is empty. */
function executiveName(journey, roleId, title) {
  return findExecutive(journey, roleId)?.name || `the ${title}`;
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Month 1: set the year's operating plan with the woodlands team, then the
 * certification call, then January's carry-in ledger.
 */
async function runOperatingPlan(game) {
  const { journey, ui } = game;
  const ledger = journey.ledger;
  const woodlands = findExecutive(journey, 'woodlands');
  const chiefForester = findExecutive(journey, 'chief_forester');
  const cfo = findExecutive(journey, 'cfo');

  // Budget health is read against the treasury the year actually opened
  // with, after difficulty has scaled it. Difficulty also sets how lean
  // head office runs: the cushion alone did not keep an easy year solvent
  // through a price dip.
  ledger.startTreasury = Math.round(journey.resources.budget);
  ledger.overhead = Math.round(ledger.overhead * (OVERHEAD_BY_DIFFICULTY[journey.difficulty] || 1) / 1000) * 1000;

  ui.clear();
  ui.writeHeader(`GENERAL MANAGER - MONTH ${journey.day}/${journey.deadline} - OPERATING PLAN`);
  ui.write(`January. The woodlands team is in the boardroom with the cut plan, the stumpage forecast and last year's cut-control statement${woodlands ? `; ${woodlands.name}, your woodlands manager, has the floor` : ''}.`);
  ui.write('');
  ui.write(`AAC ${ledger.aac.toLocaleString()} m³ · plan ${ledger.monthlyPlan.toLocaleString()} m³/month · log price $${ledger.logPrice}/m³ · stumpage $${ledger.stumpage} (tracks the market) · logging & haul $${ledger.loggingHaul} · overhead $${ledger.overhead.toLocaleString()}/month · treasury $${Math.round(journey.resources.budget).toLocaleString()}`);
  ui.write(`Cut control is judged in December: ${Math.round(CUT_CONTROL.bandLow * 100)}-${Math.round(CUT_CONTROL.bandHigh * 100)}% of the AAC goes in clean. Outside it the statement carries a finding, with a C&E penalty of $${CUT_CONTROL.overcutPenaltyPerM3}/m³ past the ceiling. Below ${Math.round(CUT_CONTROL.limitLow * 100)}% or above ${Math.round(CUT_CONTROL.limitHigh * 100)}%, the board ends your term.`);
  if (cfo) ui.write(`${cfo.name} (CFO) notes that spring breakup takes deliveries to a third of plan and the overhead does not move.`);
  ui.write('');

  const postureOptions = OPERATING_POSTURES.map((posture) => ({
    label: posture.name,
    value: posture.id,
    description: posture.summary,
    hint: `${posture.summary} ${describePostureNumbers(posture)}`,
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

  // Certification: booked now, earned at the registration audit in May.
  const certOptions = certificationsData.certifications.map((cert) => ({
    label: `${cert.name} - $${cert.initial_cost.toLocaleString()} up front, $${cert.annual_cost.toLocaleString()}/yr, +$${certificationPremium(ledger, cert)}/m³ once certified`,
    value: cert.id,
    hint: `${monthName(REGISTRATION_AUDIT_MONTH)} audit wants ${describeRequirements(cert)}. ${cert.description}`,
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
    journey.certifications.push({ ...selectedCert, status: 'pending', audits: [] });
    journey.resources.budget = Math.max(0, journey.resources.budget - selectedCert.initial_cost);
    ui.writeSuccess(`${selectedCert.id} registration audit booked for ${monthName(REGISTRATION_AUDIT_MONTH)}. Treasury -$${selectedCert.initial_cost.toLocaleString()}.`);
    ui.write(`The auditors will want ${describeRequirements(selectedCert)} on the day. No premium until the certificate is issued.`);
  }

  ui.write('');
  ui.write('--- January ledger ---');
  ui.write('January deliveries under last year\'s winter program go on this year\'s cut-control statement.');
  runMonthlyLedger(ui, journey, { carryIn: true });

  journey.flags.managerInitComplete = true;
  journey.flags.boardBaseline = { ...journey.metrics };
  journey.day++;
  syncCalendarSeason(journey);
  ui.updateAllStatus(journey);
  updateManagerMissionStatus(ui, journey);

  await ui.promptChoice("", [
    { label: `Continue... (${monthName(journey.day)}, month ${journey.day} of ${journey.deadline})`, value: "next" },
  ]);
}

function describePostureNumbers(posture) {
  const cost = Number(posture.costPerM3) || 0;
  const quarterly = Object.entries(posture.quarterly || {})
    .map(([key, delta]) => `${(METRIC_LABELS[key] || key).toLowerCase()} ${delta > 0 ? '+' : ''}${delta}`)
    .join(', ');
  const haul = cost ? `logging & haul ${cost > 0 ? '+' : '-'}$${formatRate(Math.abs(cost))}/m³` : 'logging & haul at the contract rate';
  return `Volume ${Math.round(posture.volumeFactor * 100)}% of plan, ${haul}${quarterly ? `; each quarter ${quarterly}` : ''}.`;
}

const REQUIREMENT_LABELS = { compliance: 'compliance', relationships: 'relationships', forestHealth: 'forest health', reputation: 'reputation', progress: 'operations' };

/** Requirements keyed by a metric the GM can see; legacy keys are ignored. */
function certificationRequirements(cert) {
  return Object.entries(cert?.requirements || {})
    .filter(([metric, minimum]) => REQUIREMENT_LABELS[metric] && Number.isFinite(Number(minimum)));
}

function describeRequirements(cert) {
  const parts = certificationRequirements(cert).map(([metric, minimum]) => `${REQUIREMENT_LABELS[metric]} ${minimum}%+`);
  if (!parts.length) return 'a clean file';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

const LONG_RUN_LOG_PRICE = 105;
// Share of a log-price move the stumpage rate follows.
const STUMPAGE_MARKET_SHARE = 0.6;

/** The month's stumpage: the licence's rate at the long-run price, moved with the market. */
function stumpageRate(ledger) {
  return Math.max(1, Math.round(ledger.stumpage + STUMPAGE_MARKET_SHARE * (ledger.logPrice - LONG_RUN_LOG_PRICE)));
}

function certificationPremium(ledger, cert) {
  if (Number.isFinite(Number(cert?.premium_per_m3))) return Number(cert.premium_per_m3);
  // Saves from before the data carried a per-m³ premium.
  return Math.round((ledger?.logPrice || 105) * (Number(cert?.revenue_premium) || 0) * 0.25);
}

/** Certificates on the books: saves from before audits count as held. */
function certificationStatus(cert) {
  return cert?.status || 'certified';
}

function activeCertifications(journey) {
  return (journey.certifications || []).filter((cert) => ['pending', 'corrective', 'certified', 'suspended'].includes(certificationStatus(cert)));
}

function earningCertifications(journey) {
  return (journey.certifications || []).filter((cert) => certificationStatus(cert) === 'certified');
}

/** Dollars per m³ as the ledger prints them: whole where whole, cents otherwise. */
function formatRate(value) {
  const rounded = Math.round(Number(value) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function formatSignedDollars(value) {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(Math.round(value)).toLocaleString()}`;
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

/**
 * The volume the operating settings deliver per unit of plan: the ops meter,
 * the posture and the cut schedule. The ledger multiplies the month's plan by
 * this (and by curtailment and noise); the projection uses the same number.
 */
function runRate(journey, pace = journey.ledger?.pace) {
  const opsFactor = Math.max(0.85, Math.min(1.1, (Number(journey.metrics?.progress) || 50) / 50));
  const postureVolume = Number(journey.ceo?.volumeFactor) || 1;
  return opsFactor * postureVolume * (Number(pace) || 1);
}

/**
 * Where the cut lands in December on the current trajectory: what is already
 * on the statement, plus every month still to deliver at its place on the
 * seasonal curve and the current run rate. A straight line through the year
 * read a January carry-in as a runaway and a summer on the way to 114% as on
 * the number.
 * @param {Object} journey
 * @param {number} [pace] - cut schedule factor to project with
 * @returns {{volume: number, ratio: number, status: string}}
 */
export function projectYearEndCut(journey, pace = journey.ledger?.pace) {
  const ledger = ensureLedger(journey);
  const firstMonth = Math.max(1, Number(journey.day) || 1);
  const rate = runRate(journey, pace);
  let volume = ledger.deliveredYtd + (ledger.bonusVolume || 0);
  for (let month = firstMonth; month <= lastLedgerMonth(journey); month += 1) {
    const curtailment = month === firstMonth ? (ledger.curtailmentFactor || 1) : 1;
    volume += ledger.monthlyPlan * SEASONAL_DELIVERY[month - 1] * rate * curtailment;
  }
  const ratio = ledger.aac ? volume / ledger.aac : 1;
  return { volume: Math.round(volume), ratio, status: classifyCutControl(ratio) };
}

function plannedToDate(ledger, throughMonth) {
  let planned = 0;
  for (let month = 1; month <= Math.min(12, throughMonth); month += 1) {
    planned += ledger.monthlyPlan * SEASONAL_DELIVERY[month - 1];
  }
  return planned;
}

function updateManagerMissionStatus(ui, journey) {
  const budgetOk = journey.resources.budget > 0;
  const repOk = (journey.metrics.reputation ?? 50) > 40;
  const ledger = journey.ledger || {};
  const delivered = Math.round(ledger.deliveredYtd || 0);
  const yearOver = journey.day > (journey.deadline || 12);
  const cut = yearOver || !ledger.aac
    ? { volume: delivered, ratio: ledger.aac ? delivered / ledger.aac : 1 }
    : projectYearEndCut(journey);
  const cutStatus = classifyCutControl(cut.ratio);
  const inBand = cutStatus === 'in_band';

  const facts = [
    { label: 'Treasury', value: `$${Math.round(journey.resources.budget || 0).toLocaleString()}`, tone: budgetOk ? undefined : 'danger' },
    { label: 'Reputation', value: `${Math.round(journey.metrics.reputation)}%`, tone: repOk ? undefined : 'danger' },
    { label: 'Scrutiny', value: `${Math.round(journey.scrutiny || 0)}%`, tone: (journey.scrutiny || 0) > 70 ? 'warn' : undefined },
    { label: 'Posture', value: journey.ceo ? `${journey.ceo.posture || journey.ceo.name}` : 'Unset', tone: journey.ceo ? undefined : 'warn' },
    { label: 'Delivered', value: ledger.aac ? `${delivered.toLocaleString()} / ${ledger.aac.toLocaleString()} m³` : '—' },
    {
      label: yearOver ? 'Cut control' : 'Projected',
      value: ledger.aac ? `${cut.volume.toLocaleString()} m³ (${formatCutPercent(cut.ratio)})` : '—',
      tone: inBand ? undefined : cutStatus.startsWith('severe') ? 'danger' : 'warn',
    },
    { label: 'Cut schedule', value: getHarvestPace(ledger.pace).name },
    { label: 'Certifications', value: (journey.certifications || []).map((cert) => `${cert.id || cert.name} (${certificationStatus(cert)})`).join(', ') || 'None' },
    { label: 'Ops', value: `${Math.round(journey.metrics.progress)}%` },
    { label: 'Forest', value: `${Math.round(journey.metrics.forestHealth)}%` },
    { label: 'Relations', value: `${Math.round(journey.metrics.relationships)}%` },
    { label: 'Compliance', value: `${Math.round(journey.metrics.compliance)}%` }
  ];

  const checklist = [
    { label: 'books solvent', done: budgetOk },
    { label: 'reputation above 40%', done: repOk },
    { label: yearOver ? 'cut inside the 90-110% band' : 'cut on course for the 90-110% band', done: inBand }
  ];

  const alerts = [];
  if (!journey.ceo) {
    alerts.push({ level: 'warn', text: 'No operating posture set - the woodlands team is running last year\'s plan.' });
  }
  if (!yearOver && ledger.aac && !inBand) {
    alerts.push({
      level: cutStatus.startsWith('severe') ? 'danger' : 'warn',
      text: `Cut projected at ${formatCutPercent(cut.ratio)} of the AAC by December - ${cut.ratio > 1 ? 'slow' : 'speed up'} the cut schedule.`,
    });
  }
  if (ledger.curtailmentFactor && ledger.curtailmentFactor < 1) {
    alerts.push({ level: 'warn', text: `Deliveries curtailed next month (${Math.round(ledger.curtailmentFactor * 100)}% of plan).` });
  }

  ui.setMissionStatus?.({
    objective: `Run the licensee's ${journey.deadline}-month operating year: deliver the cut inside the control band, keep the books and the board onside.`,
    meter: { label: 'Year', value: getOperationalProgress(journey), text: `${monthName(journey.day)} (${Math.min(journey.day, journey.deadline)}/${journey.deadline})` },
    facts,
    checklist,
    alerts
  });
}

/**
 * The cut schedule: the woodlands manager's in-year lever on cut control.
 * Each option shows where the year lands under it. The woodlands manager
 * recommends the cheapest schedule that keeps the year inside the band -
 * holding costs nothing, so it wins whenever it is enough - and otherwise
 * whichever lands nearest the AAC. The recommendation comes first.
 */
async function runCutSchedule(game, prompt) {
  const { journey, ui } = game;
  const ledger = ensureLedger(journey);
  const current = getHarvestPace(ledger.pace);
  const projections = HARVEST_PACES.map((pace) => ({ pace, projection: projectYearEndCut(journey, pace.factor) }));
  const distance = (entry) => Math.abs(entry.projection.ratio - 1);
  // A point of margin inside the band: the months still to come are noisy.
  const inBand = projections.filter((entry) => entry.projection.ratio >= CUT_CONTROL.bandLow + 0.01
    && entry.projection.ratio <= CUT_CONTROL.bandHigh - 0.01);
  const recommended = inBand.find((entry) => entry.pace.factor === 1)
    || [...(inBand.length ? inBand : projections)].sort((a, b) => distance(a) - distance(b))[0];

  const ordered = [recommended, ...projections.filter((entry) => entry !== recommended)];
  const options = ordered.map(({ pace, projection }) => {
    const costs = [];
    if (pace.standbyPerMonth) costs.push(`standby -$${pace.standbyPerMonth.toLocaleString()}/month`);
    if (pace.costPerM3) costs.push(`+$${formatRate(pace.costPerM3)}/m³ logging & haul`);
    const tags = [];
    if (pace === current) tags.push('current');
    if (pace === recommended.pace) tags.push('recommended');
    return {
      label: `${pace.name}${tags.length ? ` (${tags.join(', ')})` : ''}`,
      description: `December ${projection.volume.toLocaleString()} m³ (${formatCutPercent(projection.ratio)} of AAC)${costs.length ? ` | ${costs.join(', ')}` : ''}`,
      value: pace.id,
      recommended: pace === recommended.pace,
    };
  });

  const choice = await ui.promptChoice(prompt, options);
  const pace = getHarvestPace(choice.value);
  const woodlands = capitalize(executiveName(journey, 'woodlands', 'woodlands manager'));
  if (pace !== current) {
    ledger.pace = pace.factor;
    ui.writeSuccess(`${woodlands} moves the contractors to "${pace.name}". ${pace.summary}.`);
  } else {
    ui.writeInfo(`${woodlands} keeps the contractors on "${pace.name}".`);
  }
  journey.flags.paceSetMonth = journey.day;
  journey.decisions.push({ day: journey.day, type: 'cut_schedule', choice: pace.id });
}

/**
 * Month start: when the trajectory leaves the control band, the woodlands
 * manager brings it to the GM instead of letting it surface in December.
 */
async function maybeFlagCutProjection(game) {
  const { journey, ui } = game;
  if (journey.flags.paceSetMonth === journey.day) return;
  const projection = projectYearEndCut(journey);
  if (projection.status === 'in_band') return;
  const woodlands = capitalize(executiveName(journey, 'woodlands', 'woodlands manager'));
  ui.writeDivider('CUT CONTROL WATCH');
  ui.writeWarning(`${woodlands} flags the cut: ${Math.round(journey.ledger.deliveredYtd).toLocaleString()} m³ on the statement, and on this schedule December lands at ${projection.volume.toLocaleString()} m³ - ${formatCutPercent(projection.ratio)} of the AAC, outside the ${Math.round(CUT_CONTROL.bandLow * 100)}-${Math.round(CUT_CONTROL.bandHigh * 100)}% band.`);
  await runCutSchedule(game, `Cut schedule from ${monthName(journey.day)}:`);
  ui.write('');
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
  const cfo = findExecutive(journey, 'cfo');
  ui.writeDivider("STRATEGIC DECISION - DISCRETIONARY SPEND");
  ui.write(`${cfo ? `${cfo.name}, your CFO,` : 'The CFO'} has freed up discretionary room this month. Every division has opinions about it.`);
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
    lead: ['woodlands', 'woodlands manager'],
    report: (value, journey, lead) => {
      const ledger = journey.ledger || {};
      const planned = plannedToDate(ledger, journey.day - 1);
      const pct = planned > 0 ? Math.round((ledger.deliveredYtd / planned) * 100) : 100;
      const read = pct < 97
        ? `${capitalize(lead)} blames breakup, the log market, and one specific grader operator.`
        : `${capitalize(lead)} wants the credit, and a second grader.`;
      return `Deliveries sit at ${pct}% of plan year to date and operations readiness reads ${value}%. ${read}`;
    },
  },
  {
    metric: "forestHealth",
    name: "Forest Stewardship",
    lead: ['chief_forester', 'chief forester'],
    report: (value, journey, lead) => `Stand health index reads ${value}%. The beetle map has acquired a new colour that nobody likes, and ${lead} wants the FSP amendment moved up.`,
  },
  {
    metric: "relationships",
    name: "Community & Indigenous Relations",
    lead: ['indigenous_relations', 'Indigenous relations lead'],
    report: (value, journey, lead) => `Relationship standing reads ${value}%. ${capitalize(lead)} has two letters on the table this month, one from the Nation's referral coordinator, one of them polite.`,
  },
  {
    metric: "compliance",
    name: "Compliance & Certification",
    lead: ['hse', 'HSE manager'],
    report: (value, journey, lead) => `Audit readiness is ${value}%. ${capitalize(lead)} says the binder room has a smell the certification auditors and the C&E officer will both recognize.`,
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
  const lead = executiveName(journey, ...division.lead);

  ui.writeDivider(`STRATEGIC DECISION - ${division.name.toUpperCase()} REPORT`);
  ui.write(division.report(value, journey, lead));
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
      ui.writeInfo(`You praise ${lead} at the all-hands. The numbers stay where they are, but loyalty is a real currency out here.`);
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
      ui.writeInfo(`${capitalize(journey.ceo.name)} works the contractor camps and the band office like a campaign stop. Different audience, same photos.`);
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
  if (hook.monthCostShift) ledger.monthCostShift = (ledger.monthCostShift || 0) + hook.monthCostShift;
  if (hook.priceShift) ledger.logPrice = Math.max(60, ledger.logPrice + hook.priceShift);
  if (hook.stumpageShift) ledger.stumpage += hook.stumpageShift;
  if (hook.note) ui.writeInfo(`Ledger: ${hook.note}.`);
}

/**
 * End of month: the ledger, any certification audit, the posture's quarterly
 * initiative, the month advance, milestones, the cut-control statement at
 * year end, the quarterly board review, the continue prompt.
 */
async function endOfManagerDay(game, progressBeforeDay) {
  const { journey, ui } = game;

  ui.write("");
  ui.write(`--- ${monthName(journey.day)} ledger ---`);
  runMonthlyLedger(ui, journey);

  runCertificationAudits(ui, journey);

  applyPostureInitiative(ui, journey);

  journey.day++;
  syncCalendarSeason(journey);
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
  updateManagerMissionStatus(ui, journey);

  if (BOARD_REVIEW_MONTHS.has(journey.day) && !journey.flags[`boardReview_${journey.day}`]) {
    journey.flags[`boardReview_${journey.day}`] = true;
    // The board review clears the screen: hold the month's ledger (and in
    // December the cut-control statement) until the player has read it.
    const quarter = Math.max(1, Math.min(4, Math.ceil((journey.day - 1) / 3)));
    await ui.promptChoice("", [{
      label: quarter === 4 ? 'Continue to the year-end board review' : `Continue to the Q${quarter} board review`,
      value: "next",
    }]);
    await runBoardReview(game, journey.day - 1);
  }

  const monthsLeft = journey.deadline - journey.day;
  const continueLabel = monthsLeft >= 0
    ? `Continue... (${monthName(journey.day)}, month ${journey.day} of ${journey.deadline}, $${Math.round(journey.resources.budget).toLocaleString()} treasury)`
    : "Continue... (YEAR COMPLETE)";
  await ui.promptChoice("", [{ label: continueLabel, value: "next" }]);
}

/**
 * The month's ledger: delivered m³ × (log price + certified premium −
 * stumpage − logging/haul) less overhead, certification and standby costs.
 * Prices drift; posture, the cut schedule and events move volume and cost.
 * Every number printed reconciles: revenue is delivered × the printed margin,
 * net is revenue less the printed charges.
 * @param {Object} ui
 * @param {Object} journey
 * @param {Object} [options]
 * @param {boolean} [options.carryIn] - January: last year's winter program,
 *   a fixed share of plan at the opening price, no posture or schedule
 */
function runMonthlyLedger(ui, journey, { carryIn = false } = {}) {
  const ledger = ensureLedger(journey);
  const month = Math.max(1, Math.min(12, journey.day));
  const planned = Math.round(ledger.monthlyPlan * SEASONAL_DELIVERY[month - 1]);
  const pace = carryIn ? getHarvestPace(1) : getHarvestPace(ledger.pace);

  let delivered;
  let bonus = 0;
  let curtailed = false;
  if (carryIn) {
    delivered = Math.round(planned * JANUARY_CARRY_IN);
  } else {
    const noise = 0.94 + Math.random() * 0.12;
    delivered = Math.round(planned * runRate(journey) * ledger.curtailmentFactor * noise);
    bonus = Math.round(ledger.bonusVolume || 0);
    delivered += bonus;
    ledger.bonusVolume = 0;
    curtailed = ledger.curtailmentFactor < 1;
    ledger.curtailmentFactor = 1;

    // The log market drifts around its long-run level.
    ledger.logPrice = Math.max(80, Math.min(140, Math.round(ledger.logPrice + (LONG_RUN_LOG_PRICE - ledger.logPrice) * 0.3 + (Math.random() - 0.5) * 10)));
  }

  // Stumpage follows the market (the Market Pricing System reprices it as
  // lumber moves), so a price dip is shared with the Crown rather than
  // landing on the licensee's margin alone.
  const stumpage = stumpageRate(ledger);
  const premium = earningCertifications(journey).reduce((sum, cert) => sum + certificationPremium(ledger, cert), 0);
  const cost = ledger.loggingHaul
    + (carryIn ? 0 : Number(journey.ceo?.costPerM3) || 0)
    + (ledger.costShiftPerM3 || 0)
    + (carryIn ? 0 : Number(ledger.monthCostShift) || 0)
    + pace.costPerM3;
  if (!carryIn) ledger.monthCostShift = 0;
  const margin = ledger.logPrice + premium - stumpage - cost;
  const revenue = Math.round(delivered * margin);
  const certCost = Math.round(activeCertifications(journey).reduce((sum, cert) => sum + (Number(cert.annual_cost) || 0), 0) / 12);
  const standby = pace.standbyPerMonth;
  const net = revenue - ledger.overhead - certCost - standby;

  ledger.deliveredYtd += delivered;
  journey.resources.budget = Math.max(0, journey.resources.budget + net);
  ledger.months.push({
    month, planned, delivered, logPrice: ledger.logPrice, premium, stumpage, cost,
    margin, revenue, overhead: ledger.overhead, certCost, standby, net,
    treasury: Math.round(journey.resources.budget),
  });

  const volumeNotes = [
    curtailed ? 'curtailed' : null,
    bonus ? `incl. ${bonus.toLocaleString()} m³ from the sale` : null,
    pace.factor !== 1 ? pace.name.toLowerCase() : null,
  ].filter(Boolean);
  const deliveredLine = `Delivered: ${delivered.toLocaleString()} m³ (plan ${planned.toLocaleString()}${volumeNotes.length ? `, ${volumeNotes.join(', ')}` : ''}; year to date ${Math.round(ledger.deliveredYtd).toLocaleString()} / ${ledger.aac.toLocaleString()} m³ AAC)`;
  const marginLine = `Log price $${ledger.logPrice}${premium ? ` + $${formatRate(premium)} certified premium` : ''} - stumpage $${stumpage} - logging & haul $${formatRate(cost)} = $${formatRate(margin)}/m³ margin -> ${formatSignedDollars(revenue)}`;
  const chargesLine = `Overhead -$${ledger.overhead.toLocaleString()}${certCost ? ` · certification -$${certCost.toLocaleString()}` : ''}${standby ? ` · standby -$${standby.toLocaleString()}` : ''}`;
  const netLine = `Net ${formatSignedDollars(net)} -> treasury $${Math.round(journey.resources.budget).toLocaleString()}`;
  ui.write(deliveredLine);
  ui.write(marginLine);
  ui.write(chargesLine);
  if (net >= 0) ui.writeSuccess(netLine); else ui.writeWarning(netLine);

  // The Log keeps every month's ledger after the screen has moved on.
  journey.log.push({
    day: month,
    type: 'ledger',
    summary: `${monthName(month)} ledger: ${delivered.toLocaleString()} m³, net ${formatSignedDollars(net)}`,
    detail: `${marginLine}. ${chargesLine}. Treasury $${Math.round(journey.resources.budget).toLocaleString()}; ${Math.round(ledger.deliveredYtd).toLocaleString()} / ${ledger.aac.toLocaleString()} m³ AAC year to date.`,
  });

  // Budget health: the treasury against where the year started.
  journey.metrics.budget = clampPercentValue(Math.round(50 + ((journey.resources.budget - ledger.startTreasury) / ledger.startTreasury) * 50));
  if (journey.resources.budget <= 0) {
    ui.writeDanger('The treasury is empty. The bank calls the covenant.');
  }
}

/**
 * Certification audits: registration in May for a newly booked standard
 * (a failure earns one re-audit in October), surveillance in October for a
 * held certificate. The requirements are the meters the auditors read.
 */
function runCertificationAudits(ui, journey) {
  const month = journey.day;
  for (const cert of journey.certifications || []) {
    const status = certificationStatus(cert);
    const registration = month === REGISTRATION_AUDIT_MONTH && status === 'pending';
    const surveillance = month === SURVEILLANCE_AUDIT_MONTH && ['certified', 'corrective'].includes(status);
    if (!registration && !surveillance) continue;

    const checks = certificationRequirements(cert).map(([metric, minimum]) => {
      const value = Math.round(journey.metrics[metric] ?? 50);
      return { metric, minimum: Number(minimum), value, pass: value >= Number(minimum) };
    });
    const passed = checks.every((check) => check.pass);
    const kind = status === 'certified' ? 'surveillance audit' : status === 'corrective' ? 're-audit' : 'registration audit';
    const bonus = Math.round((Number(cert.reputation_bonus) || 0) * 100);
    const premium = certificationPremium(journey.ledger, cert);

    ui.write('');
    ui.writeDivider(`${cert.id} ${kind.toUpperCase()}`);
    if (checks.length) {
      ui.write(checks.map((check) => `${capitalize(REQUIREMENT_LABELS[check.metric])} ${check.value}% (needs ${check.minimum}%) ${check.pass ? 'pass' : 'FAIL'}`).join(' · '));
    }

    let result;
    if (passed && status !== 'certified') {
      cert.status = 'certified';
      adjustMetric(journey, 'reputation', bonus);
      result = `Certificate issued. Certified fibre earns +$${formatRate(premium)}/m³ from next month; reputation +${bonus}.`;
      ui.writeSuccess(result);
    } else if (passed) {
      result = 'No major non-conformities. The certificate holds for another year.';
      ui.writeSuccess(result);
    } else if (status === 'pending') {
      cert.status = 'corrective';
      result = `Major non-conformity: no certificate yet. The auditors issue a corrective-action request and come back in ${monthName(SURVEILLANCE_AUDIT_MONTH)}. The annual fee runs either way.`;
      ui.writeWarning(result);
    } else if (status === 'corrective') {
      cert.status = 'withdrawn';
      adjustMetric(journey, 'reputation', -CERT_LOSS_REPUTATION);
      result = `The re-audit fails. The application is withdrawn and the system cost is sunk; reputation -${CERT_LOSS_REPUTATION}.`;
      ui.writeDanger(result);
    } else {
      cert.status = 'suspended';
      adjustMetric(journey, 'reputation', -(bonus + CERT_LOSS_REPUTATION));
      result = `Certificate suspended. The premium stops and the buyers get the letter; reputation -${bonus + CERT_LOSS_REPUTATION}.`;
      ui.writeDanger(result);
    }

    cert.audits = [...(cert.audits || []), { month, kind, passed }];
    journey.log.push({
      day: month,
      type: 'audit',
      summary: `${cert.id} ${kind}: ${passed ? 'passed' : 'failed'}`,
      detail: result,
    });
  }
}

/**
 * Year end: the cut-control statement against the AAC. The status it
 * records decides the year (js/modes/shared/endConditions.js) and the grade
 * (js/scoring.js), so the statement says what it costs in plain numbers.
 */
function runCutControl(ui, journey) {
  const ledger = ensureLedger(journey);
  if (ledger.cutControl) return;
  const delivered = Math.round(ledger.deliveredYtd);
  const ratio = ledger.aac ? ledger.deliveredYtd / ledger.aac : 1;
  const pct = formatCutPercent(ratio);
  const status = classifyCutControl(ratio);
  const band = `${Math.round(CUT_CONTROL.bandLow * 100)}-${Math.round(CUT_CONTROL.bandHigh * 100)}%`;
  const statementOf = `${delivered.toLocaleString()} of ${ledger.aac.toLocaleString()} m³ (${pct})`;
  let statement;

  ui.write('');
  ui.writeDivider('CUT-CONTROL STATEMENT');
  if (status === 'undercut' || status === 'severe_undercut') {
    const short = Math.round(ledger.aac * CUT_CONTROL.bandLow - ledger.deliveredYtd);
    ledger.cutControl = `undercut ${pct}`;
    adjustPoliticalCapital(journey, status === 'severe_undercut' ? -8 : -4);
    adjustMetric(journey, 'reputation', status === 'severe_undercut' ? -6 : -3);
    statement = `Undercut: ${statementOf}, below the ${band} band. ${short.toLocaleString()} m³ short of the floor is lost to the cut-control period, and the board reads it as margin left in the bush.`;
    if (status === 'severe_undercut') {
      statement += ` Below ${Math.round(CUT_CONTROL.limitLow * 100)}%, the board stops reading it as a bad year.`;
    }
    ui.writeWarning(statement);
  } else if (status === 'overcut' || status === 'severe_overcut') {
    const excess = Math.round(ledger.deliveredYtd - ledger.aac * CUT_CONTROL.bandHigh);
    const penalty = excess * CUT_CONTROL.overcutPenaltyPerM3;
    ledger.cutControl = `overcut ${pct}`;
    ledger.overcutPenalty = penalty;
    adjustMetric(journey, 'compliance', status === 'severe_overcut' ? -12 : -8);
    journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + (status === 'severe_overcut' ? 10 : 6));
    journey.resources.budget = Math.max(0, journey.resources.budget - penalty);
    statement = `Overcut: ${statementOf}, past the ${Math.round(CUT_CONTROL.bandHigh * 100)}% ceiling. C&E opens a file; the penalty on ${excess.toLocaleString()} m³ is $${penalty.toLocaleString()} at $${CUT_CONTROL.overcutPenaltyPerM3}/m³, more than the wood earned. Treasury $${Math.round(journey.resources.budget).toLocaleString()}.`;
    if (status === 'severe_overcut') {
      statement += ` Past ${Math.round(CUT_CONTROL.limitHigh * 100)}%, the District Manager's letter copies the board chair.`;
    }
    ui.writeWarning(statement);
  } else {
    ledger.cutControl = `within band ${pct}`;
    adjustPoliticalCapital(journey, 3);
    adjustMetric(journey, 'compliance', 2);
    statement = `Cut control: ${statementOf}, inside the ${band} band. The statement goes to the District Manager without a covering letter.`;
    ui.writeSuccess(statement);
  }

  ledger.cutControlStatus = status;
  ledger.cutControlStatement = statement;
  journey.log.push({ day: lastLedgerMonth(journey), type: 'cut_control', summary: `Cut-control statement: ${ledger.cutControl}`, detail: statement });
}

/**
 * The posture's quarterly initiative: what the woodlands team does with it on
 * its own, every third month.
 */
function applyPostureInitiative(ui, journey) {
  if (!journey.ceo || journey.day % 3 !== 0) return;
  const quarterly = journey.ceo.quarterly || getOperatingPosture(journey.ceo.id).quarterly || {};
  const parts = [];
  for (const [key, delta] of Object.entries(quarterly)) {
    adjustMetric(journey, key, delta);
    parts.push(`${METRIC_LABELS[key] || key} ${delta > 0 ? '+' : ''}${delta}`);
  }
  if (!parts.length) return;
  ui.writeInfo(`${capitalize(journey.ceo.name)} runs the quarter on the ${journey.ceo.posture || 'chosen'} posture: ${parts.join(', ')}.`);
}

/**
 * Whether the quarter the board is reading is a weak one: deliveries short
 * of the seasonal plan, or the meters sliding on more than one front. One
 * bad meter is a normal quarter, and breakup is in the plan.
 */
function readQuarter(journey, baseline, quarterMonths) {
  const reasons = [];
  const planned = quarterMonths.reduce((sum, entry) => sum + (entry.planned || 0), 0);
  const delivered = quarterMonths.reduce((sum, entry) => sum + (entry.delivered || 0), 0);
  if (planned > 0 && delivered < planned * 0.9) {
    reasons.push(`deliveries ${Math.round((delivered / planned) * 100)}% of plan`);
  }
  const falling = Object.entries(METRIC_LABELS)
    .filter(([key]) => Math.round(journey.metrics[key] ?? 50) - Math.round(baseline[key] ?? 50) <= -3)
    .map(([, label]) => label.toLowerCase());
  if (falling.length >= 2) reasons.push(`${falling.join(', ')} down`);
  return { weak: reasons.length > 0, reasons };
}

/**
 * Quarterly board review after months 3, 6, 9 and 12.
 *
 * Honesty is the strategy that holds up: a transparent report of a weak
 * quarter costs nothing on reputation and cools scrutiny. Spin buys a quarter
 * of reputation on credit - every weak quarter spun goes into the year-end
 * audit, which reconciles the decks against the audited statements.
 */
async function runBoardReview(game, monthClosed) {
  const { journey, ui } = game;
  const baseline = journey.flags.boardBaseline || { ...journey.metrics };
  const quarter = Math.max(1, Math.min(4, Math.ceil(monthClosed / 3)));
  const ledger = journey.ledger || {};

  ui.clear();
  ui.writeHeader(`QUARTERLY BOARD REVIEW - Q${quarter} (${monthName(monthClosed).toUpperCase()} CLOSE)`);
  ui.write("The directors assemble. Coffee is poured. Someone has printed the deck single-sided again.");
  ui.write("");

  ui.writeDivider("METRICS SINCE LAST REVIEW");
  if (typeof ui.playScene === "function") {
    await ui.playScene(buildBoardChartFrames(
      Object.entries(METRIC_LABELS).map(([key, label]) => ({
        label,
        value: journey.metrics[key] ?? 50,
      }))
    ), { delay: 110 });
  }
  for (const [key, label] of Object.entries(METRIC_LABELS)) {
    const before = Math.round(baseline[key] ?? 50);
    const now = Math.round(journey.metrics[key] ?? 50);
    const delta = now - before;
    ui.write(`${label}: ${before} -> ${now} (${delta > 0 ? "+" : ""}${delta})`);
  }

  ui.writeDivider("THE QUARTER'S LEDGER");
  const firstMonth = (quarter - 1) * 3 + 1;
  const quarterMonths = (ledger.months || []).filter((entry) => entry.month >= firstMonth && entry.month <= monthClosed);
  for (const entry of quarterMonths) {
    ui.write(`${monthName(entry.month)}: ${entry.delivered.toLocaleString()} m³ (plan ${Math.round(entry.planned || 0).toLocaleString()}) at $${formatRate(entry.margin)}/m³, net ${formatSignedDollars(entry.net)}`);
  }
  const quarterNet = quarterMonths.reduce((sum, entry) => sum + (entry.net || 0), 0);
  const quarterVolume = quarterMonths.reduce((sum, entry) => sum + (entry.delivered || 0), 0);
  ui.write(
    `Treasury: $${Math.round(journey.resources.budget).toLocaleString()}`
    + ` | Quarter: ${quarterVolume.toLocaleString()} m³, net ${formatSignedDollars(quarterNet)}`
    + ` | YTD ${Math.round(ledger.deliveredYtd || 0).toLocaleString()} / ${(ledger.aac || 0).toLocaleString()} m³`
    + ` | Political Capital: ${Math.round(journey.resources.politicalCapital)}`,
  );
  if (quarter === 4 && ledger.cutControlStatement) {
    ui.write('');
    ui.writeDivider('CUT-CONTROL STATEMENT');
    ui.write(ledger.cutControlStatement);
  }
  const reading = readQuarter(journey, baseline, quarterMonths);
  ui.write('');
  ui.write(reading.weak
    ? `The directors read it as a weak quarter: ${reading.reasons.join('; ')}.`
    : 'The directors read it as a sound quarter.');
  ui.write("");

  const choice = await ui.promptChoice("The chair asks how the quarter really went:", [
    {
      label: "Full transparency",
      description: "Table the real numbers, including the ugly ones. Scrutiny eases",
      value: "transparent",
    },
    {
      label: "Spin the narrative",
      description: "Lead with wins, bury the misses in appendix C. The year-end audit reads appendix C",
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
      journey.scrutiny = clampPercentValue((journey.scrutiny || 0) - 4);
      if (reading.weak) {
        ui.write("The board respects the honesty more than they enjoy it. The audit committee nods, and nobody has to find the bad news for themselves.");
      } else {
        adjustMetric(journey, "reputation", 3);
        ui.write("Good numbers, honestly told. The rarest deck in forestry. The chair almost smiles.");
      }
      break;
    case "spin":
      adjustPoliticalCapital(journey, -2);
      if (reading.weak) {
        adjustMetric(journey, "reputation", 4);
        journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + 6);
        journey.flags.boardSpunQuarters = [...(journey.flags.boardSpunQuarters || []), quarter];
        ui.write("The quarter sounds magnificent. Two directors take notes for later, which is never decorative.");
      } else {
        adjustMetric(journey, "reputation", 2);
        journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + 3);
        ui.write("A good quarter, gilded anyway. The chair wonders aloud what the gilding is for.");
      }
      break;
    default:
      adjustPoliticalCapital(journey, -4);
      adjustMetric(journey, "relationships", -3);
      journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + 3);
      ui.write("The board's analysts have the same spreadsheets you do. The deflection is noted, in the minutes, verbatim.");
      break;
  }

  if (quarter === 4) runYearEndAudit(ui, journey);

  journey.flags.boardBaseline = { ...journey.metrics };
  journey.log.push({
    day: journey.day,
    type: "board_review",
    threshold: quarter * 25,
    quarter,
    stance: choice.value,
    summary: `Q${quarter} board review (${choice.value}${reading.weak ? ', weak quarter' : ''})`,
  });

  if (quarter < 4) {
    ui.write('');
    await runCutSchedule(game, `Cut schedule for Q${quarter + 1}:`);
  }

  ui.write("");
  await ui.promptChoice("", [{ label: "Adjourn the meeting", value: "next" }]);
}

/**
 * The audited year-end statements against the quarterly decks. Each weak
 * quarter that was spun is a restatement risk; the auditors are likelier to
 * find it the more the file is already being watched.
 */
function runYearEndAudit(ui, journey) {
  const spun = journey.flags.boardSpunQuarters || [];
  if (!spun.length || journey.flags.yearEndAuditDone) return;
  journey.flags.yearEndAuditDone = true;
  const catchChance = Math.min(0.9, 0.45 + (journey.scrutiny || 0) / 250);
  const caught = spun.filter(() => Math.random() < catchChance);
  ui.write('');
  ui.writeDivider('AUDITED YEAR-END STATEMENTS');
  if (!caught.length) {
    ui.writeInfo(`The auditors reconcile the year to the decks and let appendix C stand. ${spun.length === 1 ? 'The spun quarter survives' : `All ${spun.length} spun quarters survive`}, this time.`);
    return;
  }
  const reputationCost = caught.length * 8;
  adjustMetric(journey, 'reputation', -reputationCost);
  adjustPoliticalCapital(journey, -3 * caught.length);
  ui.writeDanger(`The management letter reconciles the audited statements to the quarterly decks and restates ${caught.map((q) => `Q${q}`).join(', ')}. The board learns the quarter from the auditors instead of from you: reputation -${reputationCost}.`);
  journey.log.push({ day: journey.day, type: 'audit', summary: `Year-end audit restated ${caught.map((q) => `Q${q}`).join(', ')}`, detail: `Reputation -${reputationCost}.` });
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
