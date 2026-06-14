import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptOperationalEvent,
  adaptIllegalActTemptation,
  adaptOperationalEventEffects,
  applyOptionOutcome,
  createInitialState,
  drawIssue,
  drawSeasonalEvent,
  drawSeasonalTemptation,
} from '../js/engine.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { ILLEGAL_ACTS } from '../js/data/illegalActs.js';
import { ISSUE_LIBRARY } from '../js/data/issues.js';
import {
  listTerminologyGuardrailViolations,
  matchesPreconditions,
  validateSeasonalCardContract,
} from '../js/engine/seasonalContract.js';

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

  assert.equal(state.pendingEvents.length, 1);
  assert.equal(state.pendingEvents[0].id, 'audit_followup');
  assert.equal(state.pendingEvents[0].delay, 1);
  // Provenance stamp connects the delayed event to the decision that scheduled it.
  assert.equal(state.pendingEvents[0].causedBy?.option, 'Ask to reschedule');
  assert.equal(state.pendingEvents[0].causedBy?.sourceId, 'surprise_audit');

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

test('transcript-hit desk and field events are rewritten into concrete, plain-language prompts', () => {
  const deskState = createInitialState({
    companyName: 'Desk Rewrite Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  deskState.round = 2;

  const transcriptDeskIds = [
    'angry_stakeholder',
    'community_complaint',
    'system_crash',
    'gis_data_corrupted',
    'team_conflict',
    'partnership_offer',
    'archaeology_screening_gap',
  ];

  for (const eventId of transcriptDeskIds) {
    const source = DESK_EVENTS.find((entry) => entry.id === eventId);
    assert.ok(source, `expected ${eventId} desk event fixture`);

    const adapted = adaptOperationalEvent(source, deskState);
    const violations = validateSeasonalCardContract(adapted);
    assert.deepEqual(violations, [], `contract violations for ${eventId}: ${violations.join(', ')}`);
    assert.deepEqual(
      listTerminologyGuardrailViolations(adapted),
      [],
      `terminology guardrails tripped for ${eventId}`,
    );
    assert.ok(adapted.context?.stakes, `expected stakes copy for ${eventId}`);
  }

  const communityComplaint = adaptOperationalEvent(
    DESK_EVENTS.find((entry) => entry.id === 'community_complaint'),
    deskState,
  );
  assert.match(communityComplaint.description, /written complaint/i);
  assert.ok(
    communityComplaint.options.every((option) => !/town hall/i.test(option.label)),
    'community complaint should not offer a town hall default',
  );

  const systemCrash = adaptOperationalEvent(
    DESK_EVENTS.find((entry) => entry.id === 'system_crash'),
    deskState,
  );
  assert.match(systemCrash.description, /traceable fallback/i);
  assert.ok(
    systemCrash.options.every((option) => !/send everyone home/i.test(option.label)),
    'system crash should not default to sending everyone home',
  );

  const corrupted = adaptOperationalEvent(
    DESK_EVENTS.find((entry) => entry.id === 'gis_data_corrupted'),
    deskState,
  );
  assert.match(corrupted.description, /field notes alone are not a defensible rebuild/i);
  assert.ok(
    corrupted.options.some((option) => /send crews back/i.test(option.label)),
    'GIS corruption should support recollecting defensible data',
  );

  const fieldState = createInitialState({
    companyName: 'Field Rewrite Test',
    roleId: 'recce',
    areaId: 'muskwa-foothills',
  });
  fieldState.round = 2;

  const stuckTruck = adaptOperationalEvent(
    FIELD_EVENTS.find((entry) => entry.id === 'truck_stuck'),
    fieldState,
  );
  assert.deepEqual(validateSeasonalCardContract(stuckTruck), []);
  assert.deepEqual(listTerminologyGuardrailViolations(stuckTruck), []);
  assert.match(stuckTruck.description, /realistic recovery plan/i);
  assert.ok(
    stuckTruck.options.every((option) => !/skidder/i.test(option.label)),
    'truck recovery should not assume a skidder appears by magic',
  );
});

test('seasonal selector suppresses silviculture issue prompts when the stage or stand age is incompatible', () => {
  const state = createInitialState({
    companyName: 'Silviculture Preconditions Test',
    roleId: 'silviculture',
    areaId: 'fraser-plateau',
  });
  state.round = 2;

  const blockedIssueIds = [
    'seedlot-vigour-drop',
    'free-growing-catchup-plan',
    'snow-press-browse-signal',
  ];

  for (const issueId of blockedIssueIds) {
    const source = ISSUE_LIBRARY.find((entry) => entry.id === issueId);
    assert.ok(source, `expected ${issueId} fixture`);
    assert.equal(matchesPreconditions(source, state), false, `${issueId} should not match summer brush state`);

    state.pendingIssues = [{ id: issueId, delay: 0 }];
    const surfaced = drawIssue(state, () => 0);
    assert.notEqual(surfaced?.id, issueId, `${issueId} should be suppressed when the stage is incompatible`);
    assert.deepEqual(state.pendingIssues, [], `${issueId} should be cleared after suppression`);
  }
});

test('winter silviculture review issues only surface with explicit desk-based framing', () => {
  const state = createInitialState({
    companyName: 'Winter Review Framing Test',
    roleId: 'silviculture',
    areaId: 'fraser-plateau',
  });
  state.round = 4;
  state.pendingIssues = [{ id: 'snow-press-browse-signal', delay: 0 }];

  const issue = drawIssue(state, () => 0);
  assert.equal(issue?.id, 'snow-press-browse-signal');
  assert.equal(issue?.operationState?.stage, 'inspection');
  assert.match(issue?.context?.operation || '', /winter regeneration review/i);
  assert.match(issue?.context?.operation || '', /not a full free-growing survey/i);
});

test('breakup-driven seasonal cards keep a conservative option that stands work down or rebuilds the plan', () => {
  const scenarios = [
    {
      roleId: 'permitter',
      areaId: 'fort-st-john-plateau',
      round: 1,
      issueId: 'exhibit-a-redline-return',
    },
    {
      roleId: 'recce',
      areaId: 'muskwa-foothills',
      round: 1,
      issueId: 'thaw-ravine-realignment',
    },
  ];

  for (const scenario of scenarios) {
    const state = createInitialState({
      companyName: `Breakup Guardrail ${scenario.issueId}`,
      roleId: scenario.roleId,
      areaId: scenario.areaId,
    });
    state.round = scenario.round;
    state.pendingIssues = [{ id: scenario.issueId, delay: 0 }];

    const issue = drawIssue(state, () => 0);
    assert.ok(issue, `expected ${scenario.issueId} to surface`);
    assert.ok(
      issue.options.some((option) => /stop|pause|rebuild|reroute|trim|refly|bring in/i.test(option.label)),
      `${scenario.issueId} should keep a conservative breakup response`,
    );
  }
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

test('failed temptation shortcuts raise targeted scrutiny flags', () => {
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
    assert.equal(state.flags.auditTriggered, true);
    assert.equal(state.flags.underInvestigation, undefined);
    assert.equal(state.flags.ethicsInquiry, undefined);
  } finally {
    Math.random = originalRandom;
  }
});

test('bureaucratic shortcut failures queue specific bureaucratic fallout issues', () => {
  const state = createInitialState({
    companyName: 'Bureaucratic Fallout Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  state.round = 3;

  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'black-market-timber-maps');
  const temptation = adaptIllegalActTemptation(act, state, () => 0.5);
  const riskyOption = temptation.options.find((option) => option.risk);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  let resolution;
  try {
    resolution = applyOptionOutcome(state, riskyOption, {
      type: 'temptation',
      id: temptation.id,
      title: temptation.title,
      option: riskyOption.label,
      round: state.round,
    });
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(state.pendingIssues.length, 1);
  assert.equal(state.pendingIssues[0].force, true);
  assert.deepEqual(
    state.pendingIssues[0].candidates.map((candidate) => candidate.id),
    ['ministry-data-audit', 'fpbc-competence-audit']
  );
  assert.equal(state.flags.auditTriggered, true);
  assert.equal(state.flags.ethicsInquiry, undefined);
  assert.equal(resolution?.scheduledIssueTeaser?.severity, 'warning');
  assert.match(resolution?.scheduledIssueTeaser?.text || '', /Likely fallout \(manageable\): Ministry Data Audit/i);
  assert.match(resolution?.scheduledIssueTeaser?.text || '', /schedule strain/i);

  const issue = drawIssue(state, () => 0);
  assert.equal(issue?.id, 'ministry-data-audit');
  assert.match(issue?.surfaceReason || '', /schedule strain/i);
  assert.deepEqual(state.pendingIssues, []);
});

test('ecological shortcut failures queue specific ecological fallout issues', () => {
  const state = createInitialState({
    companyName: 'Ecological Fallout Test',
    roleId: 'silviculture',
    areaId: 'muskwa-foothills',
  });
  state.round = 3;

  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'slash-burn-party');
  const temptation = adaptIllegalActTemptation(act, state, () => 0.5);
  const riskyOption = temptation.options.find((option) => option.risk);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  let resolution;
  try {
    resolution = applyOptionOutcome(state, riskyOption, {
      type: 'temptation',
      id: temptation.id,
      title: temptation.title,
      option: riskyOption.label,
      round: state.round,
    });
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(state.pendingIssues.length, 1);
  const pending = state.pendingIssues[0];
  assert.equal(pending.delay, 1);
  assert.equal(pending.force, true);
  assert.deepEqual(pending.candidates, [{ id: 'environmental-audit-fallout', weight: 4, force: true, metricBoosts: { forestHealth: 3, compliance: 2 } }]);
  // Provenance stamp ties the delayed fallout to the shortcut that scheduled it.
  assert.equal(pending.causedBy?.sourceType, 'temptation');
  assert.equal(pending.causedBy?.option, riskyOption.label);
  assert.equal(state.flags.environmentalAudit, true);
  assert.equal(state.flags.underInvestigation, undefined);
  assert.equal(resolution?.scheduledIssueTeaser?.severity, 'warning');
  assert.match(resolution?.scheduledIssueTeaser?.text || '', /Likely fallout \(manageable\): Environmental Audit Fallout/i);
  assert.match(resolution?.scheduledIssueTeaser?.text || '', /ecological stress/i);

  const issue = drawIssue(state, () => 0);
  assert.equal(issue?.id, 'environmental-audit-fallout');
  assert.match(issue?.surfaceReason || '', /ecological stress/i);
  assert.deepEqual(state.pendingIssues, []);
});

test('mixed fallout bundles shift toward the dominant pressure at draw time', () => {
  const pressureLowTrust = createInitialState({
    companyName: 'Low Trust Fallout Test',
    roleId: 'permitter',
    areaId: 'bulkley-valley',
  });
  pressureLowTrust.round = 1;
  pressureLowTrust.metrics.relationships = 20;

  const pressureLowBudget = createInitialState({
    companyName: 'Low Budget Fallout Test',
    roleId: 'permitter',
    areaId: 'bulkley-valley',
  });
  pressureLowBudget.round = 1;
  pressureLowBudget.metrics.budget = 20;
  pressureLowBudget.metrics.compliance = 20;
  pressureLowBudget.metrics.relationships = 80;

  const trustAct = ILLEGAL_ACTS.find((entry) => entry.id === 'courtesy-flag-bribes');
  const budgetAct = ILLEGAL_ACTS.find((entry) => entry.id === 'hushmail-bid-rigging');
  const trustTemptation = adaptIllegalActTemptation(trustAct, pressureLowTrust, () => 0.5);
  const budgetTemptation = adaptIllegalActTemptation(budgetAct, pressureLowBudget, () => 0.5);
  const trustRisk = trustTemptation.options.find((option) => option.risk);
  const budgetRisk = budgetTemptation.options.find((option) => option.risk);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    applyOptionOutcome(pressureLowTrust, trustRisk, {
      type: 'temptation',
      id: trustTemptation.id,
      title: trustTemptation.title,
      option: trustRisk.label,
      round: pressureLowTrust.round,
    });
    applyOptionOutcome(pressureLowBudget, budgetRisk, {
      type: 'temptation',
      id: budgetTemptation.id,
      title: budgetTemptation.title,
      option: budgetRisk.label,
      round: pressureLowBudget.round,
    });
  } finally {
    Math.random = originalRandom;
  }

  const trustIssue = drawIssue(pressureLowTrust, () => 0);
  const budgetIssue = drawIssue(pressureLowBudget, () => 0);

  assert.equal(trustIssue?.id, 'heritage-protocol-gap');
  assert.match(trustIssue?.surfaceReason || '', /relationship damage/i);
  assert.equal(budgetIssue?.id, 'budget-freeze');
  assert.match(budgetIssue?.surfaceReason || '', /budget stress/i);
});

test('serious fallout previews stay marked as danger when formal investigation is likely', () => {
  const state = createInitialState({
    companyName: 'Serious Fallout Test',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  state.round = 1;
  state.metrics.compliance = 20;

  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'trespass-lidar-raid');
  const temptation = adaptIllegalActTemptation(act, state, () => 0.5);
  const riskyOption = temptation.options.find((option) => option.risk);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  let resolution;
  try {
    resolution = applyOptionOutcome(state, riskyOption, {
      type: 'temptation',
      id: temptation.id,
      title: temptation.title,
      option: riskyOption.label,
      round: state.round,
    });
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(resolution?.scheduledIssueTeaser?.severity, 'danger');
  assert.match(resolution?.scheduledIssueTeaser?.text || '', /Likely fallout \(serious\): Formal Investigation/i);
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
