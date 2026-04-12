export const SEASONS = ["Spring Planning", "Summer Field", "Fall Integration", "Winter Review"];
export const ISSUE_REPEAT_COOLDOWN_ROUNDS = 2;
export const EVENT_REPEAT_COOLDOWN_ROUNDS = 2;
export const TEMPTATION_REPEAT_COOLDOWN_ROUNDS = 2;
export const BUDGET_ATTRITION_THRESHOLD = 25;
export const RELATIONSHIP_TRUST_THRESHOLD = 35;
export const COMPLIANCE_AUDIT_THRESHOLD = 40;
export const DEFAULT_CPD_TARGET = 30;

export const ROLE_EVENT_DOMAINS = {
  planner: "desk",
  permitter: "desk",
  recce: "field",
  silviculture: "field",
};

export const ROLE_JOURNEY_TYPES = {
  planner: ["planning", "desk"],
  permitter: ["permitting", "desk"],
  recce: ["recon", "field"],
  silviculture: ["silviculture", "field"],
};

export const PENDING_PRESSURE_PRIORITY = ["relationships", "budget", "compliance", "forestHealth", "progress"];

export const PENDING_PRESSURE_EXPLANATIONS = {
  relationships: "relationship damage made the trust-and-protocol branch the likeliest consequence.",
  budget: "budget stress made the finance-and-audit branch the likeliest consequence.",
  compliance: "compliance weakness made the scrutiny-heavy branch the likeliest consequence.",
  forestHealth: "ecological stress made the habitat-and-remediation branch the likeliest consequence.",
  progress: "schedule strain made the rework-heavy branch the likeliest consequence.",
};

export const ISSUE_PREVIEW_SEVERITY = {
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

export const ISSUE_PREVIEW_SEVERITY_LABELS = {
  danger: "serious",
  warning: "manageable",
  info: "minor",
};

export const ECOLOGICAL_TEMPTATION_TAGS = new Set([
  "wildlife",
  "riparian",
  "fire",
  "erosion",
  "herbicide",
  "nursery",
  "salvage",
  "old-growth",
]);

export const ETHICS_TEMPTATION_TAGS = new Set([
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

export const AUDIT_TEMPTATION_TAGS = new Set([
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

export const COMMUNITY_TEMPTATION_TAGS = new Set(["cultural", "community", "labour", "media"]);

export const ROLE_TEMPTATION_PROFILES = {
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
