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
      gpsUnits: 5,
      flaggingTape: 50,
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

  return {
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

  return {
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
}

/**
 * Create permitting journey (enhanced desk journey for Permitting Specialist)
 * Protagonist-based: YOU are the Permitting Specialist (no crew)
 */
export function createPermittingJourney(options = {}) {
  const { roleId, areaId, companyName, crewName, role, area } = options;
  const effectiveAreaId = areaId || area?.id;
  const effectiveRoleId = roleId || role?.id || "permitter";

  return {
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
}

/**
 * Create initial field journey state
 */
export function createFieldJourney(options = {}) {
  const { roleId, areaId, companyName, crewName, crew, role, area } = options;
  const effectiveAreaId = areaId || area?.id;
  const blocks = scaleBlocksForShifts(getBlocksForArea(effectiveAreaId));
  const totalDistance = blocks.reduce((sum, block) => sum + block.distance, 0);

  return {
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

  return {
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
}
