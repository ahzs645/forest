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
 *
 * `quarterlyScrutiny` and `quarterlyMorale` are what the posture does to the
 * file and to the executive team each quarter, and a cost-cutting year's
 * deferred silviculture is booked as a provision per m³ delivered when the
 * auditors close the year (`deferredSilviculturePerM3`).
 *
 * No posture is free: the cheap one thins the file the certification auditors
 * read, wears out the executive team fighting the contractors and leaves a
 * silviculture bill in the year-end statements; the partnership one costs
 * margin; pushing the cut draws C&E's attention and only pays while the cut
 * schedule keeps the year inside the control band.
 */
export const OPERATING_POSTURES = [
  {
    id: 'steady',
    name: 'Steady delivery',
    summary: 'Log the plan, keep the file clean, no surprises for the board or the District Manager.',
    decision_making_style: 'conservative',
    strengths: ['Cut control on the number', 'Audit-ready file', 'Predictable cash'],
    weaknesses: ['Leaves margin on the table', 'Slow to chase a price run'],
    volumeFactor: 1,
    costPerM3: 0,
    quarterly: { compliance: 3 },
  },
  {
    id: 'relationship',
    name: 'Partnership first',
    summary: 'Front-load the engagement table: Guardians on the blocks, revenue-sharing signed early, slower on contentious ground.',
    decision_making_style: 'relationship-focused',
    strengths: ['Referrals move', 'Community standing', 'Fewer surprises at the FOM stage'],
    weaknesses: ['Some blocks wait', 'Costs a little per m³'],
    volumeFactor: 0.97,
    costPerM3: 1,
    quarterly: { relationships: 5, forestHealth: 2 },
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
    quarterlyScrutiny: 4,
    quarterlyMorale: -2,
  },
  {
    id: 'lean',
    name: 'Cost discipline',
    summary: 'Squeeze logging and haul rates, defer what can be deferred, protect the covenant.',
    decision_making_style: 'cost-cutting',
    strengths: ['Lowest cost per m³', 'Cash cushion'],
    weaknesses: ['Contractors push back', 'HSE and silviculture obligations get thin'],
    volumeFactor: 0.98,
    costPerM3: -2,
    quarterly: { compliance: -3, relationships: -3, progress: -2 },
    quarterlyScrutiny: 2,
    quarterlyMorale: -3,
    deferredSilviculturePerM3: 0.5,
  },
];

export function getOperatingPosture(id) {
  return OPERATING_POSTURES.find((posture) => posture.id === id) || OPERATING_POSTURES[0];
}

/**
 * Cut control for the operating year, as a share of the AAC. Inside the band
 * the statement goes in clean. Between the band and the limit it goes in with
 * a finding: an undercut loses the volume, an overcut draws a C&E penalty on
 * every m³ past the ceiling at a rate that takes back more than the wood
 * earned. Past the limit the board ends the GM's term.
 */
export const CUT_CONTROL = {
  bandLow: 0.9,
  bandHigh: 1.1,
  limitLow: 0.85,
  limitHigh: 1.15,
  overcutPenaltyPerM3: 60,
};

/**
 * @param {number} ratio - delivered volume over the AAC
 * @returns {'in_band'|'undercut'|'overcut'|'severe_undercut'|'severe_overcut'}
 */
export function classifyCutControl(ratio) {
  if (!Number.isFinite(ratio)) return 'in_band';
  if (ratio < CUT_CONTROL.limitLow) return 'severe_undercut';
  if (ratio < CUT_CONTROL.bandLow) return 'undercut';
  if (ratio > CUT_CONTROL.limitHigh) return 'severe_overcut';
  if (ratio > CUT_CONTROL.bandHigh) return 'overcut';
  return 'in_band';
}

/** A cut-control ratio as the statement prints it: one decimal, so 110.3% never reads as 110%. */
export function formatCutPercent(ratio) {
  return `${(Math.round(ratio * 1000) / 10).toFixed(1)}%`;
}

/**
 * The cut schedule the woodlands manager runs between reviews: the in-year
 * lever on cut control. Parking a side pays the contractor standby; a second
 * shift pays overtime and night haul on every m³.
 */
export const HARVEST_PACES = [
  {
    id: 'pace:0.85',
    factor: 0.85,
    name: 'Park a side',
    summary: 'One logging side goes on standby',
    standbyPerMonth: 12000,
    costPerM3: 0,
  },
  {
    id: 'pace:1',
    factor: 1,
    name: 'Hold the schedule',
    summary: 'Every side keeps logging the plan',
    standbyPerMonth: 0,
    costPerM3: 0,
  },
  {
    id: 'pace:1.1',
    factor: 1.1,
    name: 'Add a shift',
    summary: 'A second shift on the processors and night haul to the mill',
    standbyPerMonth: 0,
    costPerM3: 1.5,
  },
];

/**
 * Monthly delivery curves against the plan (each sums to 11.8, so the plan
 * year is the same size everywhere; only its shape moves). Interior ground
 * loses March-April to breakup; winter-road country logs hardest on frozen
 * ground and all but stops in the thaw; the coast has no breakup but loses
 * winter to snow at elevation and high summer to fire-hazard shutdowns; the
 * wet transition loses the depth of winter; the dry belt gives up part of
 * July and August to fire-season restrictions.
 */
