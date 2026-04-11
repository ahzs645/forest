import { resolveRisk } from "../risk.js";
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
  const delta = { ...effects };
  if (state.flags?.budgetLoanActive && typeof delta.budget === "number" && delta.budget > 0) {
    const reduced = Math.floor(delta.budget * 0.8);
    delta.budget = Math.max(reduced, 1);
  }
  for (const key of Object.keys(metrics)) {
    if (delta[key] !== undefined) {
      const value = Number(delta[key]);
      let adjustedDelta = Number.isFinite(value) ? applyDiminishingReturns(metrics[key], value) : 0;
      if (state.flags?.trustDeficitActive && key === "relationships" && adjustedDelta > 0) {
        adjustedDelta = Math.max(1, Math.floor(adjustedDelta * 0.5));
      }
      delta[key] = adjustedDelta;
      metrics[key] = clamp(metrics[key] + adjustedDelta, 0, 100);
    }
  }
  if (source) {
    state.history.push({ ...source, effects: delta });
  }
  return delta;
}

export function applyOptionOutcome(state, option = {}, source) {
  if (!state || !option) {
    return null;
  }

  if (option.risk) {
    const result = resolveRisk(state, option.risk);
    const effects = applyEffects(state, result.effects, source);
    applyOptionFlags(state, option);
    if (result.flags) {
      applyOptionFlags(state, { setFlags: result.flags });
    }
    const scheduledIssueTeaser = combineScheduledIssueTeasers(
      applyScheduledIssues(state, option),
      applyRiskOutcomeSchedules(state, option, result),
    );
    applyScheduledEvents(state, option);
    return {
      effects,
      outcome: result.outcome,
      riskResult: result,
      scheduledIssueTeaser,
    };
  }

  const effects = applyEffects(state, option.effects || {}, source);
  applyOptionFlags(state, option);
  const scheduledIssueTeaser = applyScheduledIssues(state, option);
  applyScheduledEvents(state, option);
  return {
    effects,
    outcome: option.outcome ?? "",
    riskResult: null,
    scheduledIssueTeaser,
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
          title: "Professional audit pressure is building",
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

function applyRiskOutcomeSchedules(state, option, result) {
  const risk = option?.risk;
  if (!risk || !result) {
    return null;
  }

  const scheduleSpec = result.success ? risk.successScheduleIssues : risk.failScheduleIssues;
  if (scheduleSpec) {
    scheduleIssueEntries(state, scheduleSpec);
    return buildScheduledIssueTeaser(state, scheduleSpec);
  }
  return null;
}

function applyScheduledIssues(state, option) {
  const schedule = option.scheduleIssues;
  if (!schedule) {
    return null;
  }

  scheduleIssueEntries(state, schedule);
  return buildScheduledIssueTeaser(state, schedule);
}

function scheduleIssueEntries(state, scheduleSpec) {
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
      continue;
    }
    state.pendingIssues.push({
      ...(schedule.id ? { id: schedule.id } : {}),
      ...(Array.isArray(schedule.candidates) ? { candidates: schedule.candidates.map((candidate) => ({ ...candidate })) } : {}),
      ...(schedule.force ? { force: true } : {}),
      delay,
    });
  }
}

function applyScheduledEvents(state, option) {
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
    return;
  }
  state.pendingEvents.push({ id: schedule.id, delay });
}
