import {
  FORESTER_ROLES,
  OPERATING_AREAS,
  ISSUE_LIBRARY,
  CHAINED_ISSUES,
  MISCHIEF_OPTIONS,
  ILLEGAL_ACTS,
  DESK_EVENTS,
  FIELD_EVENTS,
} from "./data/index.js";
import { getAreaComplianceProfile } from "./data/professionalPractice.js";
import { resolveRisk } from "./risk.js";

export const SEASONS = ["Spring Planning", "Summer Field", "Fall Integration", "Winter Review"];
const ISSUE_REPEAT_COOLDOWN_ROUNDS = 2;
const EVENT_REPEAT_COOLDOWN_ROUNDS = 2;
const TEMPTATION_REPEAT_COOLDOWN_ROUNDS = 2;
const BUDGET_ATTRITION_THRESHOLD = 25;
const RELATIONSHIP_TRUST_THRESHOLD = 35;
const COMPLIANCE_AUDIT_THRESHOLD = 40;
const DEFAULT_CPD_TARGET = 30;
const ROLE_EVENT_DOMAINS = {
  planner: "desk",
  permitter: "desk",
  recce: "field",
  silviculture: "field",
};
const ROLE_JOURNEY_TYPES = {
  planner: ["planning", "desk"],
  permitter: ["permitting", "desk"],
  recce: ["recon", "field"],
  silviculture: ["silviculture", "field"],
};
const PENDING_PRESSURE_PRIORITY = ["relationships", "budget", "compliance", "forestHealth", "progress"];
const PENDING_PRESSURE_EXPLANATIONS = {
  relationships: "relationship damage made the trust-and-protocol branch the likeliest consequence.",
  budget: "budget stress made the finance-and-audit branch the likeliest consequence.",
  compliance: "compliance weakness made the scrutiny-heavy branch the likeliest consequence.",
  forestHealth: "ecological stress made the habitat-and-remediation branch the likeliest consequence.",
  progress: "schedule pressure made the rework-heavy branch the likeliest consequence.",
};
const ISSUE_PREVIEW_SEVERITY = {
  "formal-investigation": "danger",
  "environmental-audit-fallout": "warning",
  "budget-freeze": "warning",
  "fpbc-competence-audit": "warning",
  "heritage-protocol-gap": "warning",
  "archaeology-escalation-pause": "warning",
  "road-use-permit-standoff": "warning",
  "special-use-permit-stack": "warning",
  "wildlife-collar-drop": "warning",
  "riparian-reclassification-call": "warning",
  "herbicide-drift-complaint": "warning",
  "seedlot-vigour-drop": "warning",
  "free-growing-catchup-plan": "warning",
  "compliance-drone-sweep": "warning",
  "ministry-data-audit": "warning",
  "fom-consistency-gap": "warning",
};
const ISSUE_PREVIEW_SEVERITY_LABELS = {
  danger: "serious",
  warning: "manageable",
  info: "minor",
};
const ECOLOGICAL_TEMPTATION_TAGS = new Set([
  "wildlife",
  "riparian",
  "fire",
  "erosion",
  "herbicide",
  "nursery",
  "salvage",
  "old-growth",
]);
const ETHICS_TEMPTATION_TAGS = new Set([
  "fraud",
  "corruption",
  "bribery",
  "collusion",
  "procurement",
  "payroll",
  "double-dip",
  "laundering",
  "greenwashing",
  "forgery",
  "deception",
  "fabrication",
]);
const AUDIT_TEMPTATION_TAGS = new Set([
  "mapping",
  "reporting",
  "data",
  "modeling",
  "billing",
  "grants",
  "compliance",
  "paperwork",
  "records",
  "monitoring",
]);
const COMMUNITY_TEMPTATION_TAGS = new Set(["cultural", "community", "labour", "media"]);
const ROLE_TEMPTATION_PROFILES = {
  planner: {
    flavor: "Bureaucratic shortcut",
    chance: {
      base: 0.03,
      lateSeasonBonus: 0.02,
      cap: 0.18,
      pressure: {
        budget: { threshold: 34, bonus: 0.04 },
        progress: { threshold: 42, bonus: 0.04 },
        compliance: { threshold: 42, bonus: 0.03 },
        relationships: { threshold: 34, bonus: 0.01 },
      },
    },
    gainRange: [1400, 2800],
    successBaseEffects: { progress: 3, politicalCapital: -5 },
    failConfig: {
      budgetMin: 2400,
      budgetMultiplier: 1.2,
      effects: { politicalCapital: -10, compliance: -14, relationships: -8, progress: -6 },
    },
    refuseEffects: { politicalCapital: 2, compliance: 2 },
    reportEffects: { politicalCapital: 5, compliance: 4, timeUsed: 2 },
    baseSuccess: 0.4,
    preferredTags: {
      mapping: 2.5,
      data: 2,
      modeling: 2,
      reporting: 1.5,
      monitoring: 1.5,
      paperwork: 1.5,
      grants: 1,
      engineering: 1,
    },
  },
  permitter: {
    flavor: "Bureaucratic shortcut",
    chance: {
      base: 0.035,
      lateSeasonBonus: 0.02,
      cap: 0.2,
      pressure: {
        budget: { threshold: 35, bonus: 0.05 },
        progress: { threshold: 42, bonus: 0.04 },
        compliance: { threshold: 42, bonus: 0.04 },
        relationships: { threshold: 35, bonus: 0.02 },
      },
    },
    gainRange: [1800, 3400],
    successBaseEffects: { progress: 5, politicalCapital: -6 },
    failConfig: {
      budgetMin: 2600,
      budgetMultiplier: 1.25,
      effects: { politicalCapital: -12, compliance: -15, relationships: -9, progress: -6 },
    },
    refuseEffects: { politicalCapital: 2, compliance: 2 },
    reportEffects: { politicalCapital: 5, compliance: 4, timeUsed: 2 },
    baseSuccess: 0.36,
    preferredTags: {
      procurement: 2.5,
      paperwork: 2,
      compliance: 1.5,
      cultural: 1.5,
      collusion: 1.5,
      bribery: 1.5,
      forgery: 1.5,
      mapping: 1,
    },
  },
  recce: {
    flavor: "Field desperation",
    chance: {
      base: 0.045,
      lateSeasonBonus: 0.03,
      cap: 0.22,
      pressure: {
        budget: { threshold: 35, bonus: 0.05 },
        progress: { threshold: 40, bonus: 0.04 },
        compliance: { threshold: 40, bonus: 0.03 },
        relationships: { threshold: 32, bonus: 0.02 },
      },
    },
    gainRange: [300, 900],
    successBaseEffects: { progress: 4, equipment: -10, crew_morale: -4 },
    failConfig: {
      budgetMin: 450,
      budgetMultiplier: 0.9,
      effects: { equipment: -15, crew_morale: -10, compliance: -12, progress: -8 },
    },
    refuseEffects: { crew_morale: 2, compliance: 1 },
    reportEffects: { crew_morale: 1, compliance: 3, timeUsed: 2 },
    baseSuccess: 0.34,
    preferredTags: {
      access: 2,
      logistics: 2,
      aviation: 1.5,
      wildlife: 1.5,
      riparian: 1.5,
      salvage: 1.5,
      drones: 1.5,
      risk: 1,
    },
  },
  silviculture: {
    flavor: "Field desperation",
    chance: {
      base: 0.05,
      lateSeasonBonus: 0.03,
      cap: 0.24,
      pressure: {
        budget: { threshold: 34, bonus: 0.05 },
        progress: { threshold: 38, bonus: 0.04 },
        compliance: { threshold: 38, bonus: 0.04 },
        relationships: { threshold: 32, bonus: 0.02 },
      },
    },
    gainRange: [350, 950],
    successBaseEffects: { progress: 2, equipment: -12, crew_morale: -5 },
    failConfig: {
      budgetMin: 500,
      budgetMultiplier: 0.9,
      effects: { equipment: -16, crew_morale: -10, compliance: -12, progress: -9 },
    },
    refuseEffects: { crew_morale: 2, compliance: 1 },
    reportEffects: { crew_morale: 1, compliance: 3, timeUsed: 2 },
    baseSuccess: 0.28,
    preferredTags: {
      nursery: 2.5,
      herbicide: 2,
      fire: 2,
      erosion: 1.5,
      stocking: 1.5,
      automation: 1.5,
      wildlife: 1,
      records: 1,
    },
  },
};
const PROFESSIONAL_CHAIN_DEFS = {
  registration: {
    title: "Registration Renewal",
    steps: ["renewal", "validation"],
  },
  cpd: {
    title: "CPD Tracking",
    steps: ["log", "refresh", "report"],
  },
  competence: {
    title: "Competence Review",
    steps: ["scope", "review", "declare"],
  },
  fom: {
    title: "Forest Operations Map",
    steps: ["notice", "comment", "response", "submission"],
  },
  roadPermit: {
    title: "Road Permit",
    steps: ["screen", "map", "submit", "maintenance"],
  },
  specialUse: {
    title: "Special Use Permit",
    steps: ["screen", "bundle", "submit", "conditions"],
  },
  archaeology: {
    title: "Archaeology Review",
    steps: ["screen", "field-review", "permit-context"],
  },
};

