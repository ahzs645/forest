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

  // Free-growing candidates: 8–15 year old openings. One of them is still
  // under brush and has to be released before the surveyor will pass it.
  const [fgMin, fgMax] = standard.fgWindow;
  const freeGrowing = [];
  const releaseIndex = Math.floor(Math.random() * fgTarget);
  for (let i = 0; i < fgTarget; i += 1) {
    const age = Math.round(rand(fgMin, fgMax));
    const needsRelease = i === releaseIndex;
    freeGrowing.push({
      id: nextId(),
      year: PROGRAM_YEAR - age,
      ha: Math.round(rand(14, 42)),
      wellSpacedSph: Math.round(standard.mss * rand(1.15, 1.95)),
      // The stand's real condition: share of plots that would read
      // free-growing today. Under brush it fails on competition.
      fgPlotPct: needsRelease ? Math.round(rand(46, 66)) : Math.round(rand(82, 96)),
      needsRelease,
      released: false,
      surveyed: false,
      result: null,
      attempts: 0,
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
    // Free-form notes the mode appends to (spray maps, replant orders).
    notes: [],
  };
}

/**
 * Contractor roster with real economics. Three outfits: production planters
 * paid per tree with a holdback, a brushing outfit with saw crews and a PMP
 * applicator ticket, and an accredited survey contractor on a day rate.
 * @param {string} becCode - sets the per-tree price band
 */
export function generateSilvicultureContractors(becCode) {
  const standard = getStockingStandard(becCode);
  const basePrice = standard.pricePerTree;
  return [
    {
      id: 'contractor_1',
      name: 'Mountain Pine Planters',
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
      name: 'Northern Regen Co',
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
      name: 'Boreal Silviculture',
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
