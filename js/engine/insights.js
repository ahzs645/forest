import {
  BUDGET_ATTRITION_THRESHOLD,
  COMPLIANCE_AUDIT_THRESHOLD,
  RELATIONSHIP_TRUST_THRESHOLD,
} from "./constants.js";
import { formatMetricName } from "./shared.js";
import { getRoleDisplayName } from "./seasonalContract.js";

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
      .find((item) => item?.type === "consequence" && item?.id === id && Number(item?.round) === round);
    return {
      id,
      title: info.title,
      cause: info.cause,
      effectText: formatEffectText(entry?.effects || {}),
    };
  });
}

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

export function buildRoleLens(state) {
  const roleId = state?.role?.id;
  const lens = ROLE_LENS[roleId];
  if (!lens) return "";
  const value = Number(state?.metrics?.[lens.metric] ?? 50);
  const verdict = value >= 60 ? lens.strong : value >= 45 ? "Mixed result — defensible in parts, exposed in others." : lens.weak;
  const roleName = getRoleDisplayName(state?.role) || "this role";
  return `${roleName} — ${lens.question} ${verdict}`;
}