function createProfessionalChain(definition) {
  return {
    title: definition.title,
    steps: [...definition.steps],
    stepIndex: 0,
    complete: false,
  };
}

function clampValue(value) {
  return Math.max(0, Math.min(100, value));
}

function getProfessionalRoleBaseline(roleId, areaOrId = null) {
  let baseline;
  switch (roleId) {
    case "permitter":
      baseline = {
        cpdTarget: 32,
        competenceRisk: 20,
        paperworkLoad: 10,
        auditExposure: 10,
      };
      break;
    case "planner":
      baseline = {
        cpdTarget: 30,
        competenceRisk: 18,
        paperworkLoad: 8,
        auditExposure: 8,
      };
      break;
    case "recce":
      baseline = {
        cpdTarget: 24,
        competenceRisk: 16,
        paperworkLoad: 6,
        auditExposure: 6,
      };
      break;
    case "silviculture":
      baseline = {
        cpdTarget: 24,
        competenceRisk: 14,
        paperworkLoad: 6,
        auditExposure: 6,
      };
      break;
    default:
      baseline = {
        cpdTarget: DEFAULT_CPD_TARGET,
        competenceRisk: 16,
        paperworkLoad: 8,
        auditExposure: 8,
      };
      break;
  }

  const areaProfile = getAreaComplianceProfile(areaOrId);
  if (!areaProfile) {
    return baseline;
  }

  return {
    cpdTarget: baseline.cpdTarget,
    competenceRisk: baseline.competenceRisk + Math.max(0, Math.round((areaProfile.auditExposure || 0) / 6)),
    paperworkLoad: baseline.paperworkLoad + Math.max(0, Math.round((areaProfile.paperworkLoad || 0) / 2)),
    auditExposure: baseline.auditExposure + Math.max(0, Math.round((areaProfile.auditExposure || 0) / 2)),
  };
}

export function createProfessionalComplianceState(roleId = null, areaOrId = null) {
  const baseline = getProfessionalRoleBaseline(roleId, areaOrId);
  const areaProfile = getAreaComplianceProfile(areaOrId);
  return {
    registrationStatus: "active",
    cpdHours: 0,
    cpdTarget: baseline.cpdTarget,
    competenceRisk: baseline.competenceRisk,
    paperworkLoad: baseline.paperworkLoad,
    auditExposure: baseline.auditExposure,
    areaBurdenLabel: areaProfile?.title || "Standard practice burden",
    areaWatchouts: areaProfile?.watchouts || [],
    chains: Object.fromEntries(
      Object.entries(PROFESSIONAL_CHAIN_DEFS).map(([key, definition]) => [key, createProfessionalChain(definition)])
    ),
  };
}

function ensureChainShape(chain, definition) {
  if (!chain || typeof chain !== "object") {
    return createProfessionalChain(definition);
  }

  if (!Array.isArray(chain.steps) || chain.steps.length === 0) {
    chain.steps = [...definition.steps];
  }
  if (!Number.isFinite(chain.stepIndex)) {
    chain.stepIndex = 0;
  }
  chain.stepIndex = Math.max(0, Math.min(chain.steps.length, Math.floor(chain.stepIndex)));
  chain.complete = chain.stepIndex >= chain.steps.length;
  chain.title = chain.title || definition.title;
  return chain;
}

export function ensureProfessionalComplianceState(state) {
  if (!state) {
    return null;
  }

  const roleId = state.role?.id || state.roleId || null;
  const area = state.area || state.areaId || null;
  if (!state.professional) {
    state.professional = createProfessionalComplianceState(roleId, area);
    return state.professional;
  }

  const professional = state.professional;
  const baseline = getProfessionalRoleBaseline(roleId, area);
  const areaProfile = getAreaComplianceProfile(area);

  if (!Number.isFinite(professional.cpdTarget) || professional.cpdTarget <= 0) {
    professional.cpdTarget = baseline.cpdTarget;
  }
  if (!Number.isFinite(professional.cpdHours)) {
    professional.cpdHours = 0;
  }
  if (!Number.isFinite(professional.competenceRisk)) {
    professional.competenceRisk = baseline.competenceRisk;
  }
  if (!Number.isFinite(professional.paperworkLoad)) {
    professional.paperworkLoad = baseline.paperworkLoad;
  }
  if (!Number.isFinite(professional.auditExposure)) {
    professional.auditExposure = baseline.auditExposure;
  }
  if (!professional.registrationStatus) {
    professional.registrationStatus = "active";
  }
  professional.areaBurdenLabel = areaProfile?.title || professional.areaBurdenLabel || "Standard practice burden";
  professional.areaWatchouts = Array.isArray(areaProfile?.watchouts)
    ? [...areaProfile.watchouts]
    : Array.isArray(professional.areaWatchouts)
      ? professional.areaWatchouts
      : [];

  if (!professional.chains || typeof professional.chains !== "object") {
    professional.chains = {};
  }
  for (const [key, definition] of Object.entries(PROFESSIONAL_CHAIN_DEFS)) {
    professional.chains[key] = ensureChainShape(professional.chains[key], definition);
  }

  professional.cpdHours = clampValue(professional.cpdHours);
  professional.competenceRisk = clampValue(professional.competenceRisk);
  professional.paperworkLoad = clampValue(professional.paperworkLoad);
  professional.auditExposure = clampValue(professional.auditExposure);

  return professional;
}

export function getProfessionalComplianceSnapshot(state) {
  const professional = ensureProfessionalComplianceState(state);
  if (!professional) {
    return null;
  }

  const cpdGap = Math.max(0, Math.round((professional.cpdTarget || DEFAULT_CPD_TARGET) - professional.cpdHours));

  return {
    registrationStatus: professional.registrationStatus,
    cpdHours: professional.cpdHours,
    cpdTarget: professional.cpdTarget,
    cpdGap,
    competenceRisk: professional.competenceRisk,
    paperworkLoad: professional.paperworkLoad,
    auditExposure: professional.auditExposure,
    areaBurdenLabel: professional.areaBurdenLabel || null,
    areaWatchouts: professional.areaWatchouts || [],
    registrationChain: professional.chains?.registration || null,
    cpdChain: professional.chains?.cpd || null,
    competenceChain: professional.chains?.competence || null,
    fomChain: professional.chains?.fom || null,
    roadPermitChain: professional.chains?.roadPermit || null,
    specialUseChain: professional.chains?.specialUse || null,
    archaeologyChain: professional.chains?.archaeology || null,
    registrationActive: professional.registrationStatus === "active",
  };
}

export function advanceProfessionalComplianceChain(state, chainId, stepCount = 1) {
  const professional = ensureProfessionalComplianceState(state);
  if (!professional || !professional.chains?.[chainId]) {
    return null;
  }

  const chain = professional.chains[chainId];
  const steps = Math.max(1, Math.floor(Number(stepCount) || 1));
  chain.stepIndex = Math.min(chain.steps.length, chain.stepIndex + steps);
  chain.complete = chain.stepIndex >= chain.steps.length;
  return chain;
}

