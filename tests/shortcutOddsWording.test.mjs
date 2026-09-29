import test from 'node:test';
import assert from 'node:assert/strict';

import { ILLEGAL_ACTS } from '../js/data/illegalActs.js';
import { actMatchesTemptationContext, buildShortcutOption } from '../js/events/selection.js';
import { createJourney } from '../js/journey.js';

// The desk "better odds" reason reads the district's goodwill on this file,
// which a campaign desk opens near 78 whatever the year's Relationships meter
// says. It used to read "people you deal with rate you" at Relationships 19.
test('the goodwill odds reason names the goodwill it read, and its value', () => {
  const journey = createJourney({ roleId: 'permitter', areaId: 'fort-st-john-plateau' });
  journey.day = 5;
  const act = ILLEGAL_ACTS.find((entry) => actMatchesTemptationContext(entry, journey));
  assert.ok(act, 'a permitting desk has a shortcut on offer');

  journey.resources.politicalCapital = 78;
  const rated = buildShortcutOption(act, journey);
  const reason = rated.oddsShifts.better.find((line) => /goodwill/.test(line));
  assert.equal(reason, "the district office's goodwill on this file is 78");
  assert.ok(!rated.oddsShifts.better.some((line) => /rate you/.test(line)));

  journey.resources.politicalCapital = 40;
  const cool = buildShortcutOption(act, journey);
  assert.ok(!cool.oddsShifts.better.some((line) => /goodwill/.test(line)), 'below the line, no goodwill reason');
});
