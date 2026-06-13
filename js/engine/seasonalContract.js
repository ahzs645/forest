import { humanizeLabel } from "./shared.js";

export const VALID_RISK_CLASSES = ["routine", "calculated", "unethical"];
export const GENERIC_BC_AREA_TAG = "bc-wide";

const GENERIC_AREA_TAG_COMPATIBILITY = {
  "northern-bc": [GENERIC_BC_AREA_TAG],
  [GENERIC_BC_AREA_TAG]: ["northern-bc"],
};

const ROLE_OPERATION_BLUEPRINTS = {
  planner: {
    spring: {
      stage: "scoping",
      operation: "Scoping the next season's block list, sequencing assumptions, and values trade-offs.",
      objective: "Build a work program that is still deliverable once hydrology, community review, and operations reality are layered in.",
    },
    summer: {
      stage: "review",
      operation: "Reviewing active plans against new field intel, wildfire constraints, and public-facing concerns.",
      objective: "Keep the plan defensible as the ground truth starts changing the original assumptions.",
    },
    fall: {
      stage: "submission",
      operation: "Locking the annual plan package and lining up the work that is ready to move.",
      objective: "Submit a sequence the rest of the team can actually execute without hiding major assumptions.",
    },
    winter: {
      stage: "reforecast",
      operation: "Reforecasting the annual plan after schedule slips, audit load, or weather-window changes.",
      objective: "Reset expectations early enough that finance, operations, and stewardship are working from the same number.",
    },
  },
  permitter: {
    spring: {
      stage: "package",
      operation: "Building permit packages, exhibits, and submission-ready maps for the next filing run.",
      objective: "Send clean files that do not come straight back with avoidable deficiencies.",
    },
    summer: {
      stage: "referral",
      operation: "Working through referrals, field confirmations, and partner follow-up on live files.",
      objective: "Keep the file moving without outrunning the consultation and technical record.",
    },
    fall: {
      stage: "rework",
      operation: "Repairing map mismatches, late comments, and technical gaps before the file goes final.",
      objective: "Close the specific gaps that are actually blocking approval instead of layering on filler paperwork.",
    },
    winter: {
      stage: "submission",
      operation: "Finalizing submissions, amendments, and carry-over files before the next season starts.",
      objective: "Finish the year with a file set that is accurate, traceable, and ready for scrutiny.",
    },
  },
  recce: {
    spring: {
      stage: "access",
      operation: "Checking roads, crossings, and early-season access before crews commit to the block.",
      objective: "Decide whether the access is safe, legal, and worth developing further.",
    },
    summer: {
      stage: "layout",
      operation: "Running layout and block-level field checks while the ground is open and fully visible.",
      objective: "Turn the map into a field-ready footprint without missing terrain, water, or cultural constraints.",
    },
    fall: {
      stage: "field-intel",
      operation: "Collecting follow-up field intelligence on active work, hold points, and design changes.",
      objective: "Give planners and permitters current notes they can actually defend in the file.",
    },
    winter: {
      stage: "closeout",
      operation: "Closing the field season, documenting what changed, and preparing the record for next year.",
      objective: "Make sure the winter file matches what really happened on the ground.",
    },
  },
  silviculture: {
    spring: {
      stage: "plant",
      operation: "Lining up planting and early establishment work for the current season.",
      objective: "Get the right stock on the right ground before access, stock quality, or weather narrows the window.",
    },
    summer: {
      stage: "brush",
      operation: "Managing brushing, tending, and growing-season follow-up on recently established blocks.",
      objective: "Protect crop trees before competition, browse, or crew disruption compounds the problem.",
    },
    fall: {
      stage: "survey",
      operation: "Checking survival and free-growing progress on the blocks that can be credibly assessed this season.",
      objective: "Decide what needs fill planting, brushing, or prescription changes before next year.",
    },
    winter: {
      stage: "inspection",
      operation: "Reviewing winter observations, damage signals, and next-season regeneration priorities from the desk.",
      objective: "Turn winter evidence into a realistic spring treatment plan instead of pretending the block is fine.",
    },
  },
};

