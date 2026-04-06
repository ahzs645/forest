#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { FORESTER_ROLES, OPERATING_AREAS } from '../js/data/index.js';
import { createJourney } from '../js/journey.js';
import { runPlanningDay } from '../js/modes/planning.js';
import { runPermittingDay } from '../js/modes/permitting.js';
import { runReconDay } from '../js/modes/recon.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';
import { checkEndConditions } from '../js/modes/shared/endConditions.js';

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1] ?? fallback;
};

const runCount = Math.max(1, parseInt(getArg('--runs', '25'), 10) || 25);
const strategy = getArg('--strategy', 'balanced');
const roleFilter = getArg('--role');
const difficultyFilter = getArg('--difficulty');
const jsonOut = getArg('--json');
const markdownOut = getArg('--markdown');
const seedBase = parseInt(getArg('--seed-base', '7000'), 10) || 7000;

const DIFFICULTIES = [
  { name: 'easy' },
  { name: 'normal' },
  { name: 'hard' }
];

const IGNORED_LABEL_PREFIXES = [
  'Continue',
  'Continue working',
  'Start next day',
  'Press any key',
  'INITIALIZE',
  'DEPLOY'
];

function makeRng(seed) {
  let value = seed % 2147483647;
  if (value <= 0) {
    value += 2147483646;
  }
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function applyDifficultyMultipliers(journey, difficulty) {
  if (difficulty === 'normal') return;

  const resourceMult = difficulty === 'easy' ? 1.3 : 0.8;
  const excludedKeys = new Set();
  if (journey.journeyType === 'silviculture') {
    excludedKeys.add('seedlings');
  }

  for (const key of Object.keys(journey.resources || {})) {
    if (!excludedKeys.has(key) && typeof journey.resources[key] === 'number') {
      journey.resources[key] = Math.round(journey.resources[key] * resourceMult);
    }
  }

  if (journey.journeyType === 'planning' && Number.isFinite(journey.deadline)) {
    journey.deadline += difficulty === 'easy' ? 2 : -1;
  }
}

function normalizeWhitespace(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeChoiceLabel(label = '') {
  const cleaned = normalizeWhitespace(label)
    .replace(/\s+\([^)]*\)/g, '')
    .replace(/\s+via\s+\w+$/i, '')
    .replace(/\s+\[[^\]]*\]$/g, '');

  const patterns = [
    'Cautious Recon',
    'Standard Recon',
    'Extended Recon',
    'Max Effort',
    'Forage & Hunt',
    'Maintenance',
    'Scout Ahead',
    'Triage',
    'Resupply',
    'Rest & End Shift',
    'Safe Detour',
    'Stay Mainline',
    'Risky Shortcut',
    'Keep Full Rations',
    'Short Rations and Push On',
    'Hunt & Forage Before Moving',
    'Gather Data',
    'Run Analysis',
    'Stakeholder Session',
    'Prepare Submission',
    'Values Workshop',
    'Timber Assessment',
    'Check Email',
    'Network',
    'Take a Break',
    'End Day',
    'End Day Early',
    'Draft Permit Application',
    'Submit Permit',
    'Address Revisions',
    'Follow Up on Referrals',
    'Process Permits',
    'Stakeholder Meeting',
    'Handle Crisis',
    'Team Building',
    'Deploy Planting Crew',
    'Herbicide Application',
    'Conduct Survey',
    'Site Inspection',
    'Contractor Meeting',
    'Team Briefing',
    'Balanced Approach',
    'Emphasize Biodiversity',
    'Emphasize Timber Supply',
    'Emphasize Community',
    'Emphasize First Nations'
  ];

  for (const pattern of patterns) {
    if (cleaned.startsWith(pattern)) {
      return pattern;
    }
  }

  return cleaned;
}

function shouldIgnoreChoice(label) {
  return IGNORED_LABEL_PREFIXES.some((prefix) => normalizeWhitespace(label).startsWith(prefix));
}

function getRoleAliases(member = {}) {
  const aliases = [
    member.role,
    member.roleId,
    member.roleName
  ]
    .filter(Boolean)
    .map((value) => normalizeWhitespace(String(value)).toLowerCase());

  return [...new Set(aliases)];
}

function getRequiredRole(description = '') {
  const match = normalizeWhitespace(description).match(/Requires\s+([^|\]]+)/i);
  return match ? match[1].trim().toLowerCase() : null;
}

