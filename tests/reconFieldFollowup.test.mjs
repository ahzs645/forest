import test from 'node:test';
import assert from 'node:assert/strict';
import { createReconJourney } from '../js/journey/factory.js';
import { runReconDay } from '../js/modes/recon.js';
import { OPERATING_AREAS } from '../js/data/index.js';
import { advanceBlocksForDistance, getCumulativeDistanceToIndex } from '../js/journey/blockNav.js';

function setup() {
  const journey = createReconJourney({ areaId: 'fraser-plateau' });
  journey.weather = { id: 'clear', name: 'Clear' };
  Object.assign(journey.resources, { food: 200, fuel: 100, equipment: 100 });
  journey.currentBlockIndex = 1;
  // The staging lot is a waypoint in the data; make it a block so the return
  // visit has a package to work.
  journey.blocks[0].kind = 'block';
  journey.blocks[0].features = ['creek'];
  journey.blocks[0].hazards = ['river_crossing'];
  return journey;
}

async function runShift(journey, inspectMenu = () => {}) {
  journey.weather = { id: 'clear', name: 'Clear' };
  const messages = [];
  const noop = () => {};
  const write = (message) => messages.push(String(message));
  const ui = {
    clear: noop, write, writeHeader: write, writePositive: write, writeWarning: write,
    writeDanger: write, writeBox: write, writeDivider: noop, updateAllStatus: noop,
    playScene: noop, playEventVignette: noop, playTravelStrip: noop,
    setMissionStatus: noop, clearMissionStatus: noop,
    async promptChoice(_prompt, options = []) {
      inspectMenu(options);
      return options.find((o) => o.value === 'field_notebook')
        || options.find((o) => o.value === 'camp_menu')
        || options.find((o) => o.value === 'end_shift') || options[0];
    },
  };
  const random = Math.random;
  Math.random = () => 0.999;
  try {
    await runReconDay({ journey, ui, gameOver: false });
  } finally {
    Math.random = random;
  }
  return messages;
}

test('field follow-up inspects one missing item per shift and records the actual access verdict', async () => {
  const journey = setup();
  const block = journey.blocks[0];
  const startDay = journey.day;
  const distance = journey.distanceTraveled;
  const first = await runShift(journey, (options) => {
    if (options.some((o) => o.presentation === 'continue')) assert.equal(journey.resources.fuel, 84);
  });
  const intel = journey.reconIntel.byBlock[block.id];
  assert.equal(intel.accessGroundTruthed, true);
  assert.equal(intel.layoutWalked, true, 'the first visit walks the boundary and classifies the streams');
  assert.equal(intel.valuesSwept, false, 'one visit must not invent a WTP/CH sweep');
  assert.equal(intel.assessmentComplete, false);
  assert.ok(journey.accessVerdicts[block.id], 'record the real road condition');
  assert.ok(first.some((line) => line.includes('Fuel used: 16 L')));
  assert.ok(first.some((line) => /^Stream: creek: S4/.test(line)), 'the boundary shift classifies the creek');
  assert.ok(journey.resources.fuel <= 84);
  assert.equal(journey.day, startDay + 1);
  assert.equal(journey.currentBlockIndex, 1);
  assert.equal(journey.distanceTraveled, distance, 'a return visit is not forward traverse progress');

  const fuelBeforeSecondVisit = journey.resources.fuel;
  await runShift(journey, (options) => {
    if (options.some((o) => o.presentation === 'continue')) assert.equal(journey.resources.fuel, fuelBeforeSecondVisit - 16);
  });
  assert.equal(intel.valuesSwept, true);
  assert.equal(intel.assessmentComplete, true);
  assert.equal(journey.blocksAssessed, 1);
  assert.ok(journey.resources.fuel <= fuelBeforeSecondVisit - 16);
});

test('field follow-up cannot inspect unvisited ground or replace work at the current block', async () => {
  const journey = setup();
  journey.currentBlockIndex = 0;
  await runShift(journey, (options) => {
    assert.equal(options.some((o) => o.value === 'field_notebook'), false);
  });
  assert.equal(journey.blocksAssessed, 0);
  for (const intel of Object.values(journey.reconIntel.byBlock)) {
    assert.equal(intel.accessGroundTruthed, false);
  }
});

test('a stop-work block is excluded from return field visits', async () => {
  const journey = setup();
  journey.enjoinedBlocks = [journey.blocks[0].id];
  await runShift(journey, (options) => {
    assert.equal(options.some((o) => o.value === 'field_notebook'), false);
  });
  assert.equal(journey.reconIntel.byBlock[journey.blocks[0].id].accessGroundTruthed, false);
});

test('insufficient fuel cannot fabricate follow-up observations', async () => {
  const journey = setup();
  journey.resources.fuel = 12;
  await runShift(journey, (options) => {
    assert.equal(options.some((o) => o.value === 'field_notebook'), false);
  });
  assert.equal(journey.reconIntel.byBlock[journey.blocks[0].id].accessGroundTruthed, false);
});


test('every new recon route reaches its first destination at the displayed leg distance', () => {
  for (const area of OPERATING_AREAS) {
    for (const scale of [undefined, 'campaign']) {
      const journey = createReconJourney({ areaId: area.id, scale });
      assert.equal(journey.blocks[0].distance, 0);
      const next = journey.blocks[1];
      assert.equal(getCumulativeDistanceToIndex(journey.blocks, 1), next.distance);
      journey.distanceTraveled = next.distance;
      assert.deepEqual(advanceBlocksForDistance(journey), [next]);
      assert.equal(journey.currentBlockIndex, 1);
      assert.equal(journey.totalDistance, journey.blocks.slice(1).reduce((sum, block) => sum + block.distance, 0));
    }
  }
});
