export const OPERATING_AREAS = [
  {
    id: "fort-st-john-plateau",
    name: "Fort St. John Plateau",
    description:
      "Glaciated uplands bridging agriculture and boreal muskeg in the Peace River district.",
    becZone: "BWBSmw1 – Boreal White and Black Spruce moist warm",
    becCode: "BWBSmw1",
    zoneSummary:
      "Peatland-heavy BWBS country where muskeg, wetlands, and industrial linear disturbance change access assumptions quickly.",
    dominantTrees: ["white spruce", "trembling aspen", "black spruce"],
    focusTopics: ["muskeg road stability", "cumulative gas development effects", "wetland buffers"],
    seasonalSignals: [
      "Spring breakup turns firm-looking approaches into pumping peat.",
      "Frozen winter ground can open access, but only while cold holds.",
      "Wetland and stream buffers routinely shrink usable ground late in layout."
    ],
    indigenousPartners: ["Doig River First Nation", "Blueberry River First Nations"],
    communities: ["Fort St. John", "Charlie Lake"],
    tags: ["bwbs", "peace-region", "peatland", "gas-interface", "winter-road", "northern-bc"],
  },
  {
    id: "muskwa-foothills",
    name: "Muskwa Foothills",
    description:
      "Rugged foothills leading to the Northern Rockies with steep drainages and remote camps.",
    becZone: "BWBSdk2 – Boreal White and Black Spruce dry cool",
    becCode: "BWBSdk2",
    zoneSummary:
      "Foothill BWBS ground with steep drainages, thaw-sensitive fills, and long, helicopter-dependent access lines.",
    dominantTrees: ["lodgepole pine", "white spruce", "subalpine fir"],
    focusTopics: ["permafrost slumps", "mountain caribou habitat", "helicopter access planning"],
    seasonalSignals: [
      "Spring runoff destabilizes side-cast, crossings, and old spur fills.",
      "Summer field windows are short once wildlife timing and distance are factored in.",
      "Early snow can shut ridge work down before the schedule says it should."
    ],
    indigenousPartners: ["Fort Nelson First Nation", "Prophet River First Nation"],
    communities: ["Fort Nelson", "Toad River"],
    tags: ["bwbs", "caribou", "steep", "remote-camps", "winter-road", "northern-bc"],
  },
  {
    id: "bulkley-valley",
    name: "Bulkley Valley Escarpment",
    description:
      "Sub-boreal spruce benches overlooking the Bulkley River with mixed-use community interface.",
    becZone: "SBSmc2 – Sub-Boreal Spruce moist cold",
    becCode: "SBSmc2",
    zoneSummary:
      "SBS bench country above towns and rivers where visual quality, recreation use, and community water concerns stay in play.",
    dominantTrees: ["hybrid spruce", "subalpine fir", "paper birch"],
    focusTopics: ["visual quality", "community water intakes", "interface fuel management"],
    seasonalSignals: [
      "Spring freshet makes drainage and sediment mistakes visible fast.",
      "Summer smoke and interface risk push fuel management onto the same page as production.",
      "Fall public use keeps road alignment and cutblock appearance front and centre."
    ],
    indigenousPartners: ["Wet'suwet'en", "Gitxsan"],
    communities: ["Smithers", "Telkwa"],
    tags: ["sbs", "community-interface", "visuals", "watershed", "northern-bc"],
  },
  {
    id: "fraser-plateau",
    name: "Fraser Plateau Uplands",
    description:
      "Gently rolling SBS plateau south of Prince George with long wildfire shadows and beetle legacies.",
    becZone: "SBSwk1 – Sub-Boreal Spruce wet cool",
    becCode: "SBSwk1",
    zoneSummary:
      "Wet-cool SBS plateau with beetle-legacy stands, wildfire pressure, and sensitivity around evacuation corridors.",
    dominantTrees: ["hybrid spruce", "lodgepole pine", "trembling aspen"],
    focusTopics: ["landscape wildfire resilience", "beetle salvage regeneration", "community evacuation routes"],
    seasonalSignals: [
      "Spring access stays patchy until frost is fully out of the ground.",
      "Summer smoke can erase field productivity for days at a time.",
      "Post-beetle regeneration problems only show up clearly once crews walk the block."
    ],
    indigenousPartners: ["Lheidli T'enneh First Nation", "Nazko First Nation"],
    communities: ["Prince George", "Hixon"],
    tags: ["sbs", "wildfire", "beetle-recovery", "evac-route", "northern-bc"],
  },
  {
    id: "skeena-nass",
    name: "Skeena-Nass Transition",
    description:
      "Fog-laden coastal hemlock valleys with deep ravines, salmon systems, and karst plateaus.",
    becZone: "CWHws2 – Coastal Western Hemlock very wet submaritime",
    becCode: "CWHws2",
    zoneSummary:
      "Very wet CWH valleys where fish-bearing crossings, saturated slopes, and karst hydrology drive the job.",
    dominantTrees: ["western hemlock", "sitka spruce", "western redcedar"],
    focusTopics: ["salmon-bearing crossings", "karst conservation", "community water protection"],
    seasonalSignals: [
      "Heavy rain changes crossings and slope stability overnight.",
      "Salmon timing raises the cost of rushed access decisions.",
      "Thin soils over karst mean small layout mistakes create big downstream problems."
    ],
    indigenousPartners: ["Nisga'a Nation", "Gitanyow"],
    communities: ["Terrace", "New Aiyansh"],
    tags: ["cwh", "karst", "salmon", "community-water", "northern-bc"],
  },
  {
    id: "tahltan-highland",
    name: "Tahltan Highland",
    description:
      "High-elevation lodgepole pine and spruce parklands adjacent to alpine plateaus and glacial river systems.",
    becZone: "SWBmk – Spruce–Willow–Birch moist cool",
    becCode: "SWBmk",
    zoneSummary:
      "High, cold SWB country with short field windows, glacial rivers, strong wildlife constraints, and long supply lines.",
    dominantTrees: ["engelmann spruce", "subalpine fir", "willow scrub"],
    focusTopics: ["glacial outburst preparedness", "cultural cedar harvest", "remote nursery logistics"],
    seasonalSignals: [
      "Snow lingers on higher benches deep into spring.",
      "Summer access depends on river levels, aviation, and brief weather windows.",
      "Cold snaps come early and expose any weak camp or nursery logistics."
    ],
    indigenousPartners: ["Tahltan Nation"],
    communities: ["Iskut", "Dease Lake"],
    tags: ["swb", "glacial", "remote-camps", "caribou", "northern-bc"],
  },
];
