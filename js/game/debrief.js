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
import { resolveSilvicultureFinalReport } from '../modes/silvicultureIntegrity.js';
import { settleOutstandingFallout } from '../events/shortcutRecord.js';
import {
  foldRunIntoRecord,
  loadServiceRecord,
  saveServiceRecord,
  ROLE_LABELS,
  CAREER_LABELS,
} from '../career.js';
import {
  buildVictoryNarrative,
  buildDefeatNarrative,
  writeFinalStatistics,
} from './endScreen.js';

// ---------------------------------------------------------------------------
// Stage 1: The final report — one last decision that colours the epilogue
// ---------------------------------------------------------------------------

/**
 * Role-specific closing decision. Three stances, consistent across roles:
 *   integrity — file it straight; the file holds if anyone ever pulls it
 *   spin      — dress it up; small score gamble in keeping with risk plays
 *   people    — put the crew/partners first; warms the epilogues
 * A desk file that failed is not sealed or archived as a finished year; it is
 * handed over, and the same three stances apply to the hand-over.
 * @param {string} journeyType
 * @param {{victory?: boolean}} [context]
 * @returns {{prompt: string, options: Array}}
 */
export function getFinalReportPrompt(journeyType, { victory = true } = {}) {
  if (!victory && HANDOVER_PROMPTS[journeyType]) return HANDOVER_PROMPTS[journeyType];
  switch (journeyType) {
    case 'recon':
    case 'field':
      return {
        prompt: 'Back at the office, the traverse write-up is due. How do you file it?',
        options: [
          { label: 'File it straight — every hazard and access gap documented', hint: 'The development forester will grumble, but the record protects the next crew.', value: 'integrity' },
          { label: 'Soften the access notes so the blocks stay attractive', hint: 'Risky. If a C&E officer walks that ground, the gaps will show.', value: 'spin' },
          { label: 'Credit the crew by name in the appendix', hint: 'Recognition travels fast in small towns.', value: 'people' },
        ],
      };
    case 'silviculture':
      return {
        prompt: 'The regeneration report heads to the district office. How do you frame it?',
        options: [
          { label: 'Report stocking and free-growing exactly as surveyed', hint: 'Free-growing obligations stay honest, whatever the numbers say.', value: 'integrity' },
          { label: 'Project the stocking from the best plots', hint: 'Risky. A check survey could unpick the projection, and a file already under scrutiny is the one they check.', value: 'spin' },
          { label: 'Highlight the contractor crews who beat the weather', hint: 'Good contractors remember who spoke up for them.', value: 'people' },
        ],
      };
    case 'planning':
      return {
        prompt: 'The plan needs your seal. How do you sign off as the professional of record?',
        options: [
          { label: 'Seal it with every condition and caveat documented', hint: 'Your seal means the rationale is written down and you can defend it.', value: 'integrity' },
          { label: "Lean into the licensee's preferred narrative", hint: 'Risky. Plans outlive the people who wanted them.', value: 'spin' },
          { label: 'Co-author the summary with the First Nations partners', hint: 'Shared authorship builds trust that outlasts this plan.', value: 'people' },
        ],
      };
    case 'permitting':
    case 'desk':
      return {
        prompt: 'Time to close out the files. How do you archive the year?',
        options: [
          { label: 'Archive everything with full referral records attached', hint: 'Future you — or the Forest Practices Board — will find exactly what happened.', value: 'integrity' },
          { label: 'Archive summaries only; leave the referral records in your inbox', hint: 'Risky. Thin files have a way of resurfacing.', value: 'spin' },
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
          { label: 'Give the floor to your executive team and division leads', hint: 'Credit shared is loyalty earned.', value: 'people' },
        ],
      };
  }
}

const PLANNING_HANDOVER = {
  prompt: 'The FSP did not get through. The file goes to whoever picks it up next. How do you hand it over?',
  options: [
    { label: 'Write the hand-over memo with every open gap and comment on the record', hint: 'The next planner starts from the truth, and so does the District Manager.', value: 'integrity' },
    { label: 'Tell the licensee the district sat on it', hint: 'Risky. The district’s file shows what was filed and when.', value: 'spin' },
    { label: 'Walk the Nation’s referral staff through where the file stands', hint: 'The next planner inherits the relationship, not just the binder.', value: 'people' },
  ],
};

