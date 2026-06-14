import { resolveRisk } from "../risk.js";
import {
  advancePaperworkChain,
  ensureProfessionalState,
} from "../data/professionalPractice.js";
import {
  BUDGET_ATTRITION_THRESHOLD,
  COMPLIANCE_AUDIT_THRESHOLD,
  DEFAULT_CPD_TARGET,
  RELATIONSHIP_TRUST_THRESHOLD,
} from "./constants.js";
import { buildScheduledIssueTeaser, combineScheduledIssueTeasers } from "./content.js";
import { ensureProfessionalComplianceState } from "./professional.js";
import {
  applyDiminishingReturns,
  clamp,
  formatMetricName,
  normalizeScheduleEntries,
  pendingIssueKey,
} from "./shared.js";

export function applyEffects(state, effects = {}, source) {
  const metrics = state.metrics;
  const budgetLoan = Boolean(state.flags?.budgetLoanActive);
  // Track three views of the swing so balance/debug work can tell "authored too
  // strong" apart from "engine softened it because the meter was already high":
  //   rawEffects   – what the option/consequence authored
  //   effects      – what actually applied after modifiers (player-facing)
  //   modifiers    – which adjustments fired
  const rawEffects = {};
  const appliedEffects = {};
  const modifiers = new Set();

  for (const key of Object.keys(metrics)) {
    if (effects[key] === undefined) continue;
    const rawValue = Number(effects[key]);
    if (!Number.isFinite(rawValue)) continue;
    rawEffects[key] = rawValue;

    let working = rawValue;
    if (budgetLoan && key === "budget" && working > 0) {
      working = Math.max(Math.floor(working * 0.8), 1);
      modifiers.add("budget-loan");
    }
    let adjustedDelta = applyDiminishingReturns(metrics[key], working);
    if (adjustedDelta !== working) {
      modifiers.add("diminishing-returns");
    }
    if (state.flags?.trustDeficitActive && key === "relationships" && adjustedDelta > 0) {
      adjustedDelta = Math.max(1, Math.floor(adjustedDelta * 0.5));
      modifiers.add("trust-deficit");
    }
    const next = clamp(metrics[key] + adjustedDelta, 0, 100);
    if (next - metrics[key] !== adjustedDelta) {
      modifiers.add("clamp");
    }
    // Keep the pre-clamp adjusted delta as the player-facing effect, matching
    // historical behavior so existing copy/tests stay stable.
    appliedEffects[key] = adjustedDelta;
    metrics[key] = next;
  }

  if (source) {
    state.history.push({
      ...source,
      effects: appliedEffects,
      rawEffects,
      modifiers: [...modifiers],
    });
  }
  return appliedEffects;
}

export function applyOptionOutcome(state, option = {}, source, rng = Math.random) {
  if (!state || !option) {
    return null;
  }

  const causedBy = buildCausedBy(state, source);

  if (option.risk) {
    const result = resolveRisk(state, option.risk, rng);
    const effects = applyEffects(state, result.effects, source);
    applyOptionFlags(state, option);
    if (result.flags) {
      applyOptionFlags(state, { setFlags: result.flags });
    }
    applyAssignmentSideEffects(state, option);
    const scheduledIssueTeaser = combineScheduledIssueTeasers(
      applyScheduledIssues(state, option, causedBy),
      applyRiskOutcomeSchedules(state, option, result, causedBy),
    );
    applyScheduledEvents(state, option, causedBy);
    return {
      effects,
      outcome: result.outcome,
      riskResult: result,
      scheduledIssueTeaser,
    };
  }

  const effects = applyEffects(state, option.effects || {}, source);
  applyOptionFlags(state, option);
  applyAssignmentSideEffects(state, option);
  const scheduledIssueTeaser = applyScheduledIssues(state, option, causedBy);
  applyScheduledEvents(state, option, causedBy);
  return {
    effects,
    outcome: option.outcome ?? "",
    riskResult: null,
    scheduledIssueTeaser,
  };
}

