import {
  CHAINED_ISSUES,
  DESK_EVENTS,
  FIELD_EVENTS,
  ILLEGAL_ACTS,
  ISSUE_LIBRARY,
  MISCHIEF_OPTIONS,
} from "../data/index.js";
import {
  AUDIT_TEMPTATION_TAGS,
  COMMUNITY_TEMPTATION_TAGS,
  ECOLOGICAL_TEMPTATION_TAGS,
  ETHICS_TEMPTATION_TAGS,
  EVENT_REPEAT_COOLDOWN_ROUNDS,
  ISSUE_PREVIEW_SEVERITY_LABELS,
  ISSUE_REPEAT_COOLDOWN_ROUNDS,
  PENDING_PRESSURE_EXPLANATIONS,
  ROLE_EVENT_DOMAINS,
  ROLE_JOURNEY_TYPES,
  ROLE_TEMPTATION_PROFILES,
  SEASONS,
  TEMPTATION_REPEAT_COOLDOWN_ROUNDS,
} from "./constants.js";
import {
  clamp,
  eventTouchesMetric,
  hasAnyTag,
  hasMatchingTag,
  humanizeLabel,
  issuePreviewSeverity,
  normalizeBudgetDelta,
  normalizeScheduleEntries,
  normaliseScheduledEventDelay,
  pickWeightedEntry,
  pickWeightedItem,
  pressurePriority,
  previewSeverityRank,
  rollRange,
  scaleDerivedEffect,
} from "./shared.js";

export function getRoleTasks(state) {
  const baseTasks = state.role.tasks || [];
  return baseTasks.map((task) => {
    const mischief = MISCHIEF_OPTIONS[task.id];
    if (!mischief) return task;
    return {
      ...task,
      options: [...task.options, mischief],
    };
  });
}

export function drawSeasonalEvent(state, rng = Math.random) {
  if (!state?.role) {
    return null;
  }

  if (Array.isArray(state.pendingEvents)) {
    for (const pending of state.pendingEvents) {
      if (!pending || typeof pending.delay !== "number") {
        continue;
      }
      pending.delay = Math.max(0, pending.delay - 1);
    }

    for (let i = 0; i < state.pendingEvents.length; i++) {
      const pending = state.pendingEvents[i];
      if (!pending) continue;
      if (typeof pending.delay === "number" && pending.delay > 0) {
        continue;
      }
      const candidate = findOperationalEventById(pending.id, state);
      if (candidate && eventMatchesSeasonalContext(candidate, state)) {
        state.pendingEvents.splice(i, 1);
        return adaptOperationalEvent(candidate, state);
      }
      if (!candidate) {
        state.pendingEvents.splice(i, 1);
        i--;
      }
    }
  }

  const pool = getOperationalEventLibrary(state).filter((event) => eventMatchesSeasonalContext(event, state));
  const freshPool = pool.filter((event) => !isEventInCooldown(state, event.id));
  const selectablePool = freshPool.length ? freshPool : pool;

  if (!selectablePool.length) {
    return null;
  }

  const weightedPool = selectablePool.map((event) => ({
    event,
    weight: scoreOperationalEventSelection(event, state),
  }));
  const selected = pickWeightedEntry(weightedPool, rng);
  return selected ? adaptOperationalEvent(selected, state) : null;
}

export function drawSeasonalTemptation(state, rng = Math.random) {
  if (!state?.role || !Array.isArray(ILLEGAL_ACTS) || ILLEGAL_ACTS.length === 0) {
    return null;
  }

  if (hasRecentTemptation(state)) {
    return null;
  }

  const chance = calculateTemptationChance(state);
  if (chance <= 0 || rng() >= chance) {
    return null;
  }

  const roleId = state.role.id;
  const matchingActs = ILLEGAL_ACTS.filter((act) => {
    if (!act) {
      return false;
    }
    if (!Array.isArray(act.roles) || act.roles.length === 0) {
      return true;
    }
    return act.roles.includes(roleId);
  });
  const pool = matchingActs.length ? matchingActs : ILLEGAL_ACTS;
  const weightedPool = pool.map((act) => ({
    act,
    weight: scoreIllegalActSelection(act, state),
  }));

  const selected = pickWeightedItem(weightedPool, rng, "act");
  return selected ? adaptIllegalActTemptation(selected, state, rng) : null;
}

