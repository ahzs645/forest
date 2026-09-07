import test from 'node:test';
import assert from 'node:assert/strict';

import { createSilvicultureJourney } from '../js/journey/factory.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';
import { getStockingStandard, describeStockingStandard, listStockingStandards } from '../js/data/stockingStandards.js';
import {
  buildSilvicultureProgram,
  generateSilvicultureContractors,
  contractorHasCert,
  BRUSH_RATES,
} from '../js/data/silvicultureProgram.js';
import { SILVICULTURE_CREW_ROLES } from '../js/data/silvicultureCrewRoles.js';
import { generateCrew } from '../js/crew.js';

function seededRandomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withSeededRandom(seed, fn) {
  const original = Math.random;
  Math.random = seededRandomFactory(seed);
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

/** A UI that records everything written and answers prompts from a script. */
function makeRecordingUi(answer) {
  const lines = [];
  const prompts = [];
  const push = (text) => { if (typeof text === 'string') lines.push(text); };
  return {
    lines,
    prompts,
    write: push, writeHeader: push, writeWarning: push, writePositive: push, writeDanger: push,
    writeInfo: push, writeSuccess: push, writeDivider: () => {}, clear: () => {}, updateAllStatus: () => {},
    playEventVignette: () => {}, playScene: async () => {}, setMissionStatus: () => {}, clearMissionStatus: () => {},
    async promptText() { return 'x'; },
    async promptChoice(prompt, options = []) {
      prompts.push({ prompt, options });
      if (!options.length) return { value: undefined };
      if (options.length === 1) return options[0];
      return answer(prompt, options) || options[0];
    },
  };
}

// ── Stocking standards ──────────────────────────────────────────────────────

test('stocking standards resolve by zone prefix so old and new BEC codes both land', () => {
  assert.equal(getStockingStandard('SBSwk1').zone, 'SBS');
  assert.equal(getStockingStandard('SBSdw2').zone, 'SBS');
  assert.equal(getStockingStandard('bwbsmw').zone, 'BWBS');
  assert.equal(getStockingStandard('CWHws1').zone, 'CWH');
  assert.equal(getStockingStandard('ICHmw2').zone, 'ICH');
  assert.equal(getStockingStandard('IDFxh1').zone, 'IDF');
  assert.equal(getStockingStandard('SWBmk').zone, 'SWB');
  assert.equal(getStockingStandard('XYZ').zone, 'SBS', 'unknown codes fall back to SBS defaults');
  assert.equal(getStockingStandard(null).zone, 'SBS');
});

test('every standard carries the numbers a surveyor quotes from the site plan', () => {
  for (const standard of listStockingStandards()) {
    assert.ok(standard.tss > standard.mss, `${standard.zone} TSS above MSS`);
    assert.ok(standard.mss > 0);
    assert.ok(standard.fgHeightMax > standard.fgHeightMin);
    assert.ok(standard.preferred.length >= 1 && standard.acceptable.length >= 1);
    assert.ok(standard.plantingSph >= standard.tss, `${standard.zone} plants at or above target stocking`);
    assert.ok(standard.pricePerTree >= 0.25 && standard.pricePerTree <= 0.5, `${standard.zone} interior/coast bid range`);
  }
  const sbs = getStockingStandard('SBSmc2');
  assert.equal(sbs.tss, 1200);
  assert.equal(sbs.mss, 700);
  assert.match(describeStockingStandard(sbs), /TSS 1,200 \/ MSS 700 well-spaced sph, free-growing 1\.2–2 m, preferred Sx Pl, acceptable Bl Fd/);
});

// ── Program records ─────────────────────────────────────────────────────────

test('the program derives five vintages from the area and the targets', async () => {
  await withSeededRandom(7, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    const program = journey.program;
    assert.equal(program.becCode, 'SBSdw2');
    assert.equal(program.blocks.length, journey.planting.blocksToPlant);
    assert.equal(program.blocks.reduce((sum, block) => sum + block.trees, 0), journey.planting.seedlingsAllocated,
      'block records account for every tree in the allocation');
    for (const block of program.blocks) {
      assert.match(block.id, /^FP-\d+$/);
      assert.ok(block.ha > 4 && block.ha < 25, `${block.id} is a real-sized block (${block.ha} ha)`);
      assert.equal(block.sph, 1400);
      assert.equal(block.speciesMix, 'Sx/Pl 70/30');
      assert.equal(block.status, 'pending');
    }
    assert.equal(program.fill.length, 2, 'two of last year\'s openings need fill');
    for (const opening of program.fill) {
      assert.equal(opening.year, program.year - 1);
      assert.ok(opening.stockedSph < opening.mss, 'fill openings are below MSS');
      assert.ok(opening.trees > 0);
    }
    assert.equal(program.freeGrowing.length, journey.surveys.freeGrowingTarget);
    for (const opening of program.freeGrowing) {
      const age = program.year - opening.year;
      assert.ok(age >= 8 && age <= 15, `${opening.id} is 8–15 years old (${age})`);
    }
    assert.equal(program.freeGrowing.filter((opening) => opening.needsRelease).length, 1, 'one candidate is still under brush');
    const releaseHead = program.brush[0];
    assert.ok(releaseHead.fgId, 'the release queue starts with the free-growing candidate under brush');
    for (const opening of program.brush.slice(1)) {
      const age = program.year - opening.year;
      assert.ok(age >= 2 && age <= 5, `${opening.id} is a 2–5 year old stand (${age})`);
    }
    assert.equal(program.brush.reduce((sum, opening) => sum + opening.ha, 0), journey.brushing.hectaresTarget,
      'the release queue adds up to the brushing target');
    assert.equal(journey.resources.seedlings, journey.planting.seedlingsAllocated + program.fill.reduce((sum, o) => sum + o.trees, 0));
  });
});

