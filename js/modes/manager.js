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
import { getDayRng } from '../events/dayRng.js';
import { describeEffectChips } from '../events/display.js';
import { describeShortcutStakes } from '../events/selection.js';
import { runDaySituation } from '../journey/daySituation.js';
import { formatStatusLine } from '../journey/dayCard.js';
import { buildBoardChartFrames } from "../scene/textmode/scenes.js";
import { getOperationalProgress, recordProgressMilestones } from "../journey.js";
import { SEASONS } from "../season.js";
import { formatDollars } from "../resources.js";
import {
  OPERATING_POSTURES,
  getOperatingPosture,
  CUT_CONTROL,
  classifyCutControl,
  formatCutPercent,
  HARVEST_PACES,
  getHarvestPace,
  DELIVERY_CURVES,
  getAreaEconomics,
  MANAGER_EXECUTIVE_ROLES,
} from "../data/managerRoles.js";
import { FIRST_NAMES } from '../data/crewNames.js';

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

// Seasonal delivery curve against the monthly plan. The operating area sets
// its shape (DELIVERY_CURVES in js/data/managerRoles.js); saves from before
// area economics run on the interior curve: breakup in March-April, summer
// fire season, the winter push.
function deliveryCurve(ledger) {
  return Array.isArray(ledger?.seasonalCurve) && ledger.seasonalCurve.length === 12
    ? ledger.seasonalCurve
    : DELIVERY_CURVES.interior;
}

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
 *
 * A hook tagged with a `band` lands only when the outcome the player read is
 * that band's (see shownBand): a lost BCTS bid used to book the sale's volume
 * and stumpage anyway. An untagged hook lands whichever way the option goes.
 * An option with several hooks lists them.
 */
const LEDGER_HOOKS = {
  gm_mill_curtailment: [
    { curtailment: 0.55, note: 'mill curtailment - crews parked' },
    { curtailment: 1, note: 'logging through the curtailment, wood decked' },
    // The diversion lasts as long as the curtailment: one month's haul, not the year's.
    { curtailment: 0.85, monthCostShift: 4, note: 'volume diverted to pulp and a second sawmill for the month' },
  ],
  gm_bcts_bid: [
    { band: 'good', bonusVolume: 9000, bonusSource: 'the BCTS sale', stumpageShift: 1, note: 'BCTS sale won at appraisal plus bonus' },
    { bonusVolume: 12000, bonusSource: 'the BCTS sale', stumpageShift: 3, note: 'BCTS sale won on a high bid' },
    {},
  ],
  gm_softwood_duty_deposit: [
    { priceShift: -4, note: 'log supply agreement re-priced' },
    [
      { band: 'good', priceShift: -1, note: 'volume shopped to other mills' },
      // "You go back with less leverage than you left with": the customer's price.
      { band: 'bad', priceShift: -4, note: 'back to the customer at the lower price' },
    ],
    { priceShift: -2, note: 'three-year supply agreement' },
  ],
  gm_fn_revenue_sharing: [
    { costShift: 2, note: 'revenue-sharing per m³ on territory volume' },
    // A counter that reads as bad faith signs nothing.
    { band: 'good', costShift: 1.5, note: 'revenue-sharing at the countered rate' },
    {},
  ],
  gm_contractor_rate_renegotiation: [
    { costShift: 2.5, note: 'fuel-indexed logging rate' },
    [
      { band: 'good', costShift: 2, note: 'rate mediation' },
      // "Delivery slips ... the rate you eventually sign is higher than the one you refused."
      { band: 'bad', costShift: 3, curtailment: 0.9, note: 'processor pulled, then the rate mediation' },
    ],
    { costShift: 3, note: 'three-year logging contract with SAFE clause' },
  ],
  gm_log_export_permit: [
    // A failed surplus test sells the parcel domestic, like the second option.
    { band: 'good', bonusVolume: 1500, bonusSource: 'the export parcel', note: 'export parcel moved' },
    {},
    { band: 'good', bonusVolume: 1500, bonusSource: 'the export parcel', note: 'export parcel shipped ahead of the permit' },
  ],
};

/**
 * Executives a card's outcome says leave the company, keyed by event id and
 * option index, with the band whose text says so. The card said "the
 * resignation letter arrives inside the month" and the woodlands manager
 * stayed in the job; now the seat is filled by an acting successor, who
 * carries the posture for the rest of the year.
 */
const EXECUTIVE_DEPARTURES = {
  gm_executive_poaching: { 0: { band: 'bad', role: 'woodlands' }, 1: { band: 'bad', role: 'woodlands' } },
};

/**
 * Operations on a card, in wood. The shared decks move a generic `progress`
 * meter a desk-sized amount ("a week of files"); the GM's ops meter used to
 * scale the whole company's run rate by it, so one +8 added 18,000 m³ to the
 * year and one -8 took 26,000 m³ off it, printed nowhere. At head office a
 * point of operations is a quarter of a truck-week on this month's
 * deliveries, and a card moves at most a few days of haul.
 */
const OPS_POINT_M3 = 250;
const OPS_CARD_CAP_M3 = 2500;

function opsVolume(points) {
  const volume = Math.round((Number(points) || 0) * OPS_POINT_M3);
  return Math.max(-OPS_CARD_CAP_M3, Math.min(OPS_CARD_CAP_M3, volume));
}

/**
 * Events that only make sense for some licensees. The shared pipeline has no
 * notion of a held certificate, so the manager runner drops a draw that does
 * not fit rather than serve a surveillance audit to an uncertified company.
 */
const MANAGER_EVENT_GATES = {
  gm_certification_audit_prep: (journey) => activeCertifications(journey).length > 0,
  // A department head's budget fight "with the CEO's ear": the GM is the
  // executive the woodlands manager would be lobbying.
  competing_budget_claim: () => false,
};

// BC's fire season runs roughly May to September; smoke from fires to the
// south settles into the valleys late in it. Atmospheric rivers are an
// autumn and winter coast storm; ice bridges exist only in deep winter.
const FIRE_SEASON = [5, 6, 7, 8, 9];
const STORM_SEASON = [10, 11, 12, 1, 2];
const ICE_ROAD_SEASON = [12, 1, 2, 3];

/**
 * Months a card can land in. The shared decks gate on a coarse `seasons`
 * field, and most of these carry none, so the GM drew an approaching
 * wildfire in December and a smoke inversion in March. The GM plays every
 * month of the calendar, so the gate is by month here.
 */
const MANAGER_MONTH_GATES = {
  wildfire_threat: FIRE_SEASON,
  'smoke-inversion_field': [7, 8, 9],
  'salmon-crossing-washout_field': STORM_SEASON,
  'salmon-crossing-washout_desk': STORM_SEASON,
  'ice-road-window_field': ICE_ROAD_SEASON,
  'ice-road-window_desk': ICE_ROAD_SEASON,
};
// Any other fire or smoke card that reaches the GM: gated to the fire season by its title.
const FIRE_CARD_TITLE = /wildfire|smoke|fire weather|heat dome/i;

function eventFitsMonth(event, month) {
  const months = MANAGER_MONTH_GATES[event.id]
    || (event.type !== 'temptation' && FIRE_CARD_TITLE.test(event.title || '') ? FIRE_SEASON : null);
  return !months || months.includes(month);
}

/**
 * Shared-library shortcuts written for a woodlot licensee, a community
 * forest's manager or a consulting registrant, or that need a situation a
 * GM's year never has. This GM runs a 240,000 m³ replaceable licence with a
 * board: no client, no council seat, no retired-status side business, and no
 * blockade on the road for a contractor to intimidate. They are struck from
 * the journey's draw before it happens (the act library has no tenure-size
 * gate); striking them after the draw would cost the month its offer.
 */
