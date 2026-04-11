import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptOperationalEvent,
  adaptIllegalActTemptation,
  adaptOperationalEventEffects,
  applyOptionOutcome,
  createInitialState,
  drawSeasonalEvent,
  drawSeasonalTemptation,
} from '../js/engine.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { ILLEGAL_ACTS } from '../js/data/illegalActs.js';

const TUI_METRICS = ['budget', 'compliance', 'forestHealth', 'progress', 'relationships'];

test('operational event effects are normalized into TUI metrics', () => {
  const mapped = adaptOperationalEventEffects({
    budget: -3000,
    politicalCapital: 6,
    compliance: 5,
    timeUsed: 4,
    crew_morale: -5,
    equipment: -10,
    permits_approved: 1,
  });

  assert.deepEqual(mapped, {
    progress: -6,
    relationships: 2,
    compliance: 9,
    budget: -6,
  });
});

test('planner seasonal event draws from the desk event library with TUI-safe option effects', () => {
  const state = createInitialState({
    companyName: 'Planner Event Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  state.round = 1;

  const event = drawSeasonalEvent(state, () => 0);

  assert.ok(event);
  assert.match(event.flavor, /Adapted desk event/i);
  assert.ok(event.options.length > 0);

  for (const option of event.options) {
    const keys = Object.keys(option.effects || {});
    assert.ok(keys.every((key) => TUI_METRICS.includes(key)), `unexpected metric key in ${option.label}: ${keys.join(', ')}`);
  }
});

test('scheduled desk-event follow-ups are queued into the next TUI event draw', () => {
  const state = createInitialState({
    companyName: 'Follow-up Event Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  state.round = 1;

  const auditEvent = DESK_EVENTS.find((event) => event.id === 'surprise_audit');
  assert.ok(auditEvent, 'expected surprise_audit desk event fixture');

  const adapted = adaptOperationalEvent(auditEvent, state);
  const reschedule = adapted.options.find((option) => option.label === 'Ask to reschedule');
  assert.deepEqual(reschedule?.scheduleEvents, { id: 'audit_followup', delay: 1 });

  applyOptionOutcome(state, reschedule, {
    type: 'event',
    id: adapted.id,
    title: adapted.title,
    option: reschedule.label,
    round: state.round,
  });

  assert.deepEqual(state.pendingEvents, [{ id: 'audit_followup', delay: 1 }]);

  const followUp = drawSeasonalEvent(state, () => 0);
  assert.equal(followUp?.id, 'audit_followup');
  assert.deepEqual(state.pendingEvents, []);
});

test('field roles draw adapted field events instead of desk events', () => {
  const state = createInitialState({
    companyName: 'Field Event Test',
    roleId: 'recce',
    areaId: 'muskwa-foothills',
  });
  state.round = 1;

  const event = drawSeasonalEvent(state, () => 0);

  assert.ok(event);
  assert.match(event.flavor, /Adapted field event/i);
});

test('seasonal temptation draws from illegal acts with a risk-based shortcut option', () => {
  const state = createInitialState({
    companyName: 'Temptation Draw Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  state.round = 2;

  const rolls = [0, 0, 0.5];
  const temptation = drawSeasonalTemptation(state, () => rolls.shift() ?? 0);

  assert.ok(temptation);
  assert.match(temptation.flavor, /Adapted temptation/i);
  assert.equal(temptation.id, 'temptation:black-market-timber-maps');

  const riskyOption = temptation.options.find((option) => option.risk);
  assert.ok(riskyOption);

  const successKeys = Object.keys(riskyOption.risk.successEffects || {});
  const failKeys = Object.keys(riskyOption.risk.failEffects || {});
  assert.ok(successKeys.every((key) => TUI_METRICS.includes(key)), `unexpected success metric keys: ${successKeys.join(', ')}`);
  assert.ok(failKeys.every((key) => TUI_METRICS.includes(key)), `unexpected fail metric keys: ${failKeys.join(', ')}`);
});

test('temptations are suppressed in the opening season and stay rare under normal conditions', () => {
  const state = createInitialState({
    companyName: 'Temptation Rate Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });

  state.round = 1;
  assert.equal(drawSeasonalTemptation(state, () => 0), null);

  state.round = 2;
  assert.equal(drawSeasonalTemptation(state, () => 0.1), null);
});

test('temptation chance ramps up only under later-season pressure', () => {
  const state = createInitialState({
    companyName: 'Temptation Pressure Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  state.round = 3;
  state.metrics = {
    ...state.metrics,
    budget: 34,
    progress: 39,
    compliance: 39,
    relationships: 34,
  };

  const rolls = [0.01, 0, 0.5];
  const temptation = drawSeasonalTemptation(state, () => rolls.shift() ?? 0);

  assert.ok(temptation);
  assert.match(temptation.id, /^temptation:/);
});

test('temptation profiles differ between desk and field roles', () => {
  const plannerState = createInitialState({
    companyName: 'Planner Profile Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  plannerState.round = 3;

  const silvState = createInitialState({
    companyName: 'Silv Profile Test',
    roleId: 'silviculture',
    areaId: 'muskwa-foothills',
  });
  silvState.round = 3;

  const plannerAct = ILLEGAL_ACTS.find((entry) => entry.id === 'black-market-timber-maps');
  const silvAct = ILLEGAL_ACTS.find((entry) => entry.id === 'seedling-switcheroo');

  const plannerTemptation = adaptIllegalActTemptation(plannerAct, plannerState, () => 0.5);
  const silvTemptation = adaptIllegalActTemptation(silvAct, silvState, () => 0.5);

  assert.match(plannerTemptation.flavor, /Bureaucratic shortcut/);
  assert.match(silvTemptation.flavor, /Field desperation/);

  const plannerRisk = plannerTemptation.options.find((option) => option.risk)?.risk;
  const silvRisk = silvTemptation.options.find((option) => option.risk)?.risk;

  assert.ok(plannerRisk.baseSuccess > silvRisk.baseSuccess);
  assert.ok((plannerRisk.successEffects.progress || 0) >= (silvRisk.successEffects.progress || 0));
});

test('failed temptation shortcuts raise existing investigation flags', () => {
  const state = createInitialState({
    companyName: 'Temptation Failure Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  state.round = 2;

  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'black-market-timber-maps');
  assert.ok(act, 'expected black-market-timber-maps fixture');

  const temptation = adaptIllegalActTemptation(act, state, () => 0.5);
  const riskyOption = temptation.options.find((option) => option.risk);
  assert.ok(riskyOption);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    const resolution = applyOptionOutcome(state, riskyOption, {
      type: 'temptation',
      id: temptation.id,
      title: temptation.title,
      option: riskyOption.label,
      round: state.round,
    });

    assert.equal(resolution.riskResult.success, false);
    assert.equal(state.flags.underInvestigation, true);
    assert.equal(state.flags.ethicsInquiry, true);
    assert.equal(state.flags.auditTriggered, true);
  } finally {
    Math.random = originalRandom;
  }
});

test('temptations respect seasonal cooldowns to avoid back-to-back shortcut cards', () => {
  const state = createInitialState({
    companyName: 'Temptation Cooldown Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  state.round = 2;
  state.history.push({
    type: 'temptation',
    id: 'temptation:black-market-timber-maps',
    title: 'Forge Midnight Timber Maps',
    option: 'Take the shortcut (high risk)',
    round: 1,
    effects: { budget: 5 },
  });

  const temptation = drawSeasonalTemptation(state, () => 0);
  assert.equal(temptation, null);
});
