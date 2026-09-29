/**
 * Silviculture program integrity.
 *
 * The supervisor signs the plot cards, the survey cards and the declarations
 * that go into RESULTS. A false record is not a scrutiny point: it is a
 * statement the district can prove wrong, and when it does, everything else
 * with the same signature gets read again. This ledger keeps the shortcuts a
 * run took, whether anyone has found them yet, and what that costs the grade.
 *
 * Kept out of the day runner so the scoring and the final report can read it
 * without pulling in the mode.
 */

import { ILLEGAL_ACTS } from '../data/illegalActs.js';

/** Grade points a shortcut costs once the district has it on file. */
export const INTEGRITY_PENALTY = {
  falseRecord: 20,  // a falsified plot card, survey or RESULTS entry
  shortcut: 6,      // a caught field shortcut (spill, spray, safety)
};

/** Caught falsifications before the licensee pulls you off the program. */
export const PROGRAM_PULLED_AT = 2;

// Temptation categories that put a false statement in the file.
const FALSE_RECORD_CATEGORIES = new Set(['results', 'professional', 'cruise', 'timber-mark']);
const FALSE_RECORD_TAGS = new Set(['fraud', 'falsification', 'records']);

const TAKE_LABELS = new Set(['Take the shortcut', 'Let it stand']);

function ensureLedger(journey) {
  if (!journey) return { records: [], audited: false };
  const ledger = journey.programIntegrity || (journey.programIntegrity = {});
  if (!Array.isArray(ledger.records)) ledger.records = [];
  ledger.audited = Boolean(ledger.audited);
  return ledger;
}

function isFalseRecordAct(act) {
  if (!act) return false;
  if (FALSE_RECORD_CATEGORIES.has(act.category)) return true;
  return (act.tags || []).some((tag) => FALSE_RECORD_TAGS.has(tag));
}

/**
 * Put a shortcut on the ledger.
 * @param {Object} journey
 * @param {{id: string, title: string, kind: 'false-record'|'shortcut', status: 'clean'|'noticed'|'caught', source?: string}} entry
 * @returns {Object} the record
 */
export function recordProgramShortcut(journey, entry) {
  const ledger = ensureLedger(journey);
  const record = {
    id: entry.id,
    title: entry.title,
    kind: entry.kind === 'false-record' ? 'false-record' : 'shortcut',
    status: ['clean', 'noticed', 'caught'].includes(entry.status) ? entry.status : 'clean',
    source: entry.source || 'program',
    day: Number(journey?.day) || 0,
  };
  ledger.records.push(record);
  return record;
}

/**
 * Read how a temptation the day just resolved actually landed, from the log
 * entry it wrote, and put a taken shortcut on the ledger.
 * @param {Object} journey
 * @param {Object} event - the event as it was presented
 * @returns {Object|null} the record, or null when nothing was taken
 */
export function recordTemptationOutcome(journey, event) {
  if (!event?.temptationActId) return null;
  const entry = [...(journey?.log || [])].reverse()
    .find((candidate) => candidate?.type === 'event' && candidate.eventId === event.id);
  if (!entry || !TAKE_LABELS.has(entry.optionLabel)) return null;
  const option = (event.options || []).find((candidate) => candidate?.label === entry.optionLabel);
  let status = 'clean';
  if (option?.failureOutcome && entry.outcome === option.failureOutcome) status = 'caught';
  else if (option?.partialOutcome && entry.outcome === option.partialOutcome) status = 'noticed';
  const act = ILLEGAL_ACTS.find((candidate) => candidate?.id === event.temptationActId) || null;
  return recordProgramShortcut(journey, {
    id: event.temptationActId,
    title: act?.title || event.title,
    kind: isFalseRecordAct(act) ? 'false-record' : 'shortcut',
    status,
    source: 'temptation',
  });
}

/**
 * What the ledger adds up to.
 * @param {Object} journey
 */
export function summarizeIntegrity(journey) {
  const records = journey?.programIntegrity?.records || [];
  const falseRecords = records.filter((record) => record.kind === 'false-record');
  const caughtFalseRecords = falseRecords.filter((record) => record.status === 'caught').length;
  const caughtShortcuts = records.filter((record) => record.kind !== 'false-record' && record.status === 'caught').length;
  return {
    falseRecords: falseRecords.length,
    openFalseRecords: falseRecords.length - caughtFalseRecords,
    caughtFalseRecords,
    caughtShortcuts,
    penalty: caughtFalseRecords * INTEGRITY_PENALTY.falseRecord + caughtShortcuts * INTEGRITY_PENALTY.shortcut,
    programPulled: caughtFalseRecords >= PROGRAM_PULLED_AT,
  };
}

/**
 * The district's check at season close. Every shortcut still on the ledger
 * gets read against the ground: one somebody already noticed is likely to
 * surface, and a file the district is already reading is read closely.
 * Runs once per journey.
 * @param {Object} journey
 * @param {Function} [rng]
 * @returns {string[]} lines to print
 */
export function runSeasonCloseAudit(journey, rng = Math.random) {
  const ledger = ensureLedger(journey);
  if (ledger.audited) return [];
  ledger.audited = true;
  const open = ledger.records.filter((record) => record.status !== 'caught');
  if (open.length === 0) return [];

  const scrutiny = Number(journey?.scrutiny) || 0;
  const watched = (journey?.consequenceFlags || []).includes('ce_watching');
  const lines = [];
  for (const record of open) {
    const base = record.status === 'noticed' ? 0.6 : 0.3;
    const chance = Math.min(0.9, base + Math.max(0, scrutiny - 30) / 100 + (watched ? 0.15 : 0));
    if (rng() < chance) {
      record.status = 'caught';
      record.caughtAtClose = true;
      lines.push(record.kind === 'false-record'
        ? `The district's check survey reads ${record.title.toLowerCase()} against the ground. It does not match, and the signature on it is yours.`
        : `The season-close inspection finds ${record.title.toLowerCase()}. It goes in the file.`);
    }
  }
  return lines;
}

/**
 * The regeneration report, silviculture's closing decision. Filing it as
 * surveyed is never the losing play: the spin is a gamble whose odds the run
 * has already set, through its scrutiny and what else is in the file.
 * @param {string} style - integrity | spin | people
 * @param {Object} journey
 * @param {Function} [rng]
 * @returns {{delta: number, lines: string[]}}
 */
export function resolveSilvicultureFinalReport(style, journey, rng = Math.random) {
  const summary = summarizeIntegrity(journey);
  const scrutiny = Number(journey?.scrutiny) || 0;
  switch (style) {
    case 'spin': {
      const odds = Math.max(0.05, Math.min(0.55, 0.55 - Math.max(0, scrutiny - 20) / 100 - 0.2 * summary.falseRecords));
      if (rng() < odds) {
        return {
          delta: 3,
          lines: ['The projection holds, for now. The district files the report and books a check survey on your blocks for next summer anyway.'],
        };
      }
      return {
        delta: -12,
        lines: ['The district\'s check survey lands its plots on the blocks you projected. The report and the plot cards disagree, and the report has your name on it.'],
      };
    }
    case 'people':
      return {
        delta: 2,
        lines: ['The foremen hear their crews named in the district report. Next spring the good outfits call you first.'],
      };
    case 'integrity':
    default:
      if (summary.falseRecords > 0) {
        return {
          delta: 2,
          lines: ['The numbers go in as surveyed. It does not undo what else is in the file, but this part of it holds.'],
        };
      }
      return {
        delta: 4,
        lines: ['The numbers go in as surveyed. The district\'s check survey lands close to yours, and the next declaration you sign gets read a little faster.'],
      };
  }
}
