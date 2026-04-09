const ROLE_BASELINES = {
  planner: [
    "constraint layers that look clean in GIS but collide on the ground once hydrology, access, and retention are reconciled",
    "inventory gaps where older imagery misses recent washouts, burn edges, or mortality pockets",
    "stakeholder asks that reshape block timing, retention, or road placement before the plan is truly stable",
  ],
  permitter: [
    "packages that stall over missing referral context, outdated mapping, or incomplete professional sign-off",
    "extra scrutiny around fish streams, archaeology screening, and community watershed mitigation",
    "requests for clearer timing windows, access notes, and evidence that local values were considered early",
  ],
  recce: [
    "roads, fills, and crossings that behave very differently from the office map once crews are on the ground",
    "unmapped water, cultural indicators, wildlife sign, or karst features that force a stop-and-report call",
    "weather, smoke, insects, and steep ground turning routine access checks into safety decisions",
  ],
  silviculture: [
    "microsites that swing from frost pockets to droughty knolls within the same block",
    "species-site mismatches, pest damage, and browse pressure that only show up once the block is walked",
    "sharp productivity differences between easy low-ground pieces and cold, wet, high-elevation ground",
  ],
};

const ROLE_AREA_FOCUS = {
  planner: {
    "fort-st-john-plateau":
      "muskeg stability, wetland buffers, and gas-line disturbance making neat harvest polygons operationally messy",
    "muskwa-foothills":
      "steep-drainage access, thaw-sensitive ground, and caribou timing windows squeezing layout options",
    "bulkley-valley":
      "visual quality and community water concerns pushing planners toward softer edges, timing limits, and more retention",
    "fraser-plateau":
      "beetle-legacy stands and evacuation-route sensitivity keeping wildfire resilience on the same page as timber supply",
    "skeena-nass":
      "fish-bearing crossings, karst hydrology, and saturated ground making road location as important as block shape",
    "tahltan-highland":
      "short field windows, glacial rivers, and remote logistics forcing plans to be realistic about sequencing and access",
  },
  permitter: {
    "fort-st-john-plateau":
      "files that need stronger wetland, access, and cumulative-effects context before Peace-region reviewers are comfortable",
    "muskwa-foothills":
      "applications that get slowed by remote-access engineering questions and caribou-related timing constraints",
    "bulkley-valley":
      "packages redlined over visual exposure, water-intake risk, and the need for sharper mitigation maps",
    "fraser-plateau":
      "submissions that now have to explain fuel-management logic, emergency-route sensitivity, and post-fire stand intent",
    "skeena-nass":
      "referrals that live or die on fish-stream classification, crossing design notes, and karst-aware layout evidence",
    "tahltan-highland":
      "remote-area packages that need credible logistics, timing windows, and early cultural-value engagement to move cleanly",
  },
  recce: {
    "fort-st-john-plateau":
      "pumping peat, soft shoulders, beavered draws, and culvert outlets disappearing into muskeg",
    "muskwa-foothills":
      "slumping fills, avalanchey side slopes, helicopter-only viewpoints, and fresh caribou sign in high ground",
    "bulkley-valley":
      "highly visible road prisms, recreation use, and drainage features that matter because somebody downstream is watching",
    "fraser-plateau":
      "beetle-killed stems, smoke-stalled work, and old fire edges complicating what looked like straightforward access",
    "skeena-nass":
      "fish-bearing channels, undercut approaches, sinkholes, and wet cedar-hemlock ground that punishes bad footing",
    "tahltan-highland":
      "snow lingering on benches, cold braided rivers, and long stretches where a small access mistake becomes a camp problem",
  },
  silviculture: {
    "fort-st-john-plateau":
      "wet frost pockets beside warmer aspen-spruce ridges, making stock choice and planting timing matter block by block",
    "muskwa-foothills":
      "short planting windows, cold soils, and variable snowpack leaving higher-elevation prescriptions behind the calendar",
    "bulkley-valley":
      "brush competition and public visibility making site appearance almost as important as stocking performance",
    "fraser-plateau":
      "beetle-recovery ground with thin stocking on dry knolls, heavy brush in draws, and pressure to diversify species mixes",
    "skeena-nass":
      "waterlogged pockets, dense salmonberry and devil's club competition, and tricky ground access for survey crews",
    "tahltan-highland":
      "high-elevation cold soils, browse pressure, and expensive re-entry logistics on any block that misses the first pass",
  },
};

export function getRoleAreaBriefing(roleId, area, options = {}) {
  const maxFinds = Math.max(1, Number(options.maxFinds) || 4);
  const baseFinds = ROLE_BASELINES[roleId] || [];
  const areaFocus = ROLE_AREA_FOCUS[roleId]?.[area?.id];
  const likelyFinds = [...baseFinds, areaFocus].filter(Boolean).slice(0, maxFinds);

  return {
    zoneSummary: area?.zoneSummary || "",
    seasonalSignals: Array.isArray(area?.seasonalSignals) ? area.seasonalSignals : [],
    likelyFinds,
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
