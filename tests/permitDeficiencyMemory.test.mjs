import test from 'node:test';
import assert from 'node:assert/strict';

import { createPermittingJourney } from '../js/journey/factory.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import {
  advancePermitClocks,
  ensurePermitFiles,
  getPermitFiles,
  getPermitFilesInLane,
} from '../js/journey/permitPipeline.js';
import { ensurePermittingRevisionState, resolvePermitRevisionResponse } from '../js/modes/permitting.js';

const AREA_ID = 'fraser-plateau';
const area = OPERATING_AREAS.find((candidate) => candidate.id === AREA_ID);

function returnDecisionFiles(journey) {
  for (const file of getPermitFilesInLane(journey, 'decision')) file.clockCloses = journey.day;
  return advancePermitClocks(journey, { approvalRate: 0, completenessReturnRate: 0, random: () => 0.5 });
}

test('a clean response to a deficiency is not answered with the same letter again', () => {
  const journey = createPermittingJourney({ roleId: 'permitter', areaId: AREA_ID, area, scale: 'campaign' });
  journey.day = 6;
  ensurePermitFiles(journey);
  returnDecisionFiles(journey);
  const [ticket] = ensurePermittingRevisionState(journey);
  const file = getPermitFiles(journey).find((candidate) => candidate.id === ticket.fileId);

  resolvePermitRevisionResponse(journey, ticket.id, 'clean');
  assert.ok(file.resolvedDeficiencies.includes(ticket.profileId));
  assert.equal(file.cleanResponses, 1);

  // Force the same file back through a failed decision.
  journey.day += 1;
  journey.actionsRemaining = 1;
  file.clockCloses = journey.day;
  const again = advancePermitClocks(journey, { approvalRate: 0, completenessReturnRate: 0, random: () => 0.99 });
  assert.ok(again.returned.some((entry) => entry.file.id === file.id));
  const next = ensurePermittingRevisionState(journey).find((entry) => entry.fileId === file.id);
  assert.ok(next, 'the returned file gets a letter');
  assert.notEqual(next.profileId, ticket.profileId, `${ticket.title} came back verbatim after its fix`);
});

test('each clean response lifts that file\'s odds at the District Manager', () => {
  const journey = createPermittingJourney({ roleId: 'permitter', areaId: AREA_ID, area, scale: 'campaign' });
  journey.day = 6;
  ensurePermitFiles(journey);
  const [answered, untouched] = getPermitFilesInLane(journey, 'decision');
  assert.ok(answered && untouched);
  answered.cleanResponses = 1;
  answered.clockCloses = journey.day;
  untouched.clockCloses = journey.day;

  // A roll of 0.8 fails the base 0.7 rate and passes 0.7 + one clean answer.
  const result = advancePermitClocks(journey, { approvalRate: 0.7, completenessReturnRate: 0, random: () => 0.8 });
  assert.ok(result.issued.some((entry) => entry.file.id === answered.id));
  assert.ok(result.returned.some((entry) => entry.file.id === untouched.id));
});

test('a package made whole is not bounced from the completeness screen again', () => {
  const journey = createPermittingJourney({ roleId: 'permitter', areaId: AREA_ID, area, scale: 'campaign' });
  journey.day = 3;
  ensurePermitFiles(journey);
  const [file] = getPermitFilesInLane(journey, 'screening');
  file.resolvedDeficiencies = ['package-completeness'];
  file.clockCloses = journey.day;
  const result = advancePermitClocks(journey, { completenessReturnRate: 1, random: () => 0.5 });
  assert.ok(!result.returned.some((entry) => entry.file.id === file.id));
});
