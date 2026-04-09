import { FORESTER_ROLES, OPERATING_AREAS } from "../js/data/index.js";
import {
  createInitialState,
  getRoleTasks,
  applyOptionOutcome,
  applyRoundConsequences,
  drawIssue,
  buildSummary,
  SEASONS,
} from "../js/engine.js";
import { detectArt } from "./art.js";

const INITIAL_CONTENT = {
  type: "setup",
  heading: "Welcome to BC Forestry Trail",
};

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
    issueHistory: Array.isArray(gs.issueHistory) ? [...gs.issueHistory] : gs.issueHistory,
    timeline: Array.isArray(gs.timeline) ? [...gs.timeline] : gs.timeline,
  };
}

export class TuiGameController {
  constructor(options = {}) {
    this.listeners = new Set();
    this.state = createViewState();
    this.gs = null;
    this.queue = [];
    this.selectCb = null;
    this.onExit = options.onExit ?? (() => {});
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

  restart() {
    this.gs = null;
    this.queue = [];
    this.selectCb = null;
    this.state = createViewState();
    this.emit();
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
    this.state = { ...this.state, ...next, gameState: snapshotGameState(this.gs) };
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

  startRound() {
    const gs = this.gs;
    gs.round += 1;
    const season = SEASONS[gs.round - 1];

    this.queue.push({
      type: "message",
      text: season,
      body: "A new season begins. Prepare your crew.",
    });

    for (const task of getRoleTasks(gs)) {
      this.queue.push({ type: "task", data: task });
    }

    const issue = drawIssue(gs);
    if (issue) {
      this.queue.push({ type: "issue", data: issue });
    }

    this.queue.push({
      type: "consequences",
      execute: () => {
        const cons = applyRoundConsequences(gs);
        if (cons?.length) {
          this.queue.unshift({
            type: "message",
            text: "End of Season Consequences",
            body: cons.map((entry) => `- ${entry}`).join("\n"),
          });
        }
        this.emit();
        this.processNext();
      },
    });

    this.processNext();
  }

  processNext() {
    const gs = this.gs;

    if (this.queue.length === 0) {
      if (gs && gs.round < gs.totalRounds) {
        this.startRound();
      } else {
        const summary = buildSummary(gs);
        this.setState({ mode: "end" });
        this.present(
          {
            type: "summary",
            heading: "Year End Review",
            body: summary.overall,
            bullets: summary.messages,
            achievements: summary.achievements,
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
    const artText = detectArt(phaseText, gs);

    if (phase.type === "message") {
      this.present(
        {
          type: "message",
          heading: phase.text,
          body: phase.body ?? "",
        },
        ["Continue"],
        () => this.processNext(),
        artText,
      );
      return;
    }

    if (phase.type === "task" || phase.type === "issue") {
      const item = phase.data;
      this.present(
        {
          type: phase.type,
          title: item.title,
          description: item.description ?? item.prompt ?? "",
          flavor: phase.type === "issue" ? item.flavor : undefined,
          optionDetails: item.options.map((option) => ({
            label: option.label,
            outcome: option.outcome,
          })),
        },
        item.options.map((option) => option.label),
        (idx) => {
          const option = item.options[idx];
          const outcomeResult = applyOptionOutcome(gs, option, {
            type: phase.type,
            id: item.id,
            title: item.title,
            option: option.label,
            round: gs.round,
          });

          this.emit();

          const riskResult = outcomeResult?.riskResult ?? null;
          const outcomeText = outcomeResult?.outcome ?? option.outcome ?? "";
          const heading = riskResult
            ? `${riskResult.success ? "\u2705 Success: " : "\u274c Caught: "}${option.label}`
            : `Outcome: ${option.label}`;

          this.queue.unshift({
            type: "message",
            text: heading,
            body: `${outcomeText}\n\nEffects applied.`,
          });
          this.processNext();
        },
        artText,
      );
      return;
    }

    if (phase.type === "consequences") {
      phase.execute();
    }
  }

  handleSetupNameKey(key) {
    if (key.name === "return") {
      const company = this.state.inputText.trim() || "Forest Co-op";
      this.setState({ mode: "setup-role" });
      this.present(
        {
          type: "setup",
          heading: "Select your Specialization",
          subtitle: "Different roles face different challenges.",
        },
        FORESTER_ROLES.map((role) => role.name),
        (idx) => {
          const roleId = FORESTER_ROLES[idx].id;
          this.setState({ mode: "setup-area" });
          this.present(
            {
              type: "setup",
              heading: "Select your Operating Area",
              subtitle: "Choose the environment for your operations.",
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
