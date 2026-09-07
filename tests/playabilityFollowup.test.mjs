import test from 'node:test';
import assert from 'node:assert/strict';
import { createManagerJourney, createPermittingJourney, createReconJourney, createSilvicultureJourney } from '../js/journey/factory.js';
import { runDaySituation } from '../js/journey/daySituation.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { advanceProfessionalComplianceChain } from '../js/engine/professional.js';
import { buildActionOptions } from '../js/modes/permitting.js';
import { calculateTravelDistance, endFieldDay, executeFieldAction } from '../js/journey/fieldMechanics.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';

test('manager can delegate an escalated washout without acquiring a field route', async () => {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  const descriptions = [];
  const noop = () => {};
  const ui = {
    clear: noop, write: noop, writeHeader: noop, writeWarning: noop, updateAllStatus: noop,
    async promptChoice(_prompt, options) {
      descriptions.push(...options.map((option) => option.description || ''));
      return options.find((option) => option.value === 'set_aside') || options[0];
    },
  };
  const result = await runDaySituation({ ui, journey }, FIELD_EVENTS.find((event) => event.id === 'road_washout'));
  assert.equal(result.setAside, true);
  assert.equal(result.spendsDay, false);
  assert.equal(journey.routeConstraints, undefined);
  assert.ok(!descriptions.some((description) => /route stays blocked/.test(description)));
});

test('road permit choice shows the next real paperwork stage after each completed step', () => {
  const journey = createPermittingJourney({ areaId: 'fraser-plateau' });
  journey.area = { id: 'fraser-plateau', tags: ['road'] };
  journey.professional.chains.roadPermit.stepIndex = 0;
  for (const stage of ['Road screen', 'Road map exhibits', 'Road submission', 'Maintenance conditions']) {
    const { primary: options } = buildActionOptions(journey);
    const admin = options.find((option) => option.value === 'professional_admin');
    assert.ok(admin, 'the road file action should be offered');
    assert.ok(admin.description.includes(`Stage: ${stage}`), admin.description);
    advanceProfessionalComplianceChain(journey, 'roadPermit');
  }
});

test('rounding a travel result never overshoots a fractional destination boundary', () => {
  const journey = createReconJourney({ areaId: 'fraser-plateau' });
  journey.blocks = [
    { id: 'camp', name: 'Camp', distance: 0, terrain: 'flat' },
    { id: 'next', name: 'Next block', distance: 0.07, terrain: 'flat' },
  ];
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0;
  const travel = calculateTravelDistance(journey, 'normal');
  assert.equal(travel.distance, 0.07);
  assert.equal(travel.reachesBlock, true);
});

test('a travel delay survives local work and is consumed only by the next travel leg', () => {
  const journey = createReconJourney({ areaId: 'fraser-plateau' });
  journey.travelSetback = 0.25;
  executeFieldAction(journey, 'camp_work');
  endFieldDay(journey);
  assert.equal(journey.travelSetback, 0.25);
  executeFieldAction(journey, 'normal');
  assert.equal(journey.travelSetback, 0);
  endFieldDay(journey);
  assert.equal(journey.travelSetback, 0);
});

test('planting preview and outcome name the same contractor when using support outside its specialty', async () => {
  const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
  const contractor = journey.contractors.find((entry) => entry.specialty === 'brushing');
  assert.ok(contractor);
  contractor.isActive = true;
  journey.contractors = [contractor];
  const messages = [];
  let preview = '';
  const noop = () => {};
  const ui = {
    clear: noop, writeHeader: noop, writeWarning: noop, writeDanger: noop, updateAllStatus: noop,
    write(message) { messages.push(message); },
    writePositive(message) { messages.push(message); },
    async promptChoice(_prompt, options) {
      const plant = options.find((option) => option.value === 'plant');
      if (plant) {
        preview = plant.description;
        return plant;
      }
      return options.find((option) => option.value === 'end') || options[0];
    },
  };
  const random = Math.random;
  Math.random = () => 0.99;
  try {
    await runSilvicultureDay({ ui, journey, gameOver: false });
  } finally {
    Math.random = random;
  }
  assert.ok(preview.includes(`on the block: ${contractor.name}`), preview);
  assert.ok(messages.includes(`Working crew: ${contractor.name}.`));
  assert.ok(journey.planting.seedlingsPlanted > 0);
});
