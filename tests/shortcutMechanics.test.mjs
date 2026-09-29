import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTIVE_ILLEGAL_ACTS, ILLEGAL_ACTS } from '../js/data/illegalActs.js';
import {
  actMatchesTemptationContext,
  badBandFloorFor,
  buildShortcutOption,
  buildTemptationEvent,
  buildTemptationPayoff,
  catchDelayFor,
  getTemptationChance,
} from '../js/events/selection.js';
import { checkForEvent, formatEventForDisplay, resolveEvent } from '../js/events.js';
import { computeBandOdds } from '../js/events/odds.js';
import { buildEventReaction } from '../js/events/reactions.js';
import { applySetAsideCost } from '../js/journey/daySituation.js';
import { buildEventCardContent, presentDayCard } from '../js/journey/dayCard.js';
import { getPendingFallout, queueFallout } from '../js/events/fallout.js';
import {
  carryShortcutsIntoJourney,
  collectShortcutsFromJourney,
  describeSeasonShortcuts,
  describeShortcutWatch,
  listShortcutsTaken,
  settleOutstandingFallout,
} from '../js/events/shortcutRecord.js';
import { applyProfessionalComplianceShift } from '../js/engine/professional.js';
import { createJourney } from '../js/journey.js';
import { createSilvicultureJourney } from '../js/journey/factory.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';
import { makeRng } from '../js/engine/rng.js';

const ROLE_AREAS = {
  recce: 'fort-st-john-plateau',
  silviculture: 'fraser-plateau',
  planner: 'bulkley-valley',
  permitter: 'fort-st-john-plateau',
  manager: 'bulkley-valley',
};

function journeyFor(roleId, extra = {}) {
  const journey = createJourney({ roleId, areaId: ROLE_AREAS[roleId], ...extra });
  journey.day = 5;
  return journey;
}

function act(id) {
  const found = ILLEGAL_ACTS.find((entry) => entry.id === id);
  assert.ok(found, `no act ${id}`);
  return found;
}

function reload(journey) {
  return JSON.parse(JSON.stringify(journey));
}

/** Resolve an option with its band pinned: 0 is clean, 0.999 is caught. */
function resolveAt(journey, event, option, roll) {
  const original = Math.random;
  Math.random = () => roll;
  try {
    return resolveEvent(journey, event, option);
  } finally {
    Math.random = original;
  }
}

function fakeUi() {
  const lines = [];
  return {
    lines,
    write(text) { lines.push(String(text)); },
    writeWarning(text) { lines.push(String(text)); },
  };
}

// ── Odds: a serious offence is never safe ───────────────────────────────────

test('a careful record buys cover, but a serious offence always carries a real caught band', () => {
  // The conditions that used to drain the bad band to zero: a spotless file,
  // standing with the district, and Greenhorn.
  const careful = journeyFor('permitter');
  careful.scrutiny = 5;
  careful.difficulty = 'easy';
  careful.resources.politicalCapital = 90;

  const spill = buildShortcutOption(act('permitter-hide-spill-report'), careful);
  assert.ok(spill.liveOdds.bad >= 0.15 - 1e-9, `burying a spill report: ${spill.liveOdds.bad}`);
  const display = formatEventForDisplay(buildTemptationEvent(act('permitter-hide-spill-report'), careful), 'permitting');
  assert.doesNotMatch(display.options[1].hint, /\b0% caught/);

  for (const entry of ACTIVE_ILLEGAL_ACTS) {
    const roleId = entry.roles.find((role) => ROLE_AREAS[role]);
    if (!roleId) continue;
    const journey = journeyFor(roleId);
    journey.scrutiny = 5;
    journey.difficulty = 'easy';
    if (journey.resources) journey.resources.politicalCapital = 90;
    const option = buildShortcutOption(entry, journey);
    const floor = badBandFloorFor(entry);
    assert.ok(floor >= 0.05, `${entry.id} has a floor`);
    assert.ok(option.liveOdds.bad >= floor - 1e-9, `${entry.id}: ${option.liveOdds.bad} under ${floor}`);
    const sum = option.liveOdds.good + option.liveOdds.partial + option.liveOdds.bad;
    assert.ok(Math.abs(sum - 1) < 1e-9, `${entry.id} odds sum to ${sum}`);
  }
});