test('campaign-scale programs shrink with the targets and key by the area BEC family', () => {
  const journey = createSilvicultureJourney({ areaId: 'fort-st-john-plateau', scale: 'campaign' });
  assert.equal(journey.program.blocks.length, 3);
  assert.equal(journey.program.fill.length, 1);
  assert.equal(journey.program.freeGrowing.length, 2);
  assert.equal(journey.program.zone, 'BWBS');
  assert.equal(journey.program.blocks[0].speciesMix, 'Sw/Pl 60/40');
  const program = buildSilvicultureProgram({ area: { becCode: 'CWHxm2', id: 'vancouver-island-coast' }, planting: { blocksToPlant: 8, seedlingsAllocated: 140000 }, brushing: { hectaresTarget: 260 }, surveys: { freeGrowingTarget: 3 } });
  assert.equal(program.zone, 'CWH');
  assert.equal(program.blocks[0].sph, 1200);
});

// ── Crew and contractors ────────────────────────────────────────────────────

test('the supervisor gets a silviculture crew, not fallers', () => {
  const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
  const roles = journey.crew.map((member) => member.role).sort();
  assert.deepEqual(roles, ['checker', 'driver', 'medic', 'surveyor']);
  const medic = journey.crew.find((member) => member.role === 'medic');
  assert.equal(medic.firstAidTicket, 'OFA3');
  assert.equal(medic.roleName, 'OFA 3 Attendant');
  assert.ok(!journey.crew.some((member) => /faller|bucker/i.test(member.roleName)));

  const explicit = generateCrew(4, 'field', { roles: SILVICULTURE_CREW_ROLES, essentialIds: ['checker', 'surveyor', 'medic', 'driver'] });
  assert.deepEqual(explicit.map((member) => member.role), ['checker', 'surveyor', 'medic', 'driver']);
});

