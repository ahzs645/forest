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
