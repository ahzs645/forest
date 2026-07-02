/**
 * Journey Factory
 * Creates journey state objects for all game modes
 */

import { FIELD_DISTANCE_SCALE, ROLE_JOURNEY_TYPES } from "./constants.js";
import { generateCrew } from "../crew.js";
import { createFieldResources, createDeskResources } from "../resources.js";
import {
  getBlocksForArea,
  getRandomWeather,
  getTemperature,
} from "../data/blocks.js";
import { getPlanningCadenceDays } from "../data/planningBlocks.js";
import { createSeasonState } from "../season.js";
import { createProfessionalComplianceState } from "../engine.js";

/**
 * Campaign-scale tuning (see docs/unified_campaign.md, section 3).
 * `createJourney({ ..., scale: 'campaign' })` shrinks a normal, full-length
 * journey down to a single ~8-12 in-game-day campaign season deployment.
 * These constants and applyCampaignScale() are the only place that
 * shrinkage happens - every creator below still builds its normal,
 * full-size journey first and only trims it at the very end when scale is
 * requested, so unscaled createJourney() calls are unaffected.
 */
const CAMPAIGN_RECON_BLOCK_COUNT = 6;
const CAMPAIGN_STOCKPILE_SCALE = 0.45; // per-run field stockpiles (fuel/food/budget/...)
const CAMPAIGN_BUDGET_SCALE = 0.5; // desk-role (planning/permitting) budgets
// Resources that read as a condition/percentage (0-100) rather than a
// depletable per-run stockpile - campaign scaling leaves these alone.
const CAMPAIGN_PERCENT_RESOURCE_KEYS = new Set(["equipment"]);

/**
 * Trim an area's block list to a coherent, order-preserving subset for a
 * campaign-length recon/field traverse. Keeps the first supply-bearing
 * block if the natural leading subset would otherwise drop it.
 */
function selectCampaignBlocks(blocks, count = CAMPAIGN_RECON_BLOCK_COUNT) {
  if (!Array.isArray(blocks) || blocks.length <= count) {
    return blocks.slice();
  }
  const subset = blocks.slice(0, count);
  if (!subset.some((block) => block.hasSupply)) {
    const firstSupplyBlock = blocks.find((block) => block.hasSupply);
    if (firstSupplyBlock) {
      subset[subset.length - 1] = firstSupplyBlock;
    }
  }
  return subset;
}

/**
 * Scale per-run stockpile resources (fuel, food, budget, firstAid, ...) down
 * for a campaign deployment, leaving percentage/condition resources (like
 * equipment 0-100) untouched.
 */
function scaleStockpileResources(resources, factor = CAMPAIGN_STOCKPILE_SCALE) {
  const scaled = { ...resources };
  for (const key of Object.keys(scaled)) {
    if (CAMPAIGN_PERCENT_RESOURCE_KEYS.has(key)) continue;
    if (typeof scaled[key] !== "number") continue;
    scaled[key] = Math.round(scaled[key] * factor);
  }
  return scaled;
}

/**
 * Shrink a fully-built journey down to a campaign-season deployment
 * (~8-12 in-game days). Applied once, after a creator has assembled its
 * normal full-length journey. See docs/unified_campaign.md section 3 for
 * the target numbers per role. Difficulty multipliers
 * (applyDifficultyMultipliers in js/game/ForestryTrailGame.js) run after
 * this, unchanged.
 */
function applyCampaignScale(journey, journeyType) {
  switch (journeyType) {
    case "field": {
      journey.blocks = selectCampaignBlocks(journey.blocks);
      journey.totalDistance = journey.blocks.reduce((sum, block) => sum + block.distance, 0);
      journey.resources = scaleStockpileResources(journey.resources);
      return journey;
    }
    case "silviculture": {
      journey.planting.blocksToPlant = 5;
      journey.planting.seedlingsAllocated = 80000;
      journey.brushing.hectaresTarget = 150;
      journey.surveys.freeGrowingTarget = 2;
      journey.resources.seedlings = 80000;
      journey.resources.budget = 45000;
      journey.resources.contractorCapacity = Math.round(
        journey.resources.contractorCapacity * CAMPAIGN_STOCKPILE_SCALE,
      );
      return journey;
    }
    case "planning": {
      journey.deadline = 12;
      journey.resources.budget = Math.round(journey.resources.budget * CAMPAIGN_BUDGET_SCALE);
      return journey;
    }
    case "permitting": {
      journey.permits.target = 5;
      journey.deadline = 12;
      journey.resources.budget = Math.round(journey.resources.budget * CAMPAIGN_BUDGET_SCALE);
      return journey;
    }
    case "manager":
      // Manager is not one of the four campaign roles (recon/silviculture/
      // planning/permitting) - the campaign never deploys it, so a caller
      // asking for a campaign-scale manager journey is a bug upstream.
      throw new Error(
        'createManagerJourney: scale "campaign" is not supported - manager is not used by the campaign (see docs/unified_campaign.md, sections 2 and 3).',
      );
    default:
      return journey;
  }
}

