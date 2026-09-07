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
