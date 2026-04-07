#!/usr/bin/env node

import blessed from "blessed";
import { FORESTER_ROLES, OPERATING_AREAS } from "./js/data/index.js";
import {
  createInitialState,
  getRoleTasks,
  applyOptionOutcome,
  applyRoundConsequences,
  drawIssue,
  buildSummary,
  SEASONS,
} from "./js/engine.js";
import { ASCII_ART, ANIMATIONS } from "./js/ascii_art.js";
import * as ExtraAnimations from "./js/animations/index.js";

// Initialize blessed screen
const screen = blessed.screen({
  smartCSR: true,
  title: "BC Forestry Trail",
  cursor: {
    artificial: true,
    shape: "line",
    blink: true,
    color: null,
  },
});

screen.key(["escape", "q", "C-c"], () => process.exit(0));

// Layout components
const headerBox = blessed.box({
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  content: " {bold}BC Forestry Trail - Terminal Edition{/bold} (Press Q to quit)",
  tags: true,
  style: {
    fg: "white",
    bg: "green",
  },
  border: { type: "line" },
});

const statsBox = blessed.box({
  top: 3,
  left: 0,
  width: "25%",
  height: "100%-3",
  label: " {bold}Dashboard{/bold} ",
  content: "Awaiting game start...",
  tags: true,
  border: { type: "line" },
  style: { border: { fg: "cyan" } },
});

const fieldRadioBox = blessed.box({
  top: 3,
  left: "25%",
  width: "75%",
  height: "100%-15",
  label: " {bold}Field Radio{/bold} ",
  tags: true,
  border: { type: "line" },
  style: { border: { fg: "yellow" } },
});

const mainBox = blessed.box({
  parent: fieldRadioBox,
  top: 0,
  left: 0,
  width: "60%",
  height: "100%",
  content: "Welcome to BC Forestry Trail.\nPress any key to begin.",
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: " ",
    inverse: true,
  },
  padding: {
    left: 1,
    right: 1,
  }
});

const artBox = blessed.box({
  parent: fieldRadioBox,
  top: 0,
  left: "60%",
  width: "40%",
  height: "100%",
  content: "",
  tags: true,
  padding: {
    left: 1,
    right: 1,
  }
});

const optionsList = blessed.list({
  bottom: 0,
  left: "25%",
  width: "75%",
  height: 12,
  label: " {bold}Options{/bold} (Use Arrow Keys & Enter) ",
  keys: true,
  vi: true,
  mouse: true,
  interactive: true,
  border: { type: "line" },
  style: {
    border: { fg: "blue" },
    selected: { bg: "white", fg: "black", bold: true },
    item: { fg: "white" },
  },
  padding: {
    left: 1,
    right: 1,
  }
});

const overlayBox = blessed.box({
  top: "center",
  left: "center",
  width: "50%",
  height: "50%",
  label: " {bold}Animation{/bold} ",
  content: "",
  tags: true,
  border: { type: "line" },
  style: { border: { fg: "green" }, bg: "black" },
  hidden: true,
  padding: {
    left: 1,
    right: 1,
  }
});

screen.append(headerBox);
screen.append(statsBox);
screen.append(fieldRadioBox);
screen.append(optionsList);
screen.append(overlayBox);

// Game State
let gameState = null;
let currentPhaseQueue = []; // array of { type, data }

function playAnimation(frames, delay, targetBox, onComplete) {
  let frameIndex = 0;

  if (targetBox === overlayBox) {
    overlayBox.show();
    overlayBox.setFront();
  }

  const intervalId = setInterval(() => {
    if (frameIndex < frames.length) {
      targetBox.setContent(`\n${frames[frameIndex]}`);
      screen.render();
      frameIndex++;
    } else {
      clearInterval(intervalId);
      if (targetBox === overlayBox) {
        overlayBox.hide();
        screen.render();
      }
      if (onComplete) onComplete();
    }
  }, delay);
}

function renderStats() {
  if (!gameState) {
    statsBox.setContent("No active run.");
  } else {
    const { metrics, round, totalRounds, role, area, companyName } = gameState;
    const season = SEASONS[Math.max(0, Math.min(SEASONS.length - 1, round - 1))] || "Setup";
    const roundText = round > 0 ? `Season ${round} of ${totalRounds}\n{green-fg}${season}{/green-fg}` : "Setup Phase";

    statsBox.setContent(
      `{bold}${roundText}{/bold}\n\n` +
      `{bold}Metrics{/bold}\n` +
      `{yellow-fg}Progress:{/yellow-fg}      ${metrics.progress}\n` +
      `{green-fg}Forest Health:{/green-fg} ${metrics.forestHealth}\n` +
      `{blue-fg}Relationships:{/blue-fg} ${metrics.relationships}\n` +
      `{magenta-fg}Compliance:{/magenta-fg}    ${metrics.compliance}\n` +
      `{red-fg}Budget:{/red-fg}        ${metrics.budget}\n\n` +
      `{bold}Company:{/bold}\n${companyName}\n\n` +
      `{bold}Role:{/bold}\n${role.name}\n\n` +
      `{bold}Area:{/bold}\n${area.name}`
    );
  }
  screen.render();
}

