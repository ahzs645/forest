/**
 * Event Resolution
 * Applies selected event option effects to journey state
 */

import { isFieldJourney, isDeskJourney } from './constants.js';
import { applyRandomInjury, applyStatusEffect, evacuateCrewMember } from '../crew.js';
import { applyEventTravelEffect } from '../journey/fieldMechanics.js';
import {
  describeLane,
  ensurePermitFiles,
  getSignableFiles,
  issuePermitFile,
  shortenPermitClock,
  slipPermitClock
} from '../journey/permitPipeline.js';
import { FIELD_RESOURCES, DESK_RESOURCES } from '../resources.js';
import { addDiscoveryTags, inferDiscoveryTagsFromEvent } from '../data/discoveryTags.js';
import { buildEventReaction } from './reactions.js';
import { resolveOutcomeBand } from './odds.js';
import { applyConsequenceFlags, getCrewPrecedentMultiplier } from './consequences.js';
import { getDayRng } from './dayRng.js';
/**
 * Ceiling on how much ground a single day's trouble can cost a field crew.
 * Event content still rates delays on the retired eight-hour scale; this
 * turns that number into a share of the shift without ever zeroing it out.
 */
const MAX_TRAVEL_SETBACK = 0.75;

/**
 * Stress and energy a desk delay costs per hour it was authored at, on the
 * same retired eight-hour scale.
 */
const DESK_DELAY_STRAIN = 2;

/**
 * Authored field-event fuel deltas are still written on the old gallon scale
 * (js/data/json/field/events.json, "fuel": -8). The stockpile is litres now
 * (js/resources.js), so every authored delta is scaled here, at application,
 * rather than in sixty places of content. A -8 in the deck is -32 L on the
 * truck.
 */
export const FUEL_EFFECT_SCALE = 4;

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function clampScrutiny(value) {
  return Math.max(0, Math.min(100, value));
}

/**
 * Goodwill at or below this after a loss gets a warning, because zero ends a
 * desk run (js/modes/shared/endConditions.js) and nothing else on the card
 * says so.
 */
const GOODWILL_WARNING_THRESHOLD = 15;

export function readGoodwill(journey) {
  const value = journey?.resources?.politicalCapital;
  return typeof value === 'number' ? value : null;
}

/**
 * Say what an event did to the district's goodwill. Compliance hits, capital
 * effects and band fallout all drain the same meter, and until now none of
 * them said so - the run ended from a "start next day" button.
 */
export function describeGoodwillChange(journey, before) {
  const after = readGoodwill(journey);
  if (before === null || after === null) return [];
  const delta = Math.round(after - before);
  if (delta === 0) return [];

  const label = journey.journeyType === 'manager' ? 'Political capital' : 'District goodwill';
  const lines = [`${label} ${delta > 0 ? '+' : ''}${delta} → ${Math.round(after)}.`];
  if (delta < 0 && journey.journeyType !== 'manager' && after <= GOODWILL_WARNING_THRESHOLD) {
    lines.push(after <= 0
      ? 'The district\'s goodwill is gone. The file stops here.'
      : journey.journeyType === 'planning'
        ? `Goodwill is nearly spent: at zero the district stops reading the file (${Math.round(after)} left).`
        : `Goodwill is nearly spent: at zero the licensee pulls you off the file (${Math.round(after)} left).`);
  }
  return lines;
}

/**
 * Pick a random active crew member
 */
function pickRandomCrewMember(crew, rng = Math.random) {
  const active = crew.filter(m => m.isActive);
  if (active.length === 0) return null;
  return active[Math.floor(rng() * active.length)];
}

/**
 * Pick multiple random active crew members
 */