const PERMITTING_HANDOVER = {
  prompt: 'The queue is someone else’s now. How do you hand it over?',
  options: [
    { label: 'Hand over every file with its clock, letter and referral record', hint: 'Whoever sits at this desk next knows exactly where each permit stands.', value: 'integrity' },
    { label: 'Close out the stragglers with minimal notes', hint: 'Risky. Thin files have a way of resurfacing.', value: 'spin' },
    { label: 'Call each agency contact to say who has the files now', hint: 'The referrals keep moving when the name on the desk changes.', value: 'people' },
  ],
};

// A silviculture program that was not delivered, or that the licensee
// pulled, has no regeneration report of yours to frame: it is handed over.
const SILVICULTURE_HANDOVER = {
  prompt: 'The program goes to whoever picks it up next. How do you hand it over?',
  options: [
    { label: 'Hand over every plot card, survey card and treatment record as it stands', hint: 'The next supervisor, and anyone from C&E, starts from what is on the ground.', value: 'integrity' },
    { label: 'Tell the licensee the shortfall was the contractors’', hint: 'Risky. The plot cards and the invoices say who signed what.', value: 'spin' },
    { label: 'Walk the incoming supervisor and the foremen through each block', hint: 'The crews keep working when the name on the binder changes.', value: 'people' },
  ],
};

const HANDOVER_PROMPTS = {
  silviculture: SILVICULTURE_HANDOVER,
  planning: PLANNING_HANDOVER,
  permitting: PERMITTING_HANDOVER,
  desk: PERMITTING_HANDOVER,
};

/**
 * What the spin and people stances read like for the desk roles; the default
 * lines are written for a field season.
 */
const PLANNING_REPORT_LINES = {
  spinWin: 'The licensee takes your version. The district’s own file says what it says.',
  spinBust: 'District staff set your account beside their own file. The gap is noted, and your name is on it.',
  // An approved plan has no gap with the district's file; what the spin
  // leaves behind is a sealed rationale that says less than the plan does.
  approvedSpinWin: 'The summary reads the way the licensee wanted. The conditions are still in the plan, if anyone reads that far.',
  approvedSpinBust: 'The first FPB complaint pulls the summary and the plan side by side. The caveats you left out are in the plan, and your seal is on both.',
  people: 'The Nation’s referral staff hear it from you first. The next referral starts warmer.',
};
const PERMITTING_REPORT_LINES = {
  spinWin: 'The files close. On paper, the queue was tidy.',
  spinBust: 'A complaint to the Forest Practices Board pulls one of the thin files. The gaps show, and your name is on it.',
  people: 'The thank-you notes cost nothing, and next year’s referrals come back a little faster.',
};
const DESK_REPORT_LINES = {
  planning: PLANNING_REPORT_LINES,
  permitting: PERMITTING_REPORT_LINES,
  desk: PERMITTING_REPORT_LINES,
};

/**
 * Resolve the final report stance into a score adjustment and narration.
 * Pure aside from the injectable rng (for the 'spin' gamble).
 * @param {string} style - integrity | spin | people
 * @param {Object} journey
 * @param {Function} rng - random source, defaults to Math.random
 * @returns {{delta: number, lines: string[]}}
 */
export function resolveFinalReport(style, journey, rng = Math.random, { victory = true } = {}) {
  // Silviculture's report is read against the plot cards and the check
  // survey, so its odds come from the run (js/modes/silvicultureIntegrity.js).
  if (journey?.journeyType === 'silviculture') return resolveSilvicultureFinalReport(style, journey, rng);
  const deskLines = DESK_REPORT_LINES[journey?.journeyType] || null;
  if (deskLines) return resolveDeskFinalReport(style, journey, rng, deskLines, victory);
  const hasCrew = Boolean(journey.crew?.length);
  switch (style) {
    case 'spin': {
      if (rng() < 0.65) {
        return {
          delta: 6,
          lines: [deskLines?.spinWin || 'The framing lands. On paper, this was a tidy operation.'],
        };
      }
      return {
        delta: -10,
        lines: [deskLines?.spinBust || 'A check survey unpicks the framing line by line. The file gets flagged, and your name is on it.'],
      };
    }
    case 'people':
      return {
        delta: hasCrew ? 4 : 3,
        lines: [
          hasCrew
            ? 'Word gets around that you put your people first. Next season’s signup sheet fills fast.'
            : deskLines?.people || 'The thank-you notes cost nothing and buy goodwill money can’t.',
        ],
      };
    case 'integrity':
    default:
      return {
        delta: 2,
        lines: ['Nothing comes of it, which is the point. If anyone ever pulls the file, it holds.'],
      };
  }
}