export function drawIssue(state, rng = Math.random) {
  if (!state) {
    return null;
  }

  const tags = state.area?.tags || [];
  const seasonIndex = Math.max(0, Math.min(SEASONS.length - 1, (state.round || 1) - 1));
  const season = SEASONS[seasonIndex];

  if (Array.isArray(state.pendingIssues)) {
    for (const pending of state.pendingIssues) {
      if (!pending || typeof pending.delay !== "number") {
        continue;
      }
      pending.delay = Math.max(0, pending.delay - 1);
    }

    for (let i = 0; i < state.pendingIssues.length; i++) {
      const pending = state.pendingIssues[i];
      if (!pending) continue;
      if (typeof pending.delay === "number" && pending.delay > 0) {
        continue;
      }
      const candidate = resolvePendingIssue(state, pending, { tags, season }, rng);
      if (candidate) {
        state.pendingIssues.splice(i, 1);
        return candidate;
      }
      state.pendingIssues.splice(i, 1);
      i--;
    }
  }

  const allIssues = [...ISSUE_LIBRARY, ...CHAINED_ISSUES];
  const pool = allIssues.filter((issue) => issueMatchesContext(issue, state, tags));
  const freshPool = pool.filter((issue) => !isIssueInCooldown(state, issue.id));
  const selectablePool = freshPool.length ? freshPool : pool;

  if (!selectablePool.length) {
    return null;
  }

  const weightedPool = selectablePool.map((issue) => ({
    issue,
    weight: scoreIssueSelection(issue, state, { tags, season }),
  }));
  const totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    const index = Math.floor(rng() * selectablePool.length);
    return selectablePool[index];
  }

  let roll = rng() * totalWeight;
  for (const entry of weightedPool) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.issue;
    }
  }
  return weightedPool[weightedPool.length - 1].issue;
}

export function scoreIssueSelection(issue, state, context) {
  let weight = Math.max(1, Number(issue.baseWeight) || 1);
  if (issue.areaTags?.length) {
    const matches = issue.areaTags.filter((tag) => context.tags.includes(tag)).length;
    weight += matches;
  }
  const seasonBias = issue.seasonBias;
  if (Array.isArray(seasonBias) && seasonBias.length) {
    if (seasonBias.includes(context.season)) {
      weight += 4;
    } else {
      weight *= 0.5;
    }
  }
  if (issue.priorityFlag && state.flags?.[issue.priorityFlag]) {
    weight += 3;
  }
  const roleCount = Array.isArray(issue.roles) && issue.roles.length ? issue.roles.length : 4;
  if (roleCount === 1) {
    weight *= 1.6;
  } else if (roleCount === 2) {
    weight *= 1.3;
  } else if (roleCount === 3) {
    weight *= 1.1;
  } else {
    weight *= 0.75;
  }
  return Math.max(0.1, weight);
}

export function adaptOperationalEventEffects(effects = {}, option = {}) {
  const mapped = {};

  const add = (metric, delta) => {
    const value = Number(delta);
    if (!Number.isFinite(value) || value === 0) {
      return;
    }
    mapped[metric] = (mapped[metric] || 0) + value;
  };

  if (typeof effects.progress === "number") {
    add("progress", effects.progress);
  }
  if (typeof effects.forestHealth === "number") {
    add("forestHealth", effects.forestHealth);
  }
  if (typeof effects.relationships === "number") {
    add("relationships", effects.relationships);
  }
  if (typeof effects.compliance === "number") {
    add("compliance", effects.compliance);
  }
  if (typeof effects.budget === "number") {
    add("budget", normalizeBudgetDelta(effects.budget));
  }

  if (typeof effects.politicalCapital === "number") {
    add("relationships", scaleDerivedEffect(effects.politicalCapital, 0.6));
    add("compliance", scaleDerivedEffect(effects.politicalCapital, 0.25));
  }

  const timeUsed = Number.isFinite(option?.timeUsed) ? option.timeUsed : effects.timeUsed;
  if (typeof timeUsed === "number") {
    add("progress", -Math.max(1, Math.round(Math.abs(timeUsed) * 1.4)));
  }

  if (typeof effects.crew_morale === "number") {
    add("relationships", scaleDerivedEffect(effects.crew_morale, 0.45));
    add("progress", scaleDerivedEffect(effects.crew_morale, 0.2));
  }

  if (typeof effects.crew_health === "number") {
    add("progress", scaleDerivedEffect(effects.crew_health, 0.35));
    add("compliance", scaleDerivedEffect(effects.crew_health, 0.2));
  }

  if (typeof effects.equipment === "number") {
    add("progress", scaleDerivedEffect(effects.equipment, 0.3));
    add("budget", scaleDerivedEffect(effects.equipment, 0.15));
  }

  if (typeof effects.fuel === "number") {
    add("progress", scaleDerivedEffect(effects.fuel, 0.2));
    add("budget", scaleDerivedEffect(effects.fuel, 0.25));
  }

  if (typeof effects.food === "number") {
    add("progress", scaleDerivedEffect(effects.food, 0.25));
    add("relationships", scaleDerivedEffect(effects.food, 0.2));
  }

  if (typeof effects.firstAid === "number") {
    add("compliance", scaleDerivedEffect(effects.firstAid, 0.25));
    add("progress", scaleDerivedEffect(effects.firstAid, 0.15));
  }

  if (typeof effects.permits_approved === "number") {
    add("progress", Math.round(effects.permits_approved * 4));
    add("compliance", Math.round(effects.permits_approved * 2));
  }

  if (typeof effects.scrutiny === "number") {
    add("compliance", -scaleDerivedEffect(effects.scrutiny, 0.6));
    add("relationships", -scaleDerivedEffect(effects.scrutiny, 0.3));
  }

  return Object.fromEntries(
    Object.entries(mapped).filter(([, value]) => Number.isFinite(value) && value !== 0)
  );
}

