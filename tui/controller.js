import { FORESTER_ROLES, OPERATING_AREAS, getRoleAreaBriefing } from "../js/data/index.js";
import {
  buildSeasonContext,
  createInitialState,
  applyOptionOutcome,
  applyRoundConsequences,
  drawSeasonalAssignment,
  drawSeasonalEvent,
  drawSeasonalTemptation,
  drawIssue,
  buildSummary,
  formatMetricDelta,
  recordAssignmentSelection,
  buildSeasonHeadline,
  computeManagementStyle,
  describeConsequences,
  SEASONS,
} from "../js/engine.js";
import { formatMetricName } from "../js/engine/shared.js";
import { detectArt } from "./art.js";
import {
  getRoleDisplayName,
  getSeasonalPlayableRoles,
} from "../js/engine/seasonalContract.js";
import {
  CRISIS_COMMAND_LABEL,
  applyCrisisOption,
  buildCrisisCard,
  buildCrisisOutcomeNotice,
  buildCrisisSummary,
  createCrisisCommandState,
  getNextCrisisScenario,
} from "./crisisMode.js";

const INITIAL_CONTENT = {
  type: "setup",
  heading: "Welcome to BC Forestry Trail",
};

// Short "what am I signing up for" lines shown under each setup choice so the
// role and area pick feels strategic instead of cosmetic.
const ROLE_PREVIEWS = {
  planner: "Landscape trade-offs & long-range plans · watch public review and hydrology.",
  permitter: "Permit pipeline: draft → referral → approval · watch deficiencies and referrals.",
  recce: "Field access, layout, and crew calls · watch terrain, water, and morale.",
  silviculture: "Planting, brushing, and free-growing · watch stock quality and survival.",
};

function buildRolePreview(role) {
  return ROLE_PREVIEWS[role?.id] || role?.description || "";
}

function buildAreaPreview(area) {
  const topics = Array.isArray(area?.focusTopics) ? area.focusTopics.slice(0, 3) : [];
  if (topics.length) return topics.join(" · ");
  return area?.description || "";
}

function createViewState() {
  return {
    mode: "setup-name",
    inputText: "",
    contentData: INITIAL_CONTENT,
    options: [],
    selected: 0,
    art: null,
    animFrame: null,
    gameState: null,
  };
}

function buildOutcomeNotice(option, outcomeResult) {
  const riskResult = outcomeResult?.riskResult ?? null;
  const outcomeText = outcomeResult?.outcome ?? option?.outcome ?? "";
  const deltaText = formatMetricDelta(outcomeResult?.effects || {});
  const scheduledIssuePreview = outcomeResult?.scheduledIssueTeaser ?? null;
  const scheduledIssueText = scheduledIssuePreview?.text ?? "";
  const body = [outcomeText, deltaText ? `Effects: ${deltaText}` : "", scheduledIssueText]
    .filter(Boolean)
    .join("\n\n");

  if (riskResult) {
    const tone = riskResult.success ? "positive" : scheduledIssuePreview?.severity || "danger";
    return {
      heading: riskResult.success ? `Success: ${option.label}` : `Caught: ${option.label}`,
      body,
      tone,
    };
  }

  return {
    heading: `Decision Logged: ${option.label}`,
    body,
    tone: "info",
  };
}

// Turn a raw effects delta into a short tradeoff hint shown *before* the player
// commits. We surface the direction of the swing (which meters rise, which
// fall) without spoiling the magnitude or the narrative outcome — that lands
// after the choice in the result notice.
function summarizeEffects(effects) {
  if (!effects || typeof effects !== "object") return null;

  const gains = [];
  const costs = [];
  for (const [key, value] of Object.entries(effects)) {
    if (!value) continue;
    (value > 0 ? gains : costs).push(formatMetricName(key));
  }

  if (!gains.length && !costs.length) return null;

  const parts = [];
  if (gains.length) parts.push(`${gains.join(", ")} up`);
  if (costs.length) parts.push(`${costs.join(", ")} down`);
  return parts.join(" · ");
}

