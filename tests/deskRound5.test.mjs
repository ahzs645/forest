import test from 'node:test';
import assert from 'node:assert/strict';

import { createPermittingJourney } from '../js/journey/factory.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { describeEffectChips, formatEventForDisplay } from '../js/events/display.js';
import { applyEventEffects, projectAppliedEffects } from '../js/events/resolution.js';
import {
  draftPermits,
  ensurePermitFiles,
  getPermitFilesInLane,
  planQueueWork,
  syncPermitCounters,
} from '../js/journey/permitPipeline.js';
import {
  WATCHED_DESK_SCRUTINY,
  buildActionOptions,
  ensurePermittingRevisionState,
  getPermitApprovalRate,
  getWatchedDeskPenalty,
  runPermittingDay,
  workPermitQueue,
} from '../js/modes/permitting.js';

function makePermitter(areaId = 'bulkley-valley') {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === areaId);
  const journey = createPermittingJourney({ roleId: 'permitter', areaId, area });
  journey.day = 1;
  ensurePermitFiles(journey);
  return journey;
}

// ── The permit season (round 5, N5-1) ─────────────────────────────────────

test('a drafted file goes to the district the next day instead of idling behind the backlog', () => {
  const journey = makePermitter();
  assert.ok(journey.permits.backlog > 0, 'the season opens with a backlog to draft');
  assert.equal(planQueueWork(journey).step, 'draft');

  const drafted = workPermitQueue(journey);
  assert.equal(drafted.step, 'draft');
  assert.ok(journey.permits.backlog > 0, 'the backlog is not yet drafted out');

  // The backlog is still there, but the finished packages go in first so
  // their screening and referral clocks start running.
  journey.actionsRemaining = 1;
  assert.equal(planQueueWork(journey).step, 'submit');
  const submitted = workPermitQueue(journey);
  assert.equal(submitted.step, 'submit');
  for (const file of drafted.files.filter((entry) => entry.type !== 'HCA')) {
    assert.notEqual(file.lane, 'drafted', `${file.label} was filed the day after it was drafted`);
  }
  journey.actionsRemaining = 1;
  assert.equal(planQueueWork(journey).step, 'draft', 'with nothing drafted, the next day drafts again');
});

test('the full-length permit season is seventeen days for fifteen permits', () => {
  const journey = createPermittingJourney({ roleId: 'permitter', areaId: 'bulkley-valley' });
  assert.equal(journey.permits.target, 15);
  assert.equal(journey.deadline, 17);
});

test('a watched desk pays on every decision, under the hard-area floor as well', () => {
  const journey = makePermitter('vancouver-island-coast');
  journey.difficulty = 'hard';
  journey.scrutiny = WATCHED_DESK_SCRUTINY;
  assert.equal(getWatchedDeskPenalty(journey), 0, 'a desk at the line is not watched');
  const clean = getPermitApprovalRate(journey);

  journey.scrutiny = WATCHED_DESK_SCRUTINY + 15;
  assert.ok(Math.abs(getWatchedDeskPenalty(journey) - 0.2) < 1e-9, 'four points of approval for every three of scrutiny');
  const watched = getPermitApprovalRate(journey);
  assert.ok(watched < clean - 0.15, `watched ${watched} vs clean ${clean}`);
  assert.ok(watched < 0.42, 'the floor that keeps a hard area playable does not shelter a watched desk');

  journey.scrutiny = 100;
  assert.equal(getWatchedDeskPenalty(journey), 0.25, 'the watch is capped');
});

/** A stub UI that plays one choice per prompt and keeps what the day printed. */
function recordingUi(choose) {
  const record = { lines: [], statuses: [] };
  const push = (text) => { if (typeof text === 'string') record.lines.push(text); };
  record.ui = {
    write: push, writeHeader: push, writeWarning: push, writePositive: push, writeDanger: push,
    writeDivider: () => {}, clear: () => {}, updateAllStatus: () => {}, playScene: () => {},
    setMissionStatus: (status) => record.statuses.push(status),
    async promptChoice(prompt, options = []) {
      if (!options.length) return { value: undefined };
      return choose(options) || options[0];
    },
  };
  return record;
}

test('the pane says what a watched desk costs', async () => {
  const journey = makePermitter();
  journey.scrutiny = 70;
  const record = recordingUi((options) => options.find((option) => option.value === 'set_aside')
    || options.find((option) => option.value === 'process_permits'));
  await runPermittingDay({ ui: record.ui, journey, gameOver: false, checkpoint() {} });
  const alerts = record.statuses.flatMap((status) => status?.alerts || []);
  assert.ok(alerts.some((alert) => /over 40%, the District Manager reads every file from this desk line by line: each decision is \d+ points likelier/.test(alert.text)),
    alerts.map((alert) => alert.text).join('\n'));
});

test('no look-ahead milestone prints on the night the season ends', async () => {
  const journey = makePermitter();
  journey.day = journey.deadline;
  draftPermits(journey, journey.permits.backlog);
  const files = journey.permits.files.filter((file) => file.type !== 'HCA');
  // Eleven issued, three at the decision with every gap answered: the night
  // crosses the 75% and 90% marks and the season ends with it.
  files.forEach((file, index) => {
    if (index < 11) { file.lane = 'issued'; file.issuedDay = 1; file.clockCloses = null; return; }
    file.lane = index < 14 ? 'decision' : 'deficiency';
    file.clockCloses = index < 14 ? journey.day : null;
    file.cleanResponses = 4;
    file.pausedBy = null;
    file.wsaClockCloses = null;
  });
  journey.permits.files = journey.permits.files.filter((file) => file.type !== 'HCA');
  syncPermitCounters(journey);
  const approvedBefore = journey.permits.approved;
  assert.equal(approvedBefore, 11);
  const record = recordingUi((options) => options.find((option) => option.value === 'set_aside')
    || options.find((option) => /^revise_permit:.*:clean$/.test(String(option.value))));
  await runPermittingDay({ ui: record.ui, journey, gameOver: false, checkpoint() {} });
  assert.ok(journey.permits.approved > approvedBefore, 'the night issued files');
  assert.ok(!record.lines.some((line) => /MILESTONE/.test(line)), record.lines.filter((line) => /MILESTONE/.test(line)).join('\n'));
});

