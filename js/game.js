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
import { FORESTER_ROLES, OPERATING_AREAS, ILLEGAL_ACTS, GLOSSARY_TERMS } from "./data/index.js";

class ForestryGame {
  constructor() {
    this.ui = new TerminalUI();
    this.state = null;
    this._seasonBaseline = null;
    this._restartConfirmOpen = false;
    this.ui.onRestartRequest(() => this._promptRestart());
    this.ui.loadGlossary(GLOSSARY_TERMS);
    this._bindRestart();
  }

  _bindRestart() {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (this.ui.isModalOpen()) {
          return;
        }
        event.preventDefault();
        this._promptRestart();
      }
    });
  }

  _promptRestart() {
    if (this._restartConfirmOpen) {
      return;
    }
    this._restartConfirmOpen = true;
    this.ui.openModal({
      title: "Restart scenario?",
      dismissible: true,
      onClose: () => {
        this._restartConfirmOpen = false;
      },
      buildContent: (container) => {
        const message = document.createElement("p");
        message.textContent = "Starting over clears your current crew's progress and returns to role selection.";
        message.style.marginTop = "0";
        container.appendChild(message);
      },
      actions: [
        {
          label: "Restart",
          primary: true,
          onSelect: () => {
            this.ui.closeModal();
            this.ui.write("\nReloading scenario...");
            this.start();
          },
        },
        {
          label: "Keep playing",
          onSelect: () => {
            this.ui.closeModal();
          },
        },
      ],
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

    this.ui.write("Navigate one full operational year across four seasons. ESC or the Restart button opens the restart prompt.\n");

    for (let round = 1; round <= this.state.totalRounds; round++) {
      this.state.round = round;
      const season = SEASONS[round - 1] ?? `Season ${round}`;
      this.ui.write(`\n--- ${season.toUpperCase()} ---`);
      this.ui.updateStatus(this.state);

      this._seasonBaseline = { ...this.state.metrics };

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
      const headline = this._seasonHeadline(season, this._seasonBaseline);
      if (headline) {
        this.ui.write(headline);
      }
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
    const hush = ["diesel haze", "frosty muskeg", "cedar pitch", "chain oil mist", "river fog"];
    const sense = hush[Math.floor(Math.random() * hush.length)];
    const severity = this._drawWildcardSeverity();
    const labelSuffix = severity.label ? ` – ${severity.label}` : "";
    return {
      label: `🚫 Wildcard: ${pick.title}${labelSuffix}`,
      outcome: `You lean into the shady path. ${pick.description} ${severity.outcome} The ${sense} hangs in the ${areaName} air as compliance officers start whispering about anomalies.`,
      effects: severity.effects,
      historyLabel: `${pick.title} (Wildcard${severity.historySuffix})`,
    };
  }

  _createRiskOption() {
    const areaName = this.state?.area?.name ?? "north woods";
    const chance = this._calculateRiskChance();
    const chanceLabel = Math.round(chance * 100);
    const { successEffects, failureEffects } = this._riskEffectProfiles(chance);
    return {
      label: `🎲 Risk Play: Ignite a moonlit blitz in ${areaName} (${chanceLabel}% win chance)`,
      risk: {
        chance,
        success: this._buildRiskNarratives("success", areaName, successEffects),
        failure: this._buildRiskNarratives("failure", areaName, failureEffects),
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
    const deck = success ? option.risk.success : option.risk.failure;
    const branch = Array.isArray(deck) ? this._pickRandom(deck) : deck;
    const outcome = branch?.outcome ?? option.outcome ?? "";
    const effects = branch?.effects ?? option.effects ?? {};
    const headline = branch?.headline
      ? branch.headline
      : success
      ? option.risk.successHeadline || "Success"
      : option.risk.failureHeadline || "Failure";
    const preface = `🎲 Risk roll (${Math.round(chance * 100)}% target, rolled ${roll.toFixed(2)}): ${headline}!`;
    return {
      preface,
      outcome,
      effects,
      historyLabel: `${option.historyLabel ?? option.label}${branch?.historyLabelSuffix ?? (success ? " — Paid Off" : " — Backfired")}`,
    };
  }

  _pickRandom(collection = []) {
    if (!collection.length) {
      return null;
    }
    const index = Math.floor(Math.random() * collection.length);
    return collection[index];
  }

  _drawWildcardSeverity() {
    const roll = Math.random();
    if (roll < 0.25) {
      return {
        label: "Low Profile",
        outcome: "Somehow the auditors stay glued to their inboxes, and the crew pockets quiet gains.",
        effects: { progress: 5, budget: 4, relationships: -2, compliance: -5 },
        historySuffix: " – Slipped By",
      };
    }
    if (roll < 0.85) {
      return {
        label: "Heat Rising",
        outcome: "Rumours spiral around town, and partner nations send frosty emails asking for clarification.",
        effects: { progress: 6, budget: 5, relationships: -6, compliance: -12 },
        historySuffix: " – Raised Eyebrows",
      };
    }
    return {
      label: "Investigation Launched",
      outcome: "Compliance officers find a paper trail before lunch. Inspectors descend with clipboards and emergency suspension powers.",
      effects: { progress: -2, budget: -8, relationships: -12, compliance: -22 },
      historySuffix: " – Busted",
    };
  }

  _calculateRiskChance() {
    const metrics = this.state?.metrics;
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

  _riskEffectProfiles(chance) {
    const swing = 0.45 - chance;
    const successScale = 1 + swing * 0.9;
    const failureScale = 1 + (chance - 0.45) * 1.1;
    return {
      successEffects: this._scaleEffects(
        {
          progress: 8,
          budget: 5,
          relationships: 3,
          compliance: -4,
        },
        successScale
      ),
      failureEffects: this._scaleEffects(
        {
          progress: -7,
          budget: -9,
          relationships: -6,
          compliance: -8,
        },
        failureScale
      ),
    };
  }

  _scaleEffects(effects, scale) {
    const scaled = {};
    for (const [key, value] of Object.entries(effects)) {
      const adjusted = Math.round(value * scale);
      if (adjusted !== 0) {
        scaled[key] = adjusted;
      }
    }
    return scaled;
  }

  _buildRiskNarratives(type, areaName, effects) {
    const templates = type === "success" ? this._riskSuccessTemplates(areaName) : this._riskFailureTemplates(areaName);
    return templates.map((template) => ({
      headline: template.headline,
      outcome: template.outcome,
      effects,
      historyLabelSuffix: template.historyLabelSuffix,
    }));
  }

  _riskSuccessTemplates(areaName) {
    return [
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
      {
        headline: "Caribou Never Saw It Coming",
        outcome: "Wildlife stewards praise your delicate timing as you thread machines between migratory herds without a single spooked hoof.",
        historyLabelSuffix: " — Wildlife Wowed",
      },
    ];
  }

  _riskFailureTemplates(areaName) {
    return [
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
      {
        headline: "Union Steward Pulls the Plug",
        outcome: "Crew reps stage an impromptu safety stand-down after midnight mishaps, forcing an expensive reset while the rumour mill erupts.",
        historyLabelSuffix: " — Mutiny",
      },
    ];
  }

  _seasonHeadline(season, baseline) {
    if (!baseline) {
      return "";
    }
    const metrics = this.state?.metrics;
    if (!metrics) {
      return "";
    }
    const deltas = Object.fromEntries(
      Object.entries(baseline).map(([key, value]) => [key, Math.round((metrics[key] ?? 0) - value)])
    );
    const candidates = Object.entries(deltas)
      .map(([key, change]) => ({ key, change, magnitude: Math.abs(change) }))
      .filter((entry) => entry.magnitude >= 2)
      .sort((a, b) => b.magnitude - a.magnitude);
    if (!candidates.length) {
      return `🗞️ ${season} dispatch: "Steady as she goes" reports the Northern Timber Times.`;
    }
    const top = candidates[0];
    const pool = top.change >= 0 ? this._seasonPositiveHeadlines(top.key) : this._seasonNegativeHeadlines(top.key);
    const template = this._pickRandom(pool);
    if (!template) {
      return "";
    }
    return `🗞️ ${template.replace("{value}", Math.abs(top.change)).replace("{season}", season)}`;
  }

  _seasonPositiveHeadlines(metric) {
    switch (metric) {
      case "progress":
        return [
          "{season} dispatch: Haulers celebrate a {value}-point surge in delivered loads.",
          "{season} bonus edition: Mill logs spike {value} ticks as your blitz clears the block list.",
        ];
      case "forestHealth":
        return [
          "{season} dispatch: Botanists high-five over {value}-point forest health rebound.",
          "{season} roundup: Satellite imagery shows canopy vigor up {value} after your tweaks.",
        ];
      case "relationships":
        return [
          "{season} dispatch: Treaty partners applaud a {value}-point goodwill upswing.",
          "{season} news: Community radio spotlights your listening sessions, boosting ties by {value} ticks.",
        ];
      case "compliance":
        return [
          "{season} bulletin: Compliance office notes {value}-point improvement—no red pens snapped today.",
          "{season} update: Auditors send heart emojis after risk profile tightens by {value}.",
        ];
      case "budget":
        return [
          "{season} ledger leak: Finance applauds a {value}-point bump in rainy-day funds.",
          "{season} dispatch: Treasury meme account hails your {value}-point budget glow-up.",
        ];
      default:
        return [];
    }
  }

  _seasonNegativeHeadlines(metric) {
    switch (metric) {
      case "progress":
        return [
          "{season} dispatch: Production plunges {value} as graders sit idle in camp.",
          "{season} late edition: Dispatch riders complain of {value}-point schedule slippage.",
        ];
      case "forestHealth":
        return [
          "{season} dispatch: Forest health dips {value}; moss bloggers sound the alarm.",
          "{season} update: Satellite imagery shows canopy stress climbing {value} ticks.",
        ];
      case "relationships":
        return [
          "{season} dispatch: Partner liaisons report {value}-point goodwill crash after tense calls.",
          "{season} news: Community FM loops a protest ballad over {value}-point relationship slide.",
        ];
      case "compliance":
        return [
          "{season} bulletin: Compliance nosedives {value}; auditors dust off the raid jackets.",
          "{season} alert: Regulators cite {value}-point slide while sharpening suspension notices.",
        ];
      case "budget":
        return [
          "{season} ledger leak: Budget drains by {value}; finance orders instant ramen for camp.",
          "{season} dispatch: Bean counters gasp at {value}-point burn rate spike.",
        ];
      default:
        return [];
    }
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