// Provenance stamp attached to anything this decision schedules for later, so a
// delayed issue/event can name the choice that caused it.
function buildCausedBy(state, source) {
  if (!source) return null;
  return {
    round: source.round ?? state.round ?? null,
    season: state.currentSeasonContext?.season || null,
    sourceType: source.type || null,
    sourceId: source.id || null,
    title: source.title || null,
    option: source.option || null,
    stance: source.stance || null,
  };
}

export function applyRoundConsequences(state) {
  if (!state?.metrics || !state?.flags) {
    return [];
  }

  const consequences = [];
  const { metrics, flags } = state;
  const round = Number(state.round || 0);
  const professional = ensureProfessionalComplianceState(state);

  if (metrics.budget < BUDGET_ATTRITION_THRESHOLD) {
    flags.lowBudgetStreak = Number(flags.lowBudgetStreak || 0) + 1;
  } else {
    flags.lowBudgetStreak = 0;
  }

  if (metrics.compliance < COMPLIANCE_AUDIT_THRESHOLD) {
    flags.lowComplianceStreak = Number(flags.lowComplianceStreak || 0) + 1;
  } else {
    flags.lowComplianceStreak = 0;
  }

  if (metrics.relationships < RELATIONSHIP_TRUST_THRESHOLD) {
    flags.trustDeficitActive = true;
  } else if (metrics.relationships >= RELATIONSHIP_TRUST_THRESHOLD + 10) {
    flags.trustDeficitActive = false;
  }

  if (flags.lowBudgetStreak >= 2) {
    applyEffects(
      state,
      { progress: -6, relationships: -4 },
      {
        type: "consequence",
        id: "contractor-attrition",
        title: "Contractor attrition from sustained budget stress",
        option: "Deferred scopes and partner pullback",
        round,
      },
    );
    flags.contractorAttritionActive = true;
    consequences.push("contractor-attrition");
  }

  if (flags.trustDeficitActive) {
    applyEffects(
      state,
      { compliance: -3 },
      {
        type: "consequence",
        id: "trust-deficit",
        title: "Low-trust environment limited high-confidence pathways",
        option: "Escalated approvals and slower collaboration",
        round,
      },
    );
    consequences.push("trust-deficit");
  }

  if (flags.lowComplianceStreak >= 2) {
    applyEffects(
      state,
      { budget: -6, progress: -4 },
      {
        type: "consequence",
        id: "audit-escalation",
        title: "Audit escalation after repeated compliance drops",
        option: "Emergency documentation and stoppage delays",
        round,
      },
    );
    flags.auditEscalationActive = true;
    consequences.push("audit-escalation");
  }

  if (professional) {
    const cpdGap = Math.max(0, Math.round((professional.cpdTarget || DEFAULT_CPD_TARGET) - professional.cpdHours));
    if (professional.registrationStatus !== "active") {
      applyEffects(
        state,
        { compliance: -4, budget: -2 },
        {
          type: "consequence",
          id: "registration-lapse",
          title: "Registration lapse creates compliance drag",
          option: "Active practice has to stop until renewal clears",
          round,
        },
      );
      professional.auditExposure = clamp(professional.auditExposure + 2, 0, 100);
      consequences.push("registration-lapse");
    }

    if (cpdGap > 0) {
      professional.competenceRisk = clamp(professional.competenceRisk + 1 + Math.floor(cpdGap / 15), 0, 100);
      professional.auditExposure = clamp(professional.auditExposure + 1, 0, 100);
    } else if (professional.competenceRisk > 0) {
      professional.competenceRisk = clamp(professional.competenceRisk - 1, 0, 100);
    }

    if (professional.paperworkLoad >= 20) {
      applyEffects(
        state,
        { compliance: -2 },
        {
          type: "consequence",
          id: "paperwork-burn",
          title: "Paperwork load is crowding out actual forestry work",
          option: "Too many active packages and not enough clean closure",
          round,
        },
      );
      professional.auditExposure = clamp(professional.auditExposure + 1, 0, 100);
      consequences.push("paperwork-burn");
    }

    if (professional.auditExposure >= 35) {
      applyEffects(
        state,
        { compliance: -2, progress: -2 },
        {
          type: "consequence",
          id: "professional-audit",
          title: "Professional audit risk is building",
          option: "The file is drawing closer review because the records look thin",
          round,
        },
      );
      consequences.push("professional-audit");
    }
  }

  return consequences;
}

