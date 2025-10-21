#!/usr/bin/env node

/**
 * Interactive CLI Play-through Tool
 *
 * This tool lets you actually play through the BC Forestry Simulator game
 * in your terminal with full interactivity to test game mechanics.
 */

import readline from "readline";
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Color helpers for terminal
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
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

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
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

function displayOptions(options, includeWildcard = false, state = null) {
  options.forEach((option, index) => {
    const num = color(`[${index + 1}]`, colors.yellow);
    const label = option.label || option.outcome || "Option";

    // Show effects if available
    let effectStr = "";
    if (option.effects) {
      const delta = formatMetricDelta(option.effects);
      if (delta) {
        effectStr = color(` (${delta})`, colors.dim);
      }
    }

    // Show risk info
    if (option.risk) {
      const chance = Math.round(option.risk.chance * 100);
      effectStr += color(` [${chance}% chance]`, colors.magenta);
    }

    console.log(`  ${num} ${label}${effectStr}`);

    // Show description if available
    if (option.description) {
      console.log(color(`      ${option.description}`, colors.dim));
    }
  });
}

async function chooseOption(prompt, options) {
  console.log(color(`\n${prompt}`, colors.bright));
  displayOptions(options);

  while (true) {
    const answer = await question(color("\nYour choice (number): ", colors.cyan));
    const index = parseInt(answer, 10) - 1;

    if (index >= 0 && index < options.length) {
      return options[index];
    }

    console.log(color("Invalid choice. Please try again.", colors.red));
  }
}

function resolveOption(option, state) {
  if (!option) {
    return { outcome: "", effects: {}, historyLabel: "" };
  }

  // Handle risk-based options
  if (option.risk) {
    const chance = Math.max(0, Math.min(1, Number(option.risk.chance) || 0));
    const roll = Math.random();
    const success = roll < chance;
    const deck = success ? option.risk.success : option.risk.failure;
    const branch = Array.isArray(deck) ? deck[Math.floor(Math.random() * deck.length)] : deck;

    const outcome = branch?.outcome ?? option.outcome ?? "";
    const effects = branch?.effects ?? option.effects ?? {};
    const headline = branch?.headline
      ? branch.headline
      : success
      ? option.risk.successHeadline || "Success"
      : option.risk.failureHeadline || "Failure";

    console.log(
      color(
        `\n🎲 Risk roll (${Math.round(chance * 100)}% target, rolled ${roll.toFixed(2)}): ${headline}!`,
        success ? colors.green : colors.red
      )
    );

    return {
      outcome,
      effects,
      historyLabel: `${option.historyLabel ?? option.label}${
        branch?.historyLabelSuffix ?? (success ? " — Paid Off" : " — Backfired")
      }`,
      setFlags: branch?.setFlags ?? option.setFlags,
      clearFlags: branch?.clearFlags ?? option.clearFlags,
      scheduleIssues: branch?.scheduleIssues ?? option.scheduleIssues,
    };
  }

  return {
    outcome: option.outcome ?? "",
    effects: option.effects ?? {},
    historyLabel: option.historyLabel ?? option.label,
    setFlags: option.setFlags,
    clearFlags: option.clearFlags,
    scheduleIssues: option.scheduleIssues,
  };
}

function handleSideEffects(resolved, state, issue) {
  if (!resolved) return;

  if (!state.flags) {
    state.flags = {};
  }

  if (resolved.clearFlags) {
    for (const key of [].concat(resolved.clearFlags)) {
      if (key) {
        delete state.flags[key];
      }
    }
  }

  if (resolved.setFlags) {
    Object.entries(resolved.setFlags).forEach(([key, value]) => {
      if (!key) return;
      state.flags[key] = value ?? true;
    });
  }

  if (resolved.scheduleIssues) {
    if (!Array.isArray(state.pendingIssues)) {
      state.pendingIssues = [];
    }
    const schedule = Array.isArray(resolved.scheduleIssues)
      ? resolved.scheduleIssues
      : [resolved.scheduleIssues];
    schedule.forEach((item) => {
      if (!item) return;
      const payload = {
        id: item.id,
        delay: typeof item.delay === "number" ? Math.max(0, item.delay) : 0,
      };
      if (payload.id) {
        state.pendingIssues.push(payload);
      }
    });
  }

  if (issue?.id && resolved.scheduleIssues) {
    state.flags[`resolved:${issue.id}`] = true;
  }
}

