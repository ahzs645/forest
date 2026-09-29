/**
 * Stocking standards by BEC zone.
 *
 * A site plan carries a stocking standard for every standards unit: target and
 * minimum well-spaced stems per hectare, the preferred and acceptable species,
 * the free-growing height band, and the competition rule the surveyor applies
 * (a conifer is free-growing when it stands above the brush by the height
 * ratio and is not overtopped inside its cylinder). These are zone-family
 * defaults derived from the FPPR default standards for the interior and coast;
 * a real site plan would refine them by site series. Keyed by zone prefix so
 * SBSwk1, SBSdw2 and SBSmc2 all resolve the same way, and so an unknown or
 * renamed code still lands on a sensible interior default.
 *
 * `mss` is the minimum stocking standard for preferred and acceptable species
 * together (MSSpa); `mssP` is the smaller minimum for preferred species alone.
 * `brushSpecies` is the zone's competing vegetation; `releaseTargets` and
 * `manualRelease` are what a saw crew actually cuts back there, and `sheepGrazing` says whether a herder contract is a real option
 * there (an interior practice, not a coastal one).
 */

const STANDARDS = {
  SBS: {
    zone: 'SBS',
    zoneName: 'Sub-Boreal Spruce',
    tss: 1200,
    mss: 700,
    mssP: 600,
    fgHeightMin: 1.2,
    fgHeightMax: 2.0,
    competitionRatio: 150,
    preferred: ['Sx', 'Pl'],
    acceptable: ['Bl', 'Fd'],
    plantingSph: 1400,
    stockType: '1+0 plugs (PSB 410)',
    speciesMix: 'Sx/Pl 70/30',
    brushSpecies: ['aspen', 'willow', 'fireweed'],
    releaseTargets: ['aspen', 'willow'],
    manualRelease: 'The crews cut aspen and willow below the seedling leaders.',
    sheepGrazing: true,
    pricePerTree: 0.32,
    regenDelay: 4,
    fgWindow: [8, 15],
  },
  BWBS: {
    zone: 'BWBS',
    zoneName: 'Boreal White and Black Spruce',
    tss: 1200,
    mss: 700,
    mssP: 600,
    fgHeightMin: 1.0,
    fgHeightMax: 2.0,
    competitionRatio: 150,
    preferred: ['Sw', 'Pl'],
    acceptable: ['Sb', 'Bl'],
    plantingSph: 1600,
    stockType: '1+0 plugs (PSB 412A)',
    speciesMix: 'Sw/Pl 60/40',
    brushSpecies: ['aspen', 'bluejoint', 'willow'],
    releaseTargets: ['aspen', 'willow'],
    manualRelease: 'The crews cut aspen and willow and knock the bluejoint off the seedlings.',
    sheepGrazing: false,
    pricePerTree: 0.34,
    regenDelay: 4,
    fgWindow: [8, 15],
  },
  CWH: {
    zone: 'CWH',
    zoneName: 'Coastal Western Hemlock',
    tss: 900,
    mss: 500,
    mssP: 400,
    fgHeightMin: 1.5,
    fgHeightMax: 2.5,
    competitionRatio: 150,
    preferred: ['Hw', 'Cw', 'Fd'],
    acceptable: ['Ss', 'Ba', 'Yc'],
    plantingSph: 1200,
    stockType: '1+0 plugs (PSB 415B)',
    speciesMix: 'Cw/Hw/Fd 40/40/20',
    brushSpecies: ['salmonberry', 'red alder', 'salal'],
    releaseTargets: ['red alder', 'salmonberry'],
    manualRelease: 'The crews girdle red alder and slash salmonberry back off the seedling leaders.',
    sheepGrazing: false,
    pricePerTree: 0.41,
    regenDelay: 3,
    fgWindow: [8, 12],
  },
  ICH: {
    zone: 'ICH',
    zoneName: 'Interior Cedar-Hemlock',
    tss: 1000,
    mss: 600,
    mssP: 500,
    fgHeightMin: 1.2,
    fgHeightMax: 2.0,
    competitionRatio: 150,
    preferred: ['Cw', 'Hw', 'Fd'],
    acceptable: ['Sx', 'Pl', 'Lw'],
    plantingSph: 1400,
    stockType: '1+0 plugs (PSB 412A)',
    speciesMix: 'Cw/Fd/Sx 40/30/30',
    brushSpecies: ['thimbleberry', 'Sitka alder', 'fireweed'],
    releaseTargets: ['Sitka alder', 'thimbleberry'],
    manualRelease: 'The crews cut Sitka alder and thimbleberry back off the cedar and fir leaders.',
    sheepGrazing: true,
    pricePerTree: 0.36,
    regenDelay: 4,
    fgWindow: [8, 15],
  },
  IDF: {
    zone: 'IDF',
    zoneName: 'Interior Douglas-fir',
    tss: 1000,
    mss: 500,
    mssP: 400,
    fgHeightMin: 1.0,
    fgHeightMax: 1.8,
    competitionRatio: 150,
    preferred: ['Fd', 'Pl'],
    acceptable: ['Py', 'Lw'],
    plantingSph: 1200,
    stockType: '1+0 plugs (PSB 410)',
    speciesMix: 'Fd/Pl 60/40',
    brushSpecies: ['pinegrass', 'snowbrush', 'aspen'],
    releaseTargets: ['snowbrush', 'aspen suckers'],
    manualRelease: 'The crews cut snowbrush and aspen suckers and spot-screef the pinegrass around each seedling.',
    sheepGrazing: true,
    pricePerTree: 0.30,
    regenDelay: 5,
    fgWindow: [8, 15],
  },
  SWB: {
    zone: 'SWB',
    zoneName: 'Spruce-Willow-Birch',
    tss: 1000,
    mss: 500,
    mssP: 400,
    fgHeightMin: 0.8,
    fgHeightMax: 1.5,
    competitionRatio: 150,
    preferred: ['Sw', 'Bl'],
    acceptable: ['Pl'],
    plantingSph: 1400,
    stockType: '1+0 plugs (PSB 412A)',
    speciesMix: 'Sw/Bl 80/20',
    brushSpecies: ['willow', 'scrub birch', 'bluejoint'],
    releaseTargets: ['willow', 'scrub birch'],
    manualRelease: 'The crews cut willow and scrub birch back off the spruce leaders.',
    sheepGrazing: false,
    pricePerTree: 0.44,
    regenDelay: 5,
    fgWindow: [10, 15],
  },
};