function askOptions(promptText, options, callback) {
  mainBox.setContent(promptText);
  // Prepare options text for the list box
  optionsList.setItems(options.map((opt, i) => ` ${i + 1}. ${opt.label} `));
  optionsList.focus();
  screen.render();

  optionsList.once("select", (item, index) => {
    callback(options[index]);
  });
}

function askString(promptText, callback) {
  mainBox.setContent(promptText);
  const input = blessed.textbox({
    parent: mainBox,
    bottom: 1,
    left: 2,
    height: 3,
    width: "80%",
    keys: true,
    mouse: true,
    inputOnFocus: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, focus: { border: { fg: "green" } } },
  });
  input.focus();
  screen.render();

  input.once("submit", (value) => {
    input.destroy();
    callback(value || "Forest Co-op");
  });
}

function runNextPhase() {
  if (currentPhaseQueue.length === 0) {
    // Round complete
    if (gameState && gameState.round < gameState.totalRounds) {
      startRound();
    } else {
      endGame();
    }
    return;
  }

  const phase = currentPhaseQueue.shift();

  // Determine ambient art based on phase text
  let ambientArtKey = null;
  let customArtFrame = null;
  const phaseText = phase.text || (phase.data ? (phase.data.title + " " + phase.data.description) : "");
  const lowerText = phaseText.toLowerCase();

  if (lowerText.includes("bear") || lowerText.includes("wildlife")) {
    ambientArtKey = "bear";
  } else if (lowerText.includes("moose")) {
    customArtFrame = ExtraAnimations.mooseAnimation[0];
  } else if (lowerText.includes("eagle") || lowerText.includes("bird")) {
    customArtFrame = ExtraAnimations.eagleAnimation[0];
  } else if (lowerText.includes("rain")) {
    ambientArtKey = "rain";
  } else if (lowerText.includes("snow") || (gameState && SEASONS[gameState.round - 1] === "Winter")) {
    ambientArtKey = "snow";
  } else if (lowerText.includes("fire") || lowerText.includes("burn")) {
    customArtFrame = ExtraAnimations.wildfireAnimation[0];
  } else if (lowerText.includes("camp") || phase.type === "message" && lowerText.includes("welcome")) {
    ambientArtKey = "campfire";
  } else if (lowerText.includes("harvest") || lowerText.includes("cut")) {
    ambientArtKey = "tree";
  } else if (lowerText.includes("transport") || lowerText.includes("haul")) {
    ambientArtKey = "truck";
  } else if (lowerText.includes("river") || lowerText.includes("water")) {
    customArtFrame = ExtraAnimations.riverAnimation[0];
  } else if (lowerText.includes("morning") || lowerText.includes("dawn")) {
    customArtFrame = ExtraAnimations.sunrisesetAnimation[0];
  }

  if (customArtFrame) {
    artBox.setContent(`\n${customArtFrame}`);
  } else if (ambientArtKey && ASCII_ART[ambientArtKey]) {
    artBox.setContent(`\n${ASCII_ART[ambientArtKey][0]}`);
  } else {
    artBox.setContent("");
  }
  screen.render();

  if (phase.type === "message") {
    mainBox.setContent(phase.text);
    optionsList.setItems([" [Continue] "]);
    optionsList.focus();
    screen.render();
    optionsList.once("select", () => runNextPhase());
  } else if (phase.type === "task" || phase.type === "issue") {
    const isIssue = phase.type === "issue";
    const item = phase.data;

    let prompt = `{bold}${item.title}{/bold}\n\n${item.description || ""}\n`;
    if (isIssue && item.flavor) {
      prompt += `\n{gray-fg}${item.flavor}{/gray-fg}\n`;
    }

    // Append detailed options text to prompt so user can read outcomes before selecting
    prompt += `\n{bold}Available Options:{/bold}\n`;
    item.options.forEach((opt, idx) => {
      prompt += `\n${idx + 1}. {cyan-fg}${opt.label}{/cyan-fg}`;
      if (opt.outcome) prompt += `\n   {gray-fg}${opt.outcome}{/gray-fg}`;
    });

    askOptions(prompt, item.options, (selectedOption) => {
      applyOptionOutcome(gameState, selectedOption, {
        type: phase.type,
        id: item.id,
        title: item.title,
        option: selectedOption.label,
        round: gameState.round,
      });

      let resultText = `{bold}Outcome:{/bold} {cyan-fg}${selectedOption.label}{/cyan-fg}\n\n`;
      if (selectedOption.outcome) {
        resultText += `${selectedOption.outcome}\n\n`;
      }
      resultText += `{green-fg}Effects applied.{/green-fg}`;

      renderStats();

      const runNext = () => {
        currentPhaseQueue.unshift({ type: "message", text: resultText });
        runNextPhase();
      };

      const optionText = selectedOption.label.toLowerCase();
      if (optionText.includes("harvest") || optionText.includes("cut") || optionText.includes("fell")) {
        playAnimation(ANIMATIONS.treeFalling, 200, overlayBox, runNext);
      } else if (optionText.includes("chainsaw")) {
        playAnimation(ExtraAnimations.chainsawAnimation, 200, overlayBox, runNext);
      } else if (optionText.includes("transport") || optionText.includes("haul") || optionText.includes("truck")) {
        playAnimation(ANIMATIONS.truckDriving, 200, overlayBox, runNext);
      } else if (optionText.includes("fly") || optionText.includes("helicopter") || optionText.includes("air")) {
        playAnimation(ExtraAnimations.helicopterAnimation, 200, overlayBox, runNext);
      } else if (optionText.includes("plant") || optionText.includes("seed")) {
        playAnimation(ExtraAnimations.treePlantingAnimation, 300, overlayBox, runNext);
      } else if (optionText.includes("drone") || optionText.includes("survey")) {
        playAnimation(ExtraAnimations.droneAnimation, 200, overlayBox, runNext);
      } else if (optionText.includes("radio") || optionText.includes("call")) {
        playAnimation(ExtraAnimations.walkieTalkieAnimation, 300, overlayBox, runNext);
      } else if (optionText.includes("map") || optionText.includes("plan")) {
        playAnimation(ExtraAnimations.mapAnimation, 400, overlayBox, runNext);
      } else if (optionText.includes("compass") || optionText.includes("navigate")) {
        playAnimation(ExtraAnimations.compassAnimation, 300, overlayBox, runNext);
      } else if (optionText.includes("walk") || optionText.includes("hike") || optionText.includes("boot")) {
        playAnimation(ExtraAnimations.bootAnimation, 300, overlayBox, runNext);
      } else {
        runNext();
      }
    });
  } else if (phase.type === "consequences") {
    phase.execute();
  }
}