test('the bad-band floor lives in the shared odds, so the roll matches the chip', () => {
  const option = { chanceSuccess: 0.8, chancePartial: 0.2, badFloor: 0.15 };
  const odds = computeBandOdds(option, {});
  assert.ok(Math.abs(odds.bad - 0.15) < 1e-9);
  assert.ok(Math.abs(odds.good - 0.65) < 1e-9, 'taken from the good band first');
  assert.deepEqual(computeBandOdds({ chanceSuccess: 0.8, chancePartial: 0.2 }, {}).bad, 0, 'no floor, no change');
});

test('the card explains why today\'s odds are what they are', () => {
  const journey = journeyFor('recce');
  const ribbon = act('recce-move-riparian-ribbon');
  const before = buildShortcutOption(ribbon, journey);
  journey.consequenceFlags = ['ce_watching'];
  const watched = buildShortcutOption(ribbon, journey);
  assert.ok(watched.liveOdds.bad > before.liveOdds.bad);
  assert.ok(watched.oddsShifts.worse.some((reason) => /regulator is watching/.test(reason)));
  const event = buildTemptationEvent(act('recce-hide-bear-den'), journey);
  assert.ok(event.stakes.some((line) => /^Worse odds today because .*regulator is watching/.test(line)), event.stakes.join('\n'));
});

// ── Payoff: one set of numbers ──────────────────────────────────────────────

test('what the chip and the stakes promise is what the outcome applies', () => {
  const cases = [
    { roleId: 'manager', id: 'recce-bribe-scaler' },
    { roleId: 'manager', id: 'hush-fee-surcharge' },
    { roleId: 'silviculture', id: 'seedling-switcheroo' },
    { roleId: 'permitter', id: 'permitter-hide-spill-report' },
  ];
  for (const { roleId, id } of cases) {
    const journey = journeyFor(roleId);
    const entry = act(id);
    const event = buildTemptationEvent(entry, journey);
    const take = event.options[1];
    const { effects } = buildTemptationPayoff(entry, journey);
    assert.equal(take.effects.budget, effects.budget);

    // A dollar figure in the pitch's payoff line is the dollar figure paid.
    const named = String(entry.payoff.line).match(/\$([\d,]+)/);
    if (named && journey.journeyType !== 'permitting') {
      assert.equal(effects.budget, Number(named[1].replace(/,/g, '')), `${id} for ${roleId}`);
    }

    const before = journey.resources.budget;
    const result = resolveAt(journey, event, take, 0);
    const landed = journey.resources.budget - before;
    assert.equal(landed, effects.budget, `${id} for ${roleId}: applied ${landed}, promised ${effects.budget}`);
    assert.ok(result.messages.some((line) => line.includes(`+$${Math.abs(landed).toLocaleString()}`)), result.messages.join(' | '));
    assert.ok(event.stakes[0].includes(`$${Number((effects.budget / 1000).toFixed(1))}k`), event.stakes[0]);
  }
});

test('a desk budget near its ceiling is offered only what fits, and the outcome prints what landed', () => {
  const journey = journeyFor('permitter');
  // The act pays more than the room left under the $100,000 ceiling.
  journey.resources.budget = 95000;
  const spill = act('permitter-hide-spill-report');
  const { effects } = buildTemptationPayoff(spill, journey);
  assert.equal(effects.budget, 5000);
  const event = buildTemptationEvent(spill, journey);
  const result = resolveAt(journey, event, event.options[1], 0);
  assert.equal(journey.resources.budget, 100000);
  assert.ok(result.messages.includes('Budget: +$5,000'), result.messages.join(' | '));
});