/**
 * Factory function to create the appropriate journey type
 * Routes to specialized journey creators based on role
 * @param {Object} options - Setup options including roleId
 * @returns {Object} Journey state for the appropriate type
 */
export function createJourney(options = {}) {
  const roleId = options.roleId || options.role?.id;
  const journeyType = ROLE_JOURNEY_TYPES[roleId];

  switch (journeyType) {
    case "recon":
      return createReconJourney(options);
    case "silviculture":
      return createSilvicultureJourney(options);
    case "planning":
      return createPlanningJourney(options);
    case "permitting":
      return createPermittingJourney(options);
    case "manager":
      return createManagerJourney(options);
    default: {
      // Fallback to legacy field/desk based on role's journeyType property
      const legacyType = options.role?.journeyType || "field";
      if (legacyType === "desk") {
        return createDeskJourney(options);
      }
      return createFieldJourney(options);
    }
  }
}

/**
 * Create recon journey (enhanced field journey for Recon Crew Lead)
 */
export function createReconJourney(options = {}) {
  const baseJourney = createFieldJourney(options);
  const roleId = options.roleId || options.role?.id || "recce";
  // baseJourney.resources is already campaign-scaled by createFieldJourney
  // when scale is "campaign" (blocks/totalDistance too), so only the two
  // recon-only stockpiles added below need scaling to match.
  const campaignScale = options.scale === "campaign";

  return {
    ...baseJourney,
    journeyType: "recon",

    // Season integration
    season: createSeasonState(roleId),
    scrutiny: 28,

    // Recon-specific tracking
    blocksAssessed: 0,
    qualitySurveys: 0,
    verifiedBlocks: 0,
    hazardsDocumented: [],
    culturalSitesReported: [],

    // Recon resources (extend field resources)
    resources: {
      ...baseJourney.resources,
      gpsUnits: campaignScale ? Math.round(5 * CAMPAIGN_STOCKPILE_SCALE) : 5,
      flaggingTape: campaignScale ? Math.round(50 * CAMPAIGN_STOCKPILE_SCALE) : 50,
    },
    professional: createProfessionalComplianceState(
      roleId,
      baseJourney.area || baseJourney.areaId || options.area || options.areaId || null,
    ),

    discoveryTags: [],
  };
}

/**
 * Create silviculture journey (contractor management mode)
 */
export function createSilvicultureJourney(options = {}) {
  const { roleId, areaId, companyName, crewName, crew, role, area } = options;
  const effectiveAreaId = areaId || area?.id;
  const effectiveRoleId = roleId || role?.id || "silviculture";

  const journey = {
    journeyType: "silviculture",

    // Area blocks give event selection terrain/feature context, opening the
    // full field event pool to silviculture runs (the program works these
    // blocks even though travel is contractor-managed).
    blocks: getBlocksForArea(effectiveAreaId),
    currentBlockIndex: 0,
    companyName: companyName || crewName || "Unnamed Crew",
    roleId: effectiveRoleId,
    areaId: effectiveAreaId,
    role,
    area,
    professional: createProfessionalComplianceState(effectiveRoleId, area || effectiveAreaId),

    // Season integration
    season: createSeasonState(effectiveRoleId),
    scrutiny: 12,
    day: 1,

    // Planting Program
    planting: {
      seedlingsAllocated: 250000,
      seedlingsPlanted: 0,
      survivalRate: 85,
      blocksToPlant: 15,
      blocksPlanted: 0,
    },

    // Brushing/Herbicide
    brushing: {
      hectaresTarget: 500,
      hectaresComplete: 0,
    },

    // Surveys
    surveys: {
      freeGrowingTarget: 5,
      freeGrowingComplete: 0,
      regenerationSurveys: 0,
    },

    // Contractors
    contractors: generateContractors(3),

    // Resources
    resources: {
      budget: 120000,
      seedlings: 250000,
      contractorCapacity: 320,
      equipment: 100,
      nurseryCredit: 50,
    },
    discoveryTags: [],

    // Party
    crew: crew || generateCrew(4, "field"),

    // State flags
    isComplete: false,
    isGameOver: false,
    gameOverReason: null,

    // History
    log: [],
    decisions: [],
  };

  return options.scale === "campaign" ? applyCampaignScale(journey, "silviculture") : journey;
}