function startRound() {
  gameState.round++;
  const season = SEASONS[gameState.round - 1];

  currentPhaseQueue.push({ type: "message", text: `{bold}=== ${season} ==={/bold}\n\nA new season begins. Prepare your crew.` });

  const tasks = getRoleTasks(gameState);
  tasks.forEach(task => {
    currentPhaseQueue.push({ type: "task", data: task });
  });

  const issue = drawIssue(gameState);
  if (issue) {
    currentPhaseQueue.push({ type: "issue", data: issue });
  }

  // Add round consequences resolution step
  currentPhaseQueue.push({
    type: "consequences",
    execute: () => {
      const consequences = applyRoundConsequences(gameState);
      if (consequences && consequences.length > 0) {
        let msg = `{bold}End of Season Consequences:{/bold}\n\n`;
        consequences.forEach(c => {
          msg += `- ${c}\n`;
        });
        currentPhaseQueue.unshift({ type: "message", text: msg });
      }
      renderStats();
      runNextPhase();
    }
  });

  runNextPhase();
}

function endGame() {
  const summary = buildSummary(gameState);
  let content = `{bold}=== Year End Review ==={/bold}\n\n`;
  content += `${summary.overall}\n\n`;
  summary.messages.forEach(msg => content += `• ${msg}\n`);

  if (summary.achievements && summary.achievements.length) {
    content += `\n{bold}Achievements:{/bold}\n`;
    summary.achievements.forEach(a => content += `${a}\n`);
  }

  mainBox.setContent(content);
  optionsList.setItems([" [Play Again] ", " [Quit] "]);
  optionsList.focus();
  screen.render();

  optionsList.once("select", (item, index) => {
    if (index === 0) {
      startGameSetup();
    } else {
      process.exit(0);
    }
  });
}

function startGameSetup() {
  gameState = null;
  currentPhaseQueue = [];
  renderStats();

  askString("{bold}Welcome to BC Forestry Trail{/bold}\n\nEnter your Company Name (or press Enter for default 'Forest Co-op'):", (companyName) => {
    const roleOpts = FORESTER_ROLES.map(r => ({ label: r.name, value: r.id }));
    askOptions("{bold}Select your Specialization:{/bold}\n\nDifferent roles face different challenges.", roleOpts, (roleSelection) => {
      const areaOpts = OPERATING_AREAS.map(a => ({ label: a.name, value: a.id }));
      askOptions("{bold}Select your Operating Area:{/bold}\n\nChoose the environment for your operations.", areaOpts, (areaSelection) => {

        gameState = createInitialState({
          companyName: companyName,
          roleId: roleSelection.value,
          areaId: areaSelection.value
        });

        renderStats();
        startRound();
      });
    });
  });
}

screen.render();
startGameSetup();
