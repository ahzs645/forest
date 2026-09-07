import test from 'node:test';
import assert from 'node:assert/strict';

import { createPermittingJourney } from '../js/journey/factory.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import {
  HCA_HERITAGE_LOAD_THRESHOLD,
  advancePermitClocks,
  buildPermitFileCatalogue,
  draftPermits,
  ensurePermitFiles,
  formatPermitClockLines,
  getPermitFiles,
  getPermitFilesInLane,
  getReferralWindow,
  getWsaWindowDeskDays,
  planQueueWork,
  reconcilePermitFiles,
  resubmitPermitFile,
  shortenPermitClock,
  submitPermits,
  syncPermitCounters,
} from '../js/journey/permitPipeline.js';
import {
  buildActionOptions,
  ensurePermittingRevisionState,
  resolvePermitRevisionResponse,
  runPermittingDay,
  workPermitQueue,
} from '../js/modes/permitting.js';
import { resolveEvent } from '../js/events/resolution.js';

function makeJourney(areaId = 'fraser-plateau') {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === areaId);
  return createPermittingJourney({ roleId: 'permitter', areaId, area });
}

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test('every queued file is a named permit with a type off the area\'s real blocks and roads', () => {
  const journey = makeJourney();
  const catalogue = buildPermitFileCatalogue(journey);
  assert.ok(catalogue.length >= 15);
  assert.ok(catalogue.some((file) => /^CP 52\/9\d\d-\w+$/.test(file.label)), 'cutting permits carry the timber mark and block id');
  assert.ok(catalogue.some((file) => /^RP Blackwater spur/.test(file.label)), 'road permits are named for the area\'s roads');
  assert.ok(catalogue.some((file) => /^RUP .+ FSR/.test(file.label)));
  assert.ok(catalogue.some((file) => /^SUP camp /.test(file.label)));
  const labels = catalogue.map((file) => file.label);
  assert.equal(new Set(labels).size, labels.length, 'no two files share a label');
  assert.ok(catalogue.every((file) => ['CP', 'RP', 'RUP', 'SUP'].includes(file.type)));
});

test('the opening queue seeds files across the lanes to match the counters', () => {
  const journey = makeJourney();
  ensurePermitFiles(journey);
  const files = getPermitFiles(journey);
  assert.equal(files.length, 7, '5 submitted + 2 in review');
  assert.equal(getPermitFilesInLane(journey, 'screening').length, 5);
  assert.equal(getPermitFilesInLane(journey, 'decision').length, 2);
  assert.equal(journey.permits.backlog, 8, 'the backlog stays anonymous until drafted');
  assert.ok(formatPermitClockLines(journey).every((line) => /closes Day \d+|decision Day \d+/.test(line)));
});

test('a cutting permit walks screening → referral clock → District Manager decision, on the compressed calendar', () => {
  const journey = makeJourney();
  journey.permits = { target: 15, backlog: 1, drafting: 0, submitted: 0, inReferral: 0, inReview: 0, needsRevision: 0, approved: 0 };
  journey.day = 1;
  const [file] = draftPermits(journey, 1);
  assert.equal(file.type, 'CP');
  assert.equal(journey.permits.drafting, 1);
  assert.equal(journey.permits.backlog, 0);

  journey.day = 2;
  submitPermits(journey, 1);
  assert.equal(file.lane, 'screening');
  assert.equal(file.clockCloses, 3, 'one desk day on the completeness screen');
  assert.equal(journey.permits.submitted, 1);

  const referral = getReferralWindow(journey);
  assert.equal(referral.calendarDays, 30, 'spring referral window');
  assert.equal(referral.deskDays, 2, '30 calendar days is two desk days');

  // Not due yet.
  advancePermitClocks(journey, { random: () => 0.99 });
  assert.equal(file.lane, 'screening');

  journey.day = 3;
  advancePermitClocks(journey, { random: () => 0.99 });
  assert.equal(file.lane, 'referral');
  assert.equal(file.clockCloses, 5);
  assert.equal(journey.permits.inReferral, 1);

  journey.day = 5;
  advancePermitClocks(journey, { random: () => 0.99 });
  assert.equal(file.lane, 'decision');
  assert.equal(file.clockCloses, 6);
  assert.equal(journey.permits.inReview, 1);

  journey.day = 6;
  const result = advancePermitClocks(journey, { approvalRate: 1, random: () => 0.5 });
  assert.equal(result.issued.length, 1);
  assert.equal(file.lane, 'issued');
  assert.equal(journey.permits.approved, 1);
});

