/**
 * Journey Module Index
 * Re-exports all public symbols for backward compatibility
 */

export { FIELD_SHIFT_HOURS, PACE_OPTIONS, DESK_ACTIONS } from './constants.js';

export {
  createJourney,
  createReconJourney,
  createSilvicultureJourney,
  createPlanningJourney,
  createPermittingJourney,
  createFieldJourney,
  createDeskJourney
} from './factory.js';

export { getCurrentBlock, getNextBlock, syncBlocksFromDistance } from './blockNav.js';

export {
  calculateTravelDistance,
  executeFieldDay,
  executeFieldAction,
  endFieldDay
} from './fieldMechanics.js';

export { executeDeskDay } from './deskMechanics.js';

export {
  getJourneyProgress,
  getOperationalProgress,
  recordProgressMilestones,
  getSurveyedBlockCount
} from './progress.js';

export {
  getFieldProgressInfo,
  formatJourneyLog,
  getJourneySummary
} from './display.js';
