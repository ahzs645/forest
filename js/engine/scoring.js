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

const PRIMARY_METRIC_CREDIT_CAP = 85;

/** How well the run served the role's primary/secondary objectives, 0–100. */
export function scoreRolePerformance(state) {
  const metrics = state?.metrics || {};
  const objective = getRoleObjective(state?.role?.id);
  if (!objective) {
    return scoreMetricHealth(metrics);
  }
  // Past 85 the primary meter has done its job. Without the cap a role judged
  // on compliance, which the economy lets climb to the high 90s, out-scored one
  // judged on forest health, which stands only lift so fast.
  const primary = Math.min(PRIMARY_METRIC_CREDIT_CAP, Number(metrics[objective.primary] ?? 50));
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

// Outstanding needs every meter off the floor. Progress is held to that line
// only for roles judged on it (permitter, recce); a planner's year moves
// through referrals and reviews and a silviculture year is read in the
// stands, so for them a thinner delivery year can still be excellent.
const OUTSTANDING_METER_FLOOR = 40;
const OUTSTANDING_OFF_MANDATE_PROGRESS_FLOOR = 38;

function outstandingDeliveryFloor(roleId) {
  const objective = getRoleObjective(roleId);
  if (!objective) return OUTSTANDING_METER_FLOOR;
  const judgedOnProgress = objective.primary === "progress" || objective.secondary.includes("progress");
  return judgedOnProgress ? OUTSTANDING_METER_FLOOR : OUTSTANDING_OFF_MANDATE_PROGRESS_FLOOR;
}

// Tier gates are calibrated against the simulated economy (see
// reports/balance/): sensible "balanced" play lands a weighted average near
// 53, expert "role-optimal" play near 60, and reckless play near 38. Forest
// health rarely clears ~56 outside silviculture and budget rarely clears ~47
// for anyone, so gates demanding 58-65 there made Solid and Outstanding dead
// content. The intent of each tier:
//   • solid       — a clearly good year for a decent player (~top third of
//                    sensible play), which must include real delivery, not
//                    just a defensive metrics screen.
//   • outstanding — an expert year (~top sixth of optimal play) via one of
//                    two role-flavored excellence paths over a shared
//                    "nothing collapsed and work got delivered" floor.
export function deriveTier(metrics = {}, roleId = null) {
  const averages = weightedMetricAverage(metrics);
  const deliveryFloor = outstandingDeliveryFloor(roleId);
  const strongOutcomeFloors =
    metrics.compliance >= 60 && metrics.relationships >= 52 && metrics.forestHealth >= 48;
  const stableOutcomeFloors =
    metrics.compliance >= 45 && metrics.relationships >= 42 && metrics.forestHealth >= 42;
  const stewardshipStrong =
    metrics.compliance >= 80 && metrics.relationships >= 68 && metrics.forestHealth >= 50 && metrics.progress >= 30;
  // Progress has its own role-aware floor below; every other meter must hold 40.
  const nothingCollapsed = Object.entries(metrics)
    .every(([key, value]) => key === "progress" || Number(value) >= OUTSTANDING_METER_FLOOR);
  // Excellence gates were re-raised when the seasonal year deepened from ~12
  // to ~17 decision cards: optimizer play banks proportionally more compliance
  // and relationships across the longer year, and the old gates let ~1 in 3
  // greedy runs finish Outstanding. These keep it near the top sixth. The
  // weighted-average gate went 64 -> 67 in the 2026-09 realism pass: trimming
  // travel beats and district-office audits out of the seasonal draw made the
  // year a little kinder, and optimizer play crept back over a tenth of runs.
  const stewardshipExcellence = metrics.compliance >= 88 && metrics.relationships >= 72;
  const ecologicalExcellence =
    metrics.forestHealth >= 67 && metrics.compliance >= 75 && metrics.relationships >= 65;

  if (
    averages >= 67
    && metrics.progress >= deliveryFloor
    && nothingCollapsed
    && (stewardshipExcellence || ecologicalExcellence)
  ) {
    return "outstanding";
  }
  if ((averages >= 55 && metrics.progress >= 35 && strongOutcomeFloors) || stewardshipStrong) {
    return "solid";
  }
  if (averages >= 45 && stableOutcomeFloors) return "mixed";
  return "stumbled";
}

// The ending tier is read straight off the displayed score, so a lower tier
// can never show a higher number than a better one.
export const TIER_SCORE_FLOORS = Object.freeze({ outstanding: 72, solid: 60, mixed: 45 });
const TIER_ORDER = ["stumbled", "mixed", "solid", "outstanding"];

/** The ending tier a score earns. */
export function tierForScore(score) {
  const value = Number(score) || 0;
  if (value >= TIER_SCORE_FLOORS.outstanding) return "outstanding";
  if (value >= TIER_SCORE_FLOORS.solid) return "solid";
  if (value >= TIER_SCORE_FLOORS.mixed) return "mixed";
  return "stumbled";
}

// The meter gates in deriveTier still decide how high a year can go (no
// Outstanding with a collapsed meter, no Solid without delivery). They cap the
// score just under the next band instead of overriding it, so the number and
// the tier always agree and the reasons can say what held the year back.
function scoreCapForTier(tier) {
  const next = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1];
  return next ? TIER_SCORE_FLOORS[next] - 1 : 100;
}

