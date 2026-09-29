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
  // A card that only makes sense while the block's package is open (F1's
  // `needsOpenPackage`) is off bridges, staging lots and closed blocks.
  if (event?.needsOpenPackage && (kind !== 'block' || isPackageClosed(journey, block))) return false;
  if (!kinds.length) return true;
  if (!kinds.includes(kind)) return false;
  // A card about the block's ground has nothing left to say once the crew has
  // closed that block's package, unless it also fits a waypoint.
  return kinds.includes('waypoint') || !isPackageClosed(journey, block);
}

/**
 * Whether the recon crew has already finalized this stop's package. Only a
 * recon journey keeps package intel (js/modes/recon.js), so every other
 * journey reads as open.
 * @param {Object|null} journey
 * @param {Object|null} block
 * @returns {boolean}
 */
export function isPackageClosed(journey, block) {
  if (!journey || !isPackageBlock(block)) return false;
  const key = block?.id || `block-${journey.currentBlockIndex || 0}`;
  return journey.reconIntel?.byBlock?.[key]?.assessmentComplete === true;
}

// Shortcuts about a cutblock's own ground: its boundary, its streams and
// reserves, its wildlife and cultural features, its plots. Road, crossing,
// camp, safety and paperwork shortcuts can be offered anywhere on the
// traverse. An act can say where it belongs with `stopKinds`, which wins over
// its category (a cruise signed off from the truck is block ground; a culvert
// swap belongs at a crossing waypoint too).
const BLOCK_GROUND_ACT_CATEGORIES = new Set([
  'wildlife', 'boundary', 'cruise', 'archaeology', 'riparian', 'timber-mark', 'comic'
]);

/**
 * Whether an act is about the ground of the block the crew is standing on.
 * @param {Object} act - an entry of js/data/illegalActs.js
 * @returns {boolean}
 */
export function isBlockGroundAct(act) {
  if (Array.isArray(act?.stopKinds) && act.stopKinds.length) return !act.stopKinds.includes('waypoint');
  return BLOCK_GROUND_ACT_CATEGORIES.has(act?.category);
}

/**
 * Whether an illegal-act offer fits the stop the crew is on. A shortcut on a
 * block's own ground ("an active grizzly den in the middle of the block") is
 * not offered at a bridge, a camp or a staging lot, whatever its phase, and
 * not on a block whose package the crew has already closed: the ground it is
 * about has been walked, flagged and signed.
 * @param {Object} act - an entry of js/data/illegalActs.js
 * @param {Object|null} block - the stop the crew is on
 * @param {Object|null} [journey] - to read whether the stop's package is closed
 * @returns {boolean}
 */
export function actFitsStop(act, block, journey = null) {
  const kind = getStopKind(block);
  if (!kind || !isBlockGroundAct(act)) return true;
  if (kind === 'waypoint') return false;
  return !isPackageClosed(journey, block);
}
