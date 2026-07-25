import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIONS_PER_DAY,
  FREE_LOOKUPS_PER_DAY,
  startDay,
  spendDay,
  dayIsSpent,
  dayPrompt,
  settleDayPass
} from '../js/journey/dayPlan.js';

test('a fresh day carries exactly one substantive action', () => {
  const journey = {};
  startDay(journey);
  assert.equal(journey.actionsRemaining, ACTIONS_PER_DAY);
  assert.equal(dayIsSpent(journey), false);
});

test('spending the day closes it, and cannot go negative', () => {
  const journey = {};
  startDay(journey);
  spendDay(journey);
  assert.equal(dayIsSpent(journey), true);
  spendDay(journey);
  spendDay(journey);
  assert.equal(journey.actionsRemaining, 0, 'a spent day never owes actions');
});

test('resuming mid-day does not hand back an action already spent', () => {
  const journey = {};
  startDay(journey);
  spendDay(journey);
  startDay(journey, { resuming: true });
  assert.equal(dayIsSpent(journey), true, 'a restored checkpoint keeps the day spent');
});

test('startDay without the resuming flag opens a genuinely new day', () => {
  const journey = {};
  startDay(journey);
  spendDay(journey);
  startDay(journey);
  assert.equal(dayIsSpent(journey), false);
});

test('a journey that never called startDay still reads as having its day', () => {
  // Saves written before the hour budget went away carry no actionsRemaining;
  // they must resume with a usable day rather than a locked one.
  assert.equal(dayIsSpent({}), false);
});

test('settleDayPass reports the day over as soon as an action is spent', () => {
  const journey = {};
  startDay(journey);
  spendDay(journey);
  assert.equal(settleDayPass(journey, { count: 0 }), true);
});

test('settleDayPass tolerates free look-ups, then closes a day that has nothing left', () => {
  const journey = {};
  startDay(journey);
  const tally = { count: 0 };
  const written = [];
  const ui = { write: (line) => written.push(line) };

  for (let i = 1; i < FREE_LOOKUPS_PER_DAY; i += 1) {
    assert.equal(settleDayPass(journey, tally, ui), false, `look-up ${i} should leave the day open`);
    assert.equal(dayIsSpent(journey), false);
  }

  assert.equal(settleDayPass(journey, tally, ui), true, 'the guard closes a day of pure look-ups');
  assert.equal(dayIsSpent(journey), true);
  assert.equal(written.length, 1, 'closing the day says so once');
});

test('every mode asks the same question, and does not repeat the header', () => {
  // The day and deadline already sit on the mode header and status strip, so
  // echoing them into the prompt printed the same line twice in the log.
  assert.equal(dayPrompt(), 'What gets the day?');
  assert.doesNotMatch(dayPrompt({ day: 4, deadline: 28 }), /\d/);
});
