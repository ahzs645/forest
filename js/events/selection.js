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
import { getApplicableFieldEvents, selectRandomFieldEvent } from '../data/fieldEvents.js';
import { getApplicableDeskEvents, selectRandomDeskEvent } from '../data/deskEvents.js';
import {
  ILLEGAL_ACTS,
  actFitsRole,
  actPremises,
  findIllegalAct,
  buildCaughtNarrative,
  capitalizeProposer,
  CATEGORY_CLEAN_OUTCOMES,
  CATEGORY_GO_AROUND,
  REFUSE_OUTCOMES,
  REOFFER_PITCHES,
  SELF_SET_ASIDE_OUTCOME
} from '../data/illegalActs.js';
import { computeBandOdds, matchesOddsCondition, TEMPTATION_FLAG_LABELS, TEMPTATION_WATCH_FLAGS } from './odds.js';
import { OPERATING_AREAS } from '../data/operatingAreas.js';
import { getDiscoveryEventTypeMultipliers } from '../data/discoveryTags.js';
import { getAreaSituationMultipliers } from '../data/areaSituations.js';
import { describeEffectChips, formatRadioReport } from './display.js';
import { getDayRng } from './dayRng.js';
import { getSignableFiles } from '../journey/permitPipeline.js';
import { actFitsStop, eventFitsStop, isPackageBlock, isPackageClosed } from '../journey/packages.js';
import { falloutLandsIn, getPendingFallout, takeDueFallout } from './fallout.js';
import { applyEventEffects } from './resolution.js';
import { applyConsequenceFlags } from './consequences.js';
import { DESK_RESOURCES, formatDollars } from '../resources.js';
import { getChaseableFiles } from '../journey/permitPipeline.js';

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
function dayCarriesEvent(journey, rng = Math.random) {
  const chance = Math.min(0.85, DAY_HAS_EVENT_CHANCE * getDifficultyEventModifier(journey, 'day'));
  return rng() < chance;
}

/**
 * Check if a random event should occur.
 *
 * The draw rolls on the day's own dice (js/events/dayRng.js), so a reload
 * that replays the morning draws the same situation - or the same quiet day.
 * @param {Object} journey - Current journey state
 * @returns {Object|null} Event to resolve or null
 */
