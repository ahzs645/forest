/**
 * The silviculture supervisor's year, as a program of vintages.
 *
 * One spring deployment runs five tracks that belong to five different
 * generations of stands:
 *   - plant      this year's blocks (the contractor plants, you pay per tree)
 *   - inspect    quality plots on the block planted yesterday (the holdback)
 *   - fill       last year's openings that the year-1 survival survey put
 *                below minimum stocking
 *   - brush      release on the 2–5 year old stands losing the height race
 *   - survey     free-growing surveys on the 8–15 year old openings, against
 *                the site plan's stocking standard, submitted to RESULTS
 *
 * The records here are derived at journey creation from the area's BEC code
 * so every line the mode prints carries a block, a vintage, hectares and a
 * standard. Persisted counters (journey.planting.blocksPlanted,
 * journey.brushing.hectaresComplete, journey.surveys.freeGrowingComplete)
 * stay the canonical progress meters; the program is the detail behind them,
 * and it can be rebuilt for a save that predates it.
 */

import { getStockingStandard } from './stockingStandards.js';

export const PROGRAM_YEAR = 2026;

/** Supervisor overhead against the program budget: truck, camp, radio, you. */
export const SUPERVISOR_OVERHEAD_PER_DAY = 550;

/** Contractor economics the roster and the ledger print. */
export const BRUSH_RATES = {
  manual: 900,      // $/ha, saw crews
  glyphosate: 350,  // $/ha, backpack or aerial under the PMP
  sheep: 450,       // $/ha, herder contract where the ground allows it
};
export const FILL_PRICE_PREMIUM = 0.06; // $/tree over the block price for fill work
export const SURVEY_DAY_RATE = 1800;     // $/day, accredited survey contractor

/**
 * The free-growing list carries one more opening than the year must declare:
 * not every stand reads free-growing when the surveyor walks it, and a stand
 * that fails waits out its resurvey interval rather than going back on the
 * list the next morning.
 */
export const FG_SPARE_CANDIDATES = 1;

/** A stand that fails free-growing is prescribed treatment and resurveyed later. */
export const FG_RESURVEY_YEARS = 2;

/**
 * Days before a released stand reads as released to a surveyor. Cut brush is
 * down the day after the saws; grazed brush needs the flock to come back
 * through; sprayed brush stands green for weeks before it browns out.
 */