export const DELIVERY_CURVES = {
  interior: [1.2, 1.2, 0.6, 0.4, 0.75, 1.05, 1.1, 1.05, 1.15, 1.2, 1.15, 0.95],
  winterRoad: [1.45, 1.45, 0.85, 0.2, 0.45, 0.8, 1.0, 1.0, 1.05, 1.1, 1.1, 1.35],
  coast: [0.85, 0.9, 1.05, 1.1, 1.1, 1.05, 0.8, 0.75, 1.05, 1.1, 1.1, 0.95],
  wetTransition: [0.9, 0.95, 0.95, 0.85, 1.0, 1.1, 1.1, 1.05, 1.1, 1.05, 1.0, 0.75],
  dryBelt: [1.2, 1.15, 0.65, 0.45, 0.85, 1.05, 0.95, 0.9, 1.15, 1.2, 1.2, 1.05],
};

/**
 * What the operating area does to the ledger: the species mix sets the
 * long-run log price, the Market Pricing System sets stumpage off that
 * value (so poor wood pays little and fir and cedar pay a lot), the ground
 * and the haul set logging cost, the market the logs go to sets how hard
 * the price swings, and the climate sets the shape of the delivery year.
 * `swing` is the width of a month's random price move in $/m³.
 */
export const MANAGER_AREA_ECONOMICS = {
  'fraser-plateau': {
    logPrice: 105, stumpage: 27, loggingHaul: 62, swing: 10, curve: 'interior',
    market: 'Spruce and pine sawlogs, much of the pine beetle-killed, to the Prince George sawmills; aspen to the OSB plant.',
    gaps: 'spring breakup takes April deliveries to well under half of plan',
  },
  'bulkley-valley': {
    logPrice: 101, stumpage: 23, loggingHaul: 63, swing: 10, curve: 'interior',
    market: 'Spruce and balsam sawlogs to Houston and Smithers; visual-quality blocks are partial cuts that cost more to log.',
    gaps: 'spring breakup takes April deliveries to well under half of plan',
  },
  'fort-st-john-plateau': {
    logPrice: 96, stumpage: 17, loggingHaul: 62, swing: 8, curve: 'winterRoad',
    market: 'White spruce sawlogs to the Peace mills and aspen on a pulp and OSB contract that pays less and moves less.',
    gaps: 'the muskeg blocks are winter-only, so the thaw takes April to a fifth of plan and May to under half',
  },
  'muskwa-foothills': {
    logPrice: 98, stumpage: 16, loggingHaul: 67, swing: 9, curve: 'winterRoad',
    market: 'Pine and spruce sawlogs on the longest haul in the licence, from remote camps.',
    gaps: 'the winter roads carry the year, and the thaw takes April to a fifth of plan and May to under half',
  },
  'tahltan-highland': {
    logPrice: 94, stumpage: 14, loggingHaul: 65, swing: 7, curve: 'winterRoad',
    market: 'Small spruce and balsam on a remote haul; the Crown prices it near the floor because it is worth little at the mill.',
    gaps: 'the thaw takes April to a fifth of plan and May to under half',
  },
  'skeena-nass': {
    logPrice: 92, stumpage: 11, loggingHaul: 64, swing: 13, curve: 'wetTransition',
    market: 'Hemlock and balsam, pulp-heavy, into a thin domestic market and an export market that moves with Asia.',
    gaps: 'December snow and the April freshet are the thin months',
  },
  'vancouver-island-coast': {
    logPrice: 128, stumpage: 40, loggingHaul: 72, swing: 14, curve: 'coast',
    market: 'Douglas-fir, hemlock and cedar across the dryland sort to the coastal log market; fir and cedar pay well, and the market swings.',
    gaps: 'there is no breakup on the coast: snow at elevation thins the winter and fire-hazard shutdowns take part of July and August',
  },
  'kootenay-wetbelt': {
    logPrice: 116, stumpage: 33, loggingHaul: 67, swing: 11, curve: 'interior',
    market: 'Cedar, hemlock and fir off steep ground; the cedar carries the margin and the cable yarding eats part of it.',
    gaps: 'spring breakup takes April deliveries to well under half of plan',
  },
  'okanagan-shuswap-drybelt': {
    logPrice: 108, stumpage: 29, loggingHaul: 61, swing: 10, curve: 'dryBelt',
    market: 'Fir and pine sawlogs on a short haul to the valley mills.',
    gaps: 'breakup thins March and April, and fire-season restrictions take part of July and August',
  },
};

/** The ledger profile for an operating area; unknown areas run on the Fraser Plateau's numbers. */
export function getAreaEconomics(areaId) {
  const profile = MANAGER_AREA_ECONOMICS[areaId] || MANAGER_AREA_ECONOMICS['fraser-plateau'];
  return { ...profile, curveValues: [...(DELIVERY_CURVES[profile.curve] || DELIVERY_CURVES.interior)] };
}

export function getHarvestPace(idOrFactor) {
  return HARVEST_PACES.find((pace) => pace.id === idOrFactor || pace.factor === Number(idOrFactor))
    || HARVEST_PACES[1];
}
