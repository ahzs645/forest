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
 *
 * HCA permits ride alongside their cutting permits but sit outside the
 * counters: the Archaeology Branch issues them, not the District Manager, so
 * they never count toward the season's target and no counter can move them.
 */

import { getPlanningAreaBlockPool, getPlanningBlockHeritageLoad, getPlanningBlockWaterContext } from '../data/planningBlocks.js';
import { getBlocksForArea } from '../data/blocks.js';
import { isPackageBlock } from './packages.js';
import { getSeasonModifiers } from '../season.js';

export const CALENDAR_DAYS_PER_DESK_DAY = 15;
export const DEFAULT_REFERRAL_WINDOW_DAYS = 30;
export const WSA_NOTIFICATION_WINDOW_DAYS = 45;
/** Files a desk moves in a day. A day at the desk is a batch, not a form. */
export const DAILY_PERMIT_THROUGHPUT = 3;
/** Heritage/referral load at which a cutting permit needs its own HCA permit. */
export const HCA_HERITAGE_LOAD_THRESHOLD = 36;
/** How much each clean deficiency response lifts that file's odds at decision. */
export const CLEAN_RESPONSE_APPROVAL_LIFT = 0.25;
/**
 * How much likelier a fast-tracked answer is to come back. A quick refile is
 * decided that night instead of the next, but the thin answer is what the
 * decision-maker reads.
 */
export const FAST_TRACK_RETURN_RISK = 0.2;

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

