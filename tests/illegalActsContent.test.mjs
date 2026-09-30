import { getStopKind, isBlockGroundAct } from '../js/journey/packages.js';
import { ensurePermitFiles } from '../js/journey/permitPipeline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ILLEGAL_ACTS,
  ACTIVE_ILLEGAL_ACTS,
  ACT_PREMISES,
  actPremises,
  findIllegalAct,
  CATCH_INSTITUTIONS,
  CAUGHT_TEMPLATES,
  CATEGORY_CLEAN_OUTCOMES,
  CATEGORY_GO_AROUND,
  buildCaughtNarrative,
  isSelfProposedAct,
} from '../js/data/illegalActs.js';
import { MISCHIEF_OPTIONS } from '../js/data/mischief.js';
import { FORESTER_ROLES, ISSUE_LIBRARY, CHAINED_ISSUES, FIELD_EVENTS } from '../js/data/index.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import {
  ACT_PREMISE_CHECKS,
  actMatchesTemptationContext,
  buildCaughtEffects,
  checkForEvent,
  eventMatchesJourneyContext,
  buildTemptationEvent,
  buildTemptationPayoff,
  resolveTemptationSetAside,
} from '../js/events/selection.js';
import { createJourney } from '../js/journey.js';

// Content lint for the illegal-act library (js/data/illegalActs.js) and the
// legacy mischief options (js/data/mischief.js). These are the playtest
// findings that were wrong on ordinary draws: caught paragraphs about the
// wrong kind of offence, clean lines that described a different act, copy
// that read "Yourself, 4:45 on a Friday shrugs", payoff lines promising
// money the mechanic never pays, and planting fraud offered in January.

const ROLES = ['recce', 'silviculture', 'planner', 'permitter', 'manager'];
const FIELD_ROLES = new Set(['recce', 'silviculture']);
const SEASONS = ['spring', 'summer', 'fall', 'winter'];

// A run where every premise an act can name holds (ACT_PREMISES): the file is
// under a microscope, planting and release are still owed with the planters
// on the block and a planted block waiting on its plots, the FOM is out for
// comment, a permit is out on referral with more to follow, and the GM's
// community relations have gone bad enough for a blockade.
function meetPremises(journey) {
  journey.scrutiny = 60;
  if (journey.journeyType === 'silviculture') {
    journey.planting.seedlingsPlanted = 4000;
    journey.program.blocks[0].status = 'planted';
  }
  if (journey.journeyType === 'planning') {
    Object.assign(journey.blockPlanning.fom, { status: 'public_review', commentLoad: 3, reviewDaysRemaining: 20 });
  }
  if (journey.journeyType === 'permitting') {
    ensurePermitFiles(journey);
    journey.permits.files[0].lane = 'referral';
  }
  if (journey.journeyType === 'manager') journey.metrics.relationships = 30;
  return journey;
}

function journeyFor(roleId, areaId = 'bulkley-valley', season = null) {
  const journey = meetPremises(createJourney({ roleId, areaId }));
  journey.day = 5;
  // A recce crew is offered block-ground shortcuts on a block, not at a
  // waypoint (js/journey/packages.js actFitsStop): stand it on a block.
  if (Array.isArray(journey.blocks)) {
    const blockIndex = journey.blocks.findIndex((block) => getStopKind(block) === 'block');
    if (blockIndex >= 0) journey.currentBlockIndex = blockIndex;
  }
  if (season) {
    if (journey.season) journey.season.currentSeason = season;
    else journey.season = { currentSeason: season };
  }
  return journey;
}

// One journey per role, area and season, built once.
const JOURNEYS = new Map();
for (const roleId of ROLES) {
  for (const area of OPERATING_AREAS) {
    for (const season of SEASONS) JOURNEYS.set(`${roleId}/${area.id}/${season}`, journeyFor(roleId, area.id, season));
  }
}
const DEFAULT_JOURNEY = Object.fromEntries(ROLES.map((roleId) => [roleId, journeyFor(roleId)]));

function reachableRoles(act) {
  return ROLES.filter((roleId) => [...JOURNEYS.entries()]
    .some(([key, journey]) => key.startsWith(`${roleId}/`) && actMatchesTemptationContext(act, journey)));
}
const REACH = new Map(ACTIVE_ILLEGAL_ACTS.map((act) => [act.id, reachableRoles(act)]));

function actText(act) {
  return `${act.title} ${act.description} ${act.pitch}`;
}

// ── Institutions ────────────────────────────────────────────────────────────

