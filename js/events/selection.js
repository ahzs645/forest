/**
 * Event Selection
 * Checks for random events and calculates probability modifiers
 */

import {
  isFieldJourney,
  isDeskJourney,
  EVENT_REPEAT_COOLDOWN,
  GENERIC_RADIO_TASKS,
  RADIO_TASKS_BY_ROLE
} from './constants.js';
import { FIELD_EVENTS, getApplicableFieldEvents, selectRandomFieldEvent } from '../data/fieldEvents.js';
import { DESK_EVENTS, getApplicableDeskEvents, selectRandomDeskEvent } from '../data/deskEvents.js';
import {
  ILLEGAL_ACTS,
  actFitsRole,
  buildCaughtNarrative,
  capitalizeProposer,
  CATEGORY_CLEAN_OUTCOMES,
  CATEGORY_GO_AROUND,
  REFUSE_OUTCOMES,
  REOFFER_PITCHES
} from '../data/illegalActs.js';
import { computeBandOdds } from './odds.js';
import { OPERATING_AREAS } from '../data/operatingAreas.js';
import { PACE_OPTIONS } from '../journey/constants.js';
import { getDiscoveryEventTypeMultipliers } from '../data/discoveryTags.js';
import { getAreaSituationMultipliers } from '../data/areaSituations.js';
import { formatRadioReport } from './display.js';

/**
 * Chance that an ordinary day carries an event at all.
 *
 * This gate was 0.5 for a good reason: against one action a day
 * (js/journey/dayPlan.js), an event that fired on nearly every day was as loud
 * as the day's decision, and the steady drip of event costs outran every
 * budget in scripts/simulate-expeditions.mjs.
 *
 * What changed is that the player can now decline. The day's situation is the
 * day (docs/day_as_situation.md), and every situation the mode can walk away
 * from carries an explicit "leave it and push on" that trades the cost for
 * ground. An event is no longer a bill the player has no say in, so the rate
 * can go back up and the ~500-entry authored library stops being something a
 * run sees eleven of.
 *
 * Two things keep the higher rate affordable: the player can decline, and
 * minor/positive situations are dealt with without costing the shift at all
 * (situationCostsTheShift in js/modes/recon.js), so only moderate-and-worse
 * actually competes with the day's work.
 *
 * 0.65 is measured, not chosen. Over 24 runs of scripts/simulate-expeditions.mjs
 * a competent recon policy wins 17/24 here; at 0.8 it wins 5/16, because the
 * traverse stops fitting inside the season. A run also needs quiet days for the
 * loud ones to land, and a quiet day is a card too — it is where the player
 * gets to choose their own work.
 *
 * Temptations keep their own lane below: they already have a multi-day
 * cooldown, and gating them twice would bury the shortcut library again.
 */
const DAY_HAS_EVENT_CHANCE = 0.65;

/**
 * Whether today is an event day at all, before the deck picks which one.
 * @param {Object} journey
 * @returns {boolean}
 */
function dayCarriesEvent(journey) {
  const chance = Math.min(0.85, DAY_HAS_EVENT_CHANCE * getDifficultyEventModifier(journey));
  return Math.random() < chance;
}

/**
 * Check if a random event should occur
 * @param {Object} journey - Current journey state
 * @returns {Object|null} Event to resolve or null
 */
export function checkForEvent(journey) {
  // Temptations need their own draw lane. When they were only attempted after
  // the large ordinary-event deck missed, their advertised chance collapsed
  // to a few percent and the added illegal-act library was almost invisible.
  const temptation = maybeCreateTemptationEvent(journey);
  if (temptation) {
    return temptation;
  }

  if (!dayCarriesEvent(journey)) {
    return null;
  }

  if (journey.journeyType === 'manager') {
    return checkManagerEvent(journey);
  }

  const isField = isFieldJourney(journey.journeyType);
  const event = isField ? checkFieldEvent(journey) : checkDeskEvent(journey);
  if (event) {
    return isField ? attachFieldReporter(event, journey) : event;
  }
  return null;
}

// Manager days split roughly 60/40 between boardroom paper and operational
// radio traffic from the divisions.
const MANAGER_DESK_EVENT_RATIO = 0.6;

/**
 * Check for manager events: roll desk-context vs field-context 60/40, with
 * both lanes running through the same cooldown/context/modifier pipeline the
 * dedicated modes use. The field lane is gated and reframed so what reaches
 * the GM is a division escalating a decision upward, not a tailgate call.
 */
function checkManagerEvent(journey) {
  const wantsDesk = Math.random() < MANAGER_DESK_EVENT_RATIO;
  const event = wantsDesk ? checkDeskEvent(journey) : checkFieldEvent(journey, { managerLane: true });
  if (!event) return null;
  return wantsDesk ? event : escalateFieldEventForManager(event);
}

/**
 * Which field events a division would actually put on the GM's desk. The GM
 * hears from the bush constantly; only calls above a superintendent's
 * authority get escalated:
 *   - a `managerEscalation` flag on the event wins in both directions — it is
 *     the per-event opt-in for moderate events that are head-office business
 *     anyway (a washed-out mainline) and the opt-out for severe events that
 *     are decided at the scene before any radio call connects (a flash flood);
 *   - `issue`-type events are landscape/program-scale by construction, so
 *     they escalate by default;
 *   - other `severe` events are the incidents head office hears about within
 *     the hour, so they escalate by default too.
 * Everything else — a sprained ankle, a poker pot, a fuel barter — is
 * division business and never reaches this journey type. Chain children
 * (probability 0) and events whose options schedule follow-ups are excluded
 * because manager mode never drains journey.scheduledEvents, so the setup or
 * the payoff of the chain could never arrive.
 */
export function isManagerFieldEscalation(event) {
  if (!event || !(Number(event.probability) > 0)) return false;
  if (event.options?.some((option) => option?.schedulesEvent || option?.failureSchedulesEvent)) return false;
  if (typeof event.managerEscalation === 'boolean') return event.managerEscalation;
  return event.type === 'issue' || event.severity === 'severe';
}

// Bush per-day probabilities are tuned for ~100-day field journeys, and the
// field modifiers they are rolled against (pace, terrain, weather) do not
// exist for a GM. Rolling each surviving event separately against those
// meanings-free modifiers left the ops lane silent: four twelve-month terms
// produced one escalation between them, which trades one wrong note (the GM
// running the camp) for another (the GM never hearing from the bush at all).
// Cadence is therefore set once at the lane level — if an escalation is due
// this month, one is drawn from the gated pool — so it stays put no matter
// how many events survive the gate in a given area.
const MANAGER_ESCALATION_LANE_CHANCE = 0.55;