// A named road: "Blackwater Road", "Decker Lake Road Junction", "Franklin
// River Main", or "the Harris Creek FSR" in a stop's description.
const ROAD_NAME_PATTERN = /\b((?:[A-Z][\w'.]*\s+)*?[A-Z][\w'.]*)\s+(Road|FSR|Main)\b/g;

/**
 * The area's named roads, read off its route waypoints. Cutblocks are skipped:
 * "Block A-12 - End of Road" is a block, not a road. A "Main" is a licensee
 * mainline, so it carries road permits but never a road use permit, which is
 * only for industrial use of a Forest Service Road.
 * @returns {{name: string, fsr: boolean}[]}
 */
function getAreaRoads(areaId) {
  const roads = [];
  for (const block of getBlocksForArea(areaId) || []) {
    if (isPackageBlock(block)) continue;
    for (const text of [block?.name, block?.description]) {
      for (const match of String(text || '').matchAll(ROAD_NAME_PATTERN)) {
        const name = match[1].trim();
        if (/^(Highway|The|A|An)\b/.test(name) || roads.some((road) => road.name === name)) continue;
        roads.push({ name, fsr: match[2] !== 'Main' });
      }
    }
  }
  return roads;
}

/**
 * Short block codes off the route ("Block VI-03 - Cedar Draw" -> "VI-03"),
 * used to name files when an area has no planning-block pool to draw on.
 */
function getRouteBlockCodes(areaId) {
  const codes = [];
  for (const block of getBlocksForArea(areaId) || []) {
    if (!isPackageBlock(block)) continue;
    const match = String(block?.name || '').match(/\b([A-Z]{1,3}-\d{1,3})\b/);
    if (match && !codes.includes(match[1])) codes.push(match[1]);
  }
  return codes;
}

/** Whether a file is one of the District Manager's, and so on the counters. */
function countsInQueue(file) {
  return file?.type !== 'HCA';
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
  const roads = getAreaRoads(areaId);
  const serviceRoads = roads.filter((road) => road.fsr);
  const routeCodes = blocks.length ? [] : getRouteBlockCodes(areaId);
  const catalogue = [];
  const roadUses = new Map();
  const labelUses = new Map();
  let hcaAssigned = false;
  let cuttingPermits = 0;

  for (let index = 0; index < TYPE_SEQUENCE.length; index += 1) {
    const type = TYPE_SEQUENCE[index];
    // Cutting permits walk the block pool in order so a small pool is used
    // up before any block carries a second CP; the rest take the block at
    // their slot.
    const blockIndex = type === 'CP' ? cuttingPermits++ : index;
    const block = blocks.length ? blocks[blockIndex % blocks.length] : null;
    const blockId = compactBlockId(block)
      || (routeCodes.length ? routeCodes[blockIndex % routeCodes.length] : `${String(areaId || 'area').slice(0, 4).toUpperCase()}-${index + 1}`);
    const road = roads.length ? roads[index % roads.length].name : null;
    const serviceRoad = serviceRoads.length ? serviceRoads[index % serviceRoads.length].name : null;
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
        const uses = (roadUses.get(`RUP:${serviceRoad}`) || 0) + 1;
        roadUses.set(`RUP:${serviceRoad}`, uses);
        label = serviceRoad ? `RUP ${serviceRoad} FSR${uses > 1 ? ` (${blockId})` : ''}` : `RUP ${blockId} access`;
        break;
      }
      case 'SUP':
        label = `SUP camp ${blockId}`;
        break;
      default:
        label = `CP ${blockId}`;
        break;
    }
    // Two files with one name make the queue unreadable ("X ISSUED" and "X
    // returned" the same night), so a repeat gets a sequence number.
    const uses = (labelUses.get(label) || 0) + 1;
    labelUses.set(label, uses);
    if (uses > 1) label = `${label} (${uses})`;
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

/**
 * The next application out of the area's catalogue. With `types`, the next
 * one of those types is drafted out of order (a road-permit day drafts a
 * road permit, not whatever cutting permit was next); the skipped-over
 * entries keep their place, and the ones taken early are not drafted again.
 */
function nextCatalogueEntry(journey, { types = null } = {}) {
  const permits = ensurePermitState(journey);
  const catalogue = buildPermitFileCatalogue(journey);
  const taken = new Set(Array.isArray(permits.catalogueTaken) ? permits.catalogueTaken : []);
  while (taken.has(permits.catalogueCursor)) {
    taken.delete(permits.catalogueCursor);
    permits.catalogueCursor += 1;
  }
  let index = permits.catalogueCursor;
  if (Array.isArray(types) && types.length && catalogue.length) {
    for (let candidate = index; candidate < index + catalogue.length; candidate += 1) {
      if (taken.has(candidate)) continue;
      if (types.includes(catalogue[candidate % catalogue.length].type)) {
        index = candidate;
        break;
      }
    }
  }
  if (index === permits.catalogueCursor) permits.catalogueCursor = index + 1;
  else taken.add(index);
  if (taken.size || permits.catalogueTaken) permits.catalogueTaken = [...taken];
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

function createFile(journey, lane, { clockDays = null, types = null } = {}) {
  const permits = ensurePermitState(journey);
  const entry = nextCatalogueEntry(journey, { types });
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
    resolvedDeficiencies: [],
    fastTracked: false,
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
  // A cutting permit already filed went in with its HCA application: the
  // Archaeology Branch has it, not the licensee's drafting stack.
  if (file.lane !== 'drafted') enterLane(hca, 'screening', journey);
  file.pausedBy = hca.id;
  file.needsHca = false;
  return hca;
}

/** Who decides a file: the Archaeology Branch for an HCA permit, the District Manager otherwise. */
export function getDecisionMaker(file) {
  return file?.type === 'HCA' ? 'the Archaeology Branch' : 'the District Manager';
}

/**
 * Why a cutting permit is waiting on its HCA permit, in terms of where the
 * HCA permit actually is. A drafted HCA permit is the licensee's to file;
 * saying it was "with the Archaeology Branch" left a CP blocked for ten days
 * by an application nobody had submitted.
 * @param {Object} hca
 * @returns {string}
 */
export function describeHcaHold(hca) {
  switch (hca?.lane) {
    case 'drafted':
      return `${hca.label} is drafted but not filed; submit it (Process Permits) to start the Archaeology Branch clock`;
    case 'deficiency':
      return `${hca.label} came back from the Archaeology Branch with a letter; answer it`;
    case 'decision':
      return `${hca.label} is with the Archaeology Branch for decision (Day ${hca.clockCloses})`;
    default:
      return `${hca?.label || 'The HCA permit'} is with the Archaeology Branch (Day ${hca?.clockCloses ?? '?'})`;
  }
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
    permits[counter] = permits.files.filter((file) => file.lane === lane && countsInQueue(file)).length;
  }
  // The backlog as the files last left it, so a reconcile can tell what an
  // outside change did to it.
  permits.syncedBacklog = Math.max(0, Math.round(permits.backlog || 0));
  return permits;
}

/** The lane a file goes to next on its own path through the district. */
function nextLane(file) {
  const def = PERMIT_TYPES[file.type] || PERMIT_TYPES.CP;
  switch (file.lane) {
    case 'drafted':
      return 'screening';
    case 'screening':
      return def.referral ? 'referral' : 'decision';
    case 'referral':
      return 'decision';
    case 'decision':
      return 'issued';
    default:
      return null;
  }
}

/**
 * Whether a counter change may move this file into `lane`. Only the
 * decision-maker issues, so nothing reaches 'issued' except an unheld file at
 * the decision; a file moves forward one lane on its own path at most; a
 * letter can land on anything in motion; a submission can be pulled back to
 * drafting. An issued permit is a decision already made and never moves.
 */
function canCounterMove(file, lane, journey) {
  if (!countsInQueue(file) || file.lane === lane || file.lane === 'issued') return false;
  if (lane === 'issued') return file.lane === 'decision' && !isHeldAtDecision(file, journey).held;
  if (lane === 'deficiency') return ['screening', 'referral', 'decision'].includes(file.lane);
  if (lane === 'drafted') return file.lane === 'screening';
  return nextLane(file) === lane;
}

function newFileFromBacklog(journey, lane) {
  const file = createFile(journey, lane);
  attachHcaIfNeeded(journey, file);
  return file;
}

/**
 * An empty queue with counters on it (a save from before files had names, or
 * a journey built by hand) gets files straight into its lanes.
 */
function seedFilesFromCounters(journey) {
  const permits = ensurePermitState(journey);
  for (const lane of ['issued', 'deficiency', 'decision', 'referral', 'screening', 'drafted']) {
    const counter = Math.max(0, Math.round(permits[LANE_COUNTER[lane]] || 0));
    let inLane = permits.files.filter((file) => file.lane === lane && countsInQueue(file)).length;
    while (inLane < counter) {
      const file = createFile(journey, lane);
      if (lane === 'deficiency') file.deficiencyCount = (file.deficiencyCount || 0) + 1;
      inLane += 1;
    }
  }
  return syncPermitCounters(journey);
}

/**
 * Make the files match the counters. Authored events and the generic progress
 * effect move counters directly (an early approval, a distracted week that
 * slips a review back to revision); after any of those the files are behind.
 *
 * The counters are a request, and the files are what is real. Each request is
 * carried out on a named file where the pipeline allows it (see
 * canCounterMove) and refused where it does not: a counter cannot issue a
 * permit nobody drafted, skip the referral, or wave a file past a WSA window
 * or an HCA hold. A setback that sends work back to the backlog pulls the
 * named submission back to drafting instead of deleting it, so the file keeps
 * its name, its HCA permit and its history. The backlog only shrinks when a
 * new file is actually drafted out of it.
 */
export function reconcilePermitFiles(journey) {
  const permits = ensurePermitState(journey);
  const counted = () => permits.files.filter(countsInQueue);
  if (!Number.isFinite(permits.syncedBacklog) || counted().length === 0) {
    return counted().length === 0 ? seedFilesFromCounters(journey) : syncPermitCounters(journey);
  }

  const delta = {};
  for (const lane of PERMIT_LANES) {
    const counter = Math.max(0, Math.round(permits[LANE_COUNTER[lane]] || 0));
    delta[lane] = counter - counted().filter((file) => file.lane === lane).length;
  }
  let backlog = permits.syncedBacklog;
  let backlogDelta = Math.max(0, Math.round(permits.backlog || 0)) - backlog;
  // A backlog that shrank with nothing asked of the lanes lost applications
  // (withdrawn, dropped by the licensee); that part stands.
  const requested = PERMIT_LANES.reduce((sum, lane) => sum + Math.max(0, delta[lane]), 0);
  if (backlogDelta < 0) {
    const withdrawn = Math.max(0, -backlogDelta - requested);
    backlog -= withdrawn;
    backlogDelta += withdrawn;
  }

  const laneOrder = (file) => PERMIT_LANES.indexOf(file.lane);
  for (const lane of ['issued', 'deficiency', 'decision', 'referral', 'screening']) {
    while (delta[lane] > 0) {
      // Prefer the lane the counter change took a file from, then the file
      // furthest along, then the one that has waited longest.
      const [donor] = counted()
        .filter((file) => canCounterMove(file, lane, journey))
        .sort((a, b) => (delta[b.lane] < 0) - (delta[a.lane] < 0)
          || laneOrder(b) - laneOrder(a)
          || (a.laneEnteredDay || 0) - (b.laneEnteredDay || 0));
      if (donor) {
        if (delta[donor.lane] < 0) delta[donor.lane] += 1;
        if (lane === 'deficiency') {
          donor.deficiencyCount = (donor.deficiencyCount || 0) + 1;
          donor.deficiencyProfileId = null;
        }
        enterLane(donor, lane, journey);
        delta[lane] -= 1;
        continue;
      }
      if (lane === 'screening' && backlogDelta < 0 && backlog > 0) {
        newFileFromBacklog(journey, 'screening');
        backlog -= 1;
        backlogDelta += 1;
        delta[lane] -= 1;
        continue;
      }
      break;
    }
  }
  while (delta.drafted > 0 && backlogDelta < 0 && backlog > 0) {
    newFileFromBacklog(journey, 'drafted');
    backlog -= 1;
    backlogDelta += 1;
    delta.drafted -= 1;
  }

  // Work the counters sent back to the backlog: a draft stays a draft, and a
  // submission is pulled back to drafting under its own name.
  let setbacks = Math.max(0, backlogDelta);
  const draftsReturned = Math.min(setbacks, Math.max(0, -delta.drafted));
  setbacks -= draftsReturned;
  const pulled = counted()
    .filter((file) => file.lane === 'screening')
    .sort((a, b) => (b.laneEnteredDay || 0) - (a.laneEnteredDay || 0));
  while (setbacks > 0 && pulled.length) {
    enterLane(pulled.shift(), 'drafted', journey);
    setbacks -= 1;
  }

  permits.backlog = backlog;
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
        // A heritage-heavy CP already in the queue still needs its HCA permit.
        if (lane !== 'issued') attachHcaIfNeeded(journey, file);
      }
    }
  }
  return reconcilePermitFiles(journey);
}