function presentOption(option) {
  return {
    label: option.label,
    // Authored hint wins; otherwise derive a neutral tradeoff from the effects.
    preview: option.preview ?? summarizeEffects(option.effects),
    // Kept for the post-choice result notice and danger-issue copy tests.
    outcome: option.outcome,
  };
}

function buildPresentedOptions(item, phaseType) {
  const options = Array.isArray(item?.options) ? item.options : [];
  if (phaseType === "issue" && item?.surfaceSeverity === "danger") {
    return options.map((option, index) => presentDangerIssueOption(item, option, index));
  }
  return options.map(presentOption);
}

function presentDangerIssueOption(item, option, index) {
  if (item?.id === "formal-investigation") {
    const crisisCopy = [
      {
        label: "Open the file now",
        outcome: "You hand over the record immediately and absorb the hit now to keep the case from turning into charges.",
      },
      {
        label: "Lawyer up and freeze comms",
        outcome: "Counsel slows the investigators, but the meter runs hard and the file stays fully live.",
      },
      {
        label: "Burn a subcontractor",
        outcome: "You try to redirect the blast radius, but the story frays fast and the investigation widens.",
      },
    ][index];

    if (crisisCopy) {
      return { ...crisisCopy, preview: summarizeEffects(option?.effects) };
    }
  }

  return {
    label: option?.label || `Option ${index + 1}`,
    preview: option?.preview ?? summarizeEffects(option?.effects),
    outcome: option?.outcome,
  };
}

function snapshotGameState(gs) {
  if (!gs) return null;

  return {
    ...gs,
    metrics: gs.metrics ? { ...gs.metrics } : gs.metrics,
    role: gs.role ? { ...gs.role } : gs.role,
    area: gs.area ? { ...gs.area } : gs.area,
    flags: gs.flags ? { ...gs.flags } : gs.flags,
    history: Array.isArray(gs.history) ? [...gs.history] : gs.history,
    pendingIssues: Array.isArray(gs.pendingIssues) ? [...gs.pendingIssues] : gs.pendingIssues,
    pendingEvents: Array.isArray(gs.pendingEvents) ? [...gs.pendingEvents] : gs.pendingEvents,
    issueHistory: Array.isArray(gs.issueHistory) ? [...gs.issueHistory] : gs.issueHistory,
    assignmentHistory: Array.isArray(gs.assignmentHistory) ? [...gs.assignmentHistory] : gs.assignmentHistory,
    assignmentSourceUsage: gs.assignmentSourceUsage ? { ...gs.assignmentSourceUsage } : gs.assignmentSourceUsage,
    currentSeasonContext: gs.currentSeasonContext ? { ...gs.currentSeasonContext } : gs.currentSeasonContext,
    seasonContexts: Array.isArray(gs.seasonContexts) ? [...gs.seasonContexts] : gs.seasonContexts,
    discoveryTags: Array.isArray(gs.discoveryTags) ? [...gs.discoveryTags] : gs.discoveryTags,
    timeline: Array.isArray(gs.timeline) ? [...gs.timeline] : gs.timeline,
    gameMode: gs.gameMode,
    modeLabel: gs.modeLabel,
    crisis: gs.crisis
      ? {
          ...gs.crisis,
          commandLog: Array.isArray(gs.crisis.commandLog) ? [...gs.crisis.commandLog] : gs.crisis.commandLog,
        }
      : null,
    roleDisplayName: gs.roleDisplayName || getRoleDisplayName(gs.role),
    // Metric swing from the most recent logged decision/consequence, so the
    // dashboard can show "↓ -4 last choice" arrows next to each meter.
    lastChoiceEffects: Array.isArray(gs.history) && gs.history.length
      ? { ...(gs.history[gs.history.length - 1].effects || {}) }
      : {},
    // Emerging strategy identity, read from the stances the player has chosen.
    managementStyle: computeManagementStyle(gs),
    // Completed-season strip: baseline entry is dropped, headline pulled from
    // that season's most impactful decision.
    seasonTimeline: Array.isArray(gs.timeline)
      ? gs.timeline
          .filter((entry) => entry && entry.round > 0)
          .map((entry) => ({ ...entry, metrics: { ...(entry.metrics || {}) } }))
      : [],
    // Standing role-area context for the Dashboard "Area" tab. It's a pure
    // function of role + area, so recompute it from the snapshot rather than
    // threading it through every season's state.
    areaBriefing: gs.role?.id && gs.area
      ? getRoleAreaBriefing(gs.role.id, gs.area, { maxFinds: 6 })
      : null,
  };
}

