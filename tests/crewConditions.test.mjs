import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyStatusEffect,
  generateCrewMember,
  getCrewDisplayInfo,
  processDailyUpdate,
  treatCrewCondition
} from '../js/crew.js';

test('untreated serious conditions worsen when the crew stays on the move under poor rations', () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const member = generateCrewMember('field');
    applyStatusEffect(member, 'concussion');

    processDailyUpdate(member, {
      lowFood: true,
      shortRations: true,
      currentDay: 1
    });
    const secondDay = processDailyUpdate(member, {
      lowFood: true,
      shortRations: true,
      currentDay: 2
    });

    assert.ok(member.statusEffects.some((effect) => effect.effectId === 'infection'));
    assert.ok(secondDay.messages.some((message) => message.includes('getting worse')));
  } finally {
    Math.random = originalRandom;
  }
});

test('severe treatment stabilizes a condition first and clears it after additional care', () => {
  const member = generateCrewMember('field');
  applyStatusEffect(member, 'infection');

  const firstTreatment = treatCrewCondition(member, 'infection', 1);
  assert.equal(firstTreatment.cleared, false);
  assert.equal(member.lastTreatedDay, 1);
  assert.equal(member.statusEffects.find((effect) => effect.effectId === 'infection')?.daysRemaining, 3);

  processDailyUpdate(member, {
    currentDay: 1,
    restDay: true
  });

  const secondTreatment = treatCrewCondition(member, 'infection', 2);
  assert.equal(secondTreatment.cleared, true);
  assert.equal(member.statusEffects.some((effect) => effect.effectId === 'infection'), false);
});

test('serious conditions move the displayed fitness below a perfect meter', () => {
  const member = generateCrewMember('field');
  member.health = 100;

  applyStatusEffect(member, 'broken_arm');

  assert.equal(member.health, 100, 'condition display should not rebalance underlying health');
  assert.equal(getCrewDisplayInfo(member).health, 80);
  assert.ok(member.statusEffects.some((effect) => effect.effectId === 'broken_arm'));
});
