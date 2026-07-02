import {
  BUDGET_ATTRITION_THRESHOLD,
  COMPLIANCE_AUDIT_THRESHOLD,
  RELATIONSHIP_TRUST_THRESHOLD,
} from "./constants.js";
import { formatMetricName } from "./shared.js";
import { getRoleDisplayName } from "./seasonalContract.js";
import { getRoleObjective } from "./roleObjectives.js";

// ── Cause-and-effect for end-of-season consequences ──────────────────────────
// applyRoundConsequences() returns bare ids (and tests depend on that), so the
// human-readable "why this happened" copy lives here and is reattached to the
// effects the engine actually logged this round.
const CONSEQUENCE_INFO = {
  "contractor-attrition": {
    title: "Contractor attrition",
    cause: `Budget stayed under ${BUDGET_ATTRITION_THRESHOLD}% for two seasons running, so crews and partners started pulling back.`,
  },
  "trust-deficit": {
    title: "Trust deficit active",
    cause: `Relationships sat below ${RELATIONSHIP_TRUST_THRESHOLD}%, so approvals slowed and recovery gains are now blunted.`,
  },
  "audit-escalation": {
    title: "Audit escalation",
    cause: `Compliance stayed under ${COMPLIANCE_AUDIT_THRESHOLD}% for two seasons running, drawing closer review and stoppage delays.`,
  },
  "registration-lapse": {
    title: "Registration lapse",
    cause: "Your professional registration is not active, so practice has to pause until renewal clears.",
  },
  "paperwork-burn": {
    title: "Paperwork overload",
    cause: "Active paperwork load climbed past a safe level and started crowding out real forestry work.",
  },
  "professional-audit": {
    title: "Professional audit risk",
    cause: "Thin records pushed audit exposure high enough to draw formal review.",
  },
  "operational-dividend": {
    title: "Operational dividend",
    cause: "Strong compliance and relationships meant less rework and firefighting, freeing up budget.",
  },
  "comeback-window": {
    title: "Comeback window",
    cause: "The file was still salvageable, so targeted effort steadied your weakest meter.",
  },
  "field-discipline-rebound": {
    title: "Field-discipline rebound",
    cause: "The crew was still delivering, so pausing to clean up documentation clawed back some compliance.",
  },
};

function formatEffectText(effects = {}) {
  const pieces = Object.entries(effects)
    .filter(([, value]) => value !== undefined && Number(value) !== 0)
    .map(([key, value]) => `${formatMetricName(key)} ${Number(value) > 0 ? "+" : ""}${value}`);
  return pieces.join(", ");
}

/**
 * Pair each triggered consequence id with the cause copy and the metric hit the
 * engine actually applied this round, so the UI can show a "why this happened"
 * timeline instead of a list of opaque ids.
 */
export function describeConsequences(state, ids = []) {
  const round = Number(state?.round || 0);
  const history = Array.isArray(state?.history) ? state.history : [];

  return ids.map((id) => {
    const info = CONSEQUENCE_INFO[id] || { title: id, cause: "" };
    const entry = [...history]
      .reverse()
      .find(
        (item) =>
          (item?.type === "consequence" || item?.type === "recovery")
          && item?.id === id
          && Number(item?.round) === round,
      );
    return {
      id,
      title: info.title,
      cause: info.cause,
      effectText: formatEffectText(entry?.effects || {}),
    };
  });
}

// ── Provenance: which past decision caused this delayed issue/event ──────────
/**
 * Turn a scheduled card's `causedBy` stamp into a one-line "this came from your
 * Fall decision" connection. Returns "" when the card surfaced for other
 * reasons (area context, low metric, random operational noise).
 */
export function describeCardCause(card) {
  const causedBy = card?.causedBy;
  if (!causedBy) return "";
  const season = causedBy.season ? `${causedBy.season} ` : "";
  const option = causedBy.option ? `“${causedBy.option}”` : "an earlier call";
  return `Connected to your ${season}decision: ${option}.`;
}

// Named per the roadmap; both delayed issues and delayed events carry the same
// causedBy shape, so they share one formatter.
export const describePendingIssueCause = describeCardCause;
export const describeEventCause = describeCardCause;

