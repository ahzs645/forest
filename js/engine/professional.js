import { getAreaComplianceProfile } from "../data/professionalPractice.js";
import { DEFAULT_CPD_TARGET } from "./constants.js";

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