/**
 * Draft applications out of the backlog. Drafting is where a file gets its
 * name: the block, the road, the camp it is for.
 * @param {Object} [options]
 * @param {string[]} [options.types] - draft the next files of these types first
 * @returns {Array} files drafted today
 */
export function draftPermits(journey, count = DAILY_PERMIT_THROUGHPUT, { types = null } = {}) {
  const permits = ensurePermitFiles(journey);
  const drafted = [];
  const available = Math.min(Math.max(0, permits.backlog), Math.max(0, count));
  for (let index = 0; index < available; index += 1) {
    permits.backlog -= 1;
    const file = createFile(journey, 'drafted', { types });
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
  // An HCA permit holding a cutting permit goes in first: every day it sits
  // in the drafting stack is a day the CP waits for it.
  const drafted = getPermitFilesInLane(journey, 'drafted')
    .sort((a, b) => (Number(Boolean(b.holdsFileId)) - Number(Boolean(a.holdsFileId)))
      || (a.laneEnteredDay || 0) - (b.laneEnteredDay || 0));
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
 * Push the soonest live clock in those lanes back by a day: a distracted
 * week at the desk. Returns the file, or null when nothing was on a clock.
 */
export function slipPermitClock(journey, lanes, days = 1) {
  ensurePermitFiles(journey);
  const [file] = getPermitFiles(journey)
    .filter((entry) => lanes.includes(entry.lane) && Number.isFinite(entry.clockCloses) && !entry.pausedBy)
    .sort((a, b) => a.clockCloses - b.clockCloses);
  if (!file) return null;
  file.clockCloses += Math.max(1, days);
  return file;
}

/**
 * Files the District Manager could sign today: at decision, with nothing
 * holding them. Due files first, then the soonest clock.
 */
export function getSignableFiles(journey) {
  ensurePermitFiles(journey);
  return getPermitFiles(journey)
    .filter((file) => file.lane === 'decision' && !isHeldAtDecision(file, journey).held)
    .sort((a, b) => (a.clockCloses ?? Infinity) - (b.clockCloses ?? Infinity));
}

/**
 * Issue a file that is already at decision. Anything not on the District
 * Manager's desk cannot be signed, whatever an event says.
 */
export function issuePermitFile(journey, fileId) {
  const file = getPermitFileById(journey, fileId);
  if (!file || file.lane !== 'decision') return null;
  enterLane(file, 'issued', journey);
  syncPermitCounters(journey);
  return file;
}

/**
 * Answer a deficiency letter on a file. A completeness letter sends the file
 * back to the completeness screen (the district will not start the referral
 * clock until the package is whole); a substantive letter goes back to the
 * decision-maker, who does not re-run the referral.
 *
 * The file remembers what it was answered for: the district does not send
 * the same letter about a gap the licensee has already closed, and a clean
 * response makes the next decision more likely to issue (advancePermitClocks).
 */
export function resubmitPermitFile(journey, fileId, {
  completeness = false,
  clockDays = null,
  clean = false,
  fastTracked = false,
  answeredProfileId = null,
} = {}) {
  const file = getPermitFileById(journey, fileId);
  if (!file || file.lane !== 'deficiency') return null;
  // A gap answered properly is closed: the next letter on this file, if there
  // is one, is about something else. A thin answer closes nothing.
  const answered = answeredProfileId || file.deficiencyProfileId;
  if (answered && !fastTracked) {
    const resolved = Array.isArray(file.resolvedDeficiencies) ? file.resolvedDeficiencies : [];
    if (!resolved.includes(answered)) resolved.push(answered);
    file.resolvedDeficiencies = resolved;
  }
  if (clean) file.cleanResponses = (file.cleanResponses || 0) + 1;
  file.deficiencyProfileId = null;
  // A fast-track goes back on tonight's pile instead of tomorrow's.
  file.fastTracked = Boolean(fastTracked);
  const clock = clockDays !== null ? clockDays : (fastTracked ? 0 : null);
  enterLane(file, completeness ? 'screening' : 'decision', journey, { clockDays: clock });
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
 * @param {string[]} [options.fileIds] - decide only these files (a meeting about one file is not a nightly pass)
 * @returns {{issued: Array, returned: Array, advanced: Array, held: Array}}
 */
export function advancePermitClocks(journey, options = {}) {
  const permits = ensurePermitFiles(journey);
  const day = Number(journey.day) || 1;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const approvalRate = Number.isFinite(options.approvalRate) ? options.approvalRate : 0.7;
  const completenessReturnRate = Number.isFinite(options.completenessReturnRate) ? options.completenessReturnRate : 0.12;
  const only = Array.isArray(options.fileIds) ? new Set(options.fileIds) : null;
  const result = { issued: [], returned: [], advanced: [], held: [] };

  const files = [...permits.files].sort((a, b) => (a.clockCloses ?? Infinity) - (b.clockCloses ?? Infinity));
  for (const file of files) {
    if (!['screening', 'referral', 'decision'].includes(file.lane)) continue;
    if (only && !only.has(file.id)) continue;

    // A CP behind an HCA permit waits for the archaeologist, not the calendar.
    if (file.pausedBy) {
      const hca = getPermitFileById(journey, file.pausedBy);
      if (hca && hca.lane !== 'issued') {
        file.clockCloses = Number.isFinite(file.clockCloses) ? file.clockCloses + 1 : day + 1;
        result.held.push({ file, reason: describeHcaHold(hca) });
        continue;
      }
      file.pausedBy = null;
    }

    if (!Number.isFinite(file.clockCloses) || file.clockCloses > day) continue;

    if (file.lane === 'screening') {
      // A package made whole by a clean response is not bounced as incomplete
      // again; one refiled with the bare minimum is likelier to be.
      const completed = !file.fastTracked && (file.resolvedDeficiencies || []).includes('package-completeness');
      const returnRate = completed ? 0 : completenessReturnRate + (file.fastTracked ? FAST_TRACK_RETURN_RISK : 0);
      file.fastTracked = false;
      if (random() < returnRate) {
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
    // Each clean answer on this file closes a gap the decision-maker would
    // otherwise find (a flat roll sent one file back eight times running); a
    // fast-tracked answer is the thin one the decision-maker reads.
    const cleanLift = CLEAN_RESPONSE_APPROVAL_LIFT * (file.cleanResponses || 0);
    const fileRate = Math.max(0, Math.min(0.95, approvalRate + cleanLift - (file.fastTracked ? FAST_TRACK_RETURN_RISK : 0)));
    file.fastTracked = false;
    if (random() < fileRate) {
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
  // A drafted HCA permit that is holding a cutting permit is filed before
  // anything else is drafted: the CP cannot move until it is in.
  const blockingHca = permits.files.find((file) => file.lane === 'drafted' && file.type === 'HCA' && file.holdsFileId);
  if (blockingHca) {
    const drafted = permits.files.filter((file) => file.lane === 'drafted').length;
    return { step: 'submit', count: Math.min(drafted, DAILY_PERMIT_THROUGHPUT), file: blockingHca };
  }
  if ((permits.backlog || 0) > 0) {
    return { step: 'draft', count: Math.min(permits.backlog, DAILY_PERMIT_THROUGHPUT), file: null };
  }
  // Counted off the files: an HCA permit waiting to go in is not on the
  // counters but still has to be filed.
  const drafted = permits.files.filter((file) => file.lane === 'drafted').length;
  if (drafted > 0) {
    return { step: 'submit', count: Math.min(drafted, DAILY_PERMIT_THROUGHPUT), file: null };
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
      if (file.pausedBy && journey) return `waiting: ${describeHcaHold(getPermitFileById(journey, file.pausedBy))}`;
      const def = PERMIT_TYPES[file.type] || PERMIT_TYPES.CP;
      return `${def.screeningNote} closes Day ${file.clockCloses}`;
    }
    case 'referral':
      if (file.pausedBy && journey) return `waiting: ${describeHcaHold(getPermitFileById(journey, file.pausedBy))}`;
      return `referral closes Day ${file.clockCloses}`;
    case 'decision': {
      if (file.pausedBy) return `waiting: ${describeHcaHold(getPermitFileById(journey, file.pausedBy))}`;
      if (Number.isFinite(file.wsaClockCloses) && file.wsaClockCloses > day) {
        return `WSA s.11 window closes Day ${file.wsaClockCloses}; decision waits`;
      }
      return file.type === 'HCA'
        ? `Archaeology Branch decision Day ${file.clockCloses}`
        : `District Manager decision Day ${file.clockCloses}`;
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