test('the referral clock follows the season\'s referral window', () => {
  const journey = makeJourney();
  journey.season.currentSeason = 'winter';
  assert.deepEqual(getReferralWindow(journey), { calendarDays: 60, deskDays: 4 });
  journey.season.currentSeason = 'summer';
  assert.deepEqual(getReferralWindow(journey), { calendarDays: 45, deskDays: 3 });
});

test('a road use permit skips the referral and goes straight to the district', () => {
  const journey = makeJourney();
  journey.permits = { target: 15, backlog: 0, drafting: 0, submitted: 0, inReferral: 0, inReview: 0, needsRevision: 0, approved: 0 };
  journey.day = 1;
  // Draft until a RUP shows up, then submit only it.
  journey.permits.backlog = 6;
  const drafted = draftPermits(journey, 6);
  const rup = drafted.find((file) => file.type === 'RUP');
  assert.ok(rup, 'the catalogue carries a road use permit');
  journey.permits.files = journey.permits.files.filter((file) => file === rup);
  syncPermitCounters(journey);
  journey.day = 2;
  submitPermits(journey, 1);
  journey.day = 3;
  advancePermitClocks(journey, { random: () => 0.99 });
  assert.equal(rup.lane, 'decision', 'RUP is district only');
});

test('a file that touches a stream waits for its WSA s.11 notification window before it is decided', () => {
  const journey = makeJourney();
  journey.permits = { target: 15, backlog: 0, drafting: 0, submitted: 0, inReferral: 0, inReview: 0, needsRevision: 0, approved: 0 };
  journey.day = 1;
  journey.permits.backlog = 1;
  const [file] = draftPermits(journey, 1);
  file.touchesStream = true;
  journey.day = 2;
  submitPermits(journey, 1);
  assert.equal(file.wsaClockCloses, 2 + getWsaWindowDeskDays(), '45 calendar days is three desk days');

  // Chase the district so the decision is due before the WSA window closes.
  journey.day = 3;
  advancePermitClocks(journey, { random: () => 0.99 });
  assert.equal(file.lane, 'referral');
  file.clockCloses = 3;
  advancePermitClocks(journey, { random: () => 0.99 });
  assert.equal(file.lane, 'decision');
  file.clockCloses = 3;
  const held = advancePermitClocks(journey, { approvalRate: 1, random: () => 0.5 });
  assert.equal(held.held.length, 1, 'the decision waits on the notification window');
  assert.match(held.held[0].reason, /WSA s\.11/);
  assert.equal(file.lane, 'decision');

  journey.day = file.wsaClockCloses;
  file.clockCloses = journey.day;
  const decided = advancePermitClocks(journey, { approvalRate: 1, random: () => 0.5 });
  assert.equal(decided.issued.length, 1);
});