test('contractors carry real economics and certificates', () => {
  const contractors = generateSilvicultureContractors('SBSwk1');
  const planters = contractors.find((c) => c.specialty === 'planting');
  const brushers = contractors.find((c) => c.specialty === 'brushing');
  const surveyors = contractors.find((c) => c.specialty === 'survey');
  assert.ok(planters.pricePerTree >= 0.3 && planters.pricePerTree <= 0.36, `per-tree price ${planters.pricePerTree}`);
  assert.equal(planters.planters, 12);
  assert.equal(planters.holdbackPct, 2);
  assert.ok(planters.qualityPct >= 91 && planters.qualityPct <= 95);
  assert.equal(brushers.ratePerHa, BRUSH_RATES.manual);
  assert.equal(brushers.herbicideRatePerHa, BRUSH_RATES.glyphosate);
  assert.ok(contractorHasCert(brushers, 'PMP-applicator'));
  assert.ok(contractorHasCert(brushers, 'saw'));
  assert.ok(contractorHasCert(surveyors, 'surveyor-accredited'));
  assert.equal(surveyors.dayRate, 1800);
  assert.ok(!contractorHasCert(planters, 'surveyor-accredited'), 'the planting contractor never signs a survey');
});

// ── The day loop ────────────────────────────────────────────────────────────

test('planting pays per tree less the holdback, and pauses until the plots on the finished block are walked', async () => {
  await withSeededRandom(11, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    const planters = journey.contractors.find((c) => c.specialty === 'planting');
    const block = journey.program.blocks[0];
    // Make the first block finish in one day so the pause is observable.
    block.trees = 6000;
    const budgetBefore = journey.resources.budget;
    const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'plant') || options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    await runSilvicultureDay({ ui, journey, gameOver: false });

    assert.equal(block.status, 'planted');
    assert.equal(journey.planting.blocksPlanted, 1);
    const price = planters.pricePerTree;
    const treesPlanted = journey.planting.seedlingsPlanted;
    assert.ok(treesPlanted >= 6000, 'the crew finishes the block and moves on in the afternoon');
    const expectedInvoice = Math.round(treesPlanted * price * 0.98);
    assert.equal(budgetBefore - journey.resources.budget, 550 + expectedInvoice, 'overhead plus trees × price less the 2% holdback');
    assert.ok(block.holdback > 0, 'the holdback sits on the finished block');
    assert.ok(ui.lines.some((line) => /Block 1 FP-\d+ \(SBSdw2, [\d.]+ ha, Sx\/Pl 70\/30, 1,400 sph, 1\+0 plugs/.test(line)), 'the block line carries zone, area, mix, density and stock type');
    assert.ok(ui.lines.some((line) => /trees at \$0\.\d\d\/tree - invoice \$/.test(line)));

    // Next morning: planting is paused, inspection is on the menu.
    const ui2 = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    await runSilvicultureDay({ ui: ui2, journey, gameOver: false });
    const menu = ui2.prompts.find((entry) => entry.options.some((o) => o.value === 'end'));
    assert.ok(menu.options.some((o) => o.value === 'inspect'), 'quality inspection is offered');
    assert.ok(!menu.options.some((o) => o.value === 'plant'), 'planting is paused');
    const paused = menu.options.find((o) => o.value === 'plant_blocked');
    assert.match(paused.description, /Planting stays paused until the inspection on the block you planted yesterday is closed/);
  });
});

test('the quality inspection is walked by your own crew and settles the holdback', async () => {
  await withSeededRandom(21, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    const planters = journey.contractors.find((c) => c.specialty === 'planting');
    planters.qualityPct = 96;
    const block = journey.program.blocks[0];
    block.trees = 6000;
    let ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'plant') || options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.equal(block.status, 'planted');
    const holdback = block.holdback;
    const budgetBefore = journey.resources.budget;

    ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'inspect') || options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.equal(block.status, 'inspected');
    assert.ok(block.quality >= 90, `high-quality contractor passes the plots (${block.quality}%)`);
    assert.ok(ui.lines.some((line) => /% quality on your checker's plots - spacing [\d,]+ sph against 1,400 target, \d+% J-roots, \d+% excess/.test(line)));
    assert.ok(ui.lines.some((line) => new RegExp(`Holdback of \\$${holdback.toLocaleString()} released`).test(line)));
    assert.ok(!ui.lines.some((line) => /survival rate/i.test(line)), 'inspection reports quality, not survival');
    assert.equal(journey.planting.qualityAverage, block.quality);
    // Spent: overhead, the holdback, and whatever a contractor call cost.
    assert.ok(budgetBefore - journey.resources.budget >= 550 + holdback);
    assert.ok(!journey.contractors.some((c) => c.silvicultureState?.lastTask === 'inspect'), 'no contractor inspects its own work');
  });
});

