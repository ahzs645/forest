/**
 * The shortcut record: what a run's shortcuts left behind, where the player
 * can see it, and how it outlives the day it was chosen.
 *
 * A noticed or caught shortcut leaves a watch flag that worsens every later
 * shortcut (js/events/selection.js), and a caught one leaves a determination
 * still to land (js/events/fallout.js). Both used to vanish from view the
 * moment the outcome line scrolled away, and a campaign dropped them at every
 * season boundary. This module is the reading side: the mission panel's
 * alerts, the season review's lines, the carry from one campaign deployment
 * to the next, and the settling of determinations a run ends before.
 */

import { TEMPTATION_FLAG_LABELS } from './odds.js';
import { ILLEGAL_ACTS } from '../data/illegalActs.js';
import { getPendingFallout } from './fallout.js';
import { applyEventEffects } from './resolution.js';
import { applyConsequenceFlags } from './consequences.js';
import { describeEffectChips } from './display.js';
import { institutionDisplayName, reconcileTakenShortcuts } from './selection.js';

const TAKE_LABELS = new Set(['Take the shortcut', 'Let it stand']);
const BAND_NAMES = { good: 'clean', partial: 'noticed', bad: 'caught' };

// Flags a campaign carries to the next deployment: every watch, and the open
// professional and criminal files. A soured valley goes too.
const CARRIED_FLAGS = new Set([...Object.keys(TEMPTATION_FLAG_LABELS), 'locals_soured']);
const SERIOUS_FLAGS = new Set(['fpbc_file_open', 'rcmp_file']);

function actTitle(actId) {
  return ILLEGAL_ACTS.find((act) => act?.id === actId)?.title || 'a shortcut';
}

function actInstitution(actId) {
  return ILLEGAL_ACTS.find((act) => act?.id === actId)?.catch?.by || null;
}