/**
 * Generate contractor crews for silviculture
 */
function generateContractors(count) {
  const names = [
    "Mountain Pine Planters",
    "Northern Regen Co",
    "Boreal Silviculture",
    "Timber Trail Crew",
    "Alpine Reforestation",
  ];
  const contractors = [];

  for (let i = 0; i < count; i++) {
    contractors.push({
      id: `contractor_${i + 1}`,
      name: names[i] || `Contractor ${i + 1}`,
      productivity: 80 + Math.floor(Math.random() * 20),
      morale: 70 + Math.floor(Math.random() * 20),
      crewSize: 8 + Math.floor(Math.random() * 8),
      specialty: i === 0 ? "planting" : i === 1 ? "brushing" : "survey",
      isActive: true,
    });
  }

  return contractors;
}

/**
 * Create planning journey (landscape plan development mode)
 * Protagonist-based: YOU are the Strategic Planner (no crew)
 */
export function createPlanningJourney(options = {}) {
  const { roleId, areaId, companyName, crewName, role, area } = options;
  const effectiveAreaId = areaId || area?.id;
  const effectiveRoleId = roleId || role?.id || "planner";
  const cadenceDays = getPlanningCadenceDays();

  const journey = {
    journeyType: "planning",
    companyName: companyName || crewName || "Strategic Planning Division",
    roleId: effectiveRoleId,
    areaId: effectiveAreaId,
    role,
    area,
    professional: createProfessionalComplianceState(effectiveRoleId, area || effectiveAreaId),

    // Season integration
    season: createSeasonState(effectiveRoleId),
    scrutiny: 34,
    day: 1,
    // The cabinet window. Planning has many gates (data, analysis, FOM review,
    // stakeholder buy-in, ministerial confidence), so the term needs room to
    // clear them; 20 days was tight. Difficulty nudges this in ForestryTrailGame.
    deadline: 28,
    hoursRemaining: 8,

    // Protagonist state - YOU are the planner
    protagonist: {
      energy: 100,
      stress: 0,
      reputation: 50,
      expertise: {
        analysis: 50,
        stakeholder: 50,
        technical: 50,
      },
    },

    // Plan development phases
    plan: {
      phase: "data_gathering",
      phaseDaysRemaining: 20,
      dataCompleteness: 0,
      analysisQuality: 0,
      stakeholderBuyIn: 35,
      ministerialConfidence: 20,
    },

    // Values being balanced
    values: {
      biodiversity: 50,
      timberSupply: 50,
      communityNeeds: 50,
      firstNationsValues: 50,
    },

    // Real-data block selection cadence and active impacts
    blockPlanning: {
      cadenceDays,
      nextSelectionDay: 1,
      activeBlockId: null,
      activeBlock: null,
      activeSummary: null,
      activeEventBias: null,
      fom: {
        status: "draft",
        reviewDaysRemaining: 0,
        reviewDaysTarget: 0,
        commentLoad: 0,
        hydrologyReadiness: 100,
        roadEngineeringReadiness: 100,
        waterGate: "clear",
        waterNote: "No water gate evaluated yet.",
        hydrologyLabel: "water timing",
        roadSummary: "",
        roadNote: "No road or crossing intel is carrying forward yet.",
        roadBlocker: false
      },
      history: [],
    },

    // Cutblock queue
    cutblocks: {
      proposed: 25,
      approved: 0,
      rejected: 0,
      inReview: 0,
    },

    // Stakeholders
    stakeholders: {
      ministry: { mood: 50, meetings: 0, lastContact: 0 },
      nations: { mood: 50, meetings: 0, lastContact: 0 },
      community: { mood: 50, meetings: 0, lastContact: 0 },
      licensees: { mood: 50, meetings: 0, lastContact: 0 },
    },

    // Resources (no crew-related)
    resources: {
      budget: 50000,
      politicalCapital: 40,
      dataCredits: 100,
      consultantDays: 30,
    },
    discoveryTags: [],
    roadAssets: {
      byBlock: {},
      observations: []
    },

    // NO crew for protagonist mode
    crew: [],

    // State flags
    isComplete: false,
    isGameOver: false,
    gameOverReason: null,

    // History
    log: [],
    decisions: [],
  };

  return options.scale === "campaign" ? applyCampaignScale(journey, "planning") : journey;
}