test('the free-growing survey prints a stocking-standard result and fails on competition until the stand is released', async () => {
  await withSeededRandom(31, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    const program = journey.program;
    // Force the survey candidates into a known state: one clean, one under brush.
    const clean = program.freeGrowing.find((o) => !o.needsRelease);
    const brushy = program.freeGrowing.find((o) => o.needsRelease);
    clean.fgPlotPct = 94;
    clean.wellSpacedSph = 1140;
    for (const other of program.freeGrowing) {
      if (other !== clean && other !== brushy) { other.surveyed = true; other.result = 'pass'; }
    }
    journey.surveys.freeGrowingComplete = program.freeGrowing.filter((o) => o.surveyed).length;

    const chooser = (prompt, options) => options.find((o) => o.value === 'survey') || options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end');
    let ui = makeRecordingUi(chooser);
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.equal(clean.result, 'pass');
    assert.ok(ui.lines.some((line) => /Well-spaced: 1,140 sph \(MSS 700\) - stocked\. Free-growing: \d+% of plots - PASS/.test(line)), ui.lines.filter((l) => /Well-spaced/.test(l)).join('\n'));
    assert.ok(ui.lines.some((line) => /declared free-growing: Sx\/Pl above 1\.2 m, clear of the 150% competition ratio\. Declaration submitted to RESULTS/.test(line)));
    assert.ok(ui.lines.some((line) => /surveyed by (Boreal Silviculture \(accredited\)|your accredited surveyor)/.test(line)));

    // The candidate under brush is blocked, with the release message.
    ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const menu = ui.prompts.find((entry) => entry.options.some((o) => o.value === 'end'));
    const blocked = menu.options.find((o) => o.value === 'survey_blocked');
    assert.ok(blocked, 'the survey is blocked while the stand is under brush');
    assert.match(blocked.description, /still under brush\. Get the release treatment done first or the surveyor will fail them on competition/);
    assert.ok(!menu.options.some((o) => o.value === 'survey'));

    // Release it manually; the survey reopens and the stand passes.
    ui = makeRecordingUi((prompt, options) => {
      if (prompt.startsWith('Release treatment on ')) return options.find((o) => o.value === 'manual');
      return options.find((o) => o.value === 'brush') || options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end');
    });
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.equal(brushy.released, true);
    assert.ok(ui.lines.some((line) => /by manual release - aspen and willow cut below the seedling leaders/.test(line)));
    assert.ok(ui.lines.some((line) => new RegExp(`Release treatment done on the ${brushy.year} opening ${brushy.id}\\. That stand is back on track for its free-growing survey`).test(line)));
    assert.ok(ui.lines.some((line) => /\$900\/ha - invoice \$/.test(line)));

    ui = makeRecordingUi(chooser);
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.equal(brushy.result, 'pass');
    assert.equal(journey.surveys.freeGrowingComplete, journey.surveys.freeGrowingTarget);
  });
});

test('free-growing surveys need an accredited surveyor: no crew surveyor and no survey contractor means no survey', async () => {
  await withSeededRandom(41, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    journey.crew = journey.crew.filter((member) => member.role !== 'surveyor');
    journey.contractors = journey.contractors.filter((c) => c.specialty !== 'survey');
    const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const menu = ui.prompts.find((entry) => entry.options.some((o) => o.value === 'end'));
    assert.ok(!menu.options.some((o) => o.value === 'survey'), 'nobody unaccredited signs a declaration');
  });
});

