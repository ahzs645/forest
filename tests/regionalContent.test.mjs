import test from 'node:test';
import assert from 'node:assert/strict';

import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { AREA_BLOCKS, FORT_ST_JOHN_BLOCKS, getBlocksForArea } from '../js/data/blocks.js';
import { ISSUE_LIBRARY } from '../js/data/issues.js';
import { CHAINED_ISSUES } from '../js/data/chainedIssues.js';
import { ILLEGAL_ACTS } from '../js/data/illegalActs.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { getAreaSituationForJourney } from '../js/data/areaSituations.js';
import { getStockingStandard } from '../js/data/stockingStandards.js';
import { generateSilvicultureContractors } from '../js/data/silvicultureProgram.js';
import { matchesAreaContext, matchesAreaIds } from '../js/engine/seasonalContract.js';
import { eventMatchesJourneyContext, actMatchesTemptationContext } from '../js/events/selection.js';
import { buildPermitFileCatalogue } from '../js/journey/permitPipeline.js';
import { isPackageBlock } from '../js/journey/packages.js';
import { blockHasCrossing } from '../js/journey/riverCrossing.js';
import { getReconValueSweepProfile } from '../js/modes/recon.js';
import { CAMPAIGN_SEASONS, getSeasonSituation } from '../js/game/campaign.js';
import { PLACE_NAME_PATTERN } from '../scripts/lint-seasonal-content.mjs';

// Content that belongs to one part of the province has to stay there. These
// are the playtest regressions: the Island, Kootenay and Okanagan recon ran
// the Fort St. John route (Doig River, muskeg, moose), and "northern-bc"
// cards, caribou herds and -30C cold snaps turned up in the south.

const AREA_BY_ID = new Map(OPERATING_AREAS.map((area) => [area.id, area]));
const hasTag = (area, ...tags) => tags.some((tag) => area.tags.includes(tag));

// Words that only make sense in some of the province, and where they do.
const REGIONAL_VOCABULARY = [
  { pattern: /\bmoose\b/i, where: 'moose range (mainland)', allowed: (area) => hasTag(area, 'mainland') },
  { pattern: /\bgrizzl/i, where: 'grizzly range (mainland)', allowed: (area) => hasTag(area, 'mainland') },
  { pattern: /\bcaribou\b/i, where: 'caribou range', allowed: (area) => hasTag(area, 'caribou', 'bwbs') },
  { pattern: /\bmuskeg\b|\btamarack\b|\bpeat\b/i, where: 'boreal peatland', allowed: (area) => hasTag(area, 'peatland', 'bwbs') },
  { pattern: /\bbreakup\b|\bfreeze-up\b|frost is coming out|-30\s?C/i, where: 'frozen-ground country', allowed: (area) => hasTag(area, 'freeze-thaw') },
  { pattern: /\bwhiteout\b/i, where: 'the north', allowed: (area) => hasTag(area, 'northern-bc') },
];

// Which operating areas may name a place the lint pattern knows.
const AREA_PLACE_WORDS = {
  'fort-st-john-plateau': [/Peace River/, /\bBWBS\b/, /Fort St\. John/],
  'muskwa-foothills': [/Peace River/, /\bBWBS\b/, /Fort Nelson/],
  'bulkley-valley': [/Smithers/, /Highway 16/, /Bulkley/, /\bSBS\b/],
  'fraser-plateau': [/Lheidli/, /Prince George/, /\bSBS\b/],
  'skeena-nass': [/Skeena/, /\bNass\b/, /Terrace/],
  'tahltan-highland': [/Stikine/, /Tahltan/, /Dease/, /\bSWB\b/],
  'vancouver-island-coast': [/Alberni/],
  'kootenay-wetbelt': [/Kootenay/],
  'okanagan-shuswap-drybelt': [/Okanagan/],
};

// Prose only: ids, tag lists and odds keys are not player-facing text.
const NON_PROSE_KEYS = new Set(['id', 'when', 'from', 'to', 'type', 'severity', 'category', 'phase', 'tier', 'kind', 'terrain', 'value', 'by']);

function collectProse(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) if (item && typeof item === 'object') collectProse(item, out);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        if (!NON_PROSE_KEYS.has(key)) out.push(value);
      } else {
        collectProse(value, out);
      }
    }
  }
  return out;
}

