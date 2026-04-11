import { FORESTER_ROLES, OPERATING_AREAS } from "../data/index.js";
import { SEASONS } from "./constants.js";
import { createProfessionalComplianceState } from "./professional.js";

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
    assignmentHistory: [],
    assignmentSourceUsage: {},
    currentSeasonContext: null,
    seasonContexts: [],
    discoveryTags: [],
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
