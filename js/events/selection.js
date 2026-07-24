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
import { ILLEGAL_ACTS } from '../data/illegalActs.js';
import { PACE_OPTIONS } from '../journey/constants.js';
import { getDiscoveryEventTypeMultipliers } from '../data/discoveryTags.js';
import { getAreaSituationMultipliers } from '../data/areaSituations.js';
import { formatRadioReport } from './display.js';

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
  if (event.options?.some((option) => option?.schedulesEvent)) return false;
  if (typeof event.managerEscalation === 'boolean') return event.managerEscalation;
  return event.type === 'issue' || event.severity === 'severe';
}

// Bush per-day probabilities are tuned for ~100-day field journeys; at the
// GM's monthly cadence, with the escalation gate shrinking the pool to ~18
// events, the raw weights would leave the ops lane nearly silent for a whole
// term. Escalations therefore draw at a floor instead of their field weight.
const MANAGER_ESCALATION_MIN_PROBABILITY = 0.08;

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
  if (option.failureEffects) {
    escalated.failureEffects = translateManagerEffects(option.failureEffects);
  }
  // An injury 300 km from the corner office cannot land on the executive
  // team; what reaches the GM later is the incident coming back as a
  // compliance problem, which riskCompliance already models.
  if (typeof escalated.riskInjury === 'number') {
    escalated.riskCompliance = Math.max(Number(option.riskCompliance) || 0, escalated.riskInjury);
    delete escalated.riskInjury;
  }
  // crewEffect (injuries, evacuations, quits) operates on whoever holds the
  // journey's crew array — in manager mode that is the executive staff, so it
  // must not fire from a division incident.
  delete escalated.crewEffect;
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
    applicableEvents = applicableEvents
      .filter(isManagerFieldEscalation)
      .map((event) => ({
        ...event,
        probability: Math.max(Number(event.probability) || 0, MANAGER_ESCALATION_MIN_PROBABILITY)
      }));
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

// How the shortcut bites depends on what kind of crime it is. Profiles are
// matched against the act's tags so the 208-act library plays as distinct
// dilemmas instead of one reskinned template. Ordered: first match wins.
const TEMPTATION_TAG_PROFILES = [
  {
    tags: ['fraud', 'fabrication', 'reporting', 'laundering', 'mapping'],
    outcome: 'The numbers land clean. The paper trail is now the problem.',
    caught: 'A reviewer pulls the source file and the numbers do not reconcile.',
    take: (gain, isDesk) => (isDesk
      ? { budget: gain, compliance: -6, scrutiny: 6 }
      : { budget: gain, compliance: -5, scrutiny: 5 }),
  },
  {
    tags: ['bribery', 'corruption', 'compliance'],
    outcome: 'Money changes hands and the file moves. Someone now owns a piece of you.',
    caught: 'The favour gets talked about. Talk reaches someone who writes things down.',
    take: (gain, isDesk) => (isDesk
      ? { budget: gain, politicalCapital: -7, scrutiny: 8 }
      : { budget: gain, politicalCapital: -4, scrutiny: 6 }),
    riskInjury: null,
  },
  {
    tags: ['fire', 'risk', 'safety'],
    outcome: 'It works, this time. The crew saw how close it came.',
    caught: 'It stops working. Somebody gets hurt, and the incident report writes itself.',
    take: (gain, isDesk) => (isDesk
      ? { budget: gain, crew_morale: -4, scrutiny: 4 }
      : { budget: gain, equipment: -6, crew_morale: -5 }),
    riskInjury: 0.2,
  },
  {
    tags: ['wildlife', 'old-growth', 'habitat', 'water', 'nursery', 'riparian', 'fish', 'salmon', 'streams'],
    outcome: 'The block moves faster. What was living there does not.',
    caught: 'A biologist walks the ground you skipped and photographs every metre of it.',
    take: (gain, isDesk) => (isDesk
      ? { budget: gain, reputation: -8, compliance: -4 }
      : { budget: gain, reputation: -6, compliance: -4 }),
  },
];

function getTemptationProfileForAct(act) {
  const tags = Array.isArray(act?.tags) ? act.tags : [];
  return TEMPTATION_TAG_PROFILES.find((profile) => profile.tags.some((tag) => tags.includes(tag))) || null;
}

