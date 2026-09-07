/**
 * The silviculture supervisor's own crew.
 *
 * The contractors put the trees in the ground and cut the brush; this is the
 * licensee-side crew that checks their work and signs what goes into RESULTS.
 * Ids 'driver' and 'medic' stay stable because event predicates and the
 * odds engine already key on them; 'checker' and 'surveyor' are new.
 */
export const SILVICULTURE_CREW_ROLES = [
  {
    id: 'checker',
    name: 'Quality Checker',
    description: 'Walks payment plots behind the planters: spacing, depth, J-roots, excess. The holdback rides on the plot cards.',
    skills: ['quality', 'measurement'],
    baseHealth: 92,
    baseMorale: 78,
  },
  {
    id: 'surveyor',
    name: 'Silviculture Surveyor (accredited)',
    description: 'Accredited silviculture surveyor. Runs stocking, year-1 survival and free-growing surveys to the site plan standard and signs the results.',
    skills: ['survey', 'stocking'],
    baseHealth: 90,
    baseMorale: 80,
  },
  {
    id: 'medic',
    name: 'OFA 3 Attendant',
    description: 'Occupational First Aid Level 3 with the ETV. Runs the tailgate meeting and the camp first-aid plan.',
    skills: ['medical', 'safety'],
    baseHealth: 88,
    baseMorale: 85,
    firstAidTicket: 'OFA3',
  },
  {
    id: 'driver',
    name: 'Crummy Driver',
    description: 'Drives the crummy and the seedling reefer, keeps the radio channels and the road check-ins honest.',
    skills: ['driving', 'mechanics'],
    baseHealth: 95,
    baseMorale: 72,
  },
];

export const SILVICULTURE_ESSENTIAL_ROLE_IDS = ['checker', 'surveyor', 'medic', 'driver'];
