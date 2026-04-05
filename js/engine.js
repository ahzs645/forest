import {
  FORESTER_ROLES,
  OPERATING_AREAS,
  ISSUE_LIBRARY,
} from "./data/index.js";

export const SEASONS = ["Spring Planning", "Summer Field", "Fall Integration", "Winter Review"];
const ISSUE_REPEAT_COOLDOWN_ROUNDS = 2;
const BUDGET_ATTRITION_THRESHOLD = 25;
const RELATIONSHIP_TRUST_THRESHOLD = 35;
const COMPLIANCE_AUDIT_THRESHOLD = 40;

export function findRole(roleId) {
  return FORESTER_ROLES.find((role) => role.id === roleId);
}

export function findArea(areaId) {
  return OPERATING_AREAS.find((area) => area.id === areaId);
}

export function createInitialState({ companyName, roleId, areaId }) {
  const role = findRole(roleId);
  const area = findArea(areaId);
  if (!role || !area) {
    throw new Error("Invalid role or area selection");
  }

  return {
    companyName: companyName || "Forest Co-op",
    role,
    area,
    round: 0,
    totalRounds: SEASONS.length,
    metrics: {
      progress: 50,
      forestHealth: 50,
      relationships: 50,
      compliance: 50,
      budget: 50,
    },
    history: [],
    flags: {},
    pendingIssues: [],
    issueHistory: [],
    timeline: [
      {
        round: 0,
        season: "Baseline",
        metrics: {
          progress: 50,
          forestHealth: 50,
          relationships: 50,
          compliance: 50,
          budget: 50,
        },
      },
    ],
  };
}

export function applyEffects(state, effects = {}, source) {
  const metrics = state.metrics;
  const delta = { ...effects };
  if (state.flags?.budgetLoanActive && typeof delta.budget === "number" && delta.budget > 0) {
    const reduced = Math.floor(delta.budget * 0.8);
    delta.budget = Math.max(reduced, 1);
  }
  for (const key of Object.keys(metrics)) {
    if (delta[key] !== undefined) {
      const value = Number(delta[key]);
      let adjustedDelta = Number.isFinite(value) ? applyDiminishingReturns(metrics[key], value) : 0;
      if (state.flags?.trustDeficitActive && key === "relationships" && adjustedDelta > 0) {
        adjustedDelta = Math.max(1, Math.floor(adjustedDelta * 0.5));
      }
      delta[key] = adjustedDelta;
      metrics[key] = clamp(metrics[key] + adjustedDelta, 0, 100);
    }
  }
  if (source) {
    state.history.push({ ...source, effects: delta });
  }
}

export function applyOptionOutcome(state, option = {}, source) {
  if (!state || !option) {
    return;
  }

  applyEffects(state, option.effects || {}, source);
  applyOptionFlags(state, option);
  applyScheduledIssues(state, option);
}

export function applyRoundConsequences(state) {
  if (!state?.metrics || !state?.flags) {
    return [];
  }

  const consequences = [];
  const { metrics, flags } = state;
  const round = Number(state.round || 0);

  if (metrics.budget < BUDGET_ATTRITION_THRESHOLD) {
    flags.lowBudgetStreak = Number(flags.lowBudgetStreak || 0) + 1;
  } else {
    flags.lowBudgetStreak = 0;
  }

  if (metrics.compliance < COMPLIANCE_AUDIT_THRESHOLD) {
    flags.lowComplianceStreak = Number(flags.lowComplianceStreak || 0) + 1;
  } else {
    flags.lowComplianceStreak = 0;
  }

  if (metrics.relationships < RELATIONSHIP_TRUST_THRESHOLD) {
    flags.trustDeficitActive = true;
  } else if (metrics.relationships >= RELATIONSHIP_TRUST_THRESHOLD + 10) {
    flags.trustDeficitActive = false;
  }

  if (flags.lowBudgetStreak >= 2) {
    applyEffects(
      state,
      { progress: -6, relationships: -4 },
      {
        type: "consequence",
        id: "contractor-attrition",
        title: "Contractor attrition from sustained budget stress",
        option: "Deferred scopes and partner pullback",
        round,
      },
    );
    flags.contractorAttritionActive = true;
    consequences.push("contractor-attrition");
  }

  if (flags.trustDeficitActive) {
    applyEffects(
      state,
      { compliance: -3 },
      {
        type: "consequence",
        id: "trust-deficit",
        title: "Low-trust environment limited high-confidence pathways",
        option: "Escalated approvals and slower collaboration",
        round,
      },
    );
    consequences.push("trust-deficit");
  }

  if (flags.lowComplianceStreak >= 2) {
    applyEffects(
      state,
      { budget: -6, progress: -4 },
      {
        type: "consequence",
        id: "audit-escalation",
        title: "Audit escalation after repeated compliance drops",
        option: "Emergency documentation and stoppage delays",
        round,
      },
    );
    flags.auditEscalationActive = true;
    consequences.push("audit-escalation");
  }

  return consequences;
}