export function adaptOperationalEvent(event, state) {
  const domain = ROLE_EVENT_DOMAINS[state?.role?.id] || "desk";
  const flavorBits = [`Adapted ${domain} event`];
  if (event.type) {
    flavorBits.push(humanizeLabel(event.type));
  }

  return {
    id: event.id,
    title: event.title,
    description: buildOperationalEventDescription(event),
    flavor: flavorBits.join(" • "),
    options: (event.options || []).map((option) => ({
      label: option.label,
      outcome: option.outcome,
      effects: adaptOperationalEventEffects(option.effects || {}, option),
      scheduleEvents: option.schedulesEvent
        ? {
            id: option.schedulesEvent,
            delay: normaliseScheduledEventDelay(option.scheduledDelay),
          }
        : undefined,
    })),
  };
}

export function adaptIllegalActTemptation(act, state, rng = Math.random) {
  const profile = getTemptationProfile(state);
  const rawSuccessEffects = buildIllegalActSuccessEffects(act, state, rng);
  const rawFailEffects = buildIllegalActFailEffects(act, state, rawSuccessEffects);
  const failFlags = buildIllegalActFailFlags(act);

  return {
    id: `temptation:${act.id}`,
    title: act.title,
    description: buildIllegalActDescription(act, state),
    flavor: `Adapted temptation • ${profile.flavor}`,
    options: [
      {
        label: "Refuse and keep it clean",
        outcome: "You walk away. It keeps the season slower, but the file stays defensible.",
        effects: adaptOperationalEventEffects(buildIllegalActRefuseEffects(state)),
      },
      {
        label: "Take the shortcut (high risk)",
        outcome: "You attempt something risky...",
        risk: {
          baseSuccess: getIllegalActBaseSuccess(act, state),
          successEffects: adaptOperationalEventEffects(rawSuccessEffects),
          failEffects: adaptOperationalEventEffects(rawFailEffects),
          successOutcome: "The shortcut lands for now. The gains show up immediately, and the exposure stays buried this season.",
          failOutcome: "The shortcut unravels fast. Questions start landing before you can shape the story.",
          failFlags,
          failScheduleIssues: buildIllegalActFailScheduleIssues(act, state),
        },
      },
      {
        label: "Document and report",
        outcome: "You put the concern on record. It slows the work, but strengthens your position if scrutiny follows.",
        effects: adaptOperationalEventEffects(buildIllegalActReportEffects(state)),
      },
    ],
  };
}

export function buildScheduledIssueTeaser(state, scheduleSpec) {
  const schedules = normalizeScheduleEntries(scheduleSpec)
    .slice()
    .sort((a, b) => {
      const delayA = Math.max(0, Number(a?.delay || 0));
      const delayB = Math.max(0, Number(b?.delay || 0));
      return delayA - delayB;
    });

  if (!schedules.length) {
    return null;
  }

  const tags = state?.area?.tags || [];
  const seasonIndex = Math.max(0, Math.min(SEASONS.length - 1, (state?.round || 1) - 1));
  const season = SEASONS[seasonIndex];

  for (const schedule of schedules) {
    const preview = resolvePendingIssue(state, schedule, { tags, season }, () => 0);
    if (preview) {
      return formatScheduledIssueTeaser(preview);
    }
  }

  return null;
}

