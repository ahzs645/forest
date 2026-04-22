import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDeskDay } from '../js/journey/deskMechanics.js';
import { createPermittingJourney } from '../js/journey/factory.js';

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
