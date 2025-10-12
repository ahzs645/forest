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
    const option = await this.ui.promptChoice(task.prompt, this._decorateOptions(task.options));
    const resolved = this._resolveOption(option);
    if (resolved.preface) {
      this.ui.write(resolved.preface);
    }
    this.ui.write(resolved.outcome);
    applyEffects(this.state, resolved.effects, {
      type: "task",
      id: task.id,
      title: task.title,
      option: resolved.historyLabel,
      round: this.state.round,
    });
    const delta = formatMetricDelta(resolved.effects);
    if (delta) {
      this.ui.write(`Impact: ${delta}`);
    }
    this.ui.updateStatus(this.state);
  }

  async _resolveIssue(issue) {
    this.ui.write(`\nField Issue: ${issue.title}`);
    this.ui.write(issue.description);
    const option = await this.ui.promptChoice(
      "How will you respond?",
      this._decorateOptions(issue.options)
    );
    const resolved = this._resolveOption(option);
    if (resolved.preface) {
      this.ui.write(resolved.preface);
    }
    this.ui.write(resolved.outcome);
    applyEffects(this.state, resolved.effects, {
      type: "issue",
      id: issue.id,
      title: issue.title,
      option: resolved.historyLabel,
      round: this.state.round,
    });
    const delta = formatMetricDelta(resolved.effects);
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

  _decorateOptions(options = []) {
    const deck = options.map((option) => ({ ...option }));
    const mischief = this._createMischiefOption();
    if (mischief) {
      deck.push(mischief);
    }
    const risk = this._createRiskOption();
    if (risk) {
      deck.push(risk);
    }
    return deck;
  }

  _createMischiefOption() {
    const roleId = this.state?.role?.id;
    const areaName = this.state?.area?.name ?? "backcountry";
    const pool = ILLEGAL_ACTS.filter((act) => (roleId ? act.roles?.includes(roleId) : false));
    const source = pool.length ? pool : ILLEGAL_ACTS;
    if (!source.length) {
      return null;
    }
    const pick = source[Math.floor(Math.random() * source.length)];
    const hush = [
      "diesel haze",
      "frosty muskeg",
      "cedar pitch",
      "chain oil mist",
      "river fog",
    ];
    const sense = hush[Math.floor(Math.random() * hush.length)];
    return {
      label: `🚫 Wildcard: ${pick.title}`,
      outcome: `You lean into the shady path. ${pick.description} The ${sense} hangs in the ${areaName} air as compliance officers start whispering about anomalies.`,
      effects: { progress: 6, budget: 5, relationships: -6, compliance: -12 },
      historyLabel: `${pick.title} (Wildcard)`,
    };
  }

  _createRiskOption() {
    const areaName = this.state?.area?.name ?? "north woods";
    const chance = 0.45;
    const chanceLabel = Math.round(chance * 100);
    return {
      label: `🎲 Risk Play: Ignite a moonlit blitz in ${areaName} (${chanceLabel}% win chance)`,
      risk: {
        chance,
        successHeadline: "Adrenaline Rush Pays Off",
        failureHeadline: "Cratered in Spectacular Fashion",
        success: {
          outcome:
            "The convoy rockets through the timber under aurora glow. Radios crackle with victory yelps and the mill rewards your audacity.",
          effects: { progress: 8, budget: 5, relationships: 3, compliance: -4 },
        },
        failure: {
          outcome:
            "A drone pilot streams the whole gambit. Sirens echo, fines rain down, and the crew feels their stomachs drop into the slash pile.",
          effects: { progress: -7, budget: -9, relationships: -6, compliance: -8 },
        },
      },
      historyLabel: `Risk Play (${areaName})`,
    };
  }

  _resolveOption(option) {
    if (!option) {
      return { outcome: "", effects: {}, historyLabel: "" };
    }
    if (!option.risk) {
      return {
        outcome: option.outcome ?? "",
        effects: option.effects ?? {},
        historyLabel: option.historyLabel ?? option.label,
      };
    }
    const chance = Math.max(0, Math.min(1, Number(option.risk.chance) || 0));
    const roll = Math.random();
    const success = roll < chance;
    const branch = success ? option.risk.success : option.risk.failure;
    const outcome = branch?.outcome ?? option.outcome ?? "";
    const effects = branch?.effects ?? option.effects ?? {};
    const headline = success
      ? option.risk.successHeadline || "Success"
      : option.risk.failureHeadline || "Failure";
    const preface = `🎲 Risk roll (${Math.round(chance * 100)}% target, rolled ${roll.toFixed(2)}): ${headline}!`;
    return {
      preface,
      outcome,
      effects,
      historyLabel: `${option.historyLabel ?? option.label}${success ? " — Paid Off" : " — Backfired"}`,
    };
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
