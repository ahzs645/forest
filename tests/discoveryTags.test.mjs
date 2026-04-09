import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAreaSituationForJourney,
  getAreaSituationMultipliers
} from '../js/data/areaSituations.js';
import {
  getDiscoveryEventTypeMultipliers,
  getDiscoveryTagNotes,
  inferDiscoveryTagsFromAccess,
  upsertDiscoveryTag
} from '../js/data/discoveryTags.js';

test('discovery tags accumulate and expose role notes plus event multipliers', () => {
  const journey = {
    day: 6,
    areaId: 'skeena-nass',
    discoveryTags: []
  };

  upsertDiscoveryTag(journey, 'watershed_watch', {
    source: 'access:block-1',
    severity: 2
  });
  upsertDiscoveryTag(journey, 'watershed_watch', {
    source: 'event:community_watershed_red_flag',
    severity: 3
  });

  assert.equal(journey.discoveryTags.length, 1);
  assert.equal(journey.discoveryTags[0].count, 2);
  assert.equal(journey.discoveryTags[0].severity, 3);

  const notes = getDiscoveryTagNotes(journey, 'permitter', 1);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /hydrology|water|defensible/i);

  const multipliers = getDiscoveryEventTypeMultipliers(journey, 'desk');
  assert.ok(multipliers.technical > 1);
  assert.ok(multipliers.compliance > 1);
});

test('access observations infer persistent tags across water, cultural, visibility, and access issues', () => {
  const tagIds = inferDiscoveryTagsFromAccess(
    {
      features: ['community_water', 'cultural_site', 'visual_quality_zone'],
      hazards: ['river_crossing']
    },
    { id: 'no_go' },
    { id: 'clear' }
  );

  assert.ok(tagIds.includes('access_rehab'));
  assert.ok(tagIds.includes('watershed_watch'));
  assert.ok(tagIds.includes('cultural_hold'));
  assert.ok(tagIds.includes('community_visibility'));
});

test('area situations match the current zone and season', () => {
  const journey = {
    area: {
      becCode: 'SBSwk1',
      tags: ['sbs', 'wildfire', 'beetle-recovery', 'evac-route']
    },
    season: {
      currentSeason: 'summer'
    }
  };

  const situation = getAreaSituationForJourney(journey);
  assert.equal(situation?.id, 'fraser_smoke_push');

  const multipliers = getAreaSituationMultipliers(journey, 'desk');
  assert.ok(multipliers.eventMultiplier > 1);
  assert.ok(multipliers.typeMultipliers.political > 1);
});
