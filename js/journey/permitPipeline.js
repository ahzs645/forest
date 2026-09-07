/**
 * Permit pipeline — the licensee's queue at the district office.
 *
 * Every file in the queue is a real permit application with a type and a
 * lane. A lane has a minimum days-in-lane clock on the desk's compressed
 * calendar (fifteen calendar days to a desk day, the same compression the
 * planner's FOM comment period uses), so a thirty-day First Nations referral
 * is two desk days and a sixty-day winter one is four. A file is decided when
 * its clock has run and nothing is holding it — an outstanding WSA s.11
 * notification window, an HCA permit the archaeologist still controls, or a
 * deficiency letter the licensee has not answered.
 *
 * The counters on `journey.permits` (backlog, drafting, submitted, inReferral,
 * inReview, needsRevision, approved) stay the persisted summary that saves,
 * progress meters, and authored events read and write. The files are the
 * detail behind them: `reconcilePermitFiles` makes the files match the
 * counters after anything else has moved a counter, and `syncPermitCounters`
 * makes the counters match the files after the pipeline itself has moved a
 * file. Lane names on the files, counter names on the summary:
 *
 *   drafted    ↔ drafting      screening ↔ submitted    referral ↔ inReferral
 *   decision   ↔ inReview      deficiency ↔ needsRevision   issued ↔ approved
 */

import { getPlanningAreaBlockPool, getPlanningBlockHeritageLoad, getPlanningBlockWaterContext } from '../data/planningBlocks.js';
import { getBlocksForArea } from '../data/blocks.js';
import { getSeasonModifiers } from '../season.js';

export const CALENDAR_DAYS_PER_DESK_DAY = 15;
export const DEFAULT_REFERRAL_WINDOW_DAYS = 30;
export const WSA_NOTIFICATION_WINDOW_DAYS = 45;
/** Files a desk moves in a day. A day at the desk is a batch, not a form. */
export const DAILY_PERMIT_THROUGHPUT = 3;
/** Heritage/referral load at which a cutting permit needs its own HCA permit. */
export const HCA_HERITAGE_LOAD_THRESHOLD = 36;

export const PERMIT_LANES = ['drafted', 'screening', 'referral', 'decision', 'deficiency', 'issued'];

const LANE_COUNTER = {
  drafted: 'drafting',
  screening: 'submitted',
  referral: 'inReferral',
  decision: 'inReview',
  deficiency: 'needsRevision',
  issued: 'approved',
};

export const PERMIT_TYPES = {
  CP: {
    code: 'CP',
    title: 'Cutting permit',
    screeningDays: 1,
    screeningNote: 'FOM consistency check',
    referral: true,
    decisionDays: 1,
  },
  RP: {
    code: 'RP',
    title: 'Road permit',
    screeningDays: 1,
    screeningNote: 'Exhibit A / engineering completeness',
    referral: true,
    decisionDays: 1,
  },
  RUP: {
    code: 'RUP',
    title: 'Road use permit',
    screeningDays: 1,
    screeningNote: 'district only — maintenance and industrial-user terms',
    referral: false,
    decisionDays: 1,
  },
  SUP: {
    code: 'SUP',
    title: 'Special use permit',
    screeningDays: 1,
    screeningNote: 'occupancy package',
    referral: true,
    decisionDays: 1,
  },
  HCA: {
    code: 'HCA',
    title: 'Heritage Conservation Act permit',
    screeningDays: 1,
    screeningNote: 'Archaeology Branch — specialist-controlled',
    referral: false,
    decisionDays: 2,
  },
};

// The mix a season's queue is made of, by draft order. Cutting permits carry
// the season; the road, road-use, occupancy and heritage files ride alongside.
const TYPE_SEQUENCE = ['CP', 'CP', 'RP', 'CP', 'RUP', 'CP', 'SUP', 'CP', 'RP', 'CP', 'CP', 'RP', 'CP', 'SUP', 'CP', 'RUP', 'CP', 'RP', 'CP', 'CP'];

