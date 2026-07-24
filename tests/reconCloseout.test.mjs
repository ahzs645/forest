import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney } from '../js/journey/factory.js';
import {
  runReconDay,
  getReconOpenPackages,
  maybeStartReconCloseout,
  getReconCloseoutShiftsLeft,
  updateReconMissionStatus
} from '../js/modes/recon.js';
import { checkEndConditions } from '../js/modes/shared/endConditions.js';
import { OPERATING_AREAS } from '../js/data/index.js';

/**
 * Scripted UI: a picker function decides each prompt; everything else is a
 * no-op. The picker receives the prompt text and options and returns the
 * chosen option (or null to fall through to sensible defaults).
 */
function createScriptedUI(pick = () => null) {
  const noop = () => {};
  return {
    clear: noop,
    writeHeader: noop,
    write: noop,
    writePositive: noop,
    writeWarning: noop,
    writeDanger: noop,
    writeBox: noop,
    writeDivider: noop,
    updateAllStatus: noop,
    setMissionStatus: noop,
    async promptChoice(prompt, options = []) {
      const picked = pick(prompt, options);
      if (picked) return picked;
      const endShift = options.find((o) => o.value === 'end_shift');
      if (endShift) return endShift;
      const next = options.find((o) => o.value === 'next');
      if (next) return next;
      return options[0] || { value: 'next' };
    }
  };
}

/**
 * Park a freshly built recon journey at the final camp with `openCount`
 * packages left open (the earliest blocks stay open; the rest, including the
 * final block itself, are closed so the close-out menu is the only work).
 */
function makeCloseoutJourney(openCount) {
  const journey = createReconJourney({ roleId: 'recce', areaId: OPERATING_AREAS[0].id });
  journey.weather = { id: 'clear', name: 'Clear' };
  journey.resources.food = 80;
  journey.resources.fuel = 100;
  journey.resources.equipment = 100;
  journey.currentBlockIndex = journey.blocks.length - 1;
  journey.distanceTraveled = journey.totalDistance;

  journey.reconIntel = { byBlock: {} };
  const blocks = journey.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const closed = i >= openCount;
    journey.reconIntel.byBlock[blocks[i].id] = {
      accessGroundTruthed: closed,
      valuesSwept: closed,
      assessmentComplete: closed,
      lastAccessDay: closed ? 1 : 0,
      lastValuesDay: closed ? 1 : 0
    };
  }
  journey.blocksAssessed = blocks.length - openCount;
  journey.verifiedBlocks = journey.blocksAssessed;
  return journey;
}

test('close-out starts only at the final camp with open packages, deadline sized to the work', () => {
  const midRoute = makeCloseoutJourney(3);
  midRoute.currentBlockIndex = 0;
  assert.equal(maybeStartReconCloseout(midRoute), null, 'no close-out while the traverse is live');

  const done = makeCloseoutJourney(0);
  assert.equal(maybeStartReconCloseout(done), null, 'no close-out when the file is already complete');

  const journey = makeCloseoutJourney(5);
  const closeout = maybeStartReconCloseout(journey);
  assert.ok(closeout, 'close-out starts at the final camp with open packages');
  // ceil(5 open / 2) = 3 working shifts, the start day included.
  assert.equal(closeout.deadlineDay, journey.day + 2);
  assert.equal(getReconCloseoutShiftsLeft(journey), 3);
  assert.equal(maybeStartReconCloseout(journey), closeout, 'starting again is idempotent');

  const status = updateReconMissionStatus(createScriptedUI(), journey);
  assert.match(status.objective, /Close out the file/);
  assert.match(status.objective, new RegExp(`shift ${closeout.deadlineDay}`));
});

test('write-up from notes closes the named package and costs scrutiny', async () => {
  const journey = makeCloseoutJourney(2);
  const openBefore = getReconOpenPackages(journey);
  const targetName = openBefore[0].block.name;

  const realRandom = Math.random;
  Math.random = () => 0.999;
  try {
    let wroteUp = false;
    const ui = createScriptedUI((prompt, options) => {
      if (!wroteUp) {
        const pkg = options.find((o) => String(o.value).startsWith('closeout_pkg:'));
        if (pkg) {
          assert.match(pkg.label, new RegExp(targetName), 'the open package is offered by name');
          return pkg;
        }
        const writeup = options.find((o) => o.value === 'closeout_writeup');
        if (writeup) {
          wroteUp = true;
          return writeup;
        }
      }
      // During close-out the generic notebook button must be gone.
      assert.ok(!options.some((o) => o.value === 'field_notebook'));
      return null;
    });

    const assessedBefore = journey.blocksAssessed;
    const scrutinyBefore = journey.scrutiny;
    await runReconDay({ ui, journey, gameOver: false });

    assert.equal(journey.blocksAssessed, assessedBefore + 1, 'the chosen package closed');
    assert.equal(journey.scrutiny, scrutinyBefore + 2, 'paper closes add scrutiny');
  } finally {
    Math.random = realRandom;
  }
});

