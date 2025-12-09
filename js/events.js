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
      const budgetStr = Math.abs(option.effects.budget) >= 1000
        ? `$${Math.round(option.effects.budget/1000)}k`
        : `$${option.effects.budget}`;
      hints.push(option.effects.budget > 0 ? budgetStr : budgetStr);
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
      hints.push(option.effects.progress > 0 ? `+${option.effects.progress} km` : `${option.effects.progress} km`);
    }
  }

  // Risk indicators
  if (option.riskInjury) {
    const riskPct = Math.round(option.riskInjury * 100);
    hints.push(`${riskPct}% injury risk`);
  }

  // Time cost
  if (option.timeUsed) {
    hints.push(`-${option.timeUsed}h`);
  }

  return hints.length > 0 ? hints.join(', ') : 'Safe choice';
}

/**
 * Format effect preview for display in UI
 * @param {Object} option - Event option
 * @returns {string} Formatted effect preview
 */
export function formatOptionEffects(option) {
  return getOptionHint(option);
}