export function getRoleTasks(state) {
  return state.role.tasks || [];
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
      const candidate = ISSUE_LIBRARY.find((issue) => issue.id === pending.id);
      if (candidate && issueMatchesContext(candidate, state, tags)) {
        state.pendingIssues.splice(i, 1);
        return candidate;
      }
      if (!candidate) {
        state.pendingIssues.splice(i, 1);
        i--;
      }
    }
  }

  const pool = ISSUE_LIBRARY.filter((issue) => issueMatchesContext(issue, state, tags));
  const freshPool = pool.filter((issue) => !isIssueInCooldown(state, issue.id));
  const selectablePool = freshPool.length ? freshPool : pool;

  if (!selectablePool.length) {
    return null;
  }

  const weightedPool = selectablePool.map((issue) => ({ issue, weight: issueWeight(issue, state, { tags, season }) }));
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

export function buildSummary(state) {
  const { metrics, role, area } = state;
  const averages = weightedAverage(metrics);

  const messages = [];
  if (metrics.compliance < 35) {
    messages.push("⚠️ Compliance concerns triggered a ministry audit.");
  }
  if (metrics.relationships < 30) {
    messages.push("⚠️ Community partners are distancing themselves from your program.");
  }
  if (metrics.forestHealth > 70) {
    messages.push("🌱 Forest health indicators improved markedly across your blocks.");
  }
  if (metrics.progress > 70) {
    messages.push("🚚 Deliverables stayed ahead of schedule despite field surprises.");
  }
  if (metrics.budget < 30) {
    messages.push("💸 Budget reserves are nearly depleted.");
  } else if (metrics.budget > 70) {
    messages.push("💰 You protected capital for future seasons.");
  }
  if (state.flags?.budgetLoanActive) {
    messages.push("💳 Emergency loan repayments trimmed future budget gains by 20%.");
  }

  let overall;
  const balancedExcellence = Object.values(metrics).every((value) => value >= 65);
  if (averages >= 82 && balancedExcellence) {
    overall = `Outstanding season – the ${role.name} kept the ${area.name} program balanced.`;
  } else if (averages >= 60) {
    overall = `Solid performance with room to fine-tune priorities next cycle.`;
  } else if (averages >= 45) {
    overall = `Mixed outcomes. Consider where trade-offs eroded trust or ecological outcomes.`;
  } else {
    overall = `Operations stumbled. Leadership will expect a recovery plan before the next season.`;
  }
  if (!messages.length) {
    messages.push("✅ Stakeholders acknowledge the cohesive strategy you delivered.");
  }

  const timeline = Array.isArray(state.timeline) ? state.timeline.slice(1) : [];
  const trends = metricsTrendlines(state);
  const legacy = buildLegacyReport(metrics, trends, timeline);
  const highlights = topDecisions(state.history);
  const achievements = buildAchievements(metrics, trends);
  const projection = futureOutlook(metrics, trends, area);

  return { overall, messages, legacy, highlights, achievements, projection };
}

export function formatMetricDelta(delta = {}) {
  const pieces = Object.entries(delta)
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([key, value]) => `${formatMetricName(key)} ${value > 0 ? "+" : ""}${value}`);
  return pieces.join(", ");
}

function formatMetricName(key) {
  switch (key) {
    case "progress":
      return "Progress";
    case "forestHealth":
      return "Forest Health";
    case "relationships":
      return "Relationships";
    case "compliance":
      return "Compliance";
    case "budget":
      return "Budget";
    default:
      return key;
  }
}