test('each role is paid in its own currency', () => {
  // A planner's "analysis clears" moves the analysis, not the planner's mood.
  const planner = journeyFor('planner');
  // Even while the plan is still gathering data, the pitch names the analysis.
  planner.plan.phase = 'data_gathering';
  const density = act('planner-underreport-road-density');
  const plannerPay = buildTemptationPayoff(density, planner).effects;
  assert.ok(plannerPay.analysis > 0 && plannerPay.progress === undefined, JSON.stringify(plannerPay));
  const before = planner.plan.analysisQuality;
  const event = buildTemptationEvent(density, planner);
  resolveAt(planner, event, event.options[1], 0);
  assert.equal(planner.plan.analysisQuality, before + plannerPay.analysis);

  // A recce crew is not handed $25,000 of somebody else's bridge; it gets
  // the day the bridge would have cost, and the chip says so.
  const recce = journeyFor('recce');
  const culvert = act('permitter-approve-undersized-culvert');
  const reccePay = buildTemptationPayoff(culvert, recce).effects;
  assert.equal(reccePay.budget, undefined);
  assert.ok(reccePay.progress > 0);

  // A silviculture shortcut is a day of program schedule per shift, not 3/8 of one.
  const silviculture = journeyFor('silviculture');
  const bots = act('midnight-planting-bots');
  const silvPay = buildTemptationPayoff(bots, silviculture).effects;
  assert.ok(silvPay.progress >= 8, JSON.stringify(silvPay));
  const hint = formatEventForDisplay(buildTemptationEvent(bots, silviculture), 'silviculture').options[1].hint;
  assert.match(hint, /\+\d[\d.]* days? on the program schedule/);
});

// ── Fallout lands later and is linked back ──────────────────────────────────

test('a caught band with a lag is the finding today and the determination on its due day', () => {
  const journey = journeyFor('permitter');
  journey.deadline = 40;
  const spill = act('permitter-hide-spill-report');
  const delay = catchDelayFor(spill, journey);
  assert.ok(delay >= 1, 'the spill act carries a lag');
  const event = buildTemptationEvent(spill, journey);
  const take = event.options[1];
  const budgetBefore = journey.resources.budget;
  const complianceBefore = journey.regulations?.complianceScore;

  const result = resolveAt(journey, event, take, 0.999);
  assert.match(result.messages[0], /^It does not hold\./);
  assert.match(result.messages[0], new RegExp(`lands in about ${delay} days?`));
  assert.equal(journey.resources.budget, budgetBefore, 'no payoff, and no fine yet');
  assert.equal(journey.regulations?.complianceScore, complianceBefore);
  assert.ok(journey.consequenceFlags.includes('ce_watching'), 'the finding starts the watch today');
  const pending = getPendingFallout(journey);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].dueDay, 5 + delay);
  assert.equal(journey.log.at(-1).band, 'bad');

  // Nothing lands early.
  journey.day = 5 + delay - 1;
  assert.notEqual(checkForEvent(reload(journey))?.temptationStage, 'fallout');

  // On the due day it is the day's card, and it names the day and the act.
  journey.day = 5 + delay;
  const fallout = checkForEvent(journey);
  assert.equal(fallout.temptationStage, 'fallout');
  assert.match(fallout.description, new RegExp(`Back on day 5 you took the shortcut on “${spill.title}”`));
  assert.match(fallout.description, /ENV/);
  assert.equal(fallout.cardMarker, 'FALLOUT');
  const answer = fallout.options[0];
  resolveEvent(journey, fallout, answer);
  assert.ok(journey.resources.budget < budgetBefore, 'the determination costs money');
  assert.equal(getPendingFallout(journey).length, 0);
});

test('an unanswered determination lands anyway, and worse', () => {
  const journey = journeyFor('recce');
  queueFallout(journey, {
    actId: 'recce-move-riparian-ribbon', title: 'Move the Ribbon', institution: 'C&E', dueIn: 1,
    effects: { compliance: -10, scrutiny: 15, budget: -800 }, flags: ['ce_watching'],
  });
  journey.day += 1;
  const fallout = checkForEvent(journey);
  assert.equal(fallout.temptationStage, 'fallout');
  assert.match(fallout.setAsideDescription, /lands anyway/);
  const scrutinyBefore = journey.scrutiny;
  const ui = fakeUi();
  applySetAsideCost(ui, journey, fallout);
  assert.ok(journey.scrutiny >= scrutinyBefore + 19, `scrutiny ${scrutinyBefore} -> ${journey.scrutiny}`);
  assert.ok(ui.lines.some((line) => /decided without you/.test(line)));
});

test('a determination never lands after the run: it is clamped to the deadline, or settled at close', () => {
  const journey = journeyFor('planner');
  journey.deadline = 7;
  const entry = queueFallout(journey, { actId: 'borrowed-rpf-stamp', title: 'Borrow the Stamp', institution: 'FPBC', dueIn: 6, effects: { compliance: -6, scrutiny: 14 }, flags: ['ce_watching', 'fpbc_file_open'] });
  assert.equal(entry.dueDay, 7);

  const lines = settleOutstandingFallout(journey);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Forest Professionals BC decides on “Borrow the Stamp” after the season/);
  assert.ok(journey.consequenceFlags.includes('fpbc_file_open'));
  assert.equal(getPendingFallout(journey).length, 0);
});