// A shortcut is a bet, not a purchase. The tier decides what the bet pays, how
// often it holds, and how hard the bill lands when it doesn't — so a bit of
// creative invoicing and a bribe are not the same decision with different
// flavour text. Ordered most flagrant first; first tag match wins.
const TEMPTATION_RISK_TIERS = [
  {
    id: 'brazen',
    label: 'Brazen',
    tags: [
      'bribery', 'corruption', 'coercion', 'collusion', 'sabotage', 'espionage',
      'theft', 'smuggling', 'poaching', 'trespass', 'intimidation', 'bullying',
      'forgery', 'tampering', 'erasure', 'coverup', 'destruction', 'blatant',
      'illegal', 'illegal-works', 'noncompliance', 'slush', 'double-dip',
      'conflict-of-interest', 'complicity', 'deception', 'title-misuse'
    ],
    gainMultiplier: 2.4,
    detection: 0.44,
    // What it costs even when it holds: brazen acts leave people who know.
    quiet: { compliance: -3, crew_morale: -3 },
    falloutScale: 1.5
  },
  {
    id: 'serious',
    label: 'Serious',
    tags: [
      'fraud', 'fabrication', 'laundering', 'negligence', 'safety', 'fire',
      'chemicals', 'pollution', 'waste', 'disposal', 'herbicide', 'drift',
      'invasives', 'water', 'riparian', 'streams', 'crossings', 'fish',
      'salmon', 'wildlife', 'old-growth', 'karst', 'soil', 'erosion',
      'heritage', 'cultural', 'archaeology', 'aviation', 'transport', 'roads',
      'bridges', 'engineering', 'records', 'mapping', 'gis', 'data',
      'modeling', 'cruise', 'cruising', 'scaling', 'appraisal', 'billing',
      'payroll', 'accounting', 'royalties', 'stumpage', 'permits', 'referrals',
      'consultation', 'professional-practice', 'discipline-dodge', 'reporting'
    ],
    gainMultiplier: 1.35,
    detection: 0.29,
    quiet: { compliance: -2 },
    falloutScale: 1
  },
  {
    id: 'petty',
    label: 'Corner-cutting',
    tags: [],
    gainMultiplier: 0.75,
    detection: 0.15,
    quiet: {},
    falloutScale: 0.65
  }
];

function getTemptationTier(act) {
  const tags = Array.isArray(act?.tags) ? act.tags : [];
  return TEMPTATION_RISK_TIERS.find((tier) => tier.tags.some((tag) => tags.includes(tag)))
    || TEMPTATION_RISK_TIERS[TEMPTATION_RISK_TIERS.length - 1];
}

/**
 * Odds the shortcut surfaces. The bet gets worse the more heat the run is
 * already carrying and the more often you have already reached for one, so a
 * player who keeps pulling the lever watches the price of pulling it climb.
 */
export function getTemptationDetectionChance(journey, tier, takenSoFar = 0) {
  const scrutiny = Math.max(0, Math.min(100, Number(journey?.scrutiny || 0)));
  const scrutinyPressure = (scrutiny / 100) * 0.25;
  const repeatPressure = Math.min(0.21, Math.max(0, takenSoFar) * 0.07);
  const difficultyPressure = journey?.difficulty === 'hard'
    ? 0.07
    : journey?.difficulty === 'easy' ? -0.05 : 0;
  const raw = tier.detection + scrutinyPressure + repeatPressure + difficultyPressure;
  return Math.max(0.08, Math.min(0.85, Math.round(raw * 100) / 100));
}

// Who brings you the shortcut, and how. One canned "someone quietly proposes"
// line across 208 acts made every offer read as the same offer.
const TEMPTATION_OPENERS = {
  field: {
    brazen: [
      (who, quote) => `${who} waits until the radio is off, then says it out loud: “${quote}”`,
      (who, quote) => `No preamble from ${who}, just the pitch: “${quote}” Nobody at the tailgate says anything.`,
      (who, quote) => `${who} has clearly been sitting on this one. “${quote}” The truck goes quiet.`
    ],
    serious: [
      (who, quote) => `${who} floats it on the walk back, careful not to write anything down: “${quote}”`,
      (who, quote) => `Over the tailgate, ${who} makes the case: “${quote}” It would save the week.`,
      (who, quote) => `${who} says the thing everyone has been circling: “${quote}”`
    ],
    petty: [
      (who, quote) => `${who} shrugs. “${quote}” It barely sounds like a decision.`,
      (who, quote) => `Half joking, ${who} suggests it: “${quote}”`,
      (who, quote) => `${who} raises it like it is already settled: “${quote}”`
    ]
  },
  desk: {
    brazen: [
      (who, quote) => `${who} closes your office door first. “${quote}”`,
      (who, quote) => `The offer arrives without a paper trail — a hallway conversation, no names: “${quote}”`,
      (who, quote) => `${who} phrases it as a hypothetical, which is how you know it is not one: “${quote}”`
    ],
    serious: [
      (who, quote) => `${who} raises it at the end of the meeting, after the note-taker has left: “${quote}”`,
      (who, quote) => `It comes up as a suggestion, filed under keeping the schedule: “${quote}”`,
      (who, quote) => `${who} lays out the faster route: “${quote}” The deadline makes it sound reasonable.`
    ],
    petty: [
      (who, quote) => `${who} mentions it in passing, already halfway out the door: “${quote}”`,
      (who, quote) => `Somebody drops it in the chat and nobody objects: “${quote}”`,
      (who, quote) => `${who} treats it as housekeeping: “${quote}”`
    ]
  }
};