function weightedAverage(metrics) {
  const weights = {
    progress: 1,
    forestHealth: 1,
    relationships: 1,
    compliance: 1.2,
    budget: 0.8,
  };
  let total = 0;
  let weight = 0;
  for (const [key, value] of Object.entries(metrics)) {
    const w = weights[key] ?? 1;
    total += value * w;
    weight += w;
  }
  return total / weight;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyDiminishingReturns(currentMetric, delta) {
  if (delta <= 0) {
    return delta;
  }

  if (currentMetric >= 90) {
    return Math.max(1, Math.floor(delta * 0.35));
  }
  if (currentMetric >= 75) {
    return Math.max(1, Math.floor(delta * 0.6));
  }
  return delta;
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

function issueMatchesContext(issue, state, tags) {
  if (!issue || !state?.role) {
    return false;
  }
  if (!issue.roles?.includes(state.role.id)) {
    return false;
  }
  if (Array.isArray(issue.requiresFlags)) {
    const hasFlags = issue.requiresFlags.every((flag) => Boolean(state.flags?.[flag]));
    if (!hasFlags) {
      return false;
    }
  }
  if (Array.isArray(issue.requiresAnyFlags) && issue.requiresAnyFlags.length) {
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

function issueWeight(issue, state, context) {
  let weight = Math.max(1, Number(issue.baseWeight) || 1);
  if (issue.areaTags?.length) {
    const matches = issue.areaTags.filter((tag) => context.tags.includes(tag)).length;
    weight += matches;
  }
  const seasonBias = issue.seasonBias;
  if (Array.isArray(seasonBias) && seasonBias.includes(context.season)) {
    weight += 2;
  }
  if (issue.priorityFlag && state.flags?.[issue.priorityFlag]) {
    weight += 3;
  }
  return weight;
}

function metricsTrendlines(state) {
  const timeline = Array.isArray(state.timeline) ? state.timeline : [];
  const first = timeline.find((entry) => entry?.metrics);
  const last = timeline[timeline.length - 1];
  if (!first?.metrics || !last?.metrics) {
    return {};
  }
  const trend = {};
  for (const key of Object.keys(last.metrics)) {
    const start = Number(first.metrics[key] ?? 0);
    const end = Number(last.metrics[key] ?? 0);
    trend[key] = Math.round(end - start);
  }
  return trend;
}

function buildLegacyReport(metrics, trends, timeline) {
  const seasonSummaries = timeline.map((entry) => {
    const pieces = Object.entries(entry.metrics || {})
      .map(([key, value]) => `${formatMetricName(key)} ${Math.round(value)}`)
      .join(", ");
    return `• ${entry.season}: ${pieces}`;
  });
  const trendLines = Object.entries(trends)
    .filter(([, delta]) => delta !== undefined && delta !== 0)
    .map(([key, delta]) => `${formatMetricName(key)} ${delta > 0 ? "improved" : "declined"} ${Math.abs(delta)} over the year.`);
  return {
    seasonSummaries,
    trendLines,
  };
}

function topDecisions(history = []) {
  const scored = history
    .map((entry) => {
      const magnitude = Object.values(entry.effects || {}).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0);
      return { ...entry, magnitude };
    })
    .filter((entry) => entry.magnitude > 0)
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 3)
    .map((entry) => {
      const delta = formatMetricDelta(entry.effects);
      return `• ${entry.title} – ${entry.option}${delta ? ` (${delta})` : ""}`;
    });
  return scored;
}

function buildAchievements(metrics, trends) {
  const medals = [];
  if (metrics.relationships >= 75 && metrics.compliance >= 65) {
    medals.push("🏅 Balanced Steward – high trust and strong compliance sustained.");
  }
  if (metrics.progress >= 75 && trends.progress >= 5) {
    medals.push("🏅 Production Focus – crews consistently delivered ahead of plan.");
  }
  if (metrics.forestHealth >= 72 && trends.forestHealth >= 4) {
    medals.push("🏅 Ecosystem Guardian – habitat indicators trended upward all year.");
  }
  if (metrics.budget >= 70 && trends.budget >= 0) {
    medals.push("🏅 Fiscal Anchor – reserves positioned the crew for future shocks.");
  }
  if (!medals.length) {
    medals.push("🎖️ Lessons Logged – carry forward insights to tighten next season's plan.");
  }
  return medals;
}

function futureOutlook(metrics, trends, area) {
  const pieces = [];
  if (metrics.forestHealth < 45) {
    pieces.push("Forest health indicators need restorative investment to avoid long-term decline.");
  } else if (trends.forestHealth > 5) {
    pieces.push("Regeneration efforts suggest a resilient canopy in the coming decade.");
  }
  if (metrics.relationships < 40) {
    pieces.push("Community rapport is strained; invest early in dialogue with Nations and municipalities.");
  } else if (metrics.relationships >= 70) {
    pieces.push("Partnership momentum could unlock co-management pilots next cycle.");
  }
  if (metrics.compliance < 35) {
    pieces.push("Compliance risk remains high—expect ministerial oversight until audits stabilize.");
  } else if (metrics.compliance >= 70) {
    pieces.push(`Audit teams cite the ${area.name} program as a benchmark for peers.`);
  }
  if (metrics.budget < 35) {
    pieces.push("Budget buffers are thin; plan for emergency financing or scope reductions.");
  }
  if (!pieces.length) {
    pieces.push("Trajectory is stable. Consider experimenting with innovation pilots next year.");
  }
  return pieces;
}

function applyOptionFlags(state, option) {
  if (!state.flags) {
    state.flags = {};
  }

  if (option.setFlags && typeof option.setFlags === "object") {
    for (const [flag, value] of Object.entries(option.setFlags)) {
      state.flags[flag] = Boolean(value);
    }
  }

  if (Array.isArray(option.clearFlags)) {
    for (const flag of option.clearFlags) {
      delete state.flags[flag];
    }
  }
}

function applyScheduledIssues(state, option) {
  const schedule = option.scheduleIssues;
  if (!schedule || !schedule.id) {
    return;
  }

  if (!Array.isArray(state.pendingIssues)) {
    state.pendingIssues = [];
  }

  const existing = state.pendingIssues.find((pending) => pending?.id === schedule.id);
  const delay = Math.max(0, Number(schedule.delay || 0));
  if (existing) {
    existing.delay = Math.min(existing.delay ?? delay, delay);
    return;
  }
  state.pendingIssues.push({ id: schedule.id, delay });
}