const TERMINOLOGY_GUARDRAILS = [
  {
    pattern: /\bpressure\b/gi,
    message: 'Avoid vague "pressure" wording unless the card names the exact constraint in plain language.',
  },
  {
    pattern: /\bevacuation corridors?\b/gi,
    message: 'Name the real concern as "evacuation routes for nearby communities."',
  },
  {
    pattern: /\boccupancy authority\b/gi,
    message: 'Use "special-use permit coverage" or "site permit" instead of "occupancy authority."',
  },
  {
    pattern: /\boriginal ideal\b/gi,
    message: 'Use "planned prescription" or name the original species plan.',
  },
  {
    pattern: /\bcompetence declaration\b/gi,
    message: 'If this stays, pair it with plain-language context about practice-area documentation.',
  },
  {
    pattern: /\bSUP\b/g,
    message: 'Spell out "special-use permit" unless the acronym is defined on the card.',
  },
];

function getSeasonId(state) {
  const currentSeason = String(state?.currentSeasonContext?.season || "").toLowerCase();
  if (currentSeason) return currentSeason;

  const round = Number(state?.round || 1);
  if (round <= 1) return "spring";
  if (round === 2) return "summer";
  if (round === 3) return "fall";
  return "winter";
}

function deriveSilvicultureStage(state, seasonId) {
  const forestHealth = Number(state?.metrics?.forestHealth || 50);
  const discoveryTags = Array.isArray(state?.discoveryTags) ? state.discoveryTags.map((tag) => tag.id) : [];

  if (seasonId === "spring") {
    return forestHealth < 45 || discoveryTags.includes("regen_gap") ? "fill" : "plant";
  }
  if (seasonId === "summer") {
    return forestHealth < 42 || discoveryTags.includes("regen_gap") ? "fill" : "brush";
  }
  if (seasonId === "fall") {
    return "survey";
  }
  return "inspection";
}

function deriveStandAgeClass(roleId, stage, seasonId) {
  if (roleId !== "silviculture") {
    return null;
  }

  if (stage === "plant") return "establishment";
  if (stage === "fill") return "carryover";
  if (stage === "brush") return "juvenile";
  if (stage === "survey") return "survey-ready";
  if (stage === "inspection" || seasonId === "winter") return "carryover";
  return "juvenile";
}

function metricStakeLabel(metric) {
  return {
    progress: "delivery timing",
    forestHealth: "stand condition",
    relationships: "working relationships",
    compliance: "regulatory defensibility",
    budget: "budget flexibility",
  }[metric] || humanizeLabel(metric);
}

function collectMetricStakes(item) {
  const stakes = new Set();
  const options = Array.isArray(item?.options) ? item.options : [];

  for (const option of options) {
    for (const [metric, value] of Object.entries(option?.effects || {})) {
      if (Number.isFinite(Number(value)) && Math.abs(Number(value)) >= 2) {
        stakes.add(metricStakeLabel(metric));
      }
    }

    for (const [metric, value] of Object.entries(option?.risk?.failEffects || {})) {
      if (Number.isFinite(Number(value)) && Math.abs(Number(value)) >= 2) {
        stakes.add(metricStakeLabel(metric));
      }
    }
  }

  return [...stakes];
}

