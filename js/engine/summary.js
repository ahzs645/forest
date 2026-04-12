import { formatMetricName } from "./shared.js";
import { getRoleDisplayName } from "./seasonalContract.js";

export function buildSummary(state) {
  const { metrics, role, area } = state;
  const averages = weightedAverage(metrics);
  const roleName = getRoleDisplayName(role);

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
  const strongOutcomeFloors = metrics.compliance >= 62 && metrics.relationships >= 58 && metrics.forestHealth >= 58;
  const stableOutcomeFloors = metrics.compliance >= 48 && metrics.relationships >= 45 && metrics.forestHealth >= 45;
  const stewardshipStrong = metrics.compliance >= 75 && metrics.relationships >= 70 && metrics.forestHealth >= 55;
  if (averages >= 82 && balancedExcellence && strongOutcomeFloors) {
    overall = `Outstanding season – the ${roleName} kept the ${area.name} program balanced.`;
  } else if ((averages >= 64 && strongOutcomeFloors) || stewardshipStrong) {
    overall = "Solid performance with room to fine-tune priorities next cycle.";
  } else if (averages >= 45 && stableOutcomeFloors) {
    overall = "Mixed outcomes. Consider where trade-offs eroded trust or ecological outcomes.";
  } else {
    overall = "Operations stumbled. Leadership will expect a recovery plan before the next season.";
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

function formatMetricDelta(delta = {}) {
  const pieces = Object.entries(delta)
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([key, value]) => `${formatMetricName(key)} ${value > 0 ? "+" : ""}${value}`);
  return pieces.join(", ");
}