export function combineScheduledIssueTeasers(...teasers) {
  const unique = [];
  let severity = "info";
  for (const teaser of teasers) {
    if (!teaser || typeof teaser.text !== "string" || !teaser.text.trim() || unique.includes(teaser.text)) {
      continue;
    }
    unique.push(teaser.text);
    if (previewSeverityRank(teaser.severity) > previewSeverityRank(severity)) {
      severity = teaser.severity;
    }
  }
  return unique.length ? { text: unique.join("\n\n"), severity } : null;
}

function getOperationalEventLibrary(state) {
  return ROLE_EVENT_DOMAINS[state?.role?.id] === "field" ? FIELD_EVENTS : DESK_EVENTS;
}

function findOperationalEventById(eventId, state) {
  if (!eventId) {
    return null;
  }

  const primary = getOperationalEventLibrary(state);
  return primary.find((event) => event.id === eventId)
    || DESK_EVENTS.find((event) => event.id === eventId)
    || FIELD_EVENTS.find((event) => event.id === eventId)
    || null;
}

function isIssueInCooldown(state, issueId) {
  if (!issueId || !Array.isArray(state?.history) || !state.history.length) {
    return false;
  }

  const currentRound = Number(state.round || 1);
  return state.history.some((entry) => {
    if (entry?.type !== "issue" || entry.id !== issueId) {
      return false;
    }
    const roundsAgo = currentRound - Number(entry.round || 0);
    return roundsAgo > 0 && roundsAgo <= ISSUE_REPEAT_COOLDOWN_ROUNDS;
  });
}

function isEventInCooldown(state, eventId) {
  if (!eventId || !Array.isArray(state?.history) || !state.history.length) {
    return false;
  }

  const currentRound = Number(state.round || 1);
  return state.history.some((entry) => {
    if (entry?.type !== "event" || entry.id !== eventId) {
      return false;
    }
    const roundsAgo = currentRound - Number(entry.round || 0);
    return roundsAgo > 0 && roundsAgo <= EVENT_REPEAT_COOLDOWN_ROUNDS;
  });
}

function hasRecentTemptation(state) {
  if (!Array.isArray(state?.history) || !state.history.length) {
    return false;
  }

  const currentRound = Number(state.round || 1);
  return state.history.some((entry) => {
    if (entry?.type !== "temptation") {
      return false;
    }
    const roundsAgo = currentRound - Number(entry.round || 0);
    return roundsAgo > 0 && roundsAgo <= TEMPTATION_REPEAT_COOLDOWN_ROUNDS;
  });
}

function getTemptationProfile(stateOrRoleId) {
  const roleId = typeof stateOrRoleId === "string"
    ? stateOrRoleId
    : stateOrRoleId?.role?.id || stateOrRoleId?.roleId;
  return ROLE_TEMPTATION_PROFILES[roleId] || ROLE_TEMPTATION_PROFILES.planner;
}

function issueMatchesContext(issue, state, tags, options = {}) {
  if (!issue || !state?.role) {
    return false;
  }
  if (!issue.roles?.includes(state.role.id)) {
    return false;
  }
  const ignoreRequirements = Boolean(options.ignoreRequirements);
  if (!ignoreRequirements && Array.isArray(issue.requiresFlags)) {
    const hasFlags = issue.requiresFlags.every((flag) => Boolean(state.flags?.[flag]));
    if (!hasFlags) {
      return false;
    }
  }
  if (!ignoreRequirements && Array.isArray(issue.requiresAnyFlags) && issue.requiresAnyFlags.length) {
    const hasAny = issue.requiresAnyFlags.some((flag) => Boolean(state.flags?.[flag]));
    if (!hasAny) {
      return false;
    }
  }
  if (Array.isArray(issue.excludeFlags)) {
    const excluded = issue.excludeFlags.some((flag) => Boolean(state.flags?.[flag]));
    if (excluded) {
      return false;
    }
  }
  if (issue.areaTags?.length) {
    return issue.areaTags.some((tag) => tags.includes(tag));
  }
  return true;
}