const UNFIT_TEMPTATION_ACTS = [
  'woodlot-overcut-gambit',
  'community-forest-coasting',
  'wear-every-hat',
  'drop-the-ret-from-the-signature',
  'recce-harass-protesters',
];

function retireUnfitTemptations(journey) {
  const memory = journey.temptationMemory || (journey.temptationMemory = {});
  if (!Array.isArray(memory.seenActIds)) memory.seenActIds = [];
  for (const id of UNFIT_TEMPTATION_ACTS) {
    if (!memory.seenActIds.includes(id)) memory.seenActIds.push(id);
  }
}

/**
 * Options the shared desk deck writes for a line manager that mean
 * something else at a licensee's head office. Keyed by event id and option
 * index; the override replaces the option for the GM only.
 */
const MANAGER_OPTION_OVERRIDES = {
  'labour-job-action_desk': {
    2: {
      label: 'Call the bluff and line up replacement crews',
      outcome: 'Labour-relations counsel reads you section 68 of the Labour Relations Code before the first call goes out: replacement workers cannot be used in a legal strike in BC. The union hears about the plan anyway, takes a strike vote, and the slowdown starts on schedule.',
      effects: { budget: -25000, progress: -6, relationships: -4, politicalCapital: -4, reputation: -3 },
    },
  },
};

/** What a ledger hook does to the rest of the year, in the ledger's own units. */
function describeLedgerHook(hook) {
  const parts = [];
  if (hook.costShift) parts.push(`logging & haul +$${formatRate(hook.costShift)}/m³ for the rest of the year`);
  if (hook.stumpageShift) parts.push(`stumpage +$${formatRate(hook.stumpageShift)}/m³ for the rest of the year`);
  if (hook.priceShift) parts.push(`log price ${hook.priceShift > 0 ? '+' : '-'}$${formatRate(Math.abs(hook.priceShift))}/m³, easing back over the months`);
  if (hook.bonusVolume) parts.push(`+${hook.bonusVolume.toLocaleString()} m³ on this month's cut`);
  if (hook.curtailment && hook.curtailment < 1) parts.push(`this month's deliveries at ${Math.round(hook.curtailment * 100)}% of plan`);
  if (hook.monthCostShift) parts.push(`+$${formatRate(hook.monthCostShift)}/m³ haul this month`);
  if (hook.opsVolume) parts.push(`${hook.opsVolume > 0 ? '+' : '-'}${Math.abs(hook.opsVolume).toLocaleString()} m³ on this month's deliveries`);
  return parts.join(', ');
}

const OUTCOME_BANDS = ['good', 'partial', 'bad'];
const BAND_EFFECT_KEYS = { good: 'effects', partial: 'partialEffects', bad: 'failureEffects' };

/**
 * The band whose outcome text the player reads when the roll lands on
 * `band`: a partial or bad band with nothing of its own authored reads the
 * next one down (js/events/odds.js resolveOutcomeBand).
 */
function shownBand(option, band) {
  if (band === 'partial' && option.partialOutcome) return 'partial';
  if (band !== 'good' && option.failureOutcome) return 'bad';
  return 'good';
}

/** The effects a band applies, with the same fallbacks the resolver uses. */
function bandEffects(option, band) {
  if (band === 'partial') return option.partialEffects || option.failureEffects || option.effects;
  if (band === 'bad') return option.failureEffects || option.effects;
  return option.effects;
}

function withoutProgress(effects) {
  if (!effects || typeof effects.progress !== 'number') return effects;
  const { progress: _progress, ...rest } = effects;
  return rest;
}

/**
 * What each band of an option does to the ledger: the authored hooks for the
 * band the player reads, and the card's operations as this month's wood.
 * Cards with an authored hook table carry their operations in the hooks (a
 * curtailment, a sale), so their `progress` is not counted twice.
 */
function ledgerByBand(option, authored, hookedEvent) {
  const hooks = (Array.isArray(authored) ? authored : [authored]).filter(Boolean);
  const byBand = {};
  for (const band of OUTCOME_BANDS) {
    const shown = shownBand(option, band);
    const hook = {};
    for (const { band: only, ...fields } of hooks) {
      if (!only || only === shown) Object.assign(hook, fields);
    }
    const ops = hookedEvent ? 0 : opsVolume(bandEffects(option, band)?.progress);
    if (ops) hook.opsVolume = ops;
    byBand[band] = hook;
  }
  return byBand;
}

/**
 * The ledger chip: one line when every band lands the same, else what it
 * does if it lands and if it does not. Only the bands the option can roll.
 */
function describeLedgerBands(option, byBand) {
  const risky = typeof option.chanceSuccess === 'number';
  const bands = !risky ? ['good'] : typeof option.chancePartial === 'number' ? OUTCOME_BANDS : ['good', 'bad'];
  const text = Object.fromEntries(bands.map((band) => [band, describeLedgerHook(byBand[band])]));
  if (bands.every((band) => text[band] === text.good)) return text.good ? `ledger: ${text.good}` : '';
  const phrase = bands.length === 3
    ? { good: 'if clean', partial: 'if partly wrong', bad: 'if badly wrong' }
    : { good: 'if it lands', bad: 'if not' };
  return `ledger ${bands.map((band) => `${phrase[band]}: ${text[band] || 'nothing'}`).join('; ')}`;
}

/**
 * The GM's operations on a generic card, as this month's wood (see
 * OPS_POINT_M3), and the executive seats kept: a card's "someone leaves" is
 * somebody below the executive team, so it does not empty a seat at random.
 */
function fitOperations(option, authored, hookedEvent) {
  const hasProgress = ['effects', 'partialEffects', 'failureEffects'].some((key) => typeof option[key]?.progress === 'number');
  const leaves = (effect) => Boolean(effect?.lose_member || effect?.leave);
  const crewKeys = ['crewEffect', 'partialCrewEffect', 'failureCrewEffect'].filter((key) => leaves(option[key]));
  if (!hasProgress && !authored && !crewKeys.length) return option;

  const byBand = ledgerByBand(option, authored, hookedEvent);
  const fitted = { ...option };
  for (const key of Object.values(BAND_EFFECT_KEYS)) {
    if (option[key]) fitted[key] = withoutProgress(option[key]);
  }
  for (const key of crewKeys) {
    const { lose_member: _lose, leave: _leave, ...rest } = option[key];
    fitted[key] = Object.keys(rest).length ? rest : undefined;
  }
  if (OUTCOME_BANDS.some((band) => Object.keys(byBand[band]).length)) {
    fitted.managerLedger = byBand;
    const hint = describeLedgerBands(option, byBand);
    if (hint) fitted.ledgerHint = hint;
  }
  return fitted;
}

/**
 * This month's margin per m³ at today's prices and costs: what a cubic metre
 * more or less on the month's deliveries is worth to the treasury.
 */
function currentMarginPerM3(journey) {
  const ledger = ensureLedger(journey);
  const premium = earningCertifications(journey).reduce((sum, cert) => sum + certificationPremium(ledger, cert), 0);
  const cost = ledger.loggingHaul + (Number(journey.ceo?.costPerM3) || 0) + (ledger.costShiftPerM3 || 0) + getHarvestPace(ledger.pace).costPerM3;
  return Math.max(5, ledger.logPrice + premium - stumpageRate(ledger) - cost);
}

