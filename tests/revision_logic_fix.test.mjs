import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDeskDay } from '../js/journey/deskMechanics.js';
import { createPermittingJourney } from '../js/journey/factory.js';
import { buildActionOptions, ensurePermittingRevisionState } from '../js/modes/permitting.js';

test('processPermitWork in deskMechanics.js progresses needsRevision and syncs queue', () => {
  const originalRandom = Math.random;

  const journey = createPermittingJourney({
    roleId: 'permitter',
    areaId: 'fort-st-john-plateau',
  });

  journey.hoursRemaining = 8;
  journey.permits.needsRevision = 1;
  journey.permits.inReview = 0;
  journey.permits.submitted = 0;
  journey.permits.backlog = 0; // Ensure we don't trigger submission work

  // Ensure there is a ticket in the queue
  if (!journey.permits.revisionQueue) journey.permits.revisionQueue = [];
  journey.permits.revisionQueue.push({ id: 'test-ticket' });

  // Mock Math.random to always return 0.1, so all checks pass
  Math.random = () => 0.1;

  const result = executeDeskDay(journey, 'process_permits');

  Math.random = originalRandom;

  assert.equal(journey.permits.needsRevision, 0, 'needsRevision should be decremented');
  assert.equal(journey.permits.submitted, 1, 'submitted should be incremented (NOT inReview)');

  // Check if revisionQueue is synchronized
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
