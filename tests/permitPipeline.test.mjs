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
import { executeDeskDay } from '../js/journey/deskMechanics.js';

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

test('an early-approval event signs only what is on the District Manager\'s desk and never conjures a file', () => {
  const journey = makeJourney();
  journey.permits = { target: 15, backlog: 6, drafting: 0, submitted: 2, inReferral: 1, inReview: 0, needsRevision: 0, approved: 0 };
  journey.day = 2;
  ensurePermitFiles(journey);
  const filesBefore = getPermitFiles(journey).map((file) => file.id);
  assert.equal(filesBefore.length, 3);

  const result = resolveEvent(journey, { id: 'permit_approved_early', title: 'CP Issued Early' }, {
    label: 'Use momentum to push others',
    effects: { permits_approved: 1, progress: 5 },
  });

  assert.equal(journey.permits.approved, 0, 'nothing was at decision, so nothing is issued');
  assert.deepEqual(getPermitFiles(journey).map((file) => file.id), filesBefore, 'no file appears from nowhere');
  assert.equal(journey.permits.backlog, 6);
  assert.ok(result.messages.some((message) => /Nothing (else )?is on the District Manager's desk to sign/.test(message)));

  // A file at decision behind an open WSA s.11 window is held, and an event
  // cannot walk past the hold.
  const [screening] = getPermitFilesInLane(journey, 'screening');
  screening.lane = 'decision';
  screening.clockCloses = journey.day + 1;
  screening.wsaClockCloses = journey.day + 2;
  syncPermitCounters(journey);
  resolveEvent(journey, { id: 'permit_approved_early', title: 'CP Issued Early' }, {
    label: 'Celebrate with the team',
    effects: { permits_approved: 1 },
  });
  assert.equal(screening.lane, 'decision', 'the WSA hold is respected');
  assert.equal(journey.permits.approved, 0);

  // Once the window has closed the event signs that file, by name.
  screening.wsaClockCloses = journey.day;
  const signed = resolveEvent(journey, { id: 'permit_approved_early', title: 'CP Issued Early' }, {
    label: 'Celebrate with the team',
    effects: { permits_approved: 1 },
  });
  assert.equal(screening.lane, 'issued');
  assert.equal(journey.permits.approved, 1);
  assert.ok(signed.messages.some((message) => message.startsWith(`${screening.label} ISSUED by the District Manager`)));
  assert.equal(getPermitFiles(journey).length, filesBefore.length);
});

test('a setback event slips clocks but keeps a paused CP and its HCA permit in the queue', () => {
  const journey = makeJourney();
  journey.permits = { target: 15, backlog: 0, drafting: 0, submitted: 0, inReferral: 0, inReview: 0, needsRevision: 0, approved: 0 };
  journey.day = 1;
  const catalogue = buildPermitFileCatalogue(journey);
  const heavy = catalogue.find((file) => file.needsHca);
  journey.permits.catalogueCursor = catalogue.indexOf(heavy);
  journey.permits.backlog = 1;
  const drafted = draftPermits(journey, 1);
  const cp = drafted.find((file) => file.type === 'CP');
  const hca = drafted.find((file) => file.type === 'HCA');
  journey.day = 2;
  submitPermits(journey, 2);
  const hcaClockBefore = hca.clockCloses;

  const result = resolveEvent(journey, { id: 'grant_window', title: 'Federal Climate Adaptation Fund' }, {
    label: 'Drop everything and write the application',
    effects: { progress: -10 },
  });
  reconcilePermitFiles(journey);

  assert.ok(getPermitFiles(journey).some((file) => file.id === cp.id), 'the CP is still in the queue');
  assert.ok(getPermitFiles(journey).some((file) => file.id === hca.id), 'the HCA permit is still in the queue');
  assert.equal(cp.pausedBy, hca.id, 'the CP still waits on its HCA permit');
  assert.equal(cp.lane, 'screening');
  assert.equal(journey.permits.backlog, 0, 'no named file was demoted to a nameless backlog entry');
  assert.ok(hca.clockCloses > hcaClockBefore, 'the setback is a slipped clock on the live file');
  assert.ok(result.messages.some((message) => /The queue slips: .*HCA permit/.test(message)));
});

test('reconciling a counter shortfall sends the surplus file back to drafted instead of deleting it', () => {
  const journey = makeJourney();
  journey.permits = { target: 15, backlog: 4, drafting: 0, submitted: 2, inReferral: 0, inReview: 0, needsRevision: 0, approved: 0 };
  journey.day = 3;
  ensurePermitFiles(journey);
  const ids = getPermitFiles(journey).map((file) => file.id);

  // An older code path edits the counter the way the old progress effect did.
  journey.permits.submitted = 1;
  journey.permits.backlog = 5;
  reconcilePermitFiles(journey);

  assert.deepEqual(getPermitFiles(journey).map((file) => file.id).sort(), ids.sort(), 'every named file survives');
  assert.equal(getPermitFilesInLane(journey, 'drafted').length, 1);
  assert.equal(journey.permits.drafting, 1);
  assert.equal(journey.permits.backlog, 4, 'the nameless backlog absorbs the shortfall');
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

// ── Pipeline validity under outside counter changes ────────────────────────
// These move the counters by hand, the way any outside effect does, so they
// hold whatever the event layer ends up writing.

function freshQueue(areaId = 'fraser-plateau') {
  const journey = makeJourney(areaId);
  journey.day = 3;
  ensurePermitFiles(journey);
  return journey;
}

function heldCpWithHca(journey) {
  const catalogue = buildPermitFileCatalogue(journey);
  const heavy = catalogue.find((file) => file.needsHca);
  journey.permits.catalogueCursor = catalogue.indexOf(heavy);
  const drafted = draftPermits(journey, 1);
  submitPermits(journey, 3);
  const cp = drafted.find((file) => file.type === 'CP');
  const hca = drafted.find((file) => file.type === 'HCA');
  return { cp, hca };
}

test('a setback that sends a submission back to the backlog keeps the named file and its HCA permit', () => {
  const journey = freshQueue();
  const { cp, hca } = heldCpWithHca(journey);
  assert.equal(cp.lane, 'screening');
  const namedBefore = getPermitFiles(journey).length;
  const backlogBefore = journey.permits.backlog;

  // A distracted week: one submission slips back to the backlog.
  journey.permits.submitted -= 1;
  journey.permits.backlog += 1;
  reconcilePermitFiles(journey);

  assert.equal(getPermitFiles(journey).length, namedBefore, 'no file leaves the queue');
  assert.ok(getPermitFiles(journey).includes(cp), 'the heritage CP is still on file');
  assert.equal(journey.permits.backlog, backlogBefore, 'the slip is a named draft, not an anonymous application');
  const pulledBack = getPermitFilesInLane(journey, 'drafted').filter((file) => file.type !== 'HCA');
  assert.equal(pulledBack.length, 1, 'one submission was pulled back to drafting');
  assert.equal(cp.pausedBy === hca.id || hca.lane === 'issued', true, 'the CP still waits on its HCA permit');
  assert.equal(hca.holdsFileId, cp.id);
});

test('a counter cannot issue a permit that is not at the decision', () => {
  const journey = freshQueue();
  for (const file of getPermitFilesInLane(journey, 'decision')) {
    file.lane = 'referral';
  }
  syncPermitCounters(journey);
  const before = getPermitFiles(journey).length;

  journey.permits.approved += 1;
  reconcilePermitFiles(journey);

  assert.equal(journey.permits.approved, 0, 'nothing was at the decision-maker, so nothing is issued');
  assert.equal(getPermitFiles(journey).length, before, 'no permit is conjured out of nothing');
  assert.equal(getPermitFilesInLane(journey, 'issued').length, 0);
});

test('a counter issue lands on a real, unheld file at the decision and never on one a WSA window holds', () => {
  const journey = freshQueue();
  const [held, free] = getPermitFilesInLane(journey, 'decision');
  held.wsaClockCloses = journey.day + 3;
  free.wsaClockCloses = null;
  free.pausedBy = null;
  const before = getPermitFiles(journey).length;

  journey.permits.inReview -= 1;
  journey.permits.approved += 1;
  reconcilePermitFiles(journey);
  assert.equal(free.lane, 'issued');
  assert.equal(held.lane, 'decision', 'the WSA s.11 window still holds it');
  assert.equal(getPermitFiles(journey).length, before);

  journey.permits.inReview -= 1;
  journey.permits.approved += 1;
  reconcilePermitFiles(journey);
  assert.equal(held.lane, 'decision');
  assert.equal(journey.permits.approved, 1, 'the second request is refused');
  assert.equal(journey.permits.inReview, 1);
});

test('a counter can move a file one lane on its own path, not past the referral', () => {
  const journey = freshQueue();
  const screening = getPermitFilesInLane(journey, 'screening');
  const cp = screening.find((file) => file.type === 'CP');
  for (const file of screening) if (file !== cp) file.lane = 'drafted';
  for (const file of getPermitFilesInLane(journey, 'decision')) file.lane = 'drafted';
  syncPermitCounters(journey);

  journey.permits.submitted -= 1;
  journey.permits.inReview += 1;
  reconcilePermitFiles(journey);
  assert.equal(cp.lane, 'screening', 'a cutting permit does not skip the First Nations referral');
  assert.equal(journey.permits.inReview, 0);
});

test('an HCA permit is the Archaeology Branch\'s: it never counts toward the District Manager\'s target', () => {
  const journey = freshQueue();
  const { hca } = heldCpWithHca(journey);
  hca.lane = 'decision';
  hca.clockCloses = journey.day;
  hca.wsaClockCloses = null;
  const result = advancePermitClocks(journey, { approvalRate: 1, completenessReturnRate: 0, random: () => 0.5 });
  assert.ok(result.issued.some((entry) => entry.file === hca));
  assert.equal(hca.lane, 'issued');
  const districtIssued = getPermitFilesInLane(journey, 'issued').filter((file) => file.type !== 'HCA').length;
  assert.equal(journey.permits.approved, districtIssued, 'the HCA permit is not in the 15');

  // And no counter can pull it about.
  journey.permits.approved = 0;
  journey.permits.inReview = 0;
  reconcilePermitFiles(journey);
  assert.equal(hca.lane, 'issued');
});

test('applications withdrawn from the backlog stay withdrawn', () => {
  const journey = freshQueue();
  const before = getPermitFiles(journey).length;
  journey.permits.backlog = 0;
  reconcilePermitFiles(journey);
  assert.equal(journey.permits.backlog, 0);
  assert.equal(getPermitFiles(journey).length, before);
  assert.notEqual(planQueueWork(journey).step, 'draft');
});

test('the opening queue gives a heritage-heavy CP its HCA permit (Tahltan)', () => {
  const journey = freshQueue('tahltan-highland');
  const hca = getPermitFiles(journey).find((file) => file.type === 'HCA');
  assert.ok(hca, 'the seeded CP on heavy heritage ground has its HCA permit');
  const cp = getPermitFiles(journey).find((file) => file.id === hca.holdsFileId);
  assert.equal(cp.pausedBy, hca.id);
  assert.equal(planQueueWork(journey).step, 'draft');
  journey.permits.backlog = 0;
  syncPermitCounters(journey);
  assert.equal(planQueueWork(journey).step, 'submit', 'the drafted HCA permit is queue work even though it is off the counters');
});

test('no area\'s queue repeats a file name or garbles a road name', () => {
  for (const area of OPERATING_AREAS) {
    const journey = makeJourney(area.id);
    const labels = buildPermitFileCatalogue(journey).map((file) => file.label);
    assert.equal(new Set(labels).size, labels.length, `${area.id}: ${labels.join(', ')}`);
    assert.ok(!labels.some((label) => /\bBlock\b.* - |\bEnd of\b/.test(label)), `${area.id}: ${labels.join(', ')}`);
  }
});

// ── Fast-track against a clean response ────────────────────────────────────

function returnedFile(journey) {
  const [file] = getPermitFilesInLane(journey, 'decision');
  file.wsaClockCloses = null;
  file.pausedBy = null;
  file.clockCloses = journey.day;
  advancePermitClocks(journey, { approvalRate: 0, completenessReturnRate: 0, random: () => 0.5 });
  assert.equal(file.lane, 'deficiency');
  return file;
}

test('a fast-track goes on tonight\'s pile; a clean response waits for tomorrow\'s', () => {
  const fastJourney = freshQueue();
  const fast = returnedFile(fastJourney);
  const fastTicket = ensurePermittingRevisionState(fastJourney).find((ticket) => ticket.fileId === fast.id);
  fastJourney.actionsRemaining = 1;
  resolvePermitRevisionResponse(fastJourney, fastTicket.id, 'fast');
  assert.equal(fast.clockCloses, fastJourney.day, 'decided tonight');

  const cleanJourney = freshQueue();
  const clean = returnedFile(cleanJourney);
  const cleanTicket = ensurePermittingRevisionState(cleanJourney).find((ticket) => ticket.fileId === clean.id);
  cleanJourney.actionsRemaining = 1;
  resolvePermitRevisionResponse(cleanJourney, cleanTicket.id, 'clean');
  assert.equal(clean.clockCloses, cleanJourney.day + 1, 'decided tomorrow night');

  // The same roll that issues the clean file sends the thin one back.
  const roll = () => 0.6;
  advancePermitClocks(fastJourney, { approvalRate: 0.7, completenessReturnRate: 0, random: roll });
  assert.equal(fast.lane, 'deficiency', 'a thin answer is likelier to come back');
  cleanJourney.day += 1;
  advancePermitClocks(cleanJourney, { approvalRate: 0.7, completenessReturnRate: 0, random: roll });
  assert.equal(clean.lane, 'issued');
});

test('a gap answered cleanly is not the next letter on the same file, whatever the seed', () => {
  for (const areaId of ['fraser-plateau', 'bulkley-valley', 'skeena-nass']) {
    const journey = freshQueue(areaId);
    const file = returnedFile(journey);
    const first = ensurePermittingRevisionState(journey).find((ticket) => ticket.fileId === file.id);
    journey.actionsRemaining = 1;
    resolvePermitRevisionResponse(journey, first.id, 'clean');
    journey.day += 1;
    file.clockCloses = journey.day;
    file.wsaClockCloses = null;
    advancePermitClocks(journey, { approvalRate: 0, completenessReturnRate: 0, random: () => 0.5 });
    const second = ensurePermittingRevisionState(journey).find((ticket) => ticket.fileId === file.id);
    assert.ok(second, `${areaId}: returned again`);
    assert.notEqual(second.profileId, first.profileId, `${areaId}: the ${first.title} letter came back after it was answered`);
    assert.deepEqual(file.resolvedDeficiencies, [first.profileId]);
  }
});

test('a package made whole is not bounced as incomplete again; a bare-minimum refile can be', () => {
  const journey = freshQueue();
  const [file] = getPermitFilesInLane(journey, 'screening');
  file.clockCloses = journey.day;
  advancePermitClocks(journey, { completenessReturnRate: 1, random: () => 0.5 });
  const ticket = ensurePermittingRevisionState(journey).find((entry) => entry.fileId === file.id);
  assert.equal(ticket.profileId, 'package-completeness');
  journey.actionsRemaining = 1;
  resolvePermitRevisionResponse(journey, ticket.id, 'clean');
  assert.equal(file.lane, 'screening');
  file.clockCloses = journey.day;
  advancePermitClocks(journey, { completenessReturnRate: 1, random: () => 0.5 });
  assert.notEqual(file.lane, 'deficiency', 'the completed package passes the screen');
});

test('a district meeting decides the one file it was about, not the whole night\'s queue', () => {
  const journey = freshQueue();
  const [met, other] = getPermitFilesInLane(journey, 'decision');
  for (const file of [met, other]) {
    file.wsaClockCloses = null;
    file.pausedBy = null;
  }
  met.clockCloses = journey.day + 1;
  other.clockCloses = journey.day;
  journey.actionsRemaining = 1;
  withRandom(0.1, () => executeDeskDay(journey, 'stakeholder_meeting', { stakeholder: 'ministry' }));
  assert.equal(met.lane, 'issued');
  assert.equal(other.lane, 'decision', 'the other file waits for tonight\'s pass and its odds');
});
