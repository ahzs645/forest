/**
 * Event Resolution System
 * Handles random event selection and resolution for both journey types
 */

import { FIELD_EVENTS, getApplicableFieldEvents, selectRandomFieldEvent } from './data/fieldEvents.js';
import { DESK_EVENTS, getApplicableDeskEvents, selectRandomDeskEvent } from './data/deskEvents.js';
import { applyRandomInjury, applyStatusEffect } from './crew.js';
import { PACE_OPTIONS, syncBlocksFromDistance } from './journey.js';
import { FIELD_RESOURCES, DESK_RESOURCES } from './resources.js';
import { LEGACY_ILLEGAL_ACTS } from './data/legacyIllegalActs.js';

const GENERIC_RADIO_TASKS = [
  'cruising a transect',
  'checking access lines',
  'flagging boundaries',
  'scouting terrain',
  'marking hazards'
];

const RADIO_TASKS_BY_ROLE = {
  driver: ['checking access roads', 'shuttling gear', 'moving fuel drums'],
  mechanic: ['inspecting the ATV', 'tuning saws', 'fixing a winch line'],
  medic: ['running a safety sweep', 'checking med kits', 'monitoring fatigue'],
  faller: ['clearing danger trees', 'opening a sight line', 'topping hazard snags'],
  bucker: ['measuring stems', 'bucking windthrow', 'tagging log decks'],
  spotter: ['flagging boundaries', 'scouting slope breaks', 'logging wildlife sign']
};

/**
 * Check if a random event should occur
 * @param {Object} journey - Current journey state
 * @returns {Object|null} Event to resolve or null
 */
export function checkForEvent(journey) {
  const event = journey.journeyType === 'field' ? checkFieldEvent(journey) : checkDeskEvent(journey);
  if (event) {
    return journey.journeyType === 'field' ? attachFieldReporter(event, journey) : event;
  }
  return maybeCreateTemptationEvent(journey);
}

/**
 * Check for field events
 * @param {Object} journey - Field journey state
 * @returns {Object|null} Event or null
 */
function checkFieldEvent(journey) {
  const currentBlock = journey.blocks[journey.currentBlockIndex];
  const pace = PACE_OPTIONS[journey.pace] || PACE_OPTIONS.normal;

  // Get applicable events for current conditions
  const applicableEvents = getApplicableFieldEvents({
    terrain: currentBlock?.terrain,
    weather: journey.weather?.id,
    hazards: currentBlock?.hazards
  });

  // Calculate modifiers
  const paceModifier = getPaceEventModifier(journey.pace);
  const terrainModifier = getTerrainEventModifier(currentBlock?.terrain);
  const weatherModifier = getWeatherEventModifier(journey.weather?.id);

  // Combined modifier
  const totalModifier = paceModifier * terrainModifier * weatherModifier;

  // Select event with modified probabilities
  return selectRandomFieldEvent(applicableEvents, {
    paceModifier: totalModifier,
    terrainModifier: 1 // Already factored in
  });
}

/**
 * Check for desk events
 * @param {Object} journey - Desk journey state
 * @returns {Object|null} Event or null
 */
