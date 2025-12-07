#!/usr/bin/env node

import {
  FORESTER_ROLES,
  OPERATING_AREAS,
} from './js/data/index.js';
import {
  createInitialState,
  getRoleTasks,
  applyEffects,
  applySeasonDecay,
  drawIssue,
  buildSummary,
} from './js/engine.js';

const rounds = 4;

function chooseOption(options) {
  return options.reduce((best, option) => {
    const score = scoreOption(option.effects || {});
    if (!best || score > best.score) {
      return { option, score };
    }
    return best;
  }, null).option;
}

function scoreOption(effects) {
  const weights = {
    progress: 1,
    forestHealth: 1.2,
    relationships: 1.1,
    compliance: 1.3,
    budget: 0.8,
  };
  return Object.entries(effects).reduce((total, [key, value]) => total + (weights[key] || 0.5) * value, 0);
}

function makeRng(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

const results = [];
let seed = 42;

for (const role of FORESTER_ROLES) {
  for (const area of OPERATING_AREAS) {
    const state = createInitialState({ companyName: `${role.id}-${area.id}`, roleId: role.id, areaId: area.id });
    state.totalRounds = rounds;
    const rng = makeRng(seed++);

    for (let round = 1; round <= rounds; round++) {
      state.round = round;
      applySeasonDecay(state);
      const tasks = getRoleTasks(state);
      for (const task of tasks) {
        const option = chooseOption(task.options);
        applyEffects(state, option.effects, {
          type: 'task',
          id: task.id,
          title: task.title,
          option: option.label,
          round,
        });
      }
      const issue = drawIssue(state, rng);
      if (issue) {
        const option = chooseOption(issue.options);
        applyEffects(state, option.effects, {
          type: 'issue',
          id: issue.id,
          title: issue.title,
          option: option.label,
          round,
        });
      }
    }

    const summary = buildSummary(state);
    results.push({
      role: role.id,
      area: area.id,
      summary: summary.overall,
      progress: Math.round(state.metrics.progress),
      forestHealth: Math.round(state.metrics.forestHealth),
      relationships: Math.round(state.metrics.relationships),
      compliance: Math.round(state.metrics.compliance),
      budget: Math.round(state.metrics.budget),
      notes: summary.messages.join(' | '),
    });
  }
}

console.table(results, ['role', 'area', 'progress', 'forestHealth', 'relationships', 'compliance', 'budget']);

if (process.argv.includes('--verbose')) {
  for (const result of results) {
    console.log(`\n${result.role} in ${result.area}: ${result.summary}`);
    console.log(`Metrics -> Progress ${result.progress}, Forest ${result.forestHealth}, Relationships ${result.relationships}, Compliance ${result.compliance}, Budget ${result.budget}`);
  }
}