// The first gate that kept the year out of the next tier, in player terms.
function describeTierGate(metrics, gateTier, roleId) {
  const value = (key) => Number(metrics[key] ?? 0);
  const below = (key, floor) => (value(key) < floor ? `${formatMetricName(key)} finished under ${floor}` : null);
  const average = weightedMetricAverage(metrics);

  if (gateTier === "solid") {
    const collapsed = Object.keys(metrics)
      .filter((key) => key !== "progress" && value(key) < OUTSTANDING_METER_FLOOR)
      .map(formatMetricName);
    return (collapsed.length ? `${collapsed.join(" and ")} finished under ${OUTSTANDING_METER_FLOOR}` : null)
      || below("progress", outstandingDeliveryFloor(roleId))
      || (average < 67 ? "the meters averaged under 67" : null)
      || (value("forestHealth") >= 67
        ? below("compliance", 75) || below("relationships", 65)
        : below("compliance", 88) || below("relationships", 72));
  }
  if (gateTier === "mixed") {
    return below("progress", 35)
      || below("compliance", 60)
      || below("relationships", 52)
      || below("forestHealth", 48)
      || (average < 55 ? "the meters averaged under 55" : null);
  }
  if (gateTier === "stumbled") {
    return below("compliance", 45)
      || below("relationships", 42)
      || below("forestHealth", 42)
      || (average < 45 ? "the meters averaged under 45" : null);
  }
  return null;
}

function buildReasons(state, { metricScore, roleScore, heldBack }) {
  const metrics = state?.metrics || {};
  const objective = getRoleObjective(state?.role?.id);
  const reasons = [];

  if (heldBack) {
    reasons.push(heldBack);
  }

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

  // The primary metric already has its own line above.
  const weakest = Object.entries(metrics).sort((a, b) => a[1] - b[1])[0];
  if (weakest && Number(weakest[1]) < 40 && weakest[0] !== objective?.primary) {
    reasons.push(`${formatMetricName(weakest[0])} finished thin.`);
  }

  const fired = countConsequences(state);
  if (fired > 0) {
    reasons.push(`${fired} earlier call${fired === 1 ? "" : "s"} came back on you this year.`);
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
  const earned = Math.round(clamp(metricScore * 0.6 + roleScore * 0.4 + riskPenalty + styleBonus, 0, 100));
  const score = Math.min(earned, scoreCapForTier(deriveTier(metrics, state?.role?.id)));
  const tier = tierForScore(score);
  const gate = score < earned ? describeTierGate(metrics, tier, state?.role?.id) : null;

  return {
    tier,
    score,
    metricScore,
    roleScore,
    riskPenalty,
    styleBonus,
    reasons: buildReasons(state, {
      metricScore,
      roleScore,
      heldBack: gate ? `Held to ${tier.charAt(0).toUpperCase()}${tier.slice(1)}: ${gate}.` : null,
    }),
  };
}