function findRegionalLeaks(item, eligibleAreas, label) {
  const leaks = [];
  const text = collectProse(item).join(' | ');
  for (const rule of REGIONAL_VOCABULARY) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    for (const area of eligibleAreas) {
      if (!rule.allowed(area)) leaks.push(`${label} says "${match[0]}" (${rule.where}) but can play in ${area.id}`);
    }
  }
  const place = text.match(PLACE_NAME_PATTERN);
  if (place) {
    for (const area of eligibleAreas) {
      const allowed = AREA_PLACE_WORDS[area.id] || [];
      if (!allowed.some((re) => re.test(place[0]))) leaks.push(`${label} names ${place[0]} but can play in ${area.id}`);
    }
  }
  return leaks;
}

// ── Recon routes ────────────────────────────────────────────────────────────

test('every operating area has its own recon route, not the Fort St. John fallback', () => {
  const seenIds = new Set();
  for (const area of OPERATING_AREAS) {
    const route = AREA_BLOCKS[area.id];
    assert.ok(Array.isArray(route) && route.length >= 10, `${area.id} has no recon route data`);
    assert.equal(getBlocksForArea(area.id), route);
    if (area.id !== 'fort-st-john-plateau') {
      assert.notEqual(route, FORT_ST_JOHN_BLOCKS, `${area.id} falls back to the Fort St. John route`);
    }
    for (const stop of route) {
      assert.ok(!seenIds.has(stop.id), `stop id ${stop.id} is reused across routes`);
      seenIds.add(stop.id);
    }
  }
  assert.deepEqual(Object.keys(AREA_BLOCKS).sort(), OPERATING_AREAS.map((area) => area.id).sort(),
    'AREA_BLOCKS lists exactly the operating areas');
});

test('every route has the recon schema: staging yard, cutblocks, supply, a destination', () => {
  for (const area of OPERATING_AREAS) {
    const route = getBlocksForArea(area.id);
    for (const stop of route) {
      const where = `${area.id}/${stop.id}`;
      assert.equal(typeof stop.name, 'string', `${where} name`);
      assert.ok(['block', 'waypoint'].includes(stop.kind), `${where} kind`);
      assert.ok(stop.description?.length > 20, `${where} description`);
      assert.ok(Number.isFinite(stop.distance) && stop.distance >= 0, `${where} distance`);
      assert.ok(['flat', 'hilly', 'steep', 'river', 'muskeg', 'cutblock'].includes(stop.terrain), `${where} terrain ${stop.terrain}`);
      assert.equal(typeof stop.hasSupply, 'boolean', `${where} hasSupply`);
      assert.ok(Array.isArray(stop.hazards) && Array.isArray(stop.features), `${where} hazards/features`);
      if (isPackageBlock(stop)) assert.match(stop.name, /^Block [A-Z]{1,3}-\d+ - /, `${where} block names carry a code`);
    }
    const [first] = route;
    const last = route[route.length - 1];
    assert.equal(first.distance, 0, `${area.id} starts at a staging yard`);
    assert.ok(first.hasSupply, `${area.id} stages somewhere with supply`);
    assert.ok(isPackageBlock(last) && last.features.includes('destination'), `${area.id} ends on its destination block`);
    assert.ok(route.filter(isPackageBlock).length >= 4, `${area.id} has at least four block packages`);
    assert.ok(route.filter((stop) => stop.hasSupply).length >= 3, `${area.id} has resupply along the way`);
    const total = route.reduce((sum, stop) => sum + stop.distance, 0);
    assert.ok(total >= 140 && total <= 180, `${area.id} route is ${total} km`);
  }
});

test('the southern routes are written for their own country', () => {
  const island = getBlocksForArea('vancouver-island-coast');
  const kootenay = getBlocksForArea('kootenay-wetbelt');
  const okanagan = getBlocksForArea('okanagan-shuswap-drybelt');
  const text = (route) => route.map((stop) => `${stop.name} ${stop.description}`).join(' ');

  for (const route of [island, kootenay, okanagan]) {
    assert.doesNotMatch(text(route), /Doig|Fort St\. John|Highway 97 meets|muskeg|tamarack|black spruce|gas well|pipeline/i);
    assert.ok(route.some(blockHasCrossing), 'each route has a water crossing');
  }
  assert.match(text(island), /Alberni|Sproat|Stamp/);
  assert.match(text(island), /cedar/i);
  assert.ok(island.some((stop) => stop.hazards.includes('debris_flow')), 'coastal steep ground carries debris-flow hazard');
  assert.match(text(kootenay), /Nelson|Salmo|Kootenay Pass|Creston/);
  assert.ok(kootenay.some((stop) => stop.hazards.includes('avalanche')), 'the wetbelt route crosses avalanche terrain');
  assert.match(text(okanagan), /Vernon|Shuswap/);
  assert.ok(okanagan.some((stop) => stop.features.includes('wildfire_scar')), 'the drybelt route works a burn edge');
  assert.ok(okanagan.some((stop) => stop.hazards.includes('cattle')), 'the drybelt route crosses range');
});

