export const SEASONS = ["Spring Planning", "Summer Field", "Fall Close-out", "Winter Operations"];
export const ISSUE_REPEAT_COOLDOWN_ROUNDS = 2;
export const EVENT_REPEAT_COOLDOWN_ROUNDS = 2;
// One round, not two: with only three eligible seasons a year (round 1 never
// tempts), a two-round cooldown capped the whole 208-act temptation deck at
// one appearance per year and most years saw none.
export const TEMPTATION_REPEAT_COOLDOWN_ROUNDS = 1;
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

// The shortcut as a three-band gamble, by act tier: clean (the payoff, and it
// stays buried), noticed (the payoff, and somebody wrote down what they saw),
// caught (the institution named on the act does what it does). Same base odds
// as the deployment card (js/events/selection.js buildShortcutOption); the
// state of the file then moves them (js/risk.js riskBandOdds).
export const SHORTCUT_BAND_ODDS = {
  core: { clean: 0.5, noticed: 0.3 },
  grey: { clean: 0.6, noticed: 0.25 },
  comic: { clean: 0.45, noticed: 0.3 },
};

// Odds shifts the seasonal shortcut applies on top of the tier base. Doing it
// again is how people get caught, and an institution already reading the file
// reads the next one properly.
export const SHORTCUT_ODDS_SHIFTS = {
  priorShortcutThisYear: -0.15,
  alreadyWatched: -0.2,
  ethicsTag: -0.08,
  ecologicalTag: -0.06,
  auditTag: 0.02,
  communityTag: -0.02,
};

// What the clean band costs besides the payoff: the paper trail is now the
// problem (the deployment card's "+3 scrutiny"), the ground pays for an
// ecological act whether or not anyone looks, and a community act is noticed
// by the people it was done to.
export const SHORTCUT_CLEAN_BAND_COSTS = {
  compliance: -2,
  ecologicalForestHealth: -3,
  communityRelationships: -2,
};

// The noticed band lands the payoff and leaves a watch flag; "somebody wrote
// it down" costs a file about what the payoff was worth (the deployment
// card's "+8 scrutiny, -2 compliance"), so only a clean take is a clear win.
export const SHORTCUT_NOTICED_BAND_COSTS = { compliance: -4, relationships: -2 };

// How an act's payoff (js/data/illegalActs.js) lands on the five seasonal
// meters. Dollars go to Budget; time, files, volume and shifts of work go to
// Progress. Sized so a single clean take is a visible gain (a season's careful
// play moves a meter 5–8 points) without one shortcut deciding the year.
export const SHORTCUT_PAYOFF_SCALE = {
  budget: { perPoint: 1500, min: 4, max: 10 },
  time: { base: 3, perPoint: 2.5, min: 5, max: 10 },
  progress: { base: 4, perShift: 3, min: 5, max: 10 },
  files: { base: 4, perFile: 3, min: 5, max: 10 },
  volume: { base: 4, perPoint: 400, min: 5, max: 9 },
};

// Temptation chances are tuned so a typical year meets roughly one shortcut
// offer (P(none) ≈ 0.25–0.3 before pressure bonuses) instead of the old
// ~0.07 per season, which left the temptation deck effectively unplayed.
// `failConfig` is the caught band: the immediate cost when the institution
// named on the act catches it. Budget is in dollars (normalizeBudgetDelta puts
// it on the meter) and never less than the payoff plus a fifth.
export const ROLE_TEMPTATION_PROFILES = {
  planner: {
    flavor: "Bureaucratic shortcut",
    chance: {
      base: 0.26,
      lateSeasonBonus: 0.12,
      cap: 0.5,
      pressure: {
        budget: { threshold: 34, bonus: 0.04 },
        progress: { threshold: 42, bonus: 0.04 },
        compliance: { threshold: 42, bonus: 0.03 },
        relationships: { threshold: 34, bonus: 0.01 },
      },
    },
    failConfig: {
      budgetMin: 2400,
      budgetMultiplier: 1.2,
      effects: { politicalCapital: -10, compliance: -14, relationships: -8, progress: -6 },
    },
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
      base: 0.28,
      lateSeasonBonus: 0.12,
      cap: 0.52,
      pressure: {
        budget: { threshold: 35, bonus: 0.05 },
        progress: { threshold: 42, bonus: 0.04 },
        compliance: { threshold: 42, bonus: 0.04 },
        relationships: { threshold: 35, bonus: 0.02 },
      },
    },
    failConfig: {
      budgetMin: 2600,
      budgetMultiplier: 1.25,
      effects: { politicalCapital: -12, compliance: -15, relationships: -9, progress: -6 },
    },
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
      base: 0.3,
      lateSeasonBonus: 0.14,
      cap: 0.55,
      pressure: {
        budget: { threshold: 35, bonus: 0.05 },
        progress: { threshold: 40, bonus: 0.04 },
        compliance: { threshold: 40, bonus: 0.03 },
        relationships: { threshold: 32, bonus: 0.02 },
      },
    },
    failConfig: {
      budgetMin: 450,
      budgetMultiplier: 0.9,
      effects: { equipment: -15, crew_morale: -10, compliance: -12, progress: -8 },
    },
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
      base: 0.32,
      lateSeasonBonus: 0.14,
      cap: 0.58,
      pressure: {
        budget: { threshold: 34, bonus: 0.05 },
        progress: { threshold: 38, bonus: 0.04 },
        compliance: { threshold: 38, bonus: 0.04 },
        relationships: { threshold: 32, bonus: 0.02 },
      },
    },
    failConfig: {
      budgetMin: 500,
      budgetMultiplier: 0.9,
      effects: { equipment: -16, crew_morale: -10, compliance: -12, progress: -9 },
    },
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