export function formatMetricDelta(delta = {}) {
  const pieces = Object.entries(delta)
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([key, value]) => `${formatMetricName(key)} ${value > 0 ? "+" : ""}${value}`);
  return pieces.join(", ");
}

function applyOptionFlags(state, option) {
  if (!state.flags) {
    state.flags = {};
  }

  if (option.setFlags && typeof option.setFlags === "object") {
    for (const [flag, value] of Object.entries(option.setFlags)) {
      state.flags[flag] = Boolean(value);
    }
  }

  if (Array.isArray(option.clearFlags)) {
    for (const flag of option.clearFlags) {
      delete state.flags[flag];
    }
  }
}

function applyAssignmentSideEffects(state, option) {
  const sideEffects = option?.assignmentSideEffects;
  if (!sideEffects || !state) {
    return;
  }

  if (sideEffects.advancePaperworkChainId) {
    advancePaperworkChain(state, sideEffects.advancePaperworkChainId, {
      day: state.round || 0,
      roleId: state.role?.id,
      area: state.area,
    });
  }

  if (sideEffects.professionalShift && typeof sideEffects.professionalShift === "object") {
    const professional = ensureProfessionalState(state, {
      roleId: state.role?.id,
      area: state.area,
    });
    professional.paperworkLoad = clamp(
      Number(professional.paperworkLoad || 0) + Number(sideEffects.professionalShift.paperworkLoad || 0),
      0,
      100,
    );
    professional.auditExposure = clamp(
      Number(professional.auditExposure || 0) + Number(sideEffects.professionalShift.auditExposure || 0),
      0,
      100,
    );
  }
}

function applyRiskOutcomeSchedules(state, option, result, causedBy = null) {
  const risk = option?.risk;
  if (!risk || !result) {
    return null;
  }

  const scheduleSpec = result.success ? risk.successScheduleIssues : risk.failScheduleIssues;
  if (scheduleSpec) {
    scheduleIssueEntries(state, scheduleSpec, causedBy);
    return buildScheduledIssueTeaser(state, scheduleSpec);
  }
  return null;
}

function applyScheduledIssues(state, option, causedBy = null) {
  const schedule = option.scheduleIssues;
  if (!schedule) {
    return null;
  }

  scheduleIssueEntries(state, schedule, causedBy);
  return buildScheduledIssueTeaser(state, schedule);
}

function scheduleIssueEntries(state, scheduleSpec, causedBy = null) {
  const schedules = normalizeScheduleEntries(scheduleSpec);
  if (!schedules.length) {
    return;
  }

  if (!Array.isArray(state.pendingIssues)) {
    state.pendingIssues = [];
  }

  for (const schedule of schedules) {
    const existing = state.pendingIssues.find((pending) => pendingIssueKey(pending) === pendingIssueKey(schedule));
    const delay = Math.max(0, Number(schedule.delay || 0));
    if (existing) {
      existing.delay = Math.min(existing.delay ?? delay, delay);
      if (causedBy && !existing.causedBy) existing.causedBy = causedBy;
      continue;
    }
    state.pendingIssues.push({
      ...(schedule.id ? { id: schedule.id } : {}),
      ...(Array.isArray(schedule.candidates) ? { candidates: schedule.candidates.map((candidate) => ({ ...candidate })) } : {}),
      ...(schedule.force ? { force: true } : {}),
      ...(causedBy ? { causedBy } : {}),
      delay,
    });
  }
}

function applyScheduledEvents(state, option, causedBy = null) {
  const schedule = option.scheduleEvents;
  if (!schedule || !schedule.id) {
    return;
  }

  if (!Array.isArray(state.pendingEvents)) {
    state.pendingEvents = [];
  }

  const existing = state.pendingEvents.find((pending) => pending?.id === schedule.id);
  const delay = Math.max(0, Number(schedule.delay || 0));
  if (existing) {
    existing.delay = Math.min(existing.delay ?? delay, delay);
    if (causedBy && !existing.causedBy) existing.causedBy = causedBy;
    return;
  }
  state.pendingEvents.push({ id: schedule.id, delay, ...(causedBy ? { causedBy } : {}) });
}
