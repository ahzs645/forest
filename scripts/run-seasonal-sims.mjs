#!/usr/bin/env node

// Deterministic seasonal balance harness.
//
//   node scripts/run-seasonal-sims.mjs --runs 100 --strategy balanced
//   node scripts/run-seasonal-sims.mjs --role planner --area fraser-plateau --runs 500
//   node scripts/run-seasonal-sims.mjs --matrix --json
//
// Drives the real TuiGameController (see js/engine/simulate.js) so the numbers
// reflect the game players actually see. Writes a markdown + JSON balance
// report unless --json is used for piping.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  STRATEGIES,
  simulateMatrix,
  listSeasonalRoleIds,
  listAreaIds,
} from "../js/engine/simulate.js";

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const next = args[index + 1];
  return next && !next.startsWith("--") ? next : true;
};
const hasFlag = (flag) => args.includes(flag);

const TIER_RANK = { outstanding: 3, solid: 2, mixed: 1, stumbled: 0, unknown: 0 };
const METRICS = ["progress", "forestHealth", "relationships", "compliance", "budget"];
const KNOWN_CONSEQUENCES = [
  "contractor-attrition",
  "trust-deficit",
  "audit-escalation",
  "registration-lapse",
  "paperwork-burn",
  "professional-audit",
];

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function tierDistribution(runs) {
  const counts = { outstanding: 0, solid: 0, mixed: 0, stumbled: 0, unknown: 0 };
  for (const run of runs) counts[run.endingTier] = (counts[run.endingTier] || 0) + 1;
  return counts;
}

function averageMetrics(runs) {
  const out = {};
  for (const metric of METRICS) {
    out[metric] = round(mean(runs.map((run) => Number(run.finalMetrics[metric] || 0))));
  }
  return out;
}

function tierScore(runs) {
  return round(mean(runs.map((run) => TIER_RANK[run.endingTier] ?? 0)), 2);
}

function groupBy(runs, keyFn) {
  const map = new Map();
  for (const run of runs) {
    const key = keyFn(run);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(run);
  }
  return map;
}

function buildAnalysis(results) {
  const byStrategy = groupBy(results, (run) => run.strategy);
  const strategySummary = [...byStrategy.entries()]
    .map(([strategy, runs]) => ({
      strategy,
      runs: runs.length,
      tierScore: tierScore(runs),
      tiers: tierDistribution(runs),
      metrics: averageMetrics(runs),
    }))
    .sort((a, b) => b.tierScore - a.tierScore);

  const byCombo = groupBy(results, (run) => `${run.role} @ ${run.area}`);
  const comboSummary = [...byCombo.entries()]
    .map(([combo, runs]) => ({ combo, tierScore: tierScore(runs), runs: runs.length }))
    .sort((a, b) => b.tierScore - a.tierScore);

  const consequenceCounts = {};
  for (const id of KNOWN_CONSEQUENCES) consequenceCounts[id] = 0;
  const issueCounts = {};
  for (const run of results) {
    for (const id of run.consequences) consequenceCounts[id] = (consequenceCounts[id] || 0) + 1;
    for (const id of run.issuesSeen) issueCounts[id] = (issueCounts[id] || 0) + 1;
  }

  const neverFiredConsequences = Object.entries(consequenceCounts)
    .filter(([, count]) => count === 0)
    .map(([id]) => id);

  const overallMetrics = averageMetrics(results);

  return {
    totalRuns: results.length,
    strategySummary,
    comboSummary,
    dominantStrategy: strategySummary[0]?.strategy ?? null,
    easiestCombo: comboSummary[0] ?? null,
    hardestCombo: comboSummary[comboSummary.length - 1] ?? null,
    overallMetrics,
    consequenceCounts,
    neverFiredConsequences,
    topIssues: Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).slice(0, 12),
  };
}

