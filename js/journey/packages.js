/**
 * Block packages versus waypoints.
 *
 * A field traverse is a sequence of stops, but only some of them are
 * cutblocks. The rest — staging lots, camps, bridges, caches, junctions — are
 * travel, supply and camp beats. The recon objective counts packages on
 * blocks; a waypoint never "finalizes" anything, however carefully the crew
 * looked at its road.
 *
 * Stops declare `kind: "block" | "waypoint"` in js/data/json/field/blocks.json.
 * Older saves and ad-hoc test blocks carry no kind; those are treated as
 * blocks so nothing that used to count stops changes shape.
 */

/**
 * Is this stop a cutblock that needs a package, rather than a waypoint?
 * @param {Object} block
 * @returns {boolean}
 */
export function isPackageBlock(block) {
  if (!block) return false;
  const kind = String(block.kind || '').trim().toLowerCase();
  if (kind === 'waypoint') return false;
  return true;
}

/**
 * Every stop on the traverse that needs a package.
 * @param {Object} journey
 * @returns {Object[]}
 */
export function getPackageBlocks(journey) {
  const blocks = Array.isArray(journey?.blocks) ? journey.blocks : [];
  return blocks.filter(isPackageBlock);
}

/**
 * How many packages the season has to close. Prefers the count the factory
 * stamped on the journey, falls back to counting the stops.
 * @param {Object} journey
 * @returns {number}
 */
export function getPackageTarget(journey) {
  const stamped = Number(journey?.packageTarget);
  if (Number.isFinite(stamped) && stamped > 0) return stamped;
  return getPackageBlocks(journey).length;
}

/**
 * Packages finalized so far, capped at the target.
 * @param {Object} journey
 * @returns {number}
 */
export function getPackagesFinalized(journey) {
  const target = getPackageTarget(journey);
  return Math.min(target, Math.max(0, Number(journey?.blocksAssessed) || 0));
}

/**
 * Package progress as a whole-number percentage.
 * @param {Object} journey
 * @returns {number} 0-100
 */
export function getPackageProgress(journey) {
  const target = getPackageTarget(journey);
  if (!target) return 0;
  return Math.round((getPackagesFinalized(journey) / target) * 100);
}

/**
 * Whether every package on the file is closed.
 * @param {Object} journey
 * @returns {boolean}
 */
export function allPackagesFinalized(journey) {
  const target = getPackageTarget(journey);
  return target > 0 && getPackagesFinalized(journey) >= target;
}

/**
 * What kind of stop the crew is standing on: a cutblock or a waypoint.
 * @param {Object} block
 * @returns {'block'|'waypoint'|null}
 */
export function getStopKind(block) {
  if (!block) return null;
  return isPackageBlock(block) ? 'block' : 'waypoint';
}

/**
 * Whether a situation authored for a kind of stop fits the one the crew is
 * on. A card that says "inside the boundary you're flagging" has no business
 * at a bridge or a staging lot. Content opts in with `stopKinds: ["block"]`;
 * a card without it fits anywhere, and so does a journey with no stop.
 *
 * A card about layout still being done ("you move the boundary together",
 * "keep flagging") also sets `needsOpenPackage`: it fits only a cutblock
 * whose package is not yet closed, since there is no boundary left to move
 * on a block the crew has already signed off.
 * @param {Object} event
 * @param {Object|null} block - the stop the crew is on
 * @param {Object} [journey] - read for the block's package state
 * @returns {boolean}
 */
export function eventFitsStop(event, block, journey = null) {
  const kinds = Array.isArray(event?.stopKinds) ? event.stopKinds : [];
  const kind = getStopKind(block);
  if (!kind) return true;
  if (event?.needsOpenPackage && (kind !== 'block' || isPackageClosed(journey, block))) return false;
  if (!kinds.length) return true;
  return kinds.includes(kind);
}

/**
 * Whether the crew has already finalized this block's package.
 * @param {Object|null} journey
 * @param {Object|null} block
 * @returns {boolean}
 */
export function isPackageClosed(journey, block) {
  if (!block?.id) return false;
  return Boolean(journey?.reconIntel?.byBlock?.[block.id]?.assessmentComplete);
}

// Layout shortcuts that are about a cutblock's own ground: its boundary, its
// streams and reserves, its wildlife and cultural features, its plots. Road,
// crossing and safety shortcuts can be offered anywhere on the traverse.
const BLOCK_GROUND_ACT_CATEGORIES = new Set([
  'wildlife', 'boundary', 'cruise', 'archaeology', 'riparian', 'timber-mark', 'professional', 'comic'
]);

/**
 * Whether an illegal-act offer fits the stop the crew is on. A recon layout
 * shortcut on a block's own ground ("an active grizzly den in the middle of
 * the block") is not offered at a bridge, a camp or a staging lot.
 * @param {Object} act - an entry of js/data/illegalActs.js
 * @param {Object|null} block - the stop the crew is on
 * @returns {boolean}
 */
export function actFitsStop(act, block) {
  if (getStopKind(block) !== 'waypoint') return true;
  return !(act?.phase === 'layout' && BLOCK_GROUND_ACT_CATEGORIES.has(act?.category));
}
