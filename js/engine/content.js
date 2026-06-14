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
import {
  matchesAreaContext,
  matchesPreconditions,
  normalizeSeasonalCard,
} from "./seasonalContract.js";

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
        const card = adaptOperationalEvent(candidate, state);
        if (pending.causedBy) card.causedBy = pending.causedBy;
        return card;
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
        const sourced = pending.causedBy ? { ...candidate, causedBy: pending.causedBy } : candidate;
        return normalizeSeasonalCard(sourced, state, "issue");
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
    return normalizeSeasonalCard(selectablePool[index], state, "issue");
  }

  let roll = rng() * totalWeight;
  for (const entry of weightedPool) {
    roll -= entry.weight;
    if (roll <= 0) {
      return normalizeSeasonalCard(entry.issue, state, "issue");
    }
  }
  return normalizeSeasonalCard(weightedPool[weightedPool.length - 1].issue, state, "issue");
}

export function scoreIssueSelection(issue, state, context) {
  let weight = Math.max(1, Number(issue.baseWeight) || 1);
  if (issue.areaTags?.length) {
    const matches = issue.areaTags.filter((tag) => matchesAreaContext([tag], context.tags)).length;
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
  weight = applyIssueContextWeight(issue, state, weight);
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

function getOperationalEventOverride(event) {
  switch (event?.id) {
    case "angry_stakeholder":
      return {
        description:
          "A Nation whose territory overlaps Block 7 is calling about a specific concern on the file. You need to clarify the issue and set a credible next step, not guess what they mean.",
        context: {
          stakes:
            "If you handle this poorly, consultation trust and the defensibility of the block can both deteriorate quickly.",
        },
        riskClass: "calculated",
        options: [
          {
            label: "Listen, clarify the concern, and commit to a follow-up",
            outcome:
              "You slow the call down, hear the exact issue, and leave with a concrete next step instead of guessing.",
            effects: { timeUsed: 2, relationships: 8, compliance: 2 },
          },
          {
            label: "Explain the current file logic and ask what evidence is missing",
            outcome:
              "You keep the call anchored to the file, but the relationship only stabilizes if the follow-up is real.",
            effects: { timeUsed: 1, relationships: 1, compliance: 2 },
          },
          {
            label: "Keep the work moving until the concern is clearer from your side",
            outcome:
              "The file keeps moving for the moment, but you have not reduced the actual concern.",
            effects: { progress: 4, relationships: -8, compliance: -3 },
          },
        ],
      };
    case "community_complaint":
      return {
        description:
          "Residents along the haul route have submitted a written complaint about truck traffic timing, dust, or safety. They want a response from the licensee, not a public-relations exercise.",
        context: {
          stakes:
            "Traffic complaints can become a relationship and operating-hours problem quickly if the licensee appears dismissive.",
        },
        options: [
          {
            label: "Send a written response and offer direct follow-up with affected neighbours",
            outcome:
              "You answer the complaint directly and give people a specific way to test whether the mitigation is real.",
            effects: { timeUsed: 2, relationships: 6, compliance: 2 },
          },
          {
            label: "Adjust haul timing or controls where the complaint is credible",
            outcome:
              "You give up some efficiency, but the response is tied to a real operating change instead of just messaging.",
            effects: { progress: -2, relationships: 8, compliance: 2 },
          },
          {
            label: "Redirect the complaint to the ministry without site-specific follow-up",
            outcome:
              "You preserve your day, but the neighbours now know you did not engage with the actual complaint.",
            effects: { relationships: -6, compliance: -2 },
          },
        ],
      };
    case "system_crash":
      return {
        description:
          "The permit tracking system is down, but today's deadlines and active files still exist. You need a traceable fallback for the live work, not a dramatic office reset.",
        context: {
          stakes:
            "If the fallback record is weak, the team can lose both progress and file traceability in the same day.",
        },
        options: [
          {
            label: "Switch to offline tracking and keep a manual log",
            outcome: "The day gets slower, but the live files still have a defensible record.",
            effects: { progress: -4, compliance: 2 },
          },
          {
            label: "Prioritize only the live deadlines while IT restores the system",
            outcome: "You triage the queue and protect the most exposed files first.",
            effects: { timeUsed: 3, progress: -1, compliance: 1 },
          },
          {
            label: "Wait for the system and let today's queue slip",
            outcome: "You avoid improvising, but the backlog grows and the day is mostly lost.",
            effects: { progress: -6, relationships: -2 },
          },
        ],
      };
    case "gis_data_corrupted":
      return {
        description:
          "Spatial files for three live packages are corrupted. Backups are old enough that you cannot pretend nothing changed, and field notes alone are not a defensible rebuild plan.",
        context: {
          stakes:
            "A map mismatch here can create review delays, approval defects, or fieldwork based on the wrong footprint.",
        },
        riskClass: "calculated",
        options: [
          {
            label: "Restore what you can and send crews back for the missing GPS or map checks",
            outcome:
              "It is expensive and frustrating, but you rebuild from defensible information instead of imagination.",
            effects: { progress: -6, timeUsed: 4, compliance: 4, budget: -1500 },
          },
          {
            label: "Tell reviewers the affected files will slip while you rebuild them properly",
            outcome:
              "You lose schedule, but you stop the problem from turning into a false submission.",
            effects: { progress: -4, relationships: 1, compliance: 3 },
          },
          {
            label: "Patch from old data and hope review does not catch the mismatch",
            outcome:
              "You recover momentum immediately, but the file is now vulnerable if anyone checks the wrong polygon.",
            effects: { progress: 4, compliance: -6 },
          },
        ],
      };
    case "team_conflict":
      return {
        description:
          "Two staff members clashed hard enough that the work day is starting to drift. This is a supervision and documentation call, not a personality test.",
        context: {
          stakes:
            "If the conflict keeps bleeding into assignments, schedule reliability and crew trust both degrade.",
        },
        options: [
          {
            label: "Separate the work for now and document the next supervisory step",
            outcome:
              "You stabilize the day first and push the actual follow-up into the right supervisory channel.",
            effects: { progress: -1, relationships: 2, compliance: 1 },
          },
          {
            label: "Mediate briefly, then confirm expectations in writing",
            outcome:
              "You spend time on it now, but at least the expectations and next steps are no longer implied.",
            effects: { timeUsed: 2, relationships: 3, progress: -1 },
          },
          {
            label: "Ignore it and hope the tension burns off",
            outcome:
              "You save time immediately, but the unresolved problem keeps leaking into the day.",
            effects: { progress: -3, relationships: -5 },
          },
        ],
      };
    case "partnership_offer":
      return {
        description:
          "A Nation partner offers to co-lead referrals in their territory. The decision is how to structure the work credibly, not whether collaboration should sound good in a meeting.",
        context: {
          stakes:
            "Handled well, this can improve the quality and legitimacy of the file; handled poorly, it can look transactional fast.",
        },
        options: [
          {
            label: "Accept and set the process, scope, and timing together",
            outcome:
              "You take the offer seriously and define how the referral work will actually function.",
            effects: { relationships: 10, compliance: 3, progress: -2 },
          },
          {
            label: "Accept with clear deliverables and decision points",
            outcome:
              "The partnership starts with guardrails instead of vague goodwill, which keeps the work practical.",
            effects: { relationships: 7, compliance: 2, progress: -1 },
          },
          {
            label: "Defer until the current workload clears",
            outcome:
              "You protect today's queue, but the partner now has less reason to believe the offer mattered.",
            effects: { relationships: -4, progress: 1 },
          },
        ],
      };
    case "archaeology_screening_gap":
      return {
        description:
          "Just before submission, the archaeology review says the package is missing the right overview or permit context. You either bring in the right support, reduce the footprint, or accept a thinner file.",
        context: {
          stakes:
            "If the archaeology context is weak, the file can stall or come back looking careless in exactly the place reviewers will focus on.",
        },
        riskClass: "calculated",
        options: [
          {
            label: "Hold the file and bring in the right specialist",
            outcome: "You lose time, but the package stops looking careless.",
            effects: { progress: -6, budget: -2500, compliance: 7 },
          },
          {
            label: "Revise the package internally only where you have defensible evidence",
            outcome:
              "You keep the file moving, but only because you limited the rewrite to what you can actually support.",
            effects: { timeUsed: 4, compliance: 3, progress: 1 },
          },
          {
            label: "Submit and hope the issue stays minor",
            outcome:
              "The file leaves on time, but not in the condition you would normally defend.",
            effects: { progress: 5, compliance: -6 },
          },
        ],
      };
    case "truck_stuck":
      return {
        description:
          "A pickup or service truck is buried to the axles on soft ground. You need a realistic recovery plan, and forcing it deeper could damage the road prism or create a safety incident.",
        context: {
          stakes:
            "A bad recovery call here can turn a stuck vehicle into equipment damage, a road repair problem, or an avoidable injury.",
        },
        options: [
          {
            label: "Call recovery support and close the route until the truck is out",
            outcome:
              "You lose time and money, but the recovery happens with the right equipment and a cleaner safety record.",
            effects: { progress: -4, budget: -1500, compliance: 2 },
          },
          {
            label: "Build a controlled recovery with mats, winch support, and the right equipment",
            outcome:
              "The day slows down, but the recovery is planned instead of improvised.",
            effects: { timeUsed: 3, equipment: -4, fuel: -3, compliance: 1 },
          },
          {
            label: "Keep pulling on it with whatever is nearby",
            outcome:
              "You gamble on speed, but the truck, road, or crew can take the hit when the shortcut fails.",
            effects: { equipment: -14, compliance: -2, progress: -2 },
          },
        ],
      };
    default:
      return null;
  }
}

export function adaptOperationalEvent(event, state) {
  const override = getOperationalEventOverride(event);
  const source = override
    ? {
        ...event,
        ...override,
        options: override.options || event.options,
        context: { ...(event.context || {}), ...(override.context || {}) },
      }
    : event;
  const domain = ROLE_EVENT_DOMAINS[state?.role?.id] || "desk";
  const flavorBits = [`Adapted ${domain} event`];
  if (source.type) {
    flavorBits.push(humanizeLabel(source.type));
  }

  return normalizeSeasonalCard({
    id: source.id,
    title: source.title,
    description: buildOperationalEventDescription(source),
    flavor: flavorBits.join(" • "),
    options: (source.options || []).map((option) => ({
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
    context: source.context || null,
    preconditions: source.preconditions || null,
    riskClass: source.riskClass || null,
  }, state, "event");
}

export function adaptIllegalActTemptation(act, state, rng = Math.random) {
  const profile = getTemptationProfile(state);
  const rawSuccessEffects = buildIllegalActSuccessEffects(act, state, rng);
  const rawFailEffects = buildIllegalActFailEffects(act, state, rawSuccessEffects);
  const failFlags = buildIllegalActFailFlags(act);

  return normalizeSeasonalCard({
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
    context: act.context || null,
    riskClass: "unethical",
  }, state, "temptation");
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
  const library = ROLE_EVENT_DOMAINS[state?.role?.id] === "field" ? FIELD_EVENTS : DESK_EVENTS;
  // Events authored for the expedition game stay out of the seasonal draws;
  // remove the flag on an event to promote it into this pool deliberately.
  return library.filter((event) => !event.expeditionOnly);
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
  if (!matchesPreconditions(issue, state)) {
    return false;
  }
  if (issue.areaTags?.length) {
    return matchesAreaContext(issue.areaTags, tags);
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
    if (!matchesAreaContext(event.areaTags, tags)) {
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

  return matchesPreconditions(event, state);
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

const ASSIGNMENT_EVENT_TYPE_BIAS = {
  process: {
    compliance: 1.18,
    political: 1.12,
    stakeholder: 1.15,
    stakeholders: 1.15,
    technical: 1.05,
  },
  professional: {
    compliance: 1.18,
    political: 1.1,
    stakeholder: 1.12,
    stakeholders: 1.12,
    technical: 1.04,
  },
  planning: {
    technical: 1.2,
    compliance: 1.08,
  },
  road: {
    terrain: 1.2,
    technical: 1.16,
    weather: 1.05,
  },
  discovery: {
    terrain: 1.12,
    technical: 1.1,
    social: 1.1,
    wildlife: 1.15,
    forest_health: 1.12,
  },
};

const ASSIGNMENT_ISSUE_KEYWORDS = {
  process: ["audit", "permit", "file", "review", "heritage", "archaeology", "package", "consistency", "data"],
  professional: ["audit", "competence", "budget", "permit", "review", "file"],
  planning: ["water", "watershed", "mapping", "hydrolog", "caribou", "block", "salmon"],
  road: ["road", "crossing", "access", "riparian", "maintenance", "engineering", "permit"],
  discovery: ["wildlife", "heritage", "archaeology", "cultural", "riparian", "seedlot", "herbicide", "drone"],
};

function getSeasonContext(state) {
  return state?.currentSeasonContext || null;
}

function getSelectionScope(state) {
  return ROLE_EVENT_DOMAINS[state?.role?.id] === "field" ? "field" : "desk";
}

function getSelectedAssignmentFamily(state) {
  return getSeasonContext(state)?.selectedAssignment?.sourceFamily || null;
}

function eventTextMatchesKeywords(event, keywords) {
  if (!keywords?.length) {
    return false;
  }
  const haystack = `${event?.id || ""} ${event?.title || ""} ${event?.description || ""}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function issueTextMatchesKeywords(issue, keywords) {
  if (!keywords?.length) {
    return false;
  }
  const haystack = `${issue?.id || ""} ${issue?.title || ""} ${issue?.description || ""}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function applyEventContextWeight(event, state, weight) {
  const seasonContext = getSeasonContext(state);
  if (!seasonContext) {
    return weight;
  }

  const scope = getSelectionScope(state);
  const situationMultipliers = seasonContext.areaSituationMultipliers?.[scope];
  const discoveryMultipliers = seasonContext.discoveryMultipliers?.[scope] || {};
  const selectedFamily = getSelectedAssignmentFamily(state);
  const eventType = event?.type;

  if (situationMultipliers?.eventMultiplier) {
    weight *= situationMultipliers.eventMultiplier;
  }
  if (eventType && situationMultipliers?.typeMultipliers?.[eventType]) {
    weight *= Number(situationMultipliers.typeMultipliers[eventType]) || 1;
  }
  if (eventType && discoveryMultipliers?.[eventType]) {
    weight *= Number(discoveryMultipliers[eventType]) || 1;
  }

  if (selectedFamily === "situation" && eventType && situationMultipliers?.typeMultipliers?.[eventType]) {
    weight *= 1.08;
  }

  const typeBias = ASSIGNMENT_EVENT_TYPE_BIAS[selectedFamily]?.[eventType];
  if (typeBias) {
    weight *= typeBias;
  }

  if (selectedFamily === "planning" && eventTextMatchesKeywords(event, ASSIGNMENT_ISSUE_KEYWORDS.planning)) {
    weight *= 1.12;
  }
  if ((selectedFamily === "road" || selectedFamily === "discovery") && eventTextMatchesKeywords(event, ASSIGNMENT_ISSUE_KEYWORDS[selectedFamily])) {
    weight *= 1.12;
  }
  if ((selectedFamily === "process" || selectedFamily === "professional") && eventTextMatchesKeywords(event, ASSIGNMENT_ISSUE_KEYWORDS[selectedFamily])) {
    weight *= 1.1;
  }

  return weight;
}

function applyIssueContextWeight(issue, state, weight) {
  const seasonContext = getSeasonContext(state);
  if (!seasonContext) {
    return weight;
  }

  const selectedFamily = getSelectedAssignmentFamily(state);
  if (!selectedFamily) {
    return weight;
  }

  if (issueTextMatchesKeywords(issue, ASSIGNMENT_ISSUE_KEYWORDS[selectedFamily])) {
    weight *= 1.16;
  }

  if (selectedFamily === "situation" && Array.isArray(issue?.areaTags) && Array.isArray(seasonContext.areaSituation?.areaTags)) {
    const matches = issue.areaTags.filter((tag) => seasonContext.areaSituation.areaTags.includes(tag)).length;
    if (matches > 0) {
      weight *= 1 + Math.min(0.2, matches * 0.06);
    }
  }

  return weight;
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
    const matches = event.areaTags.filter((tag) => matchesAreaContext([tag], areaTags)).length;
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

  weight = applyEventContextWeight(event, state, weight);
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
      ? "Why this surfaced: this branch carried the strongest follow-up risk from the shortcut."
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