function hasRequiredRole(journey, requiredRole) {
  if (!requiredRole) return true;

  return (journey?.crew || []).some((member) => {
    if (!member?.isActive) return false;
    return getRoleAliases(member).some((alias) => alias.includes(requiredRole) || requiredRole.includes(alias));
  });
}

function filterAvailableOptions(options, journey) {
  const available = options.filter((option) => hasRequiredRole(journey, getRequiredRole(option.description)));
  return available.length ? available : options;
}

function classifyPrompt(question = '', options = []) {
  const normalizedQuestion = normalizeWhitespace(question);
  const labels = options.map((option) => normalizeWhitespace(option.label));

  if (!normalizedQuestion && labels.every((label) => shouldIgnoreChoice(label))) {
    return 'continue';
  }

  if (normalizedQuestion.includes('What do you do?')) return 'event';
  if (normalizedQuestion.includes('Choose values focus')) return 'values';
  if (normalizedQuestion.includes('Select active block focus')) return 'block_focus';
  if (normalizedQuestion.includes('Treat who?')) return 'triage';
  if (normalizedQuestion.includes('How do you handle maintenance?')) return 'maintenance';
  if (normalizedQuestion.includes('Buy supplies')) return 'resupply';

  if (/(\d+)h remaining:$/i.test(normalizedQuestion) || /(\d+)\s+hours remaining:$/i.test(normalizedQuestion)) {
    return 'action';
  }

  if (labels.some((label) => label.includes('Safe Detour')) || labels.some((label) => label.includes('Risky Shortcut'))) {
    return 'route';
  }

  if (labels.some((label) => label.includes('Keep Full Rations')) || labels.some((label) => label.includes('Short Rations and Push On'))) {
    return 'rationing';
  }

  return 'other';
}

function parseHintScore(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return 0;

  let score = 0;
  const plusPermits = normalized.match(/\+(\d+)\s+permits?/i);
  if (plusPermits) score += Number(plusPermits[1]) * 8;

  const progress = normalized.match(/([+-]\d+)\s+progress/i);
  if (progress) score += Number(progress[1]) * 1.5;

  const budget = normalized.match(/([+-])\$(\d+)(k)?/i);
  if (budget) {
    const amount = Number(budget[2]) * (budget[3] ? 1000 : 1);
    score += budget[1] === '+' ? amount / 500 : -(amount / 600);
  }

  const time = normalized.match(/-(\d+)h/i);
  if (time) score -= Number(time[1]) * 1.25;

  const injuryRisk = normalized.match(/(\d+)% injury risk/i);
  if (injuryRisk) score -= Number(injuryRisk[1]) / 6;

  const morale = normalized.match(/([+-]\d+)\s+morale/i);
  if (morale) score += Number(morale[1]) * 0.4;

  const health = normalized.match(/([+-]\d+)\s+health/i);
  if (health) score += Number(health[1]) * 0.8;

  const relations = normalized.match(/([+-]\d+)\s+relations/i);
  if (relations) score += Number(relations[1]) * 1.2;

  const compliance = normalized.match(/([+-]\d+)\s+compliance/i);
  if (compliance) score += Number(compliance[1]) * 1.35;

  const capital = normalized.match(/([+-]\d+)\s+capital/i);
  if (capital) score += Number(capital[1]) * 1.6;

  const fuel = normalized.match(/([+-]\d+)\s+fuel/i);
  if (fuel) score += Number(fuel[1]) * 0.7;

  if (normalized.includes('Safe choice')) score += 1;
  return score;
}

function findFirstMatching(options, priorities) {
  for (const priority of priorities) {
    const option = options.find((candidate) => normalizeWhitespace(candidate.label).includes(priority));
    if (option) {
      return option;
    }
  }
  return options[0];
}

function pickEventOption(options, direction) {
  const ranked = [...options].map((option, index) => ({
    option,
    index,
    score: parseHintScore(option.description || '')
  }));
  ranked.sort((left, right) => direction === 'high' ? right.score - left.score : left.score - right.score);
  return ranked[0]?.option || options[0];
}