test('route text never uses another region\'s places or wildlife', () => {
  const leaks = [];
  for (const area of OPERATING_AREAS) {
    for (const stop of getBlocksForArea(area.id)) {
      leaks.push(...findRegionalLeaks({ name: stop.name, description: stop.description }, [area], `${area.id}/${stop.id}`));
      if (!area.tags.includes('mainland')) {
        assert.ok(!stop.hazards.some((hazard) => /moose|grizzly|caribou/.test(hazard)), `${stop.id} puts mainland wildlife on the Island`);
      }
    }
  }
  assert.deepEqual(leaks, []);
});

test('the values sweep on the Island reports elk and murrelets, never moose', () => {
  const island = { id: 'vancouver-island-coast', tags: AREA_BY_ID.get('vancouver-island-coast').tags };
  const lines = getBlocksForArea('vancouver-island-coast')
    .filter(isPackageBlock)
    .flatMap((block) => getReconValueSweepProfile(block, { area: island }).wildlife);
  assert.ok(lines.length > 0);
  assert.ok(!lines.some((line) => /moose|grizzly|caribou/i.test(line)), lines.join('\n'));
  assert.ok(lines.some((line) => /Roosevelt elk/.test(line)));
  assert.ok(lines.some((line) => /murrelet/.test(line)));

  // The same wetland on the mainland still turns up moose sign.
  const wetland = { kind: 'block', features: ['wetland'], hazards: [] };
  const peace = { area: AREA_BY_ID.get('fort-st-john-plateau') };
  assert.ok(getReconValueSweepProfile(wetland, peace).wildlife.some((line) => /moose/.test(line)));
  assert.ok(!getReconValueSweepProfile(wetland, { area: island }).wildlife.some((line) => /moose/.test(line)));
});

// ── Area-restricted content ─────────────────────────────────────────────────

test('northern-only cards stay north; province-wide cards still play everywhere', () => {
  const north = OPERATING_AREAS.filter((area) => area.tags.includes('northern-bc'));
  const south = OPERATING_AREAS.filter((area) => !area.tags.includes('northern-bc'));
  assert.equal(north.length, 6);
  assert.equal(south.length, 3);
  for (const area of south) assert.equal(matchesAreaContext(['northern-bc'], area.tags), false, area.id);
  for (const area of north) assert.equal(matchesAreaContext(['northern-bc'], area.tags), true, area.id);
  for (const area of OPERATING_AREAS) assert.equal(matchesAreaContext(['bc-wide'], area.tags), true, area.id);

  const whiteout = ISSUE_LIBRARY.find((issue) => issue.id === 'whiteout-extraction-call');
  for (const area of south) assert.equal(matchesAreaContext(whiteout.areaTags, area.tags), false, `whiteout in ${area.id}`);
});

test('no issue, event or temptation can play outside the regions its words belong to', () => {
  const leaks = [];

  for (const issue of [...ISSUE_LIBRARY, ...CHAINED_ISSUES]) {
    const eligible = OPERATING_AREAS.filter((area) => matchesAreaIds(issue, area.id)
      && (!issue.areaTags?.length || matchesAreaContext(issue.areaTags, area.tags)));
    leaks.push(...findRegionalLeaks(issue, eligible, `issue ${issue.id}`));
  }

  for (const event of [...FIELD_EVENTS, ...DESK_EVENTS]) {
    const roleId = event.roles?.[0];
    const eligible = OPERATING_AREAS.filter((area) => eventMatchesJourneyContext(event, { area, roleId }));
    leaks.push(...findRegionalLeaks(event, eligible, `event ${event.id}`));
  }

  for (const act of ILLEGAL_ACTS) {
    if (act.retired) continue;
    const roleId = act.roles?.[0];
    const eligible = OPERATING_AREAS.filter((area) => actMatchesTemptationContext(act, { roleId, area }));
    leaks.push(...findRegionalLeaks(act, eligible, `act ${act.id}`));
  }

  assert.deepEqual([...new Set(leaks)], []);
});