test('a heritage-heavy cutting permit spawns an HCA permit and is paused until the Archaeology Branch issues it', () => {
  const journey = makeJourney();
  journey.permits = { target: 15, backlog: 0, drafting: 0, submitted: 0, inReferral: 0, inReview: 0, needsRevision: 0, approved: 0 };
  journey.day = 1;
  const catalogue = buildPermitFileCatalogue(journey);
  const heavy = catalogue.find((file) => file.needsHca);
  assert.ok(heavy, `expected one CP at or above heritage load ${HCA_HERITAGE_LOAD_THRESHOLD}`);
  journey.permits.catalogueCursor = catalogue.indexOf(heavy);
  journey.permits.backlog = 1;
  const drafted = draftPermits(journey, 1);
  assert.equal(drafted.length, 2, 'the CP and its HCA permit are drafted together');
  const cp = drafted.find((file) => file.type === 'CP');
  const hca = drafted.find((file) => file.type === 'HCA');
  assert.equal(cp.pausedBy, hca.id);
  assert.equal(hca.holdsFileId, cp.id);
  assert.match(hca.label, /^HCA permit /);

  journey.day = 2;
  submitPermits(journey, 2);
  // Run the calendar: the CP holds every night the HCA is still open.
  let cpMoved = false;
  for (journey.day = 3; journey.day <= 5; journey.day += 1) {
    const result = advancePermitClocks(journey, { approvalRate: 1, completenessReturnRate: 0, random: () => 0.5 });
    if (result.held.some((entry) => entry.file.id === cp.id)) {
      assert.equal(cp.lane, 'screening', 'the CP does not move while paused');
    }
    if (hca.lane === 'issued') cpMoved = true;
  }
  assert.equal(hca.lane, 'issued', 'the HCA permit (1 day screen + 2 day decision) is issued by day 5');
  assert.ok(cpMoved);
  journey.day = 6;
  advancePermitClocks(journey, { approvalRate: 1, completenessReturnRate: 0, random: () => 0.5 });
  assert.equal(cp.pausedBy, null);
  assert.notEqual(cp.lane, 'screening', 'the CP moves once the HCA permit is issued');
});

test('counters moved by an authored event are reconciled back onto the files', () => {
  const journey = makeJourney();
  ensurePermitFiles(journey);
  const before = getPermitFilesInLane(journey, 'decision').length;
  resolveEvent(journey, { id: 'early', title: 'Early' }, {
    label: 'Use momentum',
    effects: { permits_approved: 1, progress: 10 },
  });
  reconcilePermitFiles(journey);
  assert.equal(getPermitFilesInLane(journey, 'issued').length, journey.permits.approved);
  assert.equal(getPermitFilesInLane(journey, 'decision').length, journey.permits.inReview);
  assert.ok(getPermitFilesInLane(journey, 'decision').length < before);
  assert.equal(getPermitFilesInLane(journey, 'screening').length, journey.permits.submitted);
});

test('deficiency letters are named files with named deficiencies, and answering one restarts its clock', () => {
  const journey = makeJourney();
  journey.day = 6;
  ensurePermitFiles(journey);
  const decisionFiles = getPermitFilesInLane(journey, 'decision');
  for (const file of decisionFiles) file.clockCloses = journey.day;
  const result = advancePermitClocks(journey, { approvalRate: 0, completenessReturnRate: 0, random: () => 0.5 });
  assert.equal(result.returned.length, decisionFiles.length);

  const queue = ensurePermittingRevisionState(journey);
  assert.equal(queue.length, decisionFiles.length, 'one letter per returned file');
  for (const ticket of queue) {
    assert.match(ticket.fileLabel, /^(CP|RP|RUP|SUP|HCA) /);
    assert.ok(ticket.fileId);
    assert.ok(ticket.summary.length > 40, 'the letter says what is missing');
    assert.ok(!/reviewer wants/.test(ticket.summary), 'no anonymous reviewer copy');
  }

  const { primary } = buildActionOptions(journey);
  assert.ok(!primary.some((option) => option.value === 'process_permits') || journey.permits.backlog > 0);

  const ticket = queue[0];
  const response = resolvePermitRevisionResponse(journey, ticket.id, 'clean');
  assert.equal(response.resolved, true);
  const file = getPermitFiles(journey).find((candidate) => candidate.id === ticket.fileId);
  assert.ok(['decision', 'screening'].includes(file.lane));
  assert.ok(file.clockCloses > journey.day, 'the clock restarts');
  assert.ok(response.messages.some((message) => message.startsWith(`${file.label}:`)));
});