function chooseBalancedOption(question, options, journey) {
  const labels = options.map((option) => normalizeWhitespace(option.label));

  if (labels.length === 1) {
    return options[0];
  }

  if (question.includes('What do you do?')) {
    return pickEventOption(options, 'high');
  }

  if (question.includes('Choose values focus')) {
    const values = journey.values || {};
    const lowest = Object.entries({
      bio: values.biodiversity,
      timber_v: values.timberSupply,
      community: values.communityNeeds,
      fn: values.firstNationsValues
    }).sort((left, right) => left[1] - right[1])[0]?.[0];

    if (Object.values(values).some((value) => value < 25)) {
      const mapping = {
        bio: 'Emphasize Biodiversity',
        timber_v: 'Emphasize Timber Supply',
        community: 'Emphasize Community',
        fn: 'Emphasize First Nations'
      };
      return findFirstMatching(options, [mapping[lowest], 'Balanced Approach']);
    }

    return findFirstMatching(options, ['Balanced Approach', 'Emphasize First Nations', 'Emphasize Biodiversity']);
  }

  if (question.includes('Select active block focus')) {
    const scored = options.map((option) => {
      const numbers = [...(option.description || '').matchAll(/(Timber|Eco|FN)\s+(\d+)/g)];
      const values = numbers.map((match) => Number(match[2]));
      const total = values.reduce((sum, value) => sum + value, 0);
      const spread = values.length ? Math.max(...values) - Math.min(...values) : 100;
      return { option, score: total - spread };
    });
    scored.sort((left, right) => right.score - left.score);
    return scored[0]?.option || options[0];
  }

  if (labels.some((label) => label.includes('% HP'))) {
    return [...options]
      .map((option) => {
        const hp = Number(option.label.match(/\((\d+)% HP/)?.[1] || 100);
        return { option, hp };
      })
      .sort((left, right) => left.hp - right.hp)[0]?.option || options[0];
  }

  if (labels.some((label) => label.includes('Safe Detour')) || labels.some((label) => label.includes('Risky Shortcut'))) {
    const injuredCount = journey.crew?.filter((member) => member.isActive && (member.health < 70 || (member.statusEffects?.length || 0) > 0)).length || 0;
    if ((journey.resources?.fuel || 0) < 20 || (journey.resources?.equipment || 0) < 40) {
      return findFirstMatching(options, ['Risky Shortcut', 'Stay Mainline', 'Safe Detour']);
    }
    if (injuredCount > 0) {
      return findFirstMatching(options, ['Safe Detour', 'Stay Mainline', 'Risky Shortcut']);
    }
    return findFirstMatching(options, ['Stay Mainline', 'Safe Detour', 'Risky Shortcut']);
  }

  if (labels.some((label) => label.includes('Keep Full Rations')) || labels.some((label) => label.includes('Short Rations and Push On'))) {
    if ((journey.resources?.food || 0) <= 10) {
      return findFirstMatching(options, ['Hunt & Forage Before Moving', 'Keep Full Rations', 'Short Rations and Push On']);
    }
    return findFirstMatching(options, ['Keep Full Rations', 'Hunt & Forage Before Moving', 'Short Rations and Push On']);
  }

  if (labels.some((label) => label.includes('Rations Crate')) || labels.some((label) => label.includes('Fuel Drum'))) {
    if ((journey.resources?.food || 0) <= 18) {
      return findFirstMatching(options, ['Rations Crate', 'Fuel Drum', 'Field Repair', 'First Aid Kit', 'Done']);
    }
    if ((journey.resources?.fuel || 0) <= 30) {
      return findFirstMatching(options, ['Fuel Drum', 'Rations Crate', 'Field Repair', 'First Aid Kit', 'Done']);
    }
    if ((journey.resources?.equipment || 0) <= 45) {
      return findFirstMatching(options, ['Field Repair', 'Fuel Drum', 'Rations Crate', 'First Aid Kit', 'Done']);
    }
    if ((journey.resources?.firstAid || 0) <= 2) {
      return findFirstMatching(options, ['First Aid Kit', 'Rations Crate', 'Fuel Drum', 'Field Repair', 'Done']);
    }
    return findFirstMatching(options, ['Done']);
  }

  switch (journey.journeyType) {
    case 'planning': {
      const phase = journey.plan?.phase;
      if (journey.resources?.politicalCapital <= 12) {
        return findFirstMatching(options, ['Network', 'Take a Break', 'Check Email', 'End Day']);
      }
      if ((journey.protagonist?.stress || 0) >= 75 || (journey.protagonist?.energy || 100) <= 20) {
        return findFirstMatching(options, ['Take a Break', 'Network', 'Check Email', 'End Day']);
      }
      if (phase === 'data_gathering') {
        return findFirstMatching(options, ['Gather Data', 'Values Workshop', 'Network', 'Check Email', 'End Day']);
      }
      if (phase === 'analysis') {
        return findFirstMatching(options, ['Run Analysis', 'Values Workshop', 'Network', 'Check Email', 'End Day']);
      }
      if (phase === 'stakeholder_review') {
        return findFirstMatching(options, ['Stakeholder Session', 'Balanced Approach', 'Values Workshop', 'Network', 'Check Email', 'End Day']);
      }
      if (phase === 'ministerial_approval') {
        return findFirstMatching(options, ['Prepare Submission', 'Balanced Approach', 'Network', 'Check Email', 'End Day']);
      }
      break;
    }

    case 'permitting':
      if ((journey.protagonist?.stress || 0) >= 92 || (journey.protagonist?.energy || 100) <= 8) {
        return findFirstMatching(options, ['Take a Break', 'Address Revisions', 'Process Permits', 'End Day Early']);
      }
      if (journey.permits?.needsRevision > 0) {
        return findFirstMatching(options, ['Address Revisions', 'Follow Up on Referrals', 'Submit Permit', 'Draft Permit Application', 'Process Permits', 'Stakeholder Meeting', 'Team Building', 'Take a Break', 'End Day Early']);
      }
      if ((journey.permits?.inReferral || 0) > 0) {
        return findFirstMatching(options, ['Follow Up on Referrals', 'Address Revisions', 'Submit Permit', 'Draft Permit Application', 'Process Permits', 'Stakeholder Meeting', 'Team Building', 'Take a Break', 'End Day Early']);
      }
      if ((journey.permits?.drafting || 0) > 0) {
        return findFirstMatching(options, ['Submit Permit', 'Address Revisions', 'Draft Permit Application', 'Process Permits', 'Stakeholder Meeting', 'Team Building', 'Take a Break', 'End Day Early']);
      }
      if ((journey.permits?.backlog || 0) > 0) {
        return findFirstMatching(options, ['Draft Permit Application', 'Address Revisions', 'Process Permits', 'Stakeholder Meeting', 'Team Building', 'Take a Break', 'End Day Early']);
      }
      return findFirstMatching(options, ['Process Permits', 'Stakeholder Meeting', 'Team Building', 'Take a Break', 'End Day Early']);

    case 'recon': {
      const food = journey.resources?.food || 0;
      const fuel = journey.resources?.fuel || 0;
      const equipment = journey.resources?.equipment || 0;
      const meds = journey.resources?.firstAid || 0;
      const injuredCount = journey.crew?.filter((member) => member.isActive && (member.health < 70 || (member.statusEffects?.length || 0) > 0)).length || 0;

      if (food <= 12) {
        return findFirstMatching(options, ['Resupply', 'Forage & Hunt', 'Standard Recon', 'Cautious Recon', 'Rest & End Shift']);
      }
      if (fuel <= 25 || equipment <= 35) {
        return findFirstMatching(options, ['Resupply', 'Maintenance', 'Standard Recon', 'Cautious Recon', 'Rest & End Shift']);
      }
      if (injuredCount >= 2 && meds > 0) {
        return findFirstMatching(options, ['Triage', 'Standard Recon', 'Cautious Recon', 'Maintenance', 'Rest & End Shift']);
      }
      return findFirstMatching(options, ['Standard Recon', 'Cautious Recon', 'Resupply', 'Scout Ahead', 'Maintenance', 'Forage & Hunt', 'Triage', 'Rest & End Shift']);
    }

    case 'silviculture':
      if (journey.planting?.blocksPlanted < journey.planting?.blocksToPlant) {
        return findFirstMatching(options, ['Deploy Planting Crew', 'Conduct Survey', 'Contractor Meeting', 'Site Inspection', 'Team Briefing', 'End Day']);
      }
      if ((journey.surveys?.freeGrowingComplete || 0) < (journey.surveys?.freeGrowingTarget || 0)) {
        return findFirstMatching(options, ['Conduct Survey', 'Site Inspection', 'Contractor Meeting', 'Herbicide Application', 'End Day']);
      }
      if ((journey.brushing?.hectaresComplete || 0) < (journey.brushing?.hectaresTarget || 0)) {
        return findFirstMatching(options, ['Herbicide Application', 'Contractor Meeting', 'Team Briefing', 'End Day']);
      }
      return findFirstMatching(options, ['Contractor Meeting', 'Team Briefing', 'End Day']);

    default:
      break;
  }

  return options[0];
}

function chooseCollapseOption(question, options, journey) {
  const labels = options.map((option) => normalizeWhitespace(option.label));

  if (labels.length === 1) {
    return options[0];
  }

  if (question.includes('What do you do?')) {
    return pickEventOption(options, 'low');
  }

  if (question.includes('Choose values focus')) {
    return findFirstMatching(options, ['Emphasize Timber Supply', 'Emphasize Community', 'Emphasize Biodiversity', 'Balanced Approach']);
  }

  if (question.includes('Select active block focus')) {
    const scored = options.map((option) => {
      const timber = Number(option.description.match(/Timber\s+(\d+)/)?.[1] || 0);
      const eco = Number(option.description.match(/Eco\s+(\d+)/)?.[1] || 100);
      const fn = Number(option.description.match(/FN\s+(\d+)/)?.[1] || 100);
      return { option, score: timber - eco - fn };
    });
    scored.sort((left, right) => right.score - left.score);
    return scored[0]?.option || options[0];
  }

  if (labels.some((label) => label.includes('% HP'))) {
    return [...options]
      .map((option) => {
        const hp = Number(option.label.match(/\((\d+)% HP/)?.[1] || 0);
        return { option, hp };
      })
      .sort((left, right) => right.hp - left.hp)[0]?.option || options[0];
  }

  if (labels.some((label) => label.includes('Safe Detour')) || labels.some((label) => label.includes('Risky Shortcut'))) {
    return findFirstMatching(options, ['Risky Shortcut', 'Stay Mainline', 'Safe Detour']);
  }

  if (labels.some((label) => label.includes('Keep Full Rations')) || labels.some((label) => label.includes('Short Rations and Push On'))) {
    return findFirstMatching(options, ['Short Rations and Push On', 'Keep Full Rations', 'Hunt & Forage Before Moving']);
  }

  if (labels.some((label) => label.includes('Rations Crate')) || labels.some((label) => label.includes('Fuel Drum'))) {
    return findFirstMatching(options, ['Done', 'Fuel Drum', 'Field Repair', 'Rations Crate', 'First Aid Kit']);
  }

  switch (journey.journeyType) {
    case 'planning':
      return findFirstMatching(options, ['Timber Assessment', 'Check Email', 'Network', 'Take a Break', 'End Day', 'Gather Data', 'Run Analysis']);
    case 'permitting':
      return findFirstMatching(options, ['Handle Crisis', 'Stakeholder Meeting', 'Team Building', 'Take a Break', 'End Day Early', 'Process Permits']);
    case 'recon':
      return findFirstMatching(options, ['Max Effort', 'Extended Recon', 'Risky Shortcut', 'Short Rations and Push On', 'Rest & End Shift']);
    case 'silviculture':
      return findFirstMatching(options, ['Herbicide Application', 'Contractor Meeting', 'Team Briefing', 'Site Inspection', 'End Day', 'Conduct Survey']);
    default:
      return options[0];
  }
}

class SimulationUI {
  constructor(strategyName) {
    this.strategyName = strategyName;
    this.messages = [];
    this.choiceCounts = new Map();
    this.choiceCountsByCategory = new Map();
    this.promptCount = 0;
    this.game = null;
  }

  attach(game) {
    this.game = game;
  }

  clear() {}
  updateAllStatus() {}
  prepareForNewGame() {}

  write(value = '') {
    this.messages.push(normalizeWhitespace(String(value)));
    if (this.messages.length > 120) {
      this.messages.shift();
    }
  }

  writeHeader(value = '') { this.write(value); }
  writeDivider(value = '') { this.write(value); }
  writeDanger(value = '') { this.write(value); }
  writeWarning(value = '') { this.write(value); }
  writePositive(value = '') { this.write(value); }

  async promptChoice(question = '', options = []) {
    this.promptCount++;
    if (this.promptCount > 2000) {
      throw new Error('Prompt limit exceeded');
    }

    const visibleOptions = options.map((option) => ({
      ...option,
      label: normalizeWhitespace(option.label),
      description: normalizeWhitespace(option.description || '')
    }));
    const availableOptions = filterAvailableOptions(visibleOptions, this.game.journey);
    const promptCategory = classifyPrompt(question, availableOptions);

    const chooser = this.strategyName === 'collapse' ? chooseCollapseOption : chooseBalancedOption;
    const selected = chooser(question, availableOptions, this.game.journey);
    const normalized = normalizeChoiceLabel(selected?.label || availableOptions[0]?.label || '');

    if (!shouldIgnoreChoice(selected?.label || '')) {
      this.choiceCounts.set(normalized, (this.choiceCounts.get(normalized) || 0) + 1);
      if (!this.choiceCountsByCategory.has(promptCategory)) {
        this.choiceCountsByCategory.set(promptCategory, new Map());
      }
      const bucket = this.choiceCountsByCategory.get(promptCategory);
      bucket.set(normalized, (bucket.get(normalized) || 0) + 1);
    }

    return selected || availableOptions[0];
  }
}

function getRunner(journeyType) {
  switch (journeyType) {
    case 'planning':
      return runPlanningDay;
    case 'permitting':
    case 'desk':
      return runPermittingDay;
    case 'silviculture':
      return runSilvicultureDay;
    case 'recon':
    case 'field':
    default:
      return runReconDay;
  }
}

function dayCountForJourney(journey) {
  return Math.max(0, Number(journey.day || 1) - 1);
}

function summarizeChoices(choiceCounts) {
  return Object.fromEntries([...choiceCounts.entries()].sort((left, right) => right[1] - left[1]));
}

function summarizeChoiceBuckets(choiceCountsByCategory) {
  return Object.fromEntries(
    [...choiceCountsByCategory.entries()].map(([category, counts]) => [category, summarizeChoices(counts)])
  );
}

function aggregateResults(results) {
  const summary = {};

  for (const result of results) {
    const key = `${result.role}/${result.difficulty}`;
    if (!summary[key]) {
      summary[key] = {
        role: result.role,
        difficulty: result.difficulty,
        runs: 0,
        wins: 0,
        losses: 0,
        days: [],
        failReasons: new Map(),
        choices: new Map(),
        actions: new Map()
      };
    }

    const bucket = summary[key];
    bucket.runs++;
    bucket.days.push(result.daysUsed);
    if (result.outcome === 'success') {
      bucket.wins++;
    } else {
      bucket.losses++;
      const failReason = result.reason || 'Unknown';
      bucket.failReasons.set(failReason, (bucket.failReasons.get(failReason) || 0) + 1);
    }

    for (const [label, count] of Object.entries(result.choiceCounts)) {
      bucket.choices.set(label, (bucket.choices.get(label) || 0) + count);
    }

    for (const [label, count] of Object.entries(result.actionCounts || {})) {
      bucket.actions.set(label, (bucket.actions.get(label) || 0) + count);
    }
  }

  return Object.values(summary).map((bucket) => ({
    role: bucket.role,
    difficulty: bucket.difficulty,
    runs: bucket.runs,
    winRate: Number((bucket.wins / bucket.runs).toFixed(2)),
    avgDays: Number((bucket.days.reduce((sum, value) => sum + value, 0) / bucket.days.length).toFixed(1)),
    commonFailReasons: [...bucket.failReasons.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([reason, count]) => ({ reason, count })),
    dominantChoices: [...bucket.choices.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count })),
    dominantActions: [...bucket.actions.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }))
  }));
}