test('every act is caught by a known institution with its own caught paragraph and consequences', () => {
  for (const institution of CATCH_INSTITUTIONS) {
    assert.ok(Array.isArray(CAUGHT_TEMPLATES[institution]) && CAUGHT_TEMPLATES[institution].length >= 2,
      `${institution} needs two caught templates`);
    const effects = buildCaughtEffects({ catch: { by: institution } }, DEFAULT_JOURNEY.planner);
    if (institution !== 'C&E') {
      assert.notDeepEqual(effects, { compliance: -10, scrutiny: 15 }, `${institution} falls through to the default consequences`);
    }
  }
  for (const act of ILLEGAL_ACTS) {
    assert.ok(CATCH_INSTITUTIONS.includes(act.catch?.by), `${act.id}: unknown institution ${act.catch?.by}`);
    assert.ok(Number.isFinite(act.catch?.lagDays) && act.catch.lagDays > 0, `${act.id}: no lagDays`);
  }
});

// Words a caught paragraph may not use because they only fit some of the acts
// an institution catches. Each was once a template line.
const TEMPLATE_OVERREACH = [
  /Spill Reporting Regulation/, // ENV catches herbicide, smoke and camps too
  /the fire is small|put it out by dark/i, // BCWS catches false claims too
  /It is forgery/, // RCMP catches bribery, theft and assault too
  /The structure comes out|road permit is suspended/, // Transport Canada: drones, and no provincial permit
  /culvert was cheaper/, // DFO catches barges and bridges too
  /six weeks later|Your name is on the site plan/, // C&E: the lag is the act's, and not every act has a site plan
  /check cruise\. The plots do not reproduce/, // Timber Pricing checks appraisals too
  /timber mark does not match the ground/, // Revenue Branch sees grade fraud too
];

test('caught paragraphs hold for every act the institution catches, and never repeat themselves', () => {
  const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'is', 'it', 'at', 'for', 'with', 'by', 'that', 'your', 'you', 'what', 'was', 'are', 'from', 'has', 'as', 'its', 'not', 'this', 'one', 'who', 'had', 'be', 'they', 'their', 'there']);
  for (const act of ILLEGAL_ACTS) {
    for (const variant of [0, 1]) {
      const narrative = buildCaughtNarrative(act, variant);
      for (const pattern of TEMPLATE_OVERREACH) {
        assert.doesNotMatch(narrative, pattern, `${act.id} variant ${variant}`);
      }
      const words = narrative.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
      const seen = new Set();
      for (let i = 0; i + 2 < words.length; i += 1) {
        const gram = words.slice(i, i + 3);
        if (gram.every((word) => STOP.has(word))) continue;
        const key = gram.join(' ');
        assert.ok(!seen.has(key), `${act.id} variant ${variant} says "${key}" twice: ${narrative}`);
        seen.add(key);
      }
    }
  }
});

// ── The clean band and the go-around ────────────────────────────────────────

// What each category's clean and go-around lines assume about the act. An act
// whose own description does not match is not the act those lines describe,
// and has to carry its own cleanOutcome and goAround.
const CATEGORY_PREMISES = {
  riparian: /\breserve\b|\bstream (card|class)|\bS[3-6]\b|non-fish|reclassif|channel width/i,
  boundary: /\bboundar|\bline\b|\bflag|\bribbon|\bOGMA\b|\bpolygon/i,
  cruise: /\bcruis|compilation|\bplots?\b|\btall(y|ies)\b|inventory|\byield|site index|timber supply|waste survey/i,
  'timber-mark': /timber mark|\bmark\b|\bloads?\b|\bscal(e|er|ing)\b|stumpage|\bsort\b/i,
  consultation: /referral|engagement|consult|\bnotice\b|notif|comment|\bagreed?\b|meeting|open house|review log|acknowledg/i,
  archaeology: /\bsites?\b|\bCMT\b|culturally|bark-strip|\bAIA\b|\bAOA\b|archaeolog|heritage|pit house|lithic/i,
  wildlife: /survey|\bnest(s|ing)?\b|\bden\b|habitat|winter range|\bUWR\b|wildlife|red-listed|ecosystem|goshawk/i,
  fire: /\blight\b|\blit\b|ignit|broadcast burn|register the burn/i,
  spill: /\bspill|sheen|hydrocarbon|hydraulic line/i,
  herbicide: /spray|herbicide|glyphosate|pesticide|defoliant/i,
  safety: /\bcrew\b|faller|worker|attendant|assessment|first aid|\bETV\b|safety|hazard|encounter|heat|leaning|danger/i,
  results: /RESULTS|free[- ]growing|survival|\bplanted\b|planting report|seedlot|\bSPAR\b/i,
  roads: /\b(road|spur|bridge|crossing|culvert|span|subgrade|mainline|FSR|haul|RUP|lowbed)s?\b/i,
  professional: /\bsign(s|ed|ature|-off)?\b|\bseal\b|\bstamp\b|under the name|registrant|surveyor of record/i,
  employment: /\bcash\b|undocumented|payroll|premiums|wages|timesheet/i,
  transport: /\btrucks?\b|\bhaul\b|\bloads?\b|\bplates?\b|weigh|scales?/i,
  poaching: /\bdeer\b|moose|\belk\b|rifle|shoot|\banimal|\bhunt/i,
  corporate: /invoice|\bbill|ledger|budget|\bfees?\b|spreadsheet|dashboard|payroll|credits?\b|grant|\bcodes?\b|kitty|tender|\bbids?\b|\bclaim\b|hour sheet|\bmeter\b/i,
  comic: /./,
};

