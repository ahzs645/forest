import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDeskDay } from '../js/journey/deskMechanics.js';
import { createPermittingJourney } from '../js/journey/factory.js';
import { buildActionOptions, ensurePermittingRevisionState, resolvePermitRevisionResponse } from '../js/modes/permitting.js';

test('a deficiency letter is answered through the revision queue and the file goes back to the decision-maker', () => {
  const journey = createPermittingJourney({
    roleId: 'permitter',
    areaId: 'fort-st-john-plateau',
  });

  journey.hoursRemaining = 8;
  journey.permits.needsRevision = 1;
  journey.permits.inReview = 0;
  journey.permits.submitted = 0;
  journey.permits.backlog = 0;

  // Nothing to draft, submit or chase: the queue is not worked, the day is
  // not spent, and the desk says why.
  const result = executeDeskDay(journey, 'process_permits');
  assert.equal(journey.actionsRemaining, 1, 'a no-op queue day must not spend the day');
  assert.ok(result.messages.some((message) => message.includes('Nothing is moving in the district queue until the deficiency letters are answered.')));

  // The ticket is a named file with a named deficiency.
  const queue = ensurePermittingRevisionState(journey);
  assert.equal(queue.length, 1, 'one letter per deficiency file');
  assert.match(queue[0].fileLabel, /^(CP|RP|RUP|SUP|HCA) /);
  assert.ok(queue[0].fileId);

  const response = resolvePermitRevisionResponse(journey, queue[0].id, 'clean');
  assert.equal(response.resolved, true);
  assert.equal(journey.permits.needsRevision, 0, 'needsRevision should be decremented');
  assert.equal(journey.permits.inReview + journey.permits.submitted, 1, 'the file is back in a live lane');
  assert.equal(journey.permits.revisionQueue.length, 0, 'revisionQueue should be synchronized');
});

test('Office & Support submenu never shows exact-duplicate rows when the revision queue outgrows the profile pool', () => {
  const journey = createPermittingJourney({
    roleId: 'permitter',
    areaId: 'fort-st-john-plateau',
  });

  journey.hoursRemaining = 8;
  // pickRevisionProfile cycles through a small, fixed pool of profiles
  // (index % profiles.length). Once needsRevision exceeds the pool size,
  // several tickets land on the same profile and used to render as
  // exact-duplicate "Clean response: X" / "Fast-track: X" rows below the
  // first (top-level) ticket.
  journey.permits.needsRevision = 11;
  journey.permits.backlog = 0;
  journey.permits.drafting = 0;
  journey.permits.submitted = 0;
  journey.permits.inReferral = 0;
  journey.permits.inReview = 0;

  ensurePermittingRevisionState(journey);
  assert.ok(journey.permits.revisionQueue.length >= 11);

  const { support } = buildActionOptions(journey);

  const seen = new Set();
  const duplicates = [];
  for (const option of support) {
    const key = `${option.label}|${option.description}`;
    if (seen.has(key)) {
      duplicates.push(key);
    }
    seen.add(key);
  }

  assert.deepEqual(duplicates, [], `Office & Support submenu should not contain duplicate rows, found: ${duplicates.join(', ')}`);
});
