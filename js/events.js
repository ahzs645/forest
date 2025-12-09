/**
 * Event Resolution System
 * Handles random event selection and resolution for both journey types
 */

import { FIELD_EVENTS, getApplicableFieldEvents, selectRandomFieldEvent } from './data/fieldEvents.js';
import { DESK_EVENTS, getApplicableDeskEvents, selectRandomDeskEvent } from './data/deskEvents.js';
import { applyRandomInjury, applyStatusEffect } from './crew.js';
import { PACE_OPTIONS } from './journey.js';

/**
 * Check if a random event should occur
 * @param {Object} journey - Current journey state
 * @returns {Object|null} Event to resolve or null
 */
export function checkForEvent(journey) {
  if (journey.journeyType === 'field') {
    return checkFieldEvent(journey);
  } else {
    return checkDeskEvent(journey);
  }
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

/**
 * Get pace event probability modifier
 */
function getPaceEventModifier(paceId) {
  const modifiers = {
    resting: 0.3,
    slow: 0.6,
    normal: 1.0,
    fast: 1.4,
    grueling: 2.0
  };
  return modifiers[paceId] || 1;
}

/**
 * Get terrain event probability modifier
 */
function getTerrainEventModifier(terrain) {
  const modifiers = {
    flat: 0.8,
    hilly: 1.0,
    steep: 1.3,
    muskeg: 1.5,
    river: 1.4,
    cutblock: 1.1
  };
  return modifiers[terrain] || 1;
}

/**
 * Get weather event probability modifier
 */
function getWeatherEventModifier(weatherId) {
  const modifiers = {
    clear: 0.7,
    overcast: 1.0,
    light_rain: 1.2,
    heavy_rain: 1.5,
    fog: 1.3,
    light_snow: 1.2,
    heavy_snow: 1.6,
    freezing: 1.8,
    storm: 2.0
  };
  return modifiers[weatherId] || 1;
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

  // Handle permit effects (desk)
  if (option.effects?.permits_approved) {
    journey.permits.approved += option.effects.permits_approved;
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
    if (effects.fuel) {
      journey.resources.fuel = Math.max(0, journey.resources.fuel + effects.fuel);
      if (effects.fuel < 0) messages.push(`Fuel: ${effects.fuel} gallons`);
    }
    if (effects.food) {
      journey.resources.food = Math.max(0, journey.resources.food + effects.food);
      if (effects.food < 0) messages.push(`Food: ${effects.food} days`);
    }
    if (effects.equipment) {
      journey.resources.equipment = Math.max(0, Math.min(100, journey.resources.equipment + effects.equipment));
      if (effects.equipment < 0) messages.push(`Equipment: ${effects.equipment}%`);
    }
    if (effects.firstAid) {
      journey.resources.firstAid = Math.max(0, journey.resources.firstAid + effects.firstAid);
    }
  }

  // Resource effects (desk)
  if (journey.journeyType === 'desk') {
    if (effects.budget) {
      journey.resources.budget = Math.max(0, journey.resources.budget + effects.budget);
      if (effects.budget < 0) messages.push(`Budget: $${Math.abs(effects.budget)}`);
    }
    if (effects.politicalCapital) {
      journey.resources.politicalCapital = Math.max(0,
        Math.min(100, journey.resources.politicalCapital + effects.politicalCapital));
    }
    if (effects.timeUsed) {
      journey.hoursRemaining = Math.max(0, journey.hoursRemaining - effects.timeUsed);
    }
  }

  // Progress effects
  if (effects.progress) {
    if (journey.journeyType === 'field') {
      journey.distanceTraveled = Math.max(0, journey.distanceTraveled + effects.progress);
    }
    // For desk, progress affects permit pipeline speed
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
export function formatEventForDisplay(event) {
  return {
    title: event.title,
    description: event.description,
    severity: event.severity,
    type: event.type,
    options: event.options.map((opt, index) => ({
      index: index + 1,
      label: opt.label,
      hint: getOptionHint(opt)
    }))
  };
}

/**
 * Generate a hint about an option's effects
 */
function getOptionHint(option) {
  const hints = [];

  if (option.effects) {
    if (option.effects.fuel < -10) hints.push('high fuel cost');
    if (option.effects.food < -10) hints.push('uses food');
    if (option.effects.crew_morale < -10) hints.push('hurts morale');
    if (option.effects.budget < -1000) hints.push('expensive');
    if (option.effects.progress < -5) hints.push('delays progress');
  }

  if (option.riskInjury > 0.2) hints.push('risky');
  if (option.timeUsed > 4) hints.push('time-consuming');

  return hints.length > 0 ? `(${hints.join(', ')})` : '';
}