test('glyphosate under the PMP is cheaper and faster, and costs standing on interface and watershed ground', async () => {
  await withSeededRandom(51, async () => {
    const journey = createSilvicultureJourney({ areaId: 'bulkley-valley' });
    journey.metrics = { relationships: 50, compliance: 50 };
    const scrutinyBefore = journey.scrutiny;
    const budgetBefore = journey.resources.budget;
    const ui = makeRecordingUi((prompt, options) => {
      if (prompt.startsWith('Release treatment on ')) return options.find((o) => o.value === 'glyphosate');
      return options.find((o) => o.value === 'brush') || options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end');
    });
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const methodPrompt = ui.prompts.find((entry) => entry.prompt.startsWith('Release treatment on '));
    assert.ok(methodPrompt, 'the brushing day asks manual or glyphosate');
    assert.deepEqual(methodPrompt.options.map((o) => o.value).slice(0, 3), ['manual', 'glyphosate', 'sheep'], 'interface ground allows sheep grazing');
    assert.match(methodPrompt.options[0].label, /Manual brushing \(saw crews, ~\$900\/ha\)/);
    assert.match(methodPrompt.options[1].label, /Glyphosate under the PMP \(~\$350\/ha\)/);
    const treated = journey.brushing.hectaresComplete;
    assert.ok(treated > 0);
    assert.ok(ui.lines.some((line) => /glyphosate on \d+ ha of [\d/]+ openings under PMP 402-0\d{3}\. 10 m pesticide-free zones flagged on every stream/.test(line)), ui.lines.join('\n'));
    assert.ok(ui.lines.some((line) => /guardian program asks for the spray maps/.test(line)));
    assert.equal(journey.scrutiny, scrutinyBefore + 2, 'spraying interface ground draws scrutiny');
    assert.equal(journey.metrics.relationships, 47);
    // Cost: overhead + ha × $350 (+ whatever a contractor call cost, never the manual rate).
    assert.ok(budgetBefore - journey.resources.budget < 550 + treated * 350 + 5000);
    assert.ok(budgetBefore - journey.resources.budget >= 550 + treated * 350);
  });
});

test('the release program does not offer glyphosate without an applicator, and remote ground has no sheep', async () => {
  await withSeededRandom(61, async () => {
    const journey = createSilvicultureJourney({ areaId: 'tahltan-highland' });
    const brushers = journey.contractors.find((c) => c.specialty === 'brushing');
    brushers.certs = ['saw', 'OFA3'];
    const ui = makeRecordingUi((prompt, options) => {
      if (prompt.startsWith('Release treatment on ')) return options.find((o) => o.value === 'cancel');
      return options.find((o) => o.value === 'brush') || options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end');
    });
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const methodPrompt = ui.prompts.find((entry) => entry.prompt.startsWith('Release treatment on '));
    assert.ok(methodPrompt);
    assert.deepEqual(methodPrompt.options.map((o) => o.value), ['manual', 'cancel']);
  });
});

test('fill planting tops up last year\'s opening from the fill stock at the fill price', async () => {
  await withSeededRandom(71, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    const opening = journey.program.fill[0];
    const planters = journey.contractors.find((c) => c.specialty === 'planting');
    const seedlingsBefore = journey.resources.seedlings;
    const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'fill') || options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.equal(opening.done, true);
    assert.equal(journey.planting.fillComplete, 1);
    assert.equal(seedlingsBefore - journey.resources.seedlings, opening.trees);
    assert.equal(journey.planting.seedlingsPlanted, 0, 'fill trees never count against this year\'s allocation');
    assert.ok(ui.lines.some((line) => new RegExp(`Fill plant on ${opening.id} \\(${opening.year}, ${opening.ha} ha\\): ${opening.trees.toLocaleString()} trees into the gaps take the opening from ${opening.stockedSph} sph back above MSS 700`).test(line)));
    assert.ok(ui.lines.some((line) => new RegExp(`fill work at \\$${(planters.pricePerTree + 0.06).toFixed(2)}/tree`).test(line)));
    assert.ok(ui.lines.some((line) => /Last year's openings are back above minimum stocking/.test(line)));
  });
});

test('the status line reads every vintage', async () => {
  await withSeededRandom(81, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    journey.planting.blocksPlanted = 3;
    journey.brushing.hectaresComplete = 100;
    journey.surveys.freeGrowingComplete = 1;
    journey.planting.fillComplete = 1;
    journey.program.fill[0].done = true;
    let statusLine = '';
    const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    ui.write = (text) => { if (typeof text === 'string') { ui.lines.push(text); if (/blocks planted · fill/.test(text)) statusLine = text; } };
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.match(statusLine, /^3\/8 blocks planted · fill 1\/2 · brush 100\/260 ha · FG 1\/3 · 41 days left · budget \$\d+k$/);
  });
});

