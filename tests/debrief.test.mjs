import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getFinalReportPrompt,
  resolveFinalReport,
  buildCrewEpilogue,
  buildProtagonistEpilogue,
  buildManagerEpilogue,
  updateServiceRecord,
} from '../js/game/debrief.js';
import { buildEventReaction } from '../js/events/reactions.js';
import { calculateScore } from '../js/scoring.js';

function makeMember(overrides = {}) {
  return {
    name: 'Dana',
    roleName: 'Technician',
    health: 90,
    morale: 80,
    traits: [],
    statusEffects: [],
    isActive: true,
    isDead: false,
    hasQuit: false,
    ...overrides,
  };
}

// A cycling rng stub: returns the provided values in order, then repeats the last.
function rngFrom(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test('every journey type gets a final report prompt with three stances', () => {
  for (const type of ['recon', 'field', 'silviculture', 'planning', 'permitting', 'desk', 'manager']) {
    const { prompt, options } = getFinalReportPrompt(type);
    assert.ok(prompt.length > 10, `${type} prompt`);
    assert.equal(options.length, 3, `${type} option count`);
    assert.deepEqual(options.map((o) => o.value).sort(), ['integrity', 'people', 'spin'], `${type} stances`);
    for (const opt of options) {
      assert.ok(opt.label.length > 5 && opt.hint.length > 5, `${type} labels/hints`);
    }
  }
});

test('final report resolution: integrity is safe, spin gambles, people warms', () => {
  const journey = { crew: [makeMember()] };

  const integrity = resolveFinalReport('integrity', journey);
  assert.ok(integrity.delta > 0);
  assert.equal(integrity.lines.length, 1);

  const spinWin = resolveFinalReport('spin', journey, () => 0.0);
  assert.equal(spinWin.delta, 6);
  const spinBust = resolveFinalReport('spin', journey, () => 0.99);
  assert.equal(spinBust.delta, -10);

  const people = resolveFinalReport('people', journey);
  assert.equal(people.delta, 4);
  const peopleNoCrew = resolveFinalReport('people', { crew: [] });
  assert.equal(peopleNoCrew.delta, 3);
});

test('crew epilogues cover every fate and always name the member', () => {
  const cases = [
    makeMember({ isDead: true, isActive: false }),
    makeMember({ hasQuit: true, isActive: false, morale: 10 }),
    makeMember({ hasQuit: true, isActive: false, morale: 60 }),
    makeMember({ isActive: false }), // evacuated
    makeMember({ traits: ['leader'] }),
    makeMember({ health: 95, morale: 90 }),
    makeMember({ health: 30 }),
    makeMember({ morale: 20 }),
  ];
  for (const member of cases) {
    for (const victory of [true, false]) {
      const line = buildCrewEpilogue(member, { victory, reportStyle: 'integrity' });
      assert.ok(line.includes('Dana'), 'epilogue names the member');
      assert.ok(line.length > 20, 'epilogue has substance');
    }
  }
});

test('people-style report warms the epilogue of a steady survivor', () => {
  const member = makeMember({ health: 70, morale: 60 });
  const line = buildCrewEpilogue(member, { victory: true, reportStyle: 'people' });
  assert.match(line, /appendix/);
});

test('protagonist and manager epilogues respond to outcome and state', () => {
  const calmWin = buildProtagonistEpilogue({ protagonist: { stress: 10 } }, true);
  const stressedLoss = buildProtagonistEpilogue({ protagonist: { stress: 90 } }, false);
  assert.notDeepEqual(calmWin, stressedLoss);

  const mgr = buildManagerEpilogue({
    ceo: { name: 'Margaret Chen', decision_making_style: 'conservative' },
    certifications: [{ name: 'FSC' }],
  }, true);
  assert.equal(mgr.length, 2);
  assert.match(mgr[0], /Margaret Chen/);
  assert.match(mgr[1], /FSC/);
});

test('service record accumulates runs, bests, and career stats', () => {
  const journey = { journeyType: 'recon', distanceTraveled: 42.4, day: 9 };
  const first = updateServiceRecord(null, journey, { totalScore: 61, grade: 'C' }, true);
  assert.equal(first.runs, 1);
  assert.equal(first.byRole.recon.bestScore, 61);
  assert.equal(first.byRole.recon.victories, 1);
  assert.equal(first.career.kmSurveyed, 42);
  assert.equal(first.isBest, true);

  const worse = updateServiceRecord(first, journey, { totalScore: 40, grade: 'F' }, false);
  assert.equal(worse.runs, 2);
  assert.equal(worse.byRole.recon.bestScore, 61, 'best survives a worse run');
  assert.equal(worse.byRole.recon.bestGrade, 'C');
  assert.equal(worse.isBest, false);
  assert.equal(worse.career.kmSurveyed, 84);

  const permits = updateServiceRecord(worse, {
    journeyType: 'permitting', permits: { approved: 12 }, day: 20,
  }, { totalScore: 88, grade: 'B' }, true);
  assert.equal(permits.career.permitsApproved, 12);
  assert.equal(permits.byRole.permitting.bestGrade, 'B');
});

test('event reactions: crew voice by morale, protagonist by stress, gated by chance', () => {
  // rng: fire-check, member pick, line pick
  const happy = { journeyType: 'recon', crew: [makeMember({ morale: 90 })] };
  const line = buildEventReaction(happy, {}, rngFrom([0.1, 0.0, 0.0]));
  assert.ok(line.includes('Dana'));

  const grumpy = { journeyType: 'recon', crew: [makeMember({ morale: 10 })] };
  const grumble = buildEventReaction(grumpy, {}, rngFrom([0.1, 0.0, 0.0]));
  assert.ok(grumble.includes('Dana'));
  assert.notEqual(line, grumble);

  const desk = { journeyType: 'permitting', crew: [], protagonist: { stress: 80 } };
  const inner = buildEventReaction(desk, {}, rngFrom([0.1, 0.0]));
  assert.ok(inner.length > 10);

  const ceoRun = {
    journeyType: 'manager',
    crew: [],
    ceo: { name: 'Margaret Chen', decision_making_style: 'conservative' },
  };
  const quip = buildEventReaction(ceoRun, {}, rngFrom([0.1, 0.2, 0.0]));
  assert.match(quip, /Margaret Chen/);

  assert.equal(buildEventReaction(happy, {}, rngFrom([0.9])), null, 'chance gate holds');
});

test('manager journeys now produce a real score', () => {
  const journey = {
    journeyType: 'manager',
    day: 101,
    deadline: 100,
    metrics: { reputation: 70 },
    certifications: [{ name: 'FSC' }],
    resources: { budget: 120000, politicalCapital: 60 },
    crew: [makeMember()],
    log: [{ type: 'event' }, { type: 'event' }],
  };
  const result = calculateScore(journey, true);
  assert.ok(result.totalScore > 40, `expected a real score, got ${result.totalScore}`);
  assert.notEqual(result.grade, 'F');
  assert.ok(result.components.objectives.label.includes('Reputation'));
});
