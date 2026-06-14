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
  buildObjectiveStrip,
  computeManagementStyle,
  describeConsequences,
  describeCardCause,
  ensureProfessionalComplianceState,
  getRoleObjective,
  makeRng,
  isForkableRng,
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

// Autosave: a seasonal run is short, but it can still be interrupted (a closed
// tab, a phone call mid-commute). We snapshot at every season boundary so the
// player can pick the year back up from the start of the current season.
const SAVE_VERSION = 1;
const DEFAULT_SAVE_KEY = "bc-forestry-trail/seasonal-run/v1";

// Resolve a Web Storage target without assuming the browser exists (sims and
// node tests run with no localStorage), mirroring the existing js/game pattern.
function resolveStorage(storage) {
  if (storage === null) return null;
  if (storage) return storage;
  try {
    return typeof globalThis !== "undefined" && globalThis.localStorage ? globalThis.localStorage : null;
  } catch {
    // Some embeddings throw on localStorage access (privacy mode, sandboxed
    // iframes); treat that as "no persistence" rather than crashing the game.
    return null;
  }
}

// Short "what am I signing up for" lines shown under each setup choice so the
// role and area pick feels strategic instead of cosmetic.
const ROLE_PREVIEWS = {
  planner: "Landscape trade-offs & long-range plans · watch public review and hydrology.",
  permitter: "Permit pipeline: draft → referral → approval · watch deficiencies and referrals.",
  recce: "Field access, layout, and crew calls · watch terrain, water, and morale.",
  silviculture: "Planting, brushing, and free-growing · watch stock quality and survival.",
};

function buildRolePreview(role) {
  const base = ROLE_PREVIEWS[role?.id] || role?.description || "";
  // Surface the role's win condition at setup so the first pick is about a
  // mandate, not just flavor.
  const objective = getRoleObjective(role?.id);
  return objective?.signatureWin ? `${base}\nWin: ${objective.signatureWin}.` : base;
}

function buildAreaPreview(area) {
  const topics = Array.isArray(area?.focusTopics) ? area.focusTopics.slice(0, 3) : [];
  if (topics.length) return topics.join(" · ");
  return area?.description || "";
}

