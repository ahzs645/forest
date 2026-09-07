import { formatMetricName } from "./shared.js";
import { getRoleDisplayName } from "./seasonalContract.js";
import { buildRoleLens, computeManagementStyle } from "./insights.js";
import { scoreRun } from "./scoring.js";
import { formatMetricDelta } from "./effects.js";

export function buildSummary(state) {
  const { metrics, role, area } = state;
  const roleName = getRoleDisplayName(role);

  const messages = [];
  if (metrics.compliance < 35) {
    messages.push("[!] Low compliance drew a C&E inspection and a Forest Practices Board complaint.");
  }
  if (metrics.relationships < 30) {
    messages.push("[!] Community partners are distancing themselves from your program.");
  }
  if (metrics.forestHealth > 70) {
    messages.push("[+] Forest health indicators improved markedly across your blocks.");
  }
  if (metrics.progress > 70) {
    messages.push("[+] Deliverables stayed ahead of schedule despite field surprises.");
  }
  if (metrics.budget < 30) {
    messages.push("[$] Budget reserves are nearly depleted.");
  } else if (metrics.budget > 70) {
    messages.push("[$] You protected capital for future seasons.");
  }
  if (state.flags?.budgetLoanActive) {
    messages.push("[$] Emergency loan repayments trimmed future budget gains by 20%.");
  }

  const score = scoreRun(state);
  const overall = {
    outstanding: `Outstanding season – the ${roleName} kept the ${area.name} program balanced.`,
    solid: "Solid performance with room to fine-tune priorities next cycle.",
    mixed: "Mixed outcomes. Consider where trade-offs eroded trust or ecological outcomes.",
    stumbled: "Operations stumbled. The woods manager will expect a recovery plan before the next season.",
  }[score.tier];
  if (!messages.length) {
    messages.push("[+] Stakeholders acknowledge the cohesive strategy you delivered.");
  }

  const timeline = Array.isArray(state.timeline) ? state.timeline.slice(1) : [];
  const trends = metricsTrendlines(state);
  const legacy = buildLegacyReport(metrics, trends, timeline);
  const highlights = topDecisions(state.history);
  const style = computeManagementStyle(state);
  const achievements = buildAchievements(metrics, trends, style);
  const projection = futureOutlook(metrics, trends, area);
  const roleLens = buildRoleLens(state);

  return {
    overall,
    tier: score.tier,
    score: score.score,
    scoreDetail: score,
    messages,
    legacy,
    highlights,
    achievements,
    projection,
    style,
    roleLens,
  };
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

function buildAchievements(metrics, trends, style) {
  const medals = [];
  if (style?.total >= 3 && style.dominant && style.label) {
    medals.push(`[*] ${style.label} – ${style.tendency}`);
  }
  if (metrics.relationships >= 75 && metrics.compliance >= 65) {
    medals.push("[*] Balanced Steward – high trust and strong compliance sustained.");
  }
  if (metrics.progress >= 75 && trends.progress >= 5) {
    medals.push("[*] Production Focus – crews consistently delivered ahead of plan.");
  }
  if (metrics.forestHealth >= 72 && trends.forestHealth >= 4) {
    medals.push("[*] Ecosystem Guardian – habitat indicators trended upward all year.");
  }
  if (metrics.budget >= 70 && trends.budget >= 0) {
    medals.push("[*] Fiscal Anchor – reserves positioned the crew for future shocks.");
  }
  if (!medals.length) {
    medals.push("[*] Lessons Logged – carry forward insights to tighten next season's plan.");
  }
  return medals;
}

function futureOutlook(metrics, trends, area) {
  const pieces = [];
  if (metrics.forestHealth < 45) {
    pieces.push("Forest health indicators need restorative investment to avoid long-term decline.");
  } else if (trends.forestHealth > 5) {
    pieces.push("Stocking is on track; free-growing looks reachable on schedule.");
  }
  if (metrics.relationships < 40) {
    pieces.push("Community rapport is strained; invest early in dialogue with Nations and municipalities.");
  } else if (metrics.relationships >= 70) {
    pieces.push("There is room to propose a joint field review with the Nation next year.");
  }
  if (metrics.compliance < 35) {
    pieces.push("Compliance risk remains high — expect C&E inspections and a possible FPB audit until the file stabilizes.");
  } else if (metrics.compliance >= 70) {
    pieces.push(`The district holds up the ${area.name} program as the example in its next licensee meeting.`);
  }
  if (metrics.budget < 35) {
    pieces.push("Budget buffers are thin; plan for emergency financing or scope reductions.");
  }
  if (!pieces.length) {
    pieces.push("Steady year. Bank it.");
  }
  return pieces;
}
