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

/**
 * Check if a random event should occur
 * @param {Object} journey - Current journey state
 * @returns {Object|null} Event to resolve or null
 */
export function checkForEvent(journey) {
  const isField = isFieldJourney(journey.journeyType);
  const event = isField ? checkFieldEvent(journey) : checkDeskEvent(journey);
  if (event) {
    return isField ? attachFieldReporter(event, journey) : event;
  }
  return maybeCreateTemptationEvent(journey);
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

/**
 * Check for field events
 */
function checkFieldEvent(journey) {
  if (journey.journeyType === 'silviculture' && (!Array.isArray(journey.blocks) || journey.blocks.length === 0)) {
    return null;
  }

  const currentBlock = Array.isArray(journey.blocks)
    ? (journey.blocks[journey.currentBlockIndex] || journey.blocks[0] || null)
    : null;

  const applicableEvents = filterRecentEvents(journey, getApplicableFieldEvents({
    terrain: currentBlock?.terrain,
    weather: journey.weather?.id,
    hazards: currentBlock?.hazards
  }));

  const paceModifier = getPaceEventModifier(journey.pace);
  const terrainModifier = getTerrainEventModifier(currentBlock?.terrain);
  const weatherModifier = getWeatherEventModifier(journey.weather?.id);
  const difficultyModifier = getDifficultyEventModifier(journey);

  const totalModifier = paceModifier * terrainModifier * weatherModifier * difficultyModifier;

  return selectRandomFieldEvent(applicableEvents, {
    paceModifier: totalModifier,
    terrainModifier: 1
  });
}

/**
 * Check for desk events
 */
function checkDeskEvent(journey) {
  const applicableEvents = filterRecentEvents(
    journey,
    getApplicableDeskEvents(journey.currentPhase).filter((event) => eventSupportsJourney(event, journey))
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
  const difficultyModifier = getDifficultyEventModifier(journey);

  return selectRandomDeskEvent(applicableEvents, {
    stressModifier: stressModifier * moraleModifier * difficultyModifier,
    crisisMode: daysRemaining < 3,
    typeMultipliers
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

function maybeCreateTemptationEvent(journey) {
  if (!Array.isArray(ILLEGAL_ACTS) || ILLEGAL_ACTS.length === 0) {
    return null;
  }

  const chance = (isDeskJourney(journey.journeyType) ? 0.03 : 0.04) * getDifficultyEventModifier(journey);
  if (Math.random() > chance) return null;

  const roleId = journey.roleId || journey.role?.id;
  const candidates = ILLEGAL_ACTS.filter((act) => {
    if (!act) return false;
    if (!Array.isArray(act.roles) || act.roles.length === 0) return true;
    return roleId ? act.roles.includes(roleId) : true;
  });

  const pool = candidates.length ? candidates : ILLEGAL_ACTS;
  const act = pool[Math.floor(Math.random() * pool.length)];
  if (!act) return null;

  const isDesk = isDeskJourney(journey.journeyType);
  const baseGain = isDesk ? 3500 : 650;
  const swing = isDesk ? 2500 : 550;
  const gain = Math.max(0, Math.round(baseGain + (Math.random() * 2 - 1) * swing));

  const takeEffects = isDesk
    ? { budget: gain, politicalCapital: -4 }
    : { budget: Math.min(gain, 1200), equipment: -8, crew_morale: -3 };

  const refuseEffects = isDesk ? { politicalCapital: 2 } : { crew_morale: 2 };
  const reportEffects = isDesk ? { politicalCapital: 4, timeUsed: 2 } : { crew_morale: 1 };

  return {
    id: `legacy_temptation_${String(act.id || Math.random().toString(36).slice(2))}`,
    title: String(act.title || 'Shady Shortcut'),
    type: 'temptation',
    severity: 'moderate',
    probability: 0,
    description: String(act.description || 'A tempting shortcut appears.'),
    options: [
      {
        label: 'Refuse and keep it clean',
        outcome: 'You walk away. It keeps the run boring, but safe.',
        effects: refuseEffects
      },
      {
        label: 'Take the shortcut (high risk)',
        outcome: 'It pays off today. Tomorrow is a question mark.',
        effects: takeEffects,
        riskInjury: isDesk ? undefined : 0.12
      },
      {
        label: 'Document and report',
        outcome: 'You put it in writing. It takes time, but strengthens your position.',
        effects: reportEffects
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
