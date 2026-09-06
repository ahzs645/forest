import test from 'node:test';
import assert from 'node:assert/strict';
import { trailState, renderTrailFrame, trailAction } from '../js/scene/trailView.js';

const journey = () => ({ journeyType: 'recon', day: 3, currentBlockIndex: 0,
  blocks: [{ id: 'a', name: 'Highway Camp', terrain: 'road' }, { id: 'b', name: 'River Crossing' }],
  crew: [{ isActive: true }, { isActive: false }], weather: { id: 'rain', name: 'Heavy Rain' } });

test('trail rendering is deterministic and does not mutate a journey or consume game randomness', () => {
  const j = journey();
  const before = JSON.stringify(j);
  const random = Math.random;
  Math.random = () => { throw new Error('visuals must not consume game RNG'); };
  try {
    const a = trailState(j, 24);
    assert.deepEqual(renderTrailFrame(a, 8), renderTrailFrame(trailState(j, 24), 8));
    assert.equal(a.crew, 1);
    assert.equal(a.progress, 24);
    assert.equal(JSON.stringify(j), before);
  } finally { Math.random = random; }
});

test('only a blockage on the current route is illustrated, and resolved blockages disappear', () => {
  const j = journey();
  j.routeConstraints = [{ status: 'active', kind: 'washout', fromBlockId: 'a', toBlockId: 'b' }];
  assert.match(renderTrailFrame(trailState(j)).text, /CLOSED/);
  j.currentBlockIndex = 1;
  assert.equal(trailState(j).obstruction, null);
  j.currentBlockIndex = 0;
  j.routeConstraints[0].status = 'resolved';
  assert.doesNotMatch(renderTrailFrame(trailState(j)).text, /CLOSED/);
});

test('every role, weather and action draws a bounded frame at narrow and wide sizes', () => {
  for (const role of ['recon', 'silviculture', 'planning', 'permitting', 'manager']) {
    for (const weather of ['clear', 'rain', 'snow', 'fog']) {
      for (const action of [null, 'travel', 'work', 'camp']) {
        for (const cols of [44, 72, 120]) {
          const state = trailState({ ...journey(), journeyType: role, weather: { id: weather } });
          const f = renderTrailFrame(state, 14, { cols, rows: 14, action });
          assert.equal(f.cells.length, 14);
          assert.ok(f.cells.every(row => row.length === cols && row.every(c => c.ch.length === 1)));
          assert.doesNotMatch(f.text, /undefined|NaN/);
        }
      }
    }
  }
});

test('the planting scene reflects saved planting progress, not elapsed animation time', () => {
  const j = { ...journey(), journeyType: 'silviculture', planting: { blocksToPlant: 8, blocksPlanted: 3 } };
  const count = f => f.cells.flat().filter(c => c.tone === 'seedling').length;
  assert.equal(count(renderTrailFrame(trailState(j), 0)), count(renderTrailFrame(trailState(j), 200)));
  j.planting.blocksPlanted = 8;
  assert.ok(count(renderTrailFrame(trailState(j))) > count(renderTrailFrame(trailState({ ...j, planting: {} }))));
});

test('choice beats include camp, work and travel without matching navigation controls', () => {
  assert.equal(trailAction('Camp & crew'), 'camp');
  assert.equal(trailAction('Work the block'), 'work');
  assert.equal(trailAction('Standard pace'), 'travel');
  assert.equal(trailAction('More context'), null);
});