function renderMarkdown(analysis, meta) {
  const lines = [];
  lines.push("# Seasonal Balance Summary");
  lines.push("");
  lines.push(`Generated: ${meta.generatedAt}`);
  lines.push(`Runs: ${analysis.totalRuns} · seeds ${meta.seedBase}–${meta.seedBase + meta.runs - 1} · roles ${meta.roles.length} · areas ${meta.areas.length} · strategies ${meta.strategies.length}`);
  lines.push("");
  lines.push("Tier rank: outstanding 3 · solid 2 · mixed 1 · stumbled 0.");
  lines.push("");

  lines.push("## Strategy performance (sorted by mean tier)");
  lines.push("");
  lines.push("| Strategy | Mean tier | Outstanding | Solid | Mixed | Stumbled | Avg P/FH/R/C/B |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const entry of analysis.strategySummary) {
    const m = entry.metrics;
    lines.push(
      `| ${entry.strategy} | ${entry.tierScore} | ${entry.tiers.outstanding} | ${entry.tiers.solid} | ${entry.tiers.mixed} | ${entry.tiers.stumbled} | ${m.progress}/${m.forestHealth}/${m.relationships}/${m.compliance}/${m.budget} |`,
    );
  }
  lines.push("");
  lines.push(`Dominant strategy: **${analysis.dominantStrategy}**.`);
  lines.push("");

  lines.push("## Role × area difficulty");
  lines.push("");
  if (analysis.easiestCombo && analysis.hardestCombo) {
    lines.push(`Easiest: **${analysis.easiestCombo.combo}** (mean tier ${analysis.easiestCombo.tierScore}).`);
    lines.push("");
    lines.push(`Most punishing: **${analysis.hardestCombo.combo}** (mean tier ${analysis.hardestCombo.tierScore}).`);
    lines.push("");
  }
  lines.push("| Role @ Area | Mean tier |");
  lines.push("|---|---|");
  for (const entry of analysis.comboSummary) {
    lines.push(`| ${entry.combo} | ${entry.tierScore} |`);
  }
  lines.push("");

  lines.push("## Consequence firing rate");
  lines.push("");
  lines.push("| Consequence | Runs fired |");
  lines.push("|---|---|");
  for (const [id, count] of Object.entries(analysis.consequenceCounts)) {
    lines.push(`| ${id} | ${count} |`);
  }
  lines.push("");
  lines.push(
    analysis.neverFiredConsequences.length
      ? `Never fired: ${analysis.neverFiredConsequences.join(", ")}.`
      : "Every consequence fired at least once.",
  );
  lines.push("");

  lines.push("## Most frequent issues");
  lines.push("");
  lines.push("| Issue | Runs seen |");
  lines.push("|---|---|");
  for (const [id, count] of analysis.topIssues) {
    lines.push(`| ${id} | ${count} |`);
  }
  lines.push("");

  lines.push("## Average final metrics (all runs)");
  lines.push("");
  const o = analysis.overallMetrics;
  lines.push(`Progress ${o.progress} · Forest Health ${o.forestHealth} · Relationships ${o.relationships} · Compliance ${o.compliance} · Budget ${o.budget}`);
  lines.push("");

  return lines.join("\n");
}

function main() {
  const runs = Math.max(1, parseInt(getArg("--runs", "50"), 10) || 50);
  const seedBase = parseInt(getArg("--seed-base", "1000"), 10) || 1000;
  const jsonOnly = hasFlag("--json");

  const roleArg = getArg("--role");
  const areaArg = getArg("--area");
  const strategyArg = getArg("--strategy");

  const roles = typeof roleArg === "string" ? [roleArg] : listSeasonalRoleIds();
  const areas = typeof areaArg === "string" ? [areaArg] : listAreaIds();
  const strategies = typeof strategyArg === "string" ? [strategyArg] : STRATEGIES;

  const results = simulateMatrix({ roles, areas, strategies, runs, seedBase });
  const analysis = buildAnalysis(results);
  const meta = {
    generatedAt: new Date().toISOString(),
    runs,
    seedBase,
    roles,
    areas,
    strategies,
  };

  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify({ meta, analysis, results }, null, 2)}\n`);
    return;
  }

  const outDir = typeof getArg("--out") === "string" ? getArg("--out") : "reports/balance";
  const markdownPath = resolve(outDir, "seasonal-balance-summary.md");
  const dataPath = resolve(outDir, "seasonal-balance-data.json");
  mkdirSync(dirname(markdownPath), { recursive: true });
  writeFileSync(markdownPath, renderMarkdown(analysis, meta));
  // Keep the committed report compact: the aggregated analysis, not the raw
  // per-run records (use `--json` to stream those for ad-hoc piping).
  writeFileSync(dataPath, `${JSON.stringify({ meta, analysis }, null, 2)}\n`);

  // Console digest.
  console.log(`Ran ${results.length} seasonal years (${runs} seed(s) × ${roles.length} role(s) × ${areas.length} area(s) × ${strategies.length} strategy(ies)).`);
  console.log("\nStrategy   mean-tier  outstanding/solid/mixed/stumbled");
  for (const entry of analysis.strategySummary) {
    const t = entry.tiers;
    console.log(
      `${entry.strategy.padEnd(14)} ${String(entry.tierScore).padStart(4)}     ${t.outstanding}/${t.solid}/${t.mixed}/${t.stumbled}`,
    );
  }
  console.log(`\nDominant strategy: ${analysis.dominantStrategy}`);
  if (analysis.easiestCombo) console.log(`Easiest combo:     ${analysis.easiestCombo.combo} (${analysis.easiestCombo.tierScore})`);
  if (analysis.hardestCombo) console.log(`Hardest combo:     ${analysis.hardestCombo.combo} (${analysis.hardestCombo.tierScore})`);
  if (analysis.neverFiredConsequences.length) {
    console.log(`Never-fired consequences: ${analysis.neverFiredConsequences.join(", ")}`);
  }
  console.log(`\nWrote ${markdownPath}`);
  console.log(`Wrote ${dataPath}`);
}

main();