const TEMPTATION_REFUSE_LABELS = {
  brazen: 'Shut it down before it starts',
  serious: 'Say no and take the slower road',
  petty: 'Do it properly instead'
};

const TEMPTATION_REPORT_LABELS = {
  brazen: 'Report it up the chain',
  serious: 'Put it on the record',
  petty: 'Note it in the file and move on'
};

const TEMPTATION_PROPOSERS = {
  field: ['Someone on the crew', 'The contractor foreman', 'A hand on the other truck'],
  desk: ['A colleague', 'Someone from the proponent', 'A voice on the phone']
};

function pickFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickProposer(journey, isDesk) {
  const active = (journey.crew || []).filter((member) => member.isActive);
  if (!isDesk && active.length > 0) {
    return active[Math.floor(Math.random() * active.length)].name;
  }
  return pickFrom(TEMPTATION_PROPOSERS[isDesk ? 'desk' : 'field']);
}

function scaleEffects(effects, scale) {
  const scaled = {};
  for (const [key, value] of Object.entries(effects || {})) {
    scaled[key] = typeof value === 'number' ? Math.round(value * scale) : value;
  }
  return scaled;
}

function mergeEffects(...sources) {
  const merged = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      merged[key] = typeof value === 'number' ? (merged[key] || 0) + value : value;
    }
  }
  return merged;
}

// Where a busted shortcut lands next. Field runs have no audit deck of their
// own, so only desk-side files get a scheduled second act.
const TEMPTATION_FALLOUT_EVENTS = {
  brazen: 'surprise_audit',
  serious: 'audit_findings',
  petty: null
};

// Minimum days between shortcut offers, so a higher draw rate reads as texture
// rather than a nag.
const TEMPTATION_COOLDOWN_DAYS = 4;