/**
 * A shortcut's operations, in the GM's own currency. The shortcut card reads
 * its gain and each band's cost off the option's effects (js/events/
 * selection.js describeShortcutStakes), so the wood a shortcut buys or a
 * stop-work costs is booked as the margin on it, at today's margin: "+8
 * progress" was worth $400k at one ops reading and nothing at another.
 */
function priceShortcutOperations(journey, option) {
  const price = (effects) => {
    if (typeof effects?.progress !== 'number') return effects;
    const { progress, ...rest } = effects;
    const dollars = Math.round((opsVolume(progress) * currentMarginPerM3(journey)) / 500) * 500;
    if (dollars) rest.budget = (Number(rest.budget) || 0) + dollars;
    return rest;
  };
  const keys = Object.values(BAND_EFFECT_KEYS).filter((key) => typeof option[key]?.progress === 'number');
  const fallout = typeof option.failureFallout?.effects?.progress === 'number';
  if (!keys.length && !fallout) return option;
  const fitted = { ...option };
  for (const key of keys) fitted[key] = price(option[key]);
  if (fallout) fitted.failureFallout = { ...option.failureFallout, effects: price(option.failureFallout.effects) };
  return fitted;
}

/** A shortcut card's stakes, restated from its fitted options. */
function restateShortcutStakes(journey, event) {
  if (event.temptationStage === 'fallout') {
    const costs = describeEffectChips(event.options?.[0]?.effects || {}, 'manager').join(', ');
    return costs ? [`What it costs: ${costs}.`] : [];
  }
  const shortcut = (event.options || []).find((option) => option.liveOdds);
  return shortcut && Array.isArray(event.stakes) ? describeShortcutStakes(shortcut, journey) : event.stakes;
}

/**
 * The drawn card as the GM should see it, or null when it does not belong
 * in this month or at this desk. Options with a ledger hook say on their
 * chip what they do to the ledger for the rest of the year; the resolver
 * alone would print only the one-off budget line. A card's operations land
 * as this month's wood (or, on a shortcut, its margin), never on the run
 * rate of the whole licence.
 */