function listToSentence(items = []) {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function inferRiskClass(item, type) {
  if (VALID_RISK_CLASSES.includes(item?.riskClass)) {
    return item.riskClass;
  }

  if (type === "temptation") {
    return "unethical";
  }

  const options = Array.isArray(item?.options) ? item.options : [];
  if (options.some((option) => option?.risk)) {
    return "calculated";
  }

  if (String(item?.id || "").includes("audit") || String(item?.title || "").match(/audit|competence|permit/i)) {
    return "calculated";
  }

  return "routine";
}

function inferCardLabel(item, type, riskClass) {
  if (type === "assignment" || type === "task") {
    return "Seasonal task";
  }
  if (type === "temptation") {
    return "Shortcut offer";
  }
  if (String(item?.id || "").includes("audit") || String(item?.title || "").match(/audit|competence|permit/i)) {
    return "Compliance flag";
  }
  if (type === "event") {
    return "Operational update";
  }
  return riskClass === "calculated" ? "Operational constraint" : "Operational issue";
}

function inferDecisionPrompt(type, riskClass, context) {
  if (type === "temptation") {
    return "Decide whether to refuse, report, or take a shortcut that could damage the file if it comes back on you.";
  }
  // Objectives are written as imperative sentences ("Build a work program..."),
  // so introduce them with a colon rather than splicing them mid-sentence — and
  // strip any trailing period so we don't double-punctuate.
  const objective = String(context?.objective || "").trim().replace(/\s*[.]+\s*$/, "");
  if (objective) {
    return riskClass === "calculated"
      ? `Choose the response that protects this objective without a larger follow-up problem: ${objective}.`
      : `Choose the response that best protects this objective: ${objective}.`;
  }
  return riskClass === "calculated"
    ? "Choose the response that protects the work without creating a larger follow-up problem."
    : "Choose the response that best protects the current work.";
}

function rewriteAmbiguousTerminology(text) {
  if (!text) return "";

  return String(text)
    .replace(/\bevacuation corridors?\b/gi, "evacuation routes for nearby communities")
    .replace(/\boccupancy authority\b/gi, "special-use permit coverage")
    .replace(/\boriginal ideal\b/gi, "planned prescription")
    .replace(/\bcompetence declaration\b/gi, "competence declaration (practice-area declaration)");
}

export function getRoleOperationState(state) {
  const roleId = state?.role?.id || state?.roleId || null;
  const seasonId = getSeasonId(state);
  if (!roleId) {
    return {
      roleId: null,
      seasonId,
      stage: "general",
      standAgeClass: null,
      operation: "Seasonal forestry work is in progress.",
      objective: "Protect the work program without creating avoidable follow-up problems.",
    };
  }

  const blueprint = ROLE_OPERATION_BLUEPRINTS[roleId] || {};
  let roleSeason = blueprint[seasonId] || blueprint.spring || null;

  if (roleId === "silviculture") {
    const stage = deriveSilvicultureStage(state, seasonId);
    roleSeason = Object.values(blueprint).find((entry) => entry.stage === stage) || roleSeason;
    if (roleSeason) {
      roleSeason = { ...roleSeason, stage };
    }
  }

  const stage = roleSeason?.stage || "general";
  return {
    roleId,
    seasonId,
    stage,
    standAgeClass: deriveStandAgeClass(roleId, stage, seasonId),
    operation: roleSeason?.operation || "Seasonal forestry work is in progress.",
    objective: roleSeason?.objective || "Protect the work program without creating avoidable follow-up problems.",
  };
}

export function matchesAreaContext(requiredTags = [], areaTags = []) {
  if (!Array.isArray(requiredTags) || !requiredTags.length) {
    return true;
  }

  return requiredTags.some((requiredTag) => {
    if (areaTags.includes(requiredTag)) {
      return true;
    }

    const compatibleTags = GENERIC_AREA_TAG_COMPATIBILITY[requiredTag] || [];
    return compatibleTags.some((compatibleTag) => areaTags.includes(compatibleTag));
  });
}

export function matchesPreconditions(itemOrPreconditions, state, operationState = getRoleOperationState(state)) {
  const preconditions = itemOrPreconditions?.preconditions || itemOrPreconditions;
  if (!preconditions) {
    return true;
  }

  if (Array.isArray(preconditions.operationStages) && preconditions.operationStages.length) {
    if (!preconditions.operationStages.includes(operationState.stage)) {
      return false;
    }
  }

  if (Array.isArray(preconditions.standAgeClasses) && preconditions.standAgeClasses.length) {
    if (!preconditions.standAgeClasses.includes(operationState.standAgeClass)) {
      return false;
    }
  }

  if (Array.isArray(preconditions.seasons) && preconditions.seasons.length) {
    if (!preconditions.seasons.includes(operationState.seasonId)) {
      return false;
    }
  }

  if (Array.isArray(preconditions.roleIds) && preconditions.roleIds.length) {
    if (!preconditions.roleIds.includes(operationState.roleId)) {
      return false;
    }
  }

  return true;
}

export function normalizeSeasonalCard(item, state, type, extras = {}) {
  const operationState = getRoleOperationState(state);
  const riskClass = inferRiskClass(item, type);
  const metricStakes = collectMetricStakes(item);
  const options = Array.isArray(item?.options)
    ? item.options.map((option) => ({
        ...option,
        label: rewriteAmbiguousTerminology(option?.label || ""),
        outcome: rewriteAmbiguousTerminology(option?.outcome || ""),
        risk: option?.risk
          ? {
              ...option.risk,
              successOutcome: rewriteAmbiguousTerminology(option.risk.successOutcome || ""),
              failOutcome: rewriteAmbiguousTerminology(option.risk.failOutcome || ""),
            }
          : option?.risk,
      }))
    : item?.options;
  const context = {
    operation: rewriteAmbiguousTerminology(item?.context?.operation || extras.context?.operation || operationState.operation),
    objective: rewriteAmbiguousTerminology(item?.context?.objective || extras.context?.objective || operationState.objective),
    stakes: rewriteAmbiguousTerminology(
      item?.context?.stakes
        || extras.context?.stakes
        || (
          metricStakes.length
            ? `This call is most likely to affect ${listToSentence(metricStakes)} this season.`
            : "This decision changes how much trust, time, and defensibility you carry into the next step."
        )
    ),
  };

  return {
    ...item,
    description: rewriteAmbiguousTerminology(item?.description || ""),
    flavor: rewriteAmbiguousTerminology(item?.flavor || ""),
    whyNow: rewriteAmbiguousTerminology(item?.whyNow || ""),
    surfaceReason: rewriteAmbiguousTerminology(item?.surfaceReason || ""),
    options,
    context,
    preconditions: item?.preconditions || null,
    riskClass,
    cardLabel: item?.cardLabel || inferCardLabel(item, type, riskClass),
    decisionPrompt: item?.decisionPrompt || inferDecisionPrompt(type, riskClass, context),
    operationState,
  };
}

export function getSeasonalPlayableRoles(roles = []) {
  return roles.filter((role) => role?.seasonalEnabled !== false);
}

export function getRoleDisplayName(role) {
  return role?.seasonalName || role?.name || "";
}

export function validateSeasonalCardContract(card) {
  const violations = [];
  const riskClass = card?.riskClass;

  if (!VALID_RISK_CLASSES.includes(riskClass)) {
    violations.push(`invalid riskClass: ${riskClass}`);
  }

  if (!card?.context?.operation) {
    violations.push("missing context.operation");
  }
  if (!card?.context?.objective) {
    violations.push("missing context.objective");
  }
  if (!card?.context?.stakes) {
    violations.push("missing context.stakes");
  }

  const preconditions = card?.preconditions;
  if (preconditions) {
    const allowedKeys = ["operationStages", "standAgeClasses", "seasons", "roleIds"];
    for (const key of Object.keys(preconditions)) {
      if (!allowedKeys.includes(key)) {
        violations.push(`unsupported precondition key: ${key}`);
      }
    }
  }

  return violations;
}

export function listTerminologyGuardrailViolations(card) {
  const texts = [
    card?.title,
    card?.description,
    card?.flavor,
    card?.whyNow,
    card?.surfaceReason,
    card?.context?.operation,
    card?.context?.objective,
    card?.context?.stakes,
    ...(Array.isArray(card?.options)
      ? card.options.flatMap((option) => [
          option?.label,
          option?.outcome,
          option?.risk?.successOutcome,
          option?.risk?.failOutcome,
        ])
      : []),
  ]
    .filter(Boolean)
    .join("\n");

  return TERMINOLOGY_GUARDRAILS
    .filter((guardrail) => guardrail.pattern.test(texts))
    .map((guardrail) => guardrail.message);
}