/** What the desk's report stances are worth: see resolveDeskFinalReport. */
export const DESK_REPORT_DELTAS = { integrity: 4, people: 2, spinWin: 4, spinBust: -10 };

/**
 * The desk roles' closing report. The straight record is worth the most for
 * certain; thanks are worth something; a thin record is a gamble whose odds
 * shrink with the scrutiny already on the file, and it loses on average
 * even on a clean one. The old flat odds made spin a small positive bet and
 * a thank-you note worth more than an honest file.
 */
function resolveDeskFinalReport(style, journey, rng, lines, victory) {
  const planningApproved = journey?.journeyType === 'planning' && victory;
  switch (style) {
    case 'spin': {
      const scrutiny = Math.max(0, Math.min(100, Number(journey?.scrutiny) || 0));
      const odds = Math.max(0.2, 0.55 - scrutiny / 150);
      if (rng() < odds) {
        return { delta: DESK_REPORT_DELTAS.spinWin, lines: [planningApproved ? lines.approvedSpinWin : lines.spinWin] };
      }
      return { delta: DESK_REPORT_DELTAS.spinBust, lines: [planningApproved ? lines.approvedSpinBust : lines.spinBust] };
    }
    case 'people':
      return { delta: DESK_REPORT_DELTAS.people, lines: [lines.people] };
    case 'integrity':
    default:
      return {
        delta: DESK_REPORT_DELTAS.integrity,
        lines: ['Nothing comes of it, which is the point. If anyone ever pulls the file, it holds.'],
      };
  }
}

// ---------------------------------------------------------------------------
// Stage 2.5: Moments that mattered — callbacks to the run's biggest events
// ---------------------------------------------------------------------------

const SEVERITY_RANK = { severe: 4, major: 3, moderate: 2, minor: 1, positive: 1 };

/**
 * Pick the 2-3 logged events most worth remembering, biggest first.
 * @param {Object} journey
 * @param {number} limit
 * @returns {Array<{day: number, title: string, choice: string, victimName?: string}>}
 */
