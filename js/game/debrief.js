/**
 * Final Debrief
 * Interactive end-of-run sequence: final report decision, road-home vignette,
 * crew epilogues, performance review, and the persistent service record.
 *
 * Replaces the static end screen with staged, tap-friendly beats. Every stage
 * advances through promptChoice buttons so it works on touch devices.
 */

import { ASCII_ART } from '../ascii_art.js';
import { getCrewDisplayInfo } from '../crew.js';
import { calculateScore, formatScoreDisplay, getLetterGrade } from '../scoring.js';
import {
  buildVictoryNarrative,
  buildDefeatNarrative,
  writeFinalStatistics,
} from './endScreen.js';

const SERVICE_RECORD_KEY = 'bcft.serviceRecord.v1';

// ---------------------------------------------------------------------------
// Stage 1: The final report — one last decision that colours the epilogue
// ---------------------------------------------------------------------------

/**
 * Role-specific closing decision. Three stances, consistent across roles:
 *   integrity — file it straight; earns a professional-reliance commendation
 *   spin      — dress it up; small score gamble in keeping with risk plays
 *   people    — put the crew/partners first; warms the epilogues
 * @param {string} journeyType
 * @returns {{prompt: string, options: Array}}
 */
export function getFinalReportPrompt(journeyType) {
  switch (journeyType) {
    case 'recon':
    case 'field':
      return {
        prompt: 'Back at the office, the traverse write-up is due. How do you file it?',
        options: [
          { label: 'File it straight — every hazard and access gap documented', hint: 'The development forester will grumble, but the record protects the next crew.', value: 'integrity' },
          { label: 'Soften the access notes so the blocks stay attractive', hint: 'Risky. If an auditor walks that ground, the gaps will show.', value: 'spin' },
          { label: 'Credit the crew by name in the appendix', hint: 'Recognition travels fast in small towns.', value: 'people' },
        ],
      };
    case 'silviculture':
      return {
        prompt: 'The regeneration report heads to the district office. How do you frame it?',
        options: [
          { label: 'Report survival rates exactly as surveyed', hint: 'Free-growing obligations stay honest, whatever the numbers say.', value: 'integrity' },
          { label: 'Project optimistic survival from the best plots', hint: 'Risky. A check survey could unpick the projection.', value: 'spin' },
          { label: 'Highlight the contractor crews who beat the weather', hint: 'Good contractors remember who spoke up for them.', value: 'people' },
        ],
      };
    case 'planning':
      return {
        prompt: 'The plan needs your seal. How do you sign off as the professional of record?',
        options: [
          { label: 'Seal it with every condition and caveat documented', hint: 'Professional reliance means the file speaks for itself.', value: 'integrity' },
          { label: "Lean into the minister's preferred narrative", hint: 'Risky. Plans outlive ministers.', value: 'spin' },
          { label: 'Co-author the summary with the First Nations partners', hint: 'Shared authorship builds trust that outlasts this plan.', value: 'people' },
        ],
      };
    case 'permitting':
    case 'desk':
      return {
        prompt: 'Time to close out the files. How do you archive the year?',
        options: [
          { label: 'Archive everything with full referral records attached', hint: 'Future you — or an auditor — will find exactly what happened.', value: 'integrity' },
          { label: 'Fast-close the stragglers with minimal documentation', hint: 'Risky. Thin files have a way of resurfacing.', value: 'spin' },
          { label: 'Send personal thanks to every agency contact who moved a file', hint: 'Next year’s referrals will move faster.', value: 'people' },
        ],
      };
    case 'manager':
    default:
      return {
        prompt: 'The board wants your closing presentation. What story do you tell?',
        options: [
          { label: 'Open the books — every win and write-down on one slide', hint: 'Boards forgive bad quarters. They don’t forgive surprises.', value: 'integrity' },
          { label: 'Spin the quarter with creative accounting categories', hint: 'Risky. Auditors read footnotes.', value: 'spin' },
          { label: 'Give the floor to your CEO and crew leads', hint: 'Credit shared is loyalty earned.', value: 'people' },
        ],
      };
  }
}

/**
 * Resolve the final report stance into a score adjustment and narration.
 * Pure aside from the injectable rng (for the 'spin' gamble).
 * @param {string} style - integrity | spin | people
 * @param {Object} journey
 * @param {Function} rng - random source, defaults to Math.random
 * @returns {{delta: number, lines: string[]}}
 */