export function checkForEvent(journey) {
  const rng = getDayRng(journey, 'draw');

  // Temptations need their own draw lane. When they were only attempted after
  // the large ordinary-event deck missed, their advertised chance collapsed
  // to a few percent and the added illegal-act library was almost invisible.
  const temptation = maybeCreateTemptationEvent(journey, rng);
  if (temptation) {
    return temptation;
  }

  if (!dayCarriesEvent(journey, rng)) {
    return null;
  }

  if (journey.journeyType === 'manager') {
    return checkManagerEvent(journey, rng);
  }

  const isField = isFieldJourney(journey.journeyType);
  const event = isField ? checkFieldEvent(journey, { rng }) : checkDeskEvent(journey, rng);
  if (event) {
    return isField ? attachFieldReporter(event, journey, rng) : event;
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
function checkManagerEvent(journey, rng = Math.random) {
  const wantsDesk = rng() < MANAGER_DESK_EVENT_RATIO;
  const event = wantsDesk ? checkDeskEvent(journey, rng) : checkFieldEvent(journey, { managerLane: true, rng });
  if (!event) return null;
  return wantsDesk ? event : escalateFieldEventForManager(event, rng);
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

function pickManagerEscalationCaller(event, rng = Math.random) {
  const matched = MANAGER_ESCALATION_CALLERS.filter((caller) => caller.types.includes(event?.type));
  const pool = matched.length ? matched : MANAGER_ESCALATION_CALLERS;
  return pool[Math.floor(rng() * pool.length)];
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
export function escalateFieldEventForManager(event, rng = Math.random) {
  const variant = event.managerVariant || {};
  const variantOptions = Array.isArray(variant.options) ? variant.options : [];
  const caller = pickManagerEscalationCaller(event, rng);
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

// Old Growth recon counts its extra trouble once, on the day gate. At 1.35 on
// both the gate and the card roll a hard traverse drew 23 cards a run against
// normal's 14, and a crew lead who answered every one of them instead of
// setting the late ones aside lost 44% of hard seasons to the layout deadline
// (scripts/simulate-expeditions.mjs --compare, the careful policy). At 1.15 on
// the gate alone a hard run still draws about a fifth more cards than normal
// (17.5 a run against 14.5), on 0.8x stores, and answering every one of them
// wins 86% of hard seasons over 648 runs; the competent lead wins 97%.
const RECON_HARD_DAY_EVENT_MODIFIER = 1.15;

/**
 * @param {Object} journey
 * @param {'day'|'card'} [lane] - the day gate (is there an event today) or
 *   the card roll (which one); recon's hard pressure lives on the gate only
 */
function getDifficultyEventModifier(journey, lane = 'card') {
  switch (journey?.difficulty) {
    case 'easy':
      return 0.75;
    case 'hard':
      if (journey.journeyType === 'recon') return lane === 'day' ? RECON_HARD_DAY_EVENT_MODIFIER : 1;
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

export function eventSupportsJourney(event, journey) {
  if (!event) {
    return false;
  }

  // An event whose premise is a signed permit ("Permit Issued Early") needs a
  // file on the District Manager's desk to sign, or its first line is false.
  if (journey?.permits && event.options?.length
    && event.options.every((option) => Number(option?.effects?.permits_approved) > 0)
    && getSignableFiles(journey).length === 0) {
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

  // A card about the block's own ground stays off bridges and staging lots,
  // and off a block whose package is already closed.
  if (!eventFitsStop(event, options.currentBlock, journey)) return false;

  return true;
}

/**
 * Check for field events
 */
function checkFieldEvent(journey, { managerLane = false, rng = Math.random } = {}) {
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
    if (rng() >= getManagerEscalationChance(journey)) return null;
    return pool[Math.floor(rng() * pool.length)];
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
    typeMultipliers: mergeTypeMultipliers(areaSituation.typeMultipliers, discoveryTypeMultipliers),
    rng
  });
}

/**
 * Check for desk events
 */
function checkDeskEvent(journey, rng = Math.random) {
  const applicableEvents = filterSeenDeskEvents(journey, filterRecentEvents(
    journey,
    getApplicableDeskEvents(journey.currentPhase).filter(
      (event) => eventSupportsJourney(event, journey)
        && eventMatchesJourneyContext(event, journey)
    )
  ));

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

  const event = selectRandomDeskEvent(applicableEvents, {
    stressModifier: stressModifier * moraleModifier * difficultyModifier * scrutinyModifier * areaSituation.eventMultiplier,
    crisisMode: daysRemaining < 3,
    typeMultipliers: mergeTypeMultipliers(typeMultipliers, areaSituation.typeMultipliers, discoveryTypeMultipliers),
    rng
  });
  if (event?.id) rememberDeskEvent(journey, event.id);
  return event;
}

/**
 * A desk run meets each card once. The recent-log cooldown alone let the
 * same audit, court ruling or EAO letter come back ten days later asking a
 * question the player had already answered. The memory lives on the journey
 * (it saves and reloads with it) and only gives way when a run has seen the
 * whole deck.
 */
function filterSeenDeskEvents(journey, events = []) {
  const seen = new Set(journey?.deskEventMemory?.seenIds || []);
  if (!seen.size) return events;
  const fresh = events.filter((event) => event?.id && !seen.has(event.id));
  return fresh.length ? fresh : events;
}

function rememberDeskEvent(journey, eventId) {
  const memory = journey.deskEventMemory || (journey.deskEventMemory = {});
  if (!Array.isArray(memory.seenIds)) memory.seenIds = [];
  if (!memory.seenIds.includes(eventId)) memory.seenIds.push(eventId);
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

function attachFieldReporter(event, journey, rng = Math.random) {
  if (!event || event.type === 'temptation') return event;
  const reporter = pickRandomCrewMember(journey.crew, rng);
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
      task: getRadioTask(reporter, rng)
    }
  };
}

function getRadioTask(member, rng = Math.random) {
  const roleId = member.role || member.roleId;
  const tasks = RADIO_TASKS_BY_ROLE[roleId] || GENERIC_RADIO_TASKS;
  return tasks[Math.floor(rng() * tasks.length)];
}

function pickRandomCrewMember(crew, rng = Math.random) {
  const active = crew.filter(m => m.isActive);
  if (active.length === 0) return null;
  return active[Math.floor(rng() * active.length)];
}

// ── Temptations ─────────────────────────────────────────────────────────────
//
// Somebody on the job proposes a shortcut. The act library (js/data/illegalActs.js)
// carries who asks, what they say, what it is worth in the role's own currency,
// and who in BC actually catches it. This lane turns one act into the day's
// card: a free refusal, a ten-minute note to file, and the shortcut as a
// three-band gamble whose bad band names the institution. A caught band's
// determination lands later, on its own card (js/events/fallout.js).

// Minimum days between shortcut offers, so a higher draw rate reads as texture
// rather than a nag. A GM's day is a month, and six of them made the GM's
// shortcut a once-a-year event.
const TEMPTATION_COOLDOWN_DAYS = 6;
const MANAGER_TEMPTATION_COOLDOWN_MONTHS = 4;

// Chance of an offer on an eligible day. It climbs with every eligible day
// that passes without one and is certain after the last miss. A flat chance
// with a guarantee after five misses put the first offer on day 7 in most
// runs, like a timer; the ramp keeps the same count per run and spreads when.
const TEMPTATION_BASE_CHANCE = { field: 0.1, desk: 0.08, manager: 0.15 };
const TEMPTATION_CHANCE_RAMP = 0.5;
const TEMPTATION_GUARANTEE_AFTER = { field: 9, desk: 9, manager: 6 };

// Share of draws that go to the comic tier when the role has any, and the
// weight of a grey act relative to a core one.
const COMIC_DRAW_SHARE = 0.15;
const GREY_TIER_WEIGHT = 0.6;
const RARE_ACT_WEIGHT = 0.25;

// What a shift of the role's own work is worth in the progress effect that
// resolution.js applies for that journey type: km for recon, program-schedule
// points (8 = a day) for silviculture, gate points for planning, pipeline
// points (5 = a permit clock-day) for permitting, and operational progress
// for the GM.
const SHIFT_OF_WORK = { recon: 4, field: 4, silviculture: 8, planning: 12, desk: 10, permitting: 10, manager: 4 };

// A crew wallet is not where a licensee's saving lands. Money up to this much
// is cash in the truck; anything bigger buys the crew the day it would cost.
const RECCE_CASH_CAP = 1200;
// Penalties are authored at desk scale; a GM pays them at corporate scale.
const MANAGER_PENALTY_MULTIPLIER = 3;
const MANAGER_PENALTY_CAP = 60000;
// What a cubic metre the licence should not have cut is worth to a GM's books.
const MANAGER_VOLUME_MARGIN = 5;

// A planner's time goes to the gate the pitch names, or else to the gate the
// plan is working on.
const PLANNING_GATE_BY_PHASE = { data_gathering: 'data', analysis: 'analysis', stakeholder_review: 'buyIn' };
const PLANNING_GATE_BY_LINE = [
  [/\banalys|\bmodel|timber supply|\bAAC\b/i, 'analysis'],
  [/referral|consult|engagement|comment|sign-off from the Nation/i, 'buyIn'],
  [/\bdata\b|inventory|cruise|survey|layer|\bplots?\b/i, 'data'],
];
const PLANNING_GATE_METRIC = { data: 'dataCompleteness', analysis: 'analysisQuality', buyIn: 'stakeholderBuyIn' };
// Fewer points than this left under a gate's ceiling is not a payoff.
const PLANNING_GATE_MIN_PAYOFF = 4;

/** Points a planning gate can still take before its ceiling. */
function planningGateHeadroom(journey, gate) {
  const metric = PLANNING_GATE_METRIC[gate];
  if (!metric) return 0;
  const value = Number(journey?.plan?.[metric]);
  return Number.isFinite(value) ? Math.max(0, 100 - value) : 100;
}

// A careful record buys cover, but some things are never safe: the least
// chance of being caught, by how serious the act is (js/events/odds.js).
const SERIOUS_CATEGORIES = new Set(['spill', 'riparian', 'archaeology', 'wildlife', 'fire', 'poaching', 'safety', 'herbicide', 'timber-mark']);
const SERIOUS_INSTITUTIONS = new Set(['RCMP', 'DFO', 'ENV', 'Archaeology Branch', 'WorkSafeBC']);
const BAD_BAND_FLOOR = { serious: 0.15, core: 0.1, grey: 0.05, comic: 0.05 };

// How the card names who catches it.
const INSTITUTION_NAMES = {
  'C&E': 'C&E',
  FPB: 'the Forest Practices Board',
  FPBC: 'Forest Professionals BC',
  WorkSafeBC: 'WorkSafeBC',
  BCWS: 'BC Wildfire Service',
  COS: 'the Conservation Officer Service',
  ENV: 'ENV',
  DFO: 'DFO',
  'Archaeology Branch': 'the Archaeology Branch',
  'Timber Pricing': 'Timber Pricing Branch',
  'Revenue Branch': 'Revenue Branch',
  'the Nation': 'the Nation',
  RCMP: 'the RCMP',
  CVSE: 'CVSE',
  'Transport Canada': 'Transport Canada',
  'internal audit': 'internal audit',
  'the contractor': 'the contractor',
};

// Consequence flags a noticed or caught band leaves behind: the catching
// institution's own watch (js/events/odds.js TEMPTATION_WATCH_FLAGS), so the
// mission panel names who is reading the file and only that institution
// reads the next attempt at the same kind of act closely.
// applyConsequenceFlags records any flag it is handed, so they shift later
// gambles without more machinery.
const WATCH_FLAG_BY_INSTITUTION = {
  'C&E': 'ce_watching',
  FPB: 'fpb_watching',
  FPBC: 'fpbc_watching',
  BCWS: 'bcws_watching',
  COS: 'cos_watching',
  ENV: 'env_watching',
  DFO: 'dfo_watching',
  'Archaeology Branch': 'arch_watching',
  'Timber Pricing': 'pricing_watching',
  'Revenue Branch': 'pricing_watching',
  RCMP: 'rcmp_watching',
  CVSE: 'cvse_watching',
  'Transport Canada': 'cvse_watching',
  'the Nation': 'fn_watching',
  WorkSafeBC: 'worksafe_watching',
  'internal audit': 'contractor_owns_you',
  'the contractor': 'contractor_owns_you',
};

const WATCH_FLAG_SENTENCES = {
  ce_watching: 'C&E is now reading everything with your name on it',
  fpb_watching: 'the Forest Practices Board has your file on its list',
  fpbc_watching: 'Forest Professionals BC has a note with your name in it',
  fn_watching: "the Nation's referrals office has a note with your name in it",
  worksafe_watching: "WorkSafeBC's prevention officer has the site on a list",
  bcws_watching: 'the Wildfire Service has the block on a list',
  cos_watching: 'a conservation officer has your plate number',
  env_watching: 'an environmental protection officer has the block on a list',
  dfo_watching: 'a DFO fishery officer has the crossing on a list',
  arch_watching: 'the Archaeology Branch has the block on a list',
  pricing_watching: 'Timber Pricing has your cruises on the check list',
  rcmp_watching: 'the RCMP have a note with your name in it',
  cvse_watching: 'CVSE has the hauling contractor on a list',
  contractor_owns_you: 'the person who did it for you now owns a piece of you',
};

// Days an FPBC complaint file stays open after its determination lands. While
// it is open the registration is under review and no renewal clears it
// (js/engine/professional.js); when the review closes the file is decided,
// the registration can be renewed, and FPBC keeps a note.
const FPBC_REVIEW_DAYS = 8;

// Institutions whose caught band is a criminal or professional-conduct matter
// rather than an administrative one. Their flag outlasts the season: an FPBC
// file keeps the registration under review (js/engine/professional.js), and
// both stand on the mission panel while they are open.
const CAUGHT_FLAG_BY_INSTITUTION = {
  FPBC: 'fpbc_file_open',
  RCMP: 'rcmp_file',
  'the Nation': 'locals_soured',
};

const TAKE_LABEL = 'Take the shortcut';
const LET_IT_STAND_LABEL = 'Let it stand';
const SET_ASIDE_ODDS = { drop: 0.55, reoffer: 0.30, goaround: 0.15 };
// What staying silent about a go-around costs the file (js/journey/daySituation.js
// applies it): less than reporting costs in time and goodwill, more than
// reporting costs the record.
export const GO_AROUND_SILENCE_COST = Object.freeze({ compliance: -2, scrutiny: 3 });
const SHORTCUT_TAG = 'OFF-BOOK';

// What the set-aside option says on each kind of card, so silence is a choice
// the player can read before making it.
const SET_ASIDE_DESCRIPTIONS = {
  offer: 'Do not answer. They may drop it, ask again, or do it without you.',
  reoffer: 'Do not answer. This time they may do it without you.',
  goaround: 'Say nothing. It stands, and your silence counts as a shortcut taken.',
  fallout: 'Leave it unanswered. It lands anyway, and silence reads as contempt.',
};

function ensureTemptationMemory(journey) {
  const memory = journey.temptationMemory || (journey.temptationMemory = {});
  if (!Number.isFinite(memory.lastDay)) memory.lastDay = 0;
  if (!Array.isArray(memory.seenActIds)) memory.seenActIds = [];
  if (!Array.isArray(memory.takenActIds)) memory.takenActIds = [];
  if (!Array.isArray(memory.pending)) memory.pending = [];
  if (!Number.isFinite(memory.missedEligibleDays)) memory.missedEligibleDays = 0;
  if (!Number.isFinite(memory.refuseIndex)) memory.refuseIndex = 0;
  if (!Array.isArray(memory.settledFlags)) memory.settledFlags = [];
  // A save from before the review clock settled the FPBC file with no day on
  // it, and the review never came due. Start the clock at the save's day.
  if (memory.settledFlags.includes('fpbc_file_open') && !Number.isFinite(Number(memory.fpbcFileOpenedDay ?? NaN))) {
    memory.fpbcFileOpenedDay = Number(journey?.day || 1);
  }
  getPendingFallout(journey);
  return memory;
}

function getTemptationRoleId(journey) {
  return journey?.roleId || journey?.role?.id || null;
}

function isDeskTemptationJourney(journey) {
  return isDeskJourney(journey?.journeyType) || journey?.journeyType === 'manager';
}

function getActById(actId) {
  return findIllegalAct(actId);
}

function institutionName(act) {
  return institutionDisplayName(act?.catch?.by);
}

/**
 * How the game names a catching institution in a sentence ("the RCMP",
 * "Forest Professionals BC").
 * @param {string} by - an act's catch.by
 * @returns {string}
 */
export function institutionDisplayName(by) {
  return INSTITUTION_NAMES[by] || 'the district';
}

function sentenceStart(text) {
  const value = String(text || '');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "3 days", "1 shift", "2 months": the run's own unit of time. */
function describeSpan(journey, count) {
  const unit = journey?.journeyType === 'manager'
    ? 'month'
    : ['recon', 'field'].includes(journey?.journeyType) ? 'shift' : 'day';
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

// When a caught shortcut's determination lands, as the queue will land it: a
// letter due after the deadline arrives on the run's last day, so a GM caught
// in month 10 is told two months, not four.
function describeLanding(journey, dueIn, suffix = '') {
  const lands = falloutLandsIn(journey, dueIn);
  const span = `${describeSpan(journey, lands.dueIn)}${suffix ? ` ${suffix}` : ''}`;
  if (!lands.capped) return `about ${span}`;
  return `${span}, in the last ${describeSpan(journey, 1).replace(/^1 /, '')} of the run`;
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
 * land: an FPBC complaint puts the registration under review, and it stays
 * there while the file is open (js/engine/professional.js will not let a
 * renewal restore it).
 */
function settleTemptationFallout(journey) {
  const memory = ensureTemptationMemory(journey);
  const flags = Array.isArray(journey.consequenceFlags) ? journey.consequenceFlags : [];
  const day = Number(journey?.day || 1);
  if (flags.includes('fpbc_file_open') && !memory.settledFlags.includes('fpbc_file_open')) {
    memory.settledFlags.push('fpbc_file_open');
    memory.fpbcFileOpenedDay = day;
    if (journey.professional && journey.professional.registrationStatus !== 'suspended') {
      journey.professional.registrationStatus = 'under-review';
    }
  }
  // The practice review runs its course: the file closes, the registration
  // can be renewed again, and FPBC keeps watching the signature.
  if (flags.includes('fpbc_file_open') && memory.settledFlags.includes('fpbc_file_open')
    && day - (Number(memory.fpbcFileOpenedDay) || day) >= FPBC_REVIEW_DAYS) {
    journey.consequenceFlags = flags.filter((flag) => flag !== 'fpbc_file_open');
    if (!journey.consequenceFlags.includes('fpbc_watching')) journey.consequenceFlags.push('fpbc_watching');
    memory.settledFlags = memory.settledFlags.filter((flag) => flag !== 'fpbc_file_open');
    delete memory.fpbcFileOpenedDay;
    memory.fpbcFileClosedDay = day;
  }
}

/**
 * Days until an open FPBC complaint file is decided, for the desk's own
 * professional-file action to say why a renewal cannot clear the review yet.
 * @param {Object} journey
 * @returns {number|null} null when no file is open
 */
export function fpbcReviewDaysLeft(journey) {
  const flags = Array.isArray(journey?.consequenceFlags) ? journey.consequenceFlags : [];
  if (!flags.includes('fpbc_file_open')) return null;
  const opened = Number(journey?.temptationMemory?.fpbcFileOpenedDay);
  const day = Number(journey?.day || 1);
  if (!Number.isFinite(opened)) return FPBC_REVIEW_DAYS;
  return Math.max(1, FPBC_REVIEW_DAYS - (day - opened));
}

// ── Premises: the thing the pitch is about has to still exist ──────────────
//
// Each check reads a deployment and answers true, false, or null when the
// run does not keep that subject (a desk has no planters, a seasonal fixture
// has no program); null does not gate. Names are the library's ACT_PREMISES.

function silvicultureRun(journey) {
  return journey?.journeyType === 'silviculture' && journey?.planting ? journey : null;
}

function plantingBlocksLeft(journey) {
  return Math.max(0, (Number(journey.planting.blocksToPlant) || 0) - (Number(journey.planting.blocksPlanted) || 0));
}

function permitFileState(journey) {
  return journey?.journeyType === 'permitting' && journey?.permits ? journey.permits : null;
}

const REFERRAL_TYPES = new Set(['CP', 'RP', 'SUP']);

export const ACT_PREMISE_CHECKS = {
  scrutinyHigh: (journey) => Number(journey?.scrutiny || 0) >= 55,
  plantingPending: (journey) => (silvicultureRun(journey) ? plantingBlocksLeft(journey) > 0 : null),
  stockToPlant: (journey) => {
    if (!silvicultureRun(journey)) return null;
    const fillLeft = (Number(journey.planting.fillTarget) || 0) - (Number(journey.planting.fillComplete) || 0);
    return plantingBlocksLeft(journey) > 0 || fillLeft > 0;
  },
  plantersOnHand: (journey) => {
    if (!silvicultureRun(journey) || !Array.isArray(journey.contractors)) return null;
    return journey.contractors.some((contractor) => contractor?.specialty === 'planting'
      && !((Number(contractor.silvicultureState?.cooldownDays) || 0) > 0)
      && contractor.silvicultureState?.status !== 'recovering');
  },
  plantedSome: (journey) => (silvicultureRun(journey)
    ? (Number(journey.planting.blocksPlanted) || 0) > 0 || (Number(journey.planting.seedlingsPlanted) || 0) > 0
    : null),
  plotsDue: (journey) => {
    if (!silvicultureRun(journey) || !Array.isArray(journey.program?.blocks)) return null;
    return journey.program.blocks.some((block) => block?.status === 'planted');
  },
  releaseQueued: (journey) => (silvicultureRun(journey) && journey.brushing
    ? (Number(journey.brushing.hectaresComplete) || 0) < (Number(journey.brushing.hectaresTarget) || 0)
    : null),
  freeGrowingDue: (journey) => (silvicultureRun(journey) && journey.surveys
    ? (Number(journey.surveys.freeGrowingComplete) || 0) < (Number(journey.surveys.freeGrowingTarget) || 0)
    : null),
  fomCommentsOpen: (journey) => {
    if (journey?.journeyType !== 'planning') return null;
    const fom = journey.blockPlanning?.fom;
    return ['public_review', 'revision_required'].includes(fom?.status) && (Number(fom?.commentLoad) || 0) > 0;
  },
  referralAhead: (journey) => {
    const permits = permitFileState(journey);
    if (!permits) return null;
    const files = Array.isArray(permits.files) ? permits.files : [];
    return (Number(permits.backlog) || 0) > 0
      || files.some((file) => ['drafted', 'screening'].includes(file?.lane) && REFERRAL_TYPES.has(file?.type));
  },
  referralOut: (journey) => {
    const permits = permitFileState(journey);
    if (!permits) return null;
    const files = Array.isArray(permits.files) ? permits.files : [];
    return files.some((file) => file?.lane === 'referral') || (Number(permits.inReferral) || 0) > 0;
  },
  // A road blockade comes out of a relationship that has already gone bad.
  relationsStrained: (journey) => {
    if (journey?.journeyType !== 'manager') return null;
    const flags = Array.isArray(journey.consequenceFlags) ? journey.consequenceFlags : [];
    return Number(journey.metrics?.relationships ?? 50) < 45 || flags.includes('locals_soured');
  },
};

/**
 * Whether every premise the act names holds on this run today.
 * @param {Object} act
 * @param {Object} journey
 * @returns {boolean}
 */
export function actPremisesHold(act, journey) {
  return actPremises(act).every((name) => {
    const check = ACT_PREMISE_CHECKS[name];
    return !check || check(journey) !== false;
  });
}

// The planning gates a payoff can land on, and the level at which the
// District Manager counts the gate as met (js/modes/shared/endConditions.js).
const PLANNING_GATE_LEVELS = {
  data: { metric: 'dataCompleteness', met: 80 },
  analysis: { metric: 'analysisQuality', met: 80 },
  buyIn: { metric: 'stakeholderBuyIn', met: 75 },
};

/**
 * Whether the payoff has something to land on today. Ground on the next leg
 * is worth nothing at the last open block, where there is no next leg that
 * matters; a planning gate that is already met, or too full to take the whole
 * payoff, is not a temptation.
 */
function payoffLandsToday(act, journey) {
  const journeyType = journey?.journeyType;
  if (!['recon', 'field', 'planning'].includes(journeyType)) return true;
  const { effects } = buildTemptationPayoff(act, journey);
  if (journeyType === 'planning') {
    return Object.entries(PLANNING_GATE_LEVELS).every(([key, { metric, met }]) => {
      const gain = Number(effects[key]) || 0;
      const level = Number(journey.plan?.[metric]);
      if (gain <= 0 || !Number.isFinite(level)) return true;
      return level < met && level + gain <= 100;
    });
  }
  if (!(Number(effects.progress) > 0)) return true;
  const blocks = Array.isArray(journey.blocks) ? journey.blocks : [];
  if (!blocks.length) return true;
  return blocks.some((block, index) => index !== journey.currentBlockIndex
    && isPackageBlock(block) && !isPackageClosed(journey, block));
}

/** A journey that travels between stops: the crew's current stop matters. */
function isTraverseJourney(journey) {
  return journey?.journeyType === 'recon' || journey?.journeyType === 'field';
}

/**
 * Whether an act can be offered to this run today. Role and phase come from
 * the library; season, area, difficulty, premise, stop and payoff gates are
 * checked here.
 */
export function actMatchesTemptationContext(act, journey) {
  if (!act || act.retired) return false;
  const roleId = getTemptationRoleId(journey);
  if (!actFitsRole(act, roleId)) return false;

  const season = journey?.season?.currentSeason;
  if (Array.isArray(act.seasons) && act.seasons.length && season && !actSeasonFits(act, journey, season)) {
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
  if (!actPremisesHold(act, journey)) return false;
  const stop = isTraverseJourney(journey) && Array.isArray(journey?.blocks) ? journey.blocks[journey.currentBlockIndex] : null;
  if (!actFitsStop(act, stop, journey)) return false;
  if (!payoffLandsToday(act, journey)) return false;
  return true;
}

// A silviculture deployment is the growing season in one run: it opens at
// planting and carries the release and survey work with it (js/season.js
// SEASONAL_MODIFIERS, js/modes/silviculture.js), so an act written for the
// brushing or survey window belongs in front of that supervisor too. Winter
// acts stay winter acts, and so does an act that is also a winter act: that
// is desk-calendar work (next year's regen plan), not the field season.
const GROWING_SEASONS = ['spring', 'summer', 'fall'];
function actSeasonFits(act, journey, season) {
  if (act.seasons.includes(season)) return true;
  return journey?.journeyType === 'silviculture'
    && GROWING_SEASONS.includes(season)
    && !act.seasons.includes('winter')
    && act.seasons.some((entry) => GROWING_SEASONS.includes(entry));
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

/** Room left under the desk budget's ceiling (js/resources.js). */
function deskBudgetHeadroom(journey) {
  const budget = Number(journey?.resources?.budget);
  if (!Number.isFinite(budget)) return Infinity;
  return Math.max(0, DESK_RESOURCES.budget.max - budget);
}

/**
 * Permit clock-days a payoff could bring forward today: every live clock can
 * come forward to tonight and no further (js/journey/permitPipeline.js).
 */
function permitClockCapacity(journey) {
  if (!journey?.permits) return Infinity;
  const day = Number(journey.day) || 1;
  return getChaseableFiles(journey, PERMIT_CLOCK_LANES)
    .reduce((sum, file) => sum + Math.max(0, file.clockCloses - day), 0);
}
const PERMIT_CLOCK_LANES = ['screening', 'referral', 'decision'];

/**
 * The payoff, in the role's own currency, sized so that what the card promises
 * is what lands. `line` is the act's own words; `effects` is the one source
 * for the chip, the stakes line and the outcome. `deliverable` is false when
 * nothing today can take the payoff (no permit clock running, no room left
 * under the budget ceiling), and such an act is not offered today.
 *
 * Money is paid as authored: a GM is offered "$25,000 of pulp" and gets
 * $25,000, not three times it. A recce crew is paid cash only when the sum
 * fits a truck wallet; a planner is paid in the gate the plan is on; a
 * permitter in clock-days, never more than the queue can take.
 * @returns {{effects: Object, line: string, deliverable: boolean}}
 */
export function buildTemptationPayoff(act, journey) {
  const payoff = act?.payoff || { kind: 'progress', amount: 1, line: 'a shift of work' };
  const journeyType = journey?.journeyType || 'field';
  const shift = SHIFT_OF_WORK[journeyType] || 4;
  const amount = Number(payoff.amount) || 1;
  const kind = payoff.kind || 'progress';
  const effects = {};

  const progressForShifts = (shifts) => Math.max(1, Math.round(shift * Math.max(0.25, Math.min(2, shifts))));
  // Days of waiting skipped: two are about a shift of the role's own work
  // back, capped at two shifts, because the game's day is one action and a
  // shortcut is not a season. Volume outside the GM's books is a shift.
  const shifts = kind === 'time' ? amount / 2 : kind === 'volume' ? 1 : amount;
  const isMoney = kind === 'budget' || (kind === 'volume' && journeyType === 'manager');

  if (isMoney) {
    const dollars = Math.round(kind === 'volume' ? amount * MANAGER_VOLUME_MARGIN : amount);
    if (journeyType === 'recon' || journeyType === 'field') {
      if (dollars <= RECCE_CASH_CAP) effects.budget = dollars;
      else effects.progress = progressForShifts(1);
    } else if (isDeskJourney(journeyType)) {
      effects.budget = Math.min(dollars, deskBudgetHeadroom(journey));
    } else {
      effects.budget = dollars;
    }
  } else if (journeyType === 'planning') {
    // The gate the pitch names ("the analysis clears"), else the one the plan
    // is on, and only as much as that gate can still take: a gate already
    // full cannot be paid, and the chip must not promise what cannot land.
    // Past the gates it is the planner's own time back.
    const wanted = progressForShifts(shifts);
    const named = PLANNING_GATE_BY_LINE.find(([pattern]) => pattern.test(String(payoff.line || '')))?.[1];
    const gates = [...new Set([named, PLANNING_GATE_BY_PHASE[journey?.plan?.phase]].filter(Boolean))];
    const open = gates.find((gate) => planningGateHeadroom(journey, gate) >= PLANNING_GATE_MIN_PAYOFF);
    if (open) effects[open] = Math.min(wanted, planningGateHeadroom(journey, open));
    else effects.progress = wanted;
  } else if (journeyType === 'permitting' || journeyType === 'desk') {
    const wanted = kind === 'files' ? Math.round(shift * amount) : progressForShifts(shifts);
    const clockDays = Math.min(4, Math.max(1, Math.round(wanted / 5)), permitClockCapacity(journey));
    if (clockDays > 0) effects.progress = clockDays * 5;
  } else {
    effects.progress = progressForShifts(shifts);
  }

  return {
    effects,
    line: String(payoff.line || 'a shift of work'),
    deliverable: Object.values(effects).some((value) => Number(value) > 0),
  };
}

/**
 * What the institution decides when it catches you, as effects on the run.
 * Every catcher has a cost mix that reads as what it does: fines and orders
 * cost money, stop-work and paused files cost the role's own work, standing
 * and scrutiny carry the rest. Field crews pay at wallet scale, desk roles in
 * budget and standing, the GM at corporate scale.
 */
export function buildCaughtEffects(act, journey) {
  const journeyType = journey?.journeyType || 'field';
  const isDesk = isDeskTemptationJourney(journey);
  const isManager = journeyType === 'manager';
  const money = (field, desk) => {
    if (isManager) return -Math.min(MANAGER_PENALTY_CAP, desk * MANAGER_PENALTY_MULTIPLIER);
    if (isDesk) return -desk;
    if (journeyType === 'silviculture') return -Math.round(desk * 0.6);
    return -Math.min(RECCE_CASH_CAP, field);
  };
  const standing = isDesk ? 'politicalCapital' : 'crew_morale';
  const shifts = (count) => -Math.round((SHIFT_OF_WORK[journeyType] || 4) * count);
  const determination = institutionDetermination(act, money, standing, shifts);

  // A serious act (badBandFloorFor's highest floor: harm, or a criminal or
  // federal catcher) caught must cost more than it would have paid. The
  // institution's own cost mix is the floor; the payoff sets the rest, so a
  // buried spill worth $12,000 is not a $4,000 fine.
  if (badBandFloorFor(act) >= BAD_BAND_FLOOR.serious) {
    const payoff = buildTemptationPayoff(act, journey).effects;
    if (payoff.budget > 0) {
      const owed = Math.round(payoff.budget * SERIOUS_CATCH_PAYBACK);
      const cap = journeyType === 'recon' || journeyType === 'field' ? RECCE_CASH_CAP : isManager ? MANAGER_PENALTY_CAP : Infinity;
      determination.budget = Math.min(determination.budget || 0, -Math.min(cap, owed));
    }
    if (payoff.progress > 0) {
      determination.progress = Math.min(determination.progress || 0, -payoff.progress);
    }
    for (const gate of ['data', 'analysis', 'buyIn']) {
      if (payoff[gate] > 0) determination[gate] = Math.min(determination[gate] || 0, -payoff[gate]);
    }
  }
  return determination;
}

// What a serious catch costs in the payoff's own currency, as a multiple of
// the payoff: the fine takes the money back and then some.
const SERIOUS_CATCH_PAYBACK = 1.5;

function institutionDetermination(act, money, standing, shifts) {
  switch (act?.catch?.by) {
    case 'C&E':
      return { compliance: -10, scrutiny: 15, budget: money(800, 3000) };
    case 'FPB':
      // The Board cannot fine; answering its investigation still costs.
      return { compliance: -8, scrutiny: 12, reputation: -4, budget: money(500, 2500) };
    case 'FPBC':
      // Counsel for the practice review, and the cost award behind it.
      return { compliance: -6, scrutiny: 14, reputation: -8, budget: money(400, 2000) };
    case 'WorkSafeBC':
      return { progress: shifts(2), crew_morale: -8, compliance: -6, scrutiny: 10, budget: money(800, 4000) };
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
      // Every file with your name on it waits for a meeting.
      return { relationships: -8, compliance: -3, scrutiny: 8, [standing]: -6, progress: shifts(1), budget: money(500, 2500) };
    case 'RCMP':
      return { compliance: -16, scrutiny: 25, reputation: -12, [standing]: -12, budget: money(1200, 6000) };
    case 'CVSE':
      return { compliance: -4, scrutiny: 6, budget: money(600, 2500), progress: shifts(0.5) };
    case 'Transport Canada':
      return { compliance: -6, scrutiny: 8, budget: money(800, 3000) };
    case 'internal audit':
      return { budget: money(600, 3000), [standing]: -8, reputation: -6, scrutiny: 6 };
    case 'the contractor':
      // The contractor bills for their silence, or for the redo.
      return { crew_morale: -6, reputation: -6, relationships: -5, scrutiny: 6, budget: money(600, 3000) };
    default:
      return { compliance: -10, scrutiny: 15 };
  }
}

function watchFlagFor(act) {
  return WATCH_FLAG_BY_INSTITUTION[act?.catch?.by] || 'ce_watching';
}

/** Who is now watching, named for the institution that noticed. */
function watchSentenceFor(act) {
  const flag = watchFlagFor(act);
  return WATCH_FLAG_SENTENCES[flag]
    || `${institutionName(act)} is now reading everything with your name on it`;
}

function caughtFlagsFor(act) {
  const flags = [watchFlagFor(act)];
  const extra = CAUGHT_FLAG_BY_INSTITUTION[act?.catch?.by];
  if (extra) flags.push(extra);
  return flags;
}

/**
 * The least chance of being caught this act ever carries. Serious harm and
 * criminal or federal catchers get the highest floor; grey and comic acts
 * the lowest.
 * @param {Object} act
 * @returns {number}
 */
export function badBandFloorFor(act) {
  if (act?.tier === 'comic') return BAD_BAND_FLOOR.comic;
  if (SERIOUS_CATEGORIES.has(act?.category) || SERIOUS_INSTITUTIONS.has(act?.catch?.by)) return BAD_BAND_FLOOR.serious;
  if (act?.tier === 'grey') return BAD_BAND_FLOOR.grey;
  return BAD_BAND_FLOOR.core;
}

/**
 * How long the institution takes to decide, in the run's own days (months for
 * a GM). `catch.lagDays` is real time; a deployment compresses it about seven
 * to one so a six-week determination still lands inside the season. Zero
 * means it lands the same day.
 * @param {Object} act
 * @param {Object} journey
 * @returns {number}
 */
export function catchDelayFor(act, journey) {
  const lag = Math.max(0, Number(act?.catch?.lagDays) || 0);
  if (journey?.journeyType === 'manager') return Math.min(6, Math.round(lag / 30));
  // A desk file is often closed by day 15 of 30, so its determinations are
  // capped shorter, or a catch in the middle of the run landed only as a
  // line in the debrief. One the run still ends before settles at close.
  const cap = isDeskJourney(journey?.journeyType) ? DESK_CATCH_DELAY_CAP : 8;
  return Math.min(cap, Math.round(lag / 7));
}
const DESK_CATCH_DELAY_CAP = 5;

// Desk-side proposers voiced at a tailgate: the person who would actually be
// standing there. Plain noun phrases, because the card adds ", at the
// tailgate:" and the refusal and set-aside lines use the name as a subject.
const FIELD_PROPOSER_VOICE = {
  'the client': "the client's forester",
  'the woodlands VP': 'the visiting woodlands VP',
  'the appraisal coordinator': 'the visiting appraisal coordinator',
  'the CFO': 'the visiting CFO',
  'the marketing lead': 'the visiting marketing lead',
  'the GIS tech': 'the visiting GIS tech',
  'the mill manager': 'the visiting mill manager',
};

function describeProposer(act, journey = null) {
  const raw = String(act?.proposer || '');
  const voiced = journey && !isDeskTemptationJourney(journey) ? (FIELD_PROPOSER_VOICE[raw] || raw) : raw;
  return capitalizeProposer(voiced);
}

function isSelfProposed(act) {
  return /^yourself/i.test(String(act?.proposer || ''));
}

/** A desk card from someone who picks up the phone rather than writes. */
function isProposedByPhone(act) {
  return /super|dispatcher|foreman|contractor|VP|CFO|manager|buyer|rep|engineer|operator/i.test(String(act?.proposer || ''));
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
    const byPhone = isProposedByPhone(act);
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
  // A phone call is not declined by closing an email.
  const deskDeck = isProposedByPhone(act) ? REFUSE_OUTCOMES.phone : REFUSE_OUTCOMES.desk;
  const deck = isSelfProposed(act) ? REFUSE_OUTCOMES.self : isDesk ? deskDeck : REFUSE_OUTCOMES.field;
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
  // A GM has no manager to email; the board's audit chair is who hears it.
  const deskNote = journey?.journeyType === 'manager'
    ? 'A note to file and a two-line email to the chair of the audit committee. Ten minutes, and the only version of this month anyone can audit.'
    : 'A note to file and a two-line email to your manager. Ten minutes, and the only version of today anyone can audit.';
  return {
    label: isDesk ? 'Document and report' : 'Note it to file, call your super',
    outcome: isDesk
      ? deskNote
      : `Ten minutes: a line in the daybook and a call to your super. ${isSelfProposed(act) ? 'Writing it down is what makes it not happen.' : `${proposer} hears about it before lunch and does not ask again.`}`,
    effects: isDesk ? { compliance: 2, politicalCapital: 1, timeUsed: 0.5 } : { compliance: 2, timeUsed: 0.5 },
    reactionTone: 'responsible',
  };
}

// The odds-shift predicates the shortcut uses, as the reason the card gives
// when they are in play today.
function describeOddsShift(when, journey) {
  const [key, arg] = String(when).split(':');
  switch (key) {
    case 'scrutinyAbove': return 'your file is already under scrutiny';
    case 'scrutinyBelow': return 'your record is clean';
    // It reads the desk's district goodwill, not the year's Relationships
    // meter, so it names what it read and the value it read.
    case 'relationshipsAbove':
      return `the district office's goodwill on this file is ${Math.round(Number(journey?.resources?.politicalCapital) || 0)}`;
    case 'priorShortcuts': {
      const taken = journey?.temptationMemory?.takenActIds?.length || Number(arg) || 0;
      return `you have taken ${taken} shortcut${taken === 1 ? '' : 's'} already`;
    }
    case 'difficulty': return arg === 'hard' ? 'Old Growth: nobody gives the benefit of the doubt' : 'Greenhorn: people give the benefit of the doubt';
    case 'hasFlag': return TEMPTATION_FLAG_LABELS[arg] || null;
    default: return null;
  }
}

/**
 * Which of today's odds shifts are in play, as reasons, so a jump from 60% to
 * 25% clean between two offers is never unexplained.
 * @returns {{worse: string[], better: string[]}}
 */
function describeOddsShifts(option, journey) {
  const worse = [];
  const better = [];
  for (const modifier of option.oddsModifiers || []) {
    if (!matchesOddsCondition(modifier.when, journey)) continue;
    const reason = describeOddsShift(modifier.when, journey);
    if (!reason) continue;
    const list = modifier.to === 'good' ? better : worse;
    if (!list.includes(reason)) list.push(reason);
  }
  return { worse, better };
}

/**
 * The shortcut as a three-band gamble.
 *
 *   clean   - the payoff, and it stays buried (scrutiny creeps anyway)
 *   noticed - the payoff, and a flag that shifts later odds
 *   caught  - no payoff; the institution named in the act finds it, and its
 *             determination lands `catch.lagDays` later (scaled to the run)
 *             as its own card (js/events/fallout.js)
 *
 * Odds move on things the player controls: a clean record and standing buy
 * cover; a run already cutting corners, or already being watched, does not.
 * The bad band never falls below the act's floor (badBandFloorFor).
 */
export function buildShortcutOption(act, journey, { label = TAKE_LABEL, oddsPenalty = 0 } = {}) {
  const memory = ensureTemptationMemory(journey);
  const isDesk = isDeskTemptationJourney(journey);
  const payoff = buildTemptationPayoff(act, journey);
  const category = act?.category || 'corporate';
  const clean = act?.cleanOutcome || CATEGORY_CLEAN_OUTCOMES[category] || CATEGORY_CLEAN_OUTCOMES.corporate;
  const watchFlag = watchFlagFor(act);
  const variant = memory.takenActIds.length % 2;
  const catcher = institutionName(act);

  const tierOdds = act?.tier === 'grey'
    ? { chanceSuccess: 0.6, chancePartial: 0.25 }
    : act?.tier === 'comic'
      ? { chanceSuccess: 0.45, chancePartial: 0.3 }
      : { chanceSuccess: 0.5, chancePartial: 0.3 };
  const chanceSuccess = Math.max(0.1, tierOdds.chanceSuccess - oddsPenalty);

  const option = {
    label,
    outcome: `${clean} What you get: ${payoff.line}. Nobody asks.`,
    effects: { ...payoff.effects, scrutiny: 3 },
    partialOutcome: `${clean} What you get: ${payoff.line}. Somebody also wrote down what they saw: ${watchSentenceFor(act)}.`,
    partialEffects: { ...payoff.effects, scrutiny: 8, compliance: -2 },
    partialFlags: [watchFlag],
    chanceSuccess,
    chancePartial: tierOdds.chancePartial,
    badFloor: badBandFloorFor(act),
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
      // act is the one whose attention hurts most; any other watch makes it
      // a little likelier that somebody writes down what they saw.
      { when: `hasFlag:${watchFlag}`, move: 0.20, from: 'good', to: 'bad' },
      ...TEMPTATION_WATCH_FLAGS
        .filter((flag) => flag !== watchFlag)
        .map((flag) => ({ when: `hasFlag:${flag}`, move: 0.05, from: 'good', to: 'partial' })),
    ],
    payoffLine: payoff.line,
    caughtBy: catcher,
    riskTag: SHORTCUT_TAG,
    reactionTone: 'compromised',
  };

  // The caught band. When the institution takes time to decide, today is
  // only the finding: no payoff, a first look at the file, and the watch
  // flag. The determination waits in the fallout queue and lands as its own
  // card. A same-week catch settles here, as it always did.
  const determination = buildCaughtEffects(act, journey);
  const delay = catchDelayFor(act, journey);
  if (delay >= 1) {
    const how = String(act?.catch?.how || '').trim();
    // The Forest Practices Board audits, investigates and reports; it does
    // not decide penalties, so what lands from it is a report.
    const lands = act?.catch?.by === 'FPB' ? 'its report' : 'the determination';
    option.failureOutcome = `It does not hold. ${how} ${sentenceStart(catcher)} has it now, and ${lands} lands in ${describeLanding(journey, delay)}.`;
    option.failureEffects = { scrutiny: 5 };
    option.failureFlags = [watchFlag];
    option.failureFallout = {
      actId: act.id,
      title: act.title,
      institution: act?.catch?.by || null,
      dueIn: delay,
      effects: determination,
      flags: caughtFlagsFor(act),
      variant,
    };
  } else {
    option.failureOutcome = `It does not hold. ${buildCaughtNarrative(act, variant)}`;
    option.failureEffects = determination;
    option.failureFlags = caughtFlagsFor(act);
  }

  if (!isDesk && category === 'safety') option.riskInjury = 0.15;
  // The odds the player actually faces today, not the authored base — shown on
  // the option the way risk chips are (js/events/display.js), with the
  // reasons they moved.
  option.liveOdds = computeBandOdds(option, journey);
  option.oddsShifts = describeOddsShifts(option, journey);
  return option;
}

/**
 * The stakes, in plain words, under the pitch: what you get, what each band
 * costs, who catches it and when that lands, and why today's odds are what
 * they are. Every number comes from the option's own effects, so the stakes,
 * the chip and the outcome agree.
 * @param {Object} option - from buildShortcutOption
 * @param {Object} journey
 * @returns {string[]}
 */
export function describeShortcutStakes(option, journey) {
  const journeyType = journey?.journeyType || 'field';
  // One projection of the clean band: the payoff chips, and the scrutiny it
  // carries either way (the authored +3, plus what a large payoff draws).
  const { scrutiny: _cleanScrutiny, ...payoffEffects } = option.effects || {};
  const cleanChips = describeEffectChips(option.effects || {}, journeyType);
  const scrutinyChip = cleanChips.find((chip) => / scrutiny$/.test(chip));
  const gain = cleanChips.filter((chip) => chip !== scrutinyChip).join(', ') || 'nothing you can bank today';
  const buried = scrutinyChip ? ` (${scrutinyChip} even if it stays buried)` : '';
  const pct = (value) => Math.round((Number(value) || 0) * 100);
  const odds = option.liveOdds || { good: 1, partial: 0, bad: 0 };
  const good = pct(odds.good);
  const bad = pct(odds.bad);
  const partial = Math.max(0, 100 - good - bad);
  // What the noticed band costs on top of the payoff, as it lands: the
  // authored "-2 compliance, +8 scrutiny" is +11 scrutiny once compliance
  // moves it, and on a permitting desk -2 goodwill too.
  const noticedCosts = Object.fromEntries(Object.entries(option.partialEffects || {})
    .filter(([key]) => !(key in payoffEffects)));
  const noticed = describeEffectChips(noticedCosts, journeyType);
  const watch = TEMPTATION_FLAG_LABELS[option.partialFlags?.[0]] || 'a watch on your file';
  const finding = option.failureFallout ? describeEffectChips(option.failureEffects || {}, journeyType).join(', ') : '';
  const determination = option.failureFallout?.effects || option.failureEffects || {};
  const caught = describeEffectChips(determination, journeyType).join(', ');
  const when = option.failureFallout ? `, landing ${describeLanding(journey, option.failureFallout.dueIn, 'later')}` : '';
  const caughtFlags = (option.failureFallout?.flags || option.failureFlags || [])
    .map((flag) => TEMPTATION_FLAG_LABELS[flag]).filter(Boolean);
  const record = caughtFlags.length ? `; on your record: ${caughtFlags.join(', ')}` : '';
  const caughtText = finding
    ? `no payoff; ${finding} today, then ${caught}${when}${record}`
    : `no payoff; ${caught}${record}`;

  const lines = [
    `Take it and you get ${gain}${buried}. Saying no costs nothing.`,
    `Odds today: ${good}% it stays buried · ${partial}% somebody notices (${[...noticed, `and ${watch}`].join(', ')}) · ${bad}% ${option.caughtBy || 'somebody'} catches it (${caughtText}).`,
  ];
  const shifts = option.oddsShifts || { worse: [], better: [] };
  if (shifts.worse.length) lines.push(`Worse odds today because ${shifts.worse.join('; ')}.`);
  if (shifts.better.length) lines.push(`Better odds today because ${shifts.better.join('; ')}.`);
  return lines;
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
    cardMarker: 'SHORTCUT',
    // Silence has a price, and the card says it as it lands.
    setAsideDescription: `${SET_ASIDE_DESCRIPTIONS.goaround} It costs ${describeEffectChips(GO_AROUND_SILENCE_COST, journey.journeyType).join(', ')}.`,
    description: `You set it aside and somebody went around you. ${found} ${proposer} is not answering the radio. The question now is whether you report a thing you did not do.`,
    options: [
      {
        // Reporting a thing you did not do costs the morning and some
        // goodwill, never scrutiny: a self-reported contravention is the one
        // the district reads as a clean file. Silence is what draws scrutiny
        // (resolveTemptationSetAside).
        label: 'Report it',
        outcome: `You write it up as found and call it in. It costs you the morning and some goodwill with ${lowerFirst(proposer)}, and it is the only version of this where your name is on the right side.`,
        effects: isDesk
          ? { compliance: 4, politicalCapital: -2, timeUsed: 1 }
          : { compliance: 4, crew_morale: -2, timeUsed: 1 },
        reactionTone: 'responsible',
      },
      {
        label: 'Fix it quietly',
        outcome: 'You put it back the way it was and nobody writes anything down. It is fixed. It is also not on file, and the person who did it knows that you know.',
        effects: { progress: -Math.round((SHIFT_OF_WORK[journey.journeyType] || 4) * 0.5), scrutiny: 4, compliance: -2 },
        flags: ['contractor_owns_you'],
        riskTag: SHORTCUT_TAG,
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
  const shortcut = buildShortcutOption(act, journey);

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
    // What the card is, before who is asking: an offer to break a rule
    // (js/journey/dayCard.js frames it).
    cardMarker: 'SHORTCUT',
    description,
    stakes: describeShortcutStakes(shortcut, journey),
    setAsideDescription: stage === 'reoffer' ? SET_ASIDE_DESCRIPTIONS.reoffer : SET_ASIDE_DESCRIPTIONS.offer,
    options: [
      buildRefuseOption(act, journey),
      shortcut,
      buildReportOption(act, journey),
    ],
  };
}

/**
 * The determination behind a caught shortcut, as the day's card. It names the
 * day and the act it comes from, so the cost is visibly the choice's.
 * @param {Object} entry - from js/events/fallout.js
 * @param {Object} journey
 * @returns {Object} event
 */
export function buildFalloutEvent(entry, journey) {
  const act = getActById(entry.actId)
    || { id: entry.actId, title: entry.title || 'a shortcut', catch: { by: entry.institution } };
  const isDesk = isDeskTemptationJourney(journey);
  // A determination carried across a campaign season names the season.
  const when = entry.takenWhen
    ? `Back in ${entry.takenWhen},`
    : `Back on ${describeSpan(journey, 1).replace(/^1 /, '')} ${entry.takenDay}`;
  const lead = `${when} you took the shortcut on “${act.title}”, and it was found.`;
  const narrative = buildCaughtNarrative({ ...act, catch: { ...(act.catch || {}), how: lead } }, entry.variant);
  const effects = { ...(entry.effects || {}) };
  const costs = describeEffectChips(effects, journey?.journeyType).join(', ');
  // A purse too thin for the fine gives up what it has, so say so rather than
  // print a figure the ledger then does not charge.
  const purse = Number(journey?.resources?.budget);
  const fine = -Number(effects.budget);
  const shortfall = fine > 0 && Number.isFinite(purse) && purse < fine
    ? ` You have ${formatDollars(Math.max(0, purse))}; it takes all of it.`
    : '';

  return {
    id: `temptation_fallout_${String(act.id)}`,
    temptationActId: act.id,
    temptationStage: 'fallout',
    title: `Fallout: ${act.title}`,
    type: 'temptation',
    severity: 'minor',
    probability: 0,
    cardLabel: isDesk ? 'IN THE INBOX' : 'ON THE RADIO',
    cardMarker: 'FALLOUT',
    description: narrative,
    stakes: costs ? [`${act?.catch?.by === 'FPB' ? 'What answering the Board’s report costs' : 'What it costs'}: ${costs}.${shortfall}`] : [],
    setAsideDescription: SET_ASIDE_DESCRIPTIONS.fallout,
    options: [{
      label: 'Answer for it',
      outcome: 'You answer it in writing, on time, and do not argue the facts. It costs what it costs, and the file says you took responsibility.',
      effects,
      flags: [...(entry.flags || [])],
      reactionTone: 'silent',
    }],
  };
}

/**
 * Declining to answer a proposal is not the same as answering it. Roll what
 * the proposer does with your silence, queue any follow-up, and hand back the
 * line to print. Costs nothing on the meters: not answering a contractor's
 * illegal proposal does not make the district look harder at you. A
 * determination left unanswered is the exception: it lands anyway.
 * @returns {{kind: string, message: string}}
 */
export function resolveTemptationSetAside(journey, event, rng = Math.random) {
  const memory = ensureTemptationMemory(journey);
  const act = getActById(event?.temptationActId);
  const proposer = describeProposer(act, journey);
  const day = Number(journey?.day || 1);

  if (event?.temptationStage === 'fallout') {
    const answer = event.options?.[0] || {};
    const effects = { ...(answer.effects || {}), scrutiny: (Number(answer.effects?.scrutiny) || 0) + 4 };
    const messages = [];
    applyEventEffects(journey, effects, messages);
    applyConsequenceFlags(journey, answer.flags || [], messages);
    const outcome = 'You leave it unanswered. It is decided without you, and that reads worse.';
    if (!journey.log) journey.log = [];
    journey.log.push({
      day,
      type: 'event',
      eventId: event.id,
      eventTitle: event.title,
      optionLabel: 'Set it aside',
      setAside: true,
      outcome,
      consequences: messages,
      effects,
      severity: event.severity,
    });
    return { kind: 'unanswered', message: [outcome, ...messages].join(' ') };
  }

  // Setting aside a thing already done is condoning it: it counts as a prior
  // shortcut for later odds, and it costs the file what silence costs — the
  // record now has a contravention in it that you knew about and did not
  // report. Letting it stand (the gamble) is the only way it pays.
  if (event?.temptationStage === 'goaround') {
    if (act?.id && !memory.takenActIds.includes(act.id)) memory.takenActIds.push(act.id);
    return {
      kind: 'condone',
      message: 'You say nothing. It stands, and so does your silence. The file has a contravention in it now, and your name is the one that knew.',
      effects: { ...GO_AROUND_SILENCE_COST },
      flags: ['contractor_owns_you'],
    };
  }

  if (!act) {
    return { kind: 'drop', message: 'You let it sit. By the end of the week nobody mentions it again.' };
  }
  // Nobody else proposed it, so nobody asks again or goes around you.
  if (isSelfProposed(act)) {
    return { kind: 'drop', message: SELF_SET_ASIDE_OUTCOME };
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
  // Nobody asks again about planting that is finished or comments that were
  // answered. A go-around is about what was already done, so it still lands.
  if (entry.kind !== 'goaround' && !actPremisesHold(act, journey)) return null;
  memory.lastDay = day;
  return entry.kind === 'goaround'
    ? buildGoAroundEvent(act, journey)
    : buildTemptationEvent(act, journey, { stage: 'reoffer' });
}

function temptationLane(journey) {
  if (journey?.journeyType === 'manager') return 'manager';
  return isDeskJourney(journey?.journeyType) ? 'desk' : 'field';
}

/**
 * Today's chance of a fresh offer, given how many eligible days have passed
 * without one.
 * @param {Object} journey
 * @returns {number} 1 once the guarantee is reached
 */
export function getTemptationChance(journey) {
  const lane = temptationLane(journey);
  const misses = Number(journey?.temptationMemory?.missedEligibleDays || 0);
  if (misses >= TEMPTATION_GUARANTEE_AFTER[lane]) return 1;
  const chance = TEMPTATION_BASE_CHANCE[lane] * getDifficultyEventModifier(journey) * (1 + TEMPTATION_CHANCE_RAMP * misses);
  return Math.min(0.9, chance);
}

function maybeCreateTemptationEvent(journey, rng = Math.random) {
  if (!Array.isArray(ILLEGAL_ACTS) || ILLEGAL_ACTS.length === 0) {
    return null;
  }

  const memory = ensureTemptationMemory(journey);
  reconcileTakenShortcuts(journey);
  settleTemptationFallout(journey);

  // A determination that has come due is the day, ahead of anything else.
  const due = takeDueFallout(journey);
  if (due) return buildFalloutEvent(due, journey);

  // A proposal you set aside comes back before any new one is drawn.
  const pending = takePendingTemptation(journey);
  if (pending) return pending;

  // Cooldown gate: at most one offer per few days, never on day 1. A fresh
  // memory has no previous draw, so it must not accidentally impose a four-day
  // opening lockout.
  const day = Number(journey.day || 1);
  const cooldown = journey.journeyType === 'manager' ? MANAGER_TEMPTATION_COOLDOWN_MONTHS : TEMPTATION_COOLDOWN_DAYS;
  if (day <= 1 || (memory.lastDay > 0 && day - memory.lastDay < cooldown)) return null;

  const chance = getTemptationChance(journey);
  if (chance < 1 && rng() >= chance) {
    memory.missedEligibleDays = Number(memory.missedEligibleDays || 0) + 1;
    return null;
  }

  // Role and phase are hard gates: a GM only ever hears the acts tagged for a
  // GM, and a recce lead is never offered a post-harvest crime. There is no
  // fallback to the whole library. An act whose payoff has nothing to land
  // on today (no permit clock running, a budget at its ceiling) waits.
  const candidates = ILLEGAL_ACTS.filter(
    (act) => actMatchesTemptationContext(act, journey)
      && !memory.seenActIds.includes(act.id)
      && !(act.formerIds || []).some((id) => memory.seenActIds.includes(id))
      && buildTemptationPayoff(act, journey).deliverable
  );
  if (!candidates.length) return null;

  const act = pickWeightedAct(candidates, rng);
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