const ZONE_ORDER = ['BWBS', 'CWH', 'ICH', 'IDF', 'SWB', 'SBS'];

/**
 * Resolve a stocking standard from a BEC code by zone prefix.
 * @param {string|null|undefined} becCode e.g. 'SBSdw2', 'bwbsmw'
 * @returns {Object} standard (SBS defaults when nothing matches)
 */
export function getStockingStandard(becCode) {
  const code = String(becCode || '').trim().toUpperCase();
  for (const zone of ZONE_ORDER) {
    if (code.startsWith(zone)) return STANDARDS[zone];
  }
  return STANDARDS.SBS;
}

/** Every standard, for tests and reference screens. */
export function listStockingStandards() {
  return Object.values(STANDARDS);
}

/**
 * One line a surveyor would quote from the site plan.
 * @param {Object} standard
 */
export function describeStockingStandard(standard) {
  const s = standard || STANDARDS.SBS;
  return `${s.zone}: TSS ${s.tss.toLocaleString()} / MSS ${s.mss} well-spaced sph, free-growing ${s.fgHeightMin}–${s.fgHeightMax} m, `
    + `preferred ${s.preferred.join(' ')}, acceptable ${s.acceptable.join(' ')}`;
}

/**
 * The zone's brush in a sentence: "salmonberry, red alder and salal".
 * @param {Object} standard
 */
export function formatBrushSpecies(standard) {
  return formatSpeciesList((standard || STANDARDS.SBS).brushSpecies);
}

/**
 * What the saw crews cut on a manual release: "red alder and salmonberry".
 * @param {Object} standard
 */
export function formatReleaseTargets(standard) {
  const s = standard || STANDARDS.SBS;
  return formatSpeciesList(s.releaseTargets || s.brushSpecies);
}

function formatSpeciesList(list = []) {
  if (list.length <= 1) return list[0] || 'brush';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * Format a number of stems per hectare the way a survey card prints it.
 * @param {number} sph
 */
export function formatSph(sph) {
  return `${Math.round(Number(sph) || 0).toLocaleString()} sph`;
}