export function applyProfessionalComplianceShift(state, changes = {}) {
  const professional = ensureProfessionalComplianceState(state);
  if (!professional) {
    return null;
  }

  if (typeof changes.registrationStatus === "string") {
    professional.registrationStatus = changes.registrationStatus;
  }
  if (typeof changes.cpdHours === "number") {
    professional.cpdHours = clampValue(professional.cpdHours + changes.cpdHours);
  }
  if (typeof changes.competenceRisk === "number") {
    professional.competenceRisk = clampValue(professional.competenceRisk + changes.competenceRisk);
  }
  if (typeof changes.paperworkLoad === "number") {
    professional.paperworkLoad = clampValue(professional.paperworkLoad + changes.paperworkLoad);
  }
  if (typeof changes.auditExposure === "number") {
    professional.auditExposure = clampValue(professional.auditExposure + changes.auditExposure);
  }
  if (changes.resetRegistration === true) {
    professional.chains.registration.stepIndex = 0;
    professional.chains.registration.complete = false;
    professional.registrationStatus = "active";
  }

  return professional;
}

export function findRole(roleId) {
  return FORESTER_ROLES.find((role) => role.id === roleId);
}

export function findArea(areaId) {
  return OPERATING_AREAS.find((area) => area.id === areaId);
}

export function createInitialState({ companyName, roleId, areaId }) {
  const role = findRole(roleId);
  const area = findArea(areaId);
  if (!role || !area) {
    throw new Error("Invalid role or area selection");
  }

  return {
    companyName: companyName || "Forest Co-op",
    role,
    area,
    professional: createProfessionalComplianceState(roleId, area),
    round: 0,
    totalRounds: SEASONS.length,
    metrics: {
      progress: 50,
      forestHealth: 50,
      relationships: 50,
      compliance: 50,
      budget: 50,
    },
    history: [],
    flags: {},
    pendingIssues: [],
    pendingEvents: [],
    issueHistory: [],
    timeline: [
      {
        round: 0,
        season: "Baseline",
        metrics: {
          progress: 50,
          forestHealth: 50,
          relationships: 50,
          compliance: 50,
          budget: 50,
        },
      },
    ],
  };
}

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

  // Risk-based mischief option — resolve probabilistically
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
      professional.auditExposure = clampValue(professional.auditExposure + 2);
      consequences.push("registration-lapse");
    }

    if (cpdGap > 0) {
      professional.competenceRisk = clampValue(professional.competenceRisk + 1 + Math.floor(cpdGap / 15));
      professional.auditExposure = clampValue(professional.auditExposure + 1);
    } else if (professional.competenceRisk > 0) {
      professional.competenceRisk = clampValue(professional.competenceRisk - 1);
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
      professional.auditExposure = clampValue(professional.auditExposure + 1);
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

export function getRoleTasks(state) {
  const baseTasks = state.role.tasks || [];
  return baseTasks.map((task) => {
    const mischief = MISCHIEF_OPTIONS[task.id];
    if (!mischief) return task;
    return {
      ...task,
      options: [...task.options, mischief],
    };
  });
}

export function drawSeasonalEvent(state, rng = Math.random) {
  if (!state?.role) {
    return null;
  }

  if (Array.isArray(state.pendingEvents)) {
    for (const pending of state.pendingEvents) {
      if (!pending || typeof pending.delay !== "number") {
        continue;
      }
      pending.delay = Math.max(0, pending.delay - 1);
    }

    for (let i = 0; i < state.pendingEvents.length; i++) {
      const pending = state.pendingEvents[i];
      if (!pending) continue;
      if (typeof pending.delay === "number" && pending.delay > 0) {
        continue;
      }
      const candidate = findOperationalEventById(pending.id, state);
      if (candidate && eventMatchesSeasonalContext(candidate, state)) {
        state.pendingEvents.splice(i, 1);
        return adaptOperationalEvent(candidate, state);
      }
      if (!candidate) {
        state.pendingEvents.splice(i, 1);
        i--;
      }
    }
  }

  const pool = getOperationalEventLibrary(state).filter((event) => eventMatchesSeasonalContext(event, state));
  const freshPool = pool.filter((event) => !isEventInCooldown(state, event.id));
  const selectablePool = freshPool.length ? freshPool : pool;

  if (!selectablePool.length) {
    return null;
  }

  const weightedPool = selectablePool.map((event) => ({
    event,
    weight: scoreOperationalEventSelection(event, state),
  }));
  const selected = pickWeightedEntry(weightedPool, rng);
  return selected ? adaptOperationalEvent(selected, state) : null;
}

export function drawSeasonalTemptation(state, rng = Math.random) {
  if (!state?.role || !Array.isArray(ILLEGAL_ACTS) || ILLEGAL_ACTS.length === 0) {
    return null;
  }

  if (hasRecentTemptation(state)) {
    return null;
  }

  const chance = calculateTemptationChance(state);
  if (chance <= 0 || rng() >= chance) {
    return null;
  }

  const roleId = state.role.id;
  const matchingActs = ILLEGAL_ACTS.filter((act) => {
    if (!act) {
      return false;
    }
    if (!Array.isArray(act.roles) || act.roles.length === 0) {
      return true;
    }
    return act.roles.includes(roleId);
  });
  const pool = matchingActs.length ? matchingActs : ILLEGAL_ACTS;
  const weightedPool = pool.map((act) => ({
    act,
    weight: scoreIllegalActSelection(act, state),
  }));

  const selected = pickWeightedItem(weightedPool, rng, "act");
  return selected ? adaptIllegalActTemptation(selected, state, rng) : null;
}

export function drawIssue(state, rng = Math.random) {
  if (!state) {
    return null;
  }

  const tags = state.area?.tags || [];
  const seasonIndex = Math.max(0, Math.min(SEASONS.length - 1, (state.round || 1) - 1));
  const season = SEASONS[seasonIndex];

  if (Array.isArray(state.pendingIssues)) {
    for (const pending of state.pendingIssues) {
      if (!pending || typeof pending.delay !== "number") {
        continue;
      }
      pending.delay = Math.max(0, pending.delay - 1);
    }

    for (let i = 0; i < state.pendingIssues.length; i++) {
      const pending = state.pendingIssues[i];
      if (!pending) continue;
      if (typeof pending.delay === "number" && pending.delay > 0) {
        continue;
      }
      const candidate = resolvePendingIssue(state, pending, { tags, season }, rng);
      if (candidate) {
        state.pendingIssues.splice(i, 1);
        return candidate;
      }
      state.pendingIssues.splice(i, 1);
      i--;
    }
  }

  const allIssues = [...ISSUE_LIBRARY, ...CHAINED_ISSUES];
  const pool = allIssues.filter((issue) => issueMatchesContext(issue, state, tags));
  const freshPool = pool.filter((issue) => !isIssueInCooldown(state, issue.id));
  const selectablePool = freshPool.length ? freshPool : pool;

  if (!selectablePool.length) {
    return null;
  }

  const weightedPool = selectablePool.map((issue) => ({
    issue,
    weight: scoreIssueSelection(issue, state, { tags, season }),
  }));
  const totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    const index = Math.floor(rng() * selectablePool.length);
    return selectablePool[index];
  }

  let roll = rng() * totalWeight;
  for (const entry of weightedPool) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.issue;
    }
  }
  return weightedPool[weightedPool.length - 1].issue;
}

