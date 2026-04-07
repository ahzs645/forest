/**
 * Event Resolution
 * Applies selected event option effects to journey state
 */

import { isFieldJourney, isDeskJourney } from './constants.js';
import { applyRandomInjury, applyStatusEffect } from '../crew.js';
import { syncBlocksFromDistance } from '../journey/blockNav.js';
import { FIELD_RESOURCES, DESK_RESOURCES } from '../resources.js';

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
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
 * Resolve an event by applying the selected option
 * @param {Object} journey - Journey state
 * @param {Object} event - Event being resolved
 * @param {Object} option - Selected option
 * @returns {Object} Result with updated journey and messages
 */
export function resolveEvent(journey, event, option) {
  const messages = [];

  if (option.outcome) {
    messages.push(option.outcome);
  }

  if (option.effects) {
    applyEventEffects(journey, option.effects, messages);
  }

  if (option.crewEffect) {
    handleCrewEffect(journey, option.crewEffect, messages);
  }

  if (option.riskInjury && Math.random() < option.riskInjury) {
    const victim = pickRandomCrewMember(journey.crew);
    if (victim) {
      const severity = option.riskInjury > 0.2 ? 'moderate' : 'minor';
      const result = applyRandomInjury(victim, severity);
      messages.push(`Accident! ${result.message}`);
    }
  }

  if (isFieldJourney(journey.journeyType) && typeof option.timeUsed === 'number') {
    const hours = Math.max(0, Math.min(8, option.timeUsed));
    journey.travelDelayHours = Math.min(8, (journey.travelDelayHours || 0) + hours);
    if (hours > 0) {
      messages.push(`Lost ${hours} hours dealing with the situation.`);
    }
  }

  if (typeof option.effects?.permits_approved === 'number' && journey.permits) {
    journey.permits.approved = Math.min(
      journey.permits.target,
      journey.permits.approved + option.effects.permits_approved
    );
    messages.push(`Permits approved: ${journey.permits.approved}/${journey.permits.target}`);
  }

  if (option.schedulesEvent) {
    if (!journey.scheduledEvents) journey.scheduledEvents = [];
    journey.scheduledEvents.push({
      eventId: option.schedulesEvent,
      triggerDay: journey.day + (option.scheduledDelay || 3)
    });
    messages.push('This may have consequences later...');
  }

  if (!journey.log) journey.log = [];
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
  if (isFieldJourney(journey.journeyType)) {
    if (typeof effects.budget === 'number' && typeof journey.resources?.budget === 'number') {
      journey.resources.budget = Math.max(0,
        Math.min(FIELD_RESOURCES.budget.max, journey.resources.budget + effects.budget));
      if (effects.budget !== 0) {
        const delta = effects.budget;
        const label = delta > 0 ? `+$${Math.abs(delta).toLocaleString()}` : `-$${Math.abs(delta).toLocaleString()}`;
        messages.push(`Cash: ${label}`);
      }
    }
    if (typeof effects.fuel === 'number' && typeof journey.resources?.fuel === 'number') {
      journey.resources.fuel = Math.max(0,
        Math.min(FIELD_RESOURCES.fuel.max, journey.resources.fuel + effects.fuel));
      if (effects.fuel < 0) messages.push(`Fuel: ${effects.fuel} gallons`);
    }
    if (typeof effects.food === 'number' && typeof journey.resources?.food === 'number') {
      journey.resources.food = Math.max(0,
        Math.min(FIELD_RESOURCES.food.max, journey.resources.food + effects.food));
      if (effects.food < 0) messages.push(`Food: ${effects.food} days`);
    }
    if (typeof effects.equipment === 'number' && typeof journey.resources?.equipment === 'number') {
      journey.resources.equipment = Math.max(0,
        Math.min(FIELD_RESOURCES.equipment.max, journey.resources.equipment + effects.equipment));
      if (effects.equipment < 0) messages.push(`Equipment: ${effects.equipment}%`);
    }
    if (typeof effects.firstAid === 'number' && typeof journey.resources?.firstAid === 'number') {
      journey.resources.firstAid = Math.max(0,
        Math.min(FIELD_RESOURCES.firstAid.max, journey.resources.firstAid + effects.firstAid));
    }
  }

  // Resource effects (desk)
  if (isDeskJourney(journey.journeyType)) {
    if (typeof effects.budget === 'number' && typeof journey.resources?.budget === 'number') {
      journey.resources.budget = Math.max(0,
        Math.min(DESK_RESOURCES.budget.max, journey.resources.budget + effects.budget));
      if (effects.budget !== 0) {
        const label = effects.budget > 0 ? '+' : '-';
        messages.push(`Budget: ${label}$${Math.abs(effects.budget).toLocaleString()}`);
      }
    }
    if (typeof effects.politicalCapital === 'number' && typeof journey.resources?.politicalCapital === 'number') {
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
  if (typeof effects.progress === 'number' && effects.progress !== 0) {
    applyProgressEffects(journey, effects.progress, messages);
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
  if (typeof effects.compliance === 'number' && effects.compliance !== 0) {
    applyComplianceEffects(journey, effects.compliance, messages);
  }

  if (typeof effects.relationships === 'number' && effects.relationships !== 0) {
    applyRelationshipEffects(journey, effects.relationships, messages);
  }
}

function applyProgressEffects(journey, progressPoints, messages) {
  switch (journey.journeyType) {
    case 'planning':
      applyPlanningProgress(journey, progressPoints, messages);
      return;

    case 'permitting':
    case 'desk':
      applyDeskProgress(journey, progressPoints, messages);
      return;

    case 'field':
    case 'recon':
      if (typeof journey.distanceTraveled === 'number') {
        journey.distanceTraveled = Math.max(0, journey.distanceTraveled + progressPoints);
        syncBlocksFromDistance(journey);
      }
      return;

    default:
      return;
  }
}

function applyPlanningProgress(journey, progressPoints, messages) {
  if (!journey.plan) return;

  const amount = Math.max(3, Math.round(Math.abs(progressPoints) * 1.5));
  let metricKey = 'dataCompleteness';
  let metricLabel = 'Data readiness';

  switch (journey.plan.phase) {
    case 'analysis':
      metricKey = 'analysisQuality';
      metricLabel = 'Analysis quality';
      break;
    case 'stakeholder_review':
      metricKey = 'stakeholderBuyIn';
      metricLabel = 'Stakeholder buy-in';
      break;
    case 'ministerial_approval':
      metricKey = 'ministerialConfidence';
      metricLabel = 'Ministerial confidence';
      break;
    default:
      break;
  }

  const signedAmount = progressPoints > 0 ? amount : -amount;
  journey.plan[metricKey] = clampPercent((journey.plan[metricKey] || 0) + signedAmount);

  const direction = progressPoints > 0 ? 'improved' : 'slipped';
  messages.push(`${metricLabel} ${direction} (${signedAmount > 0 ? '+' : ''}${signedAmount}%).`);
  advancePlanningPhaseIfReady(journey, messages);
}

function applyComplianceEffects(journey, delta, messages) {
  if (isDeskJourney(journey.journeyType) && typeof journey.resources?.politicalCapital === 'number') {
    journey.resources.politicalCapital = clampPercent(journey.resources.politicalCapital + delta);
  }

  if (journey.journeyType === 'planning' && journey.plan) {
    journey.plan.ministerialConfidence = clampPercent(journey.plan.ministerialConfidence + delta);
    if (journey.protagonist) {
      journey.protagonist.reputation = clampPercent((journey.protagonist.reputation || 0) + Math.ceil(delta / 2));
    }
    messages.push(`Ministerial confidence ${delta > 0 ? 'rose' : 'fell'} (${delta > 0 ? '+' : ''}${delta}%).`);
    advancePlanningPhaseIfReady(journey, messages);
    return;
  }

  if (journey.journeyType === 'permitting' && journey.regulations) {
    journey.regulations.complianceScore = clampPercent((journey.regulations.complianceScore || 0) + delta);
    messages.push(`Regulatory standing ${delta > 0 ? 'improved' : 'worsened'} (${delta > 0 ? '+' : ''}${delta}).`);
  }
}

function applyRelationshipEffects(journey, delta, messages) {
  const relationshipShift = delta > 0 ? Math.max(1, Math.round(delta / 2)) : Math.min(-1, Math.round(delta / 2));

  if (journey.relationships && typeof journey.relationships === 'object') {
    for (const key of Object.keys(journey.relationships)) {
      if (typeof journey.relationships[key] === 'number') {
        journey.relationships[key] = clampPercent(journey.relationships[key] + relationshipShift);
      }
    }
  }

  if (journey.stakeholders && typeof journey.stakeholders === 'object') {
    for (const key of Object.keys(journey.stakeholders)) {
      if (typeof journey.stakeholders[key]?.mood === 'number') {
        journey.stakeholders[key].mood = clampPercent(journey.stakeholders[key].mood + relationshipShift);
      }
    }
  }

  if (journey.journeyType === 'planning' && journey.plan) {
    journey.plan.stakeholderBuyIn = clampPercent(journey.plan.stakeholderBuyIn + delta);
    if (journey.protagonist) {
      journey.protagonist.reputation = clampPercent((journey.protagonist.reputation || 0) + relationshipShift);
    }
    advancePlanningPhaseIfReady(journey, messages);
  }

  messages.push(`Relationships ${delta > 0 ? 'improved' : 'frayed'} (${delta > 0 ? '+' : ''}${delta}).`);
}

function advancePlanningPhaseIfReady(journey, messages) {
  if (!journey.plan) return;

  if (journey.plan.phase === 'data_gathering' && journey.plan.dataCompleteness >= 80) {
    journey.plan.phase = 'analysis';
    messages.push('Data phase complete! Moving to Analysis.');
    return;
  }

  if (journey.plan.phase === 'analysis' && journey.plan.analysisQuality >= 80) {
    journey.plan.phase = 'stakeholder_review';
    messages.push('Analysis complete! Moving to Stakeholder Review.');
    return;
  }

  if (journey.plan.phase === 'stakeholder_review' && journey.plan.stakeholderBuyIn >= 75) {
    journey.plan.phase = 'ministerial_approval';
    messages.push('Stakeholder review complete! Moving to Ministerial Approval.');
    return;
  }

  if (journey.plan.phase === 'ministerial_approval' && journey.plan.ministerialConfidence >= 80) {
    journey.isComplete = true;
    journey.endReason = 'Landscape plan approved by Ministry!';
  }
}

/**
 * Handle crew-specific effects
 */
function handleCrewEffect(journey, crewEffect, messages) {
  if (crewEffect.injury) {
    const victim = pickRandomCrewMember(journey.crew);
    if (victim) {
      const result = applyStatusEffect(victim, crewEffect.injury);
      if (result.message) messages.push(result.message);
    }
  }

  if (crewEffect.illness && crewEffect.count) {
    const victims = pickMultipleCrewMembers(journey.crew, crewEffect.count);
    for (const victim of victims) {
      const result = applyStatusEffect(victim, crewEffect.illness);
      if (result.message) messages.push(result.message);
    }
  }

  if (crewEffect.evacuate) {
    const victim = journey.crew.find(m => m.isActive &&
      m.statusEffects.some(e => e.effectId === crewEffect.injury));
    if (victim) {
      victim.isActive = false;
      messages.push(`${victim.name} has been evacuated for medical care.`);
    }
  }

  if (crewEffect.rest) {
    // This would be tracked for recovery
  }
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