test('every category line has a premise, and an act it does not describe carries its own lines', () => {
  for (const category of Object.keys(CATEGORY_CLEAN_OUTCOMES)) {
    assert.ok(CATEGORY_PREMISES[category], `no premise recorded for ${category}`);
    assert.ok(CATEGORY_GO_AROUND[category], `no go-around line for ${category}`);
  }
  const missing = [];
  for (const act of ACTIVE_ILLEGAL_ACTS) {
    if (CATEGORY_PREMISES[act.category].test(act.description)) continue;
    if (!act.cleanOutcome) missing.push(`${act.id}: cleanOutcome`);
    // Your own idea never goes around you (resolveTemptationSetAside).
    if (!act.goAround && !isSelfProposedAct(act)) missing.push(`${act.id}: goAround`);
  }
  assert.deepEqual(missing, []);
});

// ── Reachability ────────────────────────────────────────────────────────────

test('every role an act names can actually be offered it somewhere, in some season', () => {
  const dead = [];
  for (const act of ACTIVE_ILLEGAL_ACTS) {
    for (const roleId of act.roles) {
      if (!REACH.get(act.id).includes(roleId)) dead.push(`${act.id} -> ${roleId}`);
    }
  }
  assert.deepEqual(dead, []);
});

// ── Premises: the thing the pitch is about has to still exist ───────────────

test('every premise an act names is one the gate can read', () => {
  assert.deepEqual(Object.keys(ACT_PREMISE_CHECKS).sort(), Object.keys(ACT_PREMISES).sort());
  const unknown = ILLEGAL_ACTS.flatMap((act) => actPremises(act)
    .filter((name) => !ACT_PREMISES[name]).map((name) => `${act.id}: ${name}`));
  assert.deepEqual(unknown, []);
});

// How to make each premise false on a run that keeps its subject.
const PREMISE_BROKEN = {
  scrutinyHigh: { roles: ROLES, breakIt: (j) => { j.scrutiny = 10; } },
  plantingPending: { roles: ['silviculture'], breakIt: (j) => { j.planting.blocksPlanted = j.planting.blocksToPlant; } },
  stockToPlant: {
    roles: ['silviculture'],
    breakIt: (j) => { j.planting.blocksPlanted = j.planting.blocksToPlant; j.planting.fillComplete = j.planting.fillTarget; },
  },
  plantersOnHand: {
    roles: ['silviculture'],
    breakIt: (j) => {
      for (const contractor of j.contractors.filter((c) => c.specialty === 'planting')) {
        contractor.silvicultureState = { ...(contractor.silvicultureState || {}), status: 'recovering', cooldownDays: 2 };
      }
    },
  },
  plantedSome: { roles: ['silviculture'], breakIt: (j) => { j.planting.blocksPlanted = 0; j.planting.seedlingsPlanted = 0; } },
  plotsDue: {
    roles: ['silviculture'],
    breakIt: (j) => { for (const block of j.program.blocks) if (block.status === 'planted') block.status = 'inspected'; },
  },
  releaseQueued: { roles: ['silviculture'], breakIt: (j) => { j.brushing.hectaresComplete = j.brushing.hectaresTarget; } },
  freeGrowingDue: { roles: ['silviculture'], breakIt: (j) => { j.surveys.freeGrowingComplete = j.surveys.freeGrowingTarget; } },
  fomCommentsOpen: { roles: ['planner'], breakIt: (j) => { Object.assign(j.blockPlanning.fom, { status: 'closed', commentLoad: 0 }); } },
  referralAhead: {
    roles: ['permitter'],
    breakIt: (j) => { j.permits.backlog = 0; for (const file of j.permits.files) if (file.lane !== 'referral') file.lane = 'issued'; },
  },
  referralOut: {
    roles: ['permitter'],
    breakIt: (j) => { j.permits.inReferral = 0; for (const file of j.permits.files) if (file.lane === 'referral') file.lane = 'decision'; },
  },
  relationsStrained: { roles: ['manager'], breakIt: (j) => { j.metrics.relationships = 70; j.consequenceFlags = []; } },
};

test('each premise holds on the premise-met run and fails when its subject is gone; other runs are not gated', () => {
  assert.deepEqual(Object.keys(PREMISE_BROKEN).sort(), Object.keys(ACT_PREMISES).sort());
  for (const [name, { roles, breakIt }] of Object.entries(PREMISE_BROKEN)) {
    for (const roleId of ROLES) {
      const journey = journeyFor(roleId);
      const tracked = roles.includes(roleId);
      assert.equal(ACT_PREMISE_CHECKS[name](journey), tracked ? true : null, `${name} for ${roleId}`);
      if (!tracked) continue;
      breakIt(journey);
      assert.equal(ACT_PREMISE_CHECKS[name](journey), false, `${name} still holds for ${roleId} once broken`);
    }
  }
});

