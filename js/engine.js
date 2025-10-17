import {
  FORESTER_ROLES,
  OPERATING_AREAS,
  ISSUE_LIBRARY,
} from "./data/index.js";

export const SEASONS = ["Spring Planning", "Summer Field", "Fall Integration", "Winter Review"];

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
      metrics[key] = clamp(metrics[key] + delta[key], 0, 100);
    }
  }
  if (source) {
    state.history.push({ ...source, effects: delta });
  }
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
  if (!pool.length) {
    return null;
  }

  const weightedPool = pool.map((issue) => ({ issue, weight: issueWeight(issue, state, { tags, season }) }));
  const totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    const index = Math.floor(rng() * pool.length);
    return pool[index];
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
  if (averages >= 75) {
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
