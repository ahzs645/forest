import { getPlanningAreaSnapshot } from "./planningBlocks.js";
import { getRoleMinistryProcessHooks } from "./ministryProcessHooks.js";

const ROLE_BASELINES = {
  planner: [
    "constraint layers that look workable in GIS but change once access, hydrology, retention, and timing windows are reconciled",
    "volume assumptions that soften fast when referrals, wildlife measures, and community values start reshaping the block list",
  ],
  permitter: [
    "files that slow down over mapping gaps, referral context, or missing professional sign-off",
    "requests for clearer timing windows, crossing notes, and evidence that local values were considered before the package was filed",
  ],
  recce: [
    "roads, fills, and crossings that behave differently on the ground than they did on the office map",
    "unmapped water, cultural indicators, wildlife sign, or unstable ground that turn a routine check into a stop-and-report call",
  ],
  silviculture: [
    "microsites that swing from frost-prone wet pockets to dry knolls inside the same block",
    "browse, pest pressure, and brush competition that only become obvious once somebody walks the ground",
  ],
};

const ROLE_AREA_FINDINGS = {
  planner: {
    "fort-st-john-plateau": [
      "peatland edges, wetland setbacks, and breakup-sensitive access turning neat harvest polygons into winter-only sequencing problems",
      "Peace-region aspen-spruce mixedwoods where riparian benches and muskeg shoulders make road placement as important as block shape",
    ],
    "muskwa-foothills": [
      "steep-drainage access and thaw-sensitive ground forcing planners to test whether the road concept works before the harvest concept does",
      "caribou-sensitive foothill ground where a little more linear disturbance can matter more than a little more timber",
    ],
    "bulkley-valley": [
      "visual quality and community-watershed expectations pushing layouts toward softer edges, tighter road screening, and more retention",
      "high-use benches above towns and rivers where public viewpoints shape block design almost as much as inventory does",
    ],
    "fraser-plateau": [
      "beetle-legacy stands where salvage logic, wildfire resilience, and evacuation-route reliability all compete for the same hectares",
      "Quesnel-plateau style planning where mature residual structure, young pine history, and future fire behavior all need to fit the same story",
    ],
    "skeena-nass": [
      "fish-bearing crossings, saturated approaches, and karst hydrology making road location as defensible as the block boundary itself",
      "wet coastal-hemlock ground where old-forest structure and rainfall-driven instability shrink the space for simple layouts",
    ],
    "tahltan-highland": [
      "short field windows and braided glacial-river logistics forcing plans to be honest about how much can actually be sequenced in a season",
      "high, cold SWB country where sparse timber, wet hollows, and remote mobilization costs can break a paper plan that looked efficient",
    ],
  },
  permitter: {
    "fort-st-john-plateau": [
      "applications that need stronger wetland, access, and breakup context before a muskeg-adjacent file feels review-ready",
      "Peace-region packages where linear disturbance, culvert risk, and local values have to be explained clearly rather than assumed away",
    ],
    "muskwa-foothills": [
      "remote-access files that attract engineering questions on side-cast, crossing stability, and whether the timing window is even realistic",
      "caribou-sensitive referrals where road management and habitat-fragmentation questions can outweigh the volume argument",
    ],
    "bulkley-valley": [
      "packages redlined over visual impact, intake protection, and whether the maps prove the block will still read cleanly from town",
      "community-interface files where a weak mitigation map is usually what triggers the hard follow-up, not the cover letter",
    ],
    "fraser-plateau": [
      "submissions that now have to explain post-beetle intent, wildfire-resilience logic, and why access near evacuation corridors is still defensible",
      "Quesnel-side files where overlapping habitat and old-forest concerns mean the referral package has to be sharper than the average permit run",
    ],
    "skeena-nass": [
      "referrals that live or die on fish-stream classification, crossing design notes, and proof the layout respected karst drainage paths",
      "wet-coast files where rainfall timing and field confirmation matter because a bad crossing assumption can sink the whole package",
    ],
    "tahltan-highland": [
      "remote-area packages that need credible camp, aviation, and river-access timing before reviewers believe the work can be done cleanly",
      "highland files where wildlife, cultural-value, and weather-window questions arrive early because the logistics are so unforgiving",
    ],
  },
  recce: {
    "fort-st-john-plateau": [
      "pumping peat, soft shoulders, beavered draws, and culvert outlets disappearing into muskeg where the map still says road",
      "wetland-heavy BWBS ground where frozen access assumptions can vanish in a few warm days of breakup",
    ],
    "muskwa-foothills": [
      "slumping fills, steep side slopes, and long stretches where a washout or slide turns into a helicopter problem",
      "caribou-sensitive foothill country where fresh sign and road use both matter before crews push farther uphill",
    ],
    "bulkley-valley": [
      "visible road prisms, intake tributaries, and recreation traffic that make drainage mistakes hard to hide and easy to complain about",
      "bench-country access where somebody downstream, downhill, or in town is more likely to notice the line you pick",
    ],
    "fraser-plateau": [
      "beetle-killed danger trees, old fire edges, and smoke-stalled work changing what looked like a straightforward day of access checks",
      "plateau ground where patchy frost-out leaves one spur passable and the next one soft, rutted, or ponded",
    ],
    "skeena-nass": [
      "fish-bearing channels, undercut approaches, sinkholes, and wet cedar-hemlock footing that punish any lazy recce work",
      "very wet coastal ground where rain can change crossing calls overnight and karst features turn small misses into big problems",
    ],
    "tahltan-highland": [
      "snow lingering on benches, cold braided rivers, and long gaps between useful pullouts where a small mistake becomes a camp issue",
      "high, sparsely treed ground with willow-birch parkland and cold-air basins that makes visibility good but access unforgiving",
    ],
  },
  silviculture: {
    "fort-st-john-plateau": [
      "elevated microsites, frost-prone hollows, and wet black-spruce pockets that make stock choice and planting rhythm matter block by block",
      "aspen-spruce mixedwoods where regen performance changes quickly between firm ridges, riparian benches, and muskeg edges",
    ],
    "muskwa-foothills": [
      "short planting windows, cold soils, and lingering snow on higher ground leaving prescriptions behind the calendar",
      "foothill sites where sparse stocking, frost, and tough access make re-entry costs part of every regeneration decision",
    ],
    "bulkley-valley": [
      "growing-season frost, browse pressure, and heavy brush on SBS benches where acceptable stocking can still look rough from a public road",
      "interface blocks where regeneration quality and site appearance both matter because the work stays visible",
    ],
    "fraser-plateau": [
      "beetle-legacy ground with moisture deficit on knolls, frost in lows, and strong moose browse pressure on young mixedwood recovery",
      "SBSwk1 sites where species diversification sounds easy until brush, browse, and patchy residual structure start pulling the numbers apart",
    ],
    "skeena-nass": [
      "waterlogged pockets, salmonberry and devil's club competition, and steep access making survey efficiency hard to maintain",
      "higher-elevation CWHws2 ground where hemlock-amabilis fir mixes dominate and minor species only fit on the right microsites",
    ],
    "tahltan-highland": [
      "cold-air valley bottoms, shrub fields, and moist meadows that stay nearly treeless while adjacent uplands still carry spruce-fir potential",
      "highland blocks where short seasons, browse, and remote mobilization punish any prescription that misses on the first pass",
    ],
  },
};

