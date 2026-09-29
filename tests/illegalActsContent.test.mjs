import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ILLEGAL_ACTS,
  ACTIVE_ILLEGAL_ACTS,
  CATCH_INSTITUTIONS,
  CAUGHT_TEMPLATES,
  CATEGORY_CLEAN_OUTCOMES,
  CATEGORY_GO_AROUND,
  buildCaughtNarrative,
  isSelfProposedAct,
} from '../js/data/illegalActs.js';
import { MISCHIEF_OPTIONS } from '../js/data/mischief.js';
import { FORESTER_ROLES, ISSUE_LIBRARY, CHAINED_ISSUES } from '../js/data/index.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import {
  actMatchesTemptationContext,
  buildCaughtEffects,
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

function journeyFor(roleId, areaId = 'bulkley-valley', season = null) {
  const journey = createJourney({ roleId, areaId });
  journey.day = 5;
  journey.scrutiny = 60; // onlyWhen: scrutinyHigh acts count as reachable
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
