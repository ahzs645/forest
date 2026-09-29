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
    noun: 'quality checker',
    lost: 'No quality checker: the payment plots fall to your surveyor, or to you, and read rougher.',
  },
  {
    id: 'surveyor',
    name: 'Silviculture Surveyor (accredited)',
    description: 'Accredited silviculture surveyor. Runs stocking, year-1 survival and free-growing surveys to the site plan standard and signs the results.',
    skills: ['survey', 'stocking'],
    baseHealth: 90,
    baseMorale: 80,
    noun: 'surveyor',
    lost: 'No accredited surveyor on your crew: free-growing surveys wait on the survey contractor.',
  },
  {
    id: 'medic',
    name: 'OFA 3 Attendant',
    description: 'Occupational First Aid Level 3 with the ETV. Runs the tailgate meeting and the camp first-aid plan.',
    skills: ['medical', 'safety'],
    baseHealth: 88,
    baseMorale: 85,
    firstAidTicket: 'OFA3',
    noun: 'OFA 3 attendant',
    lost: 'No OFA 3 or ETV of your own: first aid on the block falls to the contractors\' attendants, and injury calls go without yours.',
  },
  {
    id: 'driver',
    name: 'Crummy Driver',
    description: 'Drives the crummy and the seedling reefer, keeps the radio channels and the road check-ins honest.',
    skills: ['driving', 'mechanics'],
    baseHealth: 95,
    baseMorale: 72,
    noun: 'crummy driver',
    lost: 'No crummy driver: the crew runs, the reefer runs and the radio check-ins fall to you.',
  },
];

export const SILVICULTURE_ESSENTIAL_ROLE_IDS = ['checker', 'surveyor', 'medic', 'driver'];

/**
 * A replacement brought up from town when one of the crew goes out for the
 * season: a day of your time on the road and the hire, travel and first
 * shifts on the program. The attendant and the surveyor cost more to find
 * at short notice.
 */
export const SILVICULTURE_REPLACEMENT_COST = { checker: 900, surveyor: 1400, medic: 1200, driver: 600 };
