import test from 'node:test';
import assert from 'node:assert/strict';

import { createPermittingJourney } from '../js/journey/factory.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import {
  ensurePermitFiles,
  getChaseableFiles,
  getPermitFiles,
  getPermitFilesInLane,
} from '../js/journey/permitPipeline.js';
import {
  buildActionOptions,
  ensurePermittingRevisionState,
  resolvePermitRevisionResponse,
  runPermittingDay,
  seedPermitRevisionTickets,
} from '../js/modes/permitting.js';

// Day 1 draws no situation, so a scripted day goes straight to the menu.
function makeJourney(areaId) {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === areaId);
  const journey = createPermittingJourney({ roleId: 'permitter', areaId, area });
  journey.day = 1;
  ensurePermitFiles(journey);
  return journey;
}

function allOptions(journey) {
  const { primary, support } = buildActionOptions(journey);
  return [...primary, ...support];
}

function scriptedGame(journey, picks) {
  const lines = [];
  const write = (text) => { lines.push(String(text ?? '')); };
  const queue = [...picks];
  return {
    lines,
    game: {
      journey,
      gameOver: false,
      ui: {
        write, writeHeader: write, writeWarning: write, writePositive: write, writeDanger: write,
        writeBox: write, writeInfo: write, writeSuccess: write,
        writeDivider() {}, clear() {}, updateAllStatus() {}, playScene() {}, setMissionStatus() {},
        async promptText() { return ''; },
        async promptChoice(_prompt, options = []) {
          if (options.length <= 1) return options[0] || { value: undefined };
          const want = queue.shift();
          return options.find((option) => option.value === want)
            || options.find((option) => option.value === 'end_day')
            || options[0];
        },
      },
    },
  };
}

test('Compliance Admin stays on the menu in a road-heavy area, and it logs the CPD it promises', async () => {
  const journey = makeJourney('fort-st-john-plateau');
  const options = allOptions(journey);
  const admin = options.find((option) => option.value === 'professional_admin');
  assert.equal(admin?.label, 'Compliance Admin');
  const lane = options.find((option) => option.value === 'lane_file');
  assert.equal(lane?.label, 'Road Permit File', 'the road lane is its own job');
  assert.doesNotMatch(lane.description, /CPD/);

  const cpdBefore = journey.professional.cpdHours;
  const { game } = scriptedGame(journey, ['professional_admin']);
  await runPermittingDay(game);
  assert.ok(journey.professional.cpdHours > cpdBefore, 'CPD is logged');
});

test('a road-permit day drafts a road permit', async () => {
  const journey = makeJourney('fort-st-john-plateau');
  const before = new Set(getPermitFiles(journey).map((file) => file.id));
  const { game, lines } = scriptedGame(journey, ['support_menu', 'lane_file']);
  await runPermittingDay(game);
  const drafted = getPermitFiles(journey).filter((file) => !before.has(file.id));
  assert.ok(drafted.length >= 1, lines.join('\n'));
  assert.ok(drafted.every((file) => ['RP', 'RUP'].includes(file.type)), drafted.map((file) => file.label).join(', '));
});

test('a consultation letter on a decided file does not invent a referral closing date', () => {
  for (const areaId of ['skeena-nass', 'tahltan-highland', 'vancouver-island-coast']) {
    const journey = makeJourney(areaId);
    seedPermitRevisionTickets(journey, 6);
    for (const ticket of ensurePermittingRevisionState(journey)) {
      assert.doesNotMatch(ticket.summary, /window closes Day/, `${areaId}: ${ticket.summary}`);
      assert.doesNotMatch(`${ticket.title}: ${ticket.summary}`, /incomplete: Application/i);
    }
  }
});

test('a fast-track says what it cost in goodwill and scrutiny', () => {
  const journey = makeJourney('bulkley-valley');
  seedPermitRevisionTickets(journey, 2);
  const goodwill = journey.resources.politicalCapital;
  const result = resolvePermitRevisionResponse(journey, null, 'fast');
  assert.equal(result.resolved, true);
  if (journey.resources.politicalCapital !== goodwill) {
    assert.ok(result.messages.some((line) => /^District goodwill -\d+ → \d+\.$/.test(line)), result.messages.join('\n'));
  }
  assert.ok(result.messages.some((line) => /^Scrutiny rose to \d+%\.$/.test(line)), result.messages.join('\n'));
});

test('the referral follow-up names the file it actually moves', async () => {
  const journey = makeJourney('skeena-nass');
  journey.relationships.nations = 80;
  const referrals = getPermitFiles(journey)
    .filter((file) => file.type === 'CP' && ['screening', 'referral', 'decision'].includes(file.lane) && !file.pausedBy)
    .slice(0, 2);
  assert.equal(referrals.length, 2, 'fixture: two files to put out on referral');
  for (const file of referrals) {
    file.lane = 'referral';
    file.wsaClockCloses = null;
  }
  journey.permits.inReferral = getPermitFilesInLane(journey, 'referral').length;
  // The soonest referral closes tonight and cannot be brought forward; the
  // call is about the next one.
  referrals[0].clockCloses = journey.day;
  referrals[1].clockCloses = journey.day + 2;
  const [movable] = getChaseableFiles(journey, ['referral']);
  const option = allOptions(journey).find((entry) => entry.value === 'follow_up_referrals');
  assert.ok(option.description.startsWith(movable.label), option.description);

  const { game, lines } = scriptedGame(journey, ['follow_up_referrals']);
  await runPermittingDay(game);
  const said = lines.find((line) => /referral coordinator/.test(line));
  assert.ok(said?.includes(movable.label), said);
});