test('area situations only ever play in their home valley', () => {
  for (const area of OPERATING_AREAS) {
    for (const season of ['spring', 'summer', 'fall', 'winter']) {
      const situation = getAreaSituationForJourney({ area, season: { currentSeason: season } });
      if (!situation) continue;
      assert.ok(situation.areaIds.includes(area.id), `${situation.id} drawn in ${area.id} (${season})`);
    }
  }
  const okanagan = AREA_BY_ID.get('okanagan-shuswap-drybelt');
  const spring = getAreaSituationForJourney({ area: okanagan, season: { currentSeason: 'spring' } });
  assert.notEqual(spring?.id, 'wetbelt_runoff_scrutiny');
});

// ── Permit and planning file names ──────────────────────────────────────────

test('permit files carry distinct, area-appropriate names in every area', () => {
  const roadsByArea = new Map();
  for (const area of OPERATING_AREAS) {
    const catalogue = buildPermitFileCatalogue({ areaId: area.id, area });
    const labels = catalogue.map((file) => file.label);
    assert.equal(new Set(labels).size, labels.length, `${area.id} repeats a file label: ${labels.join(', ')}`);
    for (const label of labels) {
      assert.doesNotMatch(label, /\bBlock\b|End of|\b[A-Z]{4}-\d+\b/, `${area.id}: "${label}" is garbled or a placeholder`);
    }
    assert.ok(!catalogue.some((file) => file.type === 'RUP' && / Main\b/.test(file.label)),
      'a licensee mainline never takes a road use permit');
    const roads = labels.map((label) => label.match(/^(?:RP ([A-Z][a-z][^\d]*?) spur|RUP ([A-Z][a-z][^\d]*?) FSR)/)).filter(Boolean).map((m) => m[1] || m[2]);
    roadsByArea.set(area.id, new Set(roads));
  }
  // Road names come off each area's own route, so no two areas share one
  // (the southern areas used to borrow the Fort St. John roads).
  const areas = [...roadsByArea.keys()];
  for (let i = 0; i < areas.length; i += 1) {
    for (let j = i + 1; j < areas.length; j += 1) {
      const shared = [...roadsByArea.get(areas[i])].filter((road) => roadsByArea.get(areas[j]).has(road));
      assert.deepEqual(shared, [], `${areas[i]} and ${areas[j]} share road names`);
    }
  }
  for (const areaId of ['vancouver-island-coast', 'kootenay-wetbelt', 'okanagan-shuswap-drybelt']) {
    assert.ok(roadsByArea.get(areaId).size > 0, `${areaId} names files after its own roads`);
  }
});

// ── Silviculture by zone ────────────────────────────────────────────────────

test('coast, wetbelt and drybelt silviculture fight different brush with different outfits', () => {
  const coast = getStockingStandard('CWHxm2');
  const wetbelt = getStockingStandard('ICHmw2');
  const drybelt = getStockingStandard('IDFxh1');
  const interior = getStockingStandard('SBSdw2');

  assert.equal(coast.sheepGrazing, false, 'sheep grazing is not a coastal practice');
  assert.equal(drybelt.sheepGrazing, true);
  const releases = [coast, wetbelt, drybelt, interior].map((standard) => standard.manualRelease);
  assert.equal(new Set(releases).size, 4, 'each zone has its own manual-release line');
  assert.match(coast.manualRelease, /red alder|salmonberry/);
  assert.doesNotMatch(coast.manualRelease, /aspen|willow/);
  assert.match(drybelt.manualRelease, /pinegrass|snowbrush/);
  assert.ok(coast.mss > coast.mssP, 'MSSpa (preferred + acceptable) is the larger minimum');

  const names = (becCode) => generateSilvicultureContractors(becCode).map((contractor) => contractor.name);
  const coastNames = names('CWHxm2');
  assert.ok(!coastNames.some((name) => /Pine|Northern|Boreal/.test(name)), coastNames.join(', '));
  assert.notDeepEqual(names('ICHmw2'), names('IDFxh1'));
});

test('the campaign never opens the coast with breakup', () => {
  const island = AREA_BY_ID.get('vancouver-island-coast');
  const kootenay = AREA_BY_ID.get('kootenay-wetbelt');
  for (const season of CAMPAIGN_SEASONS) {
    assert.doesNotMatch(getSeasonSituation(season, island), /breakup/i, `${season.id} on the Island`);
  }
  assert.match(getSeasonSituation(CAMPAIGN_SEASONS[0], kootenay), /Breakup/);
});
