import test from 'node:test';
import assert from 'node:assert/strict';

import { createManagerJourney } from '../js/journey/factory.js';
import { applyLedgerHooks, fitManagerEvent, projectYearEndCut, runManagerDay } from '../js/modes/manager.js';
import { formatEventForDisplay, resolveEvent } from '../js/events/index.js';
import { buildTemptationEvent, buildFalloutEvent } from '../js/events/selection.js';
import { ILLEGAL_ACTS } from '../js/data/illegalActs.js';
import { buildManagerEpilogue } from '../js/game/debrief.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { getOperatingPosture } from '../js/data/managerRoles.js';
import managerEvents from '../js/data/json/desk/managerEvents.json' with { type: 'json' };

/**
 * What a resolved card does to the GM's year: the ledger hook for the band
 * the player actually read, a card's operations as this month's wood, a
 * shortcut's operations as money on the chip, an executive who resigns
 * leaving the seat, and a board answer that says what it cost.
 */

async function withRandom(value, fn) {
  const original = Math.random;
  Math.random = typeof value === 'function' ? value : () => value;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

function makeUi(answer = () => null) {
  const lines = [];
  const prompts = [];
  const push = (text) => { if (typeof text === 'string') lines.push(text); };
  return {
    lines,
    prompts,
    write: push, writeHeader: push, writeWarning: push, writePositive: push, writeDanger: push,
    writeInfo: push, writeSuccess: push, writeDivider: push, clear: () => {}, updateAllStatus: () => {},
    playEventVignette: () => {}, playScene: async () => {}, setMissionStatus: () => {}, clearMissionStatus: () => {},
    async promptText() { return 'x'; },
    async promptChoice(prompt, options = []) {
      prompts.push({ prompt, options });
      if (!options.length) return { value: undefined };
      if (options.length === 1) return options[0];
      return answer(prompt, options) || options.find((o) => typeof o.value !== 'symbol') || options[0];
    },
  };
}

function monthJourney(day = 6) {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  const posture = getOperatingPosture('steady');
  journey.flags.managerInitComplete = true;
  journey.ceo = { id: posture.id, name: journey.crew.find((m) => m.role === 'woodlands').name, posture: posture.name, decision_making_style: posture.decision_making_style, volumeFactor: 1, costPerM3: 0, quarterly: {} };
  journey.day = day;
  journey.ledger.deliveredYtd = 20000 * (day - 1);
  journey.flags.paceSetMonth = day;
  journey.flags.boardBaseline = { ...journey.metrics };
  return journey;
}

/** Resolve one option of a card for the GM on a forced roll, then settle it the way the month runner does. */
async function settle(journey, event, index, roll) {
  const fitted = fitManagerEvent(journey, event);
  const ui = makeUi();
  const logBefore = journey.log.length;
  const result = await withRandom(roll, () => resolveEvent(journey, fitted, fitted.options[index]));
  applyLedgerHooks(ui, journey, fitted, logBefore);
  const entry = journey.log.slice(logBefore).find((item) => item.type === 'event');
  return { fitted, ui, messages: result.messages, entry };
}

const LEDGER_FIELDS = ['bonusVolume', 'stumpage', 'costShiftPerM3', 'curtailmentFactor', 'monthCostShift', 'logPrice', 'opsVolume'];
const snapshot = (ledger) => Object.fromEntries(LEDGER_FIELDS.map((key) => [key, Number(ledger[key] || 0)]));
const changes = (before, after) => Object.fromEntries(LEDGER_FIELDS
  .filter((key) => after[key] !== before[key])
  .map((key) => [key, Math.round((after[key] - before[key]) * 100) / 100]));

// What the ledger does on each band of every risky GM option, by the text
// the band prints. A new risky option has to say here what it books.
const RISKY_LEDGER = {
  'gm_mill_curtailment:1': { good: {}, bad: {} },
  'gm_bcts_bid:0': { good: { bonusVolume: 9000, stumpage: 1 }, bad: {} },
  'gm_softwood_duty_deposit:1': { good: { logPrice: -1 }, bad: { logPrice: -4 } },
  'gm_fn_revenue_sharing:1': { good: { costShiftPerM3: 1.5 }, bad: {} },
  'gm_contractor_rate_renegotiation:1': { good: { costShiftPerM3: 2 }, bad: { costShiftPerM3: 3, curtailmentFactor: -0.1 } },
  'gm_log_export_permit:0': { good: { bonusVolume: 1500 }, bad: {} },
  'gm_log_export_permit:2': { good: { bonusVolume: 1500 }, bad: {} },
};

test('a risky option books its ledger hook only on the band whose outcome the player read', async () => {
  const seen = [];
  for (const event of managerEvents) {
    event.options.forEach((option, index) => {
      if (typeof option.chanceSuccess === 'number' && fitManagerEvent(monthJourney(), event)?.options[index].managerLedger) {
        seen.push(`${event.id}:${index}`);
      }
    });
  }
  assert.deepEqual(seen.sort(), Object.keys(RISKY_LEDGER).sort(), 'every risky option with a ledger effect is accounted for');

  for (const [key, expected] of Object.entries(RISKY_LEDGER)) {
    const [id, index] = key.split(':');
    const event = managerEvents.find((entry) => entry.id === id);
    for (const [band, roll] of [['good', 0.001], ['bad', 0.999]]) {
      const journey = monthJourney();
      const before = snapshot(journey.ledger);
      const { ui, entry } = await settle(journey, event, Number(index), roll);
      assert.equal(entry.band, band, `${key} rolled ${band}`);
      const outcome = band === 'good' ? event.options[index].outcome : event.options[index].failureOutcome;
      assert.equal(entry.outcome, outcome);
      assert.deepEqual(changes(before, snapshot(journey.ledger)), expected[band], `${key} ${band}`);
      // A lost bid, a refused permit, a counter read as bad faith: nothing booked, nothing printed.
      const printed = ui.lines.filter((line) => line.startsWith('Ledger:'));
      if (!Object.keys(expected[band]).length && !/curtailment/.test(key)) assert.deepEqual(printed, [], `${key} ${band}`);
    }
  }
});

test('the lost BCTS bid reads as lost on the chip, in the outcome and on the ledger', async () => {
  const event = managerEvents.find((entry) => entry.id === 'gm_bcts_bid');
  const journey = monthJourney(2);
  const shown = formatEventForDisplay(fitManagerEvent(journey, event), 'manager');
  assert.match(shown.options[0].hint, /^ledger if it lands: stumpage \+\$1\/m³ for the rest of the year, \+9,000 m³ on this month's cut; if not: nothing/);
  const { ui } = await settle(journey, event, 0, 0.999);
  assert.equal(journey.ledger.bonusVolume, 0);
  assert.ok(!ui.lines.some((line) => /BCTS sale won/.test(line)));
  const projection = projectYearEndCut(journey);
  const fresh = monthJourney(2);
  assert.equal(projection.volume, projectYearEndCut(fresh).volume, 'the projection carries no phantom sale');
});

test('a card\'s operations land as this month\'s wood, printed, never on the licence\'s run rate', async () => {
  const mentor = DESK_EVENTS.find((entry) => entry.id === 'mentor_advice');
  const washout = DESK_EVENTS.find((entry) => entry.id === 'road_washout') || (await import('../js/data/fieldEvents.js')).FIELD_EVENTS.find((entry) => entry.id === 'road_washout');
  const shortIndex = mentor.options.findIndex((option) => option.effects?.progress === 5);
  const journey = monthJourney();
  const opsBefore = journey.metrics.progress;
  const projectionBefore = projectYearEndCut(journey).volume;
  const fitted = fitManagerEvent(journey, mentor);
  assert.equal(fitted.options[shortIndex].effects.progress, undefined);
  assert.equal(formatEventForDisplay(fitted, 'manager').options[shortIndex].hint, 'ledger: +1,250 m³ on this month\'s deliveries');
  const { ui, messages } = await settle(journey, mentor, shortIndex, 0.5);
  assert.equal(journey.metrics.progress, opsBefore, 'the ops meter does not move');
  assert.ok(!messages.some((message) => /Operational progress/.test(message)));
  assert.ok(ui.lines.includes('Ledger: +1,250 m³ on this month\'s deliveries.'));
  assert.equal(projectYearEndCut(journey).volume - projectionBefore, 1250, 'December moves by the card\'s wood and nothing else');

  // A big hit is capped at a few days of haul, however large the desk number.
  const bypass = fitManagerEvent(journey, washout).options.find((option) => option.managerLedger);
  assert.ok(Object.values(bypass.managerLedger).every((hook) => Math.abs(hook.opsVolume || 0) <= 2500));

  // The month's ledger names the card on the delivered line and counts the wood.
  const washedOut = monthJourney();
  washedOut.ledger.opsVolume = -2000;
  washedOut.ledger.opsSources = ['Road Washed Out'];
  const month = makeUi((prompt, options) => options.find((o) => ['set_aside', 'hold', 'plan', 'desk', 'rehearse', 'transparent', 'pace:1'].includes(o.value)));
  await withRandom(0.99, () => runManagerDay({ ui: month, journey: washedOut, gameOver: false, checkpoint() {} }));
  const delivered = month.lines.find((line) => line.startsWith('Delivered:'));
  assert.match(delivered, /^Delivered: [\d,]+ m³ \(plan [\d,]+, less 2,000 m³ lost to “Road Washed Out”; year to date/);
  const ledgerMonth = washedOut.ledger.months.at(-1);
  assert.ok(ledgerMonth.delivered < ledgerMonth.planned, 'the wood is off the month');
  assert.equal(washedOut.ledger.opsVolume, 0, 'the card\'s wood is this month\'s only');
});

test('a GM shortcut\'s operations are paid in margin: chip, stakes and applied agree, and the meter never moves', async () => {
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'harvest-before-the-site-plan');
  const journey = monthJourney(3);
  const raw = buildTemptationEvent(act, journey);
  const rawShortcut = raw.options.find((option) => option.liveOdds);
  assert.equal(rawShortcut.effects.progress, 8, 'the shared library offers a generic +8');

  const fitted = fitManagerEvent(journey, raw);
  const shortcut = fitted.options.find((option) => option.liveOdds);
  assert.equal(shortcut.effects.progress, undefined);
  assert.equal(shortcut.partialEffects.progress, undefined);
  const payoff = shortcut.effects.budget;
  assert.ok(payoff >= 10000 && payoff <= 50000, `a week of harvest is worth ${payoff}`);
  assert.equal(payoff % 500, 0);
  assert.equal(shortcut.partialEffects.budget, payoff, 'noticed pays the same');
  const chip = `+$${Number((payoff / 1000).toFixed(1))}k`;
  assert.ok(fitted.stakes[0].startsWith(`Take it and you get ${chip}`), fitted.stakes[0]);
  assert.ok(formatEventForDisplay(fitted, 'manager').options.find((o) => o.label === shortcut.label).hint.includes(`, ${chip}, +3 scrutiny`));

  const budgetBefore = journey.resources.budget;
  const opsBefore = journey.metrics.progress;
  const scrutinyBefore = journey.scrutiny;
  const logBefore = journey.log.length;
  const { messages } = await withRandom(0.001, () => resolveEvent(journey, fitted, shortcut));
  applyLedgerHooks(makeUi(), journey, fitted, logBefore);
  assert.equal(journey.resources.budget - budgetBefore, payoff);
  assert.ok(messages.includes(`Budget: +$${payoff.toLocaleString()}`));
  assert.equal(journey.metrics.progress, opsBefore);
  assert.equal(journey.scrutiny - scrutinyBefore, 3, 'the clean band\'s scrutiny chip is what lands');

  // A caught determination that stops work is priced the same way, on its own card.
  const fallout = buildFalloutEvent({ actId: act.id, takenDay: 3, effects: { budget: -9000, progress: -8, compliance: -10 }, flags: [] }, journey);
  const fittedFallout = fitManagerEvent(journey, fallout);
  const cost = fittedFallout.options[0].effects;
  assert.equal(cost.progress, undefined);
  assert.ok(cost.budget < -9000);
  assert.deepEqual(fittedFallout.stakes, [`What it costs: -$${Number((Math.abs(cost.budget) / 1000).toFixed(1))}k, -10 compliance.`]);
});

test('a woodlands manager who resigns leaves the seat, and an acting successor carries the posture', async () => {
  const poaching = DESK_EVENTS.find((entry) => entry.id === 'gm_executive_poaching');
  const stays = monthJourney(9);
  const original = stays.crew.find((member) => member.role === 'woodlands');
  await settle(stays, poaching, 1, 0.001);
  assert.equal(original.isActive, true, 'the appeal lands: nobody leaves');
  assert.equal(stays.crew.filter((member) => member.role === 'woodlands').length, 1);

  const journey = monthJourney(9);
  const departing = journey.crew.find((member) => member.role === 'woodlands');
  const { ui, entry } = await settle(journey, poaching, 1, 0.999);
  assert.match(entry.outcome, /the resignation letter arrives inside the month/);
  assert.equal(departing.isActive, false);
  assert.equal(departing.hasQuit, true);
  const acting = journey.crew.filter((member) => member.role === 'woodlands' && member.isActive);
  assert.equal(acting.length, 1);
  assert.notEqual(acting[0].name, departing.name);
  assert.equal(journey.ceo.name, acting[0].name, 'the posture goes with the seat');
  assert.ok(ui.lines.some((line) => line === `${departing.name} clears out the office by month end. ${acting[0].name} steps up as acting woodlands manager and inherits the Steady delivery posture.`));
  assert.match(buildManagerEpilogue(journey, true)[0], new RegExp(`^Woodlands manager ${acting[0].name}: renewed`));

  // The rest of the year speaks of the successor.
  const month = makeUi((prompt, options) => options.find((o) => ['set_aside', 'plan', 'intervene', 'pace:1'].includes(o.value)));
  journey.day = 10;
  journey.flags.paceSetMonth = 10;
  await withRandom(0.99, () => runManagerDay({ ui: month, journey, gameOver: false, checkpoint() {} }));
  assert.ok(!month.lines.some((line) => line.includes(departing.name)), month.lines.filter((line) => line.includes(departing.name)).join(' | '));
});

test('a card that says someone leaves does not empty an executive seat at random', async () => {
  const resignation = DESK_EVENTS.find((entry) => entry.id === 'key_resignation');
  const journey = monthJourney(4);
  const index = resignation.options.findIndex((option) => option.crewEffect?.lose_member);
  const { messages } = await settle(journey, resignation, index, 0.5);
  assert.ok(journey.crew.every((member) => member.isActive), messages.join(' | '));
  assert.equal(journey.ledger.opsVolume, -2000, 'the forester\'s files cost the month\'s wood instead');
});

test('a strategic decision that moves the ops meter says what it did to December', async () => {
  const journey = monthJourney(6);
  const before = projectYearEndCut(journey).volume;
  const ui = makeUi((prompt, options) => options.find((o) => ['operations', 'set_aside', 'pace:1'].includes(o.value)));
  await withRandom(0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
  const line = ui.lines.find((entry) => entry.startsWith('Operations 50% -> 54%:'));
  assert.ok(line, ui.lines.join('\n'));
  const [, moved, to] = line.match(/December's projection \+([\d,]+) m³, to ([\d,]+) m³/);
  assert.ok(Number(moved.replaceAll(',', '')) > 0);
  assert.ok(Number(to.replaceAll(',', '')) > before);
});

test('each answer to the chair prints what it did to the file', async () => {
  const journey = monthJourney(3);
  journey.ledger.deliveredYtd = 48000;
  journey.ledger.curtailmentFactor = 0.5;
  const scrutiny = journey.scrutiny;
  const ui = makeUi((prompt, options) => options.find((o) => ['spin', 'plan', 'set_aside', 'pace:1'].includes(o.value)));
  await withRandom(0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
  assert.ok(ui.lines.includes(`Reputation +4 -> 54, political capital -2 -> ${Math.round(journey.resources.politicalCapital)}, scrutiny +12 -> ${Math.round(scrutiny + 12)}%.`), ui.lines.filter((line) => /Reputation/.test(line)).join(' | '));
});
