import test from 'node:test';
import assert from 'node:assert/strict';

import { foldRunIntoRecord } from '../js/career.js';

test('expedition runs fold into the service record by role', () => {
  let record = foldRunIntoRecord(null, 'recon', { score: 80, grade: 'B', victory: true }, { kmSurveyed: 42 });
  record = foldRunIntoRecord(record, 'manager', { score: 55, grade: 'D', victory: false }, { daysInTheChair: 30 });

  assert.equal(record.runs, 2);
  assert.equal(record.byRole.recon.bestGrade, 'B');
  assert.equal(record.byRole.manager.victories, 0);
  assert.deepEqual(record.career, { kmSurveyed: 42, daysInTheChair: 30 });
});

test('personal bests survive worse runs, per bucket', () => {
  let record = foldRunIntoRecord(null, 'recon', { score: 70, grade: 'B', victory: true });
  record = foldRunIntoRecord(record, 'recon', { score: 40, grade: 'F', victory: false });
  assert.equal(record.byRole.recon.bestScore, 70);
  assert.equal(record.byRole.recon.bestGrade, 'B');
  assert.equal(record.isBest, false);
  assert.equal(record.byRole.recon.runs, 2);
});
