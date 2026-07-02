/**
 * Event Resolution
 * Applies selected event option effects to journey state
 */

import { isFieldJourney, isDeskJourney } from './constants.js';
import { applyRandomInjury, applyStatusEffect } from '../crew.js';
import { syncBlocksFromDistance } from '../journey/blockNav.js';
import { FIELD_RESOURCES, DESK_RESOURCES } from '../resources.js';
import { addDiscoveryTags, inferDiscoveryTagsFromEvent } from '../data/discoveryTags.js';
import { buildEventReaction } from './reactions.js';

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function clampScrutiny(value) {
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
  const scrutinyBefore = Number(journey.scrutiny || 0);

  // Gamble options: roll once, then use the resolved branch throughout
  let outcome = option.outcome;
  let effects = option.effects;
  if (typeof option.chanceSuccess === 'number' && Math.random() >= option.chanceSuccess) {
    outcome = option.failureOutcome || outcome;
    effects = option.failureEffects || effects;
  }

  if (outcome) {
    messages.push(outcome);
  }

  if (effects) {
    applyEventEffects(journey, effects, messages);
  }

  if (option.crewEffect) {
    handleCrewEffect(journey, option.crewEffect, messages);
  }

  let injuryVictim = null;
  if (option.riskInjury && Math.random() < option.riskInjury) {
    const victim = pickRandomCrewMember(journey.crew);
    if (victim) {
      const severity = option.riskInjury > 0.2 ? 'moderate' : 'minor';
      const result = applyRandomInjury(victim, severity);
      messages.push(`Accident! ${result.message}`);
      injuryVictim = victim;
    }
  }

  // A risky call can come back as a compliance/permitting problem later
  const complianceRisk = option.riskCompliance ?? option.riskRejection;
  if (typeof complianceRisk === 'number' && Math.random() < complianceRisk) {
    applyEventEffects(journey, { compliance: -5 }, messages);
    messages.push('That call comes back on you.');
  }

  if (isFieldJourney(journey.journeyType) && typeof option.timeUsed === 'number') {
    const hours = Math.max(0, Math.min(8, option.timeUsed));
    journey.travelDelayHours = Math.min(8, (journey.travelDelayHours || 0) + hours);
    if (hours > 0) {
      messages.push(`Lost ${hours} hours dealing with the situation.`);
    }
  }

  if (typeof effects?.permits_approved === 'number' && journey.permits) {
    journey.permits.approved = Math.min(
      journey.permits.target,
      journey.permits.approved + effects.permits_approved
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

  messages.push(...applyDiscoveryTagEffects(journey, event, option));

  const scrutinyDelta = Number(journey.scrutiny || 0) - scrutinyBefore;
  if (scrutinyDelta !== 0) {
    const direction = scrutinyDelta > 0 ? 'rose' : 'eased';
    messages.push(`Scrutiny ${direction} to ${journey.scrutiny}%.`);
  }

  const reaction = buildEventReaction(journey, option);
  if (reaction) {
    messages.push(reaction);
  }

  if (!journey.log) journey.log = [];
  journey.log.push({
    day: journey.day,
    type: 'event',
    eventId: event.id,
    eventTitle: event.title,
    optionLabel: option.label,
    severity: event.severity,
    ...(injuryVictim ? { victimId: injuryVictim.id, victimName: injuryVictim.name } : {})
  });

  return { journey, messages };
}

/**
 * Apply effects from an event option
 */
function applyEventEffects(journey, effects, messages) {
  journey.scrutiny = clampScrutiny(Number(journey.scrutiny || 0));

  // Resource effects (field)
  if (isFieldJourney(journey.journeyType)) {
    if (typeof effects.budget === 'number' && effects.budget !== 0 && typeof journey.resources?.budget === 'number') {
      // The field cash ceiling is sized for a crew wallet, not silviculture's
      // program treasury — clamping the latter to it would wipe the budget.
      const budgetCap = journey.journeyType === 'silviculture' ? Infinity : FIELD_RESOURCES.budget.max;
      journey.resources.budget = Math.max(0,
        Math.min(budgetCap, journey.resources.budget + effects.budget));
      const delta = effects.budget;
      const label = delta > 0 ? `+$${Math.abs(delta).toLocaleString()}` : `-$${Math.abs(delta).toLocaleString()}`;
      messages.push(`Cash: ${label}`);
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

  // Resource effects (manager) — explicit handling because the GM journey is
  // neither a field nor a desk journey: it carries BOTH resource sets (see
  // createManagerJourney). Money and political capital behave like desk, but
  // at corporate scale (the 100k desk budget ceiling would eat a 500k
  // treasury), while the field-side stocks back the operating divisions.
  if (journey.journeyType === 'manager') {
    if (typeof effects.budget === 'number' && typeof journey.resources?.budget === 'number') {
      journey.resources.budget = Math.max(0, journey.resources.budget + effects.budget);
      if (effects.budget !== 0) {
        const label = effects.budget > 0 ? '+' : '-';
        messages.push(`Budget: ${label}$${Math.abs(effects.budget).toLocaleString()}`);
      }
    }
    if (typeof effects.politicalCapital === 'number' && typeof journey.resources?.politicalCapital === 'number') {
      journey.resources.politicalCapital = Math.max(0,
        Math.min(DESK_RESOURCES.politicalCapital.max, journey.resources.politicalCapital + effects.politicalCapital));
    }
    for (const stock of ['fuel', 'food', 'equipment', 'firstAid']) {
      if (typeof effects[stock] !== 'number' || typeof journey.resources?.[stock] !== 'number') continue;
      journey.resources[stock] = Math.max(0,
        Math.min(FIELD_RESOURCES[stock].max, journey.resources[stock] + effects[stock]));
    }
    if (typeof effects.reputation === 'number' && journey.metrics) {
      journey.metrics.reputation = clampPercent((journey.metrics.reputation || 0) + effects.reputation);
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
    const active = (journey.crew || []).filter((m) => m.isActive);
    if (active.length > 0) {
      for (const member of active) {
        member.morale = Math.max(0, Math.min(100, member.morale + effects.crew_morale));
      }
      messages.push(effects.crew_morale > 0 ? 'Crew morale improved.' : 'Crew morale dropped.');
    } else if (journey.protagonist) {
      // Protagonist desk modes have no crew: morale maps to stress, the same
      // equivalence checkDeskEvent uses (avgMorale = 100 - stress).
      journey.protagonist.stress = Math.max(0, Math.min(100,
        (journey.protagonist.stress || 0) - effects.crew_morale));
      messages.push(effects.crew_morale > 0 ? 'Your stress eases.' : 'Your stress climbs.');
    }
  }

  // Survey/intel data (recce discoveries; feeds planning data when present)
  if (typeof effects.data === 'number' && effects.data !== 0) {
    let banked = false;
    if (typeof journey.qualitySurveys === 'number') {
      journey.qualitySurveys += Math.max(1, Math.round(effects.data / 5));
      banked = true;
    }
    if (journey.plan && typeof journey.plan.dataCompleteness === 'number') {
      journey.plan.dataCompleteness = clampPercent(journey.plan.dataCompleteness + effects.data);
      banked = true;
    }
    if (banked) {
      messages.push(`Survey data logged (+${effects.data}).`);
    }
  }

  // Reputation outside manager mode lands on standing: relationships for desk
  // journeys, compliance/scrutiny for field crews (the manager branch above
  // routes it to metrics.reputation directly).
  if (typeof effects.reputation === 'number' && effects.reputation !== 0 && journey.journeyType !== 'manager') {
    if (isFieldJourney(journey.journeyType)) {
      applyComplianceEffects(journey, effects.reputation, messages);
    } else {
      applyRelationshipEffects(journey, effects.reputation, messages);
    }
  }

  // Compliance/relationships (legacy compatibility)
  if (typeof effects.compliance === 'number' && effects.compliance !== 0) {
    applyComplianceEffects(journey, effects.compliance, messages);
  }

  if (typeof effects.relationships === 'number' && effects.relationships !== 0) {
    applyRelationshipEffects(journey, effects.relationships, messages);
  }

  applyScrutinyEffects(journey, effects);
}

function applyScrutinyEffects(journey, effects) {
  let delta = 0;

  if (typeof effects.scrutiny === 'number') {
    delta += effects.scrutiny;
  }

  if (typeof effects.compliance === 'number') {
    delta += effects.compliance < 0 ? Math.abs(effects.compliance) * 1.5 : -Math.max(1, Math.round(effects.compliance * 0.5));
  }

  if (typeof effects.relationships === 'number') {
    delta += effects.relationships < 0
      ? Math.max(1, Math.round(Math.abs(effects.relationships) / 3))
      : -Math.max(1, Math.round(effects.relationships / 4));
  }

  if (typeof effects.progress === 'number' && effects.progress > 6) {
    delta += 1;
  }

  if (typeof effects.politicalCapital === 'number' && effects.politicalCapital > 4) {
    delta += 1;
  }

  if (delta !== 0) {
    journey.scrutiny = clampScrutiny((journey.scrutiny || 0) + delta);
  }
}

function applyDiscoveryTagEffects(journey, event, option) {
  const effectTags = Array.isArray(option?.effects?.discoveryTags)
    ? option.effects.discoveryTags
    : [];
  const inferredTags = inferDiscoveryTagsFromEvent(event);
  const tagIds = Array.from(new Set([...effectTags, ...inferredTags]));

  if (!tagIds.length) {
    return [];
  }

  const tags = addDiscoveryTags(journey, tagIds, {
    source: `event:${event?.id || 'unknown'}`,
    severity: 2,
    note: event?.title ? `Carry-forward finding from ${event.title}.` : null
  });

  if (!tags.length) {
    return [];
  }

  return [`Carry-forward intel: ${tags.map((tag) => tag.label).join(', ')}.`];
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

    case 'manager':
      if (journey.metrics) {
        journey.metrics.progress = clampPercent((journey.metrics.progress || 0) + progressPoints);
        const direction = progressPoints > 0 ? 'advanced' : 'slipped';
        messages.push(`Operational progress ${direction} (${progressPoints > 0 ? '+' : ''}${progressPoints}).`);
      }
      return;

    case 'silviculture':
      // Route program progress into the planting track that
      // getOperationalProgress actually reads (~8 points per block). Blocks
      // are a whole-number display ("X/15 blocks") - progressPoints/8 is
      // rarely a whole number, so bank the fractional remainder on the
      // journey instead of applying it directly, and only ever move
      // blocksPlanted by whole blocks. Without the remainder carrying over,
      // a string of small events could either get silently rounded away
      // (never nudging the counter) or, worse, show the player a
      // fractional block count like "0.125/15 blocks".
      if (journey.planting && typeof journey.planting.blocksToPlant === 'number') {
        const remainder = (journey.planting._blockProgressRemainder || 0) + progressPoints / 8;
        const wholeBlocks = Math.trunc(remainder);
        journey.planting._blockProgressRemainder = remainder - wholeBlocks;

        if (wholeBlocks !== 0) {
          // A setback event can knock blocksPlanted down, but never below
          // what has actually been planted (seedlingsPlanted / seedlingsAllocated
          // in block terms) - otherwise a bad narrative roll could erase
          // real, resource-backed planting progress and leave the block
          // counter permanently unable to reach blocksToPlant even after
          // every seedling in the allocation has gone into the ground.
          const seedlingsImpliedBlocks = journey.planting.seedlingsAllocated > 0
            ? Math.floor(((journey.planting.seedlingsPlanted || 0) / journey.planting.seedlingsAllocated) * journey.planting.blocksToPlant)
            : 0;
          const nextBlocksPlanted = (journey.planting.blocksPlanted || 0) + wholeBlocks;
          journey.planting.blocksPlanted = Math.max(seedlingsImpliedBlocks,
            Math.min(journey.planting.blocksToPlant, nextBlocksPlanted));
        }

        const direction = progressPoints > 0 ? 'advanced' : 'slipped';
        messages.push(`Program progress ${direction} (${progressPoints > 0 ? '+' : ''}${progressPoints}).`);
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
  if (journey.journeyType === 'manager' && journey.metrics) {
    journey.metrics.compliance = clampPercent((journey.metrics.compliance || 0) + delta);
    messages.push(`Compliance posture ${delta > 0 ? 'improved' : 'slipped'} (${delta > 0 ? '+' : ''}${delta}).`);
    return;
  }

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

  if (journey.journeyType === 'manager' && journey.metrics) {
    journey.metrics.relationships = clampPercent((journey.metrics.relationships || 0) + delta);
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

  if (crewEffect.illness) {
    // riskWorsen gates whether the condition actually sets in
    const setsIn = typeof crewEffect.riskWorsen === 'number'
      ? Math.random() < crewEffect.riskWorsen
      : true;
    if (setsIn) {
      const victims = pickMultipleCrewMembers(journey.crew, crewEffect.count || 1);
      for (const victim of victims) {
        const result = applyStatusEffect(victim, crewEffect.illness);
        if (result.message) messages.push(result.message);
      }
    }
  }

  if (crewEffect.lose_member || crewEffect.leave) {
    const victim = pickRandomCrewMember(journey.crew);
    if (victim) {
      victim.isActive = false;
      victim.hasQuit = true;
      messages.push(`${victim.name} has left the crew.`);
    }
  }

  if (crewEffect.evacuate_sick) {
    const victim = (journey.crew || []).find(m => m.isActive && m.statusEffects?.length > 0);
    if (victim) {
      victim.isActive = false;
      messages.push(`${victim.name} has been sent to town for medical care.`);
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
