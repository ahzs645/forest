import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getMinistryProcessHook,
  getRoleMinistryProcessHooks,
  getRoleProcessFailureCatalog,
  MINISTRY_PROCESS_FAILURES,
  MINISTRY_PROCESS_HOOKS,
} from '../js/data/ministryProcessHooks.js';

test('ministry process hooks stay document-backed and source-backed', () => {
  assert.ok(MINISTRY_PROCESS_HOOKS.length >= 10);
  assert.ok(MINISTRY_PROCESS_HOOKS.every((hook) => typeof hook.trigger === 'string' && hook.trigger.length > 0));
  assert.ok(MINISTRY_PROCESS_HOOKS.every((hook) => Array.isArray(hook.documents) && hook.documents.length > 0));
  assert.ok(MINISTRY_PROCESS_HOOKS.every((hook) => Array.isArray(hook.playerActions) && hook.playerActions.length > 0));
  assert.ok(MINISTRY_PROCESS_HOOKS.every((hook) => Array.isArray(hook.failureModes) && hook.failureModes.length > 0));
  assert.ok(MINISTRY_PROCESS_HOOKS.every((hook) => Array.isArray(hook.sourceUrls) && hook.sourceUrls.every((url) => url.startsWith('https://'))));
});

test('role filters expose relevant hooks and failure catalog entries', () => {
  const permitterHooks = getRoleMinistryProcessHooks('permitter', { limit: 4 });
  const recceFailures = getRoleProcessFailureCatalog('recce');
  const hook = getMinistryProcessHook('fom-notice-cycle');

  assert.equal(permitterHooks.length, 4);
  assert.ok(permitterHooks.some((item) => item.id === 'fom-notice-cycle'));
  assert.ok(recceFailures.some((item) => item.processHookId === 'archaeology-screening-ladder'));
  assert.equal(hook?.minimumWait?.days, 30);
  assert.ok(MINISTRY_PROCESS_FAILURES.some((item) => item.id === 'special-use-occupancy-gap'));
});
