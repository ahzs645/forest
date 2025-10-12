#!/usr/bin/env node

import { FORESTER_ROLES, OPERATING_AREAS } from "./js/data/index.js";
import {
  createInitialState,
  getRoleTasks,
  applyEffects,
  drawIssue,
  buildSummary,
  formatMetricDelta,
  findRole,
  findArea,
  SEASONS,
} from "./js/engine.js";

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  if (index !== -1) {
    return args[index + 1] ?? fallback;
  }
  return fallback;
};

const runs = parseInt(getArg("--runs", "1"), 10) || 1;
const rounds = Math.max(1, parseInt(getArg("--rounds", String(SEASONS.length)), 10) || SEASONS.length);
const roleIdInput = getArg("--role");
const areaIdInput = getArg("--area");
const shouldLog = args.includes("--log");

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function chooseOption(options) {
  return options.reduce((best, option) => {
    const score = scoreOption(option.effects || {});
    if (!best || score > best.score) {
      return { option, score };
    }
    return best;
  }, null).option;
}

function scoreOption(effects) {
  const weights = {
    progress: 1,
    forestHealth: 1.2,
    relationships: 1.1,
    compliance: 1.3,
    budget: 0.8,
  };
  return Object.entries(effects).reduce((total, [key, value]) => total + (weights[key] || 0.5) * value, 0);
}

function formatHistoryEntry(entry) {
  const prefix = entry.type === "issue" ? "Issue" : "Task";
  const delta = formatMetricDelta(entry.effects);
  return `${prefix} (${entry.round}): ${entry.title} -> ${entry.option}${delta ? ` [${delta}]` : ""}`;
}

for (let run = 1; run <= runs; run++) {
  const role = roleIdInput ? findRole(roleIdInput) : randomItem(FORESTER_ROLES);
  const area = areaIdInput ? findArea(areaIdInput) : randomItem(OPERATING_AREAS);
  if (!role || !area) {
    console.error("Invalid role or area supplied. Available role IDs:");
    console.error(FORESTER_ROLES.map((r) => ` - ${r.id}`).join("\n"));
    console.error("Available area IDs:");
    console.error(OPERATING_AREAS.map((a) => ` - ${a.id}`).join("\n"));
    process.exit(1);
  }

  const state = createInitialState({ companyName: `CLI Outfit ${run}`, roleId: role.id, areaId: area.id });
  state.totalRounds = rounds;

  console.log(`Run ${run}: ${role.name} operating in the ${area.name}`);

  for (let round = 1; round <= rounds; round++) {
    state.round = round;
    const tasks = getRoleTasks(state);
    for (const task of tasks) {
      const option = chooseOption(task.options);
      applyEffects(state, option.effects, {
        type: "task",
        id: task.id,
        title: task.title,
        option: option.label,
        round,
      });
    }
    const issue = drawIssue(state);
    if (issue) {
      const option = chooseOption(issue.options);
      applyEffects(state, option.effects, {
        type: "issue",
        id: issue.id,
        title: issue.title,
        option: option.label,
        round,
      });
    }
  }

  const summary = buildSummary(state);
  console.log(summary.overall);
  summary.messages.forEach((message) => console.log(` - ${message}`));

  if (shouldLog) {
    console.log("Detail log:");
    state.history.forEach((entry) => {
      console.log(`   ${formatHistoryEntry(entry)}`);
    });
  }

  if (run < runs) {
    console.log("\n");
  }
}