/**
 * How likely the divisions are to put something on the GM's desk this month.
 * Difficulty and a shaky compliance record both make the bush noisier, which
 * are the only two field modifiers that still mean anything at this altitude.
 * @param {Object} journey - Manager journey state
 * @returns {number} probability in [0, 0.9]
 */
export function getManagerEscalationChance(journey) {
  const raw = MANAGER_ESCALATION_LANE_CHANCE
    * getDifficultyEventModifier(journey)
    * getScrutinyEventModifier(journey);
  return Math.max(0, Math.min(0.9, raw));
}

// What a crew-wallet stock hit costs the corporate ledger when a division
// absorbs it: the GM does not track gallons and ration-days, but the invoice
// for them still lands on the treasury. Rates are sized so translated hits
// sit alongside the manager desk events' $1k-$20k range.
const MANAGER_STOCK_LEDGER_RATES = { fuel: 150, food: 200, firstAid: 400, equipment: 250 };

// Field-event dollar figures are bush invoices (a mechanic call-out, hazard
// pay); the same incident at division scale is an order of magnitude larger.
const MANAGER_BUDGET_SCALE = 10;

// Field-context calls reach the GM from the division side of the radio, not
// from the executive staff down the hall (attachFieldReporter's pool). The
// caller is matched to the kind of incident; `issue`-type events span every
// portfolio, so they draw from the whole roster.
const MANAGER_ESCALATION_CALLERS = [
  { name: 'Berg', role: 'Woodlands Superintendent', types: ['terrain', 'equipment', 'supply', 'weather', 'trade', 'morale'] },
  { name: 'Okafor', role: 'Stewardship Forester', types: ['wildlife', 'forest_health', 'discovery', 'narrative'] },
  { name: 'Castillo', role: 'Camp Supervisor', types: ['injury', 'illness', 'social'] }
];

