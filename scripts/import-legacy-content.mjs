#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = { src: null };
  for (let i = 2; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--src') {
      args.src = argv[i + 1];
      i++;
      continue;
    }
    if (!args.src && !value.startsWith('-')) {
      args.src = value;
    }
  }
  return args;
}

function toInt(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.round(value);
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, toInt(value)));
}

function scaleLegacyBudget(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return clampInt(value / 20, -6000, 6000);
}

function scaleFieldCashFromDollars(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return clampInt(value / 20, -6000, 6000);
}

function scaleDeskBudgetFromDollars(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return clampInt(value / 10, -20000, 20000);
}

function scaleLegacyReputation(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return clampInt(value * 40, -20, 20);
}

function convertLegacyEffects(effects = {}, journeyType) {
  const converted = {};

  if (typeof effects.budget === 'number') {
    converted.budget = scaleLegacyBudget(effects.budget);
  }

  if (typeof effects.reputation === 'number') {
    const moraleDelta = scaleLegacyReputation(effects.reputation);
    if (journeyType === 'desk') {
      converted.politicalCapital = moraleDelta;
    } else {
      converted.crew_morale = moraleDelta;
    }
  }

  if (typeof effects.community_support === 'number') {
    const delta = scaleLegacyReputation(effects.community_support);
    if (journeyType === 'desk') {
      converted.politicalCapital = (converted.politicalCapital || 0) + delta;
    } else {
      converted.crew_morale = (converted.crew_morale || 0) + delta;
    }
  }

  if (typeof effects.permit_backlog_reduction === 'number' && journeyType === 'desk') {
    converted.permits_approved = clampInt(effects.permit_backlog_reduction / 10, 0, 4);
  }

  return converted;
}

function convertIssueEffects(effects = {}, journeyType) {
  const converted = {};

  const progress = typeof effects.progress === 'number' ? effects.progress : 0;
  const budgetMetric = typeof effects.budget === 'number' ? effects.budget : 0;
  const forestHealth = typeof effects.forestHealth === 'number' ? effects.forestHealth : 0;
  const relationships = typeof effects.relationships === 'number' ? effects.relationships : 0;
  const compliance = typeof effects.compliance === 'number' ? effects.compliance : 0;

  if (journeyType === 'field') {
    if (progress !== 0) {
      converted.progress = clampInt(progress * 2, -18, 18);
    }
    if (budgetMetric !== 0) {
      converted.budget = clampInt(budgetMetric * 250, -6000, 6000);
    }
    const mood = clampInt((forestHealth + relationships + compliance) / 2, -12, 12);
    if (mood !== 0) {
      converted.crew_morale = mood;
    }
  } else {
    if (progress > 0) {
      converted.permits_approved = clampInt(progress / 3, 0, 3);
    } else if (progress < 0) {
      converted.timeUsed = clampInt(Math.abs(progress), 1, 6);
    }
    if (budgetMetric !== 0) {
      converted.budget = clampInt(budgetMetric * 1000, -15000, 15000);
    }
    const capital = clampInt((relationships + compliance) / 2, -12, 12);
    if (capital !== 0) {
      converted.politicalCapital = capital;
    }
  }

  return converted;
}

function makeOptionsFromLegacyChoices(choices, journeyType) {
  if (!Array.isArray(choices) || choices.length === 0) return [];

  return choices.map((choice) => ({
    label: String(choice.label || 'Choose'),
    outcome: choice.outcome ? String(choice.outcome) : undefined,
    effects: convertLegacyEffects(choice.effects || {}, journeyType),
  }));
}

function wrapLegacyEvent(event, journeyType, probability) {
  const optionsFromChoices = makeOptionsFromLegacyChoices(event.choices, journeyType);
  const hasInlineOutcome = typeof event.outcome === 'string' && event.outcome.length > 0;
  const inlineEffects = convertLegacyEffects(event.effects || {}, journeyType);

  const options = optionsFromChoices.length
    ? optionsFromChoices
    : [
        {
          label: 'Lean into it',
          outcome: hasInlineOutcome ? event.outcome : 'You adapt and roll with it.',
          effects: inlineEffects
        },
        {
          label: 'Stay focused',
          outcome: 'You keep the crew on task and avoid distractions.',
          effects: journeyType === 'desk' ? { politicalCapital: -1 } : { crew_morale: -1 }
        }
      ];

  return {
    id: String(event.id || `legacy_${Math.random().toString(36).slice(2)}`),
    title: String(event.title || 'Legacy Event'),
    type: String(event.type || 'legacy'),
    severity: 'minor',
    probability,
    description: String(event.description || ''),
    options
  };
}