export function buildSummary(state) {
  const { metrics, role, area } = state;
  const averages = weightedAverage(metrics);

  const messages = [];
  if (metrics.compliance < 35) {
    messages.push("⚠️ Compliance concerns triggered a ministry audit.");
  }
  if (metrics.relationships < 30) {
    messages.push("⚠️ Community partners are distancing themselves from your program.");
  }
  if (metrics.forestHealth > 70) {
    messages.push("🌱 Forest health indicators improved markedly across your blocks.");
  }
  if (metrics.progress > 70) {
    messages.push("🚚 Deliverables stayed ahead of schedule despite field surprises.");
  }
  if (metrics.budget < 30) {
    messages.push("💸 Budget reserves are nearly depleted.");
  } else if (metrics.budget > 70) {
    messages.push("💰 You protected capital for future seasons.");
  }
  if (state.flags?.budgetLoanActive) {
    messages.push("💳 Emergency loan repayments trimmed future budget gains by 20%.");
  }

  let overall;
  const balancedExcellence = Object.values(metrics).every((value) => value >= 65);
  if (averages >= 82 && balancedExcellence) {
    overall = `Outstanding season – the ${role.name} kept the ${area.name} program balanced.`;
  } else if (averages >= 60) {
    overall = `Solid performance with room to fine-tune priorities next cycle.`;
  } else if (averages >= 45) {
    overall = `Mixed outcomes. Consider where trade-offs eroded trust or ecological outcomes.`;
  } else {
    overall = `Operations stumbled. Leadership will expect a recovery plan before the next season.`;
  }
  if (!messages.length) {
    messages.push("✅ Stakeholders acknowledge the cohesive strategy you delivered.");
  }

  const timeline = Array.isArray(state.timeline) ? state.timeline.slice(1) : [];
  const trends = metricsTrendlines(state);
  const legacy = buildLegacyReport(metrics, trends, timeline);
  const highlights = topDecisions(state.history);
  const achievements = buildAchievements(metrics, trends);
  const projection = futureOutlook(metrics, trends, area);

  return { overall, messages, legacy, highlights, achievements, projection };
}

export function formatMetricDelta(delta = {}) {
  const pieces = Object.entries(delta)
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([key, value]) => `${formatMetricName(key)} ${value > 0 ? "+" : ""}${value}`);
  return pieces.join(", ");
}

function formatMetricName(key) {
  switch (key) {
    case "progress":
      return "Progress";
    case "forestHealth":
      return "Forest Health";
    case "relationships":
      return "Relationships";
    case "compliance":
      return "Compliance";
    case "budget":
      return "Budget";
    default:
      return key;
  }
}

