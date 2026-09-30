import test from 'node:test';
import assert from 'node:assert/strict';

import { checkForEvent, resolveEvent } from '../js/events.js';
import { ensureDaySeed, getDayRng } from '../js/events/dayRng.js';
import { createPermittingJourney, createPlanningJourney, createReconJourney } from '../js/journey/factory.js';
import { advancePermitClocks, ensurePermitFiles, getPermitFiles } from '../js/journey/permitPipeline.js';

/** What saveActiveRun / saveCampaign put on disk, and what a reload gets back. */
function reload(journey) {
  return JSON.parse(JSON.stringify(journey));
}

test('a day is seeded once, keeps its seed through a save, and rolls new dice on the next day', () => {
  const journey = createPlanningJourney({ areaId: 'fort-st-john-plateau' });
  journey.day = 5;
  const first = ensureDaySeed(journey);
  assert.equal(first.day, 5);
  assert.equal(ensureDaySeed(journey), first, 'seeding a seeded day is a no-op');
  assert.deepEqual(reload(journey).daySeed, first, 'the seed rides in the save');

  journey.day = 6;
  const next = ensureDaySeed(journey);
  assert.equal(next.day, 6);
  assert.notEqual(next.seed, first.seed);

  const a = getDayRng(journey, 'draw');
  const b = getDayRng(journey, 'draw');
  assert.deepEqual([a(), a(), a()], [b(), b(), b()], 'the same day and label roll the same dice');
  const night = getDayRng(journey, 'night');
  assert.notEqual(night(), getDayRng(journey, 'draw')(), 'different labels fork the seed apart');

  const unseeded = createPlanningJourney({ areaId: 'fort-st-john-plateau' });
  assert.equal(getDayRng(unseeded, 'draw'), Math.random, 'no seed for the day means the bare generator');
});

test('reloading mid-day draws the same situation, and the same quiet day', () => {
  const base = createPlanningJourney({ areaId: 'fort-st-john-plateau' });
  base.day = 9;
  base.difficulty = 'hard';

  let eventful = null;
  let quiet = null;
  for (let seed = 1; seed <= 200 && !(eventful && quiet); seed += 1) {
    const journey = reload(base);
    journey.daySeed = { day: 9, seed };
    const drawn = checkForEvent(reload(journey));
    if (drawn && !eventful) eventful = { journey, id: drawn.id };
    if (!drawn && !quiet) quiet = { journey };
  }
  assert.ok(eventful, 'some seed in 1..200 draws an event on a hard day');
  assert.ok(quiet, 'some seed in 1..200 draws a quiet day');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(checkForEvent(reload(eventful.journey))?.id, eventful.id, `reload ${attempt + 1} draws the same event`);
    assert.equal(checkForEvent(reload(quiet.journey)), null, `reload ${attempt + 1} of a quiet day stays quiet`);
  }
});

test('the same choice on a reloaded day resolves to the same band, victim and consequences', () => {
  const base = createReconJourney({ areaId: 'fort-st-john-plateau' });
  base.day = 7;
  const event = {
    id: 'ice_bridge', title: 'Ice Bridge', severity: 'moderate', description: 'x',
    options: [{
      label: 'Cross it',
      outcome: 'It holds.',
      effects: { progress: 4 },
      chanceSuccess: 0.5,
      failureOutcome: 'It goes.',
      failureEffects: { equipment: -10, crew_morale: -4 },
      riskInjury: 0.5,
    }],
  };
  const option = event.options[0];

  const outcomes = new Set();
  for (let seed = 1; seed <= 40; seed += 1) {
    base.daySeed = { day: 7, seed };
    const first = resolveEvent(reload(base), event, option);
    const second = resolveEvent(reload(base), event, option);
    assert.deepEqual(second.messages, first.messages, `seed ${seed}: the reload tells the same story`);
    outcomes.add(first.messages.join('|'));
  }
  assert.ok(outcomes.size > 1, 'different days still roll different dice');
});

test('the permitting night replays identically from a reloaded day', () => {
  const base = createPermittingJourney({ areaId: 'fraser-plateau' });
  base.day = 6;
  ensurePermitFiles(base);
  for (const file of getPermitFiles(base)) {
    if (['screening', 'referral', 'decision'].includes(file.lane)) file.clockCloses = base.day;
    file.wsaClockCloses = null;
  }
  ensureDaySeed(base);

  const night = (journey) => advancePermitClocks(journey, {
    approvalRate: 0.5,
    completenessReturnRate: 0.4,
    random: getDayRng(journey, 'night'),
  });
  const summarize = (result) => ({
    issued: result.issued.map((entry) => entry.file.id),
    returned: result.returned.map((entry) => entry.file.id),
    advanced: result.advanced.map((entry) => `${entry.file.id}:${entry.lane}`),
  });

  const first = summarize(night(reload(base)));
  const second = summarize(night(reload(base)));
  assert.deepEqual(second, first, 'the district makes the same calls after a reload');
  assert.ok(first.issued.length + first.returned.length + first.advanced.length > 0, 'the night did something');
});