export function resolveFinalReport(style, journey, rng = Math.random) {
  const hasCrew = Boolean(journey.crew?.length);
  switch (style) {
    case 'spin': {
      if (rng() < 0.65) {
        return {
          delta: 6,
          lines: ['The framing lands. On paper, this was a tidy operation.'],
        };
      }
      return {
        delta: -10,
        lines: ['A spot audit unpicks the framing line by line. The file gets flagged, and your name is on it.'],
      };
    }
    case 'people':
      return {
        delta: hasCrew ? 4 : 3,
        lines: [
          hasCrew
            ? 'Word gets around that you put your people first. Next season’s signup sheet fills fast.'
            : 'The thank-you notes cost nothing and buy goodwill money can’t.',
        ],
      };
    case 'integrity':
    default:
      return {
        delta: 2,
        lines: ['The association circulates your file as an example of professional reliance done right.'],
      };
  }
}

// ---------------------------------------------------------------------------
// Stage 3: Where are they now — crew & protagonist epilogues
// ---------------------------------------------------------------------------

const TRAIT_EPILOGUES = {
  experienced: 'signs on to mentor next season’s greenhorns',
  hardy: 'is back in the bush before the snow melts',
  cheerful: 'still tells the story at the Legion every Friday',
  careful: 'gets poached by a safety consultancy in Prince George',
  efficient: 'rewrites the company’s supply checklist — it’s two pages shorter now',
  leader: 'is offered a crew-boss ticket for next year',
  greenhorn: 'finally earned their caulks the hard way',
  frail: 'requests a desk rotation, and nobody blames them',
  clumsy: 'buys the first round as apology for the gear they broke',
};

/**
 * One-line epilogue for a crew member, based on fate, traits and condition.
 * @param {Object} member - Crew member
 * @param {Object} context - { victory, reportStyle }
 * @returns {string}
 */
export function buildCrewEpilogue(member, context = {}) {
  const { victory = false, reportStyle = 'integrity' } = context;
  const info = getCrewDisplayInfo(member);
  const name = `${info.name} (${info.role})`;

  if (member.isDead) {
    return `${name}: A bench at the staging area carries their name now. The crew stops there every season.`;
  }
  if (member.hasQuit) {
    return member.morale < 30
      ? `${name}: Last seen driving south. The resignation letter was one sentence long.`
      : `${name}: Took a town job with regular hours. Sends the crew fish pictures.`;
  }
  if (!member.isActive) {
    return `${name}: Recovering well. The doctors say next season is realistic.`;
  }

  // Active survivors: trait flavour first, then condition buckets
  for (const traitId of member.traits || []) {
    if (TRAIT_EPILOGUES[traitId]) {
      return `${name}: ${capitalize(TRAIT_EPILOGUES[traitId])}.`;
    }
  }

  if (!victory) {
    return member.morale >= 50
      ? `${name}: Shrugs it off. "Some years the bush wins." Already asking about next season.`
      : `${name}: Quietly updating a resume, but hasn’t handed it in yet.`;
  }
  if (member.health > 80 && member.morale > 70) {
    return `${name}: Came back stronger than they left. Asks to run point next year.`;
  }
  if (member.health < 40) {
    return `${name}: Healing up over the winter. The stories are worth the scars, they say.`;
  }
  if (reportStyle === 'people') {
    return `${name}: Saw their name in the report appendix and bought a frame for it.`;
  }
  return `${name}: Banks the season and books two weeks somewhere with no trees.`;
}

/**
 * Epilogue for protagonist (no-crew) journeys: planning & permitting.
 * @param {Object} journey
 * @param {boolean} victory
 * @returns {string[]}
 */
export function buildProtagonistEpilogue(journey, victory) {
  const stress = journey.protagonist?.stress ?? 0;
  const lines = [];

  if (victory && stress < 50) {
    lines.push('One year later: your name comes up when the district needs something done properly. You let the reputation do the talking.');
  } else if (victory) {
    lines.push('One year later: the file closed clean, but you still flinch when the phone rings after 5pm. The win cost something.');
  } else if (stress >= 70) {
    lines.push('One year later: you took the winter off. The forest didn’t notice, and that turned out to be the lesson.');
  } else {
    lines.push('One year later: the file is someone else’s problem now, but you kept your field notes. Next time you’ll see it coming.');
  }
  return lines;
}

/**
 * Epilogue lines for manager journeys: CEO and certifications.
 * @param {Object} journey
 * @param {boolean} victory
 * @returns {string[]}
 */