function createWildcardOption(state) {
  const roleId = state?.role?.id;
  const pool = ILLEGAL_ACTS.filter((act) => (roleId ? act.roles?.includes(roleId) : false));
  const source = pool.length ? pool : ILLEGAL_ACTS;
  if (!source.length) {
    return null;
  }

  const pick = source[Math.floor(Math.random() * source.length)];
  const roll = Math.random();

  let severity;
  if (roll < 0.25) {
    severity = {
      label: "Low Profile",
      outcome: "Somehow the auditors stay glued to their inboxes, and the crew pockets quiet gains.",
      effects: { progress: 5, budget: 4, relationships: -2, compliance: -5 },
      historySuffix: " – Slipped By",
    };
  } else if (roll < 0.85) {
    severity = {
      label: "Heat Rising",
      outcome: "Rumours spiral around town, and partner nations send frosty emails asking for clarification.",
      effects: { progress: 6, budget: 5, relationships: -6, compliance: -12 },
      historySuffix: " – Raised Eyebrows",
    };
  } else {
    severity = {
      label: "Investigation Launched",
      outcome:
        "Compliance officers find a paper trail before lunch. Inspectors descend with clipboards and emergency suspension powers.",
      effects: { progress: -2, budget: -8, relationships: -12, compliance: -22 },
      historySuffix: " – Busted",
    };
  }

  const labelSuffix = severity.label ? ` – ${severity.label}` : "";
  return {
    label: `🚫 Wildcard: ${pick.title}${labelSuffix}`,
    outcome: `You lean into the shady path. ${pick.description} ${severity.outcome}`,
    effects: severity.effects,
    historyLabel: `${pick.title} (Wildcard${severity.historySuffix})`,
  };
}

function calculateRiskChance(state) {
  const metrics = state?.metrics;
  if (!metrics) {
    return 0.45;
  }
  const budgetFactor = (metrics.budget - 50) / 150;
  const complianceDrag = (50 - metrics.compliance) / 120;
  const relationshipBoost = (metrics.relationships - 50) / 220;
  const forestHealthDrag = (50 - metrics.forestHealth) / 260;
  const raw = 0.38 + budgetFactor - complianceDrag + relationshipBoost - forestHealthDrag;
  return Math.min(0.8, Math.max(0.15, raw));
}

function scaleEffects(effects, scale) {
  const scaled = {};
  for (const [key, value] of Object.entries(effects)) {
    const adjusted = Math.round(value * scale);
    if (adjusted !== 0) {
      scaled[key] = adjusted;
    }
  }
  return scaled;
}

function createRiskOption(state) {
  const areaName = state?.area?.name ?? "north woods";
  const chance = calculateRiskChance(state);
  const deviation = chance - 0.45;
  const successScale = 1 - deviation * 0.9;
  const failureScale = 1 + -deviation * 1.1;

  const successEffects = scaleEffects(
    {
      progress: 8,
      budget: 5,
      relationships: 3,
      compliance: -4,
    },
    successScale
  );

  const failureEffects = scaleEffects(
    {
      progress: -7,
      budget: -9,
      relationships: -6,
      compliance: -8,
    },
    failureScale
  );

  const successTemplates = [
    {
      headline: "Adrenaline Rush Pays Off",
      outcome:
        "The convoy rockets through the timber under aurora glow. Radios crackle with victory yelps and the mill rewards your audacity.",
      historyLabelSuffix: " — Paid Off",
    },
    {
      headline: "Big Bet Impresses the Board",
      outcome: `Investors wake to sunrise selfies from the ${areaName} blitz. The brass declares you a legend of opportunistic logistics.`,
      historyLabelSuffix: " — Board Approved",
    },
  ];

  const failureTemplates = [
    {
      headline: "Cratered in Spectacular Fashion",
      outcome:
        "A drone pilot streams the whole gambit. Sirens echo, fines rain down, and the crew feels their stomachs drop into the slash pile.",
      historyLabelSuffix: " — Backfired",
    },
    {
      headline: "Camp Cook Live-Blogged the Chaos",
      outcome: `The mess tent posts viral updates about machines sunk axle-deep near ${areaName}. Regulators binge-watch the feed with clipboards ready.`,
      historyLabelSuffix: " — Livestreamed",
    },
  ];

  return {
    label: `🎲 Risk Play: Ignite a moonlit blitz in ${areaName} (${Math.round(chance * 100)}% win chance)`,
    risk: {
      chance,
      success: successTemplates.map((t) => ({ ...t, effects: successEffects })),
      failure: failureTemplates.map((t) => ({ ...t, effects: failureEffects })),
    },
    historyLabel: `Risk Play (${areaName})`,
    description: `Chance-based decision. Success: ${formatMetricDelta(successEffects)}. Failure: ${formatMetricDelta(
      failureEffects
    )}.`,
  };
}

function advancePendingIssues(state) {
  if (!Array.isArray(state.pendingIssues)) {
    state.pendingIssues = [];
    return;
  }
  state.pendingIssues.forEach((item) => {
    if (item && typeof item.delay === "number" && item.delay > 0) {
      item.delay -= 1;
    }
  });
}