// ── Management style (strategy identity) ─────────────────────────────────────
const STYLE_INFO = {
  cautious: {
    label: "Cautious Steward",
    tendency: "Compliance-first, low-risk, slower delivery.",
  },
  balanced: {
    label: "Balanced Operator",
    tendency: "Professional judgment, measured trade-offs.",
  },
  aggressive: {
    label: "Production Driver",
    tendency: "Progress-first, accepts downstream risk.",
  },
};

const NEUTRAL_STYLE = {
  dominant: null,
  label: "Finding your footing",
  tendency: "Not enough signature calls yet to read a style.",
  counts: { cautious: 0, balanced: 0, aggressive: 0 },
  total: 0,
};

/**
 * Read the player's emerging management style from the stances they chose on
 * seasonal assignment cards. Only assignment options carry a stance, so this is
 * a clean signal of intent rather than a re-derivation from metric swings.
 */
export function computeManagementStyle(state) {
  const history = Array.isArray(state?.history) ? state.history : [];
  const counts = { cautious: 0, balanced: 0, aggressive: 0 };
  let total = 0;
  for (const entry of history) {
    if (entry?.stance && counts[entry.stance] !== undefined) {
      counts[entry.stance] += 1;
      total += 1;
    }
  }

  if (total === 0) {
    return { ...NEUTRAL_STYLE, counts, total };
  }

  let dominant = "balanced";
  let best = -1;
  let tied = false;
  for (const stance of ["cautious", "balanced", "aggressive"]) {
    if (counts[stance] > best) {
      best = counts[stance];
      dominant = stance;
      tied = false;
    } else if (counts[stance] === best) {
      tied = true;
    }
  }

  if (tied) {
    return {
      dominant: "balanced",
      label: "Adaptive Operator",
      tendency: "Switches stance to fit the situation rather than running one playbook.",
      counts,
      total,
    };
  }

  const info = STYLE_INFO[dominant];
  return { dominant, label: info.label, tendency: info.tendency, counts, total };
}

// ── Season headline (for the persistent timeline strip) ──────────────────────
function decisionMagnitude(effects = {}) {
  return Object.values(effects).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0);
}

/**
 * The single decision that most defined a given season — used to label the
 * mini-timeline so players can remember the story of the year.
 */
export function buildSeasonHeadline(state, round) {
  const history = Array.isArray(state?.history) ? state.history : [];
  const decisions = history.filter(
    (entry) => Number(entry?.round) === Number(round) && entry?.type !== "consequence" && entry?.option,
  );
  if (!decisions.length) return "";
  const top = decisions
    .map((entry) => ({ entry, magnitude: decisionMagnitude(entry.effects) }))
    .sort((a, b) => b.magnitude - a.magnitude)[0];
  return top?.entry?.title || top?.entry?.option || "";
}

// ── Role-specific ending lens ────────────────────────────────────────────────
const ROLE_LENS = {
  planner: {
    question: "Was the plan defensible?",
    metric: "compliance",
    strong: "The annual plan held up — assumptions were traceable and the package could survive review.",
    weak: "The plan got thin where it mattered; reviewers would have pulled it apart.",
  },
  permitter: {
    question: "Did the files survive review?",
    metric: "compliance",
    strong: "Submissions came back clean — the record was accurate and traceable.",
    weak: "Too many files came back with deficiencies; the pipeline never settled.",
  },
  recce: {
    question: "Did field intel improve the decisions upstream?",
    metric: "relationships",
    strong: "Your ground truth gave planners and permitters notes they could actually defend.",
    weak: "Field signals got lost or worked around, so upstream calls stayed shaky.",
  },
  silviculture: {
    question: "Did stand conditions actually improve?",
    metric: "forestHealth",
    strong: "Establishment and tending held — the blocks are trending toward free-growing.",
    weak: "Stand condition slipped; next year inherits the fill planting and brushing debt.",
  },
};

// ── Live objective strip ("what am I trying to do right now") ────────────────
// Each metric has a "stable / watch / at risk" reading anchored to the same
// thresholds the consequence engine uses, so the strip the player sees lines up
// with the punishment the engine will actually hand out.
// Warning bands sit just below the neutral 50 baseline so a fresh run reads
// "all stable" and the strip only speaks up once a meter genuinely sags toward
// its consequence threshold.
const METRIC_STATUS_BANDS = {
  compliance: { danger: COMPLIANCE_AUDIT_THRESHOLD, warning: COMPLIANCE_AUDIT_THRESHOLD + 8 },
  relationships: { danger: RELATIONSHIP_TRUST_THRESHOLD, warning: RELATIONSHIP_TRUST_THRESHOLD + 10 },
  budget: { danger: BUDGET_ATTRITION_THRESHOLD, warning: BUDGET_ATTRITION_THRESHOLD + 13 },
  forestHealth: { danger: 30, warning: 44 },
  progress: { danger: 30, warning: 44 },
};