export const RELEASE_TAKES_DAYS = { manual: 1, sheep: 3, glyphosate: 10 };

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function roundTo(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function areaPrefix(areaId) {
  const id = String(areaId || 'blk');
  const parts = id.split(/[-_\s]+/).filter(Boolean);
  const letters = parts.length >= 2
    ? parts.slice(0, 2).map((part) => part[0]).join('')
    : id.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Split an allocation of trees into blocks of uneven size so the program
 * reads like a real one (a 9 ha block beside a 16 ha block), while the total
 * still equals the allocation exactly.
 */
function splitAllocation(total, count) {
  const weights = Array.from({ length: count }, () => rand(0.8, 1.25));
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const trees = weights.map((weight) => Math.round((total * weight) / sum));
  const drift = total - trees.reduce((acc, value) => acc + value, 0);
  trees[trees.length - 1] += drift;
  return trees;
}

function splitHectares(total, count) {
  const weights = Array.from({ length: count }, () => rand(0.7, 1.3));
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const ha = weights.map((weight) => Math.max(4, Math.round((total * weight) / sum)));
  const drift = total - ha.reduce((acc, value) => acc + value, 0);
  ha[ha.length - 1] = Math.max(4, ha[ha.length - 1] + drift);
  return ha;
}

/**
 * Build the year's program from the journey's targets and area.
 * @param {Object} journey silviculture journey with planting/brushing/surveys targets
 * @returns {Object} program record
 */
export function buildSilvicultureProgram(journey) {
  const area = journey?.area || null;
  const becCode = area?.becCode || journey?.becCode || 'SBSwk1';
  const standard = getStockingStandard(becCode);
  const prefix = areaPrefix(journey?.areaId || area?.id);
  const blocksToPlant = Math.max(1, Number(journey?.planting?.blocksToPlant) || 1);
  const seedlingsAllocated = Math.max(1000, Number(journey?.planting?.seedlingsAllocated) || 0);
  const brushTarget = Math.max(10, Number(journey?.brushing?.hectaresTarget) || 0);
  const fgTarget = Math.max(1, Number(journey?.surveys?.freeGrowingTarget) || 1);
  const fgCandidates = fgTarget + FG_SPARE_CANDIDATES;
  const campaign = blocksToPlant <= 4;

  let nextNumber = 20 + Math.floor(Math.random() * 6);
  const nextId = () => `${prefix}-${nextNumber++}`;

  // This year's blocks.
  const blockTrees = splitAllocation(seedlingsAllocated, blocksToPlant);
  const blocks = blockTrees.map((trees, index) => ({
    id: nextId(),
    index: index + 1,
    becCode,
    ha: roundTo(trees / standard.plantingSph, 1),
    sph: standard.plantingSph,
    speciesMix: standard.speciesMix,
    stockType: standard.stockType,
    trees,
    planted: 0,
    status: 'pending',      // pending -> planting -> planted -> inspected
    quality: null,
    holdback: 0,
    plantedDay: null,
    inspectedDay: null,
  }));

  // Last year's openings that fell below MSS on the year-1 survival survey.
  const fillCount = campaign ? 1 : 2;
  const fill = [];
  for (let i = 0; i < fillCount; i += 1) {
    const ha = Math.round(rand(9, 22));
    const stockedSph = Math.round(standard.mss * rand(0.68, 0.9));
    const trees = Math.round(ha * (standard.mss - stockedSph) * rand(1.25, 1.5));
    fill.push({
      id: nextId(),
      year: PROGRAM_YEAR - 1,
      ha,
      stockedSph,
      mss: standard.mss,
      trees,
      done: false,
    });
  }

  // Free-growing candidates: 8–15 year old openings, one more than the year
  // must declare. One of them is still under brush and has to be released
  // before the surveyor will pass it.
  const [fgMin, fgMax] = standard.fgWindow;
  const freeGrowing = [];
  const releaseIndex = Math.floor(Math.random() * fgCandidates);
  for (let i = 0; i < fgCandidates; i += 1) {
    const age = Math.round(rand(fgMin, fgMax));
    const needsRelease = i === releaseIndex;
    freeGrowing.push({
      id: nextId(),
      year: PROGRAM_YEAR - age,
      ha: Math.round(rand(14, 42)),
      wellSpacedSph: Math.round(standard.mss * rand(1.15, 1.95)),
      // The stand's real condition: share of plots that would read
      // free-growing today. Under brush it fails on competition.
      fgPlotPct: needsRelease ? Math.round(rand(46, 66)) : Math.round(rand(84, 96)),
      needsRelease,
      released: false,
      releasedDay: null,
      surveyed: false,
      result: null,
      attempts: 0,
      // Program year the stand can next be surveyed after a failed survey.
      resurveyYear: null,
    });
  }

  // The release program: 2–5 year old stands, plus the free-growing
  // candidate that still needs release, at the head of the queue.
  const brush = [];
  const releaseCandidate = freeGrowing.find((opening) => opening.needsRelease);
  const brushCount = campaign ? 3 : 6;
  const releaseHa = releaseCandidate ? Math.min(releaseCandidate.ha, Math.round(brushTarget * 0.25)) : 0;
  if (releaseCandidate) {
    brush.push({
      id: releaseCandidate.id,
      year: releaseCandidate.year,
      ha: releaseHa,
      treated: 0,
      method: null,
      fgId: releaseCandidate.id,
    });
  }
  const youngHa = splitHectares(brushTarget - releaseHa, brushCount);
  for (const ha of youngHa) {
    brush.push({
      id: nextId(),
      year: PROGRAM_YEAR - Math.round(rand(2, 5)),
      ha,
      treated: 0,
      method: null,
      fgId: null,
    });
  }

  return {
    year: PROGRAM_YEAR,
    becCode,
    zone: standard.zone,
    blocks,
    fill,
    brush,
    freeGrowing,
    // What the program started with, so the grade can read what it cost.
    budgetStart: Number(journey?.resources?.budget) || null,
    // Free-form notes the mode appends to (spray maps, replant orders).
    notes: [],
  };
}

// Local outfits by zone: planters, brushers, surveyors. Northern Interior
// names on the coast or in the southern valleys read as the wrong province.
const CONTRACTOR_NAMES_BY_ZONE = {
  CWH: ['Salal Coast Planting', 'Alder Flats Brushing', 'Tidewater Regen Surveys'],
  ICH: ['Cedar Draw Planters', 'Wetbelt Brushing Co', 'Columbia Regen Surveys'],
  IDF: ['Benchland Planters', 'Bunchgrass Vegetation Management', 'Drybelt Regen Surveys'],
};
const DEFAULT_CONTRACTOR_NAMES = ['Mountain Pine Planters', 'Northern Regen Co', 'Boreal Silviculture'];

/**
 * Contractor roster with real economics. Three outfits: production planters
 * paid per tree with a holdback, a brushing outfit with saw crews and a PMP
 * applicator ticket, and an accredited survey contractor on a day rate.
 * @param {string} becCode - sets the per-tree price band and the local outfits
 */
export function generateSilvicultureContractors(becCode) {
  const standard = getStockingStandard(becCode);
  const basePrice = standard.pricePerTree;
  const names = CONTRACTOR_NAMES_BY_ZONE[standard.zone] || DEFAULT_CONTRACTOR_NAMES;
  return [
    {
      id: 'contractor_1',
      name: names[0],
      productivity: 80 + Math.floor(Math.random() * 20),
      morale: 70 + Math.floor(Math.random() * 20),
      crewSize: 12,
      planters: 12,
      specialty: 'planting',
      pricePerTree: roundTo(basePrice + rand(-0.02, 0.03), 2),
      qualityPct: 91 + Math.floor(Math.random() * 5),
      holdbackPct: 2,
      certs: ['OFA3', 'SAFE Companies'],
      isActive: true,
    },
    {
      id: 'contractor_2',
      name: names[1],
      productivity: 80 + Math.floor(Math.random() * 20),
      morale: 70 + Math.floor(Math.random() * 20),
      crewSize: 18,
      sawCrews: 3,
      specialty: 'brushing',
      ratePerHa: BRUSH_RATES.manual,
      herbicideRatePerHa: BRUSH_RATES.glyphosate,
      certs: ['saw', 'OFA3', 'PMP-applicator'],
      isActive: true,
    },
    {
      id: 'contractor_3',
      name: names[2],
      productivity: 80 + Math.floor(Math.random() * 20),
      morale: 70 + Math.floor(Math.random() * 20),
      crewSize: 4,
      surveyors: 2,
      specialty: 'survey',
      dayRate: SURVEY_DAY_RATE,
      certs: ['surveyor-accredited', 'OFA3'],
      isActive: true,
    },
  ];
}

/** Legacy contractors (saves from before the economics) get prices filled in. */
export function ensureContractorEconomics(contractor, becCode) {
  if (!contractor) return contractor;
  const standard = getStockingStandard(becCode);
  const specialty = String(contractor.specialty || '').toLowerCase();
  if (specialty === 'planting') {
    contractor.pricePerTree ??= standard.pricePerTree;
    contractor.qualityPct ??= 92;
    contractor.holdbackPct ??= 2;
    contractor.planters ??= contractor.crewSize || 12;
    contractor.certs ??= ['OFA3', 'SAFE Companies'];
  } else if (specialty === 'brushing') {
    contractor.ratePerHa ??= BRUSH_RATES.manual;
    contractor.herbicideRatePerHa ??= BRUSH_RATES.glyphosate;
    contractor.sawCrews ??= 3;
    contractor.certs ??= ['saw', 'OFA3', 'PMP-applicator'];
  } else {
    contractor.dayRate ??= SURVEY_DAY_RATE;
    contractor.surveyors ??= 2;
    contractor.certs ??= ['surveyor-accredited', 'OFA3'];
  }
  return contractor;
}

/** Total fill stock the program needs on top of this year's allocation. */
export function getProgramFillTrees(program) {
  return (program?.fill || []).reduce((sum, opening) => sum + (opening.trees || 0), 0);
}

/** Does the contractor hold a given certificate? */
export function contractorHasCert(contractor, cert) {
  return Array.isArray(contractor?.certs) && contractor.certs.includes(cert);
}

/** The block the planters are on (or about to start). */
export function getCurrentPlantingBlock(program) {
  return (program?.blocks || []).find((block) => block.status === 'pending' || block.status === 'planting') || null;
}

/** The block waiting on its payment plots. */
export function getBlockAwaitingInspection(program) {
  return (program?.blocks || []).find((block) => block.status === 'planted') || null;
}

/** Format a block for the day card: id, zone, area, mix, density, stock. */
export function describeBlock(block) {
  if (!block) return '';
  return `Block ${block.index} ${block.id} (${block.becCode}, ${block.ha} ha, ${block.speciesMix}, ${block.sph.toLocaleString()} sph, ${block.stockType})`;
}

/** Program-wide counters for the status line. */
export function summarizeProgram(program) {
  const blocks = program?.blocks || [];
  const fill = program?.fill || [];
  const fg = program?.freeGrowing || [];
  return {
    blocksPlanted: blocks.filter((block) => block.status === 'planted' || block.status === 'inspected').length,
    blocksInspected: blocks.filter((block) => block.status === 'inspected').length,
    fillDone: fill.filter((opening) => opening.done).length,
    fillTotal: fill.length,
    fgDone: fg.filter((opening) => opening.surveyed && opening.result === 'pass').length,
    fgTotal: fg.length,
  };
}

/**
 * Whether a free-growing candidate can go in front of a surveyor today: not
 * already declared, not waiting out a resurvey interval, and not under brush
 * or under a release treatment that has not taken yet.
 * @param {Object} opening - free-growing candidate
 * @param {Object} [context] - { year, day } of the program today
 */
export function isFreeGrowingSurveyable(opening, { year = PROGRAM_YEAR, day = 1 } = {}) {
  if (!opening) return false;
  if (opening.surveyed && opening.result === 'pass') return false;
  if (Number.isFinite(opening.resurveyYear) && opening.resurveyYear > year) return false;
  if (!opening.needsRelease) return true;
  if (!opening.released) return false;
  return !Number.isFinite(opening.releaseReadyDay) || day >= opening.releaseReadyDay;
}

/** Share of the stocking component a planting-quality average earns. */
function qualityShare(quality) {
  if (!Number.isFinite(quality)) return 0;
  if (quality >= 90) return 1;
  if (quality >= 85) return 0.5 + (quality - 85) / 10;
  if (quality >= 80) return (quality - 80) / 10;
  return 0;
}

/**
 * Weights of each track in what "the program delivered" means. The year's
 * planting carries the most, but fill, release and the declarations are each
 * obligations on the licensee, and the plot cards say how well the trees
 * went in.
 */
export const PROGRAM_TRACK_WEIGHTS = {
  planting: 0.25,
  inspection: 0.10,
  fill: 0.15,
  release: 0.20,
  freeGrowing: 0.20,
  stocking: 0.10,
};

/**
 * Read the whole program against its obligations. This is the one
 * definition of "delivered" that the win condition, the grade and the
 * progress meter share.
 * @param {Object} journey - silviculture journey
 * @returns {{complete: boolean, delivered: number, parts: Object, shortfalls: string[], label: string}}
 */
export function assessSilvicultureProgram(journey) {
  const program = journey?.program || {};
  const planting = journey?.planting || {};
  const surveys = journey?.surveys || {};
  const brushing = journey?.brushing || {};
  const blocks = Array.isArray(program.blocks) ? program.blocks : [];
  const blocksToPlant = Math.max(1, Number(planting.blocksToPlant) || blocks.length || 1);
  const blocksPlanted = Math.min(blocksToPlant, Number(planting.blocksPlanted) || 0);
  const inspected = blocks.length
    ? Math.min(blocksToPlant, blocks.filter((block) => block.status === 'inspected').length)
    : blocksPlanted;

  const fill = Array.isArray(program.fill) ? program.fill : [];
  const fillTotal = fill.length || Number(planting.fillTarget) || 0;
  const fillDone = fill.length
    ? fill.filter((opening) => opening.done).length
    : Math.min(fillTotal, Number(planting.fillComplete) || 0);

  const brush = Array.isArray(program.brush) ? program.brush : [];
  const releaseTotal = brush.length
    ? brush.reduce((sum, opening) => sum + (Number(opening.ha) || 0), 0)
    : Number(brushing.hectaresTarget) || 0;
  const releaseDone = brush.length
    ? brush.reduce((sum, opening) => sum + Math.min(Number(opening.ha) || 0, Number(opening.treated) || 0), 0)
    : Math.min(releaseTotal, Number(brushing.hectaresComplete) || 0);
  const releaseOpen = brush.filter((opening) => (Number(opening.treated) || 0) < (Number(opening.ha) || 0)).length;

  const fgTarget = Math.max(1, Number(surveys.freeGrowingTarget) || 1);
  const fgDone = Math.min(fgTarget, Number(surveys.freeGrowingComplete) || 0);
  const quality = Number.isFinite(planting.qualityAverage) ? planting.qualityAverage : null;

  const parts = {
    planting: blocksPlanted / blocksToPlant,
    inspection: inspected / blocksToPlant,
    fill: fillTotal ? fillDone / fillTotal : 1,
    release: releaseTotal ? Math.min(1, releaseDone / releaseTotal) : 1,
    freeGrowing: fgDone / fgTarget,
    stocking: qualityShare(quality) * (inspected / blocksToPlant),
  };
  const delivered = Object.entries(PROGRAM_TRACK_WEIGHTS)
    .reduce((sum, [track, weight]) => sum + (parts[track] || 0) * weight, 0);

  const shortfalls = [];
  if (blocksPlanted < blocksToPlant) shortfalls.push(`${blocksToPlant - blocksPlanted} of ${blocksToPlant} blocks unplanted`);
  else if (inspected < blocksToPlant) shortfalls.push(`${blocksToPlant - inspected} planted block${blocksToPlant - inspected === 1 ? '' : 's'} never inspected`);
  if (fillDone < fillTotal) shortfalls.push(`fill ${fillDone}/${fillTotal}`);
  if (releaseOpen > 0 || releaseDone < releaseTotal) shortfalls.push(`release ${Math.round(parts.release * 100)}% of ${Math.round(releaseTotal)} ha`);
  if (fgDone < fgTarget) shortfalls.push(`free-growing ${fgDone}/${fgTarget}`);

  const complete = blocksPlanted >= blocksToPlant
    && inspected >= blocksToPlant
    && fillDone >= fillTotal
    && releaseOpen === 0
    && releaseDone >= releaseTotal
    && fgDone >= fgTarget;

  const label = `${blocksPlanted}/${blocksToPlant} planted (${inspected} inspected), fill ${fillDone}/${fillTotal}, `
    + `release ${Math.round(parts.release * 100)}%, FG ${fgDone}/${fgTarget}`
    + (quality !== null ? `, quality ${quality}%` : '');

  return { complete, delivered, parts, shortfalls, label };
}