export function fitManagerEvent(journey, event) {
  if (!event) return null;
  if (MANAGER_EVENT_GATES[event.id] && !MANAGER_EVENT_GATES[event.id](journey)) return null;
  if (!eventFitsMonth(event, journey.day)) return null;
  const overrides = MANAGER_OPTION_OVERRIDES[event.id];
  const hooks = LEDGER_HOOKS[event.id];
  const departures = EXECUTIVE_DEPARTURES[event.id];
  const shortcut = event.type === 'temptation';
  let changed = false;
  const options = (event.options || []).map((option, index) => {
    let fitted = overrides?.[index] ? { ...option, ...overrides[index] } : option;
    fitted = shortcut ? priceShortcutOperations(journey, fitted) : fitOperations(fitted, hooks?.[index], Boolean(hooks));
    if (departures?.[index]) fitted = { ...fitted, executiveDeparture: departures[index] };
    if (fitted !== option) changed = true;
    return fitted;
  });
  if (!changed) return event;
  const fitted = { ...event, options };
  if (shortcut) fitted.stakes = restateShortcutStakes(journey, fitted);
  return fitted;
}

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

  writeCertificationWatch(ui, journey);

  await maybeFlagCutProjection(game);

  await runStrategicDecision(game);

  retireUnfitTemptations(journey);
  const event = fitManagerEvent(journey, journey.day > 1 ? checkForEvent(journey) : null);
  if (event) {
    // The card clears the screen: hold the decision's result until it has been read.
    await ui.promptChoice('', [{
      label: 'Continue to the desk',
      description: 'Something has landed that needs the GM.',
      value: 'next',
    }]);
    const monthsLeft = Math.max(0, (journey.deadline || 0) - journey.day);
    const logBefore = journey.log.length;
    const outcome = await runDaySituation(game, event, {
      frame: {
        dayHeader: `${monthName(journey.day).toUpperCase()} - MONTH ${journey.day}/${journey.deadline} - GENERAL MANAGER`,
        statusLine: formatStatusLine([
          `${formatDollars((journey.resources.budget || 0) / 1000)}k treasury`,
          `${Math.round(journey.ledger.deliveredYtd).toLocaleString()} m³ delivered YTD`,
          monthsLeft > 0 ? `${monthsLeft} month${monthsLeft === 1 ? '' : 's'} left after this one` : 'last month of the year',
        ]),
        onRender: () => updateManagerMissionStatus(ui, journey),
      },
      // Setting a proposal aside is leaving it unanswered, not handing it to
      // someone; setting a situation aside leaves it where it landed.
      setAsideDescription: event.type === 'temptation'
        ? 'Leave the proposal unanswered for now.'
        : 'Leave it with the division and keep the month for the business.',
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
 * The month's own dice (js/events/dayRng.js), keyed by what they are for.
 * The ledger and the year-end audit used to roll Math.random, so reloading
 * the month re-rolled the volume, the log price and the restatement. `month`
 * names the month the roll belongs to: the year-end audit runs after the
 * calendar has turned past December, but it is December's roll.
 */
function monthRng(journey, label, month = journey.day) {
  return getDayRng({ daySeed: journey.daySeed, day: month }, label);
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
  const area = applyAreaEconomics(journey);

  ui.clear();
  ui.writeHeader(`GENERAL MANAGER - MONTH ${journey.day}/${journey.deadline} - OPERATING PLAN`);
  ui.write(`January. The woodlands team is in the boardroom with the cut plan, the stumpage forecast and last year's cut-control statement${woodlands ? `; ${woodlands.name}, your woodlands manager, has the floor` : ''}.`);
  ui.write('');
  ui.write(`AAC ${ledger.aac.toLocaleString()} m³ · plan ${ledger.monthlyPlan.toLocaleString()} m³/month · log price $${ledger.logPrice}/m³ · stumpage $${ledger.stumpage} (tracks the market) · logging & haul $${ledger.loggingHaul} · overhead $${ledger.overhead.toLocaleString()}/month · treasury ${formatDollars(journey.resources.budget)}`);
  ui.write(area.market);
  ui.write(`Cut control is judged in December: ${Math.round(CUT_CONTROL.bandLow * 100)}-${Math.round(CUT_CONTROL.bandHigh * 100)}% of the AAC goes in clean. Outside it the statement carries a finding, with a C&E penalty of $${CUT_CONTROL.overcutPenaltyPerM3}/m³ past the ceiling. Below ${Math.round(CUT_CONTROL.limitLow * 100)}% or above ${Math.round(CUT_CONTROL.limitHigh * 100)}%, the board ends your term.`);
  if (cfo) ui.write(`${cfo.name} (CFO) notes that ${area.gaps}, and the overhead does not move.`);
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
    quarterlyScrutiny: posture.quarterlyScrutiny || 0,
    quarterlyMorale: posture.quarterlyMorale || 0,
    deferredSilviculturePerM3: posture.deferredSilviculturePerM3 || 0,
  };
  ui.writeSuccess(`Operating posture set: ${posture.name}. ${woodlands ? `${woodlands.name} takes it to the contractors.` : ''}`);
  ui.write('');

  // Certification: booked now, earned at the registration audit in May.
  const certOptions = certificationsData.certifications.map((cert) => ({
    label: `${cert.name} - $${cert.initial_cost.toLocaleString()} up front, $${cert.annual_cost.toLocaleString()}/yr, +$${formatRate(certificationPremium(ledger, cert))}/m³ once certified`,
    value: cert.id,
    hint: `${monthName(REGISTRATION_AUDIT_MONTH)} audit wants ${describeRequirements(cert)}. ${cert.description}`,
  }));
  // A standard costs more than its premium earns in the year it is booked;
  // what it buys is the certificate, the reputation and the buyers. Skipping
  // keeps head office lean and the auditors away.
  certOptions.push({
    label: "Skip certification for now",
    value: "none",
    hint: 'No system to run and no auditors this year: the treasury keeps what a standard costs, and there is no audit to fail. The buyers who want certified fibre keep asking.',
  });

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
  // The Q1 board reads January's ledger too, so its baseline is taken before it.
  journey.flags.boardBaseline = { ...journey.metrics };
  runMonthlyLedger(ui, journey, { carryIn: true });

  journey.flags.managerInitComplete = true;
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
  const signed = (delta) => `${delta > 0 ? '+' : ''}${delta}`;
  const quarterly = [
    ...Object.entries(posture.quarterly || {}).map(([key, delta]) => `${(METRIC_LABELS[key] || key).toLowerCase()} ${signed(delta)}`),
    posture.quarterlyScrutiny ? `scrutiny ${signed(posture.quarterlyScrutiny)}` : null,
    posture.quarterlyMorale ? `executive morale ${signed(posture.quarterlyMorale)}` : null,
  ].filter(Boolean).join(', ');
  const haul = cost ? `logging & haul ${cost > 0 ? '+' : '-'}$${formatRate(Math.abs(cost))}/m³` : 'logging & haul at the contract rate';
  const provision = posture.deferredSilviculturePerM3
    ? ` The deferred silviculture is booked at year end: $${formatRate(posture.deferredSilviculturePerM3)}/m³ delivered.`
    : '';
  return `Volume ${Math.round(posture.volumeFactor * 100)}% of plan, ${haul}${quarterly ? `; each quarter ${quarterly}` : ''}.${provision}`;
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
const DEFAULT_PRICE_SWING = 10;
// Share of a log-price move the stumpage rate follows.
const STUMPAGE_MARKET_SHARE = 0.6;

function longRunPrice(ledger) {
  return Number(ledger?.longRunPrice) || LONG_RUN_LOG_PRICE;
}

/** The month's stumpage: the licence's rate at the long-run price, moved with the market. */
function stumpageRate(ledger) {
  return Math.max(1, Math.round(ledger.stumpage + STUMPAGE_MARKET_SHARE * (ledger.logPrice - longRunPrice(ledger))));
}

/**
 * Month 1: set the ledger to the operating area's wood, market, ground and
 * climate (MANAGER_AREA_ECONOMICS). Idempotent, and a no-op on a ledger that
 * already carries a profile.
 */
function applyAreaEconomics(journey) {
  const ledger = ensureLedger(journey);
  if (ledger.areaProfile) return getAreaEconomics(ledger.areaProfile);
  const areaId = journey.area?.id || journey.areaId || 'fraser-plateau';
  const profile = getAreaEconomics(areaId);
  ledger.areaProfile = areaId;
  ledger.logPrice = profile.logPrice;
  ledger.longRunPrice = profile.logPrice;
  ledger.stumpage = profile.stumpage;
  ledger.loggingHaul = profile.loggingHaul;
  ledger.priceSwing = profile.swing;
  ledger.seasonalCurve = profile.curveValues;
  return profile;
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

/** The certificate's next audit this year, or null when none is coming. */
function nextCertificationAudit(journey, cert) {
  const status = certificationStatus(cert);
  const month = Number(journey.day) || 1;
  if (status === 'pending' && month <= REGISTRATION_AUDIT_MONTH) return { month: REGISTRATION_AUDIT_MONTH, kind: 'registration audit' };
  if (status === 'corrective' && month <= SURVEILLANCE_AUDIT_MONTH) return { month: SURVEILLANCE_AUDIT_MONTH, kind: 're-audit' };
  if (status === 'certified' && month <= SURVEILLANCE_AUDIT_MONTH) return { month: SURVEILLANCE_AUDIT_MONTH, kind: 'surveillance audit' };
  return null;
}

/** Each requirement the auditors read, against today's meter. */
function auditReadiness(journey, cert) {
  return certificationRequirements(cert).map(([metric, minimum]) => {
    const value = Math.round(journey.metrics?.[metric] ?? 50);
    return { label: REQUIREMENT_LABELS[metric], value, minimum: Number(minimum), pass: value >= Number(minimum) };
  });
}

/**
 * The requirements stay on the pane all year, and in the audit month and
 * the month before, the month opens with them read against the meters. They
 * used to be shown once, in January, and a relationships meter could slide
 * under the October bar without a word.
 */
function writeCertificationWatch(ui, journey) {
  for (const cert of journey.certifications || []) {
    const audit = nextCertificationAudit(journey, cert);
    if (!audit || audit.month - journey.day > 1) continue;
    const checks = auditReadiness(journey, cert);
    if (!checks.length) continue;
    const when = audit.month === journey.day ? 'at the end of this month' : `at the end of ${monthName(audit.month)}`;
    const readout = checks.map((check) => `${check.label} ${check.value}% (needs ${check.minimum}%)${check.pass ? '' : ' SHORT'}`).join(' · ');
    ui.writeDivider('CERTIFICATION WATCH');
    const line = `${cert.id} ${audit.kind} ${when}: ${readout}.`;
    if (checks.every((check) => check.pass)) ui.writeInfo(line);
    else ui.writeWarning(line);
    ui.write('');
  }
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
  let volume = ledger.deliveredYtd + (ledger.bonusVolume || 0) + (ledger.opsVolume || 0);
  for (let month = firstMonth; month <= lastLedgerMonth(journey); month += 1) {
    const curtailment = month === firstMonth ? (ledger.curtailmentFactor || 1) : 1;
    volume += ledger.monthlyPlan * deliveryCurve(ledger)[month - 1] * rate * curtailment;
  }
  const ratio = ledger.aac ? volume / ledger.aac : 1;
  return { volume: Math.round(volume), ratio, status: classifyCutControl(ratio) };
}

function plannedToDate(ledger, throughMonth) {
  let planned = 0;
  for (let month = 1; month <= Math.min(12, throughMonth); month += 1) {
    planned += ledger.monthlyPlan * deliveryCurve(ledger)[month - 1];
  }
  return planned;
}

/** One pane fact per certificate: its status and, while an audit is coming, the bar against the meters. */
function certificationFacts(journey) {
  const certs = journey.certifications || [];
  if (!certs.length) return [{ label: 'Certification', value: 'None' }];
  return certs.map((cert) => {
    const audit = nextCertificationAudit(journey, cert);
    const checks = audit ? auditReadiness(journey, cert) : [];
    const readout = checks.map((check) => `${check.label} ${check.value}/${check.minimum}`).join(', ');
    return {
      label: `${cert.id || cert.name}`,
      value: audit && readout
        ? `${certificationStatus(cert)} · ${monthName(audit.month)} ${audit.kind}: ${readout}`
        : certificationStatus(cert),
      tone: checks.some((check) => !check.pass) ? 'warn' : ['suspended', 'withdrawn'].includes(certificationStatus(cert)) ? 'danger' : undefined,
    };
  });
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
    { label: 'Treasury', value: formatDollars(journey.resources.budget || 0), tone: budgetOk ? undefined : 'danger' },
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
    ...certificationFacts(journey),
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
  for (const cert of journey.certifications || []) {
    const audit = yearOver ? null : nextCertificationAudit(journey, cert);
    if (!audit || audit.month - journey.day > 1) continue;
    const short = auditReadiness(journey, cert).filter((check) => !check.pass);
    if (!short.length) continue;
    alerts.push({
      level: audit.month === journey.day ? 'danger' : 'warn',
      text: `${cert.id} ${audit.kind} ${audit.month === journey.day ? 'this month' : `in ${monthName(audit.month)}`}: ${short.map((check) => `${check.label} ${check.value}/${check.minimum}`).join(', ')}.`,
    });
  }
  if (ledger.curtailmentFactor && ledger.curtailmentFactor < 1) {
    alerts.push({ level: 'warn', text: `Deliveries curtailed this month (${Math.round(ledger.curtailmentFactor * 100)}% of plan).` });
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
  const before = projectionReading(journey);

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
  writeProjectionShift(game.ui, journey, before);
}

/** The ops meter and where it puts December, for a before-and-after line. */
function projectionReading(journey) {
  return { ops: Math.round(journey.metrics?.progress ?? 50), projection: projectYearEndCut(journey) };
}

/**
 * The ops meter runs the licence's delivery rate for the rest of the year
 * (runRate), so a decision that moves it says what it did to December.
 */
function writeProjectionShift(ui, journey, before) {
  const after = projectionReading(journey);
  if (after.ops === before.ops) return;
  const moved = after.projection.volume - before.projection.volume;
  const cut = moved === 0
    ? 'the delivery rate is already at its limit, so December does not move'
    : `December's projection ${moved > 0 ? '+' : '-'}${Math.abs(moved).toLocaleString()} m³, to ${after.projection.volume.toLocaleString()} m³ (${formatCutPercent(after.projection.ratio)} of the AAC)`;
  ui.writeInfo(`Operations ${before.ops}% -> ${after.ops}%: ${cut}.`);
}

async function runBudgetAllocation(game) {
  const { journey, ui } = game;
  const cfo = findExecutive(journey, 'cfo');
  ui.writeDivider("STRATEGIC DECISION - DISCRETIONARY SPEND");
  const cfoName = cfo ? `${cfo.name}, your CFO,` : 'The CFO';
  const ledger = journey.ledger || {};
  // A thin treasury changes what the CFO is offering.
  const tight = ledger.startTreasury && journey.resources.budget < ledger.startTreasury * 0.25;
  ui.write(tight
    ? `${cfoName} would rather nothing went out this month: the treasury is at ${formatDollars(journey.resources.budget)}. Every division is asking anyway.`
    : `${cfoName} has freed up discretionary room this month. Every division has opinions about it.`);
  ui.write("");

  const choice = await ui.promptChoice("Where does the money go?", [
    {
      label: "Operations push",
      description: "-$30,000, operations +4 (the delivery rate), forest health +2 | road and logging contractors get the parts, the gravel and the second shift they asked for",
      value: "operations",
    },
    {
      label: "Community and Nation relations",
      description: "-$22,500, reputation +4, relationships +2 | the Guardians program, the open house, the mill tour for the band council",
      value: "pr",
    },
    {
      label: "Compliance and safety training",
      description: "-$17,500, compliance +5 | FRPA refresher for the layout crews, SAFE Companies audit prep, a WorkSafeBC day nobody requests and everybody needs",
      value: "compliance",
    },
    {
      label: "Hold the line",
      description: "Political capital +2, operations -1 (the delivery rate) | Bank it. The board loves restraint; the divisions less so",
      value: "hold",
    },
  ]);

  let result = '';
  switch (choice.value) {
    case "operations":
      spendBudget(journey, 30000);
      adjustMetric(journey, "progress", 4);
      adjustMetric(journey, "forestHealth", 2);
      result = say(ui, 'success', "Crews get parts, gravel, and a rare sense of being believed. Deliveries tick up.");
      break;
    case "pr":
      spendBudget(journey, 22500);
      adjustMetric(journey, "reputation", 4);
      adjustMetric(journey, "relationships", 2);
      result = say(ui, 'success', "The open house runs. A seedling gets more column inches than your last three audits combined; the council leaves with the mill tour photos.");
      break;
    case "compliance":
      spendBudget(journey, 17500);
      adjustMetric(journey, "compliance", 5);
      result = say(ui, 'success', "Attendance is mandatory and the sandwiches are adequate. The site plans improve measurably.");
      break;
    default:
      adjustPoliticalCapital(journey, 2);
      adjustMetric(journey, "progress", -1);
      result = say(ui, 'info', "You bank the room. The board notes the discipline; the divisions note the silence.");
      break;
  }

  recordDecision(journey, "budget_allocation", choice, result);
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

  let result = '';
  switch (choice.value) {
    case "intervene":
      spendBudget(journey, 25000);
      adjustMetric(journey, division.metric, 6);
      result = say(ui, 'success', `You spend two days inside ${division.name}'s problem. It gets measurably smaller; so does your calendar.`);
      break;
    case "plan":
      adjustMetric(journey, division.metric, 3);
      adjustPoliticalCapital(journey, -1);
      result = say(ui, 'info', "A plan arrives in five business days with a Gantt chart and modest ambitions. It will mostly work.");
      break;
    default:
      adjustMetric(journey, "relationships", 3);
      adjustMetric(journey, "reputation", 2);
      journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + 2);
      bumpCrewMorale(journey, 2);
      result = say(ui, 'info', `You praise ${lead} at the all-hands. The numbers stay where they are, but loyalty is a real currency out here.`);
      break;
  }

  recordDecision(journey, "division_report", choice, result);
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

  let result = '';
  switch (choice.value) {
    case "visit":
      spendBudget(journey, 12500);
      bumpCrewMorale(journey, 6);
      adjustMetric(journey, "reputation", 3);
      adjustMetric(journey, "forestHealth", 1);
      result = say(ui, 'success', "You walk a cutblock in the rain and ask one good question. Word travels faster than the truck back to town.");
      break;
    case "ceo_tour":
      spendBudget(journey, 6000);
      adjustMetric(journey, "relationships", 2);
      bumpCrewMorale(journey, 2);
      result = say(ui, 'info', `${capitalize(journey.ceo.name)} works the contractor camps and the band office like a campaign stop. Different audience, same photos.`);
      break;
    default:
      adjustPoliticalCapital(journey, 1);
      bumpCrewMorale(journey, -2);
      result = say(ui, 'info', "The window closes. The inbox empties slightly. Somewhere out there, a crew decides head office is a rumour.");
      break;
  }

  recordDecision(journey, "field_visit", choice, result);
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

  let result = '';
  switch (choice.value) {
    case "rehearse":
      adjustPoliticalCapital(journey, 4);
      adjustMetric(journey, "compliance", 1);
      result = say(ui, 'success', "You can now recite stumpage variance in your sleep. Unfortunately, you do.");
      break;
    case "polish":
      adjustMetric(journey, "reputation", 3);
      journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + 3);
      result = say(ui, 'info', "The deck is beautiful. Decks this beautiful invite questions about what they're hiding.");
      break;
    default:
      adjustPoliticalCapital(journey, -2);
      adjustMetric(journey, "reputation", 1);
      result = say(ui, 'info', "Confidence carries the room further than it should. One director takes up fact-checking as a hobby.");
      break;
  }

  recordDecision(journey, "board_prep", choice, result);
}

/**
 * Ledger consequences of a resolved card: the last log entry names the event,
 * the option label and the band it resolved to, which map back to the fitted
 * option's per-band ledger (fitManagerEvent). A set-aside card logs no option
 * of its own, so it books nothing here.
 */
export function applyLedgerHooks(ui, journey, event, logBefore) {
  if (journey.log.length <= logBefore) return;
  const entry = journey.log[journey.log.length - 1];
  if (entry?.type !== 'event' || entry.eventId !== event?.id) return;
  const option = (event.options || []).find((candidate) => candidate.label === entry.optionLabel);
  const band = entry.band || 'good';
  if (option?.executiveDeparture && shownBand(option, band) === option.executiveDeparture.band) {
    replaceExecutive(ui, journey, option.executiveDeparture.role);
  }
  const hook = option?.managerLedger?.[band];
  if (!hook || !Object.keys(hook).length) return;
  const ledger = journey.ledger;
  if (hook.curtailment) ledger.curtailmentFactor = Math.min(ledger.curtailmentFactor, hook.curtailment);
  if (hook.bonusVolume) {
    ledger.bonusVolume += hook.bonusVolume;
    ledger.bonusSource = hook.bonusSource || 'the extra volume';
  }
  if (hook.opsVolume) {
    ledger.opsVolume = (ledger.opsVolume || 0) + hook.opsVolume;
    ledger.opsSources = [...(ledger.opsSources || []), event.title || 'the month\'s events'];
  }
  if (hook.costShift) ledger.costShiftPerM3 += hook.costShift;
  if (hook.monthCostShift) ledger.monthCostShift = (ledger.monthCostShift || 0) + hook.monthCostShift;
  if (hook.priceShift) ledger.logPrice = Math.max(60, ledger.logPrice + hook.priceShift);
  if (hook.stumpageShift) ledger.stumpage += hook.stumpageShift;
  const lasting = describeLedgerHook(hook);
  if (hook.note) ui.writeInfo(`Ledger: ${hook.note}${lasting ? ` - ${lasting}` : ''}.`);
  else if (lasting) ui.writeInfo(`Ledger: ${lasting}.`);
}

/**
 * An executive leaves the company and the seat is filled from inside: an
 * acting successor with the same role, who takes over whatever the departing
 * executive carried (the woodlands manager carries the year's posture). The
 * name is drawn on the month's dice, so a reload names the same successor.
 */
function replaceExecutive(ui, journey, roleId) {
  const departing = findExecutive(journey, roleId);
  if (!departing) return;
  departing.isActive = false;
  departing.hasQuit = true;
  const taken = new Set((journey.crew || []).map((member) => member.name));
  const names = FIRST_NAMES.filter((name) => !taken.has(name));
  const rng = monthRng(journey, `successor:${roleId}`);
  const name = names.length ? names[Math.floor(rng() * names.length)] : `${departing.name} II`;
  const role = MANAGER_EXECUTIVE_ROLES.find((entry) => entry.id === roleId);
  const successor = {
    ...departing,
    id: `${departing.id}-successor`,
    name,
    health: role?.baseHealth ?? departing.health,
    morale: Math.max(30, (role?.baseMorale ?? 70) - 15),
    traits: [],
    statusEffects: [],
    isActive: true,
    hasQuit: false,
    status: 'active',
    actingFor: departing.name,
  };
  journey.crew.push(successor);
  if (roleId === 'woodlands' && journey.ceo) journey.ceo.name = name;
  const title = (role?.name || roleId).toLowerCase();
  ui.writeWarning(`${departing.name} clears out the office by month end. ${name} steps up as acting ${title}${roleId === 'woodlands' && journey.ceo ? ` and inherits the ${journey.ceo.posture || 'year\'s'} posture` : ''}.`);
  journey.log.push({
    day: journey.day,
    type: 'crew',
    summary: `${departing.name} (${role?.name || roleId}) resigns; ${name} acting`,
    detail: `${departing.name} leaves the company. ${name} is acting ${title} for the rest of the year.`,
  });
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
    bookSilvicultureProvision(ui, journey);
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
    ? `Continue... (${monthName(journey.day)}, month ${journey.day} of ${journey.deadline}, ${formatDollars(journey.resources.budget)} treasury)`
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
  const planned = Math.round(ledger.monthlyPlan * deliveryCurve(ledger)[month - 1]);
  const pace = carryIn ? getHarvestPace(1) : getHarvestPace(ledger.pace);

  let delivered;
  let bonus = 0;
  let bonusSource = '';
  let ops = 0;
  let opsSources = [];
  let curtailed = false;
  if (carryIn) {
    delivered = Math.round(planned * JANUARY_CARRY_IN);
  } else {
    const rng = monthRng(journey, 'ledger', month);
    const noise = 0.94 + rng() * 0.12;
    delivered = Math.round(planned * runRate(journey) * ledger.curtailmentFactor * noise);
    bonus = Math.round(ledger.bonusVolume || 0);
    bonusSource = ledger.bonusSource || 'the extra volume';
    delivered += bonus;
    ledger.bonusVolume = 0;
    ledger.bonusSource = null;
    // The month's cards: wood a situation added to the month or cost it.
    ops = Math.max(-delivered, Math.round(ledger.opsVolume || 0));
    opsSources = ledger.opsSources || [];
    delivered += ops;
    ledger.opsVolume = 0;
    ledger.opsSources = [];
    curtailed = ledger.curtailmentFactor < 1;
    ledger.curtailmentFactor = 1;

    // The log market drifts around the area's long-run level, as hard as the
    // market the wood goes to swings.
    const anchor = longRunPrice(ledger);
    const swing = Number(ledger.priceSwing) || DEFAULT_PRICE_SWING;
    const drifted = ledger.logPrice + (anchor - ledger.logPrice) * 0.3 + (rng() - 0.5) * swing;
    ledger.logPrice = Math.max(Math.round(anchor * 0.76), Math.min(Math.round(anchor * 1.33), Math.round(drifted)));
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
  // What the treasury could not cover, so a bankrupt month still reconciles on screen.
  const shortfall = Math.max(0, -(journey.resources.budget + net));
  journey.resources.budget = Math.max(0, journey.resources.budget + net);
  ledger.months.push({
    month, planned, delivered, logPrice: ledger.logPrice, premium, stumpage, cost,
    margin, revenue, overhead: ledger.overhead, certCost, standby, net,
    treasury: Math.round(journey.resources.budget),
  });

  const volumeNotes = [
    curtailed ? 'curtailed' : null,
    bonus ? `incl. ${bonus.toLocaleString()} m³ from ${bonusSource}` : null,
    ops > 0 ? `incl. ${ops.toLocaleString()} m³ from ${listSources(opsSources)}` : null,
    ops < 0 ? `less ${Math.abs(ops).toLocaleString()} m³ lost to ${listSources(opsSources)}` : null,
    pace.factor !== 1 ? pace.name.toLowerCase() : null,
  ].filter(Boolean);
  const deliveredLine = `Delivered: ${delivered.toLocaleString()} m³ (plan ${planned.toLocaleString()}${volumeNotes.length ? `, ${volumeNotes.join(', ')}` : ''}; year to date ${Math.round(ledger.deliveredYtd).toLocaleString()} / ${ledger.aac.toLocaleString()} m³ AAC)`;
  const marginLine = `Log price $${ledger.logPrice}${premium ? ` + $${formatRate(premium)} certified premium` : ''} - stumpage $${stumpage} - logging & haul $${formatRate(cost)} = ${margin < 0 ? '-' : ''}$${formatRate(Math.abs(margin))}/m³ margin -> ${formatSignedDollars(revenue)}`;
  const chargesLine = `Overhead -$${ledger.overhead.toLocaleString()}${certCost ? ` · certification -$${certCost.toLocaleString()}` : ''}${standby ? ` · standby -$${standby.toLocaleString()}` : ''}`;
  const netLine = `Net ${formatSignedDollars(net)} -> treasury ${formatDollars(journey.resources.budget)}${shortfall ? ` (${formatDollars(shortfall)} it could not cover)` : ''}`;
  ui.write(deliveredLine);
  ui.write(marginLine);
  ui.write(chargesLine);
  if (net >= 0) ui.writeSuccess(netLine); else ui.writeWarning(netLine);

  // The Log keeps every month's ledger after the screen has moved on.
  journey.log.push({
    day: month,
    type: 'ledger',
    summary: `${monthName(month)} ledger: ${delivered.toLocaleString()} m³, net ${formatSignedDollars(net)}`,
    detail: `${marginLine}. ${chargesLine}. Treasury ${formatDollars(journey.resources.budget)}; ${Math.round(ledger.deliveredYtd).toLocaleString()} / ${ledger.aac.toLocaleString()} m³ AAC year to date.`,
  });

  // Budget health: the treasury against where the year started.
  journey.metrics.budget = clampPercentValue(Math.round(50 + ((journey.resources.budget - ledger.startTreasury) / ledger.startTreasury) * 50));
  if (journey.resources.budget <= 0) {
    ui.writeDanger('The treasury is empty. The bank calls the covenant.');
  }
}

/** Card titles as the ledger names them: “Road Washed Out” and “Sick Day Wave”. */
function listSources(sources) {
  const unique = [...new Set(sources.filter(Boolean))].map((title) => `“${title}”`);
  if (!unique.length) return 'the month\'s events';
  return unique.length === 1 ? unique[0] : `${unique.slice(0, -1).join(', ')} and ${unique.at(-1)}`;
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
    statement = `Overcut: ${statementOf}, past the ${Math.round(CUT_CONTROL.bandHigh * 100)}% ceiling. C&E opens a file; the penalty on ${excess.toLocaleString()} m³ is $${penalty.toLocaleString()} at $${CUT_CONTROL.overcutPenaltyPerM3}/m³, more than the wood earned. Treasury ${formatDollars(journey.resources.budget)}.`;
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
 * Year end: a cost-cutting year deferred brushing, surveys and fill-planting
 * the licence still owes. Basic silviculture is a licensee obligation, so the
 * auditors book what was deferred as a provision against the year, per m³
 * delivered: the cash the posture saved partly comes back as a liability.
 */
function bookSilvicultureProvision(ui, journey) {
  const ledger = ensureLedger(journey);
  if (ledger.silvicultureProvision !== undefined || !journey.ceo) return;
  const rate = Number(journey.ceo.deferredSilviculturePerM3 ?? getOperatingPosture(journey.ceo.id).deferredSilviculturePerM3) || 0;
  if (!rate) return;
  const provision = Math.round(ledger.deliveredYtd * rate);
  ledger.silvicultureProvision = provision;
  journey.resources.budget = Math.max(0, journey.resources.budget - provision);
  adjustMetric(journey, 'forestHealth', -3);
  const statement = `The auditors book the silviculture the year deferred as a provision: $${provision.toLocaleString()} ($${formatRate(rate)}/m³ on ${Math.round(ledger.deliveredYtd).toLocaleString()} m³). Treasury ${formatDollars(journey.resources.budget)}.`;
  ui.write('');
  ui.writeDivider('SILVICULTURE PROVISION');
  ui.writeWarning(statement);
  ledger.provisionStatement = statement;
  journey.log.push({ day: lastLedgerMonth(journey), type: 'provision', summary: `Silviculture provision -$${provision.toLocaleString()}`, detail: statement });
}

/**
 * The posture's quarterly initiative: what the woodlands team does with it on
 * its own, every third month.
 */
function applyPostureInitiative(ui, journey) {
  if (!journey.ceo || journey.day % 3 !== 0) return;
  const posture = getOperatingPosture(journey.ceo.id);
  const quarterly = journey.ceo.quarterly || posture.quarterly || {};
  const parts = [];
  for (const [key, delta] of Object.entries(quarterly)) {
    adjustMetric(journey, key, delta);
    parts.push(`${METRIC_LABELS[key] || key} ${delta > 0 ? '+' : ''}${delta}`);
  }
  const scrutiny = Number(journey.ceo.quarterlyScrutiny ?? posture.quarterlyScrutiny) || 0;
  if (scrutiny) {
    journey.scrutiny = clampPercentValue((journey.scrutiny || 0) + scrutiny);
    parts.push(`scrutiny ${scrutiny > 0 ? '+' : ''}${scrutiny}`);
  }
  const morale = Number(journey.ceo.quarterlyMorale ?? posture.quarterlyMorale) || 0;
  if (morale) {
    bumpCrewMorale(journey, morale);
    parts.push(`executive morale ${morale > 0 ? '+' : ''}${morale}`);
  }
  if (!parts.length) return;
  ui.writeInfo(`${capitalize(journey.ceo.name)} runs the quarter on the ${journey.ceo.posture || 'chosen'} posture: ${parts.join(', ')}.`);
}

/**
 * Whether the quarter the board is reading is a weak one. Deliveries off the
 * seasonal plan in either direction: short leaves margin in the bush, and
 * well over it is cut-control exposure, not a good quarter. The year heading
 * out of the control band (or, in December, a statement with a finding). A
 * treasury that is empty or under half of where the year opened. Or the
 * meters sliding on more than one front: one bad meter is a normal quarter,
 * and breakup is in the plan.
 */
function readQuarter(journey, baseline, quarterMonths, quarter) {
  const reasons = [];
  const ledger = journey.ledger || {};
  const planned = quarterMonths.reduce((sum, entry) => sum + (entry.planned || 0), 0);
  const delivered = quarterMonths.reduce((sum, entry) => sum + (entry.delivered || 0), 0);
  if (planned > 0 && (delivered < planned * 0.9 || delivered > planned * 1.15)) {
    reasons.push(`deliveries ${Math.round((delivered / planned) * 100)}% of plan`);
  }
  if (quarter === 4 && ledger.cutControlStatus) {
    if (ledger.cutControlStatus !== 'in_band') reasons.push(`the cut-control statement goes in ${ledger.cutControl}`);
  } else if (ledger.aac) {
    const projection = projectYearEndCut(journey);
    if (projection.status !== 'in_band') reasons.push(`the cut is heading for ${formatCutPercent(projection.ratio)} of the AAC`);
  }
  const treasury = Math.round(journey.resources?.budget || 0);
  if (treasury <= 0) {
    reasons.push('the treasury is empty');
  } else if (ledger.startTreasury && treasury < ledger.startTreasury * 0.5) {
    reasons.push(`the treasury is down to ${formatDollars(treasury)} from ${formatDollars(ledger.startTreasury)}`);
  }
  const falling = Object.entries(METRIC_LABELS)
    .filter(([key]) => Math.round(journey.metrics[key] ?? 50) - Math.round(baseline[key] ?? 50) <= -3)
    .map(([, label]) => label.toLowerCase());
  if (falling.length >= 2) reasons.push(`${falling.join(', ')} down`);
  return { weak: reasons.length > 0, reasons };
}

/**
 * What each answer to the chair does to the file, for a sound and a weak
 * quarter. Honesty costs nothing and cools the file. Spin is borrowed
 * standing: a little reputation now, an audit committee that reads the next
 * deck harder, and for a weak quarter a place on the year-end audit's list.
 * Gilding a good quarter buys almost nothing and still draws the questions.
 */
const BOARD_STANCES = {
  transparent: {
    sound: { reputation: 3, politicalCapital: 5, compliance: 3, scrutiny: -4 },
    weak: { politicalCapital: 5, compliance: 3, scrutiny: -4 },
    soundLine: 'Good numbers, honestly told. The rarest deck in forestry. The chair almost smiles.',
    weakLine: 'The board respects the honesty more than they enjoy it. The audit committee nods, and nobody has to find the bad news for themselves.',
  },
  spin: {
    sound: { reputation: 1, politicalCapital: -2, scrutiny: 6 },
    weak: { reputation: 4, politicalCapital: -2, scrutiny: 12 },
    soundLine: 'A good quarter, gilded anyway. The chair wonders aloud what the gilding is for, and the audit committee asks for the working papers.',
    weakLine: 'The quarter sounds magnificent. Two directors take notes for later, which is never decorative.',
  },
  deflect: {
    sound: { politicalCapital: -4, relationships: -3, scrutiny: 3 },
    weak: { politicalCapital: -4, relationships: -3, scrutiny: 3 },
    soundLine: "The board's analysts have the same spreadsheets you do. The deflection is noted, in the minutes, verbatim.",
    weakLine: "The board's analysts have the same spreadsheets you do. The deflection is noted, in the minutes, verbatim.",
  },
};

const STANCE_LABELS = { reputation: 'reputation', politicalCapital: 'political capital', compliance: 'compliance', relationships: 'relationships', scrutiny: 'scrutiny' };

/**
 * Apply a board answer and say what it did: "reputation +4 -> 58, political
 * capital -2 -> 61, scrutiny +8 -> 39%". What lands is what the clamps let
 * through, not what was asked.
 */
function applyBoardStance(journey, deltas) {
  const parts = [];
  for (const [key, delta] of Object.entries(deltas)) {
    let before;
    let after;
    if (key === 'politicalCapital') {
      before = journey.resources.politicalCapital || 0;
      adjustPoliticalCapital(journey, delta);
      after = journey.resources.politicalCapital;
    } else if (key === 'scrutiny') {
      before = journey.scrutiny || 0;
      journey.scrutiny = clampPercentValue(before + delta);
      after = journey.scrutiny;
    } else {
      before = journey.metrics[key] ?? 50;
      adjustMetric(journey, key, delta);
      after = journey.metrics[key];
    }
    const moved = Math.round(after) - Math.round(before);
    if (moved) parts.push(`${STANCE_LABELS[key] || key} ${moved > 0 ? '+' : ''}${moved} -> ${Math.round(after)}${key === 'scrutiny' ? '%' : ''}`);
  }
  return parts.join(', ');
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
    `Treasury: ${formatDollars(journey.resources.budget)}`
    + ` | Quarter: ${quarterVolume.toLocaleString()} m³, net ${formatSignedDollars(quarterNet)}`
    + ` | YTD ${Math.round(ledger.deliveredYtd || 0).toLocaleString()} / ${(ledger.aac || 0).toLocaleString()} m³`
    + ` | Political Capital: ${Math.round(journey.resources.politicalCapital)}`,
  );
  if (quarter === 4 && ledger.cutControlStatement) {
    ui.write('');
    ui.writeDivider('CUT-CONTROL STATEMENT');
    ui.write(ledger.cutControlStatement);
    if (ledger.provisionStatement) ui.write(ledger.provisionStatement);
  }
  const reading = readQuarter(journey, baseline, quarterMonths, quarter);
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

  const stance = BOARD_STANCES[choice.value] || BOARD_STANCES.deflect;
  ui.write(reading.weak ? stance.weakLine : stance.soundLine);
  const applied = applyBoardStance(journey, reading.weak ? stance.weak : stance.sound);
  if (applied) ui.writeInfo(`${capitalize(applied)}.`);
  if (choice.value === 'spin' && reading.weak) {
    journey.flags.boardSpunQuarters = [...(journey.flags.boardSpunQuarters || []), quarter];
  }

  if (quarter === 4) runYearEndAudit(ui, journey);

  journey.flags.boardBaseline = { ...journey.metrics };
  ui.updateAllStatus(journey);
  updateManagerMissionStatus(ui, journey);
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
  const rng = monthRng(journey, 'year-end-audit', lastLedgerMonth(journey));
  const caught = spun.filter(() => rng() < catchChance);
  ui.write('');
  ui.writeDivider('AUDITED YEAR-END STATEMENTS');
  if (!caught.length) {
    const survivors = spun.length === 1 ? 'The spun quarter survives' : spun.length === 2 ? 'Both spun quarters survive' : `All ${spun.length} spun quarters survive`;
    ui.writeInfo(`The auditors reconcile the year to the decks and let appendix C stand. ${survivors}, this time.`);
    return;
  }
  // A restatement is a finding in the management letter, and that letter is
  // on the file the certification auditors and C&E read.
  const reputationCost = caught.length * 8;
  adjustMetric(journey, 'reputation', -reputationCost);
  adjustPoliticalCapital(journey, -3 * caught.length);
  const complianceBefore = journey.metrics.compliance ?? 50;
  adjustMetric(journey, 'compliance', -3 * caught.length);
  const complianceCost = Math.round(complianceBefore) - Math.round(journey.metrics.compliance);
  const scrutinyBefore = journey.scrutiny || 0;
  journey.scrutiny = clampPercentValue(scrutinyBefore + 8 * caught.length);
  const scrutinyAdded = Math.round(journey.scrutiny) - Math.round(scrutinyBefore);
  const restated = caught.map((q) => `Q${q}`);
  const restatedList = restated.length > 1 ? `${restated.slice(0, -1).join(', ')} and ${restated.at(-1)}` : restated[0];
  const fileCost = [
    complianceCost ? `compliance -${complianceCost}` : null,
    scrutinyAdded ? `scrutiny +${scrutinyAdded}` : null,
  ].filter(Boolean).join(', ');
  const detail = `Reputation -${reputationCost}.${fileCost ? ` The letter goes on the licensee's file: ${fileCost}.` : ''}`;
  ui.writeDanger(`The management letter reconciles the audited statements to the quarterly decks and restates ${restatedList}. The board learns ${caught.length === 1 ? 'the quarter' : 'those quarters'} from the auditors instead of from you: reputation -${reputationCost}.${fileCost ? ` The letter goes on the licensee's file: ${fileCost}.` : ''}`);
  journey.log.push({ day: journey.day, type: 'audit', summary: `Year-end audit restated ${caught.map((q) => `Q${q}`).join(', ')}`, detail });
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

/** Write a strategic decision's result and hand the text back for the Log. */
function say(ui, tone, text) {
  if (tone === 'success') ui.writeSuccess(text);
  else ui.writeInfo(text);
  return text;
}

const BEAT_TITLES = {
  budget_allocation: 'Discretionary spend',
  division_report: 'Division report',
  field_visit: 'Field presence',
  board_prep: 'Board prep',
};

/**
 * The decision goes on the record and in the Log, so its result can still be
 * read after the month's card has cleared the screen.
 */
function recordDecision(journey, beat, choice, result = '') {
  journey.decisions.push({ day: journey.day, type: "strategic", beat, choice: choice.value });
  journey.log.push({
    day: journey.day,
    type: 'decision',
    summary: `${BEAT_TITLES[beat] || 'Strategic decision'}: ${choice.label}`,
    detail: result,
  });
}