async function playGame() {
  console.clear();
  divider();
  console.log(color("🌲 BC FORESTRY SIMULATOR - Interactive CLI 🌲", colors.bright));
  divider();

  // Role selection
  console.log(color("\n📋 Choose your forester specialization:", colors.bright));
  FORESTER_ROLES.forEach((role, index) => {
    console.log(
      `  ${color(`[${index + 1}]`, colors.yellow)} ${color(role.name, colors.cyan)} – ${role.description}`
    );
  });

  const roleIndex = parseInt(await question(color("\nYour choice (number): ", colors.cyan)), 10) - 1;
  const role = FORESTER_ROLES[roleIndex] || FORESTER_ROLES[0];

  // Area selection
  console.log(color("\n🗺️  Select an operating area:", colors.bright));
  OPERATING_AREAS.forEach((area, index) => {
    console.log(
      `  ${color(`[${index + 1}]`, colors.yellow)} ${color(area.name, colors.cyan)} – ${area.description}`
    );
  });

  const areaIndex = parseInt(await question(color("\nYour choice (number): ", colors.cyan)), 10) - 1;
  const area = OPERATING_AREAS[areaIndex] || OPERATING_AREAS[0];

  // Get company name
  const companyName = await question(color("\n🏢 Name your forestry crew: ", colors.cyan));

  // Initialize game
  const state = createInitialState({
    companyName: companyName || "Forest Crew",
    roleId: role.id,
    areaId: area.id,
  });

  divider();
  console.log(color(`\nWelcome ${companyName || "team"}!`, colors.green));
  console.log(`You are serving as the ${color(role.name, colors.cyan)} in the ${color(area.name, colors.cyan)}.`);
  console.log(`BEC designation: ${area.becZone}.`);
  if (area.dominantTrees?.length) {
    console.log(`Dominant species: ${area.dominantTrees.join(", ")}.`);
  }
  if (area.indigenousPartners?.length) {
    console.log(`Key Indigenous partners: ${area.indigenousPartners.join(", ")}.`);
  }

  console.log(color("\n\nNavigate one full operational year across four seasons.", colors.dim));
  console.log(color("You'll make decisions for tasks and respond to field issues.", colors.dim));

  await question(color("\n\nPress Enter to begin...", colors.yellow));

  // Main game loop
  for (let round = 1; round <= state.totalRounds; round++) {
    state.round = round;
    const season = SEASONS[round - 1] ?? `Season ${round}`;

    divider(`${season.toUpperCase()} - Round ${round}/${state.totalRounds}`);
    advancePendingIssues(state);
    displayMetrics(state.metrics);

    // Tasks
    const tasks = getRoleTasks(state);
    for (const task of tasks) {
      divider("Decision Brief");
      console.log(color(`\n📝 Task: ${task.title}`, colors.bright));
      console.log(task.prompt);

      // Add wildcard and risk options
      const allOptions = [...task.options];
      const wildcard = createWildcardOption(state);
      if (wildcard) allOptions.push(wildcard);
      const risk = createRiskOption(state);
      if (risk) allOptions.push(risk);

      const option = await chooseOption("", allOptions);
      const baseline = { ...state.metrics };
      const resolved = resolveOption(option, state);

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
        console.log(color(`📊 Impact: ${delta}`, colors.yellow));
      }

      handleSideEffects(resolved, state, null);
      displayMetrics(state.metrics);
    }

    // Issue
    const issue = drawIssue(state);
    if (issue) {
      divider("Field Issue Update");
      console.log(color(`\n⚠️  Field Issue: ${issue.title}`, colors.bright));
      console.log(color(issue.description, colors.dim));

      const allOptions = [...issue.options];
      const wildcard = createWildcardOption(state);
      if (wildcard) allOptions.push(wildcard);
      const risk = createRiskOption(state);
      if (risk) allOptions.push(risk);

      const option = await chooseOption("How will you respond?", allOptions);
      const baseline = { ...state.metrics };
      const resolved = resolveOption(option, state);

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
        console.log(color(`📊 Impact: ${delta}`, colors.yellow));
      }

      handleSideEffects(resolved, state, issue);
      displayMetrics(state.metrics);
    } else {
      console.log(color("\n✓ No critical issues surfaced this season.", colors.dim));
    }

    console.log(color(`\n📰 Season ${round} complete!`, colors.bright));
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
  console.log(color("\n✨ Thanks for playing! ✨\n", colors.green));
}

// Run the game
playGame()
  .then(() => {
    rl.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error(color("\n❌ Error:", colors.red), error);
    rl.close();
    process.exit(1);
  });
