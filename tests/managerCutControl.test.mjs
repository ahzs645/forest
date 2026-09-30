import test from 'node:test';
import assert from 'node:assert/strict';

import { createManagerJourney } from '../js/journey/factory.js';
import { runManagerDay, projectYearEndCut } from '../js/modes/manager.js';
import { checkEndConditions } from '../js/modes/shared/endConditions.js';
import { calculateScore } from '../js/scoring.js';
import { formatJourneyLog } from '../js/journey/display.js';
import { buildVictoryNarrative } from '../js/game/endScreen.js';
import { CUT_CONTROL, classifyCutControl, formatCutPercent, getOperatingPosture } from '../js/data/managerRoles.js';

function seededRandomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withRandom(random, fn) {
  const original = Math.random;
  Math.random = random;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

/** A UI that records the order of writes, clears and prompts. */
function makeUi(answer) {
  const lines = [];
  const prompts = [];
  const sequence = [];
  const missions = [];
  const push = (text) => {
    if (typeof text !== 'string') return;
    lines.push(text);
    sequence.push({ type: 'write', text });
  };
  return {
    lines, prompts, sequence, missions,
    write: push, writeHeader: push, writeWarning: push, writePositive: push, writeDanger: push,
    writeInfo: push, writeSuccess: push, writeDivider: push,
    clear: () => sequence.push({ type: 'clear' }),
    updateAllStatus: () => {}, playEventVignette: () => {}, playScene: async () => {},
    setMissionStatus: (status) => missions.push(status), clearMissionStatus: () => {},
    async promptText() { return 'x'; },
    async promptChoice(prompt, options = []) {
      prompts.push({ prompt, options });
      sequence.push({ type: 'prompt', prompt, labels: options.map((o) => o.label) });
      if (!options.length) return { value: undefined };
      if (options.length === 1) return options[0];
      return answer(prompt, options) || options.find((o) => typeof o.value !== 'symbol') || options[0];
    },
  };
}

const answerWith = (...wanted) => (prompt, options) => {
  for (const want of wanted) {
    const found = options.find((o) => o.value === want);
    if (found) return found;
  }
  return null;
};

const steady = answerWith('steady', 'none', 'hold', 'plan', 'desk', 'rehearse', 'transparent', 'set_aside', 'pace:1');

function postureCeo(id) {
  const posture = getOperatingPosture(id);
  return {
    id: posture.id, name: 'Dana', posture: posture.name, decision_making_style: posture.decision_making_style,
    volumeFactor: posture.volumeFactor, costPerM3: posture.costPerM3, quarterly: {},
  };
}

function midYearJourney({ day, deliveredYtd, posture = 'steady', progress = 50 }) {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  journey.flags.managerInitComplete = true;
  journey.ceo = postureCeo(posture);
  journey.day = day;
  journey.ledger.deliveredYtd = deliveredYtd;
  journey.metrics.progress = progress;
  return journey;
}

test('the cut-control band and limits classify the statement, printed to one decimal', () => {
  assert.equal(classifyCutControl(0.84), 'severe_undercut');
  assert.equal(classifyCutControl(0.87), 'undercut');
  assert.equal(classifyCutControl(0.9), 'in_band');
  assert.equal(classifyCutControl(1.1), 'in_band');
  assert.equal(classifyCutControl(1.103), 'overcut');
  assert.equal(classifyCutControl(1.14), 'overcut');
  assert.equal(classifyCutControl(1.16), 'severe_overcut');
  // "overcut 110%" next to "past the 110% ceiling" read as a contradiction.
  assert.equal(formatCutPercent(1.103), '110.3%');
  assert.equal(formatCutPercent(0.9), '90.0%');
});

test('the projection follows the seasonal curve: a February carry-in is on course, not a runaway', async () => {
  await withRandom(seededRandomFactory(31), async () => {
    const journey = createManagerJourney({ areaId: 'fraser-plateau' });
    const ui = makeUi(steady);
    await runManagerDay({ ui, journey, gameOver: false, checkpoint() {} });
    assert.equal(journey.day, 2);
    // The linear check read 23,520 / 20,000 as a 118% pace and left the box unticked.
    const projection = projectYearEndCut(journey);
    assert.equal(projection.status, 'in_band', JSON.stringify(projection));
    const pane = ui.missions.at(-1);
    assert.ok(pane.checklist.find((item) => /cut on course for the 90-110% band/.test(item.label)).done);
    assert.ok(pane.facts.some((fact) => fact.label === 'Projected' && /\(\d+\.\d%\)$/.test(fact.value)));
    assert.ok(pane.facts.some((fact) => fact.label === 'Treasury'), 'the treasury is on the pane');
  });
});

test('a push-the-cut summer on its way to 114% is flagged in September, and parking a side brings it back', async () => {
  // The playtest's run: 167,008 m³ by the end of August on Push the cut with
  // the ops meter high. The linear check called it in band.
  const journey = midYearJourney({ day: 9, deliveredYtd: 167008, posture: 'growth', progress: 60 });
  const projection = projectYearEndCut(journey);
  assert.equal(projection.status, 'overcut', `${projection.volume} (${formatCutPercent(projection.ratio)})`);
  assert.ok(projection.ratio > 1.12 && projection.ratio < 1.15);

  // Take the woodlands manager's recommendation on the cut schedule.
  const ui = makeUi((prompt, options) => options.find((o) => o.recommended) || steady(prompt, options));
  await withRandom(() => 0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
  const watch = ui.lines.find((line) => /flags the cut: 167,008 m³ on the statement/.test(line));
  assert.ok(watch, 'the woodlands manager raises it before December');
  assert.match(watch, /outside the 90-110% band/);
  const schedule = ui.prompts.find((entry) => /^Cut schedule from September/.test(entry.prompt));
  assert.ok(schedule);
  assert.deepEqual(schedule.options.map((o) => o.value).sort(), ['pace:0.85', 'pace:1', 'pace:1.1']);
  assert.equal(schedule.options[0].value, 'pace:0.85', 'the recommendation comes first');
  assert.match(schedule.options[0].label, /recommended/);
  assert.match(schedule.options[0].description, /^December [\d,]+ m³ \(10\d\.\d% of AAC\) \| standby -\$12,000\/month$/);
  assert.equal(journey.ledger.pace, 0.85);
  assert.ok(ui.lines.some((line) => /^Delivered: [\d,]+ m³ \(plan 23,000, park a side;/.test(line)));
  assert.ok(ui.lines.some((line) => /· standby -\$12,000$/.test(line)), 'standby is a ledger charge');
  assert.equal(projectYearEndCut(journey).status, 'in_band');
});

test('adding a shift raises delivery and costs logging and haul on every m³', async () => {
  const run = async (pace) => {
    const journey = midYearJourney({ day: 7, deliveredYtd: 130000 });
    journey.ledger.pace = pace;
    journey.flags.paceSetMonth = 7;
    const ui = makeUi(steady);
    await withRandom(() => 0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
    return { month: journey.ledger.months.at(-1), lines: ui.lines };
  };
  const hold = await run(1);
  const shift = await run(1.1);
  assert.ok(shift.month.delivered > hold.month.delivered * 1.08);
  assert.equal(shift.month.cost - hold.month.cost, 1.5);
  assert.ok(shift.lines.some((line) => /logging & haul \$63\.50 = \$\d+\.50\/m³ margin/.test(line)), 'half-dollar rates print with cents');
});

test('the December ledger and the cut-control statement hold on screen before the board review clears it', async () => {
  const journey = midYearJourney({ day: 12, deliveredYtd: 222000 });
  const ui = makeUi(steady);
  await withRandom(() => 0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
  const { sequence } = ui;
  const statementAt = sequence.findIndex((entry) => entry.type === 'write' && /^Cut control: [\d,]+ of 240,000 m³/.test(entry.text));
  const netAt = sequence.findIndex((entry) => entry.type === 'write' && /^Net [+-]\$[\d,]+ -> treasury/.test(entry.text));
  assert.ok(netAt > 0 && statementAt > netAt);
  const nextClear = sequence.findIndex((entry, index) => index > statementAt && entry.type === 'clear');
  const pause = sequence.findIndex((entry, index) => index > statementAt && entry.type === 'prompt');
  assert.ok(pause > statementAt && pause < nextClear, 'a Continue prompt sits between the statement and the board review');
  assert.deepEqual(sequence[pause].labels, ['Continue to the year-end board review']);
  // The board review prints the quarter's ledger and the statement again.
  const board = sequence.slice(nextClear).filter((entry) => entry.type === 'write').map((entry) => entry.text);
  assert.ok(board.some((text) => /^December: [\d,]+ m³ \(plan 19,000\) at \$\d+\/m³, net [+-]\$[\d,]+$/.test(text)));
  assert.ok(board.some((text) => /^Cut control: [\d,]+ of 240,000 m³ \(\d+\.\d%\), inside the 90-110% band/.test(text)));

  // The Log keeps the ledger and the statement after the screen moves on.
  const log = formatJourneyLog(journey);
  assert.ok(log.some((entry) => entry.type === 'ledger' && /^December ledger: [\d,]+ m³, net [+-]\$[\d,]+$/.test(entry.summary) && /Treasury \$[\d,]+/.test(entry.detail)));
  assert.ok(log.some((entry) => entry.type === 'cut_control' && /within band/.test(entry.summary) && /without a covering letter/.test(entry.detail)));
  assert.ok(log.every((entry) => entry.dayLabel === 'Month'));
});

test('an overcut costs more than the wood past the ceiling earned', () => {
  // The old $10/m³ against a $14-24 margin made a 114% overcut net profitable.
  const bestMargin = 140 + 4 - (27 + 0.6 * (140 - 105)) - (62 - 2);
  assert.ok(CUT_CONTROL.overcutPenaltyPerM3 > bestMargin, `penalty ${CUT_CONTROL.overcutPenaltyPerM3} vs margin ${bestMargin}`);
});

test('cut control decides the year: in band wins clean, a finding wins qualified, past the limit loses', () => {
  const closeYear = (ratio, extras = {}) => {
    const journey = createManagerJourney({ areaId: 'fraser-plateau' });
    journey.day = 13;
    journey.metrics.reputation = 60;
    journey.ledger.deliveredYtd = Math.round(240000 * ratio);
    journey.ledger.cutControlStatus = classifyCutControl(ratio);
    journey.ledger.cutControl = `x ${formatCutPercent(ratio)}`;
    Object.assign(journey, extras);
    return journey;
  };

  const clean = closeYear(1.0);
  const over = closeYear(1.14);
  const under = closeYear(0.87);
  const severeOver = closeYear(1.2);
  const severeUnder = closeYear(0.84);

  assert.match(checkEndConditions(clean).reason, /inside the cut-control band/);
  assert.equal(checkEndConditions(over).victory, true);
  assert.match(checkEndConditions(over).reason, /with a finding/);
  assert.equal(checkEndConditions(under).victory, true);
  assert.equal(checkEndConditions(severeOver).gameOver, true);
  assert.match(checkEndConditions(severeOver).reason, /Overcut past 115% of the AAC/);
  assert.equal(checkEndConditions(severeUnder).gameOver, true);
  assert.match(checkEndConditions(severeUnder).reason, /under 85% of the AAC/);

  // The reputation loss says what the threshold was, as a sentence.
  const lowRep = closeYear(1.0);
  lowRep.metrics.reputation = 33;
  assert.equal(checkEndConditions(lowRep).reason, "The board's confidence is gone: reputation 33% at the year-end review, and it needed to be above 40%.");

  // The grade reads the statement.
  const objectives = (journey) => calculateScore(journey, Boolean(checkEndConditions(journey)?.victory)).components.objectives.score;
  assert.ok(objectives(clean) > objectives(over) + 10);
  assert.ok(objectives(over) > objectives(severeOver));
  assert.match(calculateScore(over, true).components.objectives.label, /cut x 114\.0%/);

  // The victory text no longer claims a clean statement it did not file.
  assert.match(buildVictoryNarrative(clean, 'the area', 'Crew', 12), /with the cut delivered.*without a covering letter/);
  const overText = buildVictoryNarrative(over, 'the area', 'Crew', 12);
  assert.doesNotMatch(overText, /without a covering letter|cut delivered/);
  assert.match(overText, /114\.0% of the AAC with a C&E penalty attached/);
  assert.match(overText, /board's confidence intact/);
  assert.match(buildVictoryNarrative(under, 'the area', 'Crew', 12), /87\.0% of the AAC; the wood left standing is lost/);
});

test('the compliance component reads the licensee file, not only the situations that crossed the desk', () => {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  journey.day = 13;
  journey.log = [{ type: 'event', eventId: 'x', effects: {} }, { type: 'event', eventId: 'y', effects: {} }];
  journey.metrics.compliance = 90;
  const clean = calculateScore(journey, true).components.compliance.score;
  journey.metrics.compliance = 15;
  const caught = calculateScore(journey, true).components.compliance;
  assert.ok(clean - caught.score >= 35, `${clean} vs ${caught.score}`);
  assert.match(caught.label, /compliance 15%/);
});

test('budget health reads against the treasury the year opened with, at any difficulty', async () => {
  await withRandom(seededRandomFactory(41), async () => {
    const journey = createManagerJourney({ areaId: 'fraser-plateau' });
    journey.difficulty = 'hard';
    journey.resources.budget = 680000;
    const ui = makeUi(steady);
    await runManagerDay({ ui, journey, gameOver: false, checkpoint() {} });
    assert.equal(journey.ledger.startTreasury, 680000);
    const january = journey.ledger.months[0];
    assert.ok(january.net > 0);
    assert.ok(journey.metrics.budget > 50, `a profitable January reads above the baseline, not ${journey.metrics.budget}`);
    assert.equal(journey.ledger.overhead, 281000, 'hard runs a heavier head office');
  });
});