test('on the last day a clean response is not called the best move: it is decided after the deadline', () => {
  const journey = makePermitter();
  // Every file is back with a letter and nothing else is queue work.
  journey.permits.backlog = 0;
  for (const file of journey.permits.files) {
    if (file.type === 'HCA') continue;
    file.lane = 'deficiency';
    file.clockCloses = null;
    file.deficiencyProfileId = null;
  }
  ensurePermittingRevisionState(journey);

  journey.day = journey.deadline - 1;
  let { primary } = buildActionOptions(journey);
  let clean = primary.find((option) => /:clean$/.test(option.value));
  assert.match(clean.description, /^Best move \| /, 'the day before the deadline, a clean answer is decided on the last night');

  journey.day = journey.deadline;
  ({ primary } = buildActionOptions(journey));
  clean = primary.find((option) => /:clean$/.test(option.value));
  assert.doesNotMatch(clean.description, /Best move/);
  assert.match(clean.description, /decided after the deadline/);
});

test('drafting a file on heavy heritage ground still files its HCA permit first', () => {
  const journey = makePermitter('tahltan-highland');
  const drafted = draftPermits(journey, 3);
  const plan = planQueueWork(journey);
  assert.equal(plan.step, 'submit');
  const hca = drafted.find((file) => file.type === 'HCA' && file.holdsFileId);
  if (hca) assert.equal(plan.file?.id, hca.id);
  assert.ok(getPermitFilesInLane(journey, 'drafted').length > 0);
});

// ── Card chips (round 5, N5-2 / N5-3 / N5-4) ──────────────────────────────

function hintFor(eventId, label, journeyType = 'permitting') {
  const event = DESK_EVENTS.find((candidate) => candidate.id === eventId);
  const index = event.options.findIndex((option) => option.label.startsWith(label));
  return formatEventForDisplay(event, journeyType).options[index].hint;
}

test('a gamble prints each band under its own label, each with its own scrutiny', () => {
  const hint = hintFor('contractor_dispute', 'Reject the overage');
  const [holds, wrong] = hint.split(' / ');
  assert.match(holds, /if it holds: .*\+8 goodwill, \+1 scrutiny$/, hint);
  assert.match(wrong, /^if it goes wrong: .*\+2 scrutiny$/, hint);
  // The good band's scrutiny no longer trails the bad band as a second cost.
  assert.equal((wrong.match(/scrutiny/g) || []).length, 1, hint);
});

test('scrutiny knock-ons are whole points, a half rounded up, and the chip is what lands', () => {
  const effects = { compliance: -3 };
  const projected = projectAppliedEffects(effects, 'permitting');
  assert.equal(projected.scrutiny, 5, '-3 compliance is +4.5 rounded up to +5');
  assert.equal(projected.politicalCapital, -3);
  assert.deepEqual(describeEffectChips(effects, 'permitting'), ['-3 compliance', '-3 goodwill', '+5 scrutiny']);

  const journey = makePermitter();
  journey.scrutiny = 20;
  applyEventEffects(journey, effects, []);
  assert.equal(journey.scrutiny, 25);

  // A save carrying a half point from before the rule is squared up.
  journey.scrutiny = 77.5;
  applyEventEffects(journey, { scrutiny: -12 }, []);
  assert.equal(journey.scrutiny, 66);
});

test('no desk card chip prints a fractional scrutiny', () => {
  for (const event of DESK_EVENTS) {
    for (const type of ['planning', 'permitting']) {
      for (const option of formatEventForDisplay(event, type).options) {
        assert.doesNotMatch(option.hint, /\d\.\d+ scrutiny/, `${event.id}: ${option.label}: ${option.hint}`);
      }
    }
  }
});

test('an off-book answer with a hidden outcome prints its stakes', () => {
  const hint = hintFor('whistleblower_allegation', 'Quietly bury');
  assert.match(hint, /40% clean, 30% badly wrong/);
  assert.match(hint, /if it holds: -10 compliance, -10 goodwill, \+17 scrutiny/, hint);
  assert.match(hint, /if it partly holds: .*-18 goodwill/, hint);
  assert.match(hint, /if it goes wrong: .*-23 goodwill, \+31 scrutiny/, hint);

  // So does a hidden answer on a desk that costs something even when it holds.
  assert.match(hintFor('anonymous_tip_poaching', 'Confront the contractor'), /if it holds: \+3 relations, -5 compliance, -5 goodwill, \+7 scrutiny/);
  // A certain cost is not "Outcome uncertain".
  const pay = hintFor('contractor_dispute', 'Pay the full amount');
  assert.doesNotMatch(pay, /uncertain/);
  assert.match(pay, /-\$18k, \+5 relations, -5 compliance, -5 goodwill, \+7 scrutiny/);
});

test('a goodwill cost the compliance gain pays back prints no "0 goodwill" chip', () => {
  const hint = hintFor('media_forestry_controversy', 'Issue a detailed public rebuttal');
  assert.doesNotMatch(hint, /\b0 goodwill/, hint);
});
