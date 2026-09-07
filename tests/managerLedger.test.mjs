import test from 'node:test';
import assert from 'node:assert/strict';

import { createManagerJourney } from '../js/journey/factory.js';
import { runManagerDay } from '../js/modes/manager.js';
import { checkEndConditions } from '../js/modes/shared/endConditions.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { MANAGER_EXECUTIVE_ROLES, OPERATING_POSTURES } from '../js/data/managerRoles.js';
import managerEvents from '../js/data/json/desk/managerEvents.json' with { type: 'json' };

function seededRandomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withSeededRandom(seed, fn) {
  const original = Math.random;
  Math.random = seededRandomFactory(seed);
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

function makeUi(answer) {
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

const steadyAnswers = (prompt, options) => {
  for (const want of ['steady', 'none', 'hold', 'plan', 'desk', 'rehearse', 'transparent', 'set_aside']) {
    const found = options.find((o) => o.value === want);
    if (found) return found;
  }
  return null;
};

async function runYear(journey, answer = steadyAnswers) {
  const uis = [];
  let outcome = null;
  for (let month = 0; month < 14 && !outcome; month += 1) {
    const ui = makeUi(answer);
    uis.push(ui);
    await runManagerDay({ ui, journey, gameOver: false, checkpoint() {} });
    outcome = checkEndConditions(journey);
  }
  return { outcome, uis, lines: uis.flatMap((ui) => ui.lines), prompts: uis.flatMap((ui) => ui.prompts) };
}

test('the executive team is a licensee executive team', () => {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  assert.deepEqual(journey.crew.map((member) => member.role).sort(), MANAGER_EXECUTIVE_ROLES.map((role) => role.id).sort());
  assert.ok(journey.crew.some((member) => member.roleName === 'Chief Forester (RPF)'));
  assert.ok(!journey.crew.some((member) => /faller|first aid|driver/i.test(member.roleName)));
  assert.equal(journey.targetProfit, undefined, 'no unused target profit');
  assert.equal(journey.ledger.aac, 240000);
  assert.equal(journey.resources.budget, 850000);
});

test('month 1 sets the operating plan with the woodlands team instead of hiring a CEO', async () => {
  await withSeededRandom(5, async () => {
    const journey = createManagerJourney({ areaId: 'fraser-plateau' });
    const ui = makeUi(steadyAnswers);
    await runManagerDay({ ui, journey, gameOver: false, checkpoint() {} });
    const posturePrompt = ui.prompts.find((entry) => /operating posture/.test(entry.prompt));
    assert.ok(posturePrompt);
    assert.deepEqual(posturePrompt.options.map((o) => o.value), OPERATING_POSTURES.map((posture) => posture.id));
    assert.ok(!ui.lines.some((line) => /corner office|Select a CEO|Hired/.test(line)));
    assert.ok(ui.lines.some((line) => /AAC 240,000 m³ · plan 20,000 m³\/month · log price \$105\/m³ · stumpage \$27 · logging & haul \$62/.test(line)));
    const woodlands = journey.crew.find((member) => member.role === 'woodlands');
    assert.equal(journey.ceo.name, woodlands.name, 'the posture is carried by the woodlands manager for the debrief');
    assert.equal(journey.ceo.decision_making_style, 'conservative');
    assert.equal(journey.ceo.posture, 'Steady delivery');
    const certPrompt = ui.prompts.find((entry) => /Certification/.test(entry.prompt));
    assert.ok(certPrompt.options.some((o) => /CSA Z809 \(PEFC-endorsed\)/.test(o.label)));
    assert.ok(!certPrompt.options.some((o) => /Programme for Endorsement/.test(o.label)));
    assert.ok(journey.ledger.deliveredYtd > 0, 'January deliveries are on the cut-control statement');
    assert.equal(journey.day, 2);
  });
});

test('every month closes with a ledger: volume, margin, overhead, net, treasury', async () => {
  await withSeededRandom(9, async () => {
    const journey = createManagerJourney({ areaId: 'fraser-plateau' });
    const { outcome, lines } = await runYear(journey);
    assert.equal(outcome.victory, true, JSON.stringify(outcome));
    const ledgerLines = lines.filter((line) => /^Delivered: [\d,]+ m³ \(plan [\d,]+.*year to date [\d,]+ \/ 240,000 m³ AAC\)$/.test(line));
    assert.equal(ledgerLines.length, 11, 'February through December');
    assert.ok(lines.some((line) => /^Log price \$\d+ - stumpage \$27 - logging & haul \$62 = \$-?\d+\/m³ margin -> [+-]\$[\d,]+$/.test(line)));
    assert.ok(lines.some((line) => /^Overhead -\$290,000$/.test(line)));
    assert.ok(lines.some((line) => /^Net [+-]\$[\d,]+ -> treasury \$[\d,]+$/.test(line)));
    assert.equal(journey.ledger.months.length, 11);
    const delivered = journey.ledger.months.reduce((sum, entry) => sum + entry.delivered, 0);
    assert.ok(journey.ledger.deliveredYtd > delivered, 'January is on the statement too');
    assert.ok(/^(within band|undercut|overcut) \d+%$/.test(journey.ledger.cutControl), journey.ledger.cutControl);
    assert.ok(lines.some((line) => /CUT-CONTROL STATEMENT/.test(line)));
    assert.notEqual(journey.metrics.budget, 50, 'budget health tracks the treasury');
    assert.ok(!lines.some((line) => /Corporate overhead: -\$4,000/.test(line)));
  });
});

test('board reviews sit quarterly on the calendar and only once each', async () => {
  await withSeededRandom(13, async () => {
    const journey = createManagerJourney({ areaId: 'fraser-plateau' });
    const { lines, prompts } = await runYear(journey);
    const reviews = lines.filter((line) => /^QUARTERLY BOARD REVIEW - Q\d/.test(line));
    assert.deepEqual(reviews, [
      'QUARTERLY BOARD REVIEW - Q1 (MARCH CLOSE)',
      'QUARTERLY BOARD REVIEW - Q2 (JUNE CLOSE)',
      'QUARTERLY BOARD REVIEW - Q3 (SEPTEMBER CLOSE)',
      'QUARTERLY BOARD REVIEW - Q4 (DECEMBER CLOSE)',
    ]);
    assert.equal(prompts.filter((entry) => /how the quarter really went/.test(entry.prompt)).length, 4);
    const reviewLog = journey.log.filter((entry) => entry.type === 'board_review');
    assert.deepEqual(reviewLog.map((entry) => entry.day), [4, 7, 10, 13]);
    assert.ok(lines.some((line) => /^Budget Health: \d+ -> \d+ \([+-]?\d+\)$/.test(line) && !/50 -> 50 \(0\)/.test(line)));
    assert.ok(lines.some((line) => /Quarter: [\d,]+ m³, net [+-]\$[\d,]+ \| YTD/.test(line)));
  });
});

test('the posture changes the year: pushing the cut delivers more and thins compliance', async () => {
  const results = {};
  for (const [posture, seed] of [['steady', 17], ['growth', 17]]) {
    await withSeededRandom(seed, async () => {
      const journey = createManagerJourney({ areaId: 'fraser-plateau' });
      const answer = (prompt, options) => options.find((o) => o.value === posture) || steadyAnswers(prompt, options);
      await runYear(journey, answer);
      results[posture] = { delivered: journey.ledger.deliveredYtd, compliance: journey.metrics.compliance, lines: [] };
    });
  }
  assert.ok(results.growth.delivered > results.steady.delivered, `growth ${results.growth.delivered} vs steady ${results.steady.delivered}`);
  assert.ok(results.growth.compliance < results.steady.compliance);
});

test('cut control at year end reads the delivered volume against the AAC', async () => {
  const cases = [
    { delivered: 200000, expect: /^undercut 8\d%$/, band: 'undercut' },
    { delivered: 236000, expect: /^within band (9\d|10\d)%$/, band: 'within' },
    { delivered: 285000, expect: /^overcut 1[12]\d%$/, band: 'overcut' },
  ];
  for (const { delivered, expect, band } of cases) {
    const journey = createManagerJourney({ areaId: 'fraser-plateau' });
    journey.flags.managerInitComplete = true;
    journey.ceo = { id: 'steady', name: 'x', decision_making_style: 'conservative', posture: 'Steady delivery', volumeFactor: 1, costPerM3: 0, quarterly: {} };
    journey.day = 12;
    // December delivers ~monthlyPlan × 0.95; back the YTD off so the year lands where the case wants it.
    journey.ledger.deliveredYtd = delivered - Math.round(journey.ledger.monthlyPlan * 0.95);
    const compliance = journey.metrics.compliance;
    const politicalCapital = journey.resources.politicalCapital;
    const ui = makeUi(steadyAnswers);
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
      await runManagerDay({ ui, journey, gameOver: false, checkpoint() {} });
    } finally {
      Math.random = originalRandom;
    }
    assert.match(journey.ledger.cutControl, expect);
    if (band === 'overcut') {
      assert.ok(journey.metrics.compliance < compliance, 'an overcut is a C&E file');
      assert.ok(ui.lines.some((line) => /C&E opens a file; the penalty on [\d,]+ m³ is \$[\d,]+/.test(line)));
    } else if (band === 'undercut') {
      assert.ok(journey.resources.politicalCapital < politicalCapital + 5, 'the board reads an undercut as margin left in the bush');
      assert.ok(ui.lines.some((line) => /Undercut: [\d,]+ of 240,000 m³/.test(line)));
    } else {
      assert.ok(ui.lines.some((line) => /inside the band\. The statement goes to the District Manager without a covering letter/.test(line)));
    }
    assert.equal(checkEndConditions(journey)?.victory, true);
  }
});

test('the manager desk deck is merged into the desk pool, manager-only and expedition-only', () => {
  assert.equal(managerEvents.length, 6);
  for (const event of managerEvents) {
    const merged = DESK_EVENTS.find((candidate) => candidate.id === event.id);
    assert.ok(merged, `${event.id} reaches the desk pool`);
    assert.deepEqual(event.roles, ['manager']);
    assert.equal(event.expeditionOnly, true);
    assert.ok(event.options.length >= 3);
  }
  const ids = DESK_EVENTS.map((event) => event.id);
  assert.equal(new Set(ids).size, ids.length, 'no id collisions');
  assert.ok(managerEvents.some((event) => /curtailment/i.test(event.title)));
  assert.ok(managerEvents.some((event) => /BCTS/.test(event.title)));
  assert.ok(managerEvents.some((event) => /Softwood/.test(event.title)));
  assert.ok(managerEvents.some((event) => /Revenue-Sharing/.test(event.title)));
  assert.ok(managerEvents.some((event) => /Contractor Rate/.test(event.title)));
  assert.ok(managerEvents.some((event) => /Log Export/.test(event.title)));
});

test('a curtailed month delivers a fraction of plan, says so on the ledger, and clears', async () => {
  await withSeededRandom(23, async () => {
    const journey = createManagerJourney({ areaId: 'fraser-plateau' });
    journey.flags.managerInitComplete = true;
    journey.ceo = { id: 'steady', name: 'x', decision_making_style: 'conservative', posture: 'Steady delivery', volumeFactor: 1, costPerM3: 0, quarterly: {} };
    journey.day = 6;
    journey.ledger.curtailmentFactor = 0.55;
    const ui = makeUi(steadyAnswers);
    await runManagerDay({ ui, journey, gameOver: false, checkpoint() {} });
    const ledgerLine = ui.lines.find((line) => /^Delivered: [\d,]+ m³ \(plan [\d,]+, curtailed/.test(line));
    assert.ok(ledgerLine, 'a curtailed month says so on the ledger');
    const month = journey.ledger.months.at(-1);
    assert.ok(month.delivered < journey.ledger.monthlyPlan * 1.05 * 0.75, `curtailed delivery ${month.delivered}`);
    assert.equal(journey.ledger.curtailmentFactor, 1, 'the curtailment clears after the month');
  });
});

test('the manager desk events carry ledger hooks the mode can key off the resolved option', () => {
  for (const event of managerEvents) {
    for (const option of event.options) {
      assert.ok(option.label && option.outcome, `${event.id} option copy`);
    }
  }
  const curtailment = managerEvents.find((event) => event.id === 'gm_mill_curtailment');
  assert.match(curtailment.options[0].label, /^Curtail with the mill/);
  assert.match(curtailment.options[2].label, /^Divert volume to the pulp mill/);
});
