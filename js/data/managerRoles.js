/**
 * General Manager mode data: the licensee's executive team and the operating
 * postures the woodlands team can run the year on.
 *
 * The GM does not hire a CEO. The year opens by setting an operating plan with
 * the woodlands team; the posture chosen colours how the cut is delivered,
 * what it costs, and what the divisions do on their own each quarter. The
 * posture objects keep the legacy `decision_making_style` field because the
 * debrief and reaction decks still read it off `journey.ceo`.
 */

export const MANAGER_EXECUTIVE_ROLES = [
  {
    id: 'cfo',
    name: 'CFO',
    description: 'Runs the ledger, the stumpage forecast and the bank covenant. Reads every deck for the number that is not there.',
    skills: ['finance', 'reporting'],
    baseHealth: 85,
    baseMorale: 70,
  },
  {
    id: 'woodlands',
    name: 'Woodlands Manager',
    description: 'Owns harvest delivery, the logging and haul contractors, and the cut-control arithmetic.',
    skills: ['operations', 'contracts'],
    baseHealth: 90,
    baseMorale: 75,
  },
  {
    id: 'chief_forester',
    name: 'Chief Forester (RPF)',
    description: 'Signs the FSP, the site plans and the RESULTS submissions. Answers to FPBC for all of it.',
    skills: ['stewardship', 'compliance'],
    baseHealth: 88,
    baseMorale: 78,
  },
  {
    id: 'indigenous_relations',
    name: 'Indigenous Relations Lead',
    description: 'Keeps the engagement table with the Nation working: referrals, revenue-sharing, Guardians on the blocks.',
    skills: ['engagement', 'agreements'],
    baseHealth: 88,
    baseMorale: 80,
  },
  {
    id: 'hse',
    name: 'HSE Manager',
    description: 'SAFE Companies certification, WorkSafeBC orders, incident investigations, the fire season plan.',
    skills: ['safety', 'investigation'],
    baseHealth: 92,
    baseMorale: 74,
  },
];

export const MANAGER_ESSENTIAL_ROLE_IDS = MANAGER_EXECUTIVE_ROLES.map((role) => role.id);

/**
 * Operating postures for the year. `volumeFactor` scales delivered volume
 * against plan, `costPerM3` shifts logging and haul cost, and the quarterly
 * initiative is what the woodlands team does with the posture on its own.
 */
export const OPERATING_POSTURES = [
  {
    id: 'steady',
    name: 'Steady delivery',
    summary: 'Log the plan, keep the file clean, no surprises for the board or the District Manager.',
    decision_making_style: 'conservative',
    strengths: ['Cut control on the number', 'Audit-ready file', 'Predictable cash'],
    weaknesses: ['Leaves margin on the table', 'Slow to chase a price run'],
    volumeFactor: 0.97,
    costPerM3: 0,
    quarterly: { compliance: 5 },
  },
  {
    id: 'relationship',
    name: 'Partnership first',
    summary: 'Front-load the engagement table: Guardians on the blocks, revenue-sharing signed early, slower on contentious ground.',
    decision_making_style: 'relationship-focused',
    strengths: ['Referrals move', 'Community standing', 'Fewer surprises at the FOM stage'],
    weaknesses: ['Some blocks wait', 'Costs a little per m³'],
    volumeFactor: 0.96,
    costPerM3: 1.5,
    quarterly: { relationships: 5 },
  },
  {
    id: 'growth',
    name: 'Push the cut',
    summary: 'Run every crew the roads will carry, bid BCTS sales, chase the price window. Cut control and C&E will notice.',
    decision_making_style: 'aggressive-growth',
    strengths: ['Volume', 'Margin when prices run', 'Contractors stay busy'],
    weaknesses: ['Overcut exposure', 'Thinner compliance', 'Scrutiny climbs'],
    volumeFactor: 1.08,
    costPerM3: 2,
    quarterly: { progress: 4, compliance: -3 },
  },
  {
    id: 'lean',
    name: 'Cost discipline',
    summary: 'Squeeze logging and haul rates, defer what can be deferred, protect the covenant.',
    decision_making_style: 'cost-cutting',
    strengths: ['Lowest cost per m³', 'Cash cushion'],
    weaknesses: ['Contractors push back', 'HSE and silviculture obligations get thin'],
    volumeFactor: 0.98,
    costPerM3: -3,
    quarterly: { compliance: -2, relationships: -2 },
  },
];

export function getOperatingPosture(id) {
  return OPERATING_POSTURES.find((posture) => posture.id === id) || OPERATING_POSTURES[0];
}