function weightedAverage(metrics) {
  const weights = {
    progress: 1,
    forestHealth: 1,
    relationships: 1,
    compliance: 1.2,
    budget: 0.8,
  };
  let total = 0;
  let weight = 0;
  for (const [key, value] of Object.entries(metrics)) {
    const w = weights[key] ?? 1;
    total += value * w;
    weight += w;
  }
  return total / weight;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyDiminishingReturns(currentMetric, delta) {
  if (delta <= 0) {
    return delta;
  }

  if (currentMetric >= 90) {
    return Math.max(1, Math.floor(delta * 0.35));
  }
  if (currentMetric >= 75) {
    return Math.max(1, Math.floor(delta * 0.6));
  }
  return delta;
}

function getOperationalEventLibrary(state) {
  return ROLE_EVENT_DOMAINS[state?.role?.id] === "field" ? FIELD_EVENTS : DESK_EVENTS;
}

function findOperationalEventById(eventId, state) {
  if (!eventId) {
    return null;
  }

  const primary = getOperationalEventLibrary(state);
  return primary.find((event) => event.id === eventId)
    || DESK_EVENTS.find((event) => event.id === eventId)
    || FIELD_EVENTS.find((event) => event.id === eventId)
    || null;
}

function isIssueInCooldown(state, issueId) {
  if (!issueId || !Array.isArray(state?.history) || !state.history.length) {
    return false;
  }

  const currentRound = Number(state.round || 1);
  return state.history.some((entry) => {
    if (entry?.type !== "issue" || entry.id !== issueId) {
      return false;
    }
    const roundsAgo = currentRound - Number(entry.round || 0);
    return roundsAgo > 0 && roundsAgo <= ISSUE_REPEAT_COOLDOWN_ROUNDS;
  });
}

function isEventInCooldown(state, eventId) {
  if (!eventId || !Array.isArray(state?.history) || !state.history.length) {
    return false;
  }

  const currentRound = Number(state.round || 1);
  return state.history.some((entry) => {
    if (entry?.type !== "event" || entry.id !== eventId) {
      return false;
    }
    const roundsAgo = currentRound - Number(entry.round || 0);
    return roundsAgo > 0 && roundsAgo <= EVENT_REPEAT_COOLDOWN_ROUNDS;
  });
}

function hasRecentTemptation(state) {
  if (!Array.isArray(state?.history) || !state.history.length) {
    return false;
  }

  const currentRound = Number(state.round || 1);
  return state.history.some((entry) => {
    if (entry?.type !== "temptation") {
      return false;
    }
    const roundsAgo = currentRound - Number(entry.round || 0);
    return roundsAgo > 0 && roundsAgo <= TEMPTATION_REPEAT_COOLDOWN_ROUNDS;
  });
}

function getTemptationProfile(stateOrRoleId) {
  const roleId = typeof stateOrRoleId === "string"
    ? stateOrRoleId
    : stateOrRoleId?.role?.id || stateOrRoleId?.roleId;
  return ROLE_TEMPTATION_PROFILES[roleId] || ROLE_TEMPTATION_PROFILES.planner;
}

function issueMatchesContext(issue, state, tags, options = {}) {
  if (!issue || !state?.role) {
    return false;
  }
  if (!issue.roles?.includes(state.role.id)) {
    return false;
  }
  const ignoreRequirements = Boolean(options.ignoreRequirements);
  if (!ignoreRequirements && Array.isArray(issue.requiresFlags)) {
    const hasFlags = issue.requiresFlags.every((flag) => Boolean(state.flags?.[flag]));
    if (!hasFlags) {
      return false;
    }
  }
  if (!ignoreRequirements && Array.isArray(issue.requiresAnyFlags) && issue.requiresAnyFlags.length) {
    const hasAny = issue.requiresAnyFlags.some((flag) => Boolean(state.flags?.[flag]));
    if (!hasAny) {
      return false;
    }
  }
  if (Array.isArray(issue.excludeFlags)) {
    const excluded = issue.excludeFlags.some((flag) => Boolean(state.flags?.[flag]));
    if (excluded) {
      return false;
    }
  }
  if (issue.areaTags?.length) {
    return issue.areaTags.some((tag) => tags.includes(tag));
  }
  return true;
}

function eventMatchesSeasonalContext(event, state) {
  if (!event || !state?.role || !state?.area) {
    return false;
  }

  const roleId = state.role.id;
  const roleJourneyTypes = ROLE_JOURNEY_TYPES[roleId] || [];
  if (Array.isArray(event.roles) && event.roles.length > 0 && !event.roles.includes(roleId)) {
    return false;
  }
  if (Array.isArray(event.journeyTypes) && event.journeyTypes.length > 0) {
    const matchesJourney = roleJourneyTypes.some((journeyType) => event.journeyTypes.includes(journeyType));
    if (!matchesJourney) {
      return false;
    }
  }

  const tags = Array.isArray(state.area.tags) ? state.area.tags : [];
  if (Array.isArray(event.areaTags) && event.areaTags.length > 0) {
    if (!event.areaTags.some((tag) => tags.includes(tag))) {
      return false;
    }
  }

  const becCode = state.area.becCode;
  if (Array.isArray(event.becCodes) && event.becCodes.length > 0) {
    if (!becCode || !event.becCodes.includes(becCode)) {
      return false;
    }
  }

  if (event.options?.some((option) => typeof option?.effects?.permits_approved === "number") && roleId !== "permitter") {
    return false;
  }

  return true;
}

function calculateTemptationChance(state) {
  const round = Number(state.round || 1);
  if (round <= 1) {
    return 0;
  }

  const profile = getTemptationProfile(state);
  let chance = profile.chance.base;

  if (round >= 3) {
    chance += profile.chance.lateSeasonBonus;
  }

  for (const [metric, rule] of Object.entries(profile.chance.pressure || {})) {
    if (Number(state.metrics?.[metric]) < rule.threshold) {
      chance += rule.bonus;
    }
  }

  return clamp(chance, 0, profile.chance.cap);
}

export function scoreIssueSelection(issue, state, context) {
  let weight = Math.max(1, Number(issue.baseWeight) || 1);
  if (issue.areaTags?.length) {
    const matches = issue.areaTags.filter((tag) => context.tags.includes(tag)).length;
    weight += matches;
  }
  const seasonBias = issue.seasonBias;
  if (Array.isArray(seasonBias) && seasonBias.length) {
    if (seasonBias.includes(context.season)) {
      weight += 4;
    } else {
      weight *= 0.5;
    }
  }
  if (issue.priorityFlag && state.flags?.[issue.priorityFlag]) {
    weight += 3;
  }
  const roleCount = Array.isArray(issue.roles) && issue.roles.length ? issue.roles.length : 4;
  if (roleCount === 1) {
    weight *= 1.6;
  } else if (roleCount === 2) {
    weight *= 1.3;
  } else if (roleCount === 3) {
    weight *= 1.1;
  } else {
    weight *= 0.75;
  }
  return Math.max(0.1, weight);
}

function scoreOperationalEventSelection(event, state) {
  let weight = Math.max(1, Number(event.baseWeight) || 1);
  const roleId = state.role.id;
  const areaTags = Array.isArray(state.area?.tags) ? state.area.tags : [];

  if (Array.isArray(event.roles) && event.roles.length > 0) {
    if (event.roles.length === 1 && event.roles[0] === roleId) {
      weight += 3;
    } else if (event.roles.includes(roleId)) {
      weight += 1.5;
    }
  }

  if (Array.isArray(event.areaTags) && event.areaTags.length > 0) {
    const matches = event.areaTags.filter((tag) => areaTags.includes(tag)).length;
    weight += matches * 2;
  }

  if (Array.isArray(event.becCodes) && event.becCodes.includes(state.area?.becCode)) {
    weight += 2;
  }

  if (event.options?.some((option) => typeof option?.effects?.permits_approved === "number")) {
    weight += roleId === "permitter" ? 3 : 0;
  }

  if (eventTouchesMetric(event, "compliance") && state.metrics.compliance < 55) {
    weight += 1.5;
  }
  if (eventTouchesMetric(event, "relationships") && state.metrics.relationships < 55) {
    weight += 1.5;
  }
  if (eventTouchesMetric(event, "budget") && state.metrics.budget < 55) {
    weight += 1;
  }
  if (eventTouchesMetric(event, "progress") && state.metrics.progress < 55) {
    weight += 1;
  }

  return Math.max(0.25, weight);
}

function scoreIllegalActSelection(act, state) {
  let weight = 1;
  const actTags = Array.isArray(act?.tags) ? act.tags : [];
  const areaTags = Array.isArray(state.area?.tags) ? state.area.tags : [];
  const profile = getTemptationProfile(state);
  const matchingTags = actTags.filter((tag) => areaTags.includes(tag)).length;
  weight += matchingTags * 2;

  if (Array.isArray(act?.roles) && act.roles.length === 1 && act.roles[0] === state.role.id) {
    weight += 1.5;
  }

  for (const [tag, bonus] of Object.entries(profile.preferredTags || {})) {
    if (actTags.includes(tag)) {
      weight += bonus;
    }
  }

  if (hasMatchingTag(actTags, ETHICS_TEMPTATION_TAGS) && state.metrics?.budget < 50) {
    weight += 2;
  }
  if (hasMatchingTag(actTags, ECOLOGICAL_TEMPTATION_TAGS) && state.metrics?.compliance < 55) {
    weight += 1.5;
  }
  if (hasMatchingTag(actTags, AUDIT_TEMPTATION_TAGS) && state.metrics?.progress < 55) {
    weight += 1;
  }
  if (hasMatchingTag(actTags, COMMUNITY_TEMPTATION_TAGS) && state.metrics?.relationships < 55) {
    weight += 1;
  }

  return Math.max(0.25, weight);
}

function scorePendingIssueCandidateSelection(candidate, issue, state, context) {
  let weight = scoreIssueSelection(issue, state, context) * Math.max(0.1, Number(candidate?.weight) || 1);

  for (const [metric, bonus] of Object.entries(candidate?.metricBoosts || {})) {
    if (Number(state.metrics?.[metric]) < 55) {
      weight += Number(bonus) || 0;
    }
  }

  return Math.max(0.1, weight);
}

function metricsTrendlines(state) {
  const timeline = Array.isArray(state.timeline) ? state.timeline : [];
  const first = timeline.find((entry) => entry?.metrics);
  const last = timeline[timeline.length - 1];
  if (!first?.metrics || !last?.metrics) {
    return {};
  }
  const trend = {};
  for (const key of Object.keys(last.metrics)) {
    const start = Number(first.metrics[key] ?? 0);
    const end = Number(last.metrics[key] ?? 0);
    trend[key] = Math.round(end - start);
  }
  return trend;
}

function buildLegacyReport(metrics, trends, timeline) {
  const seasonSummaries = timeline.map((entry) => {
    const pieces = Object.entries(entry.metrics || {})
      .map(([key, value]) => `${formatMetricName(key)} ${Math.round(value)}`)
      .join(", ");
    return `• ${entry.season}: ${pieces}`;
  });
  const trendLines = Object.entries(trends)
    .filter(([, delta]) => delta !== undefined && delta !== 0)
    .map(([key, delta]) => `${formatMetricName(key)} ${delta > 0 ? "improved" : "declined"} ${Math.abs(delta)} over the year.`);
  return {
    seasonSummaries,
    trendLines,
  };
}

function topDecisions(history = []) {
  const scored = history
    .map((entry) => {
      const magnitude = Object.values(entry.effects || {}).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0);
      return { ...entry, magnitude };
    })
    .filter((entry) => entry.magnitude > 0)
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 3)
    .map((entry) => {
      const delta = formatMetricDelta(entry.effects);
      return `• ${entry.title} – ${entry.option}${delta ? ` (${delta})` : ""}`;
    });
  return scored;
}

function buildAchievements(metrics, trends) {
  const medals = [];
  if (metrics.relationships >= 75 && metrics.compliance >= 65) {
    medals.push("🏅 Balanced Steward – high trust and strong compliance sustained.");
  }
  if (metrics.progress >= 75 && trends.progress >= 5) {
    medals.push("🏅 Production Focus – crews consistently delivered ahead of plan.");
  }
  if (metrics.forestHealth >= 72 && trends.forestHealth >= 4) {
    medals.push("🏅 Ecosystem Guardian – habitat indicators trended upward all year.");
  }
  if (metrics.budget >= 70 && trends.budget >= 0) {
    medals.push("🏅 Fiscal Anchor – reserves positioned the crew for future shocks.");
  }
  if (!medals.length) {
    medals.push("🎖️ Lessons Logged – carry forward insights to tighten next season's plan.");
  }
  return medals;
}

function futureOutlook(metrics, trends, area) {
  const pieces = [];
  if (metrics.forestHealth < 45) {
    pieces.push("Forest health indicators need restorative investment to avoid long-term decline.");
  } else if (trends.forestHealth > 5) {
    pieces.push("Regeneration efforts suggest a resilient canopy in the coming decade.");
  }
  if (metrics.relationships < 40) {
    pieces.push("Community rapport is strained; invest early in dialogue with Nations and municipalities.");
  } else if (metrics.relationships >= 70) {
    pieces.push("Partnership momentum could unlock co-management pilots next cycle.");
  }
  if (metrics.compliance < 35) {
    pieces.push("Compliance risk remains high—expect ministerial oversight until audits stabilize.");
  } else if (metrics.compliance >= 70) {
    pieces.push(`Audit teams cite the ${area.name} program as a benchmark for peers.`);
  }
  if (metrics.budget < 35) {
    pieces.push("Budget buffers are thin; plan for emergency financing or scope reductions.");
  }
  if (!pieces.length) {
    pieces.push("Trajectory is stable. Consider experimenting with innovation pilots next year.");
  }
  return pieces;
}

