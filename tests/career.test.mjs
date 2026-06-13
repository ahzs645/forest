import test from 'node:test';
import assert from 'node:assert/strict';

import { foldRunIntoRecord, scoreFromMetrics, getCareerSnapshot } from '../js/career.js';

test('runs from both games fold into one record', () => {
  let record = foldRunIntoRecord(null, 'recon', { score: 80, grade: 'B', victory: true }, { kmSurveyed: 42 });
  record = foldRunIntoRecord(record, 'seasonal', { score: 65, grade: 'C', victory: true }, { yearsCompleted: 1 });
  record = foldRunIntoRecord(record, 'crisis-command', { score: 59, grade: 'D', victory: false }, { incidentsCommanded: 1 });

  assert.equal(record.runs, 3);
  assert.equal(record.byRole.recon.bestGrade, 'B');
  assert.equal(record.byRole.seasonal.runs, 1);
  assert.equal(record.byRole['crisis-command'].victories, 0);
  assert.deepEqual(record.career, { kmSurveyed: 42, yearsCompleted: 1, incidentsCommanded: 1 });
});

test('personal bests survive worse runs, per bucket', () => {
  let record = foldRunIntoRecord(null, 'seasonal', { score: 70, grade: 'B', victory: true });
  record = foldRunIntoRecord(record, 'seasonal', { score: 40, grade: 'F', victory: false });
  assert.equal(record.byRole.seasonal.bestScore, 70);
  assert.equal(record.byRole.seasonal.bestGrade, 'B');
  assert.equal(record.isBest, false);
  assert.equal(record.byRole.seasonal.runs, 2);
});

test('seasonal score is the metric average', () => {
  assert.equal(scoreFromMetrics({ a: 50, b: 60, c: 70 }), 60);
  assert.equal(scoreFromMetrics({}), 0);
  assert.equal(scoreFromMetrics({ a: 50, junk: 'x' }), 50);
});

test('career snapshot degrades gracefully without storage (node)', () => {
  const snapshot = getCareerSnapshot();
  assert.deepEqual(snapshot, { expeditionWins: 0, seasonalYears: 0, totalRuns: 0 });
});