test('every act\'s lag is read: long lags wait, same-week catches settle at once', () => {
  const recce = journeyFor('recce');
  const manager = journeyFor('manager');
  let lagged = 0;
  for (const entry of ACTIVE_ILLEGAL_ACTS) {
    const days = catchDelayFor(entry, recce);
    assert.ok(days >= 0 && days <= 8, `${entry.id}: ${days}`);
    if (entry.catch.lagDays >= 14) assert.ok(days >= 2, `${entry.id} lag ${entry.catch.lagDays} -> ${days}`);
    assert.ok(catchDelayFor(entry, manager) <= 6);
    const option = buildShortcutOption(entry, recce);
    if (days >= 1) {
      lagged += 1;
      assert.equal(option.failureFallout.dueIn, days);
    } else {
      assert.equal(option.failureFallout, undefined);
    }
  }
  assert.ok(lagged > ACTIVE_ILLEGAL_ACTS.length / 2);
});

// ── Consequences stay visible ───────────────────────────────────────────────

test('watch flags say so when they land, stand on the mission panel, and a pending determination is listed', () => {
  const journey = journeyFor('recce');
  const ribbon = act('recce-move-riparian-ribbon');
  const event = buildTemptationEvent(ribbon, journey);
  // Pin the middle band: noticed.
  const noticedRoll = event.options[1].liveOdds.good + 0.01;
  const result = resolveAt(journey, event, event.options[1], noticedRoll);
  assert.ok(result.messages.some((line) => /On your record now: the regulator is watching your files\. Later shortcuts get worse odds/.test(line)), result.messages.join(' | '));
  assert.equal(listShortcutsTaken(journey)[0].band, 'noticed');

  queueFallout(journey, { actId: 'x', title: 'Move the Ribbon', institution: 'C&E', dueIn: 3, effects: {}, flags: [] });
  const alerts = describeShortcutWatch(journey);
  assert.ok(alerts.some((alert) => /^Watched: the regulator is watching your files\. Shortcut odds are worse\./.test(alert.text)));
  assert.ok(alerts.some((alert) => alert.level === 'danger' && /^Coming: C&E on “Move the Ribbon”, shift 8\./.test(alert.text)));
});

test('an open FPBC complaint survives a registration renewal', () => {
  const journey = journeyFor('planner');
  journey.consequenceFlags = ['fpbc_file_open'];
  journey.day = 9;
  checkForEvent(journey);
  assert.equal(journey.professional.registrationStatus, 'under-review');
  applyProfessionalComplianceShift(journey, { registrationStatus: 'active', cpdHours: 8 });
  assert.equal(journey.professional.registrationStatus, 'under-review', 'renewal paperwork cannot close the complaint');
  applyProfessionalComplianceShift(journey, { resetRegistration: true });
  assert.equal(journey.professional.registrationStatus, 'under-review');

  journey.consequenceFlags = [];
  applyProfessionalComplianceShift(journey, { registrationStatus: 'active' });
  assert.equal(journey.professional.registrationStatus, 'active', 'without the file, a renewal restores active status');
});