function checkDeskEvent(journey) {
  const applicableEvents = getApplicableDeskEvents(journey.currentPhase);

  // Calculate modifiers based on stress level
  const daysRemaining = journey.deadline - journey.day;
  const stressModifier = daysRemaining < 5 ? 1.5 : daysRemaining < 10 ? 1.2 : 1;

  // Low morale increases negative events
  const avgMorale = journey.crew.reduce((sum, m) => sum + (m.isActive ? m.morale : 0), 0) /
    journey.crew.filter(m => m.isActive).length || 50;
  const moraleModifier = avgMorale < 40 ? 1.3 : 1;

  return selectRandomDeskEvent(applicableEvents, {
    stressModifier: stressModifier * moraleModifier,
    crisisMode: daysRemaining < 3
  });
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

function maybeCreateTemptationEvent(journey) {
  if (!Array.isArray(LEGACY_ILLEGAL_ACTS) || LEGACY_ILLEGAL_ACTS.length === 0) {
    return null;
  }

  const chance = journey.journeyType === 'desk' ? 0.03 : 0.04;
  if (Math.random() > chance) return null;

  const roleId = journey.roleId || journey.role?.id;
  const candidates = LEGACY_ILLEGAL_ACTS.filter((act) => {
    if (!act) return false;
    if (!Array.isArray(act.roles) || act.roles.length === 0) return true;
    return roleId ? act.roles.includes(roleId) : true;
  });

  const pool = candidates.length ? candidates : LEGACY_ILLEGAL_ACTS;
  const act = pool[Math.floor(Math.random() * pool.length)];
  if (!act) return null;

  const isDesk = journey.journeyType === 'desk';
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
function getPaceEventModifier(paceId) {
  // Reduced modifiers to lower overall event frequency
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
function getTerrainEventModifier(terrain) {
  // Reduced modifiers for less punishing terrain effects
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
function getWeatherEventModifier(weatherId) {
  // Reduced modifiers for less weather-related event stacking
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

/**
 * Resolve an event by applying the selected option
 * @param {Object} journey - Journey state
 * @param {Object} event - Event being resolved
 * @param {Object} option - Selected option
 * @returns {Object} Result with updated journey and messages
 */
export function resolveEvent(journey, event, option) {
  const messages = [];

  // Add outcome message
  if (option.outcome) {
    messages.push(option.outcome);
  }

  // Apply standard effects
  if (option.effects) {
    applyEventEffects(journey, option.effects, messages);
  }

  // Handle crew effects
  if (option.crewEffect) {
    handleCrewEffect(journey, option.crewEffect, messages);
  }

  // Handle risk of injury
  if (option.riskInjury && Math.random() < option.riskInjury) {
    const victim = pickRandomCrewMember(journey.crew);
    if (victim) {
      const severity = option.riskInjury > 0.2 ? 'moderate' : 'minor';
      const result = applyRandomInjury(victim, severity);
      messages.push(`Accident! ${result.message}`);
    }
  }

  // Handle time cost for field events
  if (journey.journeyType === 'field' && typeof option.timeUsed === 'number') {
    const hours = Math.max(0, Math.min(8, option.timeUsed));
    journey.travelDelayHours = Math.min(8, (journey.travelDelayHours || 0) + hours);
    if (hours > 0) {
      messages.push(`Lost ${hours} hours dealing with the situation.`);
    }
  }

  // Handle permit effects (desk)
  if (option.effects?.permits_approved) {
    journey.permits.approved = Math.min(
      journey.permits.target,
      journey.permits.approved + option.effects.permits_approved
    );
    messages.push(`Permits approved: ${journey.permits.approved}/${journey.permits.target}`);
  }

  // Handle scheduled events
  if (option.schedulesEvent) {
    if (!journey.scheduledEvents) journey.scheduledEvents = [];
    journey.scheduledEvents.push({
      eventId: option.schedulesEvent,
      triggerDay: journey.day + (option.scheduledDelay || 3)
    });
    messages.push('This may have consequences later...');
  }

  // Log the event
  journey.log.push({
    day: journey.day,
    type: 'event',
    eventId: event.id,
    eventTitle: event.title,
    optionLabel: option.label
  });

  return { journey, messages };
}

/**
 * Apply effects from an event option
 */
function applyEventEffects(journey, effects, messages) {
  // Resource effects (field)
  if (journey.journeyType === 'field') {
    if (typeof effects.budget === 'number') {
      journey.resources.budget = Math.max(0,
        Math.min(FIELD_RESOURCES.budget.max, journey.resources.budget + effects.budget));
      if (effects.budget !== 0) {
        const delta = effects.budget;
        const label = delta > 0 ? `+$${Math.abs(delta).toLocaleString()}` : `-$${Math.abs(delta).toLocaleString()}`;
        messages.push(`Cash: ${label}`);
      }
    }
    if (typeof effects.fuel === 'number') {
      journey.resources.fuel = Math.max(0,
        Math.min(FIELD_RESOURCES.fuel.max, journey.resources.fuel + effects.fuel));
      if (effects.fuel < 0) messages.push(`Fuel: ${effects.fuel} gallons`);
    }
    if (typeof effects.food === 'number') {
      journey.resources.food = Math.max(0,
        Math.min(FIELD_RESOURCES.food.max, journey.resources.food + effects.food));
      if (effects.food < 0) messages.push(`Food: ${effects.food} days`);
    }
    if (typeof effects.equipment === 'number') {
      journey.resources.equipment = Math.max(0,
        Math.min(FIELD_RESOURCES.equipment.max, journey.resources.equipment + effects.equipment));
      if (effects.equipment < 0) messages.push(`Equipment: ${effects.equipment}%`);
    }
    if (typeof effects.firstAid === 'number') {
      journey.resources.firstAid = Math.max(0,
        Math.min(FIELD_RESOURCES.firstAid.max, journey.resources.firstAid + effects.firstAid));
    }
  }

  // Resource effects (desk)
  if (journey.journeyType === 'desk') {
    if (typeof effects.budget === 'number') {
      journey.resources.budget = Math.max(0,
        Math.min(DESK_RESOURCES.budget.max, journey.resources.budget + effects.budget));
      if (effects.budget < 0) messages.push(`Budget: $${Math.abs(effects.budget)}`);
    }
    if (typeof effects.politicalCapital === 'number') {
      journey.resources.politicalCapital = Math.max(0,
        Math.min(DESK_RESOURCES.politicalCapital.max, journey.resources.politicalCapital + effects.politicalCapital));
    }
    if (typeof effects.timeUsed === 'number') {
      journey.hoursRemaining = Math.max(0, journey.hoursRemaining - effects.timeUsed);
      if (effects.timeUsed > 0) {
        messages.push(`Time used: ${effects.timeUsed}h.`);
      }
    }
  }

  // Progress effects
  if (effects.progress) {
    if (journey.journeyType === 'field') {
      journey.distanceTraveled = Math.max(0, journey.distanceTraveled + effects.progress);
      syncBlocksFromDistance(journey);
    } else {
      applyDeskProgress(journey, effects.progress, messages);
    }
  }

  // Crew-wide effects
  if (effects.crew_health) {
    for (const member of journey.crew) {
      if (member.isActive) {
        member.health = Math.max(0, Math.min(100, member.health + effects.crew_health));
      }
    }
  }

  if (effects.crew_morale) {
    for (const member of journey.crew) {
      if (member.isActive) {
        member.morale = Math.max(0, Math.min(100, member.morale + effects.crew_morale));
      }
    }
    if (effects.crew_morale > 0) {
      messages.push('Crew morale improved.');
    } else if (effects.crew_morale < 0) {
      messages.push('Crew morale dropped.');
    }
  }

  // Compliance/relationships (legacy compatibility)
  if (effects.compliance) {
    // Map to political capital for desk or just note for field
    if (journey.journeyType === 'desk') {
      journey.resources.politicalCapital = Math.max(0,
        Math.min(100, journey.resources.politicalCapital + effects.compliance));
    }
  }

  if (effects.relationships) {
    // Affect stakeholder moods for desk
    if (journey.journeyType === 'desk') {
      for (const key of Object.keys(journey.stakeholders)) {
        journey.stakeholders[key].mood = Math.max(0,
          Math.min(100, journey.stakeholders[key].mood + Math.floor(effects.relationships / 2)));
      }
    }
  }
}

/**
 * Handle crew-specific effects
 */
function handleCrewEffect(journey, crewEffect, messages) {
  // Apply injury to a specific crew member
  if (crewEffect.injury) {
    const victim = pickRandomCrewMember(journey.crew);
    if (victim) {
      const result = applyStatusEffect(victim, crewEffect.injury);
      if (result.message) messages.push(result.message);
    }
  }

  // Apply illness to multiple crew members
  if (crewEffect.illness && crewEffect.count) {
    const victims = pickMultipleCrewMembers(journey.crew, crewEffect.count);
    for (const victim of victims) {
      const result = applyStatusEffect(victim, crewEffect.illness);
      if (result.message) messages.push(result.message);
    }
  }

  // Evacuate a crew member
  if (crewEffect.evacuate) {
    const victim = journey.crew.find(m => m.isActive &&
      m.statusEffects.some(e => e.effectId === crewEffect.injury));
    if (victim) {
      victim.isActive = false;
      messages.push(`${victim.name} has been evacuated for medical care.`);
    }
  }

  // Rest days
  if (crewEffect.rest) {
    // This would be tracked for recovery
  }
}

/**
 * Pick a random active crew member
 */
function pickRandomCrewMember(crew) {
  const active = crew.filter(m => m.isActive);
  if (active.length === 0) return null;
  return active[Math.floor(Math.random() * active.length)];
}

/**
 * Pick multiple random active crew members
 */
function pickMultipleCrewMembers(crew, count) {
  const active = crew.filter(m => m.isActive);
  const selected = [];
  const pool = [...active];

  while (selected.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }

  return selected;
}

/**
 * Get event by ID
 * @param {string} eventId - Event ID
 * @param {string} journeyType - 'field' or 'desk'
 * @returns {Object|null} Event or null
 */
export function getEventById(eventId, journeyType) {
  const events = journeyType === 'field' ? FIELD_EVENTS : DESK_EVENTS;
  return events.find(e => e.id === eventId) || null;
}

/**
 * Check for any scheduled events that should trigger
 * @param {Object} journey - Journey state
 * @returns {Object|null} Scheduled event or null
 */
export function checkScheduledEvents(journey) {
  if (!journey.scheduledEvents || journey.scheduledEvents.length === 0) {
    return null;
  }

  const index = journey.scheduledEvents.findIndex(se => se.triggerDay <= journey.day);
  if (index === -1) return null;

  const scheduled = journey.scheduledEvents.splice(index, 1)[0];
  return getEventById(scheduled.eventId, journey.journeyType);
}

/**
 * Format event for display
 * @param {Object} event - Event object
 * @returns {Object} Display-ready event info
 */
export function formatEventForDisplay(event, journeyType = 'field') {
  const reporter = journeyType === 'field' ? event.reporter : null;
  const roleLabel = reporter?.role || 'Crew';
  const taskClause = reporter?.task ? ` while ${reporter.task}` : '';
  const description = reporter
    ? `${reporter.name} (${roleLabel})${taskClause} radios in: ${event.description}`
    : event.description;
  const title = event.title;

  return {
    title,
    description,
    severity: event.severity,
    type: event.type,
    options: event.options.map((opt, index) => ({
      index: index + 1,
      label: opt.label,
      hint: getOptionHint(opt, journeyType)
    }))
  };
}

/**
 * Generate a hint about an option's effects
 */
function getOptionHint(option, journeyType) {
  const hints = [];
  const isField = journeyType === 'field';

  if (option.effects) {
    // Resource costs
    if (option.effects.fuel !== undefined) {
      hints.push(option.effects.fuel > 0 ? `+${option.effects.fuel} fuel` : `${option.effects.fuel} fuel`);
    }
    if (option.effects.food !== undefined) {
      hints.push(option.effects.food > 0 ? `+${option.effects.food} food` : `${option.effects.food} food`);
    }
    if (option.effects.equipment !== undefined) {
      hints.push(option.effects.equipment > 0 ? `+${option.effects.equipment}% equip` : `${option.effects.equipment}% equip`);
    }
    if (option.effects.firstAid !== undefined) {
      hints.push(option.effects.firstAid > 0 ? `+${option.effects.firstAid} med` : `${option.effects.firstAid} med`);
    }
    if (option.effects.budget !== undefined) {
      const amount = option.effects.budget;
      const budgetStr = Math.abs(amount) >= 1000
        ? `$${Math.round(Math.abs(amount) / 1000)}k`
        : `$${Math.abs(amount)}`;
      const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
      hints.push(`${sign}${budgetStr}`);
    }

    // Crew effects
    if (option.effects.crew_health !== undefined) {
      hints.push(option.effects.crew_health > 0 ? `+${option.effects.crew_health} health` : `${option.effects.crew_health} health`);
    }
    if (option.effects.crew_morale !== undefined) {
      hints.push(option.effects.crew_morale > 0 ? `+${option.effects.crew_morale} morale` : `${option.effects.crew_morale} morale`);
    }

    // Progress effects
    if (option.effects.progress !== undefined && option.effects.progress !== 0) {
      const unit = isField ? ' km traverse' : ' progress';
      hints.push(option.effects.progress > 0
        ? `+${option.effects.progress}${unit}`
        : `${option.effects.progress}${unit}`);
    }
    if (option.effects.permits_approved !== undefined) {
      const amount = option.effects.permits_approved;
      const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
      hints.push(`${sign}${Math.abs(amount)} permits`);
    }
  }

  // Risk indicators
  if (option.riskInjury) {
    const riskPct = Math.round(option.riskInjury * 100);
    hints.push(`${riskPct}% injury risk`);
  }

  // Time cost
  const timeUsed = option.timeUsed ?? option.effects?.timeUsed;
  if (typeof timeUsed === 'number' && timeUsed > 0) {
    hints.push(`-${timeUsed}h`);
  }

  return hints.length > 0 ? hints.join(', ') : 'Safe choice';
}

function applyDeskProgress(journey, progressPoints, messages) {
  if (!journey.permits) return;

  const target = journey.permits.target || 0;
  const magnitude = Math.round(Math.abs(progressPoints) / 10);
  if (magnitude <= 0) return;

  let remaining = magnitude;
  let moved = 0;

  if (progressPoints > 0) {
    while (remaining > 0 && journey.permits.inReview > 0 && (target <= 0 || journey.permits.approved < target)) {
      journey.permits.inReview--;
      journey.permits.approved = target > 0
        ? Math.min(target, journey.permits.approved + 1)
        : journey.permits.approved + 1;
      remaining--;
      moved++;
    }

    while (remaining > 0) {
      if (journey.permits.submitted === 0 && journey.permits.backlog > 0) {
        journey.permits.backlog--;
        journey.permits.submitted++;
      }
      if (journey.permits.submitted > 0) {
        journey.permits.submitted--;
        journey.permits.inReview++;
        remaining--;
        moved++;
        continue;
      }
      break;
    }

    if (moved > 0) {
      messages.push(`Permit pipeline accelerated (+${moved}).`);
    }
  } else {
    while (remaining > 0 && journey.permits.inReview > 0) {
      journey.permits.inReview--;
      journey.permits.needsRevision++;
      remaining--;
      moved++;
    }

    while (remaining > 0 && journey.permits.approved > 0) {
      journey.permits.approved--;
      journey.permits.needsRevision++;
      remaining--;
      moved++;
    }

    while (remaining > 0 && journey.permits.submitted > 0) {
      journey.permits.submitted--;
      journey.permits.backlog = (journey.permits.backlog || 0) + 1;
      remaining--;
      moved++;
    }

    if (moved > 0) {
      messages.push(`Permit pipeline slowed (-${moved}).`);
    }
  }
}

/**
 * Format effect preview for display in UI
 * @param {Object} option - Event option
 * @returns {string} Formatted effect preview
 */
export function formatOptionEffects(option, journeyType = 'field') {
  return getOptionHint(option, journeyType);
}