test('signing the foreman\'s plot cards is inspection fraud: scrutiny climbs and the next plots read it', async () => {
  await withSeededRandom(91, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    journey.metrics = { compliance: 50, relationships: 50 };
    journey.day = 2;
    const scrutinyBefore = journey.scrutiny;
    // Force the quality dispute call.
    const originalRandom = Math.random;
    let calls = 0;
    Math.random = () => { calls += 1; return calls <= 2 ? 0.01 : originalRandom(); };
    const ui = makeRecordingUi((prompt, options) => {
      if (prompt === 'How do you respond?') return options.find((o) => o.value === 'slide') || options[0];
      return options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end');
    });
    try {
      await runSilvicultureDay({ ui, journey, gameOver: false });
    } finally {
      Math.random = originalRandom;
    }
    const call = ui.prompts.find((entry) => entry.prompt === 'How do you respond?');
    if (call && call.options.some((o) => o.value === 'slide')) {
      // +3 for the false record; a set-aside situation the same morning may add its own point.
      assert.ok(journey.scrutiny >= scrutinyBefore + 3, `scrutiny ${journey.scrutiny} vs ${scrutinyBefore}`);
      assert.equal(journey.metrics.compliance, 46);
      assert.equal(journey.silvicultureState.qualityPenaltyNext, 5);
      assert.ok(ui.lines.some((line) => /false record an NRO would find/.test(line)));
    }
  });
});

test('event progress becomes program schedule and settles into crew-days and release shifts, never planted blocks', async () => {
  await withSeededRandom(101, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    journey.programSchedule = { days: 1.2 };
    const capacityBefore = journey.resources.contractorCapacity;
    const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.equal(journey.planting.blocksPlanted, 0);
    assert.ok(journey.brushing.hectaresComplete > 0 && journey.brushing.hectaresComplete <= 6, 'a day ahead buys the release crew an extra shift');
    assert.equal(journey.resources.contractorCapacity, capacityBefore + 2);
    assert.ok(Math.abs(journey.programSchedule.days - 0.2) < 1e-9);
  });
});

test('older saves without program records get them rebuilt from the counters', async () => {
  await withSeededRandom(111, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    delete journey.program;
    journey.planting.blocksPlanted = 2;
    journey.planting.seedlingsPlanted = 40000;
    journey.brushing.hectaresComplete = 60;
    journey.surveys.freeGrowingComplete = 1;
    const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.ok(journey.program?.blocks?.length === 8);
    assert.equal(journey.program.blocks.filter((block) => block.status === 'inspected').length, 2);
    assert.equal(journey.program.freeGrowing.filter((opening) => opening.result === 'pass').length, 1);
    assert.equal(journey.program.brush.reduce((sum, opening) => sum + opening.treated, 0), 60);
  });
});

test('the winning day records its milestone without printing it', async () => {
  await withSeededRandom(121, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau', scale: 'campaign' });
    journey.planting.blocksPlanted = journey.planting.blocksToPlant;
    journey.planting.seedlingsPlanted = journey.planting.seedlingsAllocated;
    for (const block of journey.program.blocks) { block.planted = block.trees; block.status = 'inspected'; block.quality = 93; }
    journey.surveys.freeGrowingComplete = journey.surveys.freeGrowingTarget - 1;
    for (const opening of journey.program.freeGrowing) { opening.needsRelease = false; opening.fgPlotPct = 95; }
    journey.program.freeGrowing[0].surveyed = true;
    journey.program.freeGrowing[0].result = 'pass';
    const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'survey') || options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end'));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.equal(journey.isComplete, true);
    assert.equal(journey.endReason, 'Planting program delivered and this year\'s free-growing declarations submitted to RESULTS.');
    assert.ok(!ui.lines.some((line) => /MILESTONE/.test(line)), 'no milestone copy on the winning day');
    assert.ok(journey.milestonesReached.includes(90));
  });
});
