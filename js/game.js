import { TerminalUI } from "./ui.js";
import {
  createInitialState,
  getRoleTasks,
  applyEffects,
  drawIssue,
  buildSummary,
  formatMetricDelta,
  SEASONS,
  findRole,
  findArea,
} from "./engine.js";
import { FORESTER_ROLES, OPERATING_AREAS, ILLEGAL_ACTS } from "./data/index.js";

class ForestryGame {
  constructor() {
    this.ui = new TerminalUI();
    this.state = null;
    this._bindRestart();
  }

  _bindRestart() {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.ui.write("\nReloading scenario...");
        this.start();
      }
    });
  }

  async start() {
    this.ui.clear();
    this.ui.write("FORESTRY SIMULATOR");
    this.ui.write("===================\n");

    const companyName = await this.ui.promptText("Name your forestry crew:");
    const roleOption = await this.ui.promptChoice(
      "Choose your forester specialization:",
      FORESTER_ROLES.map((role) => ({ label: `${role.name} – ${role.description}`, value: role.id }))
    );
    const roleId = roleOption.value ?? findRoleByLabel(roleOption.label)?.id ?? FORESTER_ROLES[0].id;

    const areaOption = await this.ui.promptChoice(
      "Select an operating area:",
      OPERATING_AREAS.map((area) => ({
        label: `${area.name} – ${area.description}`,
        value: area.id,
      }))
    );
    const areaId = areaOption.value ?? findAreaByLabel(areaOption.label)?.id ?? OPERATING_AREAS[0].id;

    this.state = createInitialState({ companyName, roleId, areaId });
    this.ui.updateStatus({ ...this.state, round: 0 });

    const role = findRole(roleId);
    const area = findArea(areaId);

    this.ui.write(`\nWelcome ${companyName || "team"}!`);
    this.ui.write(`You are serving as the ${role.name} in the ${area.name}.`);
    this.ui.write(`BEC designation: ${area.becZone}.`);
    if (area.dominantTrees?.length) {
      this.ui.write(`Dominant species: ${area.dominantTrees.join(", ")}.`);
    }
    if (area.focusTopics?.length) {
      this.ui.write(`Season priorities: ${area.focusTopics.join(", ")}.`);
    }
    if (area.indigenousPartners?.length) {
      this.ui.write(`Key Indigenous partners: ${area.indigenousPartners.join(", ")}.`);
    }

    this._leakIllegalFile(roleId);

    this.ui.write("Navigate one full operational year across four seasons. ESC to restart.\n");

    for (let round = 1; round <= this.state.totalRounds; round++) {
      this.state.round = round;
      const season = SEASONS[round - 1] ?? `Season ${round}`;
      this.ui.write(`\n--- ${season.toUpperCase()} ---`);
      this.ui.updateStatus(this.state);

      const tasks = getRoleTasks(this.state);
      for (const task of tasks) {
        await this._runTask(task);
      }

      const issue = drawIssue(this.state);
      if (issue) {
        await this._resolveIssue(issue);
      } else {
        this.ui.write("No critical issues surfaced this season.");
      }

      this.ui.write(this._seasonCheckpoint());
      this.ui.updateStatus(this.state);
    }

    const summary = buildSummary(this.state);
    this.ui.write("\n=== YEAR-END SUMMARY ===");
    this.ui.write(summary.overall);
    summary.messages.forEach((message) => this.ui.write(message));
    this.ui.write("\nThanks for guiding the team. Press ESC to try a different combination.");
  }

  async _runTask(task) {
    this.ui.write(`\nTask: ${task.title}`);
    const option = await this.ui.promptChoice(task.prompt, task.options);
    this.ui.write(option.outcome);
    applyEffects(this.state, option.effects, {
      type: "task",
      id: task.id,
      title: task.title,
      option: option.label,
      round: this.state.round,
    });
    if (option.effects) {
      const delta = formatMetricDelta(option.effects);
      if (delta) {
        this.ui.write(`Impact: ${delta}`);
      }
    }
    this.ui.updateStatus(this.state);
  }

  async _resolveIssue(issue) {
    this.ui.write(`\nField Issue: ${issue.title}`);
    this.ui.write(issue.description);
    const option = await this.ui.promptChoice("How will you respond?", issue.options);
    this.ui.write(option.outcome);
    applyEffects(this.state, option.effects, {
      type: "issue",
      id: issue.id,
      title: issue.title,
      option: option.label,
      round: this.state.round,
    });
    const delta = formatMetricDelta(option.effects);
    if (delta) {
      this.ui.write(`Impact: ${delta}`);
    }
  }

  _leakIllegalFile(roleId) {
    const matches = ILLEGAL_ACTS.filter((act) => act.roles?.includes(roleId));
    if (!matches.length) {
      return;
    }

    const sampleCount = Math.min(3, matches.length);
    const pool = [...matches];
    const selections = [];
    while (selections.length < sampleCount && pool.length) {
      const index = Math.floor(Math.random() * pool.length);
      const [pick] = pool.splice(index, 1);
      if (pick) {
        selections.push(pick);
      }
    }

    this.ui.write("\n🚫 Illicit Operations File recovered from the breakroom copier:");
    selections.forEach((act, position) => {
      const tagList = act.tags?.length ? act.tags.map((tag) => `#${tag}`).join(" ") : "";
      const header = `${position + 1}. ${act.title}`;
      this.ui.write(tagList ? `${header} — ${tagList}` : header);
      this.ui.write(`   ${act.description}`);
    });
    this.ui.write("(Satire only—keep your program clean.)\n");
  }

  _seasonCheckpoint() {
    const { metrics, round, totalRounds } = this.state;
    const summary = `Season ${round}/${totalRounds} snapshot -> Progress ${Math.round(
      metrics.progress
    )}, Forest Health ${Math.round(metrics.forestHealth)}, Relationships ${Math.round(
      metrics.relationships
    )}, Compliance ${Math.round(metrics.compliance)}, Budget ${Math.round(metrics.budget)}`;
    return summary;
  }
}

function findRoleByLabel(label) {
  return FORESTER_ROLES.find((role) => label.startsWith(role.name));
}

function findAreaByLabel(label) {
  return OPERATING_AREAS.find((area) => label.startsWith(area.name));
}

window.addEventListener("DOMContentLoaded", () => {
  const game = new ForestryGame();
  game.start();
});