test('no act is offered while its premise is false, in any area or season', () => {
  const offenders = [];
  for (const [name, { roles, breakIt }] of Object.entries(PREMISE_BROKEN)) {
    const acts = ACTIVE_ILLEGAL_ACTS.filter((act) => actPremises(act).includes(name));
    // A premise may outlive the acts it gated (relationsStrained: the
    // blockade act is retired); it still names something in the library.
    if (!acts.length) {
      assert.ok(ILLEGAL_ACTS.some((act) => act.retired && actPremises(act).includes(name)), `${name} gates no act`);
      continue;
    }
    for (const roleId of roles) {
      const actsForRole = acts.filter((act) => act.roles.includes(roleId));
      if (!actsForRole.length) continue;
      assert.ok(actsForRole.some((act) => REACH.get(act.id).includes(roleId)), `${name}: no ${roleId} act is reachable when it holds`);
      for (const area of OPERATING_AREAS) {
        for (const season of SEASONS) {
          const journey = journeyFor(roleId, area.id, season);
          breakIt(journey);
          for (const act of actsForRole) {
            if (actMatchesTemptationContext(act, journey)) offenders.push(`${act.id} (${roleId}, ${area.id}, ${season}) without ${name}`);
          }
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('the playtest premise mismatches stay fixed', () => {
  const act = (id) => findIllegalAct(id);
  const silvi = () => journeyFor('silviculture', 'kootenay-wetbelt', 'spring');
  const offered = (id, journey) => actMatchesTemptationContext(act(id), journey);

  // Cash for planters and buried boxes once the planting is done.
  const planted = silvi();
  assert.equal(offered('silvi-hire-undocumented', planted), true);
  PREMISE_BROKEN.stockToPlant.breakIt(planted);
  assert.equal(offered('silvi-hire-undocumented', planted), false, 'no planting contract left to pay in cash');
  assert.equal(offered('silvi-fake-snow-cache', planted), false, 'no stock left to cache');
  // Planting acts while the planters are on days off.
  const resting = silvi();
  PREMISE_BROKEN.plantersOnHand.breakIt(resting);
  assert.equal(offered('silvi-falsify-planting-quality', resting), false);
  assert.equal(offered('silvi-misreport-planting', resting), false);

  // The FOM comments, once the period closed, or once buy-in no longer needs them.
  const planner = journeyFor('planner', 'okanagan-shuswap-drybelt', 'fall');
  assert.equal(offered('silent-fom-comment-box', planner), true);
  planner.plan.stakeholderBuyIn = 79;
  assert.equal(offered('silent-fom-comment-box', planner), false, 'buy-in 79/75 has nothing to gain');
  planner.plan.stakeholderBuyIn = 40;
  PREMISE_BROKEN.fomCommentsOpen.breakIt(planner);
  assert.equal(offered('silent-fom-comment-box', planner), false, 'comments logged and answered');

  // A planner gate that is already met is not paid.
  const analysing = journeyFor('planner');
  analysing.plan.phase = 'analysis';
  assert.equal(offered('inventory-data-laundering', analysing), true);
  analysing.plan.analysisQuality = 100;
  // Still offered to a tired planner, but the promised analysis is not paid:
  // it falls to time back on the file (js/events/selection.js
  // buildTemptationPayoff), never to a gate that cannot move.
  Object.assign(analysing.protagonist, { energy: 70, stress: 20 });
  const gateFull = buildTemptationPayoff(act('inventory-data-laundering'), analysing).effects;
  assert.equal(gateFull.analysis, undefined, 'no analysis is promised at a full analysis gate');
  assert.ok(gateFull.progress > 0, 'the take pays time back on the file instead');
  assert.equal(offered('inventory-data-laundering', analysing), true);
  // A rested planner has no time to get back: nothing lands, so it is not offered.
  Object.assign(analysing.protagonist, { energy: 100, stress: 0 });
  assert.deepEqual(buildTemptationPayoff(act('inventory-data-laundering'), analysing).effects, {});
  assert.equal(offered('inventory-data-laundering', analysing), false);

  // The blockade act is retired: the GM's year has no blockade to intimidate,
  // and no other role was ever asked it.
  const gm = journeyFor('manager');
  assert.equal(findIllegalAct('drop-a-tree-near-the-blockade').retired, true);
  assert.equal(offered('drop-a-tree-near-the-blockade', gm), false);
});

test('a take pays in something that fits the act: no cash for poaching, and a bribe card names no payment it does not charge', () => {
  const poach = findIllegalAct('recce-hunt-on-shift');
  assert.notEqual(poach.payoff.kind, 'budget', 'camp meat is not cash');
  for (const roleId of poach.roles) {
    assert.equal(buildTemptationPayoff(poach, journeyFor(roleId)).effects.budget, undefined, roleId);
  }
  const wtp = findIllegalAct('bribed-hazard-flags');
  assert.doesNotMatch(`${wtp.title} ${wtp.description} ${wtp.pitch}`, /\bpay\b|bonus/i, 'the take charges nothing, so the card offers no payment');
  const blockade = findIllegalAct('drop-a-tree-near-the-blockade');
  assert.doesNotMatch(blockade.cleanOutcome, /filmed|posted|camera/i, 'the band that stays buried is not on everyone\'s phone');
});

// ── Where on the traverse ───────────────────────────────────────────────────

test('a recce crew is offered block-ground shortcuts only on a block whose package is still open', () => {
  const recceActs = ACTIVE_ILLEGAL_ACTS.filter((act) => REACH.get(act.id).includes('recce'));
  const ground = recceActs.filter(isBlockGroundAct);
  assert.ok(ground.length >= 30, `${ground.length} block-ground recce acts`);
  for (const id of ['planner-skip-goshawk-survey', 'cruise-the-client-estimates', 'planner-fake-cruiser-creds', 'planner-hide-invasive-plants', 'call-the-s3-an-s4', 'drive-by-stream-class']) {
    assert.ok(ground.some((act) => act.id === id), `${id} is about a block's ground`);
  }
  const leaks = [];
  let waypointOffers = 0;
  for (const area of OPERATING_AREAS) {
    for (const season of SEASONS) {
      const journey = journeyFor('recce', area.id, season);
      const block = journey.blocks[journey.currentBlockIndex];
      // At a waypoint.
      const waypoint = journey.blocks.findIndex((stop) => getStopKind(stop) === 'waypoint');
      journey.currentBlockIndex = waypoint;
      for (const act of recceActs) {
        const fits = actMatchesTemptationContext(act, journey);
        if (fits && isBlockGroundAct(act)) leaks.push(`${act.id} at a waypoint (${area.id})`);
        if (fits) waypointOffers += 1;
      }
      // Back on the block, after its package is finalized.
      journey.currentBlockIndex = journey.blocks.indexOf(block);
      journey.reconIntel = { byBlock: { [block.id]: { assessmentComplete: true } } };
      for (const act of ground) {
        if (actMatchesTemptationContext(act, journey)) leaks.push(`${act.id} on a closed package (${area.id})`);
      }
    }
  }
  assert.deepEqual(leaks, []);
  assert.ok(waypointOffers > 0, 'road, crossing and safety shortcuts still belong at a waypoint');
});

test('ground on the next leg is not offered at the last open block', () => {
  const offers = [];
  for (const area of OPERATING_AREAS) {
    const journey = journeyFor('recce', area.id, 'summer');
    const here = journey.blocks[journey.currentBlockIndex];
    journey.reconIntel = { byBlock: {} };
    for (const stop of journey.blocks) {
      if (stop !== here && getStopKind(stop) === 'block') journey.reconIntel.byBlock[stop.id] = { assessmentComplete: true };
    }
    for (const act of ACTIVE_ILLEGAL_ACTS) {
      if (!actMatchesTemptationContext(act, journey)) continue;
      const { effects } = buildTemptationPayoff(act, journey);
      if (effects.progress > 0) offers.push(`${act.id} (${area.id}) pays ${effects.progress} km with no leg left`);
    }
  }
  assert.deepEqual(offers, []);
});

test('block-ground field cards stay off waypoints and closed packages', () => {
  const journey = journeyFor('recce', 'tahltan-highland', 'summer');
  const block = journey.blocks[journey.currentBlockIndex];
  const waypoint = journey.blocks.find((stop) => getStopKind(stop) === 'waypoint');
  const elder = FIELD_EVENTS.find((event) => event.id === 'first_nations_consultation_field');
  const ribbon = FIELD_EVENTS.find((event) => event.id === 'boundary_dispute');
  for (const event of [elder, ribbon]) {
    assert.equal(eventMatchesJourneyContext(event, journey, { currentBlock: block }), true, `${event.id} on an open block`);
    assert.equal(eventMatchesJourneyContext(event, journey, { currentBlock: waypoint }), false, `${event.id} at a waypoint`);
  }
  journey.reconIntel = { byBlock: { [block.id]: { assessmentComplete: true } } };
  for (const event of [elder, ribbon]) {
    assert.equal(eventMatchesJourneyContext(event, journey, { currentBlock: block }), false, `${event.id} after the package closed`);
  }
});

test('a proposal set aside is not asked again once its premise is gone', () => {
  const journey = journeyFor('silviculture', 'kootenay-wetbelt', 'spring');
  const act = findIllegalAct('silvi-hire-undocumented');
  PREMISE_BROKEN.plantingPending.breakIt(journey);
  journey.temptationMemory = { lastDay: journey.day, seenActIds: [act.id], takenActIds: [], pending: [{ actId: act.id, day: journey.day, kind: 'reoffer' }] };
  const event = checkForEvent(journey);
  assert.notEqual(event?.temptationActId, act.id, 'no second asking about a planting contract that is finished');
  assert.equal(journey.temptationMemory.pending.length, 0);
});

// ── Who is asked ────────────────────────────────────────────────────────────

test('the GM hears corporate, harvest and haul shortcuts, never a registrant\'s or a consultant\'s', () => {
  const managerOnly = ACTIVE_ILLEGAL_ACTS.filter((act) => act.roles.length === 1 && act.roles[0] === 'manager');
  for (const act of managerOnly) {
    assert.ok(['corporate', 'harvest', 'haul'].includes(act.phase), `${act.id} is ${act.phase}`);
    assert.doesNotMatch(act.id, /^(recce|permitter|planner|silvi)-/, `${act.id} carries another role's prefix`);
  }
  for (const id of ['wear-every-hat', 'drop-the-ret-from-the-signature', 'phantom-cpd-log', 'retire-mid-investigation-dodge',
    'annual-declaration-perjury', 'woodlot-overcut-gambit', 'community-forest-coasting', 'bigfoot-haulage', 'permitter-falsify-timber-mark']) {
    assert.ok(!REACH.get(id)?.includes('manager'), `${id} reaches the GM`);
  }
  // A renamed act is still found by the id an older save remembers.
  assert.equal(findIllegalAct('recce-bribe-scaler')?.id, 'bribe-the-scaler');
  assert.equal(findIllegalAct('recce-harass-protesters')?.id, 'drop-a-tree-near-the-blockade');
});

test('planners are not handed a woodlot, an appraisal or a board dashboard', () => {
  for (const id of ['woodlot-overcut-gambit', 'post-review-sloppy-data', 'illicit-carbon-spreadsheet']) {
    assert.ok(!REACH.get(id)?.includes('planner'), `${id} reaches the planner`);
  }
  // A silviculture fall/winter act does not leak into a spring field season.
  const spring = journeyFor('silviculture', 'fraser-plateau', 'spring');
  assert.equal(actMatchesTemptationContext(findIllegalAct('extend-the-regen-delay-quietly'), spring), false);
});

// Planting, camps and bears are not winter work (js/modes/silviculture.js
// stops planting in winter). The exceptions are desk and ordering work.
const WINTER_WORK = new Map([
  ['black-market-seedlot', 'a sowing request is winter desk work'],
  ['wrong-seedzone-bulk-order', 'seed orders go in over the winter'],
  ['silvi-falsify-stocking-standards', 'an FSP amendment at the desk'],
  ['extend-the-regen-delay-quietly', 'next year is planned in the winter'],
  ['permitter-falsify-seed-transfer', 'the sowing schedule is set in the winter'],
  ['slash-burn-party', 'piles are burned ahead of the planters, often in winter'],
  ['shadow-nursery-pilot', 'a greenhouse runs all year'],
  ['recce-hunt-on-shift', 'camp meat is taken in any season'],
  ['recce-abandon-garbage', 'winter camps are real in the north'],
  ['shadow-sup-camp', 'winter camps are real in the north'],
]);

test('planting, camp and bear acts are never offered to a silviculture supervisor in winter', () => {
  const PLANTING = /\bplant(s|ed|ing|ers?)?\b|\bseedlings?\b|\breefer\b|\bcamp\b|\bgrizzly\b|\bbear\b/i;
  const offenders = [];
  for (const act of ACTIVE_ILLEGAL_ACTS) {
    if (!REACH.get(act.id).includes('silviculture') || !PLANTING.test(actText(act))) continue;
    if (WINTER_WORK.has(act.id)) continue;
    const winterReach = OPERATING_AREAS.some((area) => actMatchesTemptationContext(act, JOURNEYS.get(`silviculture/${area.id}/winter`)));
    if (winterReach) offenders.push(act.id);
  }
  assert.deepEqual(offenders, []);
});

// ── Who is asking ───────────────────────────────────────────────────────────

test('self-proposed acts never put "yourself" where a person should be', () => {
  const selfActs = ACTIVE_ILLEGAL_ACTS.filter(isSelfProposedAct);
  assert.ok(selfActs.length >= 5);
  for (const act of selfActs) {
    for (const roleId of REACH.get(act.id)) {
      const journey = journeyFor(roleId);
      const lines = [];
      for (let i = 0; i < 4; i += 1) {
        const event = buildTemptationEvent(act, journey);
        assert.match(event.description, /^It is 4:45 on a Friday and the thought is yours: “/, `${act.id} (${roleId})`);
        lines.push(event.options[0].outcome, event.options[2].outcome);
      }
      const event = buildTemptationEvent(act, journey);
      for (const roll of [0.01, 0.3, 0.9]) {
        const answer = resolveTemptationSetAside(journey, event, () => roll);
        assert.equal(answer.kind, 'drop', `${act.id}: your own idea does not ask again or go around you`);
        lines.push(answer.message);
      }
      assert.equal(journey.temptationMemory.pending.length, 0);
      for (const line of lines) assert.doesNotMatch(line, /yourself|4:45/i, `${act.id} (${roleId}): ${line}`);
    }
  }
});

test('a proposer is one person in one place: no second location, no lost comma', () => {
  for (const act of ACTIVE_ILLEGAL_ACTS) {
    if (isSelfProposedAct(act)) continue;
    for (const roleId of REACH.get(act.id)) {
      const journey = journeyFor(roleId);
      const event = buildTemptationEvent(act, journey);
      const lead = FIELD_ROLES.has(roleId)
        ? /^[A-Z][^,“]*, at the tailgate: “/
        : /^[A-Z][^,“]*, (on the phone|by email): “/;
      assert.match(event.description, lead, `${act.id} (${roleId}): ${event.description.slice(0, 80)}`);
      const proposer = event.description.split(', ')[0];
      for (let i = 0; i < 4; i += 1) {
        const outcome = buildTemptationEvent(act, journey).options[0].outcome;
        if (outcome.includes(proposer)) {
          assert.match(outcome, new RegExp(`${proposer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} [a-z']`), `${act.id}: ${outcome}`);
        }
      }
    }
  }
});

// ── Payoff lines ────────────────────────────────────────────────────────────

// "You get <line>, and nobody asks." A line with a finite verb before any
// relative clause reads "You get the RP goes through review".
const CLAUSE_VERBS = /\b(goes|go|clears|lands|stops|passes|jumps|moves|comes|disappears|dies|stays|is|are|opens|starts|drops|becomes|closes|shows|skips|continues|saves)\b/i;

// What a shortcut may be worth to each desk or program budget: a day's edge,
// not a quarter of the year's money.
const BUDGET_PAYOFF_CAP = { planner: 12000, permitter: 12000, silviculture: 20000 };

test('payoff lines read after "You get" and promise only what lands', () => {
  const problems = [];
  for (const act of ACTIVE_ILLEGAL_ACTS) {
    const line = act.payoff.line;
    const head = line.split(/,|\b(?:that|who|which|where|when|than|if|instead|before|after|without)\b/)[0];
    if (CLAUSE_VERBS.test(head)) problems.push(`${act.id}: "${line}" is a clause, not a thing you get`);
    if (act.payoff.kind === 'time' && /\bmonths?\b|\bseasons?\b|\byears?\b/.test(line)) {
      problems.push(`${act.id}: "${line}" promises more time than a shortcut pays`);
    }
    const figure = line.match(/\$([\d,]+)/);
    for (const roleId of REACH.get(act.id)) {
      const { effects } = buildTemptationPayoff(act, DEFAULT_JOURNEY[roleId]);
      if (figure && effects.budget !== Number(figure[1].replace(/,/g, ''))) {
        problems.push(`${act.id} (${roleId}): line says ${figure[0]}, pays ${JSON.stringify(effects)}`);
      }
      if (BUDGET_PAYOFF_CAP[roleId] && Number(effects.budget) > BUDGET_PAYOFF_CAP[roleId]) {
        problems.push(`${act.id} (${roleId}): ${effects.budget} is more than a shortcut is worth to that budget`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

// ── Facts ───────────────────────────────────────────────────────────────────

const WRONG_FACTS = [
  [/reserve width depends on slope/i, 'riparian widths follow stream class, not slope'],
  [/hundred and forty years/i, 'CMTs are protected automatically when they predate 1846'],
  [/The cap is forty/i, 'the maximum opening is 40 ha only in the southern interior'],
  [/crossing responsible professional/i, 'the CAS is the coordinating registered professional'],
  [/Revenue Branch check scal/i, 'check scaling is not a Revenue Branch officer at the sort'],
  [/licence number of a retired/i, 'an RFT has a registration number'],
  [/compensation the trapper is owed/i, 'trapline compensation is an arrangement, not a statutory debt'],
  [/sixty days of notice/i, 'there is no legislated guide-outfitter notice period'],
  [/variance (letter|approval)/i, 'a variance letter is not a FRPA instrument'],
  [/missing AOA as a Heritage Conservation Act/i, 'the HCA protects sites; it does not require an AOA'],
  [/FSP amendment review picks up/i, 'no amendment was filed'],
  [/\bPUP\b/, 'licensee vegetation management runs under a pest management plan'],
  [/dry-land sort/i, 'dryland sorts are coastal; the scaler act is offered everywhere'],
  [/monthly bridge inspection/i, 'bridge inspection is not a monthly duty'],
  [/private parcel's cruise/i, 'private land is not cruised for stumpage'],
  [/mule deer/i, 'the Island has black-tailed deer'],
  [/Ministry of Environment's/i, 'the ministry is Environment and Parks'],
  [/without an OFA 3|OFA 3 attendant/i, 'OFA 3 is now Advanced First Aid'],
];

test('the library stays off facts the forestry review found wrong', () => {
  for (const act of ILLEGAL_ACTS) {
    const text = [act.title, act.description, act.pitch, act.catch.how, act.payoff.line, act.cleanOutcome, act.goAround,
      buildCaughtNarrative(act, 0), buildCaughtNarrative(act, 1)].filter(Boolean).join(' ');
    for (const [pattern, why] of WRONG_FACTS) assert.doesNotMatch(text, pattern, `${act.id}: ${why}`);
  }
  const cmt = ILLEGAL_ACTS.find((act) => act.id === 'recce-ignore-cmt');
  assert.match(cmt.catch.how, /1846/);
});

test('coastal and interior acts stay on their own side of the mountains', () => {
  const island = OPERATING_AREAS.find((area) => area.id === 'vancouver-island-coast');
  const fsj = OPERATING_AREAS.find((area) => area.id === 'fort-st-john-plateau');
  const offered = (id, area, roleId) => actMatchesTemptationContext(ILLEGAL_ACTS.find((act) => act.id === id), { roleId, area, scrutiny: 60 });
  assert.equal(offered('bootleg-fibre-shuffle', fsj, 'manager'), false, 'old-growth cedar to a Surrey broker is a coast act');
  assert.equal(offered('silvi-wrong-seed-zone', island, 'silviculture'), false, 'the Island is the coast');
  assert.equal(offered('silvi-smuggle-cones', island, 'silviculture'), false, 'no whitebark pine on the Island');
  assert.equal(offered('planner-conceal-karst', island, 'planner'), true, 'the Island is karst country');
});

// ── The library is not the same ask twice ───────────────────────────────────

test('no role is offered two acts with nearly the same pitch', () => {
  const words = (text) => new Set(text.toLowerCase().match(/[a-z']{4,}/g) || []);
  const pairs = [];
  for (let i = 0; i < ACTIVE_ILLEGAL_ACTS.length; i += 1) {
    for (let j = i + 1; j < ACTIVE_ILLEGAL_ACTS.length; j += 1) {
      const a = ACTIVE_ILLEGAL_ACTS[i];
      const b = ACTIVE_ILLEGAL_ACTS[j];
      if (!REACH.get(a.id).some((roleId) => REACH.get(b.id).includes(roleId))) continue;
      const wa = words(`${a.description} ${a.pitch}`);
      const wb = words(`${b.description} ${b.pitch}`);
      const shared = [...wa].filter((word) => wb.has(word)).length;
      const jaccard = shared / (wa.size + wb.size - shared);
      if (jaccard > 0.3) pairs.push(`${a.id} ~ ${b.id} (${jaccard.toFixed(2)})`);
    }
  }
  assert.deepEqual(pairs, []);
});

// ── Seasonal fallout ────────────────────────────────────────────────────────

test('every fallout issue a caught shortcut can schedule exists', () => {
  const source = readFileSync(new URL('../js/engine/content.js', import.meta.url), 'utf8');
  const start = source.indexOf('const FALLOUT_BY_INSTITUTION');
  const end = source.indexOf('function issueAllowsRole');
  assert.ok(start > 0 && end > start, 'fallout tables moved; update this test');
  const tables = source.slice(start, end);
  const tail = source.slice(end, source.indexOf('\n}\n', source.indexOf('function buildIllegalActFailScheduleIssues')));
  const ids = new Set([...`${tables}${tail}`.matchAll(/\badd(?:Candidate)?\("([a-z0-9-]+)"/g)].map((m) => m[1]));
  assert.ok(ids.size > 20);
  const known = new Set([...ISSUE_LIBRARY, ...CHAINED_ISSUES].map((issue) => issue.id));
  assert.deepEqual([...ids].filter((id) => !known.has(id)), []);
});

// ── Legacy mischief ─────────────────────────────────────────────────────────

test('mischief tempts with more than the honest options and never pays in compliance or goodwill', () => {
  const tasks = new Map(FORESTER_ROLES.flatMap((role) => (role.tasks || []).map((task) => [task.id, task])));
  for (const [taskId, mischief] of Object.entries(MISCHIEF_OPTIONS)) {
    const task = tasks.get(taskId);
    assert.ok(task, `${taskId} matches no role task`);
    const { successEffects, failEffects, successOutcome, failOutcome } = mischief.risk;
    for (const meter of ['compliance', 'relationships', 'forestHealth']) {
      assert.ok(!(Number(successEffects[meter]) > 0), `${taskId}: a successful ${mischief.label.toLowerCase()} raises ${meter}`);
    }
    const honestBest = Math.max(...task.options.map((option) => Number(option.effects?.progress) || 0));
    assert.ok(successEffects.progress > honestBest, `${taskId}: no reason to take it over the honest options`);
    const total = (effects) => Object.values(effects).reduce((sum, value) => sum + value, 0);
    assert.ok(total(failEffects) < -total(successEffects), `${taskId}: getting caught has to cost more than it pays`);
    assert.doesNotMatch(`${mischief.outcome} ${successOutcome} ${failOutcome}`, /attempt something risky|band council|Environment ministry|Ministry suspends/i, taskId);
  }
});