function pickManagerEscalationCaller(event) {
  const matched = MANAGER_ESCALATION_CALLERS.filter((caller) => caller.types.includes(event?.type));
  const pool = matched.length ? matched : MANAGER_ESCALATION_CALLERS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Translate a field option's effects to the corporate ledger. Stocks become
 * dollars, bush invoices scale up, and hours vanish (managers have no hours
 * mechanic). crew_morale passes through: the executive crew already stands in
 * for division mood everywhere in manager mode (see bumpCrewMorale in
 * js/modes/manager.js), and crew_health folds into it — a division taking
 * casualties reads at head office as a morale problem, not as bruises on the
 * executive team.
 */
function translateManagerEffects(effects) {
  if (!effects) return effects;
  const translated = {};
  let budget = 0;
  for (const [key, value] of Object.entries(effects)) {
    if (typeof value !== 'number') {
      translated[key] = value;
      continue;
    }
    if (key === 'budget') {
      budget += value * MANAGER_BUDGET_SCALE;
    } else if (MANAGER_STOCK_LEDGER_RATES[key]) {
      budget += value * MANAGER_STOCK_LEDGER_RATES[key];
    } else if (key === 'timeUsed') {
      continue;
    } else if (key === 'crew_health' || key === 'crew_morale') {
      translated.crew_morale = (translated.crew_morale || 0) + value;
    } else {
      translated[key] = value;
    }
  }
  if (budget !== 0) translated.budget = Math.round(budget);
  return translated;
}

function escalateManagerOption(option, variantOption) {
  const escalated = { ...option, effects: translateManagerEffects(option.effects) };
  if (option.partialEffects) {
    escalated.partialEffects = translateManagerEffects(option.partialEffects);
  }
  if (option.failureEffects) {
    escalated.failureEffects = translateManagerEffects(option.failureEffects);
  }
  // An injury 300 km from the corner office cannot land on the executive
  // team; what reaches the GM later is the incident coming back as a
  // compliance problem, which riskCompliance already models.
  if (typeof escalated.riskInjury === 'number') {
    escalated.riskCompliance = Math.max(Number(option.riskCompliance ?? option.riskRejection) || 0, escalated.riskInjury);
    delete escalated.riskInjury;
  }
  // crewEffect (injuries, evacuations, quits) operates on whoever holds the
  // journey's crew array — in manager mode that is the executive staff, so it
  // must not fire from a division incident.
  delete escalated.crewEffect;
  delete escalated.timeUsed;
  if (variantOption) {
    if (variantOption.label) escalated.label = variantOption.label;
    if (variantOption.outcome) escalated.outcome = variantOption.outcome;
    // Variant effects are authored at corporate scale and bypass translation.
    if (variantOption.effects) escalated.effects = { ...variantOption.effects };
  }
  return escalated;
}

/**
 * Reframe a gated field event as a division escalating a decision to head
 * office. Events may carry a `managerVariant` block ({ title, description,
 * options: [{ label, outcome, effects }] }, parallel by index) for copy whose
 * base text stands the player at the tailgate; events without one keep their
 * copy — the `issue` pool is already written to the licensee — and get an
 * explicit escalation tail instead.
 */
export function escalateFieldEventForManager(event) {
  const variant = event.managerVariant || {};
  const variantOptions = Array.isArray(variant.options) ? variant.options : [];
  const caller = pickManagerEscalationCaller(event);
  const description = variant.description || event.description;
  const tail = variant.description ? '' : ' The division wants head office to make the call.';

  return {
    ...event,
    title: variant.title || event.title,
    reporter: { name: caller.name, role: caller.role },
    description: `${formatRadioReport(description, caller)}${tail}`,
    options: (event.options || []).map((option, index) => escalateManagerOption(option, variantOptions[index]))
  };
}

function getDifficultyEventModifier(journey) {
  switch (journey?.difficulty) {
    case 'easy':
      return 0.75;
    case 'hard':
      return 1.35;
    default:
      return 1;
  }
}

function getScrutinyEventModifier(journey) {
  const scrutiny = Number(journey?.scrutiny || 0);
  if (scrutiny >= 75) return 1.45;
  if (scrutiny >= 55) return 1.2;
  if (scrutiny <= 20) return 0.9;
  return 1;
}

function mergeTypeMultipliers(...groups) {
  const merged = {};
  for (const group of groups) {
    if (!group) continue;
    for (const [type, value] of Object.entries(group)) {
      const current = merged[type] || 1;
      merged[type] = Math.max(0.75, Math.min(2.5, current * Number(value || 1)));
    }
  }
  return merged;
}

function eventSupportsJourney(event, journey) {
  if (!event) {
    return false;
  }

  if (Array.isArray(event.journeyTypes) && event.journeyTypes.length > 0) {
    return event.journeyTypes.includes(journey?.journeyType);
  }

  const requiresPermitPipeline = event.options?.some(
    (option) => typeof option?.effects?.permits_approved === 'number'
  );

  if (requiresPermitPipeline && !journey?.permits) {
    return false;
  }

  return true;
}

export function eventMatchesJourneyContext(event, journey, options = {}) {
  if (!event) {
    return false;
  }

  const roleId = journey?.roleId || journey?.role?.id;
  if (Array.isArray(event.roles) && event.roles.length > 0) {
    if (!roleId || !event.roles.includes(roleId)) {
      return false;
    }
  }

  const areaTags = Array.isArray(journey?.area?.tags) ? journey.area.tags : [];
  if (Array.isArray(event.areaTags) && event.areaTags.length > 0) {
    if (!areaTags.length || !event.areaTags.some((tag) => areaTags.includes(tag))) {
      return false;
    }
  }

  // Season gate (`seasons: ['summer']`): a deck can keep a heat-shutdown card
  // out of a winter permitting push. A journey with no season state (legacy
  // fixtures) is not gated.
  const currentSeason = journey?.season?.currentSeason;
  if (Array.isArray(event.seasons) && event.seasons.length > 0 && currentSeason) {
    if (!event.seasons.includes(currentSeason)) {
      return false;
    }
  }

  const becCode = journey?.area?.becCode;
  if (Array.isArray(event.becCodes) && event.becCodes.length > 0) {
    if (!becCode || !event.becCodes.includes(becCode)) {
      return false;
    }
  }

  const currentBlockFeatures = Array.isArray(options.currentBlock?.features)
    ? options.currentBlock.features
    : [];
  if (Array.isArray(event.requiredBlockFeatures) && event.requiredBlockFeatures.length > 0) {
    if (!currentBlockFeatures.length || !event.requiredBlockFeatures.some((feature) => currentBlockFeatures.includes(feature))) {
      return false;
    }
  }

  return true;
}

/**
 * Check for field events
 */
function checkFieldEvent(journey, { managerLane = false } = {}) {
  const currentBlock = Array.isArray(journey.blocks)
    ? (journey.blocks[journey.currentBlockIndex] || journey.blocks[0] || null)
    : null;

  let applicableEvents = filterRecentEvents(
    journey,
    getApplicableFieldEvents({
      terrain: currentBlock?.terrain,
      weather: journey.weather?.id,
      hazards: currentBlock?.hazards
    }).filter(
      (event) => eventSupportsJourney(event, journey)
        && eventMatchesJourneyContext(event, journey, { currentBlock })
    )
  );

  if (managerLane) {
    const pool = applicableEvents.filter(isManagerFieldEscalation);
    if (!pool.length) return null;
    if (Math.random() >= getManagerEscalationChance(journey)) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const paceModifier = getPaceEventModifier(journey.pace);
  const terrainModifier = getTerrainEventModifier(currentBlock?.terrain);
  const weatherModifier = getWeatherEventModifier(journey.weather?.id);
  const difficultyModifier = getDifficultyEventModifier(journey);
  const scrutinyModifier = getScrutinyEventModifier(journey);
  const areaSituation = getAreaSituationMultipliers(journey, 'field');
  const discoveryTypeMultipliers = getDiscoveryEventTypeMultipliers(journey, 'field');
  const totalModifier = paceModifier
    * terrainModifier
    * weatherModifier
    * difficultyModifier
    * scrutinyModifier
    * areaSituation.eventMultiplier;

  return selectRandomFieldEvent(applicableEvents, {
    paceModifier: totalModifier,
    terrainModifier: 1,
    typeMultipliers: mergeTypeMultipliers(areaSituation.typeMultipliers, discoveryTypeMultipliers)
  });
}

/**
 * Check for desk events
 */
function checkDeskEvent(journey) {
  const applicableEvents = filterRecentEvents(
    journey,
    getApplicableDeskEvents(journey.currentPhase).filter(
      (event) => eventSupportsJourney(event, journey)
        && eventMatchesJourneyContext(event, journey)
    )
  );

  const daysRemaining = Number.isFinite(journey.deadline)
    ? journey.deadline - journey.day
    : 30;
  const stressModifier = daysRemaining < 5 ? 1.5 : daysRemaining < 10 ? 1.2 : 1;

  let avgMorale = 50;
  if (journey.crew && journey.crew.length > 0) {
    const active = journey.crew.filter(m => m.isActive);
    avgMorale = active.length > 0
      ? active.reduce((sum, m) => sum + m.morale, 0) / active.length
      : 50;
  } else if (journey.protagonist) {
    avgMorale = 100 - (journey.protagonist.stress || 0);
  }
  const moraleModifier = avgMorale < 40 ? 1.3 : 1;
  const typeMultipliers = getDeskEventTypeMultipliers(journey);
  const areaSituation = getAreaSituationMultipliers(journey, 'desk');
  const discoveryTypeMultipliers = getDiscoveryEventTypeMultipliers(journey, 'desk');
  const difficultyModifier = getDifficultyEventModifier(journey);
  const scrutinyModifier = getScrutinyEventModifier(journey);

  return selectRandomDeskEvent(applicableEvents, {
    stressModifier: stressModifier * moraleModifier * difficultyModifier * scrutinyModifier * areaSituation.eventMultiplier,
    crisisMode: daysRemaining < 3,
    typeMultipliers: mergeTypeMultipliers(typeMultipliers, areaSituation.typeMultipliers, discoveryTypeMultipliers)
  });
}

function filterRecentEvents(journey, events = []) {
  const recentIds = (journey?.log || [])
    .filter((entry) => entry?.type === 'event' && entry?.eventId)
    .slice(-EVENT_REPEAT_COOLDOWN)
    .map((entry) => entry.eventId);

  if (!recentIds.length) {
    return events;
  }

  const recentSet = new Set(recentIds);
  const filtered = events.filter((event) => event?.id && !recentSet.has(event.id));
  return filtered.length ? filtered : events;
}

function getDeskEventTypeMultipliers(journey) {
  const multipliers = {};

  if (journey.journeyType !== 'planning') return multipliers;

  const activeBias = journey.blockPlanning?.activeEventBias;
  if (!activeBias || typeof activeBias !== 'object') return multipliers;

  const allowedTypes = ['stakeholder', 'compliance', 'technical', 'political', 'policy', 'issue'];
  for (const eventType of allowedTypes) {
    const value = Number(activeBias[eventType]);
    if (!Number.isFinite(value)) continue;
    multipliers[eventType] = Math.max(0.75, Math.min(2.5, value));
  }

  return multipliers;
}

function attachFieldReporter(event, journey) {
  if (!event || event.type === 'temptation') return event;
  const reporter = pickRandomCrewMember(journey.crew);
  if (!reporter) return event;

  return {
    ...event,
    reporter: {
      id: reporter.id,
      name: reporter.name,
      role: reporter.roleName || reporter.role || 'Crew',
      roleId: reporter.role,
      // Keep this context for logs/future event-aware copy, but the display
      // intentionally omits a random task that may not match the incident.
      task: getRadioTask(reporter)
    }
  };
}

function getRadioTask(member) {
  const roleId = member.role || member.roleId;
  const tasks = RADIO_TASKS_BY_ROLE[roleId] || GENERIC_RADIO_TASKS;
  return tasks[Math.floor(Math.random() * tasks.length)];
}

function pickRandomCrewMember(crew) {
  const active = crew.filter(m => m.isActive);
  if (active.length === 0) return null;
  return active[Math.floor(Math.random() * active.length)];
}

// ── Temptations ─────────────────────────────────────────────────────────────
//
// Somebody on the job proposes a shortcut. The act library (js/data/illegalActs.js)
// carries who asks, what they say, what it is worth in the role's own currency,
// and who in BC actually catches it. This lane turns one act into the day's
// card: a free refusal, a ten-minute note to file, and the shortcut as a
// three-band gamble whose bad band names the institution.

// Minimum days between shortcut offers, so a higher draw rate reads as texture
// rather than a nag.
const TEMPTATION_COOLDOWN_DAYS = 6;

// Share of draws that go to the comic tier when the role has any, and the
// weight of a grey act relative to a core one.
const COMIC_DRAW_SHARE = 0.15;
const GREY_TIER_WEIGHT = 0.6;
const RARE_ACT_WEIGHT = 0.25;

// What a shift of the role's own work is worth in the progress effect that
// resolution.js applies for that journey type: km for recon, planting points
// (8 = a block) for silviculture, phase-metric points for planning, pipeline
// points (10 = one permit moved) for permitting, and operational progress for
// the GM.
const SHIFT_OF_WORK = { recon: 4, field: 4, silviculture: 3, planning: 12, desk: 10, permitting: 10, manager: 4 };

// Dollar payoffs are authored at the scale of the role that would naturally be
// asked. A recce crew's cash is a wallet; a GM's ledger is not.
const RECCE_CASH_CAP = 1200;
const MANAGER_BUDGET_MULTIPLIER = 3;
const MANAGER_BUDGET_CAP = 60000;

// Consequence flags a noticed or caught band leaves behind. Registered as
// odds-only flags in js/events/odds.js; applyConsequenceFlags records any flag
// it is handed, so they shift later gambles without more machinery.
const WATCH_FLAG_BY_INSTITUTION = {
  'C&E': 'ce_watching', FPB: 'ce_watching', FPBC: 'ce_watching', BCWS: 'ce_watching',
  COS: 'ce_watching', ENV: 'ce_watching', DFO: 'ce_watching', 'Archaeology Branch': 'ce_watching',
  'Timber Pricing': 'ce_watching', 'Revenue Branch': 'ce_watching', RCMP: 'ce_watching',
  CVSE: 'ce_watching', 'Transport Canada': 'ce_watching',
  'the Nation': 'fn_watching',
  WorkSafeBC: 'worksafe_watching',
  'internal audit': 'contractor_owns_you',
  'the contractor': 'contractor_owns_you',
};

const WATCH_FLAG_SENTENCES = {
  ce_watching: 'the district is now reading everything with your name on it',
  fn_watching: "the Nation's referrals office has a note with your name in it",
  worksafe_watching: "WorkSafeBC's prevention officer has the site on a list",
  contractor_owns_you: 'the person who did it for you now owns a piece of you',
};

// Institutions whose caught band is a criminal or professional-conduct matter
// rather than an administrative one. These leave their own flag so later
// machinery (registration status, the RCMP file) can read it.
const CAUGHT_FLAG_BY_INSTITUTION = {
  FPBC: 'fpbc_file_open',
  RCMP: 'rcmp_file',
  'the Nation': 'locals_soured',
};

const TAKE_LABEL = 'Take the shortcut';
const LET_IT_STAND_LABEL = 'Let it stand';
const SET_ASIDE_ODDS = { drop: 0.55, reoffer: 0.30, goaround: 0.15 };

function ensureTemptationMemory(journey) {
  const memory = journey.temptationMemory || (journey.temptationMemory = {});
  if (!Number.isFinite(memory.lastDay)) memory.lastDay = 0;
  if (!Array.isArray(memory.seenActIds)) memory.seenActIds = [];
  if (!Array.isArray(memory.takenActIds)) memory.takenActIds = [];
  if (!Array.isArray(memory.pending)) memory.pending = [];
  if (!Number.isFinite(memory.missedEligibleDays)) memory.missedEligibleDays = 0;
  if (!Number.isFinite(memory.refuseIndex)) memory.refuseIndex = 0;
  if (!Array.isArray(memory.settledFlags)) memory.settledFlags = [];
  return memory;
}

function getTemptationRoleId(journey) {
  return journey?.roleId || journey?.role?.id || null;
}

function isDeskTemptationJourney(journey) {
  return isDeskJourney(journey?.journeyType) || journey?.journeyType === 'manager';
}

function getActById(actId) {
  return ILLEGAL_ACTS.find((act) => act?.id === actId) || null;
}

/**
 * Reconcile the run's log into `takenActIds`: every temptation the player took
 * (or let stand) counts against them in later odds (priorShortcuts in
 * js/events/odds.js). Declined and set-aside offers do not.
 */
export function reconcileTakenShortcuts(journey) {
  const memory = ensureTemptationMemory(journey);
  for (const entry of journey?.log || []) {
    if (entry?.type !== 'event' || typeof entry.eventId !== 'string') continue;
    const match = entry.eventId.match(/^temptation_(?:reoffer_|goaround_)?(.+)$/);
    if (!match) continue;
    if (entry.optionLabel !== TAKE_LABEL && entry.optionLabel !== LET_IT_STAND_LABEL) continue;
    if (!memory.takenActIds.includes(match[1])) memory.takenActIds.push(match[1]);
  }
  return memory.takenActIds.length;
}

/**
 * Consequences that need more than an odds shift, settled the day after they
 * land: an FPBC complaint puts the registration under review.
 */
function settleTemptationFallout(journey) {
  const memory = ensureTemptationMemory(journey);
  const flags = Array.isArray(journey.consequenceFlags) ? journey.consequenceFlags : [];
  if (flags.includes('fpbc_file_open') && !memory.settledFlags.includes('fpbc_file_open')) {
    memory.settledFlags.push('fpbc_file_open');
    if (journey.professional && journey.professional.registrationStatus === 'active') {
      journey.professional.registrationStatus = 'under-review';
    }
  }
}

/**
 * Whether an act can be offered to this run today. Role and phase come from
 * the library; season, area, difficulty and scrutiny gates are checked here.
 */
export function actMatchesTemptationContext(act, journey) {
  if (!act || act.retired) return false;
  const roleId = getTemptationRoleId(journey);
  if (!actFitsRole(act, roleId)) return false;

  const season = journey?.season?.currentSeason;
  if (Array.isArray(act.seasons) && act.seasons.length && season && !act.seasons.includes(season)) {
    return false;
  }
  const { areaId, areaTags } = resolveJourneyArea(journey);
  if (Array.isArray(act.areaTags) && act.areaTags.length) {
    if (!areaTags.length || !act.areaTags.some((tag) => areaTags.includes(tag))) return false;
  }
  if (Array.isArray(act.areaIds) && act.areaIds.length) {
    if (!areaId || !act.areaIds.includes(areaId)) return false;
  }
  if (act.tier === 'comic' && journey?.difficulty === 'hard') return false;
  if (act.onlyWhen === 'scrutinyHigh' && Number(journey?.scrutiny || 0) < 55) return false;
  return true;
}

/**
 * The run's operating area, whether the journey carries the area object or
 * only its id (createJourney with an areaId leaves journey.area empty).
 */
function resolveJourneyArea(journey) {
  const areaId = journey?.area?.id || journey?.areaId || null;
  const carried = Array.isArray(journey?.area?.tags) ? journey.area.tags : null;
  if (carried?.length) return { areaId, areaTags: carried };
  const area = areaId ? OPERATING_AREAS.find((entry) => entry?.id === areaId) : null;
  return { areaId, areaTags: Array.isArray(area?.tags) ? area.tags : [] };
}

function baseActWeight(act) {
  let weight = act.tier === 'grey' ? GREY_TIER_WEIGHT : 1;
  if (act.rare) weight *= RARE_ACT_WEIGHT;
  return weight;
}

/**
 * Weighted pool: core 1, grey 0.6, rare ×0.25, and the comic tier sized so it
 * lands about 15% of draws whenever the role has any comic acts at all.
 */
export function weightTemptationPool(candidates) {
  const serious = candidates.filter((act) => act.tier !== 'comic');
  const comic = candidates.filter((act) => act.tier === 'comic');
  const seriousTotal = serious.reduce((sum, act) => sum + baseActWeight(act), 0);
  const comicEach = comic.length && seriousTotal > 0
    ? (COMIC_DRAW_SHARE / (1 - COMIC_DRAW_SHARE)) * seriousTotal / comic.length
    : 1;
  return candidates.map((act) => ({
    act,
    weight: act.tier === 'comic' ? comicEach : baseActWeight(act),
  }));
}

function pickWeightedAct(candidates, rng = Math.random) {
  const pool = weightTemptationPool(candidates);
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.act;
  }
  return pool[pool.length - 1].act;
}

/**
 * The payoff, in the role's own currency. `line` is what the option shows.
 * @returns {{effects: Object, line: string}}
 */
export function buildTemptationPayoff(act, journey) {
  const payoff = act?.payoff || { kind: 'progress', amount: 1, line: 'a shift of work' };
  const journeyType = journey?.journeyType || 'field';
  const shift = SHIFT_OF_WORK[journeyType] || 4;
  const amount = Number(payoff.amount) || 1;
  const effects = {};

  const progressForShifts = (shifts) => Math.max(1, Math.round(shift * Math.max(0.25, Math.min(2, shifts))));

  switch (payoff.kind) {
    case 'budget': {
      if (journeyType === 'manager') {
        effects.budget = Math.min(MANAGER_BUDGET_CAP, Math.round(amount * MANAGER_BUDGET_MULTIPLIER));
      } else if (journeyType === 'recon' || journeyType === 'field') {
        effects.budget = Math.min(RECCE_CASH_CAP, Math.round(amount));
      } else {
        effects.budget = Math.round(amount);
      }
      break;
    }
    case 'time':
      // Days of waiting skipped. Two days of waiting is about a shift of the
      // role's own work back; a month is capped at two shifts, because the
      // game's day is one action and a shortcut is not a season.
      effects.progress = progressForShifts(amount / 2);
      break;
    case 'files':
      effects.progress = journeyType === 'permitting' || journeyType === 'desk'
        ? Math.round(shift * amount)
        : progressForShifts(amount);
      break;
    case 'volume':
      if (journeyType === 'manager') {
        effects.budget = Math.min(MANAGER_BUDGET_CAP, Math.round(amount * 5));
      } else {
        effects.progress = progressForShifts(1);
      }
      break;
    case 'progress':
    default:
      effects.progress = progressForShifts(amount);
      break;
  }

  return { effects, line: String(payoff.line || 'a shift of work') };
}

/**
 * What the institution does when it catches you, as effects on the run.
 * Field crews pay in cash, morale and a stop-work; desk roles in budget and
 * standing; the GM at corporate scale.
 */
export function buildCaughtEffects(act, journey) {
  const journeyType = journey?.journeyType || 'field';
  const isDesk = isDeskTemptationJourney(journey);
  const isManager = journeyType === 'manager';
  const money = (field, desk) => {
    if (isManager) return -Math.min(MANAGER_BUDGET_CAP, desk * MANAGER_BUDGET_MULTIPLIER);
    if (isDesk) return -desk;
    if (journeyType === 'silviculture') return -Math.round(desk * 0.6);
    return -Math.min(RECCE_CASH_CAP, field);
  };
  const standing = isDesk ? 'politicalCapital' : 'crew_morale';

  switch (act?.catch?.by) {
    case 'C&E':
      return { compliance: -10, scrutiny: 15, budget: money(800, 3000) };
    case 'FPB':
      return { compliance: -8, scrutiny: 12, reputation: -4 };
    case 'FPBC':
      return { compliance: -6, scrutiny: 14, reputation: -8 };
    case 'WorkSafeBC':
      return { progress: -Math.round((SHIFT_OF_WORK[journeyType] || 4) * 2), crew_morale: -8, compliance: -6, scrutiny: 10 };
    case 'BCWS':
      return { compliance: -8, scrutiny: 12, budget: money(1200, 6000) };
    case 'COS':
      return { compliance: -8, scrutiny: 10, budget: money(600, 2000), [standing]: -4 };
    case 'ENV':
      return { compliance: -8, scrutiny: 12, budget: money(1000, 4000) };
    case 'DFO':
      return { compliance: -10, scrutiny: 14, budget: money(1200, 5000) };
    case 'Archaeology Branch':
      return { compliance: -8, scrutiny: 12, relationships: -6, budget: money(900, 4000) };
    case 'Timber Pricing':
      return { compliance: -6, scrutiny: 12, budget: money(700, 4000) };
    case 'Revenue Branch':
      return { compliance: -8, scrutiny: 14, budget: money(1000, 8000) };
    case 'the Nation':
      return { relationships: -8, compliance: -3, scrutiny: 8, [standing]: -6 };
    case 'RCMP':
      return { compliance: -16, scrutiny: 25, reputation: -12, [standing]: -12 };
    case 'CVSE':
      return { compliance: -4, scrutiny: 6, budget: money(600, 2500), progress: -Math.round((SHIFT_OF_WORK[journeyType] || 4) * 0.5) };
    case 'Transport Canada':
      return { compliance: -6, scrutiny: 8, budget: money(800, 3000) };
    case 'internal audit':
      return { budget: money(600, 3000), [standing]: -8, reputation: -6, scrutiny: 6 };
    case 'the contractor':
      return { crew_morale: -6, reputation: -6, relationships: -5, scrutiny: 6 };
    default:
      return { compliance: -10, scrutiny: 15 };
  }
}

function watchFlagFor(act) {
  return WATCH_FLAG_BY_INSTITUTION[act?.catch?.by] || 'ce_watching';
}

function caughtFlagsFor(act) {
  const flags = [watchFlagFor(act)];
  const extra = CAUGHT_FLAG_BY_INSTITUTION[act?.catch?.by];
  if (extra) flags.push(extra);
  return flags;
}

// Desk-side proposers voiced at a tailgate: the person who would actually be
// standing there, or the one on the other end of the radio.
const FIELD_PROPOSER_VOICE = {
  'the client': "the client's forester, out for the day",
  'the woodlands VP': 'the woodlands VP, on the radio',
  'the appraisal coordinator': 'the appraisal coordinator, on the phone',
  'the CFO': 'the CFO, on the phone',
  'the marketing lead': 'the marketing lead, on the phone',
  'the GIS tech': 'the GIS tech, on the radio',
  'the mill manager': 'the mill manager, on the radio',
};

function describeProposer(act, journey = null) {
  const raw = String(act?.proposer || '');
  const voiced = journey && !isDeskTemptationJourney(journey) ? (FIELD_PROPOSER_VOICE[raw] || raw) : raw;
  return capitalizeProposer(voiced);
}

function isSelfProposed(act) {
  return /^yourself/i.test(String(act?.proposer || ''));
}

function lowerFirst(text) {
  const value = String(text || '').trim();
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * The card's label and body, in the voice of whoever is asking.
 * Field roles hear it at the tailgate; desk roles read it or take the call.
 */
export function describeTemptation(act, journey, { stage = 'offer', reofferPitch = null } = {}) {
  const isDesk = isDeskTemptationJourney(journey);
  const pitch = String(act?.pitch || act?.description || 'Take a shortcut that should not be taken.').trim();
  const what = lowerFirst(act?.description || '');
  const proposer = describeProposer(act, journey);
  const self = isSelfProposed(act);

  let label;
  let lead;
  if (self) {
    label = isDesk ? 'AT YOUR DESK' : 'AT THE TAILGATE';
    lead = `It is 4:45 on a Friday and the thought is yours: “${pitch}”`;
  } else if (isDesk) {
    const byPhone = /super|dispatcher|foreman|contractor|VP|CFO|manager|buyer|rep|engineer|operator/i.test(String(act?.proposer || ''));
    label = byPhone ? 'PHONE CALL' : 'IN THE INBOX';
    lead = byPhone
      ? `${proposer}, on the phone: “${pitch}”`
      : `${proposer}, by email: “${pitch}”`;
  } else {
    label = 'AT THE TAILGATE';
    lead = `${proposer}, at the tailgate: “${pitch}”`;
  }

  const parts = [lead];
  if (stage === 'reoffer' && reofferPitch) {
    parts.push(`Then, the second time of asking: “${reofferPitch}”`);
  }
  if (what) parts.push(`What is actually being asked: ${what}`);
  return { label, description: parts.join(' ') };
}

function buildRefuseOption(act, journey) {
  const memory = ensureTemptationMemory(journey);
  const isDesk = isDeskTemptationJourney(journey);
  const deck = isDesk ? REFUSE_OUTCOMES.desk : REFUSE_OUTCOMES.field;
  const outcome = deck[memory.refuseIndex % deck.length](describeProposer(act, journey));
  memory.refuseIndex += 1;
  return {
    label: isDesk ? 'Decline' : 'Say no',
    outcome,
    effects: {},
    reactionTone: 'steady',
  };
}

function buildReportOption(act, journey) {
  const isDesk = isDeskTemptationJourney(journey);
  const proposer = describeProposer(act, journey);
  return {
    label: isDesk ? 'Document and report' : 'Note it to file, call your super',
    outcome: isDesk
      ? 'A note to file and a two-line email to your manager. Ten minutes, and the only version of today anyone can audit.'
      : `Ten minutes: a line in the daybook and a call to your super. ${isSelfProposed(act) ? 'Writing it down is what makes it not happen.' : `${proposer} hears about it before lunch and does not ask again.`}`,
    effects: isDesk ? { compliance: 2, politicalCapital: 1, timeUsed: 0.5 } : { compliance: 2, timeUsed: 0.5 },
    reactionTone: 'responsible',
  };
}

/**
 * The shortcut as a three-band gamble.
 *
 *   clean   - the payoff, and it stays buried (scrutiny creeps anyway)
 *   noticed - the payoff, and a flag that shifts later odds
 *   caught  - no payoff; the institution named in the act does what it does
 *
 * Odds move on things the player controls: a clean record and standing buy
 * cover; a run already cutting corners, or already being watched, does not.
 */
export function buildShortcutOption(act, journey, { label = TAKE_LABEL, oddsPenalty = 0 } = {}) {
  const memory = ensureTemptationMemory(journey);
  const isDesk = isDeskTemptationJourney(journey);
  const payoff = buildTemptationPayoff(act, journey);
  const category = act?.category || 'corporate';
  const clean = act?.cleanOutcome || CATEGORY_CLEAN_OUTCOMES[category] || CATEGORY_CLEAN_OUTCOMES.corporate;
  const watchFlag = watchFlagFor(act);
  const watchSentence = WATCH_FLAG_SENTENCES[watchFlag] || WATCH_FLAG_SENTENCES.ce_watching;
  const variant = memory.takenActIds.length % 2;

  const tierOdds = act?.tier === 'grey'
    ? { chanceSuccess: 0.6, chancePartial: 0.25 }
    : act?.tier === 'comic'
      ? { chanceSuccess: 0.45, chancePartial: 0.3 }
      : { chanceSuccess: 0.5, chancePartial: 0.3 };
  const chanceSuccess = Math.max(0.1, tierOdds.chanceSuccess - oddsPenalty);

  const option = {
    label,
    outcome: `${clean} You get ${payoff.line}, and nobody asks.`,
    effects: { ...payoff.effects, scrutiny: 3 },
    partialOutcome: `${clean} You get ${payoff.line}. Somebody also wrote down what they saw — ${watchSentence}.`,
    partialEffects: { ...payoff.effects, scrutiny: 8, compliance: -2 },
    partialFlags: [watchFlag],
    failureOutcome: `It does not hold. ${buildCaughtNarrative(act, variant)}`,
    failureEffects: buildCaughtEffects(act, journey),
    failureFlags: caughtFlagsFor(act),
    chanceSuccess,
    chancePartial: tierOdds.chancePartial,
    oddsModifiers: [
      // A dirty file gets less benefit of the doubt.
      { when: 'scrutinyAbove:55', move: 0.15, from: 'good', to: 'bad' },
      { when: 'scrutinyBelow:20', move: 0.10, from: 'bad', to: 'good' },
      // People look the other way for someone they rate (desk lane).
      { when: 'relationshipsAbove:70', move: 0.10, from: 'bad', to: 'good' },
      // Doing it repeatedly is how people get caught.
      { when: 'priorShortcuts:2', move: 0.10, from: 'good', to: 'partial' },
      { when: 'priorShortcuts:4', move: 0.15, from: 'good', to: 'bad' },
      { when: 'difficulty:hard', move: 0.10, from: 'good', to: 'bad' },
      { when: 'difficulty:easy', move: 0.10, from: 'bad', to: 'good' },
      // Somebody is already watching. The institution that would catch this
      // act is the one whose attention hurts most.
      { when: `hasFlag:${watchFlag}`, move: 0.20, from: 'good', to: 'bad' },
      { when: 'hasFlag:ce_watching', move: 0.05, from: 'good', to: 'partial' },
      { when: 'hasFlag:fn_watching', move: 0.05, from: 'good', to: 'partial' },
      { when: 'hasFlag:worksafe_watching', move: 0.05, from: 'good', to: 'partial' },
      { when: 'hasFlag:contractor_owns_you', move: 0.05, from: 'good', to: 'partial' },
    ],
    payoffLine: payoff.line,
    reactionTone: 'compromised',
  };
  if (!isDesk && category === 'safety') option.riskInjury = 0.15;
  // The odds the player actually faces today, not the authored base — shown on
  // the option the way risk chips are (js/events/display.js).
  option.liveOdds = computeBandOdds(option, journey);
  return option;
}

function buildGoAroundEvent(act, journey) {
  const category = act?.category || 'corporate';
  const found = act?.goAround || CATEGORY_GO_AROUND[category] || CATEGORY_GO_AROUND.corporate;
  const proposer = describeProposer(act, journey);
  const isDesk = isDeskTemptationJourney(journey);
  const letItStand = buildShortcutOption(act, journey, { label: LET_IT_STAND_LABEL, oddsPenalty: 0.15 });
  letItStand.outcome = `${act?.cleanOutcome || CATEGORY_CLEAN_OUTCOMES[category] || CATEGORY_CLEAN_OUTCOMES.corporate} You did not do it. You also did not undo it, and that is the version that is true.`;
  letItStand.payoffLine = `${letItStand.payoffLine}, for a thing you did not do`;

  return {
    id: `temptation_goaround_${String(act.id)}`,
    temptationActId: act.id,
    temptationStage: 'goaround',
    title: `${act.title} — Done Anyway`,
    type: 'temptation',
    severity: 'minor',
    probability: 0,
    cardLabel: isDesk ? 'IN THE INBOX' : 'AT THE TAILGATE',
    description: `You set it aside and somebody went around you. ${found} ${proposer} is not answering the radio. The question now is whether you report a thing you did not do.`,
    options: [
      {
        label: 'Report it',
        outcome: `You write it up as found and call it in. It costs you the morning and some goodwill with ${lowerFirst(proposer)}, and it is the only version of this where your name is on the right side.`,
        effects: isDesk
          ? { compliance: 4, politicalCapital: -2, scrutiny: 3, timeUsed: 1 }
          : { compliance: 4, crew_morale: -2, scrutiny: 3, timeUsed: 1 },
        reactionTone: 'responsible',
      },
      {
        label: 'Fix it quietly',
        outcome: 'You put it back the way it was and nobody writes anything down. It is fixed. It is also not on file, and the person who did it knows that you know.',
        effects: isDesk
          ? { progress: -Math.round((SHIFT_OF_WORK[journey.journeyType] || 4) * 0.5), scrutiny: 4, compliance: -2 }
          : { progress: -Math.round((SHIFT_OF_WORK[journey.journeyType] || 4) * 0.5), scrutiny: 4, compliance: -2 },
        flags: ['contractor_owns_you'],
        reactionTone: 'compromised',
      },
      letItStand,
    ],
  };
}

/**
 * Build the day's temptation card from an act.
 * @param {Object} act
 * @param {Object} journey
 * @param {Object} [options]
 * @param {string} [options.stage] offer | reoffer
 */
export function buildTemptationEvent(act, journey, { stage = 'offer' } = {}) {
  const memory = ensureTemptationMemory(journey);
  const reofferPitch = stage === 'reoffer'
    ? REOFFER_PITCHES[memory.seenActIds.length % REOFFER_PITCHES.length]
    : null;
  const { label, description } = describeTemptation(act, journey, { stage, reofferPitch });
  const prefix = stage === 'reoffer' ? 'temptation_reoffer_' : 'temptation_';

  return {
    id: `${prefix}${String(act.id || Math.random().toString(36).slice(2))}`,
    temptationActId: act.id,
    temptationStage: stage,
    title: stage === 'reoffer' ? `${act.title} (Again)` : String(act.title || 'Shady Shortcut'),
    type: 'temptation',
    // Answering never spends the day: saying no is a sentence, and the
    // shortcut itself is the thing that costs.
    severity: 'minor',
    probability: 0,
    cardLabel: label,
    description,
    options: [
      buildRefuseOption(act, journey),
      buildShortcutOption(act, journey),
      buildReportOption(act, journey),
    ],
  };
}

/**
 * Declining to answer a proposal is not the same as answering it. Roll what
 * the proposer does with your silence, queue any follow-up, and hand back the
 * line to print. Costs nothing on the meters: not answering a contractor's
 * illegal proposal does not make the district look harder at you.
 * @returns {{kind: string, message: string}}
 */
export function resolveTemptationSetAside(journey, event, rng = Math.random) {
  const memory = ensureTemptationMemory(journey);
  const act = getActById(event?.temptationActId);
  const proposer = describeProposer(act, journey);
  const day = Number(journey?.day || 1);

  if (event?.temptationStage === 'goaround') {
    if (act?.id && !memory.takenActIds.includes(act.id)) memory.takenActIds.push(act.id);
    return { kind: 'condone', message: 'You say nothing. It stands, and so does your silence.' };
  }

  if (!act) {
    return { kind: 'drop', message: 'You let it sit. By the end of the week nobody mentions it again.' };
  }

  const roll = rng();
  const goaroundOdds = event?.temptationStage === 'reoffer' ? 0.3 : SET_ASIDE_ODDS.goaround;
  const reofferOdds = event?.temptationStage === 'reoffer' ? 0 : SET_ASIDE_ODDS.reoffer;

  if (roll < goaroundOdds) {
    memory.pending.push({ actId: act.id, day: day + 2 + Math.floor(rng() * 3), kind: 'goaround' });
    return { kind: 'goaround', message: `You do not answer. ${proposer} may take that as an answer.` };
  }
  if (roll < goaroundOdds + reofferOdds) {
    memory.pending.push({ actId: act.id, day: day + 2 + Math.floor(rng() * 3), kind: 'reoffer' });
    return { kind: 'reoffer', message: 'You do not answer. That is not the same as it going away.' };
  }
  return { kind: 'drop', message: `You let it sit. ${proposer} does not bring it up again.` };
}

function takePendingTemptation(journey) {
  const memory = ensureTemptationMemory(journey);
  const day = Number(journey?.day || 1);
  const index = memory.pending.findIndex((entry) => Number(entry?.day) <= day);
  if (index === -1) return null;
  const [entry] = memory.pending.splice(index, 1);
  const act = getActById(entry.actId);
  if (!act) return null;
  memory.lastDay = day;
  return entry.kind === 'goaround'
    ? buildGoAroundEvent(act, journey)
    : buildTemptationEvent(act, journey, { stage: 'reoffer' });
}

function maybeCreateTemptationEvent(journey) {
  if (!Array.isArray(ILLEGAL_ACTS) || ILLEGAL_ACTS.length === 0) {
    return null;
  }

  const memory = ensureTemptationMemory(journey);
  reconcileTakenShortcuts(journey);
  settleTemptationFallout(journey);

  // A proposal you set aside comes back before any new one is drawn.
  const pending = takePendingTemptation(journey);
  if (pending) return pending;

  // Cooldown gate: at most one offer per few days, never on day 1. A fresh
  // memory has no previous draw, so it must not accidentally impose a four-day
  // opening lockout.
  const day = Number(journey.day || 1);
  if (day <= 1 || (memory.lastDay > 0 && day - memory.lastDay < TEMPTATION_COOLDOWN_DAYS)) return null;

  const isDesk = isDeskTemptationJourney(journey);
  const baseChance = isDesk ? 0.08 : 0.1;
  const chance = Math.min(0.22, baseChance * getDifficultyEventModifier(journey));
  const guaranteeAfterMisses = 5;
  if (Math.random() > chance && Number(memory.missedEligibleDays || 0) < guaranteeAfterMisses) {
    memory.missedEligibleDays = Number(memory.missedEligibleDays || 0) + 1;
    return null;
  }

  // Role and phase are hard gates: a GM only ever hears the acts tagged for a
  // GM, and a recce lead is never offered a post-harvest crime. There is no
  // fallback to the whole library.
  const candidates = ILLEGAL_ACTS.filter(
    (act) => actMatchesTemptationContext(act, journey) && !memory.seenActIds.includes(act.id)
  );
  if (!candidates.length) return null;

  const act = pickWeightedAct(candidates);
  if (!act) return null;
  memory.lastDay = day;
  memory.missedEligibleDays = 0;
  if (act.id) memory.seenActIds.push(act.id);

  return buildTemptationEvent(act, journey);
}

/**
 * Get pace event probability modifier
 */
export function getPaceEventModifier(paceId) {
  const modifiers = {
    resting: 0.2,
    slow: 0.4,
    normal: 0.6,
    fast: 0.9,
    grueling: 1.3
  };
  return modifiers[paceId] || 0.6;
}

/**
 * Get terrain event probability modifier
 */
export function getTerrainEventModifier(terrain) {
  const modifiers = {
    flat: 0.6,
    hilly: 0.8,
    steep: 1.0,
    muskeg: 1.1,
    river: 1.0,
    cutblock: 0.8
  };
  return modifiers[terrain] || 0.8;
}

/**
 * Get weather event probability modifier
 */
export function getWeatherEventModifier(weatherId) {
  const modifiers = {
    clear: 0.5,
    overcast: 0.7,
    light_rain: 0.9,
    heavy_rain: 1.1,
    fog: 0.9,
    light_snow: 0.9,
    heavy_snow: 1.2,
    freezing: 1.3,
    storm: 1.5
  };
  return modifiers[weatherId] || 0.7;
}
