import test from 'node:test';
import assert from 'node:assert/strict';

import { createJourney, createManagerJourney } from '../js/journey/factory.js';
import { runManagerDay } from '../js/modes/manager.js';
import { eventMatchesJourneyContext } from '../js/events/selection.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { FORESTER_ROLES } from '../js/data/roles.js';
import { buildManagerEpilogue, getFinalReportPrompt } from '../js/game/debrief.js';
import { MANAGER_EXECUTIVE_ROLES, getOperatingPosture } from '../js/data/managerRoles.js';
import certificationsData from '../js/data/json/legacy/certifications.json' with { type: 'json' };

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

function makeUi(answer) {
  const lines = [];
  const prompts = [];
  const push = (text) => { if (typeof text === 'string') lines.push(text); };
  return {
    lines, prompts,
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

const answerWith = (...wanted) => (prompt, options) => {
  for (const want of wanted) {
    const found = options.find((o) => o.value === want);
    if (found) return found;
  }
  return null;
};

function monthJourney(day, deliveredYtd, overrides = {}) {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  const posture = getOperatingPosture('steady');
  journey.flags.managerInitComplete = true;
  journey.ceo = { id: posture.id, name: 'Dana', posture: posture.name, decision_making_style: posture.decision_making_style, volumeFactor: 1, costPerM3: 0, quarterly: {} };
  journey.day = day;
  journey.ledger.deliveredYtd = deliveredYtd;
  journey.flags.paceSetMonth = day;
  Object.assign(journey, overrides);
  journey.flags.boardBaseline = { ...journey.metrics };
  return journey;
}

const cert = (id, status) => ({ ...certificationsData.certifications.find((entry) => entry.id === id), status, audits: [] });

// --- the board ---

test('a transparent report of a weak quarter costs no reputation; spinning it is booked for the year-end audit', async () => {
  const runQ1 = async (stance) => {
    // March curtailed to half: deliveries well short of the seasonal plan.
    const journey = monthJourney(3, 48000);
    journey.ledger.curtailmentFactor = 0.5;
    const scrutinyBefore = journey.scrutiny;
    const ui = makeUi(answerWith(stance, 'plan', 'set_aside', 'pace:1'));
    await withRandom(() => 0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
    return { journey, ui, scrutinyBefore };
  };

  const honest = await runQ1('transparent');
  assert.ok(honest.ui.lines.some((line) => /^The directors read it as a weak quarter: deliveries \d+% of plan\.$/.test(line)));
  assert.equal(honest.journey.metrics.reputation, 50, 'honesty in a weak quarter is not punished');
  assert.ok(honest.journey.scrutiny < honest.scrutinyBefore, 'and it cools the file');

  const spun = await runQ1('spin');
  assert.equal(spun.journey.metrics.reputation, 54);
  assert.deepEqual(spun.journey.flags.boardSpunQuarters, [1]);
  assert.ok(spun.journey.scrutiny > spun.scrutinyBefore);
  const spinOption = spun.ui.prompts.find((entry) => /how the quarter really went/.test(entry.prompt)).options.find((o) => o.value === 'spin');
  assert.match(spinOption.description, /year-end audit reads appendix C/, 'the risk is on the option');
});

test('the year-end audit restates spun weak quarters, and the board hears it from the auditors', async () => {
  const runQ4 = async (spunQuarters, random) => {
    const journey = monthJourney(12, 222000);
    journey.flags.boardSpunQuarters = spunQuarters;
    const ui = makeUi(answerWith('transparent', 'desk', 'set_aside', 'pace:1'));
    await withRandom(random, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
    return { journey, ui };
  };
  const clean = await runQ4([], () => 0.99);
  const caught = await runQ4([1, 3], () => 0.01);
  const lucky = await runQ4([1, 3], () => 0.99);
  assert.equal(clean.journey.ledger.cutControlStatus, 'in_band');
  assert.equal(caught.journey.metrics.reputation, clean.journey.metrics.reputation - 16);
  assert.ok(caught.ui.lines.some((line) => /restates Q1 and Q3\. The board learns those quarters from the auditors instead of from you: reputation -16\./.test(line)));
  assert.equal(lucky.journey.metrics.reputation, clean.journey.metrics.reputation, 'a spin can survive the audit');
  assert.ok(lucky.ui.lines.some((line) => /Both spun quarters survive, this time\./.test(line)));
});

test('the board reads an overcut, a runaway projection and an empty treasury as weak quarters, so spinning them goes to the audit', async () => {
  // December at 123% of the AAC with the C&E penalty emptying the treasury.
  const december = monthJourney(12, 276000);
  december.resources.budget = 400000;
  const decUi = makeUi(answerWith('spin', 'desk', 'set_aside', 'pace:1'));
  await withRandom(() => 0.5, () => runManagerDay({ ui: decUi, journey: december, gameOver: false, checkpoint() {} }));
  assert.match(december.ledger.cutControlStatus, /overcut/);
  const decVerdict = decUi.lines.find((line) => line.startsWith('The directors read it as'));
  assert.match(decVerdict, /^The directors read it as a weak quarter: .*the cut-control statement goes in overcut 1\d\d\.\d%.*the treasury is empty/);
  assert.ok(!decUi.lines.includes('The directors read it as a sound quarter.'));
  assert.deepEqual(december.flags.boardSpunQuarters, [4], 'a spun overcut is on the audit list');
  assert.ok(decUi.lines.some((line) => /AUDITED YEAR-END STATEMENTS/.test(line)));

  // June, already on course for an overcut: the projection is the finding, even
  // with the quarter delivered to plan.
  const june = monthJourney(6, 150000);
  const juneUi = makeUi(answerWith('transparent', 'plan', 'set_aside', 'pace:1'));
  await withRandom(() => 0.5, () => runManagerDay({ ui: juneUi, journey: june, gameOver: false, checkpoint() {} }));
  assert.ok(juneUi.lines.some((line) => /^The directors read it as a weak quarter: .*the cut is heading for 1[1-3]\d\.\d% of the AAC/.test(line)));

  // September in band but with most of the treasury gone.
  const september = monthJourney(9, 176000);
  september.resources.budget = 250000;
  const sepUi = makeUi(answerWith('transparent', 'plan', 'set_aside', 'pace:1'));
  await withRandom(() => 0.5, () => runManagerDay({ ui: sepUi, journey: september, gameOver: false, checkpoint() {} }));
  assert.ok(sepUi.lines.some((line) => /^The directors read it as a weak quarter: .*the treasury is down to \$[\d,]+ from \$850,000/.test(line)));
});

test('a sound quarter honestly reported earns reputation; one bad meter is not a weak quarter', async () => {
  const journey = monthJourney(6, 88000);
  journey.metrics.relationships = 44; // one meter down from the baseline
  const ui = makeUi(answerWith('transparent', 'plan', 'set_aside', 'pace:1'));
  journey.flags.boardBaseline = { ...journey.metrics, relationships: 50 };
  await withRandom(() => 0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
  assert.ok(ui.lines.includes('The directors read it as a sound quarter.'));
  assert.equal(journey.metrics.reputation, 53);
  assert.ok(ui.prompts.some((entry) => entry.prompt === 'Cut schedule for Q3:'), 'the board sets the next quarter\'s cut schedule');
});

// --- certification ---

test('the audit bar stays on the pane all year and is read against the meters before the audit', async () => {
  const run = async (day, relationships) => {
    const journey = monthJourney(day, 20000 * day);
    journey.certifications = [cert('FSC', 'certified')];
    journey.metrics.relationships = relationships;
    journey.metrics.compliance = 60;
    const statuses = [];
    const ui = makeUi(answerWith('plan', 'set_aside', 'hold', 'rehearse', 'desk', 'transparent', 'pace:1'));
    ui.setMissionStatus = (status) => statuses.push(structuredClone(status));
    await withRandom(() => 0.5, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
    return { ui, statuses };
  };

  // July: no audit this month or next, but the pane still carries the October bar.
  const july = await run(7, 54);
  const fact = july.statuses[0].facts.find((entry) => entry.label === 'FSC');
  assert.match(fact.value, /^certified · October surveillance audit: compliance 60\/55, relationships 54\/55$/);
  assert.equal(fact.tone, 'warn');
  assert.ok(!july.ui.lines.includes('CERTIFICATION WATCH'), 'no watch three months out');

  // September: the month before, the month opens with the readout and the pane raises it.
  const september = await run(9, 54);
  assert.ok(september.ui.lines.includes('CERTIFICATION WATCH'));
  assert.ok(september.ui.lines.includes('FSC surveillance audit at the end of October: compliance 60% (needs 55%) · relationships 54% (needs 55%) SHORT.'));
  assert.ok(september.statuses[0].alerts.some((alert) => alert.text === 'FSC surveillance audit in October: relationships 54/55.'));

  // October, meters clear: the readout is there, without an alarm.
  const october = await run(10, 58);
  assert.ok(october.ui.lines.includes('FSC surveillance audit at the end of this month: compliance 60% (needs 55%) · relationships 58% (needs 55%).'));
  assert.ok(!october.statuses[0].alerts.some((alert) => /FSC/.test(alert.text)));
});

test('certification is booked in January and earned at the May registration audit', async () => {
  await withRandom(seededRandomFactory(7), async () => {
    const journey = createManagerJourney({ areaId: 'fraser-plateau' });
    const ui = makeUi(answerWith('steady', 'CSA'));
    await runManagerDay({ ui, journey, gameOver: false, checkpoint() {} });
    const certPrompt = ui.prompts.find((entry) => /Certification/.test(entry.prompt));
    const csa = certPrompt.options.find((o) => o.value === 'CSA');
    assert.match(csa.label, /\$100,000 up front, \$18,000\/yr, \+\$3\/m³ once certified/);
    assert.match(csa.hint, /^May audit wants compliance 50%\+ and relationships 45%\+\./);
    assert.equal(journey.certifications[0].status, 'pending');
    assert.equal(journey.metrics.reputation, 50, 'no reputation until the certificate is issued');
    assert.equal(journey.ledger.months[0].premium, 0);
    assert.equal(journey.ledger.months[0].certCost, 1500);
  });
});

test('a registration audit that passes issues the certificate; the premium starts the month after', async () => {
  const journey = monthJourney(5, 70000, { certifications: [cert('FSC', 'pending')] });
  journey.metrics.compliance = 60;
  journey.metrics.relationships = 58;
  const ui = makeUi(answerWith('rehearse', 'set_aside', 'pace:1'));
  await withRandom(() => 0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
  assert.equal(journey.certifications[0].status, 'certified');
  assert.equal(journey.metrics.reputation, 60);
  assert.ok(ui.lines.includes('FSC REGISTRATION AUDIT'));
  assert.ok(ui.lines.some((line) => /^Compliance 6\d% \(needs 55%\) pass · Relationships 58% \(needs 55%\) pass$/.test(line)));
  assert.equal(journey.ledger.months.at(-1).premium, 0, 'May delivers before the audit');

  const june = makeUi(answerWith('intervene', 'plan', 'set_aside', 'pace:1'));
  journey.flags.paceSetMonth = 6;
  await withRandom(() => 0.99, () => runManagerDay({ ui: june, journey, gameOver: false, checkpoint() {} }));
  assert.equal(journey.ledger.months.at(-1).premium, 4);
  assert.ok(june.lines.some((line) => / \+ \$4 certified premium - stumpage/.test(line)));
});

test('a failed registration gets one re-audit in October; failing that withdraws the application', async () => {
  const journey = monthJourney(5, 70000, { certifications: [cert('FSC', 'pending')] });
  journey.metrics.relationships = 48;
  const ui = makeUi(answerWith('rehearse', 'set_aside', 'pace:1'));
  await withRandom(() => 0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
  assert.equal(journey.certifications[0].status, 'corrective');
  assert.ok(ui.lines.some((line) => /Relationships 48% \(needs 55%\) FAIL/.test(line)));
  assert.ok(ui.lines.some((line) => /corrective-action request and come back in October/.test(line)));

  journey.day = 10;
  journey.flags.paceSetMonth = 10;
  journey.ledger.deliveredYtd = 170000;
  const reputation = journey.metrics.reputation;
  const october = makeUi(answerWith('plan', 'set_aside', 'pace:1'));
  await withRandom(() => 0.99, () => runManagerDay({ ui: october, journey, gameOver: false, checkpoint() {} }));
  assert.equal(journey.certifications[0].status, 'withdrawn');
  assert.equal(journey.metrics.reputation, reputation - 5);
  assert.ok(october.lines.includes('FSC RE-AUDIT'));
  assert.equal(journey.ledger.months.at(-1).certCost, 2083, 'October still pays the fee');

  const november = makeUi(answerWith('desk', 'set_aside', 'pace:1'));
  journey.flags.paceSetMonth = 11;
  await withRandom(() => 0.99, () => runManagerDay({ ui: november, journey, gameOver: false, checkpoint() {} }));
  assert.equal(journey.ledger.months.at(-1).certCost, 0, 'a withdrawn application stops billing');
  assert.match(buildManagerEpilogue(journey, true).join('\n'), /Withdrawn after the re-audit/);
});

test('a held certificate that fails its October surveillance audit is suspended and gives the bonus back', async () => {
  const journey = monthJourney(10, 170000, { certifications: [cert('CSA', 'certified')] });
  journey.metrics.compliance = 42;
  journey.metrics.reputation = 70;
  const ui = makeUi(answerWith('plan', 'set_aside', 'pace:1'));
  await withRandom(() => 0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
  assert.equal(journey.certifications[0].status, 'suspended');
  assert.equal(journey.metrics.reputation, 70 - 7 - 5);
  assert.equal(journey.ledger.months.at(-1).premium, 3, 'October delivered before the audit');
  assert.ok(ui.lines.some((line) => /Certificate suspended\. The premium stops and the buyers get the letter; reputation -12\./.test(line)));
});

test('the surveillance-audit desk event only reaches a GM with a certificate on the books', async () => {
  const count = async (certId) => {
    let seen = 0;
    for (let run = 0; run < 90; run += 1) {
      await withRandom(seededRandomFactory(500 + run * 17), async () => {
        const journey = createManagerJourney({ areaId: 'fraser-plateau', roleId: 'manager' });
        const answer = answerWith('steady', certId, 'hold', 'plan', 'desk', 'rehearse', 'transparent', 'pace:1');
        for (let month = 0; month < 12; month += 1) {
          await runManagerDay({ ui: makeUi((prompt, options) => answer(prompt, options) || options.find((o) => typeof o.value === 'number')), journey, gameOver: false, checkpoint() {} });
          if (journey.day > journey.deadline) break;
        }
        seen += journey.log.filter((entry) => entry.eventId === 'gm_certification_audit_prep').length;
      });
    }
    return seen;
  };
  assert.equal(await count('none'), 0);
  assert.ok(await count('SFI') > 0, 'the gate does not simply remove the event');
});

// --- the executive team and the calendar ---

test('a GM started from the role card gets the executive team, and the text uses it', async () => {
  const role = FORESTER_ROLES.find((entry) => entry.id === 'manager');
  // The game no longer hands the GM a generic desk crew (js/game/ForestryTrailGame.js).
  const journey = createJourney({ role, area: { id: 'fraser-plateau', name: 'Fraser Plateau' }, crew: undefined });
  assert.deepEqual(journey.crew.map((member) => member.role).sort(), MANAGER_EXECUTIVE_ROLES.map((entry) => entry.id).sort());

  await withRandom(seededRandomFactory(3), async () => {
    const ui = makeUi(answerWith('steady', 'none', 'hold'));
    await runManagerDay({ ui, journey, gameOver: false, checkpoint() {} });
    const cfo = journey.crew.find((member) => member.role === 'cfo');
    const chief = journey.crew.find((member) => member.role === 'chief_forester');
    assert.ok(ui.lines.some((line) => line.startsWith(`${cfo.name} (CFO) notes that spring breakup`)));
    assert.ok(ui.prompts.some((entry) => entry.prompt.startsWith(`${chief.name} (Chief Forester) asks:`)));

    const february = makeUi(answerWith('hold', 'set_aside', 'pace:1'));
    await runManagerDay({ ui: february, journey, gameOver: false, checkpoint() {} });
    assert.ok(february.lines.some((line) => line.startsWith(`${cfo.name}, your CFO, has freed up discretionary room`)));
  });

  const options = getFinalReportPrompt('manager').options.map((o) => o.label).join(' | ');
  assert.doesNotMatch(options, /CEO/);
  assert.match(options, /executive team/);
});

test('the GM calendar gates seasonal cards: no July heat in December, no planting-window rows in November', async () => {
  const journey = monthJourney(11, 200000);
  const ui = makeUi(answerWith('plan', 'set_aside', 'pace:1'));
  await withRandom(() => 0.99, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
  assert.equal(journey.day, 12);
  assert.equal(journey.season.currentSeason, 'winter');
  const renovation = DESK_EVENTS.find((event) => event.id === 'office_renovation_disruption');
  assert.equal(eventMatchesJourneyContext(renovation, journey), false);
  assert.doesNotMatch(renovation.description, /July/);
  journey.season.currentSeason = 'fall';
  const rivalry = DESK_EVENTS.find((event) => event.id === 'gm_division_rivalry');
  assert.equal(eventMatchesJourneyContext(rivalry, journey), false);
  const poaching = DESK_EVENTS.find((event) => event.id === 'gm_executive_poaching');
  assert.doesNotMatch(JSON.stringify(poaching), /CEO/, 'the GM does not have a CEO to lose');
});
