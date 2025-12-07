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
    this._thresholdBuckets = {};
    this._riskTipShown = false;
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
        if (
          typeof this.ui.dismissMobileStatusOverlay === "function" &&
          this.ui.dismissMobileStatusOverlay()
        ) {
          event.preventDefault();
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
    this.ui.prepareForNewGame();
    this.ui.clear();

    this.ui.write("Initializing BC Forestry Simulator v2.4...");
    await this._delay(800);
    this.ui.write("Loading geospatial data...");
    await this._delay(600);
    this.ui.write("Connecting to ministry servers...");
    await this._delay(600);

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
    this._thresholdBuckets = {};
    this._riskTipShown = false;
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
      this.ui.write(this._generateWeatherReport(season));
      this._advancePendingIssues();
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
      this._recordSeasonSnapshot(season);
      this.ui.updateStatus(this.state);
    }

    const summary = buildSummary(this.state);
    this.ui.write("\n=== YEAR-END SUMMARY ===");
    this.ui.write(summary.overall);
    summary.messages.forEach((message) => this.ui.write(message));
    if (summary.legacy) {
      if (summary.legacy.seasonSummaries?.length) {
        this.ui.write("\nLegacy Report:");
        summary.legacy.seasonSummaries.forEach((line) => this.ui.write(line));
      }
      if (summary.legacy.trendLines?.length) {
        summary.legacy.trendLines.forEach((line) => this.ui.write(`  ${line}`));
      }
    }
    if (summary.highlights?.length) {
      this.ui.write("\nDecision Review:");
      summary.highlights.forEach((line) => this.ui.write(line));
    }
    if (summary.achievements?.length) {
      this.ui.write("\nAchievements Earned:");
      summary.achievements.forEach((line) => this.ui.write(line));
    }
    if (summary.projection?.length) {
      this.ui.write("\nFuture Outlook:");
      summary.projection.forEach((line) => this.ui.write(`• ${line}`));
    }
    this.ui.write("\nThanks for guiding the team. Press ESC to try a different combination.");
  }

  async _runTask(task) {
    this.ui.writeDivider("Decision Brief");
    this.ui.write(this._statusSnapshot());
    this.ui.write(`\nTask: ${task.title}`);
    const option = await this.ui.promptChoice(task.prompt, this._decorateOptions(task.options));
    const baseline = { ...this.state.metrics };
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
    this._handleResolutionSideEffects(resolved);
    this._checkThresholds(baseline, this.state.metrics);
    this.ui.updateStatus(this.state);
  }

  async _resolveIssue(issue) {
    this.ui.writeDivider("Field Issue Update");
    this.ui.write(this._statusSnapshot());
    this.ui.write(`\nField Issue: ${issue.title}`);
    this.ui.write(issue.description);
    const option = await this.ui.promptChoice(
      "How will you respond?",
      this._decorateOptions(issue.options)
    );
    const baseline = { ...this.state.metrics };
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
    this._handleResolutionSideEffects(resolved, issue);
    this._checkThresholds(baseline, this.state.metrics);
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

  _recordSeasonSnapshot(season) {
    if (!this.state.timeline) {
      this.state.timeline = [];
    }
    this.state.timeline.push({
      round: this.state.round,
      season,
      metrics: { ...this.state.metrics },
    });
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
    const pool = ILLEGAL_ACTS.filter((act) => (roleId ? act.roles?.includes(roleId) : false));
    const source = pool.length ? pool : ILLEGAL_ACTS;
    if (!source.length) {
      return null;
    }
    const pick = source[Math.floor(Math.random() * source.length)];
    return {
      label: `🚫 Wildcard: ${pick.title}`,
      mischief: {
        pick,
      },
    };
  }

  _createRiskOption() {
    const areaName = this.state?.area?.name ?? "north woods";
    const chance = this._calculateRiskChance();
    const chanceLabel = this._formatRiskChanceLabel(chance);
    const { successEffects, failureEffects } = this._riskEffectProfiles(chance);
    const description = this._describeRiskPlay(chance, successEffects, failureEffects);
    const option = {
      label: `🎲 Risk Play: Ignite a moonlit blitz in ${areaName} (${chanceLabel} win chance)`,
      risk: {
        chance,
        success: this._buildRiskNarratives("success", areaName, successEffects),
        failure: this._buildRiskNarratives("failure", areaName, failureEffects),
      },
      historyLabel: `Risk Play (${areaName})`,
      description,
    };
    this._maybeAnnounceRiskPlay(chance, successEffects, failureEffects);
    return option;
  }

  _statusSnapshot() {
    const metrics = this.state?.metrics;
    if (!metrics) {
      return "Status Brief -> gathering telemetry...";
    }
    const parts = [
      `Progress ${Math.round(metrics.progress)}`,
      `Forest Health ${Math.round(metrics.forestHealth)}`,
      `Relationships ${Math.round(metrics.relationships)}`,
      `Compliance ${Math.round(metrics.compliance)}`,
      `Budget ${Math.round(metrics.budget)}`,
    ];
    return `Status Brief -> ${parts.join(" • ")}`;
  }

  _describeRiskPlay(chance, successEffects, failureEffects) {
    const chanceLabel = this._formatRiskChanceLabel(chance);
    const success = this._formatRiskDeltaList(successEffects);
    const failure = this._formatRiskDeltaList(failureEffects);
    return `Chance-based decision. Roll under ${chanceLabel} to win. Success: ${success}. Failure: ${failure}.`;
  }

  _formatRiskDeltaList(effects = {}) {
    const delta = formatMetricDelta(effects);
    return delta || "Minimal impact";
  }

  _maybeAnnounceRiskPlay(chance, successEffects, failureEffects) {
    if (this._riskTipShown) {
      return;
    }
    this._riskTipShown = true;
    const chanceLabel = this._formatRiskChanceLabel(chance);
    const success = this._formatRiskDeltaList(successEffects);
    const failure = this._formatRiskDeltaList(failureEffects);
    this.ui.write(
      `ℹ️ Risk plays compare a random roll against the listed chance. (${chanceLabel} target — Success: ${success}; Failure: ${failure}).`
    );
    this.ui.write("Choose them only when you are comfortable with the potential downside.");
  }

  _formatRiskChanceLabel(chance) {
    const percent = Math.max(0, Math.min(100, chance * 100));
    const rounded = Math.round(percent * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
  }

  _resolveOption(option) {
    if (!option) {
      return { outcome: "", effects: {}, historyLabel: "" };
    }
    if (option.mischief) {
      const { pick } = option.mischief;
      const areaName = this.state?.area?.name ?? "backcountry";
      const hush = ["diesel haze", "frosty muskeg", "cedar pitch", "chain oil mist", "river fog"];
      const sense = hush[Math.floor(Math.random() * hush.length)];
      const severity = this._drawWildcardSeverity();
      const outcome = `You lean into the shady path. ${pick.description} ${severity.outcome} The ${sense} hangs in the ${areaName} air as compliance officers start whispering about anomalies.`;

      return {
        outcome,
        effects: severity.effects,
        historyLabel: `${pick.title} (Wildcard${severity.historySuffix})`,
      };
    }

    if (!option.risk) {
      return {
        outcome: option.outcome ?? "",
        effects: option.effects ?? {},
        historyLabel: option.historyLabel ?? option.label,
        setFlags: option.setFlags,
        clearFlags: option.clearFlags,
        scheduleIssues: option.scheduleIssues,
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
      setFlags: branch?.setFlags ?? option.setFlags,
      clearFlags: branch?.clearFlags ?? option.clearFlags,
      scheduleIssues: branch?.scheduleIssues ?? option.scheduleIssues,
    };
  }

  _pickRandom(collection = []) {
    if (!collection.length) {
      return null;
    }
    const index = Math.floor(Math.random() * collection.length);
    return collection[index];
  }

  _advancePendingIssues() {
    if (!Array.isArray(this.state.pendingIssues)) {
      this.state.pendingIssues = [];
      return;
    }
    this.state.pendingIssues.forEach((item) => {
      if (item && typeof item.delay === "number" && item.delay > 0) {
        item.delay -= 1;
      }
    });
  }

  _handleResolutionSideEffects(resolved, issue) {
    if (!resolved) {
      return;
    }
    if (!this.state.flags) {
      this.state.flags = {};
    }
    if (resolved.clearFlags) {
      for (const key of [].concat(resolved.clearFlags)) {
        if (key) {
          delete this.state.flags[key];
        }
      }
    }
    if (resolved.setFlags) {
      Object.entries(resolved.setFlags).forEach(([key, value]) => {
        if (!key) return;
        this.state.flags[key] = value ?? true;
      });
    }
    if (resolved.scheduleIssues) {
      if (!Array.isArray(this.state.pendingIssues)) {
        this.state.pendingIssues = [];
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
          this.state.pendingIssues.push(payload);
        }
      });
    }
    if (issue?.id && resolved.scheduleIssues) {
      // Flag the originating issue so chained stages know their source completed.
      this.state.flags[`resolved:${issue.id}`] = true;
    }
  }

  _checkThresholds(previous = {}, next = {}) {
    const metrics = ["progress", "forestHealth", "relationships", "compliance", "budget"];
    metrics.forEach((metric) => {
      const before = Number(previous[metric] ?? 0);
      const after = Number(next[metric] ?? 0);
      const prevBucket = this._thresholdBuckets[metric] ?? this._bucketFor(before);
      const nextBucket = this._bucketFor(after);
      if (metric === "budget") {
        this._maybeScheduleBudgetEmergency(after);
      }
      this._thresholdBuckets[metric] = nextBucket;
      if (prevBucket === nextBucket) {
        return;
      }
      const direction = nextBucket > prevBucket ? "up" : "down";
      const threshold = direction === "up" ? nextBucket : prevBucket;
      const label = this._metricLabel(metric);
      const message = this._thresholdMessage(label, direction, threshold, after);
      this.ui.flashMetricAlert({
        label,
        message,
        direction,
        value: after,
        threshold,
      });
      this.ui.write(message);
    });
  }

  _maybeScheduleBudgetEmergency(value) {
    if (value <= 5 && !this.state.flags?.budgetLoanActive) {
      if (!this.state.flags) {
        this.state.flags = {};
      }
      if (!this.state.flags.budgetEmergencyScheduled) {
        this.state.flags.budgetEmergencyScheduled = true;
        if (!Array.isArray(this.state.pendingIssues)) {
          this.state.pendingIssues = [];
        }
        this.state.pendingIssues.push({ id: "budget-emergency-loan", delay: 0 });
      }
    } else if (value > 5 && this.state.flags?.budgetEmergencyScheduled && !this.state.flags?.budgetLoanActive) {
      delete this.state.flags.budgetEmergencyScheduled;
    }
  }

  _bucketFor(value) {
    if (value < 30) return 0;
    if (value < 50) return 30;
    if (value < 70) return 50;
    return 70;
  }

  _metricLabel(metric) {
    switch (metric) {
      case "progress":
        return "Operational Progress";
      case "forestHealth":
        return "Forest Health";
      case "relationships":
        return "Relationships";
      case "compliance":
        return "Compliance";
      case "budget":
        return "Budget Flexibility";
      default:
        return metric;
    }
  }

  _thresholdMessage(label, direction, threshold, value) {
    const rounded = Math.round(value);
    if (direction === "up") {
      if (threshold >= 70) {
        return `🌟 ${label} climbed above ${threshold}. Current reading: ${rounded}.`;
      }
      return `📈 ${label} rose past ${threshold}. Current reading: ${rounded}.`;
    }
    if (threshold <= 0) {
      return `🚨 ${label} bottomed out. Current reading: ${rounded}.`;
    }
    if (threshold <= 30) {
      return `⚠️ ${label} slipped below ${threshold}. Current reading: ${rounded}.`;
    }
    return `🔻 ${label} dipped under ${threshold}. Current reading: ${rounded}.`;
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
    const deviation = chance - 0.45;
    const successScale = 1 - deviation * 0.9;
    const failureScale = 1 + (-deviation) * 1.1;
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

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _generateWeatherReport(season) {
    const reports = [
      "Weather: Overcast with a chance of drizzle. Roads are slick.",
      "Weather: Clear skies, but the wind is picking up in the valley.",
      "Weather: Heavy fog rolling in from the coast. Visibility is low.",
      "Weather: Unseasonably warm. Fire risk is moderate.",
      "Weather: Steady rain. Creeks are running high.",
      "Weather: Frost overnight. Equipment warm-up needed.",
      "Weather: Sun breaking through. Ideal conditions for aerial work.",
      "Weather: Snow flurries at elevation. Winter is coming.",
    ];
    // Simple random selection for now, could be season-specific
    return `[${season}] ${reports[Math.floor(Math.random() * reports.length)]}`;
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