/**
 * Create permitting journey (enhanced desk journey for Permitting Specialist)
 * Protagonist-based: YOU are the Permitting Specialist (no crew)
 */
export function createPermittingJourney(options = {}) {
  const { roleId, areaId, companyName, crewName, role, area } = options;
  const effectiveAreaId = areaId || area?.id;
  const effectiveRoleId = roleId || role?.id || "permitter";

  const journey = {
    journeyType: "permitting",
    companyName: companyName || crewName || "Permitting Office",
    roleId: effectiveRoleId,
    areaId: effectiveAreaId,
    role,
    area,
    professional: createProfessionalComplianceState(effectiveRoleId, area || effectiveAreaId),

    // Season integration
    season: createSeasonState(effectiveRoleId),
    scrutiny: 38,
    day: 1,
    deadline: 30,
    hoursRemaining: 8,
    currentPhase: "planning",

    // Protagonist state - YOU are the permitter
    protagonist: {
      energy: 100,
      stress: 0,
      reputation: 50,
      expertise: {
        regulatory: 50,
        stakeholder: 50,
        technical: 50,
      },
    },

    // Enhanced permit pipeline
    permits: {
      target: 15,
      backlog: 8,
      drafting: 0,
      submitted: 5,
      inReferral: 0,
      inReview: 2,
      needsRevision: 0,
      approved: 0,
      rejected: 0,
    },

    // Referral tracking
    referrals: {
      pendingNation: [],
      pendingAgency: [],
      completed: [],
    },

    // Stakeholder relationships
    relationships: {
      ministry: 50,
      nations: 50,
      agencies: 50,
    },

    // Regulatory tracking
    regulations: {
      recentChanges: [],
      complianceScore: 80,
    },

    // Resources (no crew-related)
    resources: createDeskResources({
      budget: 42000,
      politicalCapital: 46,
      energy: 100,
    }),

    discoveryTags: [],
    roadAssets: {
      byBlock: {},
      observations: []
    },

    // NO crew for protagonist mode
    crew: [],

    // State flags
    isComplete: false,
    isGameOver: false,
    gameOverReason: null,

    // History
    log: [],
    decisions: [],
  };

  return options.scale === "campaign" ? applyCampaignScale(journey, "permitting") : journey;
}

/**
 * Create initial field journey state
 */
export function createFieldJourney(options = {}) {
  const { roleId, areaId, companyName, crewName, crew, role, area } = options;
  const effectiveAreaId = areaId || area?.id;
  const blocks = scaleBlocksForShifts(getBlocksForArea(effectiveAreaId));
  const totalDistance = blocks.reduce((sum, block) => sum + block.distance, 0);

  const journey = {
    journeyType: "field",
    companyName: companyName || crewName || "Unnamed Crew",
    roleId: roleId || role?.id,
    areaId: effectiveAreaId,
    role,
    area,

    // Progress
    scrutiny: 22,
    day: 1,
    currentBlockIndex: 0,
    distanceTraveled: 0,
    totalDistance,
    blocks,

    // Current conditions
    pace: "normal",
    weather: getRandomWeather(blocks[0], 1),
    temperature: "cool",
    travelDelayHours: 0,
    routePlan: null,
    rationPlan: {
      mode: "normal",
      shortRationStreak: 0,
      lastDecisionDay: 0,
    },
    resourcePressure: {
      fuel: 0,
      food: 0,
      equipment: 0,
    },

    // Party
    crew: crew || generateCrew(5, "field"),
    resources: createFieldResources(),
    professional: createProfessionalComplianceState(roleId || role?.id, area || effectiveAreaId),

    discoveryTags: [],
    roadAssets: {
      byBlock: {},
      observations: []
    },

    // State flags
    isComplete: false,
    isGameOver: false,
    gameOverReason: null,

    // History
    log: [],
    decisions: [],
  };

  return options.scale === "campaign" ? applyCampaignScale(journey, "field") : journey;
}