function eventTouchesMetric(event, metric) {
  return Array.isArray(event?.options)
    && event.options.some((option) => {
      const effects = option?.effects || {};
      if (effects[metric] !== undefined) {
        return true;
      }
      if ((metric === "relationships" || metric === "compliance") && typeof effects.politicalCapital === "number") {
        return true;
      }
      if (metric === "progress" && typeof option?.timeUsed === "number") {
        return true;
      }
      return false;
    });
}

function pickWeightedEntry(weightedPool, rng) {
  const totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return weightedPool.length ? weightedPool[0].event : null;
  }

  let roll = rng() * totalWeight;
  for (const entry of weightedPool) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.event;
    }
  }

  return weightedPool[weightedPool.length - 1]?.event ?? null;
}

function pickWeightedItem(weightedPool, rng, valueKey) {
  const totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return weightedPool.length ? weightedPool[0]?.[valueKey] ?? null : null;
  }

  let roll = rng() * totalWeight;
  for (const entry of weightedPool) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry[valueKey] ?? null;
    }
  }

  return weightedPool[weightedPool.length - 1]?.[valueKey] ?? null;
}

function findIssueById(issueId) {
  return ISSUE_LIBRARY.find((issue) => issue.id === issueId)
    || CHAINED_ISSUES.find((issue) => issue.id === issueId)
    || null;
}

function resolvePendingIssue(state, pending, context, rng) {
  const candidates = Array.isArray(pending?.candidates) ? pending.candidates : null;
  if (!candidates?.length) {
    const issue = findIssueById(pending?.id);
    if (!issue) {
      return null;
    }
    return issueMatchesContext(issue, state, context.tags, { ignoreRequirements: Boolean(pending?.force) }) ? issue : null;
  }

  const weightedPool = candidates
    .map((candidate) => {
      const issue = findIssueById(candidate?.id);
      if (!issue) {
        return null;
      }
      const ignoreRequirements = Boolean(pending?.force || candidate?.force);
      if (!issueMatchesContext(issue, state, context.tags, { ignoreRequirements })) {
        return null;
      }
      return {
        issue,
        candidate,
        weight: scorePendingIssueCandidateSelection(candidate, issue, state, context),
        resolvedIssue: annotatePendingIssue(issue, candidate, state),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight || a.issue.id.localeCompare(b.issue.id));

  return pickWeightedItem(weightedPool, rng, "resolvedIssue");
}

function annotatePendingIssue(issue, candidate, state) {
  const surfaceReason = buildPendingIssueSurfaceReason(candidate, state);
  const surfaceSeverity = issuePreviewSeverity(issue);
  if (!surfaceReason) {
    return surfaceSeverity === "info"
      ? issue
      : {
          ...issue,
          surfaceSeverity,
        };
  }
  return {
    ...issue,
    surfaceReason,
    surfaceSeverity,
  };
}

function buildPendingIssueSurfaceReason(candidate, state) {
  const boosts = Object.entries(candidate?.metricBoosts || {})
    .map(([metric, bonus]) => ({ metric, bonus: Number(bonus) || 0 }))
    .filter((entry) => entry.bonus > 0);

  if (!boosts.length) {
    return candidate?.force
      ? "Why this surfaced: this was the strongest remaining follow-up path from the shortcut."
      : undefined;
  }

  const activeBoosts = boosts.filter((entry) => Number(state.metrics?.[entry.metric]) < 55);
  const pool = activeBoosts.length ? activeBoosts : boosts;
  pool.sort((a, b) => {
    if (b.bonus !== a.bonus) {
      return b.bonus - a.bonus;
    }
    return pressurePriority(a.metric) - pressurePriority(b.metric);
  });

  const dominant = pool[0];
  const explanation = PENDING_PRESSURE_EXPLANATIONS[dominant.metric];
  if (!explanation) {
    return candidate?.force
      ? "Why this surfaced: this branch carried the strongest follow-up pressure from the shortcut."
      : undefined;
  }
  return `Why this surfaced: ${explanation}`;
}

function pressurePriority(metric) {
  const index = PENDING_PRESSURE_PRIORITY.indexOf(metric);
  return index === -1 ? PENDING_PRESSURE_PRIORITY.length : index;
}

export function adaptOperationalEventEffects(effects = {}, option = {}) {
  const mapped = {};

  const add = (metric, delta) => {
    const value = Number(delta);
    if (!Number.isFinite(value) || value === 0) {
      return;
    }
    mapped[metric] = (mapped[metric] || 0) + value;
  };

  if (typeof effects.progress === "number") {
    add("progress", effects.progress);
  }
  if (typeof effects.forestHealth === "number") {
    add("forestHealth", effects.forestHealth);
  }
  if (typeof effects.relationships === "number") {
    add("relationships", effects.relationships);
  }
  if (typeof effects.compliance === "number") {
    add("compliance", effects.compliance);
  }
  if (typeof effects.budget === "number") {
    add("budget", normalizeBudgetDelta(effects.budget));
  }

  if (typeof effects.politicalCapital === "number") {
    add("relationships", scaleDerivedEffect(effects.politicalCapital, 0.6));
    add("compliance", scaleDerivedEffect(effects.politicalCapital, 0.25));
  }

  const timeUsed = Number.isFinite(option?.timeUsed) ? option.timeUsed : effects.timeUsed;
  if (typeof timeUsed === "number") {
    add("progress", -Math.max(1, Math.round(Math.abs(timeUsed) * 1.4)));
  }

  if (typeof effects.crew_morale === "number") {
    add("relationships", scaleDerivedEffect(effects.crew_morale, 0.45));
    add("progress", scaleDerivedEffect(effects.crew_morale, 0.2));
  }

  if (typeof effects.crew_health === "number") {
    add("progress", scaleDerivedEffect(effects.crew_health, 0.35));
    add("compliance", scaleDerivedEffect(effects.crew_health, 0.2));
  }

  if (typeof effects.equipment === "number") {
    add("progress", scaleDerivedEffect(effects.equipment, 0.3));
    add("budget", scaleDerivedEffect(effects.equipment, 0.15));
  }

  if (typeof effects.fuel === "number") {
    add("progress", scaleDerivedEffect(effects.fuel, 0.2));
    add("budget", scaleDerivedEffect(effects.fuel, 0.25));
  }

  if (typeof effects.food === "number") {
    add("progress", scaleDerivedEffect(effects.food, 0.25));
    add("relationships", scaleDerivedEffect(effects.food, 0.2));
  }

  if (typeof effects.firstAid === "number") {
    add("compliance", scaleDerivedEffect(effects.firstAid, 0.25));
    add("progress", scaleDerivedEffect(effects.firstAid, 0.15));
  }

  if (typeof effects.permits_approved === "number") {
    add("progress", Math.round(effects.permits_approved * 4));
    add("compliance", Math.round(effects.permits_approved * 2));
  }

  if (typeof effects.scrutiny === "number") {
    add("compliance", -scaleDerivedEffect(effects.scrutiny, 0.6));
    add("relationships", -scaleDerivedEffect(effects.scrutiny, 0.3));
  }

  return Object.fromEntries(
    Object.entries(mapped).filter(([, value]) => Number.isFinite(value) && value !== 0)
  );
}

function normalizeBudgetDelta(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return 0;
  }
  if (Math.abs(numeric) <= 20) {
    return numeric;
  }
  return clamp(Math.round(numeric / 600), -12, 12);
}

function scaleDerivedEffect(value, multiplier) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return 0;
  }

  const scaled = Math.round(numeric * multiplier);
  if (scaled !== 0) {
    return scaled;
  }
  return numeric > 0 ? 1 : -1;
}

