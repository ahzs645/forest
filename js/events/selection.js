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
 * dedicated modes use.
 */
function checkManagerEvent(journey) {
  const wantsDesk = Math.random() < MANAGER_DESK_EVENT_RATIO;
  const event = wantsDesk ? checkDeskEvent(journey) : checkFieldEvent(journey);
  if (!event) return null;
  return wantsDesk ? event : attachManagerFieldReporter(event, journey);
}

/**
 * Manager journeys keep a crew, so field-context events still arrive as radio
 * calls — but formatEventForDisplay only narrates reporters for field journey
 * types, so the radio framing is baked into the description here.
 */
function attachManagerFieldReporter(event, journey) {
  const reported = attachFieldReporter(event, journey);
  const reporter = reported?.reporter;
  if (!reporter) {
    return reported;
  }

  return {
    ...reported,
    description: formatRadioReport(event.description, reporter)
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
function checkFieldEvent(journey) {
  const currentBlock = Array.isArray(journey.blocks)
    ? (journey.blocks[journey.currentBlockIndex] || journey.blocks[0] || null)
    : null;

  const applicableEvents = filterRecentEvents(
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
    take: (gain, isDesk) => (isDesk
      ? { budget: gain, compliance: -6, scrutiny: 6 }
      : { budget: Math.min(gain, 1200), compliance: -5, scrutiny: 5 }),
  },
  {
    tags: ['bribery', 'corruption', 'compliance'],
    outcome: 'Money changes hands and the file moves. Someone now owns a piece of you.',
    take: (gain, isDesk) => (isDesk
      ? { budget: gain, politicalCapital: -7, scrutiny: 8 }
      : { budget: Math.min(gain, 1200), politicalCapital: -4, scrutiny: 6 }),
    riskInjury: null,
  },
  {
    tags: ['fire', 'risk', 'safety'],
    outcome: 'It works, this time. The crew saw how close it came.',
    take: (gain, isDesk) => (isDesk
      ? { budget: gain, crew_morale: -4, scrutiny: 4 }
      : { budget: Math.min(gain, 1200), equipment: -6, crew_morale: -5 }),
    riskInjury: 0.2,
  },
  {
    tags: ['wildlife', 'old-growth', 'habitat', 'water', 'nursery'],
    outcome: 'The block moves faster. What was living there does not.',
    take: (gain, isDesk) => (isDesk
      ? { budget: gain, reputation: -8, compliance: -4 }
      : { budget: Math.min(gain, 1200), reputation: -6, compliance: -4 }),
  },
];

function getTemptationProfileForAct(act) {
  const tags = Array.isArray(act?.tags) ? act.tags : [];
  return TEMPTATION_TAG_PROFILES.find((profile) => profile.tags.some((tag) => tags.includes(tag))) || null;
}

// Minimum days between shortcut offers, so a higher draw rate reads as texture
// rather than a nag.
const TEMPTATION_COOLDOWN_DAYS = 4;

/**
 * The shortcut, as an actual gamble.
 *
 * This option was labelled "(high risk)" and carried no roll at all: every
 * shortcut in the 208-act library paid out, every time, at exactly its
 * advertised price. The only thing that could go wrong was an unrelated injury
 * side-roll. Crime paid at list price.
 *
 * Three bands, because "nobody noticed", "someone noticed" and "it became a
 * file with your name on it" are genuinely different futures rather than three
 * sizes of the same one:
 *
 *   clean   - the money, and it stays buried
 *   noticed - the money, but it leaves a mark that draws attention afterwards
 *   caught  - no money at all, and the file follows you
 *
 * The odds move on things the player controls, which is the point: a clean
 * record and standing with people genuinely buy cover, and a run that has
 * already been cutting corners stops getting the benefit of the doubt. That
 * last one matters most — `seenActIds` already tracked prior shortcuts purely
 * to avoid showing the same act twice. Now it is also the thing that hangs you.
 */
function buildShortcutOption({ act, gain, isDesk, profile, takeOutcome, takeEffects, takeRiskInjury }) {
  const shown = Math.min(gain, isDesk ? gain : 1200);
  const caughtEffects = isDesk
    ? { compliance: -14, politicalCapital: -10, scrutiny: 22, reputation: -8 }
    : { compliance: -12, crew_morale: -8, scrutiny: 20, reputation: -6 };
  const noticedEffects = { ...takeEffects, scrutiny: Number(takeEffects.scrutiny || 0) + 8 };

  return {
    label: 'Take the shortcut',
    // Clean band.
    outcome: `${takeOutcome} Avoided costs leave $${shown.toLocaleString()} available in the budget, and nobody asks.`,
    effects: takeEffects,
    // Noticed band: the money still lands, but so does the attention.
    partialOutcome: `${takeOutcome} The money is real. So is the fact that somebody wrote down what they saw.`,
    partialEffects: noticedEffects,
    // Caught band: the gain never arrives. That is the whole deterrent — a
    // shortcut whose worst case still pays is not a gamble, it is a discount.
    failureOutcome: act?.consequence
      ? `It does not hold. ${String(act.consequence)}`
      : 'It does not hold. The file lands on a desk that asks questions, and your name is on every page of it.',
    failureEffects: caughtEffects,
    chanceSuccess: 0.5,
    chancePartial: 0.3,
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
    ],
    riskInjury: takeRiskInjury,
    reactionTone: 'compromised'
  };
}

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

  const baseGain = isDesk ? 3500 : 650;
  const swing = isDesk ? 2500 : 550;
  const gain = Math.max(0, Math.round(baseGain + (Math.random() * 2 - 1) * swing));

  const profile = getTemptationProfileForAct(act);
  const takeEffects = profile
    ? profile.take(gain, isDesk)
    : isDesk
      ? { budget: gain, politicalCapital: -4 }
      : { budget: Math.min(gain, 1200), equipment: -8, crew_morale: -3 };
  const takeOutcome = profile?.outcome || 'It pays off today. Tomorrow is a question mark.';
  const takeRiskInjury = isDesk
    ? undefined
    : (profile && 'riskInjury' in profile ? profile.riskInjury ?? undefined : 0.12);

  const refuseEffects = isDesk ? { politicalCapital: 2 } : { crew_morale: 2 };
  const reportEffects = isDesk
    ? { politicalCapital: 4, compliance: 2, timeUsed: 2 }
    : { crew_morale: 1, compliance: 2, timeUsed: 2 };

  return {
    id: `legacy_temptation_${String(act.id || Math.random().toString(36).slice(2))}`,
    title: String(act.title || 'Shady Shortcut'),
    type: 'temptation',
    severity: 'moderate',
    probability: 0,
    description: `Someone on the job quietly proposes a shortcut: “${String(act.description || 'Take a shortcut that should not be taken.')}”`,
    options: [
      {
        label: 'Refuse and keep it clean',
        outcome: 'You walk away. It keeps the run boring, but safe.',
        effects: refuseEffects
      },
      buildShortcutOption({ act, gain, isDesk, profile, takeOutcome, takeEffects, takeRiskInjury }),
      {
        label: 'Document and report',
        outcome: 'You put it in writing. It takes time, but strengthens your position.',
        effects: reportEffects,
        reactionTone: 'responsible'
      }
    ]
  };
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