const METRIC_RISK_WORDS = {
  compliance: { danger: "audit risk rising", warning: "compliance slipping" },
  relationships: { danger: "trust fraying", warning: "relationships strained" },
  budget: { danger: "budget critical", warning: "budget low" },
  forestHealth: { danger: "stands degrading", warning: "forest health soft" },
  progress: { danger: "schedule stalled", warning: "progress behind" },
};

function metricStatus(metric, value) {
  const bands = METRIC_STATUS_BANDS[metric] || { danger: 30, warning: 45 };
  const v = Number(value ?? 50);
  if (v < bands.danger) return "danger";
  if (v < bands.warning) return "warning";
  return "stable";
}

/**
 * Build the top-of-card strip that answers "what am I trying to do right now?":
 * the role's standing mandate, the metrics that are currently at risk, and the
 * single most pressing pressure. Pure function of role + current metrics, so the
 * controller can recompute it from any snapshot.
 */
function buildCrisisObjectiveStrip(state) {
  const metrics = state?.metrics || {};
  const tracked = ["progress", "forestHealth", "relationships", "compliance", "budget"];
  const risks = [];
  let worst = null;
  for (const metric of tracked) {
    const status = metricStatus(metric, metrics[metric]);
    if (status === "stable") continue;
    const word = METRIC_RISK_WORDS[metric]?.[status] || `${formatMetricName(metric)} low`;
    risks.push({ metric, status, label: word });
    const bands = METRIC_STATUS_BANDS[metric] || { warning: 45 };
    const deficit = bands.warning - Number(metrics[metric] ?? 50);
    if (!worst || deficit > worst.deficit || (status === "danger" && worst.status !== "danger")) {
      worst = { metric, status, deficit, label: word };
    }
  }

  return {
    goal: "Coordinate containment, access, permits, and relationships without sacrificing legal or habitat outcomes.",
    winCondition: "Containment holds and the response stays defensible.",
    primaryMetric: "progress",
    primaryLabel: formatMetricName("progress"),
    risks,
    pressure: worst ? worst.label : "Response stable — keep the incident from spreading.",
  };
}

export function buildObjectiveStrip(state) {
  if (state?.gameMode === "crisis-command") {
    return buildCrisisObjectiveStrip(state);
  }
  const objective = getRoleObjective(state?.role?.id);
  if (!objective) return null;
  const metrics = state?.metrics || {};

  const tracked = ["progress", "forestHealth", "relationships", "compliance", "budget"];
  const risks = [];
  let worst = null;
  for (const metric of tracked) {
    const status = metricStatus(metric, metrics[metric]);
    if (status === "stable") continue;
    const word = METRIC_RISK_WORDS[metric]?.[status] || `${formatMetricName(metric)} low`;
    risks.push({ metric, status, label: word });
    const bands = METRIC_STATUS_BANDS[metric] || { warning: 45 };
    const deficit = bands.warning - Number(metrics[metric] ?? 50);
    if (!worst || deficit > worst.deficit || (status === "danger" && worst.status !== "danger")) {
      worst = { metric, status, deficit, label: word };
    }
  }

  return {
    goal: objective.mandate,
    winCondition: objective.signatureWin,
    primaryMetric: objective.primary,
    primaryLabel: formatMetricName(objective.primary),
    risks,
    pressure: worst ? worst.label : "All meters stable — press your advantage.",
  };
}

export function buildRoleLens(state) {
  const roleId = state?.role?.id;
  const lens = ROLE_LENS[roleId];
  if (!lens) return "";
  // The role's primary objective metric is the single source of truth for which
  // meter the ending is judged on.
  const metric = getRoleObjective(roleId)?.primary || lens.metric;
  const value = Number(state?.metrics?.[metric] ?? 50);
  const verdict = value >= 60 ? lens.strong : value >= 45 ? "Mixed result — defensible in parts, exposed in others." : lens.weak;
  const roleName = getRoleDisplayName(state?.role) || "this role";
  return `${roleName} — ${lens.question} ${verdict}`;
}