function pickMultipleCrewMembers(crew, count, rng = Math.random) {
  const active = crew.filter(m => m.isActive);
  const selected = [];
  const pool = [...active];

  while (selected.length < count && pool.length > 0) {
    const index = Math.floor(rng() * pool.length);
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
  const goodwillBefore = readGoodwill(journey);
  // Today's dice for this situation (js/events/dayRng.js): the same choice
  // on the same day resolves the same way after a reload.
  const rng = getDayRng(journey, `resolve:${event?.id || 'event'}`);

  // Gamble options: roll once against odds shifted by the state the player has
  // actually built (js/events/odds.js), then use the resolved band throughout.
  // Options with no chanceSuccess resolve to the good band, which is exactly
  // what they did before this existed.
  const resolved = resolveOutcomeBand(option, journey, rng);
  const outcome = resolved.outcome;
  const effects = resolved.effects;

  if (outcome) {
    messages.push(outcome);
  }

  if (effects) {
    applyEventEffects(journey, effects, messages);
  }

  // The option's own crewEffect describes the good band ("taped, laced tight,
  // back on light duty"); the partial and bad bands carry their own. Applying
  // both used to narrate a fracture and a truck at first light while the
  // state said "sprained ankle" and kept them working.
  const bandCrewEffect = resolved.band === 'good' || !resolved.band
    ? option.crewEffect
    : (resolved.crewEffect || null);
  journey.lastEventVictimId = null;
  if (bandCrewEffect) {
    handleCrewEffect(journey, bandCrewEffect, messages, rng);
  }

  // What the band leaves behind. This is what stops a bad outcome from being
  // just a larger negative number (js/events/consequences.js).
  if (Array.isArray(resolved.flags) && resolved.flags.length) {
    applyConsequenceFlags(journey, resolved.flags, messages);
  }

  let injuryVictim = null;
  if (option.riskInjury && rng() < option.riskInjury) {
    const victim = pickRandomCrewMember(journey.crew, rng);
    if (victim) {
      const severity = option.riskInjury > 0.2 ? 'moderate' : 'minor';
      const result = applyRandomInjury(victim, severity, rng);
      messages.push(`Accident! ${result.message}`);
      injuryVictim = victim;
    }
  }

  // A risky call can come back as a compliance/permitting problem later
  const complianceRisk = option.riskCompliance ?? option.riskRejection;
  if (typeof complianceRisk === 'number' && rng() < complianceRisk) {
    applyEventEffects(journey, { compliance: -5 }, messages);
    messages.push('That call comes back on you.');
  }

  // Content still rates a delay on the old eight-hour scale; a shift is one
  // job now, so the same number reads as the share of the day's ground the
  // trouble cost. A setback never takes the whole shift — the crew always
  // makes some distance.
  const fieldTimeUsed = option.timeUsed ?? effects?.timeUsed;
  if (isFieldJourney(journey.journeyType) && typeof fieldTimeUsed === 'number') {
    const setback = Math.max(0, Math.min(MAX_TRAVEL_SETBACK, fieldTimeUsed / 8));
    journey.travelSetback = Math.min(MAX_TRAVEL_SETBACK, (journey.travelSetback || 0) + setback);
    if (setback > 0) {
      messages.push(setback >= 0.35
        ? 'Sorting that out eats most of the next leg.'
        : 'Sorting that out eats into the next leg.');
    }
  }

  if (typeof effects?.permits_approved === 'number' && effects.permits_approved > 0 && journey.permits) {
    applyPermitsApproved(journey, effects.permits_approved, messages);
  }

  // A consequence on a timer has to belong to the band that earned it. An
  // unconditional schedulesEvent contradicts any good band that says the thing
  // stayed buried - the player is told they got away with it and the follow-up
  // fires anyway. Band-specific scheduling wins; the unconditional form still
  // works for options that always carry a follow-up.
  // The desk deck is shared with the seasonal TUI (adaptOperationalEvent),
  // which knows nothing about bands and reads `schedulesEvent` directly. So the
  // unconditional field stays for seasonal, and band scheduling supersedes it
  // here rather than replacing it — otherwise moving a timer onto the bad band
  // silently deletes the follow-up from the other game.
  const hasBandScheduling = Boolean(
    option.failureSchedulesEvent || option.partialSchedulesEvent || option.goodSchedulesEvent
  );
  const scheduled = hasBandScheduling ? resolved.schedulesEvent : option.schedulesEvent;
  if (scheduled) {
    if (!journey.scheduledEvents) journey.scheduledEvents = [];
    journey.scheduledEvents.push({
      eventId: scheduled,
      triggerDay: journey.day + (option.scheduledDelay || 3)
    });
    messages.push('This may have consequences later...');
  }

  messages.push(...applyDiscoveryTagEffects(journey, event, option));

  const scrutinyDelta = Number(journey.scrutiny || 0) - scrutinyBefore;
  if (scrutinyDelta !== 0) {
    const direction = scrutinyDelta > 0 ? 'rose' : 'eased';
    messages.push(`Scrutiny ${direction} to ${Math.round(journey.scrutiny)}%.`);
  }

  messages.push(...describeGoodwillChange(journey, goodwillBefore));

  const reaction = buildEventReaction(journey, option, rng);
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
    outcome: outcome || '',
    consequences: messages.filter((message) => message && message !== outcome),
    effects: effects ? { ...effects } : {},
    severity: event.severity,
    ...(injuryVictim ? { victimId: injuryVictim.id, victimName: injuryVictim.name } : {})
  });

  return { journey, messages };
}