function renderMarkdown(summaryRows, rawResults, strategyName) {
  const lines = [];
  lines.push('# Monte Carlo Playtest Report');
  lines.push('');
  lines.push(`Strategy: \`${strategyName}\``);
  lines.push(`Runs per role/difficulty: \`${runCount}\``);
  lines.push('');
  lines.push('| Mode | Difficulty | Win Rate | Avg Days | Common Fail Reasons | Dominant Actions |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const row of summaryRows) {
    const failReasons = row.commonFailReasons.length
      ? row.commonFailReasons.map((entry) => `${entry.reason} (${entry.count})`).join('<br>')
      : 'None';
    const dominantChoices = row.dominantActions.length
      ? row.dominantActions.slice(0, 5).map((entry) => `${entry.label} (${entry.count})`).join('<br>')
      : 'None';
    lines.push(`| ${row.role} | ${row.difficulty} | ${(row.winRate * 100).toFixed(0)}% | ${row.avgDays} | ${failReasons} | ${dominantChoices} |`);
  }

  const failures = rawResults.filter((result) => result.outcome === 'failure').slice(0, 12);
  if (failures.length) {
    lines.push('');
    lines.push('## Sample Failure Seeds');
    lines.push('');
    for (const failure of failures) {
      lines.push(`- \`${failure.role}/${failure.difficulty}/seed-${failure.seed}\`: ${failure.reason}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

async function simulateRun(role, area, difficulty, seed, strategyName) {
  const originalRandom = Math.random;
  Math.random = makeRng(seed);

  try {
    const journey = createJourney({
      crewName: `Sim ${seed}`,
      role,
      area
    });

    journey.difficulty = difficulty;
    applyDifficultyMultipliers(journey, difficulty);

    const ui = new SimulationUI(strategyName);
    const game = {
      ui,
      journey,
      gameOver: false,
      victory: false
    };
    ui.attach(game);

    const runner = getRunner(journey.journeyType);
    let safety = 0;
    while (!game.gameOver && !game.victory && safety < 120) {
      try {
        await runner(game);
      } catch (error) {
        game.gameOver = true;
        journey.endReason = error?.message === 'Prompt limit exceeded'
          ? 'Prompt limit exceeded'
          : `Simulation error: ${error?.message || 'unknown error'}`;
        break;
      }
      const outcome = checkEndConditions(journey);
      if (outcome?.gameOver) {
        game.gameOver = true;
        journey.endReason = outcome.reason || journey.gameOverReason || 'Operations halted';
      } else if (outcome?.victory) {
        game.victory = true;
        journey.endReason = outcome.reason || journey.endReason || 'Expedition completed!';
      }
      safety++;
    }

    if (!game.gameOver && !game.victory) {
      game.gameOver = true;
      journey.endReason = 'Simulation timeout';
    }

    return {
      role: role.id,
      difficulty,
      seed,
      outcome: game.victory ? 'success' : 'failure',
      reason: journey.endReason || journey.gameOverReason || 'Unknown outcome',
      daysUsed: dayCountForJourney(journey),
      choiceCounts: summarizeChoices(ui.choiceCounts),
      choiceBreakdown: summarizeChoiceBuckets(ui.choiceCountsByCategory),
      actionCounts: summarizeChoices(ui.choiceCountsByCategory.get('action') || new Map()),
      finalState: {
        journeyType: journey.journeyType,
        progress: journey.day,
        permitsApproved: journey.permits?.approved || 0,
        permitsTarget: journey.permits?.target || 0,
        planningPhase: journey.plan?.phase || null,
        planting: journey.planting?.blocksPlanted || 0,
        plantingTarget: journey.planting?.blocksToPlant || 0
      }
    };
  } finally {
    Math.random = originalRandom;
  }
}

const roles = roleFilter
  ? FORESTER_ROLES.filter((role) => role.id === roleFilter)
  : FORESTER_ROLES;
const difficulties = difficultyFilter
  ? DIFFICULTIES.filter((difficulty) => difficulty.name === difficultyFilter)
  : DIFFICULTIES;

const results = [];
let seedCursor = seedBase;

for (const role of roles) {
  const area = OPERATING_AREAS[FORESTER_ROLES.findIndex((candidate) => candidate.id === role.id) % OPERATING_AREAS.length];
  for (const difficulty of difficulties) {
    for (let i = 0; i < runCount; i++) {
      results.push(await simulateRun(role, area, difficulty.name, seedCursor++, strategy));
    }
  }
}

const summaryRows = aggregateResults(results);

for (const row of summaryRows) {
  const failSummary = row.commonFailReasons.length
    ? row.commonFailReasons.map((entry) => `${entry.reason} (${entry.count})`).join(' | ')
    : 'none';
  const choiceSummary = row.dominantActions.slice(0, 5).map((entry) => `${entry.label}:${entry.count}`).join(', ');
  console.log([
    row.role,
    row.difficulty,
    `winRate=${(row.winRate * 100).toFixed(0)}%`,
    `avgDays=${row.avgDays}`,
    `fails=${failSummary}`,
    `choices=${choiceSummary}`
  ].join('\t'));
}

const payload = {
  strategy,
  runCount,
  generatedAt: new Date().toISOString(),
  summary: summaryRows,
  results
};

if (jsonOut) {
  const outPath = resolve(jsonOut);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
}

if (markdownOut) {
  const outPath = resolve(markdownOut);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderMarkdown(summaryRows, results, strategy));
}
