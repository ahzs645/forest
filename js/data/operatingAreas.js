export const OPERATING_AREAS = [
  {
    id: "fort-st-john-plateau",
    name: "Fort St. John Plateau",
    description:
      "Glaciated uplands bridging agriculture and boreal muskeg in the Peace River district.",
    becZone: "BWBSmw – Boreal White and Black Spruce moist warm",
    becCode: "BWBSmw",
    zoneSummary:
      "Peace District muskeg country where peat soils, wetlands, and dense linear disturbance can turn a clean access sketch into a winter-only file.",
    dominantTrees: ["white spruce", "trembling aspen", "black spruce"],
    focusTopics: ["muskeg road stability", "cumulative gas development effects", "wetland buffers"],
    seasonalSignals: [
      "Spring breakup turns firm-looking approaches into pumping peat.",
      "Frozen winter ground can open access, but only while cold holds.",
      "Wetland and stream buffers routinely shrink usable ground late in layout."
    ],
    indigenousPartners: ["Doig River First Nation", "Blueberry River First Nations"],
    communities: ["Fort St. John", "Charlie Lake"],
    tags: ["bwbs", "peace-region", "peatland", "gas-interface", "winter-road", "northern-bc", "bc-wide"],
  },
  {
    id: "muskwa-foothills",
    name: "Muskwa Foothills",
    description:
      "Rugged foothills leading to the Northern Rockies with steep drainages and remote camps.",
    becZone: "BWBSdk2 – Boreal White and Black Spruce dry cool",
    becCode: "BWBSdk2",
    zoneSummary:
      "Northeast foothill ground where steep drainages, thaw-sensitive fills, and remote camps make access credibility part of every decision.",
    dominantTrees: ["lodgepole pine", "white spruce", "subalpine fir"],
    focusTopics: ["permafrost slumps", "northern mountain caribou habitat", "helicopter access planning"],
    seasonalSignals: [
      "Spring runoff destabilizes side-cast, crossings, and old spur fills.",
      "Summer field windows are short once wildlife timing and distance are factored in.",
      "Early snow can shut ridge work down before the schedule says it should."
    ],
    indigenousPartners: ["Fort Nelson First Nation", "Prophet River First Nation"],
    communities: ["Fort Nelson", "Toad River"],
    tags: ["bwbs", "caribou", "steep", "remote-camps", "winter-road", "northern-bc", "bc-wide"],
  },
  {
    id: "bulkley-valley",
    name: "Bulkley Valley Escarpment",
    description:
      "Sub-boreal spruce benches overlooking the Bulkley River with mixed-use community interface.",
    becZone: "SBSmc2 – Sub-Boreal Spruce moist cold",
    becCode: "SBSmc2",
    zoneSummary:
      "Bulkley bench country above towns and rivers where visual quality, recreation traffic, and community water concerns stay live on every map.",
    dominantTrees: ["hybrid spruce", "subalpine fir", "lodgepole pine"],
    focusTopics: ["visual quality", "community water intakes", "interface fuel management"],
    seasonalSignals: [
      "Spring freshet makes drainage and sediment mistakes visible fast.",
      "Summer smoke and interface risk push fuel management onto the same page as production.",
      "Fall public use keeps road alignment and cutblock appearance front and centre."
    ],
    indigenousPartners: ["Wet'suwet'en", "Gitxsan"],
    communities: ["Smithers", "Telkwa"],
    tags: ["sbs", "community-interface", "visuals", "watershed", "northern-bc", "bc-wide"],
  },
  {
    id: "fraser-plateau",
    name: "Fraser Plateau Uplands",
    description:
      "Gently rolling SBS plateau south of Prince George with long wildfire shadows and beetle legacies.",
    becZone: "SBSdw2 – Sub-Boreal Spruce dry warm (Blackwater)",
    becCode: "SBSdw2",
    zoneSummary:
      "Central Interior SBS plateau where beetle-killed pine, mixedwood recovery, and wildfire planning all sit close to community evacuation routes.",
    dominantTrees: ["hybrid spruce", "lodgepole pine", "trembling aspen"],
    focusTopics: ["landscape wildfire resilience", "beetle salvage regeneration", "community evacuation routes"],
    seasonalSignals: [
      "Spring access stays patchy until frost is fully out of the ground.",
      "Summer smoke can erase field productivity for days at a time.",
      "Post-beetle regeneration problems only show up clearly once crews walk the block."
    ],
    indigenousPartners: ["Lheidli T'enneh First Nation", "Nazko First Nation"],
    communities: ["Prince George", "Hixon"],
    tags: ["sbs", "wildfire", "beetle-recovery", "evac-route", "northern-bc", "bc-wide"],
  },
  {
    id: "skeena-nass",
    name: "Skeena-Nass Transition",
    description:
      "Fog-laden coastal hemlock valleys with deep ravines, salmon systems, and karst plateaus.",
    becZone: "CWHws1 – Coastal Western Hemlock wet submaritime (submontane)",
    becCode: "CWHws1",
    zoneSummary:
      "Northwest coastal transition where fish-bearing crossings, saturated slopes, and karst drainage decide whether the work is even buildable.",
    dominantTrees: ["western hemlock", "Sitka spruce", "western redcedar"],
    focusTopics: ["salmon-bearing crossings", "karst conservation", "community water protection"],
    seasonalSignals: [
      "Heavy rain changes crossings and slope stability overnight.",
      "Salmon timing raises the cost of rushed access decisions.",
      "Thin soils over karst mean small layout mistakes create big downstream problems."
    ],
    indigenousPartners: ["Nisga'a Nation", "Gitanyow"],
    communities: ["Terrace", "Gitlax̱t'aamiks (New Aiyansh)"],
    tags: ["cwh", "karst", "salmon", "community-water", "northern-bc", "bc-wide"],
  },
  {
    id: "tahltan-highland",
    name: "Tahltan Highland",
    description:
      "High, cold spruce–willow–birch parkland above glacial rivers, with alpine plateaus close overhead.",
    becZone: "SWBmk – Spruce–Willow–Birch moist cool",
    becCode: "SWBmk",
    zoneSummary:
      "Tahltan high-country where short field windows, glacial rivers, wildlife timing, and long supply lines punish weak logistics.",
    dominantTrees: ["white spruce", "subalpine fir", "scrub birch and willow"],
    focusTopics: ["glacial outburst preparedness", "culturally modified trees and heritage screening", "remote seedling cold-storage and camp logistics"],
    seasonalSignals: [
      "Snow lingers on higher benches deep into spring.",
      "Summer access depends on river levels, aviation, and brief weather windows.",
      "Cold snaps come early and expose any weak camp or seedling cold-storage logistics."
    ],
    indigenousPartners: ["Tahltan Nation"],
    communities: ["Iskut", "Dease Lake"],
    tags: ["swb", "glacial", "remote-camps", "caribou", "northern-bc", "bc-wide"],
  },
  {
    id: "vancouver-island-coast",
    name: "Vancouver Island Coast",
    description:
      "Alberni Valley: wind-exposed coastal benches where windfirm-edge design is a live issue, with steep creek systems and public-facing forest roads.",
    becZone: "CWHxm2 – Coastal Western Hemlock very dry maritime",
    becCode: "CWHxm2",
    zoneSummary:
      "Alberni Valley ground where fish streams, rainfall-driven access failures, windthrow along fresh edges, and visible roadside harvests stay under close public scrutiny.",
    dominantTrees: ["Douglas-fir", "western hemlock", "western redcedar"],
    focusTopics: ["fish-stream crossings", "windfirm edge design and blowdown", "visual quality near public roads"],
    seasonalSignals: [
      "Fall and winter rain can turn a manageable crossing into a shutdown overnight.",
      "Summer public traffic makes visible layout and roadside slash a reputation issue fast.",
      "Short dry windows reward crews that already know which work is truly ready to move."
    ],
    indigenousPartners: ["Tseshaht First Nation", "Hupačasath First Nation"],
    communities: ["Port Alberni", "Nanaimo"],
    tags: ["cwh", "salmon", "community-interface", "visuals", "community-water", "steep", "bc-wide"],
  },
  {
    id: "kootenay-wetbelt",
    name: "Kootenay Wetbelt",
    description:
      "Interior cedar-hemlock valleys, avalanche-prone side slopes, and high-value watersheds along the West Kootenay and Creston valleys.",
    becZone: "ICHmw2 – Interior Cedar–Hemlock moist warm (Columbia–Shuswap)",
    becCode: "ICHmw2",
    zoneSummary:
      "Southeast wetbelt ground where cedar-hemlock regen, steep road prisms, and community watersheds keep both engineering and public trust in play.",
    dominantTrees: ["western redcedar", "western hemlock", "Douglas-fir"],
    focusTopics: ["community watersheds", "steep-road engineering", "wetbelt regeneration"],
    seasonalSignals: [
      "Spring runoff can reopen drainage and slide concerns on roads that looked stable at snowmelt.",
      "Summer storms keep stream timing and sediment control live deep into the operating window.",
      "Wetbelt regen can look acceptable on paper while brush, browse, and patchy light tell a different story."
    ],
    indigenousPartners: ["Ktunaxa Nation (yaqan nuʔkiy)", "Sinixt Confederacy"],
    communities: ["Nelson", "Creston"],
    tags: ["watershed", "community-interface", "steep", "karst", "bc-wide"],
  },
  {
    id: "okanagan-shuswap-drybelt",
    name: "Okanagan/Shuswap Drybelt",
    description:
      "Dry Douglas-fir and pine benchlands where interface fire planning, community optics, and water sensitivity shape almost every file.",
    becZone: "IDFxh1 – Interior Douglas-fir very dry hot (Okanagan)",
    becCode: "IDFxh1",
    zoneSummary:
      "Southern Interior drybelt where wildfire-operability, visual quality, and community-water concerns can outweigh straightforward timber logic.",
    dominantTrees: ["Douglas-fir", "lodgepole pine", "ponderosa pine"],
    focusTopics: ["interface wildfire planning", "community visuals", "drybelt regeneration"],
    seasonalSignals: [
      "Spring green-up is short, so road, burn, and treatment timing can stack on top of each other quickly.",
      "Summer heat and smoke compress field windows and change what safe production looks like.",
      "Fall public attention stays high on visible ground near highways, homes, and recreation corridors."
    ],
    indigenousPartners: ["Okanagan Indian Band", "Splatsin"],
    communities: ["Vernon", "Salmon Arm"],
    tags: ["wildfire", "community-interface", "visuals", "watershed", "bc-wide"],
  },
];