export function adaptOperationalEvent(event, state) {
  const domain = ROLE_EVENT_DOMAINS[state?.role?.id] || "desk";
  const flavorBits = [`Adapted ${domain} event`];
  if (event.type) {
    flavorBits.push(humanizeLabel(event.type));
  }

  return {
    id: event.id,
    title: event.title,
    description: buildOperationalEventDescription(event),
    flavor: flavorBits.join(" • "),
    options: (event.options || []).map((option) => ({
      label: option.label,
      outcome: option.outcome,
      effects: adaptOperationalEventEffects(option.effects || {}, option),
      scheduleEvents: option.schedulesEvent
        ? {
            id: option.schedulesEvent,
            delay: normaliseScheduledEventDelay(option.scheduledDelay),
          }
        : undefined,
    })),
  };
}

export function adaptIllegalActTemptation(act, state, rng = Math.random) {
  const profile = getTemptationProfile(state);
  const rawSuccessEffects = buildIllegalActSuccessEffects(act, state, rng);
  const rawFailEffects = buildIllegalActFailEffects(act, state, rawSuccessEffects);
  const failFlags = buildIllegalActFailFlags(act);

  return {
    id: `temptation:${act.id}`,
    title: act.title,
    description: buildIllegalActDescription(act, state),
    flavor: `Adapted temptation • ${profile.flavor}`,
    options: [
      {
        label: "Refuse and keep it clean",
        outcome: "You walk away. It keeps the season slower, but the file stays defensible.",
        effects: adaptOperationalEventEffects(buildIllegalActRefuseEffects(state)),
      },
      {
        label: "Take the shortcut (high risk)",
        outcome: "You attempt something risky...",
        risk: {
          baseSuccess: getIllegalActBaseSuccess(act, state),
          successEffects: adaptOperationalEventEffects(rawSuccessEffects),
          failEffects: adaptOperationalEventEffects(rawFailEffects),
          successOutcome: "The shortcut lands for now. The gains show up immediately, and the exposure stays buried this season.",
          failOutcome: "The shortcut unravels fast. Questions start landing before you can shape the story.",
          failFlags,
          failScheduleIssues: buildIllegalActFailScheduleIssues(act, state),
        },
      },
      {
        label: "Document and report",
        outcome: "You put the concern on record. It slows the work, but strengthens your position if scrutiny follows.",
        effects: adaptOperationalEventEffects(buildIllegalActReportEffects(state)),
      },
    ],
  };
}

function buildOperationalEventDescription(event) {
  const details = [];
  if (event.description) {
    details.push(event.description);
  }

  if (Array.isArray(event.areaTags) && event.areaTags.length > 0) {
    details.push(`Context: ${event.areaTags.slice(0, 2).map(humanizeLabel).join(", ")}.`);
  } else if (Array.isArray(event.becCodes) && event.becCodes.length > 0) {
    details.push(`BEC focus: ${event.becCodes.join(", ")}.`);
  }

  return details.join("\n\n");
}

function buildIllegalActDescription(act, state) {
  const details = [String(act.description || "A tempting shortcut appears.")];
  const relevantTags = (Array.isArray(act.tags) ? act.tags : [])
    .filter((tag) => tag !== state?.role?.id)
    .slice(0, 3);
  if (relevantTags.length) {
    details.push(`Pressure points: ${relevantTags.map(humanizeLabel).join(", ")}.`);
  }
  return details.join("\n\n");
}

function buildIllegalActSuccessEffects(act, state, rng) {
  const profile = getTemptationProfile(state);
  const gain = rollRange(profile.gainRange[0], profile.gainRange[1], rng);
  const effects = {
    ...profile.successBaseEffects,
    budget: gain,
  };

  applyIllegalActTagEffects(effects, act);
  return effects;
}

function buildIllegalActFailEffects(act, state, successEffects) {
  const profile = getTemptationProfile(state);
  const successBudget = Number(successEffects?.budget || 0);
  const effects = {
    ...profile.failConfig.effects,
    budget: -Math.max(profile.failConfig.budgetMin, Math.round(successBudget * profile.failConfig.budgetMultiplier)),
  };

  if (hasMatchingTag(act?.tags, ECOLOGICAL_TEMPTATION_TAGS)) {
    effects.forestHealth = (effects.forestHealth || 0) - 8;
  }
  if (hasMatchingTag(act?.tags, COMMUNITY_TEMPTATION_TAGS)) {
    effects.relationships = (effects.relationships || 0) - 6;
  }
  if (hasMatchingTag(act?.tags, AUDIT_TEMPTATION_TAGS)) {
    effects.compliance = (effects.compliance || 0) - 5;
  }

  return effects;
}

function buildIllegalActRefuseEffects(state) {
  return { ...getTemptationProfile(state).refuseEffects };
}

function buildIllegalActReportEffects(state) {
  return { ...getTemptationProfile(state).reportEffects };
}

function applyIllegalActTagEffects(effects, act) {
  if (hasMatchingTag(act?.tags, ECOLOGICAL_TEMPTATION_TAGS)) {
    effects.forestHealth = (effects.forestHealth || 0) - 6;
  }
  if (hasMatchingTag(act?.tags, COMMUNITY_TEMPTATION_TAGS)) {
    effects.relationships = (effects.relationships || 0) - 4;
  }
  if (hasMatchingTag(act?.tags, ETHICS_TEMPTATION_TAGS)) {
    effects.compliance = (effects.compliance || 0) - 4;
  }
  if (hasMatchingTag(act?.tags, AUDIT_TEMPTATION_TAGS)) {
    effects.compliance = (effects.compliance || 0) - 3;
  }
}

function buildIllegalActFailFlags(act) {
  const flags = {};
  const tags = Array.isArray(act?.tags) ? act.tags : [];

  if (hasMatchingTag(tags, AUDIT_TEMPTATION_TAGS)) {
    flags.auditTriggered = true;
  }
  if (hasMatchingTag(tags, ECOLOGICAL_TEMPTATION_TAGS)) {
    flags.environmentalAudit = true;
  }
  if (tags.some((tag) => ["bribery", "collusion", "corruption", "laundering", "payroll", "double-dip"].includes(tag))) {
    flags.ethicsInquiry = true;
  }
  if (tags.some((tag) => ["cultural"].includes(tag))) {
    flags.culturalViolation = true;
  }
  if (tags.some((tag) => ["blatant", "sabotage", "espionage"].includes(tag))) {
    flags.underInvestigation = true;
  }

  return flags;
}