test('driving back closes a package on the ground for fuel instead of scrutiny', async () => {
  const journey = makeCloseoutJourney(2);

  const realRandom = Math.random;
  Math.random = () => 0.999;
  try {
    let tripped = false;
    const ui = createScriptedUI((prompt, options) => {
      if (!tripped) {
        const pkg = options.find((o) => String(o.value).startsWith('closeout_pkg:'));
        if (pkg) return pkg;
        const trip = options.find((o) => o.value === 'closeout_daytrip');
        if (trip) {
          tripped = true;
          return trip;
        }
      }
      return null;
    });

    const assessedBefore = journey.blocksAssessed;
    const fuelBefore = journey.resources.fuel;
    const scrutinyBefore = journey.scrutiny;
    await runReconDay({ ui, journey, gameOver: false });

    assert.ok(tripped, 'the day-trip option was offered and taken');
    assert.equal(journey.blocksAssessed, assessedBefore + 1, 'the package closed');
    assert.ok(journey.resources.fuel < fuelBefore, 'the drive back burned fuel');
    assert.ok(journey.scrutiny < scrutinyBefore, 'ground work eases scrutiny instead of adding it');
  } finally {
    Math.random = realRandom;
  }
});

test('radioing the district buys exactly one extra shift, once', async () => {
  const journey = makeCloseoutJourney(4);

  const realRandom = Math.random;
  Math.random = () => 0.999;
  try {
    let radioOffers = 0;
    let radioed = false;
    const ui = createScriptedUI((prompt, options) => {
      const radio = options.find((o) => o.value === 'closeout_radio');
      if (radio) radioOffers += 1;
      if (radio && !radioed) {
        radioed = true;
        return radio;
      }
      return null;
    });

    await runReconDay({ ui, journey, gameOver: false });
    const closeout = journey.reconCloseout;
    assert.ok(radioed, 'the radio option was offered and used');
    assert.equal(closeout.extensionUsed, true);
    // 4 open packages -> 2 shifts -> deadline = start + 1, plus the extension.
    assert.equal(closeout.deadlineDay, closeout.startDay + 2);
    assert.ok(journey.scrutiny > 28, 'asking for more time draws attention');

    const offersAfterUse = radioOffers;
    await runReconDay({ ui, journey, gameOver: false });
    assert.equal(radioOffers, offersAfterUse, 'the district only grants one extension');
  } finally {
    Math.random = realRandom;
  }
});

test('a crew that idles through close-out is forced to submit — the run always ends', async () => {
  const journey = makeCloseoutJourney(4);
  const ui = createScriptedUI(); // rests every shift, closes nothing

  const realRandom = Math.random;
  Math.random = () => 0.999;
  try {
    let result = null;
    for (let shift = 0; shift < 10 && !result; shift++) {
      await runReconDay({ ui, journey, gameOver: false });
      result = checkEndConditions(journey);
    }

    assert.ok(result, 'the deadline ends the run within a bounded number of shifts');
    assert.equal(result.gameOver, true);
    assert.match(result.reason, /District deadline passed/);
    // 4 open packages -> deadline at start day + 1 -> forced out on day 3.
    assert.ok(journey.day <= journey.reconCloseout.deadlineDay + 1);
  } finally {
    Math.random = realRandom;
  }
});

test('forced submission scrapes through when only a corner of the file is open', () => {
  const nearlyDone = {
    journeyType: 'recon',
    crew: [{ isActive: true }],
    blocks: [{}, {}, {}, {}, {}, {}, {}, {}],
    currentBlockIndex: 7,
    blocksAssessed: 7,
    day: 11,
    reconCloseout: { startDay: 8, deadlineDay: 10, extensionUsed: false },
    distanceTraveled: 40,
    totalDistance: 40,
    resources: { fuel: 20, food: 20, equipment: 60 }
  };

  const scraped = checkEndConditions(nearlyDone);
  assert.equal(scraped.victory, true);
  assert.match(scraped.reason, /1 deficiency flag/);

  const fullOfHoles = { ...nearlyDone, blocksAssessed: 4 };
  const rejected = checkEndConditions(fullOfHoles);
  assert.equal(rejected.gameOver, true);
  assert.match(rejected.reason, /4 packages still open/);
});