export function pickKeyMoments(journey, limit = 3) {
  // A situation set aside is not a moment that mattered; it is one that didn't.
  const entries = (journey.log || []).filter((e) => e.type === 'event' && e.eventTitle && !e.setAside);
  return entries
    .map((e) => ({
      day: e.day,
      title: e.eventTitle,
      choice: e.optionLabel,
      victimName: e.victimName,
      rank: (SEVERITY_RANK[e.severity] || 0) + (e.victimName ? 2 : 0),
    }))
    .sort((a, b) => b.rank - a.rank || a.day - b.day)
    .slice(0, limit);
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

// What a hand who finished the season strong asks for next, by the job they
// did. A crew of five used to read the same line five times.
const STRONG_BY_ROLE = {
  faller: 'Came back stronger than they left. Asks to hang the next boundary themselves.',
  bucker: 'Came home with every plot card legible. Signs on for the fall cruise.',
  spotter: 'Asks to run the compass on the next traverse instead of the chain.',
  driver: 'Knows every soft spot on the mainline now. Already booked to drive the fall crew.',
  mechanic: 'Kept the trucks rolling all season and has opinions about next year\'s fleet.',
  checker: 'Plots came back tight all season. Asks for the hardest contract next spring.',
  surveyor: 'Wants the free-growing surveys again next year, on the same blocks.',
};

const STRONG_LINES = [
  'Came back stronger than they left. Asks to run point next year.',
  'Tells the office they want the same crew next season, and means it.',
  'Signs on for next season before the trucks are unloaded.',
];
const WORN_LINES = [
  'Healing up over the winter. The stories are worth the scars, they say.',
  'Takes a month off to let the knees argue it out. Back for spring.',
  'Sleeps most of October. Says the season was worth it and the body disagrees.',
];
const LOW_MORALE_WIN_LINES = [
  'Glad it is done. Takes the winter to decide whether the bush is still the job.',
  'Banks the season and does not answer the phone until March.',
];
const STEADY_WIN_LINES = [
  'Banks the season and books two weeks somewhere with no trees.',
  'Puts the season\'s pay on the truck loan and sleeps for a week.',
  'Spends the fall back in the same country, hunting on their own time.',
  'Takes the cheque home and fixes the porch they have been putting off.',
];
const DEFEAT_STEADY_LINES = [
  'Shrugs it off. "Some years the bush wins." Already asking about next season.',
  'Says the plan was sound and the season was not. Wants another go at the same ground.',
  'Takes a winter contract and keeps the field book. Next time they will see it coming.',
];
const DEFEAT_LOW_LINES = [
  'Quietly updating a resume, but hasn’t handed it in yet.',
  'Takes a town job for the winter and does not say whether they will be back.',
];
// The crew that drove out when the food box ran dry did not finish the season.
const WALKED_OFF_LINES = [
  'Drove out with the crew when the food ran out. Tells every new crew lead to check the grub box before the fuel gauge.',
  'Rode out in the crummy with an empty cooler. Took a planting contract two valleys over.',
  'Walked off hungry and says so plainly. Would work for you again, with a cook on the payroll.',
  'Went home and ate for three days. Has not decided about next season.',
  'Signed on with another outfit before the week was out. They feed their crews.',
];
const EVACUATED_LINES = [
  'Off the crew for the season; the WorkSafeBC file is still open. Sends the crew a photo from physio.',
  'Spent the rest of the season on modified duties in town. Checks the crew\'s progress on the office board every morning.',
  'Home and healing. The claim is closing; they want the first shift of next season.',
];
const QUIT_LOW_LINES = [
  'Last seen driving south. The resignation letter was one sentence long.',
  'Gone before the season closed. Left their caulks by the cook shack door.',
];
const QUIT_LINES = [
  'Took a town job with regular hours. Sends the crew fish pictures.',
  'Took a mill job closer to home. Still texts the crew on the first day of every season.',
];

/** A stable number from a crew member's id, so one member keeps one line. */
function memberSeed(member) {
  const key = String(member?.id ?? member?.name ?? '');
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

/**
 * The first line in `lines` nobody else on this crew has been given yet,
 * starting at this member's own place in the pool. `context.used` carries
 * the lines already handed out; without it the pick is still stable.
 */
function pickFresh(lines, member, context) {
  const used = context.used;
  const start = memberSeed(member) % lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[(start + i) % lines.length];
    if (!used?.has(line)) {
      used?.add(line);
      return line;
    }
  }
  return lines[start];
}

/**
 * One-line epilogue for a crew member, based on fate, role, traits and
 * condition. Lines already given to someone else on the crew are skipped.
 * @param {Object} member - Crew member
 * @param {Object} context - { victory, reportStyle, injuredAt, used, walkedOff, treatedCalls }
 * @returns {string}
 */
export function buildCrewEpilogue(member, context = {}) {
  const { victory = false, reportStyle = 'integrity' } = context;
  const info = getCrewDisplayInfo(member);
  const name = `${info.name} (${info.role})`;
  const say = (lines) => `${name}: ${pickFresh(lines, member, context)}`;

  if (member.isDead || (!member.isActive && !member.hasQuit)) {
    return say(EVACUATED_LINES);
  }
  if (member.hasQuit) {
    return say(member.morale < 30 ? QUIT_LOW_LINES : QUIT_LINES);
  }
  if (!member.isActive) {
    return `${name}: Recovering well. The doctors say next season is realistic.`;
  }
  // Still on the roster when the food ran out: they drove out with the rest.
  if (context.walkedOff) {
    return say(WALKED_OFF_LINES);
  }
  // Survivors who took an injury during a logged event remember exactly where
  if (context.injuredAt?.has(member.id)) {
    const where = context.injuredAt.get(member.id);
    return `${name}: Still favours the side they hurt during ${where}. Tells the story like it was a fair trade.`;
  }

  // Active survivors: trait flavour first, then role and condition
  for (const traitId of member.traits || []) {
    const line = TRAIT_EPILOGUES[traitId] && `${capitalize(TRAIT_EPILOGUES[traitId])}.`;
    if (line && !context.used?.has(line)) {
      context.used?.add(line);
      return `${name}: ${line}`;
    }
  }

  if (!victory) {
    return say(member.morale >= 50 ? DEFEAT_STEADY_LINES : DEFEAT_LOW_LINES);
  }
  if (member.health < 40) return say(WORN_LINES);
  if (member.morale < 40) return say(LOW_MORALE_WIN_LINES);
  // The attendant's season is the calls they answered.
  const calls = Number(context.treatedCalls) || 0;
  const own = member.role === 'medic'
    ? (calls > 0
      ? `Wrote up all ${calls} first-aid call${calls === 1 ? '' : 's'} this season and renews the OFA 3 early.`
      : 'Opened the kit for blisters and a splinter all season. Renews the OFA 3 anyway.')
    : (member.health > 80 && member.morale > 70 ? STRONG_BY_ROLE[member.role] : null);
  if (own && !context.used?.has(own)) {
    context.used?.add(own);
    return `${name}: ${own}`;
  }
  if (member.health > 80 && member.morale > 70) return say(STRONG_LINES);
  const appendix = 'Saw their name in the report appendix and bought a frame for it.';
  if (reportStyle === 'people' && !context.used?.has(appendix)) {
    context.used?.add(appendix);
    return `${name}: ${appendix}`;
  }
  return say(STEADY_WIN_LINES);
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
 * How the woodlands manager spends the next year, by the posture they ran.
 */
const MANAGER_POSTURE_EPILOGUES = {
  conservative: 'methodical as ever',
  'relationship-focused': 'still keeping the engagement table warm',
  'aggressive-growth': "already scouting next year's BCTS sales",
  'cost-cutting': 'already reopening the haul rates',
};

const CERTIFICATION_EPILOGUES = {
  certified: 'The certificate hangs in reception, and buyers notice.',
  suspended: 'Suspended at the surveillance audit. The buyers remember the letter.',
  withdrawn: 'Withdrawn after the re-audit. The system binder is on a shelf.',
  corrective: 'Still working through the corrective-action request.',
  pending: 'The registration audit never happened on your watch.',
};

/**
 * Epilogue lines for manager journeys: the woodlands manager who ran the
 * posture, and how each certification came through its audits.
 * @param {Object} journey
 * @param {boolean} victory
 * @returns {string[]}
 */
export function buildManagerEpilogue(journey, victory) {
  const lines = [];
  if (journey.ceo) {
    const style = MANAGER_POSTURE_EPILOGUES[journey.ceo.decision_making_style] || 'methodical as ever';
    lines.push(victory
      ? `Woodlands manager ${journey.ceo.name}: renewed for another year, ${style}.`
      : `Woodlands manager ${journey.ceo.name}: moved on to a competitor. The handshake was firm, the exit interview firmer.`);
  }
  for (const cert of journey.certifications || []) {
    const status = cert.status || 'certified';
    const line = status === 'certified' && !victory
      ? 'The audit binder outlived the tenure.'
      : CERTIFICATION_EPILOGUES[status] || CERTIFICATION_EPILOGUES.certified;
    lines.push(`${cert.name}: ${line}`);
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
  return foldRunIntoRecord(record, journey.journeyType || 'field', {
    score: scoreResult.totalScore,
    grade: scoreResult.grade,
    victory: Boolean(victory),
  }, getCareerDeltas(journey, victory));
}

/**
 * The lifetime field-record counters one deployment adds (km surveyed,
 * seedlings planted, ...). Shared with the campaign, whose seasons are
 * deployments too.
 * @param {Object} journey
 * @param {boolean} victory
 * @returns {Object}
 */
export function getCareerDeltas(journey, victory) {
  const type = journey.journeyType || 'field';

  const careerDeltas = {};
  switch (type) {
    case 'recon':
    case 'field':
      careerDeltas.kmSurveyed = Math.round(journey.distanceTraveled || 0);
      break;
    case 'silviculture':
      careerDeltas.seedlingsPlanted = journey.planting?.seedlingsPlanted || 0;
      break;
    case 'planning':
      careerDeltas.plansApproved = victory ? 1 : 0;
      break;
    case 'permitting':
    case 'desk':
      careerDeltas.permitsApproved = journey.permits?.approved || 0;
      break;
    case 'manager':
      careerDeltas.daysInTheChair = Math.max(0, (journey.day || 1) - 1);
      break;
  }
  return careerDeltas;
}

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
  // Why the run ended, before anything else is asked. A goodwill loss used
  // to surface only after the archive prompt, two screens later.
  if (journey.endReason) {
    if (victory) ui.write(journey.endReason, 'term-dim');
    else ui.writeDanger(journey.endReason);
  }
  // A caught shortcut whose determination had not landed when the run ended
  // lands now, before anything is scored (js/events/shortcutRecord.js).
  const lateFallout = settleOutstandingFallout(journey);
  if (lateFallout.length) {
    ui.write('');
    ui.writeDivider('AFTER THE SEASON');
    for (const line of lateFallout) ui.writeWarning(line);
  }
  ui.write('');
  const report = getFinalReportPrompt(journey.journeyType, { victory });
  const choice = await ui.promptChoice(report.prompt, report.options);
  const reportStyle = choice.value || 'integrity';
  const reportResult = resolveFinalReport(reportStyle, journey, Math.random, { victory });
  ui.write('');
  for (const line of reportResult.lines) {
    ui.write(line);
  }
  journey.finalReport = { style: reportStyle, delta: reportResult.delta };
  await next(ui);

  // The grade is settled now; the banner and the grade line follow it, so
  // a delivered run that grades D or F is not announced as a success.
  const scoreResult = calculateScore(journey, victory);
  scoreResult.totalScore = Math.max(0, Math.min(100, scoreResult.totalScore + reportResult.delta));
  scoreResult.grade = getLetterGrade(scoreResult.totalScore);

  // --- Stage 2: The road home ---
  ui.clear();
  ui.writeHeader(getEndBanner(victory, scoreResult.grade));
  ui.writeBox(pickEndArt(journey, victory));
  ui.write(victory
    ? buildVictoryNarrative(journey, areaName, crewName, daysUsed)
    : buildDefeatNarrative(journey, areaName, crewName, daysUsed));
  ui.write('');
  ui.writeDivider('FINAL STATISTICS');
  writeFinalStatistics(ui, journey);

  // Picked by weight, told in the order they happened.
  const moments = pickKeyMoments(journey).sort((a, b) => a.day - b.day);
  if (moments.length) {
    ui.write('');
    ui.writeDivider('MOMENTS THAT MATTERED');
    const dayLabel = journey.journeyType === 'field' || journey.journeyType === 'recon' ? 'Shift' : journey.journeyType === 'manager' ? 'Month' : 'Day';
    for (const m of moments) {
      const injury = m.victimName ? ` ${m.victimName} carries the scar.` : '';
      ui.write(`${dayLabel} ${m.day} — ${m.title}. You chose: ${m.choice}.${injury}`);
    }
  }
  await next(ui);

  // --- Stage 3: Where are they now ---
  const injuredAt = new Map();
  for (const entry of journey.log || []) {
    if (entry.victimId && !injuredAt.has(entry.victimId)) {
      injuredAt.set(entry.victimId, entry.eventTitle);
    }
  }
  const epilogueContext = {
    victory,
    reportStyle,
    injuredAt,
    // One crew, one set of lines: nobody gets a line someone else already has.
    used: new Set(),
    walkedOff: Boolean(journey.crewWalkedOff),
    treatedCalls: (journey.log || []).filter((entry) => entry.victimId).length,
  };
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
  if (victory && !isFailingGrade(scoreResult.grade)) {
    // An A-grade run earns the sky.
    if (String(scoreResult.grade).startsWith('A') && typeof ui.playScene === 'function') {
      const { buildFireworksFrames } = await import('../scene/textmode/scenes.js');
      await ui.playScene(buildFireworksFrames({ seed: scoreResult.totalScore + 1 }), { delay: 120 });
    }
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
  // A failing grade is not a best worth announcing, even on a first run.
  if (updated.isBest && scoreResult.grade !== 'F') {
    ui.writePositive(`New personal best for ${ROLE_LABELS[journey.journeyType] || journey.journeyType}!`);
    ui.write('');
  }
  ui.write(`Career runs on record: ${updated.runs}`);
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

/** D and F: the work may be done, but the run is not a success. */
function isFailingGrade(grade) {
  return /^[DF]/.test(String(grade || ''));
}

/**
 * The end-of-run banner: success only when the work was delivered and the
 * grade says it was done well enough to call it one.
 * @param {boolean} victory
 * @param {string} grade
 * @returns {string}
 */
export function getEndBanner(victory, grade) {
  if (!victory) return 'EXPEDITION FAILED';
  return isFailingGrade(grade) ? 'EXPEDITION COMPLETE' : 'EXPEDITION SUCCESSFUL';
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