function scaleBlocksForShifts(blocks = []) {
  return blocks.map((block) => {
    const scaled = Math.round(block.distance * FIELD_DISTANCE_SCALE * 10) / 10;
    return {
      ...block,
      distance: Math.max(0.5, scaled),
    };
  });
}

/**
 * Create initial desk journey state
 */
export function createDeskJourney(options = {}) {
  const { roleId, areaId, companyName, crewName, crew, role, area } = options;
  const effectiveAreaId = areaId || area?.id;
  const targetPermits = 10;
  const submittedPermits = 8;
  const backlogPermits = Math.max(0, targetPermits - submittedPermits);

  return {
    journeyType: "desk",
    companyName: companyName || crewName || "Unnamed Team",
    roleId: roleId || role?.id,
    areaId: effectiveAreaId,
    role,
    area,
    professional: createProfessionalComplianceState(roleId || role?.id, area || effectiveAreaId),

    // Progress
    scrutiny: 32,
    day: 1,
    deadline: 30,
    currentPhase: "planning",

    // Permit pipeline
    permits: {
      target: targetPermits,
      submitted: submittedPermits,
      backlog: backlogPermits,
      inReview: 0,
      needsRevision: 0,
      approved: 0,
      rejected: 0,
    },

    // Stakeholders
    stakeholders: {
      ministry: { mood: 50, meetings: 0 },
      nations: { mood: 50, meetings: 0 },
      community: { mood: 50, meetings: 0 },
    },

    // Party
    crew: crew || generateCrew(5, "desk"),
    resources: createDeskResources(),
    discoveryTags: [],

    // Daily time tracking
    hoursRemaining: 8,

    // State flags
    isComplete: false,
    isGameOver: false,
    gameOverReason: null,

    // History
    log: [],
    decisions: [],
  };
}

/**
 * Creates a manager mode journey
 * @param {Object} options - Setup options
 * @returns {Object} Manager journey state
 */
export function createManagerJourney(options = {}) {
  const baseDesk = createDeskResources(options.difficulty);
  const baseField = createFieldResources(options.difficulty);
  const effectiveRoleId = options.roleId || options.role?.id || "manager";

  const journey = {
    ...options,
    journeyType: "manager",
    companyName: options.companyName || options.crewName || "Corporate Operations",
    roleId: effectiveRoleId,
    areaId: options.areaId || options.area?.id,
    scrutiny: 36,
    day: 1,
    metrics: {
      progress: 50,
      forestHealth: 50,
      relationships: 50,
      compliance: 50,
      budget: 50,
      reputation: 50,
    },
    resources: {
      ...baseDesk,
      ...baseField,
      // Must cover the mandatory month-1 CEO hire ($180-200k), an optional
      // certification ($80-150k), and the monthly overhead across the term.
      budget: 500000,
      // Below the 100-point ceiling so the meter can actually move both ways;
      // starting pinned at max made it read as dead UI for a whole term.
      politicalCapital: 65,
    },
    professional: createProfessionalComplianceState(
      effectiveRoleId,
      options.area || options.areaId || null,
    ),
    discoveryTags: [],
    flags: {},
    certifications: [],
    ceo: null,
    targetProfit: 100000,
    // The term runs as 12 monthly board periods rather than 100 daily turns:
    // each period is one strategic decision plus its fallout, with quarterly
    // board reviews. ~16 meaningful decisions instead of a 100-turn grind.
    deadline: 12,
    history: [],

    // The GM keeps a small executive crew: they gate requiresRole event
    // options and act as field reporters for operational (field-pool) events.
    crew: options.crew || generateCrew(5, "field"),

    // State flags
    isComplete: false,
    isGameOver: false,
    gameOverReason: null,

    // History
    log: [],
    decisions: [],
  };

  return options.scale === "campaign" ? applyCampaignScale(journey, "manager") : journey;
}