test('an incomplete application goes back to the completeness screen, not the decision-maker', () => {
  const journey = makeJourney();
  journey.day = 3;
  ensurePermitFiles(journey);
  const [file] = getPermitFilesInLane(journey, 'screening');
  file.clockCloses = journey.day;
  const result = advancePermitClocks(journey, { completenessReturnRate: 1, random: () => 0.5 });
  const returned = result.returned.find((entry) => entry.file.id === file.id);
  assert.ok(returned);
  assert.equal(returned.profileId, 'package-completeness');
  const queue = ensurePermittingRevisionState(journey);
  const ticket = queue.find((entry) => entry.fileId === file.id);
  assert.equal(ticket.profileId, 'package-completeness');
  assert.match(ticket.summary, /FOM consistency statement/);
  resubmitPermitFile(journey, file.id, { completeness: true });
  assert.equal(file.lane, 'screening');
});

test('Process Permits works the queue in order and disappears when only letters are left', () => {
  const journey = makeJourney();
  journey.day = 1;
  ensurePermitFiles(journey);
  assert.equal(planQueueWork(journey).step, 'draft');
  let result = workPermitQueue(journey);
  assert.equal(result.step, 'draft');
  assert.ok(result.messages[0].startsWith('Drafted '));

  journey.actionsRemaining = 1;
  journey.permits.backlog = 0;
  assert.equal(planQueueWork(journey).step, 'submit');
  result = workPermitQueue(journey);
  assert.equal(result.step, 'submit');
  assert.ok(result.messages.some((message) => /closes Day \d+/.test(message)));

  // An HCA permit drafted alongside its CP can leave a fourth file drafted.
  while (planQueueWork(journey).step === 'submit') {
    journey.actionsRemaining = 1;
    workPermitQueue(journey);
  }
  journey.actionsRemaining = 1;
  assert.equal(planQueueWork(journey).step, 'chase');
  journey.relationships.ministry = 70;
  result = workPermitQueue(journey);
  assert.equal(result.step, 'chase');

  // Only deficiency letters left: no queue work, and the menu says so.
  for (const file of getPermitFiles(journey)) {
    file.lane = 'deficiency';
    file.clockCloses = null;
  }
  syncPermitCounters(journey);
  journey.permits.backlog = 0;
  assert.equal(planQueueWork(journey).step, null);
  const { primary } = buildActionOptions(journey);
  assert.ok(!primary.some((option) => option.value === 'process_permits'), 'Process Permits is not offered');
  assert.match(primary[0].label, /^Clean response: /);
});

test('a warm relationship with the Nation lets a follow-up bring a referral response in a day early', () => {
  const journey = makeJourney();
  journey.day = 4;
  ensurePermitFiles(journey);
  const [file] = getPermitFilesInLane(journey, 'screening');
  file.lane = 'referral';
  file.clockCloses = 7;
  syncPermitCounters(journey);
  const shortened = shortenPermitClock(journey, ['referral']);
  assert.ok(shortened);
  assert.equal(shortened.clockCloses, 6);
});

test('a full permitting day runs end to end with named files, issued stamps and no runtime errors', async () => {
  await withRandom(0.5, async () => {
    const journey = makeJourney();
    const lines = [];
    const ui = {
      write: (text) => { if (typeof text === 'string') lines.push(text); },
      writeHeader: (text) => lines.push(text),
      writeWarning: (text) => lines.push(text),
      writePositive: (text) => lines.push(text),
      writeDanger: (text) => lines.push(text),
      writeDivider: () => {},
      clear: () => {},
      updateAllStatus: () => {},
      setMissionStatus: () => {},
      playScene: () => {},
      async promptChoice(prompt, options = []) {
        if (!options.length) return { value: undefined };
        return options.find((option) => option.value === 'process_permits') || options[0];
      },
    };
    const game = { ui, journey, gameOver: false };
    for (let day = 0; day < 8; day += 1) {
      await runPermittingDay(game);
    }
    assert.ok(lines.some((line) => /ISSUED by the District Manager/.test(line)), lines.filter((line) => /ISSUED|returned/.test(line)).join('\n'));
    assert.ok(!lines.some((line) => /APPROVED!/.test(line)));
    assert.ok(lines.some((line) => /referred to /.test(line)));
  });
});