function dedupe(items = []) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    unique.push(item);
  }

  return unique;
}

function formatOverlaySummary(signalCounts = {}) {
  const summary = [];

  if (signalCounts.ogmaNearby > 0) {
    summary.push(`OGMA overlap on ${signalCounts.ogmaNearby}`);
  }
  if (signalCounts.whaNoHarvestNearby > 0) {
    summary.push(`WHA adjacency on ${signalCounts.whaNoHarvestNearby}`);
  }
  if (signalCounts.speciesAtRiskNearby > 0) {
    summary.push(`species-at-risk flags on ${signalCounts.speciesAtRiskNearby}`);
  }
  if (signalCounts.firstNationsReserveNearby > 0) {
    summary.push(`community-proxy overlap on ${signalCounts.firstNationsReserveNearby}`);
  }

  return summary.join(", ");
}

function buildSnapshotSignals(roleId, area) {
  const snapshot = area?.id ? getPlanningAreaSnapshot(area.id, area) : null;
  const overlaySummary = formatOverlaySummary(snapshot?.signalCounts);

  if (!snapshot?.blockCount || !overlaySummary) {
    return { planningSnapshot: snapshot, findings: [] };
  }

  const roleLine = {
    planner:
      `the current ${snapshot.blockCount}-candidate planning snapshot already shows ${overlaySummary}, so even the clean-looking polygons carry real design baggage`,
    permitter:
      `the current ${snapshot.blockCount}-candidate snapshot already shows ${overlaySummary}, which is exactly the sort of context that turns a routine file into a deficiency letter`,
    recce:
      `the current planning snapshot already carries ${overlaySummary}, so expect more layout stops, flagged features, and reroutes than a straight road check`,
    silviculture:
      `the current planning snapshot already carries ${overlaySummary}, which usually means tighter species choice, retention, and access limits on follow-up work`,
  };

  return {
    planningSnapshot: snapshot,
    findings: roleLine[roleId] ? [roleLine[roleId]] : [],
  };
}

export function getRoleAreaBriefing(roleId, area, options = {}) {
  const maxFinds = Math.max(1, Number(options.maxFinds) || 4);
  const baseFinds = ROLE_BASELINES[roleId] || [];
  const areaFinds = ROLE_AREA_FINDINGS[roleId]?.[area?.id] || [];
  const snapshotSignals = buildSnapshotSignals(roleId, area);
  const processHooks = getRoleMinistryProcessHooks(roleId, { limit: 2 });
  const likelyFinds = dedupe([...areaFinds, ...snapshotSignals.findings, ...baseFinds]).slice(0, maxFinds);

  return {
    zoneSummary: area?.zoneSummary || "",
    seasonalSignals: Array.isArray(area?.seasonalSignals) ? area.seasonalSignals : [],
    likelyFinds,
    planningSnapshot: snapshotSignals.planningSnapshot,
    processHooks,
  };
}

export function getRoleAreaFinding(roleId, area, index = 0) {
  const briefing = getRoleAreaBriefing(roleId, area, { maxFinds: 6 });
  if (!briefing.likelyFinds.length) {
    return "";
  }

  const normalizedIndex = Math.abs(Number(index) || 0) % briefing.likelyFinds.length;
  return briefing.likelyFinds[normalizedIndex];
}
