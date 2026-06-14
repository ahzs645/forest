// Headless seasonal simulator.
//
// Rather than re-implement the season loop (which would drift from the game
// players actually see), this drives the real TuiGameController with a seeded
// RNG and a pluggable decision policy. Same draws, same effects, same
// consequences, same summary — just no React and no keyboard.

import { TuiGameController } from "../../tui/controller.js";
import { FORESTER_ROLES, OPERATING_AREAS } from "../data/index.js";
import { getSeasonalPlayableRoles } from "./seasonalContract.js";
import { makeRng } from "./rng.js";

export const STRATEGIES = [
  "cautious",
  "balanced",
  "aggressive",
  "random",
  "greedy",
  "weakest-metric",
  "role-optimal",
];

// Mirrors the weighting buildSummary() uses to judge a year, so "greedy" chases
// the same thing the game rewards.
const METRIC_WEIGHTS = { progress: 1, forestHealth: 1, relationships: 1, compliance: 1.2, budget: 0.8 };

const ROLE_PRIMARY_METRIC = {
  planner: "compliance",
  permitter: "compliance",
  recce: "relationships",
  silviculture: "forestHealth",
};

// Fallback scoring when a card has no authored stance (events/issues/temptations
// don't), so a stance policy still behaves in character on every decision.
const STANCE_WEIGHTS = {
  cautious: { compliance: 1, relationships: 1, forestHealth: 1, budget: 0.3, progress: -0.6 },
  aggressive: { progress: 1, budget: 0.3, compliance: -0.3, relationships: -0.2, forestHealth: -0.2 },
};

function weightedScore(effects = {}, weights) {
  let total = 0;
  for (const [metric, value] of Object.entries(effects || {})) {
    total += (weights[metric] ?? 0) * Number(value || 0);
  }
  return total;
}

function weightedGain(effects = {}) {
  return weightedScore(effects, METRIC_WEIGHTS);
}

// Pick the index with the highest primary score; break ties with an optional
// secondary score, then by lowest index for full determinism.
function argbest(count, primary, secondary = () => 0) {
  let bestIndex = 0;
  let bestPrimary = -Infinity;
  let bestSecondary = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const p = primary(i);
    const s = secondary(i);
    if (p > bestPrimary || (p === bestPrimary && s > bestSecondary)) {
      bestIndex = i;
      bestPrimary = p;
      bestSecondary = s;
    }
  }
  return bestIndex;
}

/**
 * Decide which option index a strategy takes for the current card.
 * `opts` is an array of { stance, effects } (missing fields tolerated).
 */
export function chooseOption(strategy, opts, metrics, roleId, rng) {
  const n = opts.length;
  if (n <= 1) return 0;
  const effects = (i) => opts[i]?.effects || {};

  if (strategy === "cautious" || strategy === "balanced" || strategy === "aggressive") {
    const stanceMatch = opts.findIndex((opt) => opt?.stance === strategy);
    if (stanceMatch >= 0) return stanceMatch;
    if (strategy === "balanced") {
      // No authored stance: take the most moderate option (smallest swing).
      return argbest(n, (i) => -Math.abs(weightedGain(effects(i))));
    }
    return argbest(n, (i) => weightedScore(effects(i), STANCE_WEIGHTS[strategy]));
  }

  if (strategy === "random") {
    return Math.min(n - 1, Math.floor(rng() * n));
  }

  if (strategy === "greedy") {
    return argbest(n, (i) => weightedGain(effects(i)));
  }

  if (strategy === "weakest-metric") {
    const weakest = Object.keys(metrics).sort((a, b) => metrics[a] - metrics[b])[0];
    return argbest(n, (i) => Number(effects(i)[weakest] || 0), (i) => weightedGain(effects(i)));
  }

  if (strategy === "role-optimal") {
    const target = ROLE_PRIMARY_METRIC[roleId] || "compliance";
    return argbest(n, (i) => Number(effects(i)[target] || 0), (i) => weightedGain(effects(i)));
  }

  return 0;
}

