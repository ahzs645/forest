import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createProfessionalState,
  getAreaComplianceProfile,
  getRoleProfessionalContext,
  MINISTRY_PROCESS_HOOKS,
  MINISTRY_PROCESS_FAILURES,
  PROFESSIONAL_OBLIGATIONS
} from '../js/data/professionalPractice.js';

test('role professional context returns official obligation and paperwork hooks for permitters', () => {
  const context = getRoleProfessionalContext('permitter', {
    obligationCount: 2,
    paperworkCount: 3,
    enforcementCount: 1,
  });

  assert.ok(context.obligations.length > 0);
  assert.ok(context.paperwork.length > 0);
  assert.ok(context.enforcement.length > 0);
  assert.ok(context.breaches.length > 0);
  assert.ok(context.obligations.every((item) => item.sourceUrl.startsWith('https://')));
  assert.ok(context.paperwork.some((item) => item.title.includes('Road Permit') || item.title.includes('Forest Operations Map')));
  assert.ok(context.paperwork.every((item) => Array.isArray(item.documents) && item.documents.length > 0));
});

test('professional practice datasets stay role-addressable and source-backed', () => {
  assert.ok(PROFESSIONAL_OBLIGATIONS.some((item) => item.roles.includes('recce')));
  assert.ok(MINISTRY_PROCESS_HOOKS.every((item) => typeof item.sourceUrl === 'string' && item.sourceUrl.startsWith('https://')));
  assert.ok(MINISTRY_PROCESS_FAILURES.some((item) => item.id === 'riparian-misclassification'));
});

test('area compliance profiles feed burden-aware role context and starting state', () => {
  const profile = getAreaComplianceProfile('skeena-nass');
  const context = getRoleProfessionalContext('permitter', { areaId: 'skeena-nass' });
  const state = createProfessionalState('permitter', 'skeena-nass');

  assert.equal(profile?.title, 'Fish-Crossing, Karst, and Wet-Ground Burden');
  assert.ok(context.areaBurden);
  assert.ok(context.chains.some((chain) => chain.id === 'road-authority-chain'));
  assert.ok(state.paperworkLoad > 20);
  assert.ok(state.areaWatchouts.length > 0);
});
