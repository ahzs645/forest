import test from 'node:test';
import assert from 'node:assert/strict';

import { applyAccessVerdictPressure } from '../js/journey/fieldMechanics.js';
import { createJourney } from '../js/journey/factory.js';
import { calculateScore } from '../js/scoring.js';

test('access-verdict pressure never pushes scrutiny past 100', () => {
  const journey = { scrutiny: 99 };
  applyAccessVerdictPressure(journey, { id: 'no_go' }, { stance: 'aggressive' });
  assert.equal(journey.scrutiny, 100);
});

test('crew ids stay unique across a reload', async () => {
  // A fresh module instance stands in for a page reload: the old per-load
  // counter restarted at crew_1 and collided with the saved crew.
  const saved = (await import('../js/crew.js')).generateCrew(4, 'field');
  const reloaded = (await import('../js/crew.js?reload')).generateCrew(4, 'field');
  const ids = [...saved, ...reloaded].map((member) => member.id);
  assert.equal(new Set(ids).size, ids.length, ids.join(', '));
});

test('resource efficiency is judged against what the run started with', () => {
  const full = createJourney({ roleId: 'recce', companyName: 'T', areaId: 'fraser-plateau' });
  assert.equal(full.startingResources.fuel, full.resources.fuel);
  const spent = createJourney({ roleId: 'recce', companyName: 'T', areaId: 'fraser-plateau' });
  // 5% of the starting fuel and food left: the old 320 L / 40 person-day
  // divisors still read that as a comfortable margin.
  spent.resources.fuel = Math.round(spent.startingResources.fuel * 0.05);
  spent.resources.food = Math.round(spent.startingResources.food * 0.05);

  const fullScore = calculateScore(full, true).components.resourceEfficiency.score;
  const spentScore = calculateScore(spent, true).components.resourceEfficiency.score;
  assert.ok(spentScore < fullScore, `${spentScore} should be below ${fullScore}`);
});