function maybeCreateTemptationEvent(journey) {
  if (!Array.isArray(ILLEGAL_ACTS) || ILLEGAL_ACTS.length === 0) {
    return null;
  }

  // Manager temptations play at boardroom stakes, not bush stakes.
  const isDesk = isDeskJourney(journey.journeyType) || journey.journeyType === 'manager';

  // Cooldown gate: at most one offer per few days, never on day 1. A fresh
  // memory has no previous draw, so it must not accidentally impose a four-day
  // opening lockout.
  const day = Number(journey.day || 1);
  const memory = journey.temptationMemory || (journey.temptationMemory = { lastDay: 0, seenActIds: [], missedEligibleDays: 0 });
  if (day <= 1 || (memory.lastDay > 0 && day - memory.lastDay < TEMPTATION_COOLDOWN_DAYS)) return null;

  const baseChance = isDesk ? 0.15 : 0.18;
  const chance = Math.min(0.3, baseChance * getDifficultyEventModifier(journey));
  const guaranteeAfterMisses = 3;
  if (Math.random() > chance && Number(memory.missedEligibleDays || 0) < guaranteeAfterMisses) {
    memory.missedEligibleDays = Number(memory.missedEligibleDays || 0) + 1;
    return null;
  }

  const roleId = journey.roleId || journey.role?.id;
  const candidates = ILLEGAL_ACTS.filter((act) => {
    if (!act) return false;
    if (memory.seenActIds.includes(act.id)) return false;
    if (!Array.isArray(act.roles) || act.roles.length === 0) return true;
    return roleId ? act.roles.includes(roleId) : true;
  });

  const pool = candidates.length ? candidates : ILLEGAL_ACTS;
  const act = pool[Math.floor(Math.random() * pool.length)];
  if (!act) return null;
  memory.lastDay = day;
  memory.missedEligibleDays = 0;
  if (act.id) memory.seenActIds.push(act.id);

  const tier = getTemptationTier(act);
  const ledger = getTemptationLedger(journey);
  ledger.offered += 1;

  // Payday scales with how flagrant the act is: the brazen ones are worth
  // reaching for, which is the whole point of putting them on the table.
  const baseGain = isDesk ? 3200 : 620;
  const swing = isDesk ? 1400 : 260;
  const rawGain = baseGain + (Math.random() * 2 - 1) * swing;
  const gain = Math.max(100, Math.round((rawGain * tier.gainMultiplier) / 10) * 10);

  const detection = getTemptationDetectionChance(journey, tier, ledger.taken);
  const chanceSuccess = Math.round((1 - detection) * 100) / 100;

  const profile = getTemptationProfileForAct(act);
  const profileEffects = profile
    ? profile.take(gain, isDesk)
    : isDesk
      ? { budget: gain, politicalCapital: -4 }
      : { budget: gain, equipment: -8, crew_morale: -3 };
  const heldEffects = mergeEffects(profileEffects, tier.quiet, { budget: 0 });
  heldEffects.budget = gain;

  const heldOutcome = profile?.outcome || 'It pays off today. Tomorrow is a question mark.';
  const caughtLead = profile?.caught || 'It does not stay buried. Somebody pulls the thread.';

  // Getting caught costs the payday, plus a fine and a standing on the file
  // that takes the rest of the run to rebuild.
  const caughtEffects = scaleEffects(
    isDesk
      ? { budget: -Math.round(gain * 0.8), compliance: -12, politicalCapital: -10, scrutiny: 22 }
      : { budget: -Math.round(gain * 0.8), compliance: -10, reputation: -8, crew_morale: -8, scrutiny: 20 },
    tier.falloutScale
  );

  const takeRiskInjury = isDesk
    ? undefined
    : (profile && 'riskInjury' in profile ? profile.riskInjury ?? undefined : 0.12);

  const refuseEffects = isDesk ? { politicalCapital: 2 } : { crew_morale: 2 };
  const reportEffects = isDesk
    ? { politicalCapital: 4, compliance: 2, timeUsed: 2 }
    : { crew_morale: 1, compliance: 2, timeUsed: 2 };

  const opener = pickFrom(TEMPTATION_OPENERS[isDesk ? 'desk' : 'field'][tier.id]);
  const proposer = pickProposer(journey, isDesk);
  const quote = String(act.description || 'Take a shortcut that should not be taken.');

  return {
    id: `legacy_temptation_${String(act.id || Math.random().toString(36).slice(2))}`,
    title: String(act.title || 'Shady Shortcut'),
    type: 'temptation',
    severity: tier.id === 'brazen' ? 'major' : 'moderate',
    probability: 0,
    temptation: { actId: act.id || null, actTitle: act.title || 'Shortcut', tier: tier.id },
    description: opener(proposer, quote),
    options: [
      {
        label: TEMPTATION_REFUSE_LABELS[tier.id],
        outcome: 'You walk away. It keeps the run boring, but safe.',
        effects: refuseEffects,
        temptationChoice: 'refused'
      },
      {
        label: `Take the shortcut — $${gain.toLocaleString()} if it holds`,
        outcome: `${heldOutcome} The avoided costs leave $${gain.toLocaleString()} in the budget, and nobody has asked a question yet.`,
        effects: heldEffects,
        chanceSuccess,
        failureOutcome: `${caughtLead} The shortcut is now a file with your name on it.`,
        failureEffects: caughtEffects,
        failureSchedulesEvent: isDesk ? TEMPTATION_FALLOUT_EVENTS[tier.id] : null,
        riskInjury: takeRiskInjury,
        reactionTone: 'compromised',
        temptationChoice: 'taken'
      },
      {
        label: TEMPTATION_REPORT_LABELS[tier.id],
        outcome: 'You put it in writing. It takes time, but strengthens your position.',
        effects: reportEffects,
        reactionTone: 'responsible',
        temptationChoice: 'reported'
      }
    ]
  };
}

/**
 * The run's shortcut record: what was offered, what was taken, and what came
 * back. Read by the debrief so a run played dirty does not end with the same
 * closing text as a clean one.
 */
export function getTemptationLedger(journey) {
  if (!journey.temptationLedger) {
    journey.temptationLedger = {
      offered: 0,
      taken: 0,
      held: 0,
      caught: 0,
      refused: 0,
      reported: 0,
      caughtActs: [],
      heldActs: []
    };
  }
  return journey.temptationLedger;
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