function buildIllegalActFailScheduleIssues(act, state) {
  const roleId = state?.role?.id;
  const tags = new Set(Array.isArray(act?.tags) ? act.tags : []);
  const candidates = new Map();
  const addCandidate = (id, weight, metricBoosts = null) => {
    if (!id) {
      return;
    }
    const current = candidates.get(id) || { id, weight: 0, force: true, metricBoosts: {} };
    current.weight += weight;
    if (metricBoosts && typeof metricBoosts === "object") {
      for (const [metric, bonus] of Object.entries(metricBoosts)) {
        current.metricBoosts[metric] = (current.metricBoosts[metric] || 0) + (Number(bonus) || 0);
      }
    }
    candidates.set(id, current);
  };

  if (roleId === "planner" || roleId === "permitter") {
    if (hasAnyTag(tags, ["mapping", "data", "modeling", "reporting", "monitoring"])) {
      addCandidate(roleId === "planner" ? "ministry-data-audit" : "fom-consistency-gap", 4, { progress: 1.5, compliance: 1 });
      addCandidate("fpbc-competence-audit", 1.5, { compliance: 1.5 });
    }
    if (hasAnyTag(tags, ["procurement", "paperwork", "compliance", "forgery", "collusion", "bribery", "corruption", "grants"])) {
      addCandidate("budget-freeze", 3.5, { budget: 2.5, compliance: 2, progress: 1 });
      addCandidate("fpbc-competence-audit", 2, { compliance: 1.5 });
    }
    if (hasAnyTag(tags, ["cultural"])) {
      addCandidate("heritage-protocol-gap", 3.5, { relationships: 3, compliance: 1 });
      addCandidate("archaeology-escalation-pause", 2.5, { relationships: 2, progress: 1 });
    }
    if (hasAnyTag(tags, ["access", "riparian", "engineering"])) {
      addCandidate("road-use-permit-standoff", 3, { progress: 2, compliance: 1.5 });
    }
    if (hasAnyTag(tags, ["remote-camps", "gas-interface"])) {
      addCandidate("special-use-permit-stack", 2.5, { progress: 1.5, budget: 1 });
    }
  }

  if (roleId === "recce" || roleId === "silviculture") {
    if (hasAnyTag(tags, ["wildlife"])) {
      addCandidate("wildlife-collar-drop", 4, { forestHealth: 2.5, relationships: 2 });
    }
    if (hasAnyTag(tags, ["riparian", "salvage", "fire", "erosion", "old-growth"])) {
      addCandidate(
        roleId === "silviculture" ? "environmental-audit-fallout" : "riparian-reclassification-call",
        4,
        { forestHealth: 3, compliance: 2 }
      );
    }
    if (roleId === "silviculture" && hasAnyTag(tags, ["herbicide"])) {
      addCandidate("herbicide-drift-complaint", 4, { forestHealth: 2.5, relationships: 1.5, compliance: 1.5 });
      addCandidate("environmental-audit-fallout", 2, { forestHealth: 2, compliance: 1.5 });
    }
    if (roleId === "silviculture" && hasAnyTag(tags, ["nursery", "stocking", "automation", "seed"])) {
      addCandidate("seedlot-vigour-drop", 3.5, { forestHealth: 2.5, progress: 1 });
      addCandidate("free-growing-catchup-plan", 2.5, { forestHealth: 2, progress: 1, budget: 0.5 });
    }
    if (roleId === "recce" && hasAnyTag(tags, ["drones", "media", "access", "aviation"])) {
      addCandidate("compliance-drone-sweep", 3.5, { compliance: 2.5, relationships: 1 });
    }
    if (hasAnyTag(tags, ["remote-camps", "gas-interface"])) {
      addCandidate("special-use-permit-stack", 2.5, { progress: 1.5, budget: 1 });
    }
  }

  if (hasAnyTag(tags, ["fraud", "fabrication", "deception", "records", "paperwork", "monitoring"])) {
    addCandidate("fpbc-competence-audit", 2, { compliance: 2 });
  }
  if (hasAnyTag(tags, ["bribery", "collusion", "corruption", "laundering", "payroll", "double-dip", "blatant", "sabotage", "espionage"])) {
    addCandidate("formal-investigation", 3, { compliance: 2, relationships: 1.5 });
  }
  if (roleId === "planner" && hasAnyTag(tags, ["old-growth", "riparian", "wildlife"])) {
    addCandidate("environmental-audit-fallout", 2.5, { forestHealth: 2.5, compliance: 1.5 });
  }

  const weightedCandidates = Array.from(candidates.values())
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  if (!weightedCandidates.length) {
    return [];
  }

  return [{
    delay: 1,
    force: true,
    candidates: weightedCandidates,
  }];
}

function getIllegalActBaseSuccess(act, state) {
  const profile = getTemptationProfile(state);
  let success = profile.baseSuccess;

  if (hasMatchingTag(act?.tags, ETHICS_TEMPTATION_TAGS)) {
    success -= 0.08;
  }
  if (hasMatchingTag(act?.tags, ECOLOGICAL_TEMPTATION_TAGS)) {
    success -= 0.06;
  }
  if (hasMatchingTag(act?.tags, AUDIT_TEMPTATION_TAGS)) {
    success += 0.02;
  }
  if (hasMatchingTag(act?.tags, COMMUNITY_TEMPTATION_TAGS)) {
    success -= 0.02;
  }

  return clamp(success, 0.16, 0.65);
}

function hasMatchingTag(tags, tagSet) {
  if (!Array.isArray(tags) || !tags.length) {
    return false;
  }
  return tags.some((tag) => tagSet.has(tag));
}

function rollRange(min, max, rng) {
  return Math.round(min + (max - min) * rng());
}

function humanizeLabel(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normaliseScheduledEventDelay(delay) {
  const numeric = Number(delay);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1;
  }
  return Math.max(1, Math.min(2, Math.ceil(numeric / 4)));
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

function normalizeScheduleEntries(scheduleSpec) {
  if (Array.isArray(scheduleSpec)) {
    return scheduleSpec
      .filter((entry) => isValidScheduleEntry(entry))
      .map((entry) => normalizeScheduleEntry(entry));
  }
  if (isValidScheduleEntry(scheduleSpec)) {
    return [normalizeScheduleEntry(scheduleSpec)];
  }
  return [];
}

function hasAnyTag(tagSet, candidates) {
  for (const candidate of candidates) {
    if (tagSet.has(candidate)) {
      return true;
    }
  }
  return false;
}

function isValidScheduleEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  if (typeof entry.id === "string") {
    return true;
  }
  return Array.isArray(entry.candidates) && entry.candidates.some((candidate) => typeof candidate?.id === "string");
}

function normalizeScheduleEntry(entry) {
  return {
    ...(typeof entry.id === "string" ? { id: entry.id } : {}),
    ...(Array.isArray(entry.candidates)
      ? {
          candidates: entry.candidates
            .filter((candidate) => typeof candidate?.id === "string")
            .map((candidate) => ({
              id: candidate.id,
              weight: candidate.weight,
              ...(candidate.metricBoosts && typeof candidate.metricBoosts === "object"
                ? { metricBoosts: { ...candidate.metricBoosts } }
                : {}),
              ...(candidate.force ? { force: true } : {}),
            })),
        }
      : {}),
    ...(entry.force ? { force: true } : {}),
    delay: entry.delay,
  };
}

function pendingIssueKey(entry) {
  if (typeof entry?.id === "string") {
    return `id:${entry.id}`;
  }
  if (Array.isArray(entry?.candidates)) {
    const ids = entry.candidates
      .map((candidate) => candidate?.id)
      .filter(Boolean)
      .sort()
      .join("|");
    return `candidates:${ids}`;
  }
  return null;
}

function buildScheduledIssueTeaser(state, scheduleSpec) {
  const schedules = normalizeScheduleEntries(scheduleSpec)
    .slice()
    .sort((a, b) => {
      const delayA = Math.max(0, Number(a?.delay || 0));
      const delayB = Math.max(0, Number(b?.delay || 0));
      return delayA - delayB;
    });

  if (!schedules.length) {
    return null;
  }

  const tags = state?.area?.tags || [];
  const seasonIndex = Math.max(0, Math.min(SEASONS.length - 1, (state?.round || 1) - 1));
  const season = SEASONS[seasonIndex];

  for (const schedule of schedules) {
    const preview = resolvePendingIssue(state, schedule, { tags, season }, () => 0);
    if (preview) {
      return formatScheduledIssueTeaser(preview);
    }
  }

  return null;
}

function formatScheduledIssueTeaser(issue) {
  if (!issue?.title) {
    return null;
  }

  const severity = issuePreviewSeverity(issue);
  const label = ISSUE_PREVIEW_SEVERITY_LABELS[severity] || "notable";
  const reason = String(issue.surfaceReason || "").replace(/^Why this surfaced:\s*/i, "").trim();
  const prefix = `Likely fallout (${label}): ${issue.title}.`;
  if (reason) {
    return { text: `${prefix} ${reason}`, severity, issueId: issue.id };
  }
  return { text: prefix, severity, issueId: issue.id };
}

function combineScheduledIssueTeasers(...teasers) {
  const unique = [];
  let severity = "info";
  for (const teaser of teasers) {
    if (!teaser || typeof teaser.text !== "string" || !teaser.text.trim() || unique.includes(teaser.text)) {
      continue;
    }
    unique.push(teaser.text);
    if (previewSeverityRank(teaser.severity) > previewSeverityRank(severity)) {
      severity = teaser.severity;
    }
  }
  return unique.length ? { text: unique.join("\n\n"), severity } : null;
}

function issuePreviewSeverity(issue) {
  return ISSUE_PREVIEW_SEVERITY[issue?.id] || "info";
}

function previewSeverityRank(severity) {
  switch (severity) {
    case "danger":
      return 2;
    case "warning":
      return 1;
    default:
      return 0;
  }
}
