#!/usr/bin/env node

import { FORESTER_ROLES, OPERATING_AREAS, ILLEGAL_ACTS } from "./js/data/index.js";
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

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  dim: "\x1b[2m",
};

function color(text, colorCode) {
  return `${colorCode}${text}${colors.reset}`;
}

function divider(label = "") {
  console.log(color("\n" + "═".repeat(60), colors.dim));
  if (label) {
    console.log(color(label.toUpperCase(), colors.cyan));
    console.log(color("═".repeat(60), colors.dim));
  }
}

function displayMetrics(metrics) {
  console.log(color("\n📊 Current Metrics:", colors.bright));
  console.log(
    color(
      `  Progress: ${Math.round(metrics.progress)} | ` +
        `Forest Health: ${Math.round(metrics.forestHealth)} | ` +
        `Relationships: ${Math.round(metrics.relationships)}`,
      colors.green
    )
  );
  console.log(
    color(
      `  Compliance: ${Math.round(metrics.compliance)} | ` +
        `Budget: ${Math.round(metrics.budget)}`,
      colors.green
    )
  );
}

// Auto-select best option
function selectBestOption(options) {
  const weights = {
    progress: 1,
    forestHealth: 1.2,
    relationships: 1.1,
    compliance: 1.3,
    budget: 0.8,
  };
  
  let bestOption = options[0];
  let bestScore = -Infinity;
  
  options.forEach((option) => {
    const effects = option.effects || {};
    const score = Object.entries(effects).reduce(
      (total, [key, value]) => total + (weights[key] || 0.5) * value,
      0
    );
    if (score > bestScore) {
      bestScore = score;
      bestOption = option;
    }
  });
  
  return bestOption;
}

function resolveOption(option) {
  if (!option) {
    return { outcome: "", effects: {}, historyLabel: "" };
  }
  
  if (option.risk) {
    const chance = Math.max(0, Math.min(1, Number(option.risk.chance) || 0));
    const roll = Math.random();
    const success = roll < chance;
    const deck = success ? option.risk.success : option.risk.failure;
    const branch = Array.isArray(deck) ? deck[Math.floor(Math.random() * deck.length)] : deck;
    
    const outcome = branch?.outcome ?? option.outcome ?? "";
    const effects = branch?.effects ?? option.effects ?? {};
    const headline = branch?.headline || (success ? "Success" : "Failure");
    
    console.log(
      color(
        `\n🎲 Risk roll (${Math.round(chance * 100)}% target, rolled ${roll.toFixed(2)}): ${headline}!`,
        success ? colors.green : colors.red
      )
    );
    
    return {
      outcome,
      effects,
      historyLabel: option.historyLabel || option.label,
    };
  }
  
  return {
    outcome: option.outcome || "",
    effects: option.effects || {},
    historyLabel: option.historyLabel || option.label,
  };
}

console.clear();
divider();
console.log(color("🌲 BC FORESTRY SIMULATOR - AUTO-PLAY DEMO 🌲", colors.bright));
divider();

// Auto-select: Strategic Planner in Fort St. John
const role = FORESTER_ROLES[0];
const area = OPERATING_AREAS[0];
const companyName = "Demo Forest Crew";

const state = createInitialState({
  companyName,
  roleId: role.id,
  areaId: area.id,
});

console.log(color(`\nWelcome ${companyName}!`, colors.green));
console.log(`You are serving as the ${color(role.name, colors.cyan)} in the ${color(area.name, colors.cyan)}.`);
console.log(`BEC designation: ${area.becZone}.`);
if (area.dominantTrees?.length) {
  console.log(`Dominant species: ${area.dominantTrees.join(", ")}.`);
}
if (area.indigenousPartners?.length) {
  console.log(`Key Indigenous partners: ${area.indigenousPartners.join(", ")}.`);
}

console.log(color("\n\nNavigating one full operational year across four seasons...\n", colors.dim));

// Main game loop
for (let round = 1; round <= state.totalRounds; round++) {
  state.round = round;
  const season = SEASONS[round - 1] || `Season ${round}`;
  
  divider(`${season.toUpperCase()} - Round ${round}/${state.totalRounds}`);
  displayMetrics(state.metrics);
  
  // Tasks
  const tasks = getRoleTasks(state);
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    console.log(color(`\n\n📝 Task ${i+1}/3: ${task.title}`, colors.bright));
    console.log(color(task.prompt, colors.dim));
    
    const option = selectBestOption(task.options);
    console.log(color(`\n→ Choosing: ${option.label}`, colors.yellow));
    
    const resolved = resolveOption(option);
    if (resolved.outcome) {
      console.log(color(`\n✓ ${resolved.outcome}`, colors.green));
    }
    
    applyEffects(state, resolved.effects, {
      type: "task",
      id: task.id,
      title: task.title,
      option: resolved.historyLabel,
      round: state.round,
    });
    
    const delta = formatMetricDelta(resolved.effects);
    if (delta) {
      console.log(color(`📊 Impact: ${delta}`, colors.magenta));
    }
  }
  
  // Issue
  const issue = drawIssue(state);
  if (issue) {
    console.log(color(`\n\n⚠️  Field Issue: ${issue.title}`, colors.bright));
    console.log(color(issue.description, colors.dim));
    
    const option = selectBestOption(issue.options);
    console.log(color(`\n→ Choosing: ${option.label}`, colors.yellow));
    
    const resolved = resolveOption(option);
    if (resolved.outcome) {
      console.log(color(`\n✓ ${resolved.outcome}`, colors.green));
    }
    
    applyEffects(state, resolved.effects, {
      type: "issue",
      id: issue.id,
      title: issue.title,
      option: resolved.historyLabel,
      round: state.round,
    });
    
    const delta = formatMetricDelta(resolved.effects);
    if (delta) {
      console.log(color(`📊 Impact: ${delta}`, colors.magenta));
    }
  } else {
    console.log(color("\n✓ No critical issues surfaced this season.", colors.dim));
  }
  
  console.log(color(`\n\n✅ ${season} complete!`, colors.bright));
  displayMetrics(state.metrics);
}

// Summary
divider("YEAR-END SUMMARY");
const summary = buildSummary(state);
console.log(color(`\n${summary.overall}`, colors.bright));
summary.messages.forEach((message) => console.log(color(message, colors.cyan)));

if (summary.achievements?.length) {
  console.log(color("\n🏆 Achievements Earned:", colors.bright));
  summary.achievements.forEach((line) => console.log(color(line, colors.yellow)));
}

if (summary.projection?.length) {
  console.log(color("\n🔮 Future Outlook:", colors.bright));
  summary.projection.forEach((line) => console.log(color(`• ${line}`, colors.dim)));
}

displayMetrics(state.metrics);

divider();
console.log(color("\n✨ Demo playthrough complete! ✨\n", colors.green));