test('a campaign carries the season\'s shortcuts, flags and unlanded determinations into the next deployment', () => {
  const campaign = {};
  const spring = journeyFor('silviculture');
  spring.log.push({ day: 4, type: 'event', eventId: 'temptation_dont-report-the-spill', optionLabel: 'Take the shortcut', band: 'partial' });
  spring.log.push({ day: 9, type: 'event', eventId: 'temptation_silvi-fake-site-prep', optionLabel: 'Take the shortcut', band: 'bad' });
  spring.consequenceFlags = ['ce_watching', 'camp_bear'];
  spring.temptationMemory = { seenActIds: ['dont-report-the-spill', 'silvi-fake-site-prep'], takenActIds: ['dont-report-the-spill', 'silvi-fake-site-prep'] };
  spring.day = 9;
  queueFallout(spring, { actId: 'silvi-fake-site-prep', title: 'Mound Ten Hectares and Report Forty', institution: 'C&E', dueIn: 5, effects: { compliance: -10, scrutiny: 15 }, flags: ['ce_watching'] });

  const review = collectShortcutsFromJourney(campaign, spring, { label: 'Spring' });
  assert.deepEqual(review.counts, { taken: 2, noticed: 1, caught: 1 });
  assert.ok(review.lines.some((line) => /Shortcut, day 4: “Don't Report the Spill” \(noticed/.test(line)), review.lines.join('\n'));
  assert.ok(review.lines.some((line) => /caught by C&E, determination still to land/.test(line)));
  assert.equal(describeSeasonShortcuts(review.counts), ' · 2 shortcuts taken (1 noticed, 1 caught)');
  assert.deepEqual(campaign.shortcuts.flags, ['ce_watching'], 'the watch carries; the camp bear stays in the spring camp');

  const summer = journeyFor('recce');
  const carryLines = carryShortcutsIntoJourney(campaign, summer);
  assert.ok(summer.consequenceFlags.includes('ce_watching'));
  assert.deepEqual(summer.temptationMemory.takenActIds, ['dont-report-the-spill', 'silvi-fake-site-prep']);
  assert.ok(carryLines.some((line) => /Shortcut odds start worse/.test(line)));
  assert.ok(carryLines.some((line) => /has not decided on “Mound Ten Hectares and Report Forty” yet/.test(line)));

  // The spring determination lands early in the summer, naming the spring.
  summer.day = 2;
  const fallout = checkForEvent(summer);
  assert.equal(fallout?.temptationStage, 'fallout');
  assert.match(fallout.description, /^Back in spring, on day 9, you took the shortcut on “Mound Ten Hectares and Report Forty”/);
});

// ── Tone ────────────────────────────────────────────────────────────────────

test('nobody praises a shortcut: not the inner voice, not the executive team', () => {
  const praise = /clean call|appreciate the paper trail|supporting the decision|Defensible|Bold\./i;
  const planner = journeyFor('planner');
  const manager = journeyFor('manager');
  manager.ceo = { name: 'Stephanie', decision_making_style: 'conservative' };
  manager.crew = [];
  for (let seed = 1; seed <= 200; seed += 1) {
    const rng = makeRng(seed);
    for (const journey of [planner, manager]) {
      const line = buildEventReaction(journey, { reactionTone: 'compromised' }, rng);
      if (line) assert.doesNotMatch(line, praise, line);
    }
  }
  assert.equal(buildEventReaction(planner, { reactionTone: 'silent' }, () => 0), null);
});

// ── Presentation ────────────────────────────────────────────────────────────

test('the card frames itself as a shortcut and opens on who is asking', async () => {
  const journey = journeyFor('permitter');
  const event = buildTemptationEvent(act('permitter-hide-spill-report'), journey);
  const formatted = formatEventForDisplay(event, 'permitting');
  const card = buildEventCardContent(formatted, event, formatted.options.map((opt, index) => ({ opt, raw: event.options[index], index })));
  assert.equal(card.marker, 'SHORTCUT');
  assert.equal(card.options[1].tag, 'OFF-BOOK');

  const written = [];
  const ui = {
    clear() {}, writeHeader(text) { written.push(['header', text]); },
    write(text, cls = '') { written.push([cls, text]); },
    promptChoice: async (prompt, choices) => choices[0],
    releaseScrollAnchor() { written.push(['released']); },
  };
  await presentDayCard(ui, card);
  // Marker and channel share the first line; the title follows directly.
  assert.equal(written[0][1], `== SHORTCUT · ${card.label} ==`);
  assert.match(written[0][0], /term-shortcut term-anchor/);
  assert.equal(written[1][1], event.title);
  assert.match(written[2][1], /^Your ops super, on the phone: /, 'who is asking comes next');
  assert.ok(written.some(([cls, text]) => cls === 'term-stakes' && /^Odds today: \d+% it stays buried · \d+% somebody notices .* \d+% ENV catches it \(no payoff; /.test(text)), JSON.stringify(written));
  assert.deepEqual(written.at(-1), ['released'], 'the anchor lets go once the choice is made');
});

// ── Cadence ─────────────────────────────────────────────────────────────────

function firstOfferDay(roleId, seed, days = 20) {
  const journey = journeyFor(roleId);
  const rng = makeRng(seed);
  for (let day = 2; day <= days; day += 1) {
    journey.day = day;
    journey.daySeed = { day, seed: Math.floor(rng() * 0x100000000) };
    const event = checkForEvent(journey);
    if (event?.type === 'temptation') return day;
  }
  return null;
}

test('the first offer is not a timer: it lands across the first ten days, never on day 1', () => {
  const counts = {};
  const runs = 300;
  for (let seed = 1; seed <= runs; seed += 1) {
    const day = firstOfferDay('recce', seed);
    assert.ok(day && day >= 2 && day <= 11, `seed ${seed}: ${day}`);
    counts[day] = (counts[day] || 0) + 1;
  }
  const busiest = Math.max(...Object.values(counts)) / runs;
  assert.ok(busiest < 0.3, `one day took ${Math.round(busiest * 100)}% of first offers: ${JSON.stringify(counts)}`);
  assert.ok(Object.keys(counts).length >= 7, JSON.stringify(counts));
});

test('a GM hears about two shortcuts a year, never two within four months', () => {
  let offers = 0;
  const runs = 200;
  for (let seed = 1; seed <= runs; seed += 1) {
    const journey = journeyFor('manager');
    const rng = makeRng(seed * 7);
    let last = -Infinity;
    for (let month = 2; month <= 12; month += 1) {
      journey.day = month;
      journey.daySeed = { day: month, seed: Math.floor(rng() * 0x100000000) };
      const event = checkForEvent(journey);
      if (event?.type === 'temptation' && event.temptationStage === 'offer') {
        assert.ok(month - last >= 4, `seed ${seed}: offers in months ${last} and ${month}`);
        last = month;
        offers += 1;
      }
    }
  }
  const perYear = offers / runs;
  assert.ok(perYear >= 1.5 && perYear <= 2.5, `${perYear} offers a year`);
  assert.ok(getTemptationChance(journeyFor('manager')) > getTemptationChance(journeyFor('planner')));
});

// ── Reload determinism ──────────────────────────────────────────────────────

function recordingUi() {
  const lines = [];
  const push = (text) => { if (typeof text === 'string') lines.push(text); };
  return {
    lines,
    write: push, writeHeader: push, writeWarning: push, writePositive: push, writeDanger: push,
    writeInfo: push, writeSuccess: push, writeDivider: () => {}, clear: () => {}, updateAllStatus: () => {},
    playEventVignette: () => {}, playScene: async () => {}, setMissionStatus: () => {}, clearMissionStatus: () => {},
    async promptText() { return 'x'; },
    async promptChoice(prompt, options = []) {
      lines.push(`? ${prompt} [${options.map((option) => option.label).join(' / ')}]`);
      return options.find((option) => option.value === 'set_aside')
        || options.find((option) => option.value === 'end')
        || options[0];
    },
  };
}

test('a reloaded silviculture day replays the same contractor call ahead of the same situation', async () => {
  const base = createSilvicultureJourney({ areaId: 'okanagan-shuswap-drybelt' });
  base.day = 6;
  let sawCall = false;
  for (let seed = 1; seed <= 30; seed += 1) {
    base.daySeed = { day: 6, seed: Math.imul(seed, 0x9e3779b1) >>> 0 };
    const transcripts = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const original = Math.random;
      // A fresh browser context: whatever Math.random does, the day's dice do not change.
      Math.random = makeRng(seed * 101 + attempt * 7919);
      try {
        const ui = recordingUi();
        const journey = reload(base);
        await runSilvicultureDay({ ui, journey, gameOver: false });
        const firstDecision = ui.lines.findIndex((line) => line.startsWith('? ') && !/How do you respond/.test(line));
        transcripts.push(ui.lines.slice(0, firstDecision + 1).join('\n'));
      } finally {
        Math.random = original;
      }
    }
    assert.equal(transcripts[1], transcripts[0], `seed ${seed}: the morning replays`);
    if (/CONTRACTOR CALL/.test(transcripts[0])) sawCall = true;
  }
  assert.ok(sawCall, 'some seed in 1..30 opens with a contractor call');
});

test('a GM\'s set-aside and report say what they are for a GM', () => {
  const manager = journeyFor('manager');
  const event = buildTemptationEvent(act('hush-fee-surcharge'), manager);
  assert.doesNotMatch(event.options[2].outcome, /your manager/);
  assert.match(event.options[2].outcome, /audit committee/);
  assert.match(event.setAsideDescription, /ask again, or do it without you/);
  assert.equal(actMatchesTemptationContext(act('hush-fee-surcharge'), manager), true);
});
