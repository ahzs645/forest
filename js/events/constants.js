/**
 * Event Constants
 * Journey type helpers and radio task data
 */

// Journey type categories — used to route events and effects correctly
export const FIELD_JOURNEY_TYPES = new Set(['field', 'recon', 'silviculture']);
export const DESK_JOURNEY_TYPES = new Set(['desk', 'permitting', 'planning']);
export const EVENT_REPEAT_COOLDOWN = 6;

export function isFieldJourney(journeyType) {
  return FIELD_JOURNEY_TYPES.has(journeyType);
}

export function isDeskJourney(journeyType) {
  return DESK_JOURNEY_TYPES.has(journeyType);
}

export const GENERIC_RADIO_TASKS = [
  'running a boundary',
  'classifying a stream',
  'putting in cruise plots',
  'walking a road location',
  'flagging a WTP'
];

export const RADIO_TASKS_BY_ROLE = {
  driver: ['walking a road location', 'shuttling gear', 'moving fuel drums'],
  mechanic: ['looking at the quad', 'sharpening the brush saws', 'fixing a winch line'],
  medic: ['checking the ETV', 'restocking the kit', 'watching the crew for fatigue'],
  faller: ['running a boundary', 'hanging ribbon on the north line', 'tying in a corner'],
  bucker: ['putting in cruise plots', 'calling defect on the big spruce', 'checking a plot against the typing'],
  spotter: ['classifying a stream', 'chaining a line', 'flagging a WTP']
};