function seasonalRoleIndex(roleId) {
  const playable = getSeasonalPlayableRoles(FORESTER_ROLES);
  const index = playable.findIndex((role) => role.id === roleId);
  if (index < 0) {
    throw new Error(`Unknown seasonal role: ${roleId}`);
  }
  return index;
}

function areaIndex(areaId) {
  const index = OPERATING_AREAS.findIndex((area) => area.id === areaId);
  if (index < 0) {
    throw new Error(`Unknown operating area: ${areaId}`);
  }
  return index;
}

function tierFromOverall(text = "") {
  const lower = String(text).toLowerCase();
  if (lower.includes("outstanding")) return "outstanding";
  if (lower.includes("solid")) return "solid";
  if (lower.includes("mixed")) return "mixed";
  if (lower.includes("stumbled")) return "stumbled";
  return "unknown";
}

function uniqueHistoryIds(history, type) {
  const seen = [];
  for (const entry of history || []) {
    if (entry?.type === type && entry.id && !seen.includes(entry.id)) {
      seen.push(entry.id);
    }
  }
  return seen;
}

/**
 * Run one deterministic seasonal year and return a flat, report-friendly record.
 */
export function simulateRun({ roleId, areaId, strategy = "balanced", seed = 1, companyName = "Sim Co" }) {
  if (!STRATEGIES.includes(strategy)) {
    throw new Error(`Unknown strategy: ${strategy}`);
  }

  const rng = makeRng(seed);
  // Independent stream for the policy's own randomness (random strategy,
  // tie-breaks) so content draws and decisions never perturb each other.
  const strategyRng = makeRng(((Number(seed) >>> 0) ^ 0x9e3779b9) >>> 0);
  const controller = new TuiGameController({ rng, onExit: () => {} });

  controller.setInputText(companyName);
  controller.submitCurrent();
  controller.selectOption(seasonalRoleIndex(roleId));
  controller.selectOption(areaIndex(areaId));

  let guard = 0;
  while (controller.getState().mode !== "end" && guard < 1000) {
    guard += 1;
    const view = controller.getState();
    const options = view.options || [];
    if (!options.length) break;
    const details = view.contentData?.optionDetails || [];
    const opts = options.map((_, i) => details[i] || {});
    const metrics = view.gameState?.metrics || {};
    const index = chooseOption(strategy, opts, metrics, roleId, strategyRng);
    controller.selectOption(index);
  }

  const view = controller.getState();
  const gs = view.gameState || {};
  const summary = view.contentData?.type === "summary" ? view.contentData : {};

  return {
    role: roleId,
    area: areaId,
    strategy,
    seed,
    endingTier: tierFromOverall(summary.body),
    style: gs.managementStyle?.label || null,
    finalMetrics: { ...(gs.metrics || {}) },
    consequences: uniqueHistoryIds(gs.history, "consequence"),
    seasonHeadlines: (gs.seasonTimeline || []).map((entry) => entry.headline).filter(Boolean),
    issuesSeen: uniqueHistoryIds(gs.history, "issue"),
    completed: view.mode === "end",
  };
}

export function listSeasonalRoleIds() {
  return getSeasonalPlayableRoles(FORESTER_ROLES).map((role) => role.id);
}

export function listAreaIds() {
  return OPERATING_AREAS.map((area) => area.id);
}

/**
 * Run a role × area × strategy × seed matrix and return every run record.
 */
export function simulateMatrix({
  roles = listSeasonalRoleIds(),
  areas = listAreaIds(),
  strategies = STRATEGIES,
  runs = 1,
  seedBase = 1,
} = {}) {
  const results = [];
  for (const roleId of roles) {
    for (const areaId of areas) {
      for (const strategy of strategies) {
        for (let i = 0; i < runs; i += 1) {
          results.push(simulateRun({ roleId, areaId, strategy, seed: seedBase + i }));
        }
      }
    }
  }
  return results;
}