function cloneStateForPreview(gs) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(gs);
  }
  return JSON.parse(JSON.stringify(gs));
}

export class TuiGameController {
  constructor(options = {}) {
    this.listeners = new Set();
    this.state = createViewState();
    this.gs = null;
    this.queue = [];
    this.selectCb = null;
    this.onExit = options.onExit ?? (() => {});
    this.ambientArt = Boolean(options.ambientArt);
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setOnExit(onExit) {
    this.onExit = onExit ?? (() => {});
  }

  exitGame() {
    this.onExit();
  }

  restart() {
    this.gs = null;
    this.queue = [];
    this.selectCb = null;
    this.state = createViewState();
    this.emit();
  }

  setInputText(value) {
    if (this.state.mode !== "setup-name") return;
    this.setState({ inputText: value });
  }

  submitCurrent() {
    if (this.state.animFrame !== null) return;

    if (this.state.mode === "setup-name") {
      this.handleSetupNameKey({ name: "return" });
      return;
    }

    this.selectCb?.(this.state.selected);
  }

  selectOption(index) {
    if (index < 0 || index >= this.state.options.length) return;
    this.selectCb?.(index);
  }

  handleKey(key) {
    if (key.ctrl && key.name === "c") {
      this.onExit();
      return;
    }

    if (this.state.mode !== "setup-name" && key.name === "q") {
      this.onExit();
      return;
    }

    if (key.name === "escape") {
      this.onExit();
      return;
    }

    if (this.state.animFrame !== null) return;

    if (this.state.mode === "setup-name") {
      this.handleSetupNameKey(key);
      return;
    }

    this.handleOptionKey(key);
  }

  emit() {
    this.state = { ...this.state, gameState: snapshotGameState(this.gs) };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  setState(next) {
    // emit() refreshes the gameState snapshot — don't compute it twice per update.
    this.state = { ...this.state, ...next };
    this.emit();
  }

  present(data, opts, cb, artSeq = null) {
    this.selectCb = cb;
    this.setState({
      contentData: data,
      options: opts,
      selected: 0,
      art: artSeq,
      animFrame: null,
    });
  }

  startRound(notice = null) {
    const gs = this.gs;
    gs.round += 1;
    const season = SEASONS[gs.round - 1];
    const context = buildSeasonContext(gs);
    gs.currentSeasonContext = context;
    if (!Array.isArray(gs.seasonContexts)) {
      gs.seasonContexts = [];
    }
    gs.seasonContexts.push(context);

    const issuePreview = drawIssue(cloneStateForPreview(gs));
    const isCrisisRound = issuePreview?.surfaceSeverity === "danger";

    this.queue.push({
      type: "message",
      text: season,
      body: isCrisisRound
        ? "A critical matter overrides routine work. The season pivots into immediate response."
        : "A new season begins. Prepare your crew.",
    });

    if (isCrisisRound) {
      const issue = drawIssue(gs);
      if (issue) {
        this.queue.push({ type: "issue", data: issue });
      }
    } else {
      const assignment = drawSeasonalAssignment(gs, context);
      if (assignment) {
        recordAssignmentSelection(gs, assignment);
        this.queue.push({ type: "assignment", data: assignment });
      }

      const event = drawSeasonalEvent(gs);
      if (event) {
        this.queue.push({ type: "event", data: event });
      }

      const temptation = drawSeasonalTemptation(gs);
      if (temptation) {
        this.queue.push({ type: "temptation", data: temptation });
      }

      const issue = drawIssue(gs);
      if (issue) {
        this.queue.push({ type: "issue", data: issue });
      }
    }

    this.queue.push({
      type: "consequences",
      execute: (queuedNotice) => {
        const cons = applyRoundConsequences(gs);
        if (cons?.length) {
          const explained = describeConsequences(gs, cons);
          const body = explained
            .map((entry) => {
              const lines = [`• ${entry.title}`];
              if (entry.cause) lines.push(`  Why: ${entry.cause}`);
              if (entry.effectText) lines.push(`  This season: ${entry.effectText}`);
              return lines.join("\n");
            })
            .join("\n\n");
          this.queue.unshift({
            type: "message",
            text: "Why This Happened",
            body,
          });
        }
        this.recordSeasonTimeline();
        this.emit();
        this.processNext(queuedNotice);
      },
    });

    this.processNext(notice);
  }

  // Snapshot the season's closing metrics so the year-end review and the
  // persistent mini-timeline have a real per-season record. Without this the
  // engine's timeline never grew past its baseline entry in seasonal play.
  recordSeasonTimeline() {
    const gs = this.gs;
    if (!gs) return;
    if (!Array.isArray(gs.timeline)) gs.timeline = [];
    const season = SEASONS[gs.round - 1] || `Season ${gs.round}`;
    gs.timeline.push({
      round: gs.round,
      season,
      metrics: { ...gs.metrics },
      headline: buildSeasonHeadline(gs, gs.round),
    });
  }

  processNext(notice = null) {
    const gs = this.gs;

    if (gs?.gameMode === "crisis-command") {
      this.processCrisisNext(notice);
      return;
    }

    if (this.queue.length === 0) {
      if (gs && gs.round < gs.totalRounds) {
        this.startRound(notice);
      } else {
        const summary = buildSummary(gs);
        this.setState({ mode: "end" });
        this.present(
          {
            type: "summary",
            heading: "Year End Review",
            body: summary.overall,
            roleLens: summary.roleLens,
            style: summary.style,
            bullets: summary.messages,
            highlights: summary.highlights,
            seasonSummaries: summary.legacy?.seasonSummaries,
            trendLines: summary.legacy?.trendLines,
            projection: summary.projection,
            achievements: summary.achievements,
            notice,
          },
          ["Play Again", "Quit"],
          (idx) => {
            if (idx === 0) {
              this.restart();
            } else {
              this.onExit();
            }
          },
        );
      }
      return;
    }

    const phase = this.queue.shift();
    const phaseText =
      phase.text ??
      (phase.data ? `${phase.data.title} ${phase.data.description ?? phase.data.prompt ?? ""}` : "");
    const artText = this.ambientArt ? detectArt(phaseText, gs) : null;

    if (phase.type === "message") {
      this.present(
        {
          type: "message",
          heading: phase.text,
          body: phase.body ?? "",
          notice,
        },
        ["Continue"],
        () => this.processNext(),
        artText,
      );
      return;
    }

    if (
      phase.type === "assignment"
      || phase.type === "task"
      || phase.type === "issue"
      || phase.type === "event"
      || phase.type === "temptation"
    ) {
      const item = phase.data;
      const isCrisisIssue = phase.type === "issue" && item.surfaceSeverity === "danger";
      const presentedOptions = buildPresentedOptions(item, phase.type);
      this.present(
        {
          type: phase.type,
          title: item.title,
          description: item.description ?? item.prompt ?? "",
          cardLabel: item.cardLabel,
          context: item.context,
          decisionPrompt: item.decisionPrompt,
          flavor: item.flavor,
          sourceLabel: item.sourceLabel,
          whyNow: item.whyNow,
          surfaceReason: item.surfaceReason,
          surfaceSeverity: item.surfaceSeverity,
          optionHeading: isCrisisIssue ? "Choose your response" : "Choose your response",
          optionTone: isCrisisIssue ? "danger" : undefined,
          notice,
          optionDetails: presentedOptions,
        },
        presentedOptions.map((option) => option.label),
        (idx) => {
          const option = item.options[idx];
          const outcomeResult = applyOptionOutcome(gs, option, {
            type: phase.type,
            id: item.id,
            title: item.title,
            option: option.label,
            round: gs.round,
            stance: option.stance,
          });

          this.emit();

          this.processNext(buildOutcomeNotice(option, outcomeResult));
        },
        artText,
      );
      return;
    }

    if (phase.type === "consequences") {
      phase.execute(notice);
    }
  }

  processCrisisNext(notice = null) {
    const gs = this.gs;

    if (!gs) return;

    if (this.queue.length === 0) {
      if (gs.round < gs.totalRounds) {
        gs.round += 1;
        this.queue.push({
          type: "crisis-scenario",
          data: getNextCrisisScenario(gs),
        });
      } else {
        this.setState({ mode: "end" });
        this.present(
          buildCrisisSummary(gs),
          ["Play Again", "Quit"],
          (idx) => {
            if (idx === 0) {
              this.restart();
            } else {
              this.onExit();
            }
          },
        );
        return;
      }
    }

    const phase = this.queue.shift();
    if (phase.type !== "crisis-scenario" || !phase.data) {
      this.processCrisisNext(notice);
      return;
    }

    const scenario = phase.data;
    const artText = this.ambientArt ? detectArt(`${scenario.title} ${scenario.description}`, gs) : null;
    const card = buildCrisisCard(gs, scenario, notice);

    this.present(
      card,
      scenario.options.map((option) => option.label),
      (idx) => {
        const option = scenario.options[idx];
        const outcomeResult = applyCrisisOption(gs, scenario, option);
        this.emit();
        this.processCrisisNext(buildCrisisOutcomeNotice(option, outcomeResult));
      },
      artText,
    );
  }

  handleSetupNameKey(key) {
    if (key.name === "return") {
      const company = this.state.inputText.trim() || "Forest Co-op";
      this.setState({ mode: "setup-role" });
      const playableRoles = getSeasonalPlayableRoles(FORESTER_ROLES);
      this.present(
        {
          type: "setup",
          heading: "Select your Specialization",
          subtitle: "Choose the work stream you will be judged on this year.",
          optionDetails: [
            ...playableRoles.map((role) => ({
              label: getRoleDisplayName(role),
              preview: buildRolePreview(role),
            })),
            { label: CRISIS_COMMAND_LABEL, preview: "Incident command mode · live pine-beetle scenario." },
          ],
        },
        [
          ...playableRoles.map((role) => getRoleDisplayName(role)),
          CRISIS_COMMAND_LABEL,
        ],
        (idx) => {
          const seasonalRoles = getSeasonalPlayableRoles(FORESTER_ROLES);
          if (idx >= seasonalRoles.length) {
            this.gs = createCrisisCommandState(company);
            this.queue = [];
            this.setState({ mode: "playing" });
            this.processCrisisNext({
              heading: "Incident Command Online",
              body: "BC Forestry Simulator mode loaded. The Williams Lake pine beetle scenario is live.",
              tone: "warning",
            });
            return;
          }
          const roleId = seasonalRoles[idx].id;
          this.setState({ mode: "setup-area" });
          this.present(
            {
              type: "setup",
              heading: "Select your Operating Area",
              subtitle: "Choose the BC region where this year's file and field work will unfold.",
              optionDetails: OPERATING_AREAS.map((area) => ({
                label: area.name,
                preview: buildAreaPreview(area),
              })),
            },
            OPERATING_AREAS.map((area) => area.name),
            (areaIdx) => {
              const areaId = OPERATING_AREAS[areaIdx].id;
              this.gs = createInitialState({
                companyName: company,
                roleId,
                areaId,
              });
              this.queue = [];
              this.setState({ mode: "playing" });
              this.startRound();
            },
          );
        },
      );
      return;
    }

    if (key.name === "backspace") {
      this.setState({ inputText: this.state.inputText.slice(0, -1) });
      return;
    }

    if (key.sequence?.length === 1 && !key.ctrl && !key.meta) {
      this.setState({ inputText: this.state.inputText + key.sequence });
    }
  }

  handleOptionKey(key) {
    if (key.name === "up" || key.name === "k") {
      this.setState({ selected: Math.max(0, this.state.selected - 1) });
      return;
    }

    if (key.name === "down" || key.name === "j") {
      this.setState({
        selected: Math.min(this.state.options.length - 1, this.state.selected + 1),
      });
      return;
    }

    if (key.name === "return") {
      this.selectCb?.(this.state.selected);
      return;
    }

    if (key.sequence && /^[1-9]$/.test(key.sequence)) {
      const num = parseInt(key.sequence, 10) - 1;
      if (num < this.state.options.length) {
        this.selectCb?.(num);
      }
    }
  }
}