function wrapIssueAsEvent(issue, journeyType, probability) {
  const options = Array.isArray(issue.options) ? issue.options : [];
  return {
    id: String(issue.id || `issue_${Math.random().toString(36).slice(2)}`),
    title: String(issue.title || 'Field Issue'),
    type: 'issue',
    severity: 'moderate',
    probability,
    description: String(issue.description || ''),
    options: options.map((opt) => ({
      label: String(opt.label || 'Choose'),
      outcome: opt.outcome ? String(opt.outcome) : undefined,
      effects: convertIssueEffects(opt.effects || {}, journeyType)
    }))
  };
}

function wrapSafetyIncidentAsDeskEvent(incident, responseOptions, probability) {
  const safeTitle = String(incident.title || 'Safety Incident');
  const description = String(incident.story || incident.description || 'A serious safety incident disrupts operations.');

  const options = (Array.isArray(responseOptions) ? responseOptions : []).slice(0, 4).map((opt) => {
    const cost = typeof opt.cost === 'number' ? opt.cost : 0;
    const budgetDelta = scaleDeskBudgetFromDollars(-cost);
    const reputRec = typeof opt.reputation_recovery === 'number' ? opt.reputation_recovery : 0;
    const fineRed = typeof opt.fine_reduction === 'number' ? opt.fine_reduction : 0;
    const cap = clampInt(reputRec * 40 - fineRed * 10, -12, 12);

    return {
      label: String(opt.description || opt.detail || 'Respond'),
      outcome: String(opt.detail || 'You implement corrective actions and keep operations moving.'),
      effects: {
        budget: budgetDelta,
        politicalCapital: cap,
        timeUsed: 6
      }
    };
  });

  const fallbackOptions = options.length
    ? options
    : [
        {
          label: 'Pause and remediate',
          outcome: 'You stop work, fix the root cause, and document the corrective actions.',
          effects: { budget: -3000, politicalCapital: 4, timeUsed: 6 }
        },
        {
          label: 'Minimize and move on',
          outcome: 'You keep the file thin. It saves time today, but trust erodes.',
          effects: { politicalCapital: -8, timeUsed: 2 }
        }
      ];

  return {
    id: String(incident.id || `safety_${Math.random().toString(36).slice(2)}`),
    title: safeTitle,
    type: 'safety',
    severity: 'moderate',
    probability,
    description,
    options: fallbackOptions
  };
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function copyJsonArchive(srcRoot, outRoot) {
  await mkdir(outRoot, { recursive: true });
  const entries = await readdir(srcRoot, { withFileTypes: true });
  const copied = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.json')) continue;
    const srcPath = path.join(srcRoot, entry.name);
    const destPath = path.join(outRoot, entry.name);
    await copyFile(srcPath, destPath);
    const info = await stat(destPath);
    copied.push({ file: entry.name, bytes: info.size });
  }

  copied.sort((a, b) => a.file.localeCompare(b.file));
  return copied;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.src) {
    throw new Error('Usage: node scripts/import-legacy-content.mjs --src "<dataset folder>"');
  }

  const srcRoot = path.resolve(args.src);

  const wackyPath = path.join(srcRoot, 'events_wacky.json');
  const policyPath = path.join(srcRoot, 'events_policy_natural.json');
  const issuesPath = path.join(srcRoot, 'field_issues.json');
  const illegalActsPath = path.join(srcRoot, 'illegal_acts_v3.json');
  const safetyPath = path.join(srcRoot, 'workplace_safety.json');
  const glossaryPath = path.join(srcRoot, 'glossary.json');

  const fieldEvents = [];
  const deskEvents = [];
  const legacyGlossary = { category: 'Legacy Forestry Glossary', description: 'Imported from previous versions; source archived under docs/legacy_archive.', terms: [] };
  const legacyIllegalActs = { category: 'Legacy Illegal Acts', description: 'Imported from previous versions; source archived under docs/legacy_archive.', illegal_acts: [] };

  const report = {
    generatedAt: new Date().toISOString(),
    srcRoot,
    outputs: {
      fieldEvents: 0,
      deskEvents: 0,
      glossaryTerms: 0,
      illegalActs: 0
    },
    archivedFiles: [],
    notes: []
  };

  try {
    const wacky = await readJson(wackyPath);
    const events = Array.isArray(wacky.events) ? wacky.events : [];
    const base = typeof wacky.trigger_chance === 'number' ? wacky.trigger_chance : 0.12;
    const perEvent = Math.max(0.006, Math.min(0.02, base / Math.max(1, events.length * 4)));
    for (const e of events) {
      fieldEvents.push(wrapLegacyEvent(e, 'field', perEvent));
    }
    report.notes.push(`Converted ${events.length} wacky events → field event pool.`);
  } catch {
    // ignore if file missing/invalid
  }

  try {
    const policy = await readJson(policyPath);
    const events = Array.isArray(policy.events) ? policy.events : [];
    for (const e of events) {
      const prob = typeof e.trigger_chance === 'number' ? Math.max(0.005, Math.min(0.03, e.trigger_chance / 4)) : 0.01;
      deskEvents.push(wrapLegacyEvent(e, 'desk', prob));
    }
    report.notes.push(`Converted ${events.length} policy/natural events → desk event pool.`);
  } catch {
    // ignore if file missing/invalid
  }

  try {
    const issuesData = await readJson(issuesPath);
    const issues = [
      ...(Array.isArray(issuesData.issues) ? issuesData.issues : []),
      ...(Array.isArray(issuesData.chained_issues) ? issuesData.chained_issues : [])
    ];

    const perIssue = 0.004;
    for (const issue of issues) {
      const roles = Array.isArray(issue.roles) ? issue.roles : [];
      const goesField = roles.some((r) => r === 'recce' || r === 'silviculture');
      const goesDesk = roles.some((r) => r === 'planner' || r === 'permitter');

      if (!goesField && !goesDesk) {
        fieldEvents.push(wrapIssueAsEvent(issue, 'field', perIssue));
        continue;
      }
      if (goesField) {
        fieldEvents.push(wrapIssueAsEvent({ ...issue, id: `${issue.id}_field` }, 'field', perIssue));
      }
      if (goesDesk) {
        deskEvents.push(wrapIssueAsEvent({ ...issue, id: `${issue.id}_desk` }, 'desk', perIssue));
      }
    }
    report.notes.push(`Converted ${issues.length} field issues (incl. chained) → field/desk pools (split by role).`);
  } catch {
    // ignore if file missing/invalid
  }

  try {
    const illegal = await readJson(illegalActsPath);
    const acts = Array.isArray(illegal.illegal_acts) ? illegal.illegal_acts : [];
    legacyIllegalActs.illegal_acts = acts.map((a) => ({
      id: String(a.id || `illegal_${Math.random().toString(36).slice(2)}`),
      title: String(a.title || 'Shady Shortcut'),
      description: String(a.description || ''),
      roles: Array.isArray(a.roles) ? a.roles.map(String) : [],
      tags: Array.isArray(a.tags) ? a.tags.map(String) : []
    }));
    report.outputs.illegalActs = legacyIllegalActs.illegal_acts.length;
    report.notes.push(`Imported ${acts.length} illegal acts as a data deck (spawned dynamically in-game).`);
  } catch {
    // ignore if file missing/invalid
  }

  try {
    const safety = await readJson(safetyPath);
    const incidents = Array.isArray(safety.incidents) ? safety.incidents : [];
    const responseOptions = Array.isArray(safety.response_options) ? safety.response_options : [];
    const perIncident = 0.003;
    for (const incident of incidents) {
      deskEvents.push(wrapSafetyIncidentAsDeskEvent(incident, responseOptions, perIncident));
    }
    report.notes.push(`Converted ${incidents.length} safety incidents → desk event pool (rare).`);
  } catch {
    // ignore if file missing/invalid
  }

  try {
    const glossary = await readJson(glossaryPath);
    const terms = Array.isArray(glossary.terms) ? glossary.terms : [];
    legacyGlossary.terms = terms
      .filter((t) => t && typeof t.term === 'string' && typeof t.description === 'string')
      .map((t) => ({ term: t.term.trim(), description: t.description.trim() }));
    report.outputs.glossaryTerms = legacyGlossary.terms.length;
    report.notes.push(`Imported ${legacyGlossary.terms.length} glossary terms.`);
  } catch {
    // ignore if file missing/invalid
  }

  const outDir = path.resolve('js/data/json/legacy');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'fieldEvents.json'), JSON.stringify(fieldEvents, null, 2) + '\n', 'utf8');
  await writeFile(path.join(outDir, 'deskEvents.json'), JSON.stringify(deskEvents, null, 2) + '\n', 'utf8');
  await writeFile(path.join(outDir, 'glossary.json'), JSON.stringify(legacyGlossary, null, 2) + '\n', 'utf8');
  await writeFile(path.join(outDir, 'illegalActs.json'), JSON.stringify(legacyIllegalActs, null, 2) + '\n', 'utf8');

  const archiveRoot = path.resolve('docs/legacy_archive/game_content_datasets');
  report.outputs.fieldEvents = fieldEvents.length;
  report.outputs.deskEvents = deskEvents.length;
  report.archivedFiles = await copyJsonArchive(srcRoot, archiveRoot);
  await mkdir(path.dirname(path.resolve('docs/legacy_archive/import-report.json')), { recursive: true });
  await writeFile(path.resolve('docs/legacy_archive/import-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Imported ${fieldEvents.length} field events and ${deskEvents.length} desk events into ${outDir}`);
  // eslint-disable-next-line no-console
  console.log(`Archived source datasets into ${archiveRoot}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
