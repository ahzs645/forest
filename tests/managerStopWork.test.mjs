import test from 'node:test';
import assert from 'node:assert/strict';

import { createManagerJourney } from '../js/journey/factory.js';
import { applyLedgerHooks, fitManagerEvent, projectYearEndCut } from '../js/modes/manager.js';
import { formatEventForDisplay } from '../js/events/index.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { DELIVERY_CURVES } from '../js/data/managerRoles.js';
import { simulateManagerYear, MANAGER_STYLES } from '../scripts/simulate-manager.mjs';

/**
 * A card that goes wrong in the bush, or an escalation left with the
 * division, puts the work under a stop-work that lasts months and is printed
 * everywhere the cut is: the chip, the monthly ledger, the projection. A GM
 * who picked every card at random used to win every easy and normal year,
 * because a card moved the year's cut by about 1%.
 */

const quietUi = () => {
  const lines = [];
  const push = (text) => { if (typeof text === 'string') lines.push(text); };
  return { lines, write: push, writeInfo: push, writeWarning: push, writeSuccess: push };
};

const rollover = {
  id: 'stopwork_test',
  title: 'Skidder Rollover',
  type: 'equipment',
  severity: 'moderate',
  options: [
    { label: 'Keep the side logging', chanceSuccess: 0.6, effects: { progress: 2 }, failureEffects: { progress: -8 }, failureOutcome: 'The second machine goes over too. WorkSafeBC shuts the side down.' },
    { label: 'Stand the side down for an inspection', effects: { progress: -2 } },
  ],
};

test('a card that goes badly wrong says stop-work on its chip, and the stop-work is what lands', () => {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  journey.day = 5;
  const fitted = fitManagerEvent(journey, rollover);
  const shown = formatEventForDisplay(fitted, 'manager');
  assert.match(shown.options[0].hint, /ledger if it lands: \+500 m³ on this month's deliveries; if not: stop-work: deliveries at 50% of plan for 2 months/);
  // A deliberate stand-down is its own small cost, not a stop-work.
  assert.match(shown.options[1].hint, /ledger: -500 m³ on this month's deliveries/);

  const before = projectYearEndCut(journey);
  const logBefore = journey.log.length;
  journey.log.push({ type: 'event', day: 5, eventId: rollover.id, optionLabel: rollover.options[0].label, band: 'bad' });
  const ui = quietUi();
  applyLedgerHooks(ui, journey, fitted, logBefore);
  assert.deepEqual({ ...journey.ledger.stopWork }, { factor: 0.5, monthsLeft: 2, source: 'Skidder Rollover' });
  assert.ok(ui.lines.some((line) => /Ledger: stop-work: deliveries at 50% of plan for 2 months/.test(line)), ui.lines.join(' | '));

  // The projection carries it: May and June at half plan.
  const after = projectYearEndCut(journey);
  const ledger = journey.ledger;
  const curve = ledger.seasonalCurve || DELIVERY_CURVES.interior;
  const lost = before.volume - after.volume;
  const expected = ledger.monthlyPlan * (curve[4] + curve[5]) * 0.5;
  assert.ok(Math.abs(lost - expected) / expected < 0.2, `lost ${lost} vs ~${expected}`);
});

test('an escalation left with the division says stop-work on its set-aside line, and the ledger prints it until it lifts', async () => {
  let found = null;
  const asides = [];
  MANAGER_STYLES.__leaveIt = (journey, options, prompt) => {
    const aside = options.find((o) => o.value === 'set_aside');
    if (aside) asides.push(aside.description);
    return aside || MANAGER_STYLES.competent(journey, options, prompt);
  };
  try {
    for (let seed = 300; seed < 340 && !found; seed += 1) {
      const lines = [];
      const result = await simulateManagerYear(seed, '__leaveIt', { trace: (line) => lines.push(line) });
      const start = lines.findIndex((line) => /^Ledger: stop-work on “.+” - deliveries at 30% of plan for 3 months, this one included\.$/.test(line));
      if (start !== -1) found = { lines, start, result };
    }
  } finally {
    delete MANAGER_STYLES.__leaveIt;
  }
  assert.ok(found, 'some year leaves an escalation with the division');
  const { lines, start } = found;
  const title = lines[start].match(/“(.+)”/)[1];
  const delivered = lines.slice(start).filter((line) => line.startsWith('Delivered:') && line.includes(`stop-work on “${title}”`));
  assert.ok(delivered.length >= 1, 'the monthly ledger names the stop-work');
  assert.match(delivered[0], /at 30%, 2 more months/);
  // The set-aside line said it before the player chose it.
  assert.ok(lines.slice(0, start).some((line) => /Set it aside/.test(line)));
  assert.ok(asides.includes("Leave it with the division. Without head office's call the work stands down: stop-work, deliveries at 30% of plan for 3 months."), asides.join(' | '));
  // Board paper left on the desk is not a stop-work.
  assert.ok(asides.includes('Leave it with the division and keep the month for the business.'));
});

test('play decides the year: a GM picking at random loses a good share of them; competent and honest play still wins them all', async () => {
  const batch = async (style, difficulty) => {
    let wins = 0;
    let runs = 0;
    for (const area of OPERATING_AREAS) {
      for (let i = 0; i < 6; i += 1) {
        const result = await simulateManagerYear(2000 + i * 53, style, { difficulty, areaId: area.id });
        runs += 1;
        if (result.victory) wins += 1;
      }
    }
    return wins / runs;
  };
  // Measured over 216 years a cell: random 77/61/45%, competent and honest 99.5-100%.
  const random = await batch('random', 'normal');
  assert.ok(random <= 0.8 && random >= 0.35, `random normal ${random}`);
  assert.ok((await batch('random', 'hard')) <= 0.65, 'random hard');
  assert.ok((await batch('competent', 'normal')) >= 0.98, 'competent normal');
  assert.ok((await batch('honest', 'normal')) >= 0.98, 'honest normal');
});
