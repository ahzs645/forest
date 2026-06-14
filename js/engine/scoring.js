// Reusable run scoring, separate from the narrative summary.
//
// buildSummary() used to decide the ending tier inline with weighted averages
// and floor checks. That logic now lives here so sims, endings, and any future
// career mode can score a run the same way and explain it.

import { clamp, formatMetricName } from "./shared.js";
import { getRoleObjective } from "./roleObjectives.js";
import { computeManagementStyle } from "./insights.js";

const METRIC_WEIGHTS = { progress: 1, forestHealth: 1, relationships: 1, compliance: 1.2, budget: 0.8 };

export function weightedMetricAverage(metrics = {}) {
  let total = 0;
  let weight = 0;
  for (const [key, value] of Object.entries(metrics)) {
    const w = METRIC_WEIGHTS[key] ?? 1;
    total += Number(value || 0) * w;
    weight += w;
  }
  return weight ? total / weight : 0;
}

/** Overall metric health, 0–100. */
export function scoreMetricHealth(metrics = {}) {
  return Math.round(weightedMetricAverage(metrics));
}

/** How well the run served the role's primary/secondary objectives, 0–100. */
export function scoreRolePerformance(state) {
  const metrics = state?.metrics || {};
  const objective = getRoleObjective(state?.role?.id);
  if (!objective) {
    return scoreMetricHealth(metrics);
  }
  const primary = Number(metrics[objective.primary] ?? 50);
  const secondaryValues = objective.secondary.map((metric) => Number(metrics[metric] ?? 50));
  const secondaryMean = secondaryValues.length
    ? secondaryValues.reduce((sum, value) => sum + value, 0) / secondaryValues.length
    : primary;
  const others = Object.entries(metrics)
    .filter(([key]) => key !== objective.primary && !objective.secondary.includes(key))
    .map(([, value]) => Number(value || 0));
  const othersMean = others.length ? others.reduce((sum, value) => sum + value, 0) / others.length : secondaryMean;

  return Math.round(clamp(primary * 0.5 + secondaryMean * 0.3 + othersMean * 0.2, 0, 100));
}

function countConsequences(state) {
  const seen = new Set();
  for (const entry of state?.history || []) {
    if (entry?.type === "consequence" && entry.id) seen.add(entry.id);
  }
  return seen.size;
}

/** Penalty (<= 0) for fired consequences and any collapsed meter. */
export function scoreRiskLoad(state) {
  const metrics = state?.metrics || {};
  let penalty = 0;
  const fired = countConsequences(state);
  if (fired) penalty -= 4 * fired;
  for (const value of Object.values(metrics)) {
    if (Number(value) < 25) penalty -= 6;
  }
  return clamp(penalty, -40, 0);
}

/** Small bonus for committing to a coherent management style. */
export function scoreStyleFit(state) {
  const style = computeManagementStyle(state);
  if (style.total >= 3 && style.dominant && style.label !== "Adaptive Operator") {
    return 3;
  }
  return 0;
}

// Tier is preserved from the original summary thresholds so scoring extraction
// does not silently re-balance the game; the numeric score is supplementary.
export function deriveTier(metrics = {}) {
  const averages = weightedMetricAverage(metrics);
  const strongOutcomeFloors = metrics.compliance >= 62 && metrics.relationships >= 58 && metrics.forestHealth >= 58;
  const stableOutcomeFloors = metrics.compliance >= 48 && metrics.relationships >= 45 && metrics.forestHealth >= 45;
  const stewardshipStrong = metrics.compliance >= 75 && metrics.relationships >= 70 && metrics.forestHealth >= 55;
  // Outstanding is judged on floors a disciplined run can actually clear. Budget
  // and forest health sit structurally low (budget never tops ~60 across 6,300
  // simulated years; forest health rarely clears ~60 outside silviculture), so
  // requiring every meter ≥ 65 made the tier dead content. Instead, Outstanding
  // has two role-flavored paths over a shared "nothing collapsed" floor:
  //   • stewardship — an exceptional compliance + relationships year, and
  //   • ecology     — an exceptional forest-health year that stayed defensible.
  const nothingCollapsed = Object.values(metrics).every((value) => Number(value) >= 44);
  const stewardshipExcellence = metrics.compliance >= 80 && metrics.relationships >= 76;
  const ecologicalExcellence =
    metrics.forestHealth >= 60 && metrics.compliance >= 70 && metrics.relationships >= 66;

  if (
    averages >= 67
    && metrics.progress >= 45
    && nothingCollapsed
    && (stewardshipExcellence || ecologicalExcellence)
  ) {
    return "outstanding";
  }
  if ((averages >= 64 && strongOutcomeFloors) || stewardshipStrong) return "solid";
  if (averages >= 45 && stableOutcomeFloors) return "mixed";
  return "stumbled";
}

function buildReasons(state, { metricScore, roleScore, riskPenalty }) {
  const metrics = state?.metrics || {};
  const objective = getRoleObjective(state?.role?.id);
  const reasons = [];

  if (objective) {
    const primaryValue = Number(metrics[objective.primary] ?? 50);
    const label = formatMetricName(objective.primary);
    reasons.push(
      primaryValue >= 60
        ? `${label} stayed above role target.`
        : primaryValue >= 45
          ? `${label} held a defensible middle.`
          : `${label} finished below role target.`,
    );
  }

  const weakest = Object.entries(metrics).sort((a, b) => a[1] - b[1])[0];
  if (weakest && Number(weakest[1]) < 40) {
    reasons.push(`${formatMetricName(weakest[0])} finished thin.`);
  }

  const fired = countConsequences(state);
  if (fired > 0) {
    reasons.push(`${fired} delayed consequence${fired === 1 ? "" : "s"} fired.`);
  }
  if (roleScore >= 70 && metricScore >= 60) {
    reasons.push("Balanced delivery against the role's mandate.");
  }
  return reasons;
}

/**
 * Score a finished (or in-progress) run.
 * @returns {{ tier, score, metricScore, roleScore, riskPenalty, styleBonus, reasons }}
 */
export function scoreRun(state) {
  const metrics = state?.metrics || {};
  const metricScore = scoreMetricHealth(metrics);
  const roleScore = scoreRolePerformance(state);
  const riskPenalty = scoreRiskLoad(state);
  const styleBonus = scoreStyleFit(state);
  const score = Math.round(clamp(metricScore * 0.6 + roleScore * 0.4 + riskPenalty + styleBonus, 0, 100));

  return {
    tier: deriveTier(metrics),
    score,
    metricScore,
    roleScore,
    riskPenalty,
    styleBonus,
    reasons: buildReasons(state, { metricScore, roleScore, riskPenalty }),
  };
}