function hashString(value) {
  let hash = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function compactBlockId(block) {
  if (!block) return '';
  const parts = [block.timberMark, block.cutBlockId].filter(Boolean);
  if (parts.length) return parts.join('-');
  if (block.openingId) return `OPEN-${block.openingId}`;
  return String(block.label || block.id || '').trim();
}

function getAreaRoadNames(areaId) {
  const names = [];
  for (const block of getBlocksForArea(areaId) || []) {
    const name = String(block?.name || '');
    const match = name.match(/^(.*?)\s+(Road|FSR|Main)\b/i);
    if (match && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/**
 * The referral clock on the desk calendar. SEASONAL_MODIFIERS.permitter names
 * the calendar window (30 days in spring, 45 in summer, 60 over the holidays);
 * fifteen calendar days go by for every day at the desk.
 * @param {Object} journey
 * @returns {{calendarDays: number, deskDays: number}}
 */
export function getReferralWindow(journey) {
  const season = journey?.season?.currentSeason || null;
  const modifiers = season ? getSeasonModifiers(season, 'permitter') : null;
  const calendarDays = Number(modifiers?.referralWindow) || DEFAULT_REFERRAL_WINDOW_DAYS;
  return {
    calendarDays,
    deskDays: Math.max(1, Math.ceil(calendarDays / CALENDAR_DAYS_PER_DESK_DAY)),
  };
}

export function getWsaWindowDeskDays() {
  return Math.max(1, Math.ceil(WSA_NOTIFICATION_WINDOW_DAYS / CALENDAR_DAYS_PER_DESK_DAY));
}

/**
 * The file identities a season draws on, in draft order. Names come off the
 * area's real cutblock pool (timber mark and block id) and its road network.
 */
export function buildPermitFileCatalogue(journey) {
  const areaId = journey?.areaId || journey?.area?.id || null;
  const area = journey?.area || null;
  const blocks = getPlanningAreaBlockPool(areaId);
  const roads = getAreaRoadNames(areaId);
  const catalogue = [];
  const roadUses = new Map();
  let hcaAssigned = false;

  for (let index = 0; index < TYPE_SEQUENCE.length; index += 1) {
    const type = TYPE_SEQUENCE[index];
    const block = blocks.length ? blocks[index % blocks.length] : null;
    const blockId = compactBlockId(block) || `${String(areaId || 'area').slice(0, 4).toUpperCase()}-${index + 1}`;
    const road = roads.length ? roads[index % roads.length] : null;
    const water = block ? getPlanningBlockWaterContext(block, area, null) : { gate: 'clear', hydrologyLabel: 'water timing' };
    const heritage = block ? getPlanningBlockHeritageLoad(block, area) : { score: 0, className: 'light', notes: [] };
    const streamTouch = (type === 'CP' || type === 'RP') && (water.gate !== 'clear' || hashString(`${blockId}:${type}`) % 3 === 0);
    let label;
    switch (type) {
      case 'RP': {
        const uses = (roadUses.get(`RP:${road}`) || 0) + 1;
        roadUses.set(`RP:${road}`, uses);
        label = road ? `RP ${road} spur${uses > 1 ? ` ${uses}` : ''}` : `RP ${blockId} spur`;
        break;
      }
      case 'RUP': {
        const uses = (roadUses.get(`RUP:${road}`) || 0) + 1;
        roadUses.set(`RUP:${road}`, uses);
        label = road ? `RUP ${road} FSR${uses > 1 ? ` (${blockId})` : ''}` : `RUP ${blockId} access`;
        break;
      }
      case 'SUP':
        label = `SUP camp ${blockId}`;
        break;
      default:
        label = `CP ${blockId}`;
        break;
    }
    const needsHca = type === 'CP' && !hcaAssigned && heritage.score >= HCA_HERITAGE_LOAD_THRESHOLD;
    if (needsHca) hcaAssigned = true;
    catalogue.push({
      id: `${type.toLowerCase()}-${blockId.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${index + 1}`,
      type,
      label,
      blockId,
      blockLabel: block?.label || blockId,
      touchesStream: streamTouch,
      streamLabel: water.hydrologyLabel,
      heritageLoad: heritage.score,
      heritageClass: heritage.className,
      needsHca,
    });
  }
  return catalogue;
}

function ensurePermitState(journey) {
  if (!journey.permits) journey.permits = {};
  const permits = journey.permits;
  for (const key of ['backlog', 'drafting', 'submitted', 'inReferral', 'inReview', 'needsRevision', 'approved']) {
    if (!Number.isFinite(permits[key])) permits[key] = 0;
  }
  if (!Array.isArray(permits.files)) permits.files = [];
  if (!Number.isFinite(permits.catalogueCursor)) permits.catalogueCursor = 0;
  return permits;
}

function nextCatalogueEntry(journey) {
  const permits = ensurePermitState(journey);
  const catalogue = buildPermitFileCatalogue(journey);
  const index = permits.catalogueCursor;
  permits.catalogueCursor = index + 1;
  const entry = catalogue.length ? catalogue[index % catalogue.length] : null;
  if (!entry) {
    return { id: `pkg-${index + 1}`, type: 'CP', label: `CP file ${index + 1}`, blockId: '', touchesStream: false, heritageLoad: 0, heritageClass: 'light', needsHca: false };
  }
  const cycle = Math.floor(index / catalogue.length);
  return cycle > 0 ? { ...entry, id: `${entry.id}-r${cycle}`, label: `${entry.label} (amendment ${cycle})` } : { ...entry };
}

function laneDays(file, journey) {
  const def = PERMIT_TYPES[file.type] || PERMIT_TYPES.CP;
  switch (file.lane) {
    case 'screening':
      return def.screeningDays;
    case 'referral':
      return getReferralWindow(journey).deskDays;
    case 'decision':
      return def.decisionDays;
    default:
      return 0;
  }
}

function enterLane(file, lane, journey, { clockDays = null } = {}) {
  const day = Number(journey?.day) || 1;
  file.lane = lane;
  file.laneEnteredDay = day;
  const days = clockDays === null ? laneDays({ ...file, lane }, journey) : clockDays;
  file.clockCloses = lane === 'issued' || lane === 'deficiency' || lane === 'drafted' ? null : day + Math.max(0, days);
  if (lane === 'issued') file.issuedDay = day;
  return file;
}

function createFile(journey, lane, { clockDays = null } = {}) {
  const permits = ensurePermitState(journey);
  const entry = nextCatalogueEntry(journey);
  const file = {
    ...entry,
    lane: 'drafted',
    laneEnteredDay: journey.day || 1,
    clockCloses: null,
    wsaClockCloses: null,
    pausedBy: null,
    holdsFileId: null,
    deficiencyProfileId: null,
    deficiencyCount: 0,
    issuedDay: null,
    chased: 0,
  };
  permits.files.push(file);
  if (lane !== 'drafted') enterLane(file, lane, journey, { clockDays });
  return file;
}

/** Spawn the HCA permit a heritage-heavy cutting permit needs, and pause the CP behind it. */
function attachHcaIfNeeded(journey, file) {
  const permits = ensurePermitState(journey);
  if (!file.needsHca || file.type !== 'CP') return null;
  if (permits.files.some((other) => other.type === 'HCA' && other.holdsFileId === file.id)) return null;
  const hca = {
    id: `hca-${file.id}`,
    type: 'HCA',
    label: `HCA permit ${file.blockId || file.label.replace(/^CP\s+/, '')}`,
    blockId: file.blockId,
    blockLabel: file.blockLabel,
    touchesStream: false,
    heritageLoad: file.heritageLoad,
    heritageClass: file.heritageClass,
    needsHca: false,
    lane: 'drafted',
    laneEnteredDay: journey.day || 1,
    clockCloses: null,
    wsaClockCloses: null,
    pausedBy: null,
    holdsFileId: file.id,
    deficiencyProfileId: null,
    deficiencyCount: 0,
    issuedDay: null,
    chased: 0,
  };
  permits.files.push(hca);
  file.pausedBy = hca.id;
  file.needsHca = false;
  return hca;
}

export function getPermitFiles(journey) {
  return ensurePermitState(journey).files;
}

export function getPermitFilesInLane(journey, lane) {
  return getPermitFiles(journey).filter((file) => file.lane === lane);
}

export function getPermitFileById(journey, fileId) {
  return getPermitFiles(journey).find((file) => file.id === fileId) || null;
}

/**
 * Recompute the counter summary from the files. `backlog` is the one counter
 * with no files behind it — an application nobody has drafted yet has no name.
 */
export function syncPermitCounters(journey) {
  const permits = ensurePermitState(journey);
  for (const [lane, counter] of Object.entries(LANE_COUNTER)) {
    permits[counter] = permits.files.filter((file) => file.lane === lane).length;
  }
  return permits;
}

/**
 * Make the files match the counters. Authored events and the generic progress
 * effect move counters directly (an early approval, a distracted week that
 * slips a review back to revision); after any of those the files are behind,
 * so pull files between lanes until each lane holds exactly its counter.
 */
export function reconcilePermitFiles(journey) {
  const permits = ensurePermitState(journey);
  const loose = [];

  const lanesByPriority = ['issued', 'deficiency', 'decision', 'referral', 'screening', 'drafted'];
  for (const lane of lanesByPriority) {
    const counter = Math.max(0, Math.round(permits[LANE_COUNTER[lane]] || 0));
    const inLane = permits.files.filter((file) => file.lane === lane)
      .sort((a, b) => (b.laneEnteredDay || 0) - (a.laneEnteredDay || 0));
    while (inLane.length > counter) {
      loose.push(inLane.shift());
    }
  }

  for (const lane of lanesByPriority) {
    const counter = Math.max(0, Math.round(permits[LANE_COUNTER[lane]] || 0));
    let inLane = permits.files.filter((file) => file.lane === lane).length;
    while (inLane < counter) {
      const file = loose.length
        ? loose.sort((a, b) => PERMIT_LANES.indexOf(b.lane) - PERMIT_LANES.indexOf(a.lane)).shift()
        : createFile(journey, 'drafted');
      if (lane === 'deficiency') {
        file.deficiencyCount = (file.deficiencyCount || 0) + 1;
      }
      enterLane(file, lane, journey);
      inLane += 1;
    }
  }

  // Whatever the counters no longer account for has left the queue.
  if (loose.length) {
    const gone = new Set(loose.map((file) => file.id));
    permits.files = permits.files.filter((file) => !gone.has(file.id));
    for (const file of permits.files) {
      if (file.pausedBy && gone.has(file.pausedBy)) file.pausedBy = null;
    }
  }

  return syncPermitCounters(journey);
}

/**
 * Seed the files for a fresh season, or for a save that predates named
 * files. The opening queue is spread along the lanes so the first days at the
 * desk already have clocks closing.
 */
export function ensurePermitFiles(journey) {
  const permits = ensurePermitState(journey);
  if (permits.files.length === 0) {
    const day = Number(journey.day) || 1;
    const seeds = [
      ['drafted', permits.drafting, () => null],
      ['screening', permits.submitted, (index) => (index % 2 === 0 ? 0 : 1)],
      ['referral', permits.inReferral, (index) => 1 + (index % 2)],
      ['decision', permits.inReview, (index) => index % 2],
      ['deficiency', permits.needsRevision, () => null],
      ['issued', permits.approved, () => null],
    ];
    for (const [lane, count, clock] of seeds) {
      for (let index = 0; index < Math.max(0, Math.round(count || 0)); index += 1) {
        const file = createFile(journey, lane, { clockDays: clock(index) });
        if (lane === 'deficiency') file.deficiencyCount = 1;
        if (lane === 'issued') file.issuedDay = day;
        // Only the files still on the completeness screen have a WSA window
        // ahead of them; anything already referred was notified weeks ago.
        if (lane === 'screening' && file.touchesStream) {
          file.wsaClockCloses = day + getWsaWindowDeskDays();
        }
      }
    }
  }
  return reconcilePermitFiles(journey);
}

/**
 * Draft applications out of the backlog. Drafting is where a file gets its
 * name: the block, the road, the camp it is for.
 * @returns {Array} files drafted today
 */
export function draftPermits(journey, count = DAILY_PERMIT_THROUGHPUT) {
  const permits = ensurePermitFiles(journey);
  const drafted = [];
  const available = Math.min(Math.max(0, permits.backlog), Math.max(0, count));
  for (let index = 0; index < available; index += 1) {
    permits.backlog -= 1;
    const file = createFile(journey, 'drafted');
    drafted.push(file);
    const hca = attachHcaIfNeeded(journey, file);
    if (hca) drafted.push(hca);
  }
  syncPermitCounters(journey);
  return drafted;
}

/**
 * Submit drafted files to the district. The completeness screen starts at
 * once; a WSA s.11 notification window starts alongside for anything that
 * touches a stream.
 * @returns {Array} files submitted today
 */
export function submitPermits(journey, count = DAILY_PERMIT_THROUGHPUT) {
  ensurePermitFiles(journey);
  const submitted = [];
  const drafted = getPermitFilesInLane(journey, 'drafted')
    .sort((a, b) => (a.laneEnteredDay || 0) - (b.laneEnteredDay || 0));
  for (const file of drafted.slice(0, Math.max(0, count))) {
    enterLane(file, 'screening', journey);
    if (file.touchesStream && !file.wsaClockCloses) {
      file.wsaClockCloses = (journey.day || 1) + getWsaWindowDeskDays();
    }
    submitted.push(file);
  }
  syncPermitCounters(journey);
  return submitted;
}

/**
 * Files whose clock a phone call could shorten, soonest-closing first.
 * @param {Object} journey
 * @param {string[]} lanes
 */
export function getChaseableFiles(journey, lanes) {
  ensurePermitFiles(journey);
  const day = Number(journey?.day) || 1;
  // A clock that closes tonight cannot be brought forward; chase the next one.
  return getPermitFiles(journey)
    .filter((file) => lanes.includes(file.lane) && Number.isFinite(file.clockCloses) && file.clockCloses > day && !file.pausedBy)
    .sort((a, b) => a.clockCloses - b.clockCloses);
}

/**
 * Shorten one file's clock by a day. Returns the file, or null when nothing
 * in those lanes could be moved.
 */
export function shortenPermitClock(journey, lanes, days = 1) {
  const [file] = getChaseableFiles(journey, lanes);
  if (!file) return null;
  file.clockCloses = Math.max(journey.day || 1, file.clockCloses - Math.max(1, days));
  file.chased = (file.chased || 0) + 1;
  return file;
}

/**
 * Answer a deficiency letter on a file. A completeness letter sends the file
 * back to the completeness screen (the district will not start the referral
 * clock until the package is whole); a substantive letter goes back to the
 * decision-maker, who does not re-run the referral.
 */
export function resubmitPermitFile(journey, fileId, { completeness = false, clockDays = null } = {}) {
  const file = getPermitFileById(journey, fileId);
  if (!file || file.lane !== 'deficiency') return null;
  file.deficiencyProfileId = null;
  enterLane(file, completeness ? 'screening' : 'decision', journey, { clockDays });
  syncPermitCounters(journey);
  return file;
}

function isHeldAtDecision(file, journey) {
  const day = Number(journey.day) || 1;
  if (file.pausedBy) return { held: true, reason: `paused for ${file.pausedBy}` };
  if (Number.isFinite(file.wsaClockCloses) && file.wsaClockCloses > day) {
    return { held: true, reason: `WSA s.11 notification window closes Day ${file.wsaClockCloses}` };
  }
  return { held: false, reason: '' };
}

/**
 * The nightly pass. Every file whose clock has run moves one lane; files at
 * the decision-maker are issued or returned with a deficiency letter.
 *
 * @param {Object} journey
 * @param {Object} [options]
 * @param {number} [options.approvalRate] - share of decided files issued rather than returned
 * @param {number} [options.completenessReturnRate] - share of screened files returned as incomplete
 * @param {Function} [options.random]
 * @returns {{issued: Array, returned: Array, advanced: Array, held: Array}}
 */
export function advancePermitClocks(journey, options = {}) {
  const permits = ensurePermitFiles(journey);
  const day = Number(journey.day) || 1;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const approvalRate = Number.isFinite(options.approvalRate) ? options.approvalRate : 0.7;
  const completenessReturnRate = Number.isFinite(options.completenessReturnRate) ? options.completenessReturnRate : 0.12;
  const result = { issued: [], returned: [], advanced: [], held: [] };

  const files = [...permits.files].sort((a, b) => (a.clockCloses ?? Infinity) - (b.clockCloses ?? Infinity));
  for (const file of files) {
    if (!['screening', 'referral', 'decision'].includes(file.lane)) continue;

    // A CP behind an HCA permit waits for the archaeologist, not the calendar.
    if (file.pausedBy) {
      const hca = getPermitFileById(journey, file.pausedBy);
      if (hca && hca.lane !== 'issued') {
        file.clockCloses = Number.isFinite(file.clockCloses) ? file.clockCloses + 1 : day + 1;
        result.held.push({ file, reason: `${hca.label} still with the Archaeology Branch` });
        continue;
      }
      file.pausedBy = null;
    }

    if (!Number.isFinite(file.clockCloses) || file.clockCloses > day) continue;

    if (file.lane === 'screening') {
      if (random() < completenessReturnRate) {
        file.deficiencyCount = (file.deficiencyCount || 0) + 1;
        file.deficiencyProfileId = 'package-completeness';
        enterLane(file, 'deficiency', journey);
        result.returned.push({ file, profileId: 'package-completeness', stage: 'screening' });
        continue;
      }
      const def = PERMIT_TYPES[file.type] || PERMIT_TYPES.CP;
      enterLane(file, def.referral ? 'referral' : 'decision', journey);
      result.advanced.push({ file, lane: file.lane });
      continue;
    }

    if (file.lane === 'referral') {
      enterLane(file, 'decision', journey);
      result.advanced.push({ file, lane: 'decision' });
      continue;
    }

    // decision
    const hold = isHeldAtDecision(file, journey);
    if (hold.held) {
      file.clockCloses = day + 1;
      result.held.push({ file, reason: hold.reason });
      continue;
    }
    if (random() < approvalRate) {
      enterLane(file, 'issued', journey);
      result.issued.push({ file });
    } else {
      file.deficiencyCount = (file.deficiencyCount || 0) + 1;
      file.deficiencyProfileId = null;
      enterLane(file, 'deficiency', journey);
      result.returned.push({ file, profileId: null, stage: 'decision' });
    }
  }

  syncPermitCounters(journey);
  return result;
}

/**
 * The queue work the desk would do today, in the order it matters: draft the
 * backlog, submit what is drafted, otherwise chase whichever clock is closest.
 * @returns {{step: 'draft'|'submit'|'chase'|null, count: number, file: Object|null}}
 */
export function planQueueWork(journey) {
  const permits = ensurePermitFiles(journey);
  if ((permits.backlog || 0) > 0) {
    return { step: 'draft', count: Math.min(permits.backlog, DAILY_PERMIT_THROUGHPUT), file: null };
  }
  if ((permits.drafting || 0) > 0) {
    return { step: 'submit', count: Math.min(permits.drafting, DAILY_PERMIT_THROUGHPUT), file: null };
  }
  const [file] = getChaseableFiles(journey, ['screening', 'decision']);
  if (file) return { step: 'chase', count: 1, file };
  return { step: null, count: 0, file: null };
}

/** True when the queue has live work that is not a deficiency letter. */
export function hasQueueWork(journey) {
  return planQueueWork(journey).step !== null;
}

export function describeLane(file, journey = null) {
  const day = Number(journey?.day) || 0;
  switch (file?.lane) {
    case 'drafted':
      return 'drafted, not yet submitted';
    case 'screening': {
      const def = PERMIT_TYPES[file.type] || PERMIT_TYPES.CP;
      return `${def.screeningNote} closes Day ${file.clockCloses}`;
    }
    case 'referral':
      return `referral closes Day ${file.clockCloses}`;
    case 'decision': {
      if (file.pausedBy) return `paused for ${getPermitFileById(journey, file.pausedBy)?.label || 'the HCA permit'}`;
      if (Number.isFinite(file.wsaClockCloses) && file.wsaClockCloses > day) {
        return `WSA s.11 window closes Day ${file.wsaClockCloses}; decision waits`;
      }
      return `District Manager decision Day ${file.clockCloses}`;
    }
    case 'deficiency':
      return 'deficiency letter — answer it to restart the clock';
    case 'issued':
      return `issued Day ${file.issuedDay}`;
    default:
      return '';
  }
}

/**
 * The clocks for the day card: soonest first, live lanes only.
 * @returns {string[]}
 */
export function formatPermitClockLines(journey, limit = 3) {
  ensurePermitFiles(journey);
  const live = getPermitFiles(journey)
    .filter((file) => ['screening', 'referral', 'decision'].includes(file.lane))
    .sort((a, b) => (a.clockCloses ?? Infinity) - (b.clockCloses ?? Infinity));
  return live.slice(0, Math.max(0, limit)).map((file) => `${file.label}: ${describeLane(file, journey)}`);
}
