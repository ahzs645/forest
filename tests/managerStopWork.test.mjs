import test from 'node:test';
import assert from 'node:assert/strict';

import { createManagerJourney } from '../js/journey/factory.js';
import { applyLedgerHooks, fitManagerEvent, projectYearEndCut, setAsideLine } from '../js/modes/manager.js';
import { formatEventForDisplay } from '../js/events/index.js';
import { escalateFieldEventForManager } from '../js/events/selection.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { getOperatingPosture } from '../js/data/managerRoles.js';
import { simulateManagerYear, summarizeBatch, MANAGER_STYLES } from '../scripts/simulate-manager.mjs';
import { pickKeyMoments } from '../js/game/debrief.js';

/**
 * A card whose own story stops the harvest puts one division under a
 * stop-work: its side stands down for a month or two, at most 7% of the AAC,
 * and the wood waits on the stump for a catch-up. Before, any wrong band that
 * cost operations and almost any card left with the division idled the whole
 * licence at 30-50% of plan for a quarter, unpriced: one June set-aside took
 * December from 101% to 81.5% and lost half of all hard years.
 */

const deck = [...DESK_EVENTS, ...FIELD_EVENTS];
const find = (id) => {
  const event = deck.find((entry) => entry.id === id);
  assert.ok(event, `${id} exists`);
  return event;
};

const quietUi = (answer = () => null) => {
  const lines = [];
  const prompts = [];
  const push = (text) => { if (typeof text === 'string') lines.push(text); };
  return {
    lines,
    prompts,
    write: push, writeInfo: push, writeWarning: push, writeSuccess: push, writeHeader: push, writePositive: push,
    writeDanger: push, writeDivider: push, clear: () => {}, updateAllStatus: () => {}, setMissionStatus: () => {},
    playScene: async () => {}, playEventVignette: () => {},
    async promptChoice(prompt, options = []) {
      prompts.push({ prompt, options });
      return answer(prompt, options) || options.find((o) => o.recommended) || options[0];
    },
  };
};

function monthJourney(day = 6) {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  const posture = getOperatingPosture('steady');
  journey.flags.managerInitComplete = true;
  journey.ceo = { id: posture.id, name: 'Pat', posture: posture.name, decision_making_style: posture.decision_making_style, volumeFactor: 1, costPerM3: 0, quarterly: {} };
  journey.day = day;
  journey.ledger.deliveredYtd = 20000 * (day - 1);
  return journey;
}

const PRICED = /stop-work: deliveries at 60% of plan for (\d) months?, -([\d,]+) m³ \(December ([\d.]+)% -> ([\d.]+)% of the AAC\), about -\$(\d+)k margin until caught up/;

const rollover = {
  id: 'stopwork_test',
  title: 'Skidder Rollover',
  type: 'equipment',
  severity: 'moderate',
  options: [
    // The authoring flag: this band's text stops the side.
    { label: 'Keep the side logging', chanceSuccess: 0.6, effects: { progress: 2 }, failureEffects: { progress: -8 }, failureOutcome: 'The second machine goes over too. WorkSafeBC shuts the side down.', stopWork: { months: 2 } },
    { label: 'Stand the side down for an inspection', effects: { progress: -2 } },
  ],
};

