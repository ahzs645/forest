export { SEASONS } from "./engine/constants.js";
export {
  advanceProfessionalComplianceChain,
  applyProfessionalComplianceShift,
  createProfessionalComplianceState,
  ensureProfessionalComplianceState,
  getProfessionalComplianceSnapshot,
} from "./engine/professional.js";
export { createInitialState, findArea, findRole } from "./engine/state.js";
export { buildSeasonContext } from "./engine/context.js";
export { getRoleOperationState } from "./engine/seasonalContract.js";
export {
  adaptIllegalActTemptation,
  adaptOperationalEvent,
  adaptOperationalEventEffects,
  buildScheduledIssueTeaser,
  combineScheduledIssueTeasers,
  drawIssue,
  drawSeasonalEvent,
  drawSeasonalTemptation,
  getRoleTasks,
  scoreIssueSelection,
} from "./engine/content.js";
export {
  buildAssignmentCandidates,
  buildLegacyTaskFallback,
  drawSeasonalAssignment,
  recordAssignmentSelection,
} from "./engine/assignments.js";
export {
  applyEffects,
  applyOptionOutcome,
  applyRoundConsequences,
  formatMetricDelta,
} from "./engine/effects.js";
export { buildSummary } from "./engine/summary.js";
export {
  buildRoleLens,
  buildSeasonHeadline,
  computeManagementStyle,
  describeConsequences,
} from "./engine/insights.js";
export { makeRng, isForkableRng } from "./engine/rng.js";
export {
  scoreRun,
  scoreMetricHealth,
  scoreRolePerformance,
  scoreRiskLoad,
  scoreStyleFit,
  deriveTier,
} from "./engine/scoring.js";
export { ROLE_OBJECTIVES, getRoleObjective } from "./engine/roleObjectives.js";