function dayWord(journey) {
  if (journey?.journeyType === 'manager') return 'month';
  return ['recon', 'field'].includes(journey?.journeyType) ? 'shift' : 'day';
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

/**
 * Every shortcut the run took or let stand, and how it landed.
 * @param {Object} journey
 * @returns {Array<{actId: string, title: string, day: number, band: string, institution: string|null}>}
 */
export function listShortcutsTaken(journey) {
  const taken = [];
  for (const entry of journey?.log || []) {
    if (entry?.type !== 'event' || typeof entry.eventId !== 'string') continue;
    const match = entry.eventId.match(/^temptation_(?:reoffer_|goaround_)?(.+)$/);
    if (!match || match[1].startsWith('fallout_') || !TAKE_LABELS.has(entry.optionLabel)) continue;
    taken.push({
      actId: match[1],
      title: actTitle(match[1]),
      day: Number(entry.day) || 0,
      band: BAND_NAMES[entry.band] || 'clean',
      institution: actInstitution(match[1]),
    });
  }
  return taken;
}

/**
 * The shortcut flags standing on the run.
 * @param {Object} journey
 * @returns {string[]}
 */
export function activeShortcutFlags(journey) {
  return (journey?.consequenceFlags || []).filter((flag) => TEMPTATION_FLAG_LABELS[flag]);
}

/**
 * Mission-panel alerts for what the run's shortcuts left standing: who is
 * watching (and that it worsens the odds), and each determination still to
 * land.
 * @param {Object} journey
 * @returns {Array<{level: string, text: string}>}
 */
export function describeShortcutWatch(journey) {
  const alerts = [];
  const flags = activeShortcutFlags(journey);
  if (flags.length) {
    const serious = flags.filter((flag) => SERIOUS_FLAGS.has(flag));
    const watches = flags.filter((flag) => !SERIOUS_FLAGS.has(flag));
    for (const flag of serious) {
      alerts.push({ level: 'danger', text: `On your record: ${TEMPTATION_FLAG_LABELS[flag]}.` });
    }
    if (watches.length) {
      alerts.push({
        level: 'warn',
        text: `Watched: ${watches.map((flag) => TEMPTATION_FLAG_LABELS[flag]).join('; ')}. Shortcut odds are worse.`,
      });
    }
  }
  const unit = dayWord(journey);
  for (const entry of journey?.temptationMemory?.pendingCatches || []) {
    alerts.push({
      level: 'danger',
      text: `Coming: ${institutionDisplayName(entry.institution)} on “${entry.title}”, ${unit} ${entry.dueDay}.`,
    });
  }
  return alerts;
}

/**
 * A mode's mission status with the shortcut alerts added, so every mode's
 * panel shows them without each mode building them.
 * @param {Object|null} status
 * @param {Object|null} journey
 * @returns {Object|null}
 */
export function withShortcutWatch(status, journey) {
  if (!status || !journey) return status;
  const alerts = describeShortcutWatch(journey);
  if (!alerts.length) return status;
  return { ...status, alerts: [...(status.alerts || []), ...alerts] };
}

/**
 * Land every determination still waiting when the run closes: the season is
 * over, the letters are not. Applies each one's effects and flags, logs it,
 * and hands back the lines to print.
 * @param {Object} journey
 * @returns {string[]}
 */
export function settleOutstandingFallout(journey) {
  const queue = getPendingFallout(journey);
  const lines = [];
  while (queue.length) {
    const entry = queue.shift();
    const messages = [];
    applyEventEffects(journey, entry.effects || {}, messages);
    applyConsequenceFlags(journey, entry.flags || [], messages);
    const costs = describeEffectChips(entry.effects || {}, journey?.journeyType).join(', ');
    const line = `${capitalize(institutionDisplayName(entry.institution))} decides on “${entry.title}” after the season${costs ? `: ${costs}` : ''}.`;
    lines.push(line);
    if (!journey.log) journey.log = [];
    journey.log.push({
      day: journey.day,
      type: 'event',
      eventId: `temptation_fallout_${entry.actId}`,
      eventTitle: `Fallout: ${entry.title}`,
      optionLabel: 'Settled at close',
      outcome: line,
      consequences: messages,
      effects: { ...(entry.effects || {}) },
      severity: 'minor',
    });
  }
  return lines;
}

function capitalize(text) {
  const value = String(text || '');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * A season's shortcuts as the tail of its Year in Review line.
 * @param {{taken: number, noticed: number, caught: number}} [counts]
 * @returns {string} empty when the season took none
 */
export function describeSeasonShortcuts(counts) {
  const taken = Number(counts?.taken) || 0;
  if (!taken) return '';
  const parts = [];
  if (counts.noticed) parts.push(`${counts.noticed} noticed`);
  if (counts.caught) parts.push(`${counts.caught} caught`);
  return ` · ${taken} shortcut${taken === 1 ? '' : 's'} taken${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

/** A campaign's shortcut record, created on first use. */
export function ensureCampaignShortcuts(campaign) {
  const record = campaign.shortcuts || (campaign.shortcuts = {});
  for (const key of ['flags', 'seenActIds', 'takenActIds', 'pendingCatches', 'history']) {
    if (!Array.isArray(record[key])) record[key] = [];
  }
  return record;
}

/**
 * Start a campaign deployment with what the year's shortcuts left: the watch
 * flags and open files, the acts already offered and taken (they count
 * toward later odds and are not offered again), and any determination still
 * to land, due early in the new season.
 * @param {Object} campaign
 * @param {Object} journey - the fresh deployment
 * @returns {string[]} lines for the deployment screen
 */
export function carryShortcutsIntoJourney(campaign, journey) {
  const record = ensureCampaignShortcuts(campaign);
  journey.consequenceFlags = unique([...(journey.consequenceFlags || []), ...record.flags]);
  const memory = journey.temptationMemory || (journey.temptationMemory = {});
  memory.seenActIds = unique([...(memory.seenActIds || []), ...record.seenActIds]);
  memory.takenActIds = unique([...(memory.takenActIds || []), ...record.takenActIds]);
  memory.pendingCatches = record.pendingCatches.map((entry, index) => ({ ...entry, dueDay: 2 + index }));

  const lines = [];
  const flags = activeShortcutFlags(journey);
  if (flags.length) {
    lines.push(`Still on your record from earlier in the year: ${flags.map((flag) => TEMPTATION_FLAG_LABELS[flag]).join('; ')}. Shortcut odds start worse.`);
  }
  for (const entry of memory.pendingCatches) {
    lines.push(`${capitalize(institutionDisplayName(entry.institution))} has not decided on “${entry.title}” yet. It lands early this season.`);
  }
  return lines;
}

/**
 * Close a campaign deployment's shortcuts into the year's record, and say
 * what they were for the season review.
 * @param {Object} campaign
 * @param {Object} journey - the finished deployment
 * @param {Object} season - { label }
 * @returns {{lines: string[], counts: {taken: number, noticed: number, caught: number}}}
 */
export function collectShortcutsFromJourney(campaign, journey, season) {
  const record = ensureCampaignShortcuts(campaign);
  // The log is the record of what was taken; the memory only catches up
  // with it when the next offer is drawn, so a shortcut taken after the
  // season's last offer check was dropped from the year's count.
  reconcileTakenShortcuts(journey);
  const memory = journey.temptationMemory || {};
  const label = String(season?.label || 'the season').toLowerCase();
  const unit = dayWord(journey);

  record.flags = unique((journey.consequenceFlags || []).filter((flag) => CARRIED_FLAGS.has(flag)));
  record.seenActIds = unique(memory.seenActIds);
  record.takenActIds = unique(memory.takenActIds);
  record.pendingCatches = (memory.pendingCatches || []).map((entry) => ({
    ...entry,
    takenWhen: entry.takenWhen || `${label}, on ${unit} ${entry.takenDay}`,
  }));

  const taken = listShortcutsTaken(journey);
  const landed = new Set((journey.log || [])
    .filter((entry) => typeof entry?.eventId === 'string' && entry.eventId.startsWith('temptation_fallout_'))
    .map((entry) => entry.eventId.slice('temptation_fallout_'.length)));
  const counts = { taken: taken.length, noticed: 0, caught: 0 };
  const lines = [];
  for (const shortcut of taken) {
    if (shortcut.band === 'noticed') counts.noticed += 1;
    if (shortcut.band === 'caught') counts.caught += 1;
    record.history.push({ season: season?.label || '', ...shortcut });
    const how = shortcut.band === 'caught'
      ? `caught by ${institutionDisplayName(shortcut.institution)}${landed.has(shortcut.actId) ? '' : ', determination still to land'}`
      : shortcut.band === 'noticed' ? 'noticed, and watched since' : 'nobody noticed, yet';
    lines.push(`Shortcut, ${unit} ${shortcut.day}: “${shortcut.title}” (${how}).`);
  }
  if (record.flags.some((flag) => TEMPTATION_FLAG_LABELS[flag])) {
    lines.push(`Carried into the rest of the year: ${record.flags.filter((flag) => TEMPTATION_FLAG_LABELS[flag]).map((flag) => TEMPTATION_FLAG_LABELS[flag]).join('; ')}.`);
  }
  return { lines, counts };
}
