import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceProfessionalComplianceChain,
  createInitialState,
  getProfessionalComplianceSnapshot,
} from '../js/engine.js';
import { createPlanningJourney, createPermittingJourney } from '../js/journey/factory.js';
import { getPlanningSubmissionReadiness } from '../js/modes/planning.js';
import { getPermittingConstraintState, getPaperworkChainStageEffect } from '../js/modes/permitting.js';
import { executeDeskDay } from '../js/journey.js';

function sumPaperworkLoad(chainId, stages) {
  return stages.reduce((total, stage) => {
    const effect = getPaperworkChainStageEffect(chainId, stage);
    return total + (effect?.changes?.paperworkLoad || 0);
  }, 0);
}

test('professional compliance state is initialized with chain tracking', () => {
  const state = createInitialState({
    companyName: 'Test Outfit',
    roleId: 'planner',
    areaId: 'fort-st-john-plateau',
  });

  const snapshot = getProfessionalComplianceSnapshot(state);

  assert.equal(snapshot.registrationStatus, 'active');
  assert.ok(snapshot.registrationChain);
  assert.ok(snapshot.fomChain);
  assert.equal(snapshot.cpdTarget > 0, true);
});

test('professional compliance chains advance as paperwork moves', () => {
  const state = createInitialState({
    companyName: 'Test Outfit',
    roleId: 'permitter',
    areaId: 'fort-st-john-plateau',
  });

  const before = getProfessionalComplianceSnapshot(state);
  assert.equal(before.registrationChain.stepIndex, 0);

  advanceProfessionalComplianceChain(state, 'registration', 1);
  const after = getProfessionalComplianceSnapshot(state);

  assert.equal(after.registrationChain.stepIndex, 1);
  assert.equal(after.registrationChain.complete, false);
});

test('planning submission readiness blocks inactive registration but not a CPD gap', () => {
  const journey = createPlanningJourney({
    companyName: 'Planning Co',
    roleId: 'planner',
    areaId: 'squamish-north-shore',
  });

  journey.plan.phase = 'ministerial_approval';
  journey.plan.dataCompleteness = 80;
  journey.plan.analysisQuality = 80;
  journey.plan.stakeholderBuyIn = 75;
  journey.plan.ministerialConfidence = 80;
  journey.blockPlanning.activeBlock = { id: 'block-1', label: 'Block 1' };
  journey.blockPlanning.activeSummary = 'Block 1';
  journey.blockPlanning.fom.activeBlockId = 'block-1';
  journey.blockPlanning.fom.status = 'closed';
  journey.blockPlanning.fom.reviewDaysRemaining = 0;
  journey.blockPlanning.fom.commentLoad = 0;
  journey.blockPlanning.fom.waterGate = 'clear';
  journey.blockPlanning.fom.roadBlocker = false;
  journey.professional.registrationStatus = 'suspended';
  journey.professional.cpdHours = 0;

  const readiness = getPlanningSubmissionReadiness(journey);

  assert.equal(readiness.ready, false);
  assert.ok(readiness.reasons.some((reason) => reason.includes('registration is suspended')));
  // A CPD shortfall shows up as scrutiny and in an FPBC audit's odds, not as
  // a reason the District Manager cannot decide the file.
  assert.ok(!readiness.reasons.some((reason) => /CPD/.test(reason)));

  journey.professional.registrationStatus = 'active';
  assert.equal(getPlanningSubmissionReadiness(journey).ready, true);
});

test('permitting pressure rises when compliance exposure is high', () => {
  const baseline = createPermittingJourney({
    companyName: 'Permit Co',
    roleId: 'permitter',
    areaId: 'fort-st-john-plateau',
  });
  const pressured = createPermittingJourney({
    companyName: 'Permit Co',
    roleId: 'permitter',
    areaId: 'fort-st-john-plateau',
  });

  baseline.professional.auditExposure = 0;
  baseline.professional.competenceRisk = 0;
  baseline.professional.registrationStatus = 'active';

  pressured.professional.auditExposure = 42;
  pressured.professional.competenceRisk = 35;
  pressured.professional.registrationStatus = 'suspended';

  const baselinePressure = getPermittingConstraintState(baseline);
  const pressuredState = getPermittingConstraintState(pressured);

  assert.ok(pressuredState.overall > baselinePressure.overall);
});

test('standard desk permit work carries paperwork load forward but does not log CPD', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;

  const journey = createPermittingJourney({
    companyName: 'Permit Co',
    roleId: 'permitter',
    areaId: 'fort-st-john-plateau',
  });
  journey.hoursRemaining = 8;
  journey.permits.backlog = 2;
  journey.permits.submitted = 1;
  journey.permits.inReview = 0;

  const before = getProfessionalComplianceSnapshot(journey);
  const result = executeDeskDay(journey, 'process_permits');
  const after = getProfessionalComplianceSnapshot(journey);

  Math.random = originalRandom;

  assert.ok(result.messages.some((message) => /^Drafted (CP|RP|RUP|SUP) /.test(message)), result.messages.join(' | '));
  assert.ok(after.paperworkLoad > before.paperworkLoad);
  // CPD is logged on the professional file (Compliance Admin), not by moving files.
  assert.equal(after.cpdHours, before.cpdHours);
  assert.equal(after.cpdTarget, 8, 'the season target is the season\'s share of the FPBC year');
});

test('roadPermit and specialUse paperwork chains net negative over a full diligent cycle', () => {
  const roadPermitNet = sumPaperworkLoad('roadPermit', ['screen', 'map', 'submit', 'maintenance']);
  const specialUseNet = sumPaperworkLoad('specialUse', ['screen', 'bundle', 'submit', 'conditions']);
  const archaeologyNet = sumPaperworkLoad('archaeology', ['screen', 'field-review', 'permit-context']);

  // Previously roadPermit/specialUse netted +1 per cycle (a treadmill that
  // lost ground); a diligent full cycle must now be clearly negative, and at
  // least as good as the archaeology chain's -1-per-cycle baseline.
  assert.ok(roadPermitNet < 0, `roadPermit cycle should net negative, got ${roadPermitNet}`);
  assert.ok(specialUseNet < 0, `specialUse cycle should net negative, got ${specialUseNet}`);
  assert.ok(roadPermitNet <= archaeologyNet, 'roadPermit cycle should be at least as good as archaeology');
  assert.ok(specialUseNet <= archaeologyNet, 'specialUse cycle should be at least as good as archaeology');
  assert.equal(archaeologyNet, -1);
  assert.equal(roadPermitNet, -3);
  assert.equal(specialUseNet, -3);
});

test('registration chain relieves a flat -8 paperwork per admin click', () => {
  const effect = getPaperworkChainStageEffect('registration', 'renewal');
  assert.equal(effect.changes.paperworkLoad, -8);
});