function eventMatchesSeasonalContext(event, state) {
  if (!event || !state?.role || !state?.area) {
    return false;
  }

  const roleId = state.role.id;
  const roleJourneyTypes = ROLE_JOURNEY_TYPES[roleId] || [];
  if (Array.isArray(event.roles) && event.roles.length > 0 && !event.roles.includes(roleId)) {
    return false;
  }
  if (Array.isArray(event.journeyTypes) && event.journeyTypes.length > 0) {
    const matchesJourney = roleJourneyTypes.some((journeyType) => event.journeyTypes.includes(journeyType));
    if (!matchesJourney) {
      return false;
    }
  }

  const tags = Array.isArray(state.area.tags) ? state.area.tags : [];
  if (Array.isArray(event.areaTags) && event.areaTags.length > 0) {
    if (!event.areaTags.some((tag) => tags.includes(tag))) {
      return false;
    }
  }

  const becCode = state.area.becCode;
  if (Array.isArray(event.becCodes) && event.becCodes.length > 0) {
    if (!becCode || !event.becCodes.includes(becCode)) {
      return false;
    }
  }

  if (event.options?.some((option) => typeof option?.effects?.permits_approved === "number") && roleId !== "permitter") {
    return false;
  }

  return true;
}

function calculateTemptationChance(state) {
  const round = Number(state.round || 1);
  if (round <= 1) {
    return 0;
  }

  const profile = getTemptationProfile(state);
  let chance = profile.chance.base;

  if (round >= 3) {
    chance += profile.chance.lateSeasonBonus;
  }

  for (const [metric, rule] of Object.entries(profile.chance.pressure || {})) {
    if (Number(state.metrics?.[metric]) < rule.threshold) {
      chance += rule.bonus;
    }
  }

  return clamp(chance, 0, profile.chance.cap);
}

function scoreOperationalEventSelection(event, state) {
  let weight = Math.max(1, Number(event.baseWeight) || 1);
  const roleId = state.role.id;
  const areaTags = Array.isArray(state.area?.tags) ? state.area.tags : [];

  if (Array.isArray(event.roles) && event.roles.length > 0) {
    if (event.roles.length === 1 && event.roles[0] === roleId) {
      weight += 3;
    } else if (event.roles.includes(roleId)) {
      weight += 1.5;
    }
  }

  if (Array.isArray(event.areaTags) && event.areaTags.length > 0) {
    const matches = event.areaTags.filter((tag) => areaTags.includes(tag)).length;
    weight += matches * 2;
  }

  if (Array.isArray(event.becCodes) && event.becCodes.includes(state.area?.becCode)) {
    weight += 2;
  }

  if (event.options?.some((option) => typeof option?.effects?.permits_approved === "number")) {
    weight += roleId === "permitter" ? 3 : 0;
  }

  if (eventTouchesMetric(event, "compliance") && state.metrics.compliance < 55) {
    weight += 1.5;
  }
  if (eventTouchesMetric(event, "relationships") && state.metrics.relationships < 55) {
    weight += 1.5;
  }
  if (eventTouchesMetric(event, "budget") && state.metrics.budget < 55) {
    weight += 1;
  }
  if (eventTouchesMetric(event, "progress") && state.metrics.progress < 55) {
    weight += 1;
  }

  return Math.max(0.25, weight);
}

function scoreIllegalActSelection(act, state) {
  let weight = 1;
  const actTags = Array.isArray(act?.tags) ? act.tags : [];
  const areaTags = Array.isArray(state.area?.tags) ? state.area.tags : [];
  const profile = getTemptationProfile(state);
  const matchingTags = actTags.filter((tag) => areaTags.includes(tag)).length;
  weight += matchingTags * 2;

  if (Array.isArray(act?.roles) && act.roles.length === 1 && act.roles[0] === state.role.id) {
    weight += 1.5;
  }

  for (const [tag, bonus] of Object.entries(profile.preferredTags || {})) {
    if (actTags.includes(tag)) {
      weight += bonus;
    }
  }

  if (hasMatchingTag(actTags, ETHICS_TEMPTATION_TAGS) && state.metrics?.budget < 50) {
    weight += 2;
  }
  if (hasMatchingTag(actTags, ECOLOGICAL_TEMPTATION_TAGS) && state.metrics?.compliance < 55) {
    weight += 1.5;
  }
  if (hasMatchingTag(actTags, AUDIT_TEMPTATION_TAGS) && state.metrics?.progress < 55) {
    weight += 1;
  }
  if (hasMatchingTag(actTags, COMMUNITY_TEMPTATION_TAGS) && state.metrics?.relationships < 55) {
    weight += 1;
  }

  return Math.max(0.25, weight);
}