test('an authored stop-work is priced on the chip before the pick, in m³, December and cash, and that is what lands', () => {
  const journey = monthJourney(5);
  const fitted = fitManagerEvent(journey, rollover);
  const shown = formatEventForDisplay(fitted, 'manager');
  const hint = shown.options[0].hint;
  assert.match(hint, /^ledger if it lands: \+500 m³ on this month's deliveries; if not: stop-work: deliveries at 60% of plan for 2 months/);
  const [, months, lost, from, to, cash] = hint.match(PRICED);
  assert.equal(months, '2');
  const before = projectYearEndCut(journey);
  assert.equal(from, (before.ratio * 100).toFixed(1));
  // A deliberate stand-down is its own small cost, not a stop-work.
  assert.match(shown.options[1].hint, /ledger: -500 m³ on this month's deliveries/);

  const logBefore = journey.log.length;
  journey.log.push({ type: 'event', day: 5, eventId: rollover.id, optionLabel: rollover.options[0].label, band: 'bad' });
  const ui = quietUi();
  applyLedgerHooks(ui, journey, fitted, logBefore);
  assert.equal(journey.ledger.stopWork.factor, 0.6);
  assert.equal(journey.ledger.stopWork.monthsLeft, 2);
  assert.equal(journey.ledger.stopWork.cap, 16800, 'never more than 7% of the AAC');
  assert.ok(ui.lines.some((line) => line.startsWith('Ledger: stop-work: deliveries at 60% of plan for 2 months, -')), ui.lines.join(' | '));

  // The projection moves by what the chip said, and by no more than the cap.
  const after = projectYearEndCut(journey);
  assert.equal(before.volume - after.volume, Number(lost.replaceAll(',', '')));
  assert.equal(to, (after.ratio * 100).toFixed(1));
  assert.ok(before.ratio - after.ratio <= 0.07 + 1e-9);
  assert.ok(Number(cash) > 0);
});

test('only a card whose text stops the harvest stops it: a failed grant, a break-room fight, a dead plotter do not', () => {
  const journey = monthJourney(6);
  for (const id of ['grant_opportunity', 'team_conflict', 'equipment_failure_office', 'key_resignation', 'sick_day_wave', 'whistleblower_allegation', 'office_renovation_disruption', 'policy_change', 'gm_division_rivalry']) {
    const fitted = fitManagerEvent(journey, find(id));
    for (const option of fitted.options) {
      assert.ok(!Object.values(option.managerLedger || {}).some((hook) => hook.stopWork), `${id}: ${option.label}`);
    }
  }
  // The honest in-house investigation of a planting contractor no longer
  // costs harvest wood that burying the letter does not.
  const whistle = fitManagerEvent(journey, find('whistleblower_allegation'));
  assert.equal(whistle.options[0].ledgerHint, undefined);

  // Cards whose text does stop it, on the band that says so.
  const stops = (id, index, band) => Boolean(fitManagerEvent(monthJourney(7), find(id)).options[index].managerLedger?.[band]?.stopWork);
  assert.ok(stops('contractor_dispute', 2, 'bad'), 'they walk off current obligations');
  assert.ok(!stops('contractor_dispute', 2, 'good'));
  assert.ok(stops('first_nations_consultation', 3, 'bad'), 'the harvest plan freezes');
  assert.ok(stops('wildfire_threat', 1, 'bad'), 'equipment abandoned behind the fire line');
  assert.ok(stops('angry_stakeholder', 1, 'bad'), 'the file pauses at the district');
});

test('a hidden-odds option still prints the stop-work its failure carries', () => {
  const journey = monthJourney(6);
  const cmt = fitManagerEvent(journey, escalateFieldEventForManager(find('first_nations_consultation_field'), () => 0.1));
  const shown = formatEventForDisplay(cmt, 'manager');
  const option = shown.options[1];
  assert.match(option.hint, /^60% success odds, ledger if it lands: nothing; if not: stop-work: deliveries at 60% of plan for 3 months, -[\d,]+ m³ \(December/);
  // Its failure reads as head office hears it, not as a layout crew's day.
  assert.ok(!/compassman/.test(cmt.options[1].failureOutcome));
  assert.match(cmt.options[1].failureOutcome, /Archaeology Branch/);

  const fire = formatEventForDisplay(fitManagerEvent(monthJourney(7), find('wildfire_threat')), 'manager');
  assert.match(fire.options[0].hint, /^65% success odds, up to \$8k if it goes wrong, ledger if it lands: -2,500 m³ on this month's deliveries; if not: stop-work: deliveries at 60% of plan for 3 months/);
});

test('the set-aside line prices its stop-work, and a card that does not stop work says so', () => {
  // The line is built from the card and the month (runManagerDay's setAsideDescription).
  const washout = escalateFieldEventForManager(find('road_washout'), () => 0.1);
  const line = setAsideLine(monthJourney(6), washout);
  assert.match(line, /^Leave it with the division\. Nothing moves on the mainline until head office signs off a fix - stop-work: deliveries at 60% of plan for 2 months, -[\d,]+ m³ \(December [\d.]+% -> [\d.]+% of the AAC\), about -\$\d+k margin until caught up\.$/);

  const beetles = escalateFieldEventForManager(find('pine-beetle-scouts_field'), () => 0.1);
  assert.equal(setAsideLine(monthJourney(6), beetles), 'Leave it with the division and keep the month for the business.');
  const medevac = escalateFieldEventForManager(find('chainsaw_cut'), () => 0.1);
  assert.match(setAsideLine(monthJourney(6), medevac), /the OFA 3 and the camp make the evacuation call on the ground/);
  // December has one month left, and the line says one month.
  assert.match(setAsideLine(monthJourney(12), washout), /for 1 month,/);
});

test('the stood-down wood is caught up once the stop-work lifts, and the ledger still reconciles', async () => {
  const lines = [];
  let offered = null;
  MANAGER_STYLES.__leaveOnce = (journey, options, prompt) => {
    const aside = options.find((o) => o.value === 'set_aside' && /stop-work/.test(o.description || ''));
    if (aside && !journey.flags.__leftOne) {
      journey.flags.__leftOne = true;
      return aside;
    }
    if (options.some((o) => o.value === 'catchup:run')) offered = options;
    return MANAGER_STYLES.competent(journey, options, prompt);
  };
  let result = null;
  try {
    for (let seed = 300; seed < 360 && !offered; seed += 1) {
      lines.length = 0;
      offered = null;
      result = await simulateManagerYear(seed, '__leaveOnce', { areaId: 'kootenay-wetbelt', trace: (line) => lines.push(line) });
    }
  } finally {
    delete MANAGER_STYLES.__leaveOnce;
  }
  assert.ok(offered, 'some year leaves a stop-work card with the division and reaches the catch-up');
  const start = lines.findIndex((line) => /^Ledger: stop-work on “.+” - deliveries at 60% of plan for [12] months?, this one included\./.test(line));
  assert.ok(start >= 0);
  const title = lines[start].match(/“(.+?)”/)[1];
  const stood = lines.slice(start).filter((line) => line.startsWith('Delivered:') && line.includes(`stood down by the stop-work on “${title}”`));
  assert.ok(stood.length >= 1, 'the monthly ledger names the stop-work');
  const lostTotal = stood.reduce((sum, line) => sum + Number(line.match(/less ([\d,]+) m³ stood down/)[1].replaceAll(',', '')), 0);
  assert.ok(lostTotal <= 16800, `${lostTotal} m³ stood down`);

  // The catch-up names the wood, the cost and where December lands either way.
  const run = offered.find((o) => o.value === 'catchup:run');
  assert.match(run.description, new RegExp(`^\\+${lostTotal.toLocaleString()} m³ over \\w+( and \\w+)?, overtime at \\+\\$4/m³ \\(-\\$[\\d,]+\\), about \\+\\$\\d+k net \\| December [\\d,]+ m³ \\([\\d.]+% of AAC\\)$`));
  const caught = lines.filter((line) => line.startsWith('Delivered:') && line.includes(`caught up on “${title}”`));
  assert.ok(caught.length >= 1, 'the caught-up wood is on the monthly ledger');
  const caughtTotal = caught.reduce((sum, line) => sum + Number(line.match(/incl\. ([\d,]+) m³ caught up/)[1].replaceAll(',', '')), 0);
  assert.equal(caughtTotal, lostTotal, 'every stood-down m³ comes back');

  const { ledger } = result.journey;
  for (const month of ledger.months) {
    assert.equal(month.net, month.revenue - month.overhead - month.certCost - month.standby - (month.catchUpCost || 0));
  }
  assert.ok(ledger.months.some((month) => month.catchUpCost > 0));
  assert.ok(lines.some((line) => /· catch-up overtime -\$[\d,]+$/.test(line)));
  assert.ok(result.victory, result.reason);
  // The debrief remembers which set-aside stopped the work.
  assert.ok(pickKeyMoments(result.journey, 20).some((moment) => moment.title === title && moment.choice === 'Set it aside'));
});

test('one set-aside cannot lose the year: at most ~8 points on December, and careful play recovers it', async () => {
  let moves = [];
  let years = 0;
  let wins = 0;
  for (const difficulty of ['normal', 'hard']) {
    for (let i = 0; i < 27; i += 1) {
      let before = null;
      let used = false;
      MANAGER_STYLES.__one = (journey, options, prompt) => {
        const aside = options.find((o) => o.value === 'set_aside' && /stop-work/.test(o.description || ''));
        if (aside && !used) {
          used = true;
          before = projectYearEndCut(journey).ratio;
          const [, , , from, to] = aside.description.match(PRICED);
          assert.equal(from, (before * 100).toFixed(1), 'the line quotes the projection at the pick');
          moves.push(Number(from) - Number(to));
          return aside;
        }
        return MANAGER_STYLES.competent(journey, options, prompt);
      };
      let result;
      try {
        result = await simulateManagerYear(30000 + i * 7, '__one', { difficulty, areaId: OPERATING_AREAS[i % OPERATING_AREAS.length].id });
      } finally {
        delete MANAGER_STYLES.__one;
      }
      if (!used) continue;
      years += 1;
      if (result.victory) wins += 1;
    }
  }
  assert.ok(years >= 20, `${years} years took a stop-work set-aside`);
  assert.ok(Math.max(...moves) <= 8, `largest move ${Math.max(...moves)} points`);
  // Measured over 150 years a difficulty: 100% of normal and 97% of hard.
  assert.ok(wins / years >= 0.9, `${wins}/${years}`);
});

test('play decides the year: careless play costs grade and some years; competent and honest play still wins them all', async () => {
  const batch = async (style, difficulty) => {
    const results = [];
    for (const area of OPERATING_AREAS) {
      for (let i = 0; i < 6; i += 1) {
        results.push(await simulateManagerYear(2000 + i * 53, style, { difficulty, areaId: area.id }));
      }
    }
    return summarizeBatch(results);
  };
  const randomNormal = await batch('random', 'normal');
  const randomHard = await batch('random', 'hard');
  const competentNormal = await batch('competent', 'normal');
  const competentHard = await batch('competent', 'hard');
  assert.ok(competentNormal.winRate >= 0.98, 'competent normal');
  assert.ok(competentHard.winRate >= 0.98, 'competent hard');
  assert.ok((await batch('honest', 'normal')).winRate >= 0.98, 'honest normal');
  // A GM picking at random still pays for it: a grade band or more below
  // the competent year, and hard years lost to the treasury or the cut.
  assert.ok(competentNormal.medianScore - randomNormal.medianScore >= 12, `random ${randomNormal.medianScore} vs ${competentNormal.medianScore}`);
  assert.ok(competentHard.medianScore - randomHard.medianScore >= 15, `random hard ${randomHard.medianScore} vs ${competentHard.medianScore}`);
  assert.ok(randomHard.winRate < competentHard.winRate - 0.05, `random hard ${randomHard.winRate}`);
});