export function buildManagerEpilogue(journey, victory) {
  const lines = [];
  if (journey.ceo) {
    const style = journey.ceo.decision_making_style === 'conservative'
      ? 'methodical as ever'
      : 'already pitching the next venture';
    lines.push(victory
      ? `${journey.ceo.name}: Renewed for another term, ${style}.`
      : `${journey.ceo.name}: Parted ways professionally. The handshake was firm, the severance firmer.`);
  }
  for (const cert of journey.certifications || []) {
    lines.push(`${cert.name}: ${victory ? 'The certificate hangs in reception, and buyers notice.' : 'The audit binder outlived the tenure.'}`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Stage 5: Service record — persistent career stats across runs
// ---------------------------------------------------------------------------

/**
 * Fold a finished run into a service record. Pure: returns a new record.
 * @param {Object|null} record - Existing record or null
 * @param {Object} journey
 * @param {Object} scoreResult - From calculateScore (after adjustments)
 * @param {boolean} victory
 * @returns {Object} Updated record
 */
export function updateServiceRecord(record, journey, scoreResult, victory) {
  const type = journey.journeyType || 'field';
  const next = {
    runs: (record?.runs || 0) + 1,
    byRole: { ...(record?.byRole || {}) },
    career: { ...(record?.career || {}) },
  };

  const prevRole = next.byRole[type] || { runs: 0, victories: 0, bestScore: -1, bestGrade: null };
  const isBest = scoreResult.totalScore > prevRole.bestScore;
  next.byRole[type] = {
    runs: prevRole.runs + 1,
    victories: prevRole.victories + (victory ? 1 : 0),
    bestScore: isBest ? scoreResult.totalScore : prevRole.bestScore,
    bestGrade: isBest ? scoreResult.grade : prevRole.bestGrade,
  };

  const c = next.career;
  switch (type) {
    case 'recon':
    case 'field':
      c.kmSurveyed = Math.round((c.kmSurveyed || 0) + (journey.distanceTraveled || 0));
      break;
    case 'silviculture':
      c.seedlingsPlanted = (c.seedlingsPlanted || 0) + (journey.planting?.seedlingsPlanted || 0);
      break;
    case 'planning':
      c.plansApproved = (c.plansApproved || 0) + (victory ? 1 : 0);
      break;
    case 'permitting':
    case 'desk':
      c.permitsApproved = (c.permitsApproved || 0) + (journey.permits?.approved || 0);
      break;
    case 'manager':
      c.daysInTheChair = (c.daysInTheChair || 0) + Math.max(0, (journey.day || 1) - 1);
      break;
  }

  return { ...next, isBest };
}

function loadServiceRecord() {
  try {
    const raw = window.localStorage?.getItem(SERVICE_RECORD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveServiceRecord(record) {
  try {
    const { isBest, ...persisted } = record;
    window.localStorage?.setItem(SERVICE_RECORD_KEY, JSON.stringify(persisted));
  } catch {
    // Storage unavailable (private mode, etc.) — the run still ends gracefully.
  }
}

const ROLE_LABELS = {
  recon: 'Recon Crew Lead',
  field: 'Field Crew',
  silviculture: 'Silviculture Supervisor',
  planning: 'Strategic Planner',
  permitting: 'Permitting Specialist',
  desk: 'Desk Team',
  manager: 'General Manager',
};

const CAREER_LABELS = {
  kmSurveyed: 'Kilometres surveyed',
  seedlingsPlanted: 'Seedlings planted',
  plansApproved: 'Plans approved',
  permitsApproved: 'Permits approved',
  daysInTheChair: 'Days in the chair',
};

// ---------------------------------------------------------------------------
// The staged sequence
// ---------------------------------------------------------------------------

function pickEndArt(journey, victory) {
  const field = ['recon', 'field', 'silviculture'].includes(journey.journeyType);
  if (victory) return field ? ASCII_ART.truck[0] : ASCII_ART.tree[0];
  return field ? ASCII_ART.campfire[0] : ASCII_ART.stump[0];
}

async function next(ui, label = 'Continue') {
  await ui.promptChoice('', [{ label, value: 'next' }]);
}

/**
 * Run the interactive final debrief.
 * @param {Object} ui - TerminalUI instance
 * @param {Object} journey - Journey state
 * @param {boolean} victory
 */
export async function runFinalDebrief(ui, journey, victory) {
  const areaName = journey.area?.name || 'the operating area';
  const crewName = journey.companyName || 'The crew';
  const daysUsed = journey.day - 1;

  // --- Stage 1: Final report decision ---
  ui.clear();
  ui.writeHeader(victory ? 'THE WORK IS DONE' : 'THE WORK STOPS HERE');
  ui.write('');
  const report = getFinalReportPrompt(journey.journeyType);
  const choice = await ui.promptChoice(report.prompt, report.options);
  const reportStyle = choice.value || 'integrity';
  const reportResult = resolveFinalReport(reportStyle, journey);
  ui.write('');
  for (const line of reportResult.lines) {
    ui.write(line);
  }
  journey.finalReport = { style: reportStyle, delta: reportResult.delta };
  await next(ui);

  // --- Stage 2: The road home ---
  ui.clear();
  ui.writeHeader(victory ? 'EXPEDITION SUCCESSFUL' : 'EXPEDITION FAILED');
  ui.writeBox(pickEndArt(journey, victory));
  ui.write(victory
    ? buildVictoryNarrative(journey, areaName, crewName, daysUsed)
    : buildDefeatNarrative(journey, areaName, crewName, daysUsed));
  ui.write('');
  ui.writeDivider('FINAL STATISTICS');
  writeFinalStatistics(ui, journey);
  await next(ui);

  // --- Stage 3: Where are they now ---
  const epilogueContext = { victory, reportStyle };
  const epilogues = [];
  if (journey.crew?.length) {
    for (const member of journey.crew) {
      epilogues.push(buildCrewEpilogue(member, epilogueContext));
    }
  }
  if (['planning', 'permitting', 'desk'].includes(journey.journeyType)) {
    epilogues.push(...buildProtagonistEpilogue(journey, victory));
  }
  if (journey.journeyType === 'manager') {
    epilogues.push(...buildManagerEpilogue(journey, victory));
  }
  if (epilogues.length) {
    ui.clear();
    ui.writeDivider('WHERE ARE THEY NOW');
    ui.write('');
    for (const line of epilogues) {
      ui.write(line);
      ui.write('');
    }
    await next(ui);
  }

  // --- Stage 4: Performance review ---
  const scoreResult = calculateScore(journey, victory);
  scoreResult.totalScore = Math.max(0, Math.min(100, scoreResult.totalScore + reportResult.delta));
  scoreResult.grade = getLetterGrade(scoreResult.totalScore);

  ui.clear();
  ui.writeDivider('PERFORMANCE REVIEW');
  const scoreLines = formatScoreDisplay(scoreResult);
  // formatScoreDisplay leads with the grade — save it for the reveal.
  const gradeLine = scoreLines.shift();
  for (const line of scoreLines) {
    ui.write(line);
  }
  const deltaLabel = reportResult.delta >= 0 ? `+${reportResult.delta}` : `${reportResult.delta}`;
  ui.write(`  ${'Final Report'.padEnd(14)} ${reportStyleLabel(reportStyle)} (${deltaLabel} pts)`);
  ui.write('');
  if (victory) {
    ui.writePositive(gradeLine);
  } else {
    ui.writeWarning(gradeLine);
  }
  await next(ui);

  // --- Stage 5: Service record ---
  const updated = updateServiceRecord(loadServiceRecord(), journey, scoreResult, victory);
  saveServiceRecord(updated);

  ui.clear();
  ui.writeDivider('SERVICE RECORD');
  ui.write('');
  if (updated.isBest) {
    ui.writePositive(`New personal best for ${ROLE_LABELS[journey.journeyType] || journey.journeyType}!`);
    ui.write('');
  }
  ui.write(`Career expeditions: ${updated.runs}`);
  for (const [type, stats] of Object.entries(updated.byRole)) {
    const label = ROLE_LABELS[type] || type;
    ui.write(`  ${label}: ${stats.runs} run${stats.runs > 1 ? 's' : ''}, best ${stats.bestGrade ?? '-'} (${stats.bestScore >= 0 ? stats.bestScore : '-'}/100), ${stats.victories} win${stats.victories === 1 ? '' : 's'}`);
  }
  const careerEntries = Object.entries(updated.career).filter(([, v]) => v > 0);
  if (careerEntries.length) {
    ui.write('');
    ui.write('Lifetime field record:');
    for (const [key, value] of careerEntries) {
      ui.write(`  ${CAREER_LABELS[key] || key}: ${value.toLocaleString()}`);
    }
  }
  ui.write('');
}

function reportStyleLabel(style) {
  switch (style) {
    case 'spin': return 'Creative framing';
    case 'people': return 'Credit shared';
    default: return 'Filed straight';
  }
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
