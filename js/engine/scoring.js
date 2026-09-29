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

// ── Tier gates ─────────────────────────────────────────────────────────────
// One table per mode. gradeTier() is the only place a tier is decided: the
// seasonal ending, the score cap, the "held back" line, the campaign's Year in
// Review and the service record all read it, so a retune here moves every one
// of them together.
//
// Seasonal gates are calibrated against the simulated economy (see
// reports/balance/): sensible "balanced" play lands a weighted average near
// 53, expert "role-optimal" play near 60, and reckless play near 38. The
// intent of each tier:
//   • solid       — a clearly good year for a decent player (~top third of
//                    sensible play), which must include real delivery, not
//                    just a defensive metrics screen.
//   • outstanding — an expert year (~top sixth of optimal play) via one of
//                    two role-flavored excellence paths over a shared
//                    "nothing collapsed and work got delivered" floor.
// Excellence gates were re-raised when the seasonal year deepened from ~12 to
// ~17 decision cards, and the weighted-average gate went 64 -> 67 in the
// 2026-09 realism pass, to keep optimizer play near the top sixth.
export const SEASONAL_TIER_GATES = Object.freeze({
  outstanding: {
    average: 67,
    // Every meter but Progress must hold this line.
    meterFloor: 40,
    // Progress is held to the meter floor only for roles judged on it
    // (permitter, recce); a planner's year moves through referrals and reviews
    // and a silviculture year is read in the stands, so for them a thinner
    // delivery year can still be excellent.
    progressFloor: 40,
    offMandateProgressFloor: 38,
    paths: [
      { compliance: 88, relationships: 72 },
      { forestHealth: 67, compliance: 75, relationships: 65 },
    ],
  },
  solid: {
    average: 55,
    floors: { progress: 35, compliance: 60, relationships: 52, forestHealth: 48 },
    // A stewardship-first year that still delivered something reads Solid.
    alternate: { compliance: 80, relationships: 68, forestHealth: 50, progress: 30 },
  },
  // Stumbled is a year whose standing fell into the consequence zone (trust
  // lost under 35, audits under 40). Set just above those lines; at 45
  // a year that never collapsed still stumbled about half the time it was
  // played without reading the cards.
  mixed: {
    average: 43,
    floors: { compliance: 43, relationships: 40, forestHealth: 42 },
  },
});

// "A Year in the District" grades the same five meters on the campaign's own
// economy: four deployments move them in bigger, rarer steps than seventeen
// seasonal cards, and every tier also needs deployments actually delivered.
// Outstanding takes all four: a season that fell short draws a crisis card
// whose careful answer pays standing, and at three of four that made a failed
// fall the easier road to the top tier. Calibrated with
// scripts/simulate-campaign.mjs: about one careful year in ten reaches
// Outstanding on every difficulty, an average year never does.
export const CAMPAIGN_TIER_GATES = Object.freeze({
  ...SEASONAL_TIER_GATES,
  outstanding: {
    average: 68,
    meterFloor: 40,
    progressFloor: 60,
    paths: [
      { compliance: 85, relationships: 70 },
      { forestHealth: 66, compliance: 78, relationships: 65 },
    ],
  },
  minDeliveries: { solid: 2, outstanding: 4 },
});

export const TIER_ORDER = Object.freeze(["stumbled", "mixed", "solid", "outstanding"]);

const nextTierUp = (tier) => TIER_ORDER[TIER_ORDER.indexOf(tier) + 1] || null;

function floorShortfalls(metrics, floors = {}) {
  return Object.entries(floors)
    .filter(([key, floor]) => Number(metrics[key] ?? 0) < floor)
    .map(([key, floor]) => ({ key, floor, value: Number(metrics[key] ?? 0) }));
}

function averageShortfall(metrics, floor) {
  const value = weightedMetricAverage(metrics);
  return value < floor ? [{ key: "average", floor, value }] : [];
}

function outstandingProgressFloor(gate, roleId) {
  if (!gate.offMandateProgressFloor) return gate.progressFloor;
  const objective = getRoleObjective(roleId);
  if (!objective) return gate.progressFloor;
  const judgedOnProgress = objective.primary === "progress" || objective.secondary.includes("progress");
  return judgedOnProgress ? gate.progressFloor : gate.offMandateProgressFloor;
}

/**
 * What stands between these meters and one tier, most basic gate first. An
 * empty list means the meters earn the tier.
 */
