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
  };
}

export function applyEffects(state, effects = {}, source) {
  const metrics = state.metrics;
  const delta = { ...effects };
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
  const tags = state.area.tags || [];
  const pool = ISSUE_LIBRARY.filter((issue) => {
    const roleMatch = issue.roles.includes(state.role.id);
    const areaMatch = !issue.areaTags?.length || issue.areaTags.some((tag) => tags.includes(tag));
    return roleMatch && areaMatch;
  });
  if (!pool.length) {
    return null;
  }
  const index = Math.floor(rng() * pool.length);
  return pool[index];
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

  return { overall, messages };
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