/**
 * Apply effects from an event option. Exported for the deferral path
 * (js/events/deferral.js), which lands an imposed situation's cost without
 * an option having been chosen.
 */
export function applyEventEffects(journey, effects, messages) {
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
      const litres = Math.round(effects.fuel * FUEL_EFFECT_SCALE);
      journey.resources.fuel = Math.max(0,
        Math.min(FIELD_RESOURCES.fuel.max, journey.resources.fuel + litres));
      if (litres !== 0) messages.push(`Fuel: ${litres > 0 ? '+' : ''}${litres} L`);
    }
    if (typeof effects.food === 'number' && typeof journey.resources?.food === 'number') {
      journey.resources.food = Math.max(0,
        Math.min(FIELD_RESOURCES.food.max, journey.resources.food + effects.food));
      if (effects.food !== 0) messages.push(`Food: ${effects.food > 0 ? '+' : ''}${effects.food} person-days`);
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
    // A delay never costs the day's action. The desk pool rolls something on
    // most days, so letting an event spend the day meant whole weeks where the
    // player never reached their own menu — an event is what happens around
    // the day's decision, not instead of it. The lost time lands as pressure.
    if (typeof effects.timeUsed === 'number' && effects.timeUsed > 0) {
      const strain = Math.max(1, Math.round(effects.timeUsed * DESK_DELAY_STRAIN));
      if (journey.protagonist) {
        journey.protagonist.stress = clampPercent((journey.protagonist.stress || 0) + strain);
        journey.protagonist.energy = clampPercent((journey.protagonist.energy || 0) - strain);
      } else if (typeof journey.resources?.energy === 'number') {
        journey.resources.energy = clampPercent(journey.resources.energy - strain);
      }
      messages.push(effects.timeUsed >= 4
        ? 'That one ate the day around the edges. You get your work done late and tired.'
        : 'The interruption cuts into the day you had planned.');
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
    applyProgressEffects(journey, effects.progress, messages, effects);
  }
  if (journey.journeyType === 'planning') {
    applyPlanningMetricEffects(journey, effects, messages);
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
      // Paying one person to stay teaches the rest what leverage is worth, so
      // later morale losses land harder. This is the delayed half of the bad
      // band on crew_threatens_quit (js/events/consequences.js).
      const precedent = getCrewPrecedentMultiplier(journey);
      const delta = effects.crew_morale < 0
        ? effects.crew_morale * precedent
        : effects.crew_morale;
      for (const member of active) {
        member.morale = Math.max(0, Math.min(100, member.morale + delta));
      }
      messages.push(effects.crew_morale > 0 ? 'Crew morale improved.' : 'Crew morale dropped.');
      if (precedent > 1 && effects.crew_morale < 0) {
        messages.push('It lands harder than it would have before the bonus.');
      }
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
    let planningData = false;
    if (typeof journey.qualitySurveys === 'number') {
      journey.qualitySurveys += Math.max(1, Math.round(effects.data / 5));
      banked = true;
    }
    if (journey.plan && typeof journey.plan.dataCompleteness === 'number') {
      journey.plan.dataCompleteness = clampPercent(journey.plan.dataCompleteness + effects.data);
      banked = true;
      planningData = true;
    }
    if (banked) {
      const sign = effects.data > 0 ? '+' : '';
      messages.push(planningData
        ? `Data readiness ${effects.data > 0 ? 'improved' : 'slipped'} (${sign}${effects.data}%).`
        : `Survey data logged (${sign}${effects.data}).`);
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

function applyProgressEffects(journey, progressPoints, messages, effects = {}) {
  switch (journey.journeyType) {
    case 'planning':
      applyPlanningProgress(journey, progressPoints, messages, effects);
      return;

    case 'permitting':
    case 'desk':
      applyDeskProgress(journey, progressPoints, messages);
      return;

    case 'field':
    case 'recon':
      // Never a direct move: ground an event gains or loses goes through the
      // next travel leg, which stops at the next stop and its road check.
      if (typeof journey.distanceTraveled === 'number') {
        messages.push(...applyEventTravelEffect(journey, progressPoints, {
          turnBack: effects.progressMode === 'turn_back'
        }));
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
      // Event progress is program schedule, never planted blocks: a block
      // is planted when a contractor puts its trees in the ground and gets
      // paid for them, and nothing on the radio changes that. Eight points
      // is a day. The mode settles whole days at the end of the day
      // (js/modes/silviculture.js settleProgramSchedule): a day ahead buys
      // the release crew an extra shift, a day behind costs crew-days.
      if (journey.planting && typeof journey.planting.blocksToPlant === 'number') {
        journey.programSchedule ||= { days: 0 };
        journey.programSchedule.days = (journey.programSchedule.days || 0) + progressPoints / 8;
        const days = Math.abs(progressPoints / 8);
        const dayText = days >= 1 ? `${days.toFixed(1)} day${days >= 1.05 ? 's' : ''}` : 'part of a day';
        messages.push(progressPoints > 0
          ? `Program schedule gained ${dayText} (+${progressPoints}).`
          : `Program schedule slipped ${dayText} (${progressPoints}).`);
      }
      return;

    default:
      return;
  }
}

/** Explicit planning-file effect keys a desk event can carry. */
const PLANNING_METRIC_KEYS = {
  analysis: { metric: 'analysisQuality', label: 'Analysis quality' },
  buyIn: { metric: 'stakeholderBuyIn', label: 'Stakeholder buy-in' },
};

function hasExplicitPlanningKey(effects = {}) {
  return ['data', 'analysis', 'buyIn'].some((key) => typeof effects?.[key] === 'number' && effects[key] !== 0);
}

/**
 * Explicit planning-file effects: `data` lands on data completeness (handled
 * with the survey-data key above), `analysis` on the draft plan, `buyIn` on
 * the engagement record. `blockSelection: true` reopens the cutblock
 * priority decision. None of these moves the District Manager's readiness
 * or advances a phase — only the planner's own work does that.
 */
function applyPlanningMetricEffects(journey, effects, messages) {
  if (!journey.plan) return;
  for (const [key, { metric, label }] of Object.entries(PLANNING_METRIC_KEYS)) {
    const delta = effects?.[key];
    if (typeof delta !== 'number' || delta === 0) continue;
    journey.plan[metric] = clampPercent((journey.plan[metric] || 0) + delta);
    messages.push(`${label} ${delta > 0 ? 'improved' : 'slipped'} (${delta > 0 ? '+' : ''}${delta}%).`);
  }
  if (effects?.blockSelection === true && journey.blockPlanning) {
    journey.blockPlanning.pendingSelection = true;
    messages.push('The lead block set is back on the table; the cutblock priority decision reopens tomorrow.');
  }
}

/**
 * Strain (energy down, stress up) per point of generic progress lost on a
 * planning file, and the floor and ceiling on one event's charge.
 */
const PLANNING_PROGRESS_STRAIN = 0.6;
const PLANNING_PROGRESS_STRAIN_MIN = 2;
const PLANNING_PROGRESS_STRAIN_MAX = 12;

/**
 * Generic progress on a planning file is the planner's own working time,
 * never the file's gates. Data, analysis, buy-in and DM readiness move only
 * on the planner's own actions or an explicit data/analysis/buyIn key: a
 * wildfire evacuation or a grant application costs the week, not the
 * District Manager's confidence or the engagement record. It used to land
 * on whichever gate the current phase was tracking, which is how evacuating
 * ahead of a fire read as "DM readiness slipped (-29%)".
 */
function applyPlanningProgress(journey, progressPoints, messages, effects = {}) {
  if (!journey.plan || !journey.protagonist) return;
  if (hasExplicitPlanningKey(effects)) return;

  const strain = Math.max(PLANNING_PROGRESS_STRAIN_MIN,
    Math.min(PLANNING_PROGRESS_STRAIN_MAX, Math.round(Math.abs(progressPoints) * PLANNING_PROGRESS_STRAIN)));
  const protagonist = journey.protagonist;
  if (progressPoints < 0) {
    protagonist.energy = clampPercent((protagonist.energy || 0) - strain);
    protagonist.stress = clampPercent((protagonist.stress || 0) + strain);
    messages.push(`Lost time on the file: energy -${strain}, stress +${strain}.`);
  } else {
    protagonist.energy = clampPercent((protagonist.energy || 0) + strain);
    protagonist.stress = clampPercent((protagonist.stress || 0) - strain);
    messages.push(`Time back on the file: energy +${strain}, stress -${strain}.`);
  }
}

/**
 * Running total of the relationship and compliance effects a deployment's
 * events announced ("Relationships improved (+12)"). Field and desk journeys
 * have no year meters of their own, so without this the campaign's season
 * review could not see any of it (js/game/campaign.js computeSeasonBridge).
 */
function recordStanding(journey, key, delta) {
  journey.standingLedger ||= { relationships: 0, compliance: 0 };
  journey.standingLedger[key] = (Number(journey.standingLedger[key]) || 0) + delta;
}

function applyComplianceEffects(journey, delta, messages) {
  recordStanding(journey, 'compliance', delta);
  if (journey.journeyType === 'manager' && journey.metrics) {
    journey.metrics.compliance = clampPercent((journey.metrics.compliance || 0) + delta);
    messages.push(`Compliance posture ${delta > 0 ? 'improved' : 'slipped'} (${delta > 0 ? '+' : ''}${delta}).`);
    return;
  }

  if (journey.journeyType === 'planning') {
    // On a planning file, compliance is the planner's own standing: it moves
    // scrutiny (applyScrutinyEffects) and reputation, never the District
    // Manager's readiness and never the district's goodwill.
    if (journey.protagonist) {
      journey.protagonist.reputation = clampPercent((journey.protagonist.reputation || 0) + Math.ceil(delta / 2));
    }
    messages.push(`Professional standing ${delta > 0 ? 'improved' : 'slipped'} (${delta > 0 ? '+' : ''}${delta}).`);
    return;
  }

  if (isDeskJourney(journey.journeyType) && typeof journey.resources?.politicalCapital === 'number') {
    journey.resources.politicalCapital = clampPercent(journey.resources.politicalCapital + delta);
  }

  if (journey.journeyType === 'permitting' && journey.regulations) {
    journey.regulations.complianceScore = clampPercent((journey.regulations.complianceScore || 0) + delta);
    messages.push(`Regulatory standing ${delta > 0 ? 'improved' : 'worsened'} (${delta > 0 ? '+' : ''}${delta}).`);
  }
}

function applyRelationshipEffects(journey, delta, messages) {
  recordStanding(journey, 'relationships', delta);
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

  if (journey.journeyType === 'planning' && journey.protagonist) {
    // Relationships land on the stakeholders' moods (above) and the planner's
    // reputation. Buy-in is the engagement record, and only a Stakeholder
    // Session or an explicit buyIn effect writes it.
    journey.protagonist.reputation = clampPercent((journey.protagonist.reputation || 0) + relationshipShift);
  }

  if (journey.journeyType === 'manager' && journey.metrics) {
    journey.metrics.relationships = clampPercent((journey.metrics.relationships || 0) + delta);
  }

  messages.push(`Relationships ${delta > 0 ? 'improved' : 'frayed'} (${delta > 0 ? '+' : ''}${delta}).`);
}

/**
 * Handle crew-specific effects
 */
function handleCrewEffect(journey, crewEffect, messages, rng = Math.random) {
  let injured = null;
  if (crewEffect.injury) {
    const victim = pickRandomCrewMember(journey.crew, rng);
    if (victim) {
      const result = applyStatusEffect(victim, crewEffect.injury);
      if (result.message) messages.push(result.message);
      injured = victim;
      journey.lastEventVictimId = victim.id;
    }
  }

  if (crewEffect.illness) {
    // riskWorsen gates whether the condition actually sets in
    const setsIn = typeof crewEffect.riskWorsen === 'number'
      ? rng() < crewEffect.riskWorsen
      : true;
    if (setsIn) {
      const victims = pickMultipleCrewMembers(journey.crew, crewEffect.count || 1, rng);
      for (const victim of victims) {
        const result = applyStatusEffect(victim, crewEffect.illness);
        if (result.message) messages.push(result.message);
      }
    }
  }

  if (crewEffect.lose_member || crewEffect.leave) {
    const victim = pickRandomCrewMember(journey.crew, rng);
    if (victim) {
      victim.isActive = false;
      victim.hasQuit = true;
      messages.push(`${victim.name} has left the crew.`);
    }
  }

  if (crewEffect.evacuate_sick) {
    const victim = (journey.crew || []).find(m => m.isActive && m.statusEffects?.length > 0);
    if (victim) {
      const evac = evacuateCrewMember(victim, { day: journey.day, reason: 'illness' });
      if (evac.message) messages.push(evac.message);
    }
  }

  if (crewEffect.evacuate) {
    // Whoever this band hurt goes out: the member it just injured, else the
    // one carrying the named condition, else the day's victim, else whoever is
    // hurt, else a random active hand. "Send them out for medical care" has to
    // actually send someone.
    const crew = journey.crew || [];
    const victim = injured
      || (crewEffect.injury && crew.find(m => m.isActive && m.statusEffects?.some(e => e.effectId === crewEffect.injury)))
      || (journey.lastEventVictimId && crew.find(m => m.isActive && m.id === journey.lastEventVictimId))
      || crew.find(m => m.isActive && (m.statusEffects?.length || 0) > 0)
      || pickRandomCrewMember(crew, rng);
    if (victim) {
      if (crewEffect.injury && !victim.statusEffects?.some(e => e.effectId === crewEffect.injury)) {
        applyStatusEffect(victim, crewEffect.injury);
      }
      const evac = evacuateCrewMember(victim, { day: journey.day, reason: 'injury' });
      if (evac.message) messages.push(evac.message);
    }
  }

  if (crewEffect.rest) {
    // This would be tracked for recovery
  }
}

/** Points of generic desk progress per clock-day moved, and the most files one event moves. */
const DESK_PROGRESS_POINTS_PER_CLOCK_DAY = 5;
const DESK_PROGRESS_MAX_FILES = 4;
const PERMIT_CLOCK_LANES = ['screening', 'referral', 'decision'];

function describeMovedFiles(journey, files) {
  const seen = new Set();
  return files
    .filter((file) => !seen.has(file.id) && seen.add(file.id))
    .map((file) => `${file.label} (${describeLane(file, journey)})`)
    .join(', ');
}

/**
 * Generic progress on a permit queue moves clocks, never lanes. A good week
 * brings the soonest clocks forward a day, the way a follow-up call does; a
 * distracted week pushes them back. Nothing here issues a permit, skips a
 * referral, or walks past a WSA or HCA hold - the District Manager's roll
 * stays the only way a file gets signed, and a file that exists keeps
 * existing. This used to edit the lane counters directly, which conjured
 * issued files out of nothing and deleted named ones (with their HCA holds)
 * once the files were reconciled back to the counters.
 */
function applyDeskProgress(journey, progressPoints, messages) {
  if (!journey.permits) return;
  ensurePermitFiles(journey);

  const steps = Math.min(DESK_PROGRESS_MAX_FILES,
    Math.max(1, Math.round(Math.abs(progressPoints) / DESK_PROGRESS_POINTS_PER_CLOCK_DAY)));
  const moved = [];
  for (let step = 0; step < steps; step += 1) {
    const file = progressPoints > 0
      ? shortenPermitClock(journey, PERMIT_CLOCK_LANES)
      : slipPermitClock(journey, PERMIT_CLOCK_LANES);
    if (!file) break;
    moved.push(file);
  }

  if (!moved.length) {
    messages.push(progressPoints > 0
      ? 'Nothing in the queue is on a clock to bring forward.'
      : 'The queue was already stalled; nothing slips further.');
    return;
  }
  messages.push(progressPoints > 0
    ? `The queue moves faster: ${describeMovedFiles(journey, moved)}.`
    : `The queue slips: ${describeMovedFiles(journey, moved)}.`);
}

/**
 * An authored early approval signs files that are already on the District
 * Manager's desk and not held. When fewer are there than the event promised,
 * the rest of the momentum goes into the queue's clocks - it never invents an
 * issued file that was never drafted, screened or referred.
 */
function applyPermitsApproved(journey, count, messages) {
  ensurePermitFiles(journey);
  const signed = [];
  for (let index = 0; index < count; index += 1) {
    const [file] = getSignableFiles(journey);
    if (!file) break;
    issuePermitFile(journey, file.id);
    signed.push(file);
  }
  if (signed.length) {
    const target = journey.permits.target || 0;
    const tally = target > 0 ? ` ${journey.permits.approved}/${target} issued.` : '';
    messages.push(`${signed.map((file) => file.label).join(' and ')} ISSUED by the District Manager.${tally}`);
  }

  const short = count - signed.length;
  if (short <= 0) return;
  const moved = [];
  for (let step = 0; step < short; step += 1) {
    const file = shortenPermitClock(journey, PERMIT_CLOCK_LANES);
    if (!file) break;
    moved.push(file);
  }
  messages.push(moved.length
    ? `Nothing else is on the District Manager's desk to sign; the momentum goes into the queue instead: ${describeMovedFiles(journey, moved)}.`
    : 'Nothing is on the District Manager\'s desk to sign, and nothing in the queue is on a clock to bring forward.');
}
