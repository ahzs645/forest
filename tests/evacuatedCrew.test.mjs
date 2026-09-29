import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney } from '../js/journey/factory.js';
import { executeFieldAction } from '../js/journey/fieldMechanics.js';

// Someone sent out on the ETV is not on the hill: the day's pace and weather
// used to keep moving their health and morale.
test('the pace and the weather leave evacuated crew alone', () => {
  const journey = createReconJourney({ roleId: 'recce', areaId: 'fraser-plateau' });
  const [out, ...rest] = journey.crew;
  out.isActive = false;
  out.health = 40;
  out.morale = 40;
  journey.weather = { id: 'storm', name: 'Storm', moraleEffect: -6, healthRisk: true };
  const original = Math.random;
  Math.random = () => 0.99;
  try {
    const result = executeFieldAction(journey, 'grueling');
    assert.ok(!result.messages.some((line) => line.startsWith(`${out.name} suffers`)), result.messages.join('\n'));
  } finally {
    Math.random = original;
  }
  assert.equal(out.health, 40);
  assert.equal(out.morale, 40);
  assert.ok(rest.some((member) => member.morale < 100 || member.health < 100), 'the crew on the hill still feels the day');
});
