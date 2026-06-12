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
  'cruising a transect',
  'checking access lines',
  'flagging boundaries',
  'scouting terrain',
  'marking hazards'
];

export const RADIO_TASKS_BY_ROLE = {
  driver: ['checking access roads', 'shuttling gear', 'moving fuel drums'],
  mechanic: ['inspecting the ATV', 'tuning saws', 'fixing a winch line'],
  medic: ['running a safety sweep', 'checking med kits', 'monitoring fatigue'],
  faller: ['clearing danger trees', 'opening a sight line', 'topping hazard snags'],
  bucker: ['measuring stems', 'bucking windthrow', 'tagging log decks'],
  spotter: ['flagging boundaries', 'scouting slope breaks', 'logging wildlife sign']
};