// Normalize the controller's RNG option: pass through an existing rng function,
// seed a fresh one from a number, or fall back to live Math.random.
function createSessionRng(rngOrSeed) {
  if (typeof rngOrSeed === "function") return rngOrSeed;
  // Default: look Math.random up *per call* so test/e2e harnesses that override
  // the global still take effect (capturing the reference would freeze it).
  if (rngOrSeed === undefined || rngOrSeed === null) return () => Math.random();
  return makeRng(rngOrSeed);
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

// Structured record of the player's most recent choice, surfaced as a persistent
// "Last Decision" panel so the result of a call stays visible into the next card
// instead of scrolling away with the transient outcome notice.
function buildLastDecision(option, outcomeResult) {
  if (!option) return null;
  const riskResult = outcomeResult?.riskResult ?? null;
  const effects = outcomeResult?.effects || {};
  return {
    label: option.label,
    outcome: outcomeResult?.outcome ?? option.outcome ?? "",
    effects: { ...effects },
    effectText: formatMetricDelta(effects),
    // null for a plain decision; true/false for a gamble that resolved.
    success: riskResult ? Boolean(riskResult.success) : null,
  };
}

// One-screen onboarding shown the very first time the player opens a season, so
// they know what they're steering before the first decision lands. Pulled from
// the role objective system so the "win" line matches the dashboard mandate.
function buildMissionBriefing(gs) {
  const objective = gs?.role?.id ? getRoleObjective(gs.role.id) : null;
  return {
    goal: "Finish the year with strong Progress, Forest Health, Relationships, Compliance, and Budget.",
    steps: [
      "Each card, pick one response. Some calls help now but cost you later.",
      "Read the five meters and the SAFE / TRADEOFF / RISKY tag on every option.",
      "Choices echo: delayed fallout returns later under “Why This Happened.”",
    ],
    mandate: objective?.mandate || null,
    win: objective?.signatureWin || null,
  };
}

// One scannable line the player reads before the four-question body: the season
// plus what's actually at stake right now. Keeps the first read fast even when
// the card's full context runs long.
function buildCardHeadline(gs, item) {
  const season = SEASONS[(gs?.round || 1) - 1] || "";
  const seasonShort = season ? String(season).split(" ")[0] : "";
  const why = item?.context?.stakes || item?.whyNow || item?.surfaceReason || "";
  const trimmed = why ? String(why).replace(/\s+/g, " ").trim() : "";
  const tail = trimmed
    ? (trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed)
    : (item?.title || "A call needs making");
  return seasonShort ? `${seasonShort}: ${tail}` : tail;
}

// Running cause/effect feed for the dashboard: the last few choices *and* the
// fallout they triggered, newest first, so the world visibly responds to the
// player instead of feeling random. Built from the engine's decision history,
// which already stamps each entry with its applied metric effects.
function buildDecisionTrail(gs, limit = 5) {
  const history = Array.isArray(gs?.history) ? gs.history : [];
  const entries = history
    .filter((entry) => entry && (entry.option || entry.title))
    .map((entry) => ({
      round: typeof entry.round === "number" ? entry.round : null,
      kind: entry.type === "consequence" ? "fallout" : "choice",
      title: entry.title || "",
      option: entry.option || "",
      effectText: formatMetricDelta(entry.effects || {}),
    }));
  return entries.slice(-limit).reverse();
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

// Classify an option's downside into one readable risk band — SAFE / TRADEOFF /
// RISKY — so the player can size up a choice before committing. We grade on the
// *shape* of the downside (how deep the worst hit is, whether compliance takes a
// dive, whether the option is an explicit gamble), never on the magnitude of the
// upside, so the tag hints at exposure without spoiling the outcome.
function deriveRiskLevel(option, { danger = false } = {}) {
  // An explicit gamble (success/failure roll) or a danger-issue response is
  // always the high band — its downside is by definition uncertain or severe.
  if (option?.risk || danger) return "high";

  const effects = option?.effects;
  if (!effects || typeof effects !== "object") return "low";

  const negatives = Object.entries(effects)
    .map(([key, value]) => [key, Number(value)])
    .filter(([, value]) => Number.isFinite(value) && value < 0);

  if (!negatives.length) return "low";

  const worst = Math.min(...negatives.map(([, value]) => value));
  const totalDown = negatives.reduce((sum, [, value]) => sum + value, 0);
  const complianceDrop = Number(effects.compliance) < 0 ? Number(effects.compliance) : 0;

  // A steep single hit, a compliance dive, or broad across-the-board costs read
  // as RISKY; a contained, single-meter cost reads as a TRADEOFF.
  if (worst <= -6 || complianceDrop <= -4 || totalDown <= -8) return "high";
  return "medium";
}

function presentOption(option) {
  return {
    label: option.label,
    // Authored hint wins; otherwise derive a neutral tradeoff from the effects.
    preview: option.preview ?? summarizeEffects(option.effects),
    // Kept for the post-choice result notice and danger-issue copy tests.
    outcome: option.outcome,
    // Surfaced for headless strategy policies (sims/tests). The browser UI
    // ignores these; only the preview/label are rendered.
    stance: option.stance,
    effects: option.effects,
    risk: option.risk ? true : undefined,
    // Pre-commitment risk band rendered as a SAFE/TRADEOFF/RISKY tag.
    riskLevel: deriveRiskLevel(option),
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
      return {
        ...crisisCopy,
        preview: summarizeEffects(option?.effects),
        riskLevel: deriveRiskLevel(option, { danger: true }),
      };
    }
  }

  return {
    label: option?.label || `Option ${index + 1}`,
    preview: option?.preview ?? summarizeEffects(option?.effects),
    outcome: option?.outcome,
    riskLevel: deriveRiskLevel(option, { danger: true }),
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
    // Standing role mandate + signature win, shown on the dashboard so the
    // player always knows what they're judged on.
    roleObjective: gs.role?.id ? getRoleObjective(gs.role.id) : null,
    // Live "what am I trying to do right now" strip: mandate + at-risk meters +
    // the single most pressing pressure, recomputed from current metrics.
    objectiveStrip: gs.role?.id ? buildObjectiveStrip(gs) : null,
    // The player's most recent choice + its effects, for the Last Decision panel.
    lastDecision: gs.lastDecision ?? null,
    // Persistent choice → fallout feed for the dashboard, so consequences stay
    // visible across cards instead of scrolling away with the outcome notice.
    decisionTrail: buildDecisionTrail(gs),
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
    // Optional seeded RNG. When omitted we keep the browser's live-random
    // behavior; when provided (sims, deterministic tests) the whole seasonal
    // year becomes reproducible. createSessionRng accepts an rng, a numeric
    // seed, or nothing.
    this.rng = createSessionRng(options.rng ?? options.seed);
    this.storage = resolveStorage(options.storage);
    this.saveKey = options.saveKey ?? DEFAULT_SAVE_KEY;
    // If a previous seasonal run is parked in storage, open on a resume prompt
    // instead of the welcome screen.
    this.maybeOfferResume();
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
    this.requestExit();
  }

  // Quitting mid-run is one keystroke away in a keyboard-driven UI, so guard it
  // with a confirm overlay. Setup screens and the finished-year summary have
  // nothing live to lose, so they exit immediately.
  requestExit() {
    if (this.state.mode === "confirm-exit") return;
    const hasLiveRun = this.gs && this.state.mode === "playing";
    if (!hasLiveRun) {
      this.onExit();
      return;
    }

    this.savedView = {
      mode: this.state.mode,
      contentData: this.state.contentData,
      options: this.state.options,
      selected: this.state.selected,
      art: this.state.art,
      selectCb: this.selectCb,
    };

    this.present(
      {
        type: "confirm",
        heading: "Return to the main menu?",
        body: "Your seasonal run is autosaved — you can resume it later from the menu.",
      },
      ["Continue run", "Main menu"],
      (idx) => {
        if (idx === 0) {
          this.resumeFromExit();
        } else {
          this.onExit();
        }
      },
    );
    this.setState({ mode: "confirm-exit" });
  }

  resumeFromExit() {
    const saved = this.savedView;
    this.savedView = null;
    if (!saved) {
      this.onExit();
      return;
    }
    this.selectCb = saved.selectCb;
    this.setState({
      mode: saved.mode,
      contentData: saved.contentData,
      options: saved.options,
      selected: saved.selected,
      art: saved.art,
    });
  }

  restart() {
    // Play Again / new run abandons any parked autosave.
    this.clearSeasonalSave();
    this.gs = null;
    this.queue = [];
    this.selectCb = null;
    this.state = createViewState();
    this.emit();
  }

  // ── Autosave / resume ──────────────────────────────────────────────────────
  // Snapshot the run at a season boundary. We capture the RNG state alongside
  // the game state so the resumed season redraws exactly the cards the original
  // run would have, keeping seeded play and bug reports reproducible.
  persistSeasonalSave() {
    if (!this.storage || !this.gs) return;
    if (this.gs.gameMode === "crisis-command") return;
    const gs = this.gs;
    const rngState = typeof this.rng?.state === "function" ? this.rng.state() : null;
    if (rngState === null) return; // a live Math.random run can't be replayed.
    const payload = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      gameMode: gs.gameMode || "seasonal",
      companyName: gs.companyName,
      roleId: gs.role?.id || null,
      areaId: gs.area?.id || null,
      roleName: getRoleDisplayName(gs.role),
      areaName: gs.area?.name || null,
      // gs.round is the count of completed seasons at the snapshot point.
      round: Number(gs.round || 0),
      rngState,
      state: gs,
    };
    try {
      this.storage.setItem(this.saveKey, JSON.stringify(payload));
    } catch {
      // Quota or serialization failure: degrade to no autosave rather than
      // interrupting the run.
    }
  }

  loadSeasonalSave() {
    if (!this.storage) return null;
    let raw;
    try {
      raw = this.storage.getItem(this.saveKey);
    } catch {
      return null;
    }
    if (!raw) return null;
    let save;
    try {
      save = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!save || save.version !== SAVE_VERSION || !save.state?.role || !save.state?.metrics) {
      return null;
    }
    // A finished (or over-run) save has nothing left to resume.
    const total = Number(save.state.totalRounds || SEASONS.length);
    if (Number(save.round) >= total) return null;
    return save;
  }

  clearSeasonalSave() {
    if (!this.storage) return;
    try {
      this.storage.removeItem(this.saveKey);
    } catch {
      // ignore
    }
  }

  hasSavedRun() {
    return Boolean(this.loadSeasonalSave());
  }

  maybeOfferResume() {
    const save = this.loadSeasonalSave();
    if (!save) return;
    const nextSeason = SEASONS[Number(save.round)] || `Season ${Number(save.round) + 1}`;
    const where = [save.roleName, save.areaName].filter(Boolean).join(" · ");
    this.present(
      {
        type: "resume",
        heading: "Resume your seasonal run?",
        body: `A saved run is waiting${where ? ` (${where})` : ""}, paused before ${nextSeason}.`,
      },
      ["Resume seasonal run", "Start a new run"],
      (idx) => {
        if (idx === 0) {
          this.resumeSavedRun();
        } else {
          this.clearSeasonalSave();
          this.restart();
        }
      },
    );
    this.setState({ mode: "resume" });
  }

  resumeSavedRun() {
    const save = this.loadSeasonalSave();
    if (!save) {
      this.restart();
      return;
    }
    this.gs = save.state;
    // Rehydrate derived professional-compliance shape (chains, clamps) that the
    // engine expects but that JSON round-tripping can leave thin.
    ensureProfessionalComplianceState(this.gs);
    this.rng = makeRng(save.rngState);
    this.queue = [];
    this.selectCb = null;
    this.setState({ mode: "playing" });
    // startRound() re-increments and redraws the parked season from the restored
    // RNG state, so the player lands exactly where they left off.
    this.startRound();
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

    // While the confirm overlay is up, Escape cancels (keep playing); the rest
    // of the keys drive its two options like any other card.
    if (this.state.mode === "confirm-exit") {
      if (key.name === "escape") {
        this.resumeFromExit();
        return;
      }
      this.handleOptionKey(key);
      return;
    }

    if (this.state.mode !== "setup-name" && key.name === "q") {
      this.requestExit();
      return;
    }

    if (key.name === "escape") {
      this.requestExit();
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
    // Autosave at the season boundary, before any of this season's cards are
    // drawn, capturing the RNG state so a resume redraws this exact season.
    this.persistSeasonalSave();
    gs.round += 1;
    const season = SEASONS[gs.round - 1];
    const context = buildSeasonContext(gs);
    gs.currentSeasonContext = context;
    if (!Array.isArray(gs.seasonContexts)) {
      gs.seasonContexts = [];
    }
    gs.seasonContexts.push(context);

    // Peek at the upcoming issue on a forked RNG so crisis detection doesn't
    // consume from the main stream (and so the real draw reproduces the peek on
    // a crisis round).
    const previewRng = isForkableRng(this.rng) ? this.rng.fork() : this.rng;
    const issuePreview = drawIssue(cloneStateForPreview(gs), previewRng);
    const isCrisisRound = issuePreview?.surfaceSeverity === "danger";

    this.queue.push({
      type: "message",
      text: season,
      body: isCrisisRound
        ? "A critical matter overrides routine work. The season pivots into immediate response."
        : "A new season begins. Prepare your crew.",
      // First non-crisis season doubles as onboarding: ride along with the
      // existing opening card (no extra step) so the player gets a one-screen
      // briefing before the year's first real decision.
      mission: !isCrisisRound && gs.round === 1 ? buildMissionBriefing(gs) : undefined,
    });

    if (isCrisisRound) {
      const issue = drawIssue(gs, this.rng);
      if (issue) {
        this.queue.push({ type: "issue", data: issue });
      }
    } else {
      const assignment = drawSeasonalAssignment(gs, context);
      if (assignment) {
        recordAssignmentSelection(gs, assignment);
        this.queue.push({ type: "assignment", data: assignment });
      }

      const event = drawSeasonalEvent(gs, this.rng);
      if (event) {
        this.queue.push({ type: "event", data: event });
      }

      const temptation = drawSeasonalTemptation(gs, this.rng);
      if (temptation) {
        this.queue.push({ type: "temptation", data: temptation });
      }

      const issue = drawIssue(gs, this.rng);
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
        // Year complete: the parked save is now stale, so clear it.
        this.clearSeasonalSave();
        const summary = buildSummary(gs);
        this.setState({ mode: "end" });
        this.present(
          {
            type: "summary",
            heading: "Year End Review",
            body: summary.overall,
            tier: summary.tier,
            score: summary.score,
            scoreReasons: summary.scoreDetail?.reasons,
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
          mission: phase.mission,
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
          headline: buildCardHeadline(gs, item),
          description: item.description ?? item.prompt ?? "",
          cardLabel: item.cardLabel,
          context: item.context,
          decisionPrompt: item.decisionPrompt,
          flavor: item.flavor,
          sourceLabel: item.sourceLabel,
          whyNow: item.whyNow,
          surfaceReason: item.surfaceReason,
          surfaceSeverity: item.surfaceSeverity,
          provenance: describeCardCause(item),
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
          }, this.rng);

          gs.lastDecision = buildLastDecision(option, outcomeResult);
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