function scorePendingIssueCandidateSelection(candidate, issue, state, context) {
  let weight = scoreIssueSelection(issue, state, context) * Math.max(0.1, Number(candidate?.weight) || 1);

  for (const [metric, bonus] of Object.entries(candidate?.metricBoosts || {})) {
    if (Number(state.metrics?.[metric]) < 55) {
      weight += Number(bonus) || 0;
    }
  }

  return Math.max(0.1, weight);
}

function findIssueById(issueId) {
  return ISSUE_LIBRARY.find((issue) => issue.id === issueId)
    || CHAINED_ISSUES.find((issue) => issue.id === issueId)
    || null;
}

function resolvePendingIssue(state, pending, context, rng) {
  const candidates = Array.isArray(pending?.candidates) ? pending.candidates : null;
  if (!candidates?.length) {
    const issue = findIssueById(pending?.id);
    if (!issue) {
      return null;
    }
    return issueMatchesContext(issue, state, context.tags, { ignoreRequirements: Boolean(pending?.force) }) ? issue : null;
  }

  const weightedPool = candidates
    .map((candidate) => {
      const issue = findIssueById(candidate?.id);
      if (!issue) {
        return null;
      }
      const ignoreRequirements = Boolean(pending?.force || candidate?.force);
      if (!issueMatchesContext(issue, state, context.tags, { ignoreRequirements })) {
        return null;
      }
      return {
        issue,
        candidate,
        weight: scorePendingIssueCandidateSelection(candidate, issue, state, context),
        resolvedIssue: annotatePendingIssue(issue, candidate, state),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight || a.issue.id.localeCompare(b.issue.id));

  return pickWeightedItem(weightedPool, rng, "resolvedIssue");
}

function annotatePendingIssue(issue, candidate, state) {
  const surfaceReason = buildPendingIssueSurfaceReason(candidate, state);
  const surfaceSeverity = issuePreviewSeverity(issue);
  if (!surfaceReason) {
    return surfaceSeverity === "info"
      ? issue
      : {
          ...issue,
          surfaceSeverity,
        };
  }
  return {
    ...issue,
    surfaceReason,
    surfaceSeverity,
  };
}

function buildPendingIssueSurfaceReason(candidate, state) {
  const boosts = Object.entries(candidate?.metricBoosts || {})
    .map(([metric, bonus]) => ({ metric, bonus: Number(bonus) || 0 }))
    .filter((entry) => entry.bonus > 0);

  if (!boosts.length) {
    return candidate?.force
      ? "Why this surfaced: this was the strongest remaining follow-up path from the shortcut."
      : undefined;
  }

  const activeBoosts = boosts.filter((entry) => Number(state.metrics?.[entry.metric]) < 55);
  const pool = activeBoosts.length ? activeBoosts : boosts;
  pool.sort((a, b) => {
    if (b.bonus !== a.bonus) {
      return b.bonus - a.bonus;
    }
    return pressurePriority(a.metric) - pressurePriority(b.metric);
  });

  const dominant = pool[0];
  const explanation = PENDING_PRESSURE_EXPLANATIONS[dominant.metric];
  if (!explanation) {
    return candidate?.force
      ? "Why this surfaced: this branch carried the strongest follow-up pressure from the shortcut."
      : undefined;
  }
  return `Why this surfaced: ${explanation}`;
}

function buildOperationalEventDescription(event) {
  const details = [];
  if (event.description) {
    details.push(event.description);
  }

  if (Array.isArray(event.areaTags) && event.areaTags.length > 0) {
    details.push(`Context: ${event.areaTags.slice(0, 2).map(humanizeLabel).join(", ")}.`);
  } else if (Array.isArray(event.becCodes) && event.becCodes.length > 0) {
    details.push(`BEC focus: ${event.becCodes.join(", ")}.`);
  }

  return details.join("\n\n");
}

function buildIllegalActDescription(act, state) {
  const details = [String(act.description || "A tempting shortcut appears.")];
  const relevantTags = (Array.isArray(act.tags) ? act.tags : [])
    .filter((tag) => tag !== state?.role?.id)
    .slice(0, 3);
  if (relevantTags.length) {
    details.push(`Pressure points: ${relevantTags.map(humanizeLabel).join(", ")}.`);
  }
  return details.join("\n\n");
}

function buildIllegalActSuccessEffects(act, state, rng) {
  const profile = getTemptationProfile(state);
  const gain = rollRange(profile.gainRange[0], profile.gainRange[1], rng);
  const effects = {
    ...profile.successBaseEffects,
    budget: gain,
  };

  applyIllegalActTagEffects(effects, act);
  return effects;
}

function buildIllegalActFailEffects(act, state, successEffects) {
  const profile = getTemptationProfile(state);
  const successBudget = Number(successEffects?.budget || 0);
  const effects = {
    ...profile.failConfig.effects,
    budget: -Math.max(profile.failConfig.budgetMin, Math.round(successBudget * profile.failConfig.budgetMultiplier)),
  };

  if (hasMatchingTag(act?.tags, ECOLOGICAL_TEMPTATION_TAGS)) {
    effects.forestHealth = (effects.forestHealth || 0) - 8;
  }
  if (hasMatchingTag(act?.tags, COMMUNITY_TEMPTATION_TAGS)) {
    effects.relationships = (effects.relationships || 0) - 6;
  }
  if (hasMatchingTag(act?.tags, AUDIT_TEMPTATION_TAGS)) {
    effects.compliance = (effects.compliance || 0) - 5;
  }

  return effects;
}

function buildIllegalActRefuseEffects(state) {
  return { ...getTemptationProfile(state).refuseEffects };
}

function buildIllegalActReportEffects(state) {
  return { ...getTemptationProfile(state).reportEffects };
}

function applyIllegalActTagEffects(effects, act) {
  if (hasMatchingTag(act?.tags, ECOLOGICAL_TEMPTATION_TAGS)) {
    effects.forestHealth = (effects.forestHealth || 0) - 6;
  }
  if (hasMatchingTag(act?.tags, COMMUNITY_TEMPTATION_TAGS)) {
    effects.relationships = (effects.relationships || 0) - 4;
  }
  if (hasMatchingTag(act?.tags, ETHICS_TEMPTATION_TAGS)) {
    effects.compliance = (effects.compliance || 0) - 4;
  }
  if (hasMatchingTag(act?.tags, AUDIT_TEMPTATION_TAGS)) {
    effects.compliance = (effects.compliance || 0) - 3;
  }
}

function buildIllegalActFailFlags(act) {
  const flags = {};
  const tags = Array.isArray(act?.tags) ? act.tags : [];

  if (hasMatchingTag(tags, AUDIT_TEMPTATION_TAGS)) {
    flags.auditTriggered = true;
  }
  if (hasMatchingTag(tags, ECOLOGICAL_TEMPTATION_TAGS)) {
    flags.environmentalAudit = true;
  }
  if (tags.some((tag) => ["bribery", "collusion", "corruption", "laundering", "payroll", "double-dip"].includes(tag))) {
    flags.ethicsInquiry = true;
  }
  if (tags.some((tag) => ["cultural"].includes(tag))) {
    flags.culturalViolation = true;
  }
  if (tags.some((tag) => ["blatant", "sabotage", "espionage"].includes(tag))) {
    flags.underInvestigation = true;
  }

  return flags;
}

function buildIllegalActFailScheduleIssues(act, state) {
  const roleId = state?.role?.id;
  const tags = new Set(Array.isArray(act?.tags) ? act.tags : []);
  const candidates = new Map();
  const addCandidate = (id, weight, metricBoosts = null) => {
    if (!id) {
      return;
    }
    const current = candidates.get(id) || { id, weight: 0, force: true, metricBoosts: {} };
    current.weight += weight;
    if (metricBoosts && typeof metricBoosts === "object") {
      for (const [metric, bonus] of Object.entries(metricBoosts)) {
        current.metricBoosts[metric] = (current.metricBoosts[metric] || 0) + (Number(bonus) || 0);
      }
    }
    candidates.set(id, current);
  };

  if (roleId === "planner" || roleId === "permitter") {
    if (hasAnyTag(tags, ["mapping", "data", "modeling", "reporting", "monitoring"])) {
      addCandidate(roleId === "planner" ? "ministry-data-audit" : "fom-consistency-gap", 4, { progress: 1.5, compliance: 1 });
      addCandidate("fpbc-competence-audit", 1.5, { compliance: 1.5 });
    }
    if (hasAnyTag(tags, ["procurement", "paperwork", "compliance", "forgery", "collusion", "bribery", "corruption", "grants"])) {
      addCandidate("budget-freeze", 3.5, { budget: 2.5, compliance: 2, progress: 1 });
      addCandidate("fpbc-competence-audit", 2, { compliance: 1.5 });
    }
    if (hasAnyTag(tags, ["cultural"])) {
      addCandidate("heritage-protocol-gap", 3.5, { relationships: 3, compliance: 1 });
      addCandidate("archaeology-escalation-pause", 2.5, { relationships: 2, progress: 1 });
    }
    if (hasAnyTag(tags, ["access", "riparian", "engineering"])) {
      addCandidate("road-use-permit-standoff", 3, { progress: 2, compliance: 1.5 });
    }
    if (hasAnyTag(tags, ["remote-camps", "gas-interface"])) {
      addCandidate("special-use-permit-stack", 2.5, { progress: 1.5, budget: 1 });
    }
  }

  if (roleId === "recce" || roleId === "silviculture") {
    if (hasAnyTag(tags, ["wildlife"])) {
      addCandidate("wildlife-collar-drop", 4, { forestHealth: 2.5, relationships: 2 });
    }
    if (hasAnyTag(tags, ["riparian", "salvage", "fire", "erosion", "old-growth"])) {
      addCandidate(
        roleId === "silviculture" ? "environmental-audit-fallout" : "riparian-reclassification-call",
        4,
        { forestHealth: 3, compliance: 2 }
      );
    }
    if (roleId === "silviculture" && hasAnyTag(tags, ["herbicide"])) {
      addCandidate("herbicide-drift-complaint", 4, { forestHealth: 2.5, relationships: 1.5, compliance: 1.5 });
      addCandidate("environmental-audit-fallout", 2, { forestHealth: 2, compliance: 1.5 });
    }
    if (roleId === "silviculture" && hasAnyTag(tags, ["nursery", "stocking", "automation", "seed"])) {
      addCandidate("seedlot-vigour-drop", 3.5, { forestHealth: 2.5, progress: 1 });
      addCandidate("free-growing-catchup-plan", 2.5, { forestHealth: 2, progress: 1, budget: 0.5 });
    }
    if (roleId === "recce" && hasAnyTag(tags, ["drones", "media", "access", "aviation"])) {
      addCandidate("compliance-drone-sweep", 3.5, { compliance: 2.5, relationships: 1 });
    }
    if (hasAnyTag(tags, ["remote-camps", "gas-interface"])) {
      addCandidate("special-use-permit-stack", 2.5, { progress: 1.5, budget: 1 });
    }
  }

  if (hasAnyTag(tags, ["fraud", "fabrication", "deception", "records", "paperwork", "monitoring"])) {
    addCandidate("fpbc-competence-audit", 2, { compliance: 2 });
  }
  if (hasAnyTag(tags, ["bribery", "collusion", "corruption", "laundering", "payroll", "double-dip", "blatant", "sabotage", "espionage"])) {
    addCandidate("formal-investigation", 3, { compliance: 2, relationships: 1.5 });
  }
  if (roleId === "planner" && hasAnyTag(tags, ["old-growth", "riparian", "wildlife"])) {
    addCandidate("environmental-audit-fallout", 2.5, { forestHealth: 2.5, compliance: 1.5 });
  }

  const weightedCandidates = Array.from(candidates.values())
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  if (!weightedCandidates.length) {
    return [];
  }

  return [{
    delay: 1,
    force: true,
    candidates: weightedCandidates,
  }];
}

function getIllegalActBaseSuccess(act, state) {
  const profile = getTemptationProfile(state);
  let success = profile.baseSuccess;

  if (hasMatchingTag(act?.tags, ETHICS_TEMPTATION_TAGS)) {
    success -= 0.08;
  }
  if (hasMatchingTag(act?.tags, ECOLOGICAL_TEMPTATION_TAGS)) {
    success -= 0.06;
  }
  if (hasMatchingTag(act?.tags, AUDIT_TEMPTATION_TAGS)) {
    success += 0.02;
  }
  if (hasMatchingTag(act?.tags, COMMUNITY_TEMPTATION_TAGS)) {
    success -= 0.02;
  }

  return clamp(success, 0.16, 0.65);
}

function formatScheduledIssueTeaser(issue) {
  if (!issue?.title) {
    return null;
  }

  const severity = issuePreviewSeverity(issue);
  const label = ISSUE_PREVIEW_SEVERITY_LABELS[severity] || "notable";
  const reason = String(issue.surfaceReason || "").replace(/^Why this surfaced:\s*/i, "").trim();
  const prefix = `Likely fallout (${label}): ${issue.title}.`;
  if (reason) {
    return { text: `${prefix} ${reason}`, severity, issueId: issue.id };
  }
  return { text: prefix, severity, issueId: issue.id };
}