function tierShortfalls(metrics, tier, gates, roleId) {
  const gate = gates[tier];
  if (!gate) return [];
  if (tier === "outstanding") {
    const collapsed = Object.keys(metrics)
      .filter((key) => key !== "progress")
      .flatMap((key) => floorShortfalls(metrics, { [key]: gate.meterFloor }));
    const base = [
      ...collapsed,
      ...floorShortfalls(metrics, { progress: outstandingProgressFloor(gate, roleId) }),
      ...averageShortfall(metrics, gate.average),
    ];
    // Either excellence path will do; name the one the year came closest to.
    const paths = gate.paths.map((floors) => floorShortfalls(metrics, floors));
    if (paths.some((missing) => !missing.length)) return base;
    const gap = (missing) => missing.reduce((sum, item) => sum + item.floor - item.value, 0);
    const closest = paths.reduce((best, missing) => (gap(missing) < gap(best) ? missing : best));
    return [...base, ...closest];
  }
  const missing = [...floorShortfalls(metrics, gate.floors), ...averageShortfall(metrics, gate.average)];
  if (missing.length && gate.alternate && !floorShortfalls(metrics, gate.alternate).length) return [];
  return missing;
}

/**
 * The one tier decision. The meters earn a tier through a gate table; a table
 * with `minDeliveries` (the campaign) then caps it by the deployments actually
 * delivered.
 * @param {Object} metrics - the five year meters
 * @param {{gates?: Object, roleId?: string|null, delivered?: number|null}} [options]
 * @returns {{tier: string, earned: string, cappedFrom: string|null, next: string|null,
 *   shortfalls: Array<{key: string, floor: number, value: number}>}} `shortfalls`
 *   is what kept the year out of `next`, the tier above the one it got
 */
export function gradeTier(metrics = {}, { gates = SEASONAL_TIER_GATES, roleId = null, delivered = null } = {}) {
  const earned = ["outstanding", "solid", "mixed"]
    .find((tier) => !tierShortfalls(metrics, tier, gates, roleId).length) || "stumbled";
  const minDeliveries = gates.minDeliveries || {};
  const deliveredCount = Number(delivered) || 0;
  const countsDeliveries = delivered !== null && delivered !== undefined;
  let tier = earned;
  while (countsDeliveries && minDeliveries[tier] && deliveredCount < minDeliveries[tier]) {
    tier = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
  }
  const next = nextTierUp(tier);
  const shortfalls = next ? tierShortfalls(metrics, next, gates, roleId) : [];
  if (next && countsDeliveries && minDeliveries[next] && deliveredCount < minDeliveries[next]) {
    shortfalls.unshift({ key: "delivered", floor: minDeliveries[next], value: deliveredCount });
  }
  return { tier, earned, cappedFrom: tier === earned ? null : earned, next, shortfalls };
}

export function deriveTier(metrics = {}, roleId = null) {
  return gradeTier(metrics, { roleId }).tier;
}

/** A shortfall as the Year in Review names it: "Compliance 88+ (you have 83)". */
export function formatTierShortfall({ key, floor, value }, { total = 4 } = {}) {
  if (key === "delivered") return `${floor} of ${total} deployments delivered (you have ${value})`;
  if (key === "average") return `a weighted meter average of ${floor}+ (you have ${Math.round(value)})`;
  return `${formatMetricName(key)} ${floor}+ (you have ${Math.round(value)})`;
}

// The ending tier is read straight off the displayed score, so a lower tier
// can never show a higher number than a better one.
export const TIER_SCORE_FLOORS = Object.freeze({ outstanding: 72, solid: 60, mixed: 45 });

/** The ending tier a score earns. */
export function tierForScore(score) {
  const value = Number(score) || 0;
  if (value >= TIER_SCORE_FLOORS.outstanding) return "outstanding";
  if (value >= TIER_SCORE_FLOORS.solid) return "solid";
  if (value >= TIER_SCORE_FLOORS.mixed) return "mixed";
  return "stumbled";
}

// The meter gates still decide how high a year can go (no Outstanding with a
// collapsed meter, no Solid without delivery). They cap the score just under
// the next band instead of overriding it, so the number and the tier always
// agree and the reasons can say what held the year back.
function scoreCapForTier(tier) {
  const next = nextTierUp(tier);
  return next ? TIER_SCORE_FLOORS[next] - 1 : 100;
}

/** A score held inside its tier's band, so a record's best score and best grade agree. */
export function scoreWithinTier(score, tier) {
  return Math.round(clamp(Number(score) || 0, TIER_SCORE_FLOORS[tier] || 0, scoreCapForTier(tier)));
}

// The first gate that kept the year out of the next tier, in player terms.
function describeTierGate(metrics, roleId) {
  const { next, shortfalls } = gradeTier(metrics, { roleId });
  const [first] = shortfalls;
  if (!first) return null;
  if (first.key === "average") return `the meters averaged under ${first.floor}`;
  // Collapsed meters read as one line: "Budget and Relationships finished under 40".
  if (next === "outstanding" && first.key !== "progress") {
    const collapsed = shortfalls.filter((item) => item.key !== "progress" && item.key !== "average" && item.floor === first.floor);
    return `${collapsed.map((item) => formatMetricName(item.key)).join(" and ")} finished under ${first.floor}`;
  }
  return `${formatMetricName(first.key)} finished under ${first.floor}`;
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
  const gate = score < earned ? describeTierGate(metrics, state?.role?.id) : null;

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
