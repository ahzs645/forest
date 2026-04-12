export const ISSUE_LIBRARY = [
  {
    id: "peatland-subsidence",
    title: "Muskeg Subsidence on Haul Route",
    description:
      "A warm spell is softening peatland crossings along your mainline north of the Peace River, and loaded trucks are starting to break through.",
    roles: ["recce", "planner"],
    areaTags: ["peatland", "bwbs", "peace-region"],
    seasonBias: ["Spring Planning", "Winter Review"],
    options: [
      {
        label: "Corduroy the approaches and reduce axle loads",
        outcome:
          "Crews spend two days laying corduroy mats and instituting lighter loads. Production slows but you keep the haul alive.",
        effects: { progress: -2, forestHealth: 3, relationships: 2, compliance: 3, budget: -3 },
      },
      {
        label: "Reroute across higher ridge ground",
        outcome:
          "You pivot to a longer ridge alignment. It avoids damage yet demands extra engineering checks.",
        effects: { progress: -4, forestHealth: 4, compliance: 5, budget: -2 },
      },
      {
        label: "Suspend hauling until freeze-up",
        outcome:
          "Operations pause entirely. Communities appreciate the caution while the mill scrambles for fibre.",
        effects: { progress: -6, relationships: 4, compliance: 6 },
      },
    ],
  },
  {
    id: "caribou-range-closure",
    title: "Caribou Maternal Pen Closure",
    description:
      "The province issues an emergency access restriction around a caribou maternal pen overlapping your BWBS and SWB tenure.",
    roles: ["planner", "permitter", "recce"],
    areaTags: ["caribou", "bwbs", "swb"],
    seasonBias: ["Summer Field"],
    options: [
      {
        label: "Shift development to alternate watersheds",
        outcome:
          "You relocate effort to adjacent drainages. Stakeholders applaud but contractors face idle periods.",
        effects: { progress: -5, relationships: 5, compliance: 6 },
      },
      {
        label: "Negotiate limited access windows with guardians",
        outcome:
          "A co-developed schedule allows short hauling windows with Indigenous monitors on site.",
        effects: { progress: 2, relationships: 4, compliance: 4, forestHealth: -1 },
      },
      {
        label: "Challenge the order citing economic hardship",
        outcome:
          "An appeal buys you time but strains relationships across the table.",
        effects: { progress: 4, relationships: -6, compliance: -4 },
      },
    ],
  },
  {
    id: "cultural-burning-collab",
    title: "Cultural Burning Collaboration",
    description:
      "Lheidli T'enneh firekeepers request support for a cultural burn on SBS interface blocks to reduce ladder fuels before summer.",
    roles: ["planner", "silviculture"],
    areaTags: ["sbs", "community-interface", "wildfire"],
    seasonBias: ["Spring Planning"],
    options: [
      {
        label: "Fund planning and integrate burn objectives",
        outcome:
          "You supply burn plans, crews, and monitoring. The collaboration deepens trust and improves stand resilience.",
        effects: { progress: 1, forestHealth: 7, relationships: 8, compliance: 4, budget: -3 },
      },
      {
        label: "Decline citing risk and resource limits",
        outcome:
          "You keep focus on conventional treatments. Partners view the response as dismissive.",
        effects: { progress: 2, relationships: -4, compliance: -2 },
      },
      {
        label: "Refer to BC Wildfire Service to lead",
        outcome:
          "BCWS agrees to facilitate under strict conditions. The burn proceeds cautiously with moderate relationship gains.",
        effects: { progress: 0, forestHealth: 5, relationships: 3, compliance: 3 },
      },
    ],
  },
  {
    id: "salmon-crossing-washout",
    title: "Salmon Crossing Washout",
    description:
      "An atmospheric river scours a fish-bearing creek along your Skeena access road, leaving gear stranded beyond the washout.",
    roles: ["recce", "permitter"],
    areaTags: ["cwh", "salmon", "steep"],
    seasonBias: ["Fall Integration"],
    options: [
      {
        label: "Install a temporary Bailey bridge with habitat oversight",
        outcome:
          "Engineers and biologists fast-track a modular bridge. It's costly but keeps the salmon channel stable.",
        effects: { progress: 3, relationships: 3, compliance: 5, budget: -5 },
      },
      {
        label: "Suspend hauling and reroute to higher ground",
        outcome:
          "You leave equipment in place and develop a ridge detour. Contractors grumble, yet communities commend the patience.",
        effects: { progress: -4, relationships: 4, compliance: 4, forestHealth: 2 },
      },
      {
        label: "Helicopter sling high-value loads",
        outcome:
          "Critical gear is flown out to resume production elsewhere, draining contingency funds.",
        effects: { progress: 1, relationships: 1, budget: -7 },
      },
    ],
  },
  {
    id: "smoke-inversion",
    title: "Persistent Smoke Inversion",
    description:
      "Wildfires to the south trap smoke over the SBS plateau, pushing particulate levels past safe work thresholds for a week.",
    roles: ["recce", "silviculture"],
    areaTags: ["wildfire", "sbs", "bwbs"],
    seasonBias: ["Summer Field"],
    options: [
      {
        label: "Move crews to remote sensing and planning tasks",
        outcome:
          "You pivot to mapping, data entry, and equipment maintenance until the inversion breaks.",
        effects: { progress: -2, forestHealth: 2, relationships: 2, compliance: 3 },
      },
      {
        label: "Maintain field work with respirators and hazard pay",
        outcome:
          "Productivity stays high but morale drops and WorkSafeBC raises concerns.",
        effects: { progress: 5, relationships: -3, compliance: -2, budget: -1 },
      },
    ],
  },
  {
    id: "spruce-budworm-front",
    title: "Spruce Budworm Expansion",
    description:
      "Budworm egg masses appear across SBS regeneration blocks, threatening next year's survival counts.",
    roles: ["silviculture"],
    areaTags: ["sbs", "bwbs", "beetle-recovery"],
    seasonBias: ["Summer Field"],
    options: [
      {
        label: "Deploy aerial BtK treatments on priority polygons",
        outcome:
          "You charter aircraft for targeted spraying, stemming the outbreak with regulator support.",
        effects: { progress: 2, forestHealth: 6, compliance: 4, relationships: 2, budget: -5 },
      },
      {
        label: "Adjust stocking standards and species mix",
        outcome:
          "You amend prescriptions to diversify species resilience, lowering immediate survival targets.",
        effects: { progress: -1, forestHealth: 4, compliance: 3, relationships: 2 },
      },
      {
        label: "Monitor and hope for natural predators",
        outcome:
          "Monitoring costs stay low, yet defoliation expands and auditors flag the passive stance.",
        effects: { progress: -3, forestHealth: 1, compliance: -2 },
      },
    ],
  },
  {
    id: "ice-road-window",
    title: "Ice Road Window Collapsing",
    description:
      "Mid-winter rain threatens to close the ice bridge supplying your BWBS camp for the rest of the season.",
    roles: ["recce", "planner"],
    areaTags: ["winter-road", "bwbs", "peace-region"],
    seasonBias: ["Winter Review"],
    options: [
      {
        label: "Accelerate hauling with double shifts",
        outcome:
          "Crews push through long hours to move inventory before thaw. Wear and tear increases, but quotas are met.",
        effects: { progress: 6, budget: -2, forestHealth: -1, compliance: -1 },
      },
      {
        label: "Stage loads and wait for re-freeze",
        outcome:
          "You secure landings and pause hauling. Expenses climb while you safeguard the corridor.",
        effects: { progress: -3, relationships: 2, compliance: 4, budget: -2 },
      },
      {
        label: "Truck via distant all-weather route",
        outcome:
          "A 300 km detour keeps fibre flowing but hammers your budget and schedules.",
        effects: { progress: 1, relationships: 1, budget: -6 },
      },
    ],
  },
  {
    id: "karst-cave-discovery",
    title: "Karst Cave Discovery",
    description:
      "A reconnaissance crew in the Skeena-Nass plateau uncovers a karst cave with cultural features in the planned cutblock.",
    roles: ["planner", "recce"],
    areaTags: ["karst", "cwh"],
    seasonBias: ["Fall Integration"],
    options: [
      {
        label: "Commission karst and cultural inventories",
        outcome:
          "Specialists map subterranean passages alongside Indigenous knowledge keepers, leading to a major redesign.",
        effects: { progress: -4, forestHealth: 5, relationships: 6, compliance: 6, budget: -3 },
      },
      {
        label: "Flag a reserve and proceed with buffers",
        outcome:
          "You set aside the cave feature with generous buffers. Regulators caution that monitoring must continue.",
        effects: { progress: 3, forestHealth: 2, compliance: 3 },
      },
      {
        label: "Harvest around the feature with minimal change",
        outcome:
          "Operations continue with narrow setbacks. Guardians question the protection level.",
        effects: { progress: 5, relationships: -4, compliance: -3 },
      },
    ],
  },
  {
    id: "community-water-warning",
    title: "Community Water Turbidity Warning",
    description:
      "Smithers issues a turbidity advisory downstream of your interface road maintenance work.",
    roles: ["planner", "permitter"],
    areaTags: ["community-water", "watershed", "visuals"],
    seasonBias: ["Summer Field", "Fall Integration"],
    options: [
      {
        label: "Install sediment socks and continuous monitoring",
        outcome:
          "You bring in hydrotech crews, install treatment, and share live data with the community.",
        effects: { progress: 1, relationships: 5, compliance: 5, forestHealth: 3, budget: -4 },
      },
      {
        label: "Pause work and co-author a mitigation plan",
        outcome:
          "Joint field walks develop long-term prescriptions. Schedule impacts mount, but trust rebounds strongly.",
        effects: { progress: -3, relationships: 6, compliance: 6, forestHealth: 4 },
      },
      {
        label: "Dispute the readings and continue",
        outcome:
          "You question data quality and push ahead. Officials warn that enforcement is imminent.",
        effects: { progress: 2, relationships: -5, compliance: -4 },
      },
    ],
  },
  {
    id: "glacial-outburst-watch",
    title: "Glacial Outburst Watch",
    description:
      "Hydrometric crews detect rising risk of a jökulhlaup on the Stikine headwaters below your SWB operations.",
    roles: ["planner", "recce", "silviculture"],
    areaTags: ["swb", "glacial", "caribou"],
    seasonBias: ["Summer Field"],
    options: [
      {
        label: "Evacuate valley crews and redesign drainage",
        outcome:
          "You pull teams back and invest in terrain stability modelling before re-entry.",
        effects: { progress: -5, forestHealth: 4, relationships: 3, compliance: 5, budget: -3 },
      },
      {
        label: "Install remote sensors and keep skeleton crews",
        outcome:
          "Monitoring arrays provide lead time while limited operations continue cautiously.",
        effects: { progress: 2, compliance: 2, relationships: 1, budget: -2 },
      },
      {
        label: "Accept the low probability and stay the course",
        outcome:
          "Productivity remains high, yet emergency planners flag your risk tolerance.",
        effects: { progress: 4, relationships: -4, compliance: -5 },
      },
    ],
  },
  {
    id: "seedling-logistics-crunch",
    title: "Seedling Logistics Crunch",
    description:
      "A transport strike delays delivery of SWB seedlots destined for remote Tahltan blocks.",
    roles: ["silviculture"],
    areaTags: ["remote-camps", "swb", "sbs"],
    seasonBias: ["Spring Planning"],
    options: [
      {
        label: "Charter a cargo flight to the Dease strip",
        outcome:
          "You secure a last-minute flight to move seedlings before thaw. Costs spike but survival targets stay on track.",
        effects: { progress: 2, relationships: 3, compliance: 4, budget: -6 },
      },
      {
        label: "Swap to available SBS seedlots",
        outcome:
          "You revise stocking standards to use nearby SBS lots. Regulators accept the variance with conditions.",
        effects: { progress: 1, forestHealth: 3, compliance: 5 },
      },
      {
        label: "Delay planting to the fall window",
        outcome:
          "Sites stay exposed longer. Brush competition and frost heave risks increase.",
        effects: { progress: -4, forestHealth: -2, relationships: 1 },
      },
    ],
  },
  {
    id: "lumber-market-crash",
    title: "Lumber Market Crash",
    description:
      "North American lumber prices tank overnight, forcing difficult decisions about volume commitments.",
    roles: ["planner", "permitter"],
    areaTags: ["market", "northern-bc"],
    seasonBias: ["Winter Review"],
    options: [
      {
        label: "Throttle harvest and preserve cash",
        outcome:
          "You slow felling plans and protect balance sheets. Contractors brace for lean months.",
        effects: { progress: -4, budget: 3, relationships: 2 },
      },
      {
        label: "Run full tilt to chase mill utilization",
        outcome:
          "You keep production high to maintain market share, burning through reserves.",
        effects: { progress: 5, budget: -6, relationships: -2 },
      },
      {
        label: "Pivot to value-added community contracts",
        outcome:
          "You retool output toward specialty orders with local partners, stabilizing some revenue.",
        effects: { progress: 1, budget: -2, relationships: 3, compliance: 2 },
      },
    ],
  },
  {
    id: "wildfire-heat-dome",
    title: "Heat Dome Sparks Extreme Fire Behaviour",
    description:
      "Temperatures hit record highs and fine fuels are flashing to torch height within minutes of ignition.",
    roles: ["recce", "silviculture"],
    areaTags: ["wildfire", "sbs", "swb"],
    seasonBias: ["Summer Field"],
    options: [
      {
        label: "Suspend operations and cut fuel breaks with Nations",
        outcome:
          "You stand down machinery and co-create shaded fuel breaks. Communities appreciate the caution.",
        effects: { progress: -5, forestHealth: 5, relationships: 4, compliance: 4 },
      },
      {
        label: "Shift to night operations with heavy patrols",
        outcome:
          "Crews work graveyards chasing cooler temps. Productivity holds but fatigue and risk climb.",
        effects: { progress: 3, budget: -2, relationships: -3, compliance: -2 },
      },
      {
        label: "Stage sprinkler protection and keep priority blocks running",
        outcome:
          "You install pump protection with BCWS support, balancing risk reduction with production.",
        effects: { progress: -2, forestHealth: 4, relationships: 3, budget: -3 },
      },
    ],
  },
  {
    id: "crew-influenza-wave",
    title: "Influenza Wave Hits Remote Camp",
    description:
      "Half your camp reports fever and fatigue just as winter road demob is scheduled.",
    roles: ["recce", "silviculture", "planner"],
    areaTags: ["remote-camps", "winter-road"],
    seasonBias: ["Fall Integration", "Winter Review"],
    options: [
      {
        label: "Mandate rest, fly in medical support",
        outcome:
          "You slow work and bring nurses north. Crews recover and appreciate the care.",
        effects: { progress: -3, relationships: 3, budget: -2, compliance: 3 },
      },
      {
        label: "Offer hazard pay to keep pace",
        outcome:
          "You boost wages to maintain schedule. Some staff work through illness and WorkSafeBC flags concerns.",
        effects: { progress: 4, relationships: -4, compliance: -3, budget: -3 },
      },
      {
        label: "Rotate crews with partner contractors",
        outcome:
          "You swap in healthy crews from a partner firm, sharing costs and goodwill.",
        effects: { progress: 1, relationships: 2, budget: -4, forestHealth: 1 },
      },
    ],
  },
  {
    id: "drone-survey-offer",
    title: "Drone Survey Partnership Offer",
    description:
      "A regional Nation proposes co-managing a drone program to monitor block performance and wildlife sightings.",
    roles: ["recce", "planner"],
    areaTags: ["sbs", "cwh", "technology"],
    seasonBias: ["Spring Planning"],
    options: [
      {
        label: "Invest in shared drone training and data hub",
        outcome:
          "You finance training and a data platform, sharpening situational awareness for both parties.",
        effects: { progress: 2, forestHealth: 3, compliance: 2, budget: -4 },
      },
      {
        label: "Pilot guardian-led flights over priority watersheds",
        outcome:
          "Guardians collect imagery and co-analyze findings with your team, building deep trust.",
        effects: { progress: 1, relationships: 5, compliance: 3, budget: -2 },
        setFlags: { guardianTechAlliance: true },
      },
      {
        label: "Stick with traditional ground transects",
        outcome:
          "You decline the technology pilot. Efficiencies remain unrealized and partners feel sidelined.",
        effects: { progress: 3, budget: 1, compliance: -2 },
      },
    ],
  },
  {
    id: "policy-funding-cut",
    title: "Provincial Funding Cut",
    description:
      "New fiscal directives slash stewardship funding mid-year, forcing reprioritization.",
    roles: ["planner", "permitter"],
    areaTags: ["policy", "northern-bc"],
    seasonBias: ["Winter Review"],
    options: [
      {
        label: "Re-sequence projects to match available funds",
        outcome:
          "You defer lower-priority works and keep compliance-critical files advancing.",
        effects: { progress: -3, budget: 2, compliance: 3 },
      },
      {
        label: "Lobby for bridge funding with municipal partners",
        outcome:
          "You coordinate letters of support and gain partial relief while deepening alliances.",
        effects: { progress: 1, relationships: 3, compliance: 1, budget: -1 },
      },
      {
        label: "Pull capital from other business units",
        outcome:
          "Corporate loans keep crews working but finance warns of tighter oversight going forward.",
        effects: { progress: 3, budget: -5, compliance: 2 },
      },
    ],
  },
  {
    id: "lidar-payload-failure",
    title: "LiDAR Payload Failure",
    description:
      "Your aerial LiDAR platform glitches mid-flight, corrupting data for critical road designs.",
    roles: ["recce"],
    areaTags: ["technology", "steep", "bwbs"],
    seasonBias: ["Summer Field"],
    options: [
      {
        label: "Re-fly the mission with vendor support",
        outcome:
          "You charter a replacement aircraft and recover coverage at premium rates.",
        effects: { progress: -2, compliance: 3, budget: -5 },
      },
      {
        label: "Switch to ground-based total station surveys",
        outcome:
          "Crews spend longer in the bush but produce reliable results.",
        effects: { progress: -3, compliance: 4, relationships: 1 },
      },
      {
        label: "Approximate designs from partial scans",
        outcome:
          "You extrapolate alignments. Auditors warn that tolerances are razor thin.",
        effects: { progress: 2, compliance: -3, forestHealth: -1 },
      },
    ],
  },
  {
    id: "labour-job-action",
    title: "Labour Job Action Threatened",
    description:
      "Union stewards demand revised safety provisions or threaten a strategic slowdown before fall surge.",
    roles: ["recce", "silviculture", "planner"],
    areaTags: ["remote-camps", "northern-bc"],
    seasonBias: ["Fall Integration"],
    options: [
      {
        label: "Co-develop a refreshed safety charter",
        outcome:
          "You spend two weeks negotiating safeguards and joint inspections, averting the slowdown.",
        effects: { progress: -2, relationships: 5, compliance: 4, budget: -2 },
      },
      {
        label: "Offer bonuses to keep the season moving",
        outcome:
          "You buy short-term peace yet signal safety takes a backseat to quotas.",
        effects: { progress: 4, relationships: -4, compliance: -3, budget: -3 },
      },
      {
        label: "Call the bluff and prepare replacement crews",
        outcome:
          "Replacement hires arrive but community sentiment cools dramatically.",
        effects: { progress: 3, relationships: -5, compliance: -2 },
      },
    ],
  },
  {
    id: "pine-beetle-scouts",
    title: "Mountain Pine Beetle Scouts Detected",
    description:
      "Beetles are surfacing on the fringe of your SBS salvage recovery units. Entomologists warn an outbreak could reignite.",
    roles: ["planner", "recce", "silviculture"],
    areaTags: ["sbs", "beetle-recovery"],
    seasonBias: ["Spring Planning"],
    options: [
      {
        label: "Launch sanitation crews immediately",
        outcome:
          "You fall trap-trees and chip hotspots, buying valuable time against the beetles.",
        effects: { progress: -2, forestHealth: 5, compliance: 3, relationships: 2, budget: -3 },
        clearFlags: ["pineBeetleMonitor", "pineBeetleUnchecked"],
      },
      {
        label: "Monitor with pheromone traps for a season",
        outcome:
          "You collect data before committing funds. Scientists caution that action will be needed soon.",
        effects: { progress: 0, forestHealth: 1, compliance: 1, budget: -1 },
        setFlags: { pineBeetleMonitor: true },
        scheduleIssues: { id: "pine-beetle-escalation", delay: 1 },
      },
      {
        label: "Hold budgets for now and hope cold snaps arrive",
        outcome:
          "You bank on weather doing the work. Neighbours question the hands-off approach.",
        effects: { progress: 2, relationships: -2, compliance: -2 },
        setFlags: { pineBeetleUnchecked: true },
        scheduleIssues: { id: "pine-beetle-escalation", delay: 1 },
      },
    ],
  },
  {
    id: "pine-beetle-escalation",
    title: "Beetle Flights Intensify",
    description:
      "Trap data shows beetle flights tripled. Adjacent licensees report mortality creeping toward their stands.",
    roles: ["planner", "silviculture"],
    areaTags: ["sbs", "beetle-recovery"],
    seasonBias: ["Summer Field"],
    requiresAnyFlags: ["pineBeetleMonitor", "pineBeetleUnchecked"],
    options: [
      {
        label: "Fund aerial surveys and joint response now",
        outcome:
          "You coordinate aerial sweep maps, sharing intel region-wide to contain spread.",
        effects: { progress: -3, forestHealth: 4, relationships: 3, compliance: 3, budget: -3 },
        clearFlags: ["pineBeetleMonitor", "pineBeetleUnchecked"],
      },
      {
        label: "Prioritize salvage volume while it lasts",
        outcome:
          "You swing crews into salvage blitzes, drawing criticism for short-term thinking.",
        effects: { progress: 4, forestHealth: -3, relationships: -3, compliance: -2, budget: 2 },
        setFlags: { pineBeetleUnchecked: true },
        scheduleIssues: { id: "pine-beetle-regional", delay: 1 },
      },
      {
        label: "Wait for provincial funding to materialize",
        outcome:
          "You gamble on new grants before acting. Pressure mounts from neighbours.",
        effects: { progress: -1, forestHealth: -2, relationships: -2 },
        setFlags: { pineBeetleUnchecked: true },
        scheduleIssues: { id: "pine-beetle-regional", delay: 1 },
      },
    ],
  },
  {
    id: "pine-beetle-regional",
    title: "Regional Beetle Spillover",
    description:
      "Adjacent operations suffer outbreaks traced to your tenure, straining cross-license relationships.",
    roles: ["planner", "permitter"],
    areaTags: ["sbs", "beetle-recovery"],
    seasonBias: ["Fall Integration"],
    requiresFlags: ["pineBeetleUnchecked"],
    options: [
      {
        label: "Lead a regional emergency summit",
        outcome:
          "You convene peers, Nations, and government to rebuild trust and align salvage plans.",
        effects: { progress: -2, relationships: 5, compliance: 4, forestHealth: 2, budget: -2 },
        clearFlags: ["pineBeetleUnchecked"],
      },
      {
        label: "Offer stumpage credits to impacted neighbours",
        outcome:
          "Credits soften the blow but dent your financial outlook.",
        effects: { progress: -1, relationships: 3, budget: -4, compliance: 1 },
        clearFlags: ["pineBeetleUnchecked"],
      },
      {
        label: "Downplay the link and stay focused internally",
        outcome:
          "You dispute the attribution. Collaboration fractures and oversight increases.",
        effects: { progress: 2, relationships: -6, compliance: -4 },
        clearFlags: ["pineBeetleUnchecked"],
      },
    ],
  },
  {
    id: "highway-16-viewshed-redesign",
    title: "Highway 16 Viewshed Redesign",
    roles: ["planner"],
    areaTags: ["sbs", "visuals", "community-interface"],
    seasonBias: ["Spring Planning"],
    description:
      "Updated sightline work above Smithers shows your opening and road prism will read much harder from Highway 16 and town than the first layout suggested.",
    options: [
      {
        label: "Re-cut the boundary and add heavier edge retention",
        outcome:
          "You give up some volume, yet the opening finally fits the valley's visual expectations.",
        effects: { progress: -3, compliance: 5, relationships: 4, forestHealth: 2 },
      },
      {
        label: "Phase the harvest and add road-screening commitments",
        outcome:
          "The layout stays mostly intact while the mitigation package becomes more credible.",
        effects: { progress: -1, compliance: 3, relationships: 3, budget: -2 },
      },
      {
        label: "Defend the efficient shape and move to notice",
        outcome:
          "The schedule survives, but reviewers start from the premise that appearance was pushed to the bottom of the pile.",
        effects: { progress: 3, compliance: -4, relationships: -5 },
      },
    ],
  },
  {
    id: "cumulative-effects-dashboard-flare",
    title: "Cumulative Effects Dashboard Flare",
    roles: ["planner"],
    areaTags: ["watershed", "visuals", "northern-bc"],
    seasonBias: ["Summer Field"],
    description:
      "Mid-season monitoring now shows watershed disturbance, road density, and visible opening area climbing faster than the planning model predicted.",
    options: [
      {
        label: "Re-sequence the program around the hottest indicators",
        outcome:
          "You slow the plan down and move risk off the most exposed basins before critics write the story for you.",
        effects: { progress: -3, compliance: 5, relationships: 4, forestHealth: 3 },
      },
      {
        label: "Narrow the block list but keep the annual strategy",
        outcome:
          "The plan stays recognizable, though a smaller working set means harder choices later in the year.",
        effects: { progress: -1, compliance: 3, budget: -1, relationships: 2 },
      },
      {
        label: "Treat the dashboard as lagging noise and keep the original sequence",
        outcome:
          "Volume stays on paper, but the gap between the model and the ground becomes the new argument.",
        effects: { progress: 3, compliance: -5, relationships: -4, forestHealth: -2 },
      },
    ],
  },
  {
    id: "winter-block-sequencing-board",
    title: "Winter Block Sequencing Board",
    roles: ["planner"],
    areaTags: ["winter-road", "remote-camps", "northern-bc"],
    seasonBias: ["Fall Integration"],
    description:
      "Roadbuilding, harvesting, and silviculture teams have each optimized different blocks for freeze-up, and only one winter sequence can actually fit the access window.",
    options: [
      {
        label: "Run an integrated resequencing session and pick one honest plan",
        outcome:
          "Everyone gives something up, but the winter board finally matches the crews and roads you actually have.",
        effects: { progress: -2, relationships: 5, compliance: 3, budget: -1 },
      },
      {
        label: "Stage a smaller satellite program beside the core sequence",
        outcome:
          "You preserve a backup option, though the standby work drains planning attention and contingency funds.",
        effects: { progress: 1, budget: -3, relationships: 1, compliance: 1 },
      },
      {
        label: "Let operations pick the sequence and force the rest to adapt",
        outcome:
          "The board gets simple quickly, but stewardship staff and finance stop trusting the assumptions underneath it.",
        effects: { progress: 3, relationships: -5, forestHealth: -2, compliance: -2 },
      },
    ],
  },
  {
    id: "annual-plan-reforecast",
    title: "Annual Plan Reforecast",
    roles: ["planner"],
    areaTags: ["winter-road", "northern-bc"],
    seasonBias: ["Winter Review"],
    preconditions: {
      operationStages: ["reforecast"],
      seasons: ["winter"],
    },
    context: {
      operation: "You are resetting the annual operating plan after the winter access window failed to materialize the way the original schedule assumed.",
      objective: "Give leadership, operations, and finance a forecast they can actually deliver.",
      stakes: "If you leave the number inflated, the whole program keeps planning around work that is no longer realistically available.",
    },
    riskClass: "calculated",
    description:
      "Late freeze-up, audit delays, and contractor turnover have knocked the annual plan off schedule, and leadership wants a revised production forecast before budgets are finalized.",
    options: [
      {
        label: "Cut the forecast and protect the most defensible work",
        outcome:
          "The number gets smaller, but the revised plan reads like something operations can actually deliver.",
        effects: { progress: -2, compliance: 4, relationships: 2, budget: 2 },
      },
      {
        label: "Hold the target and build contingency scenarios around it",
        outcome:
          "You keep ambition on the table while quietly preparing backup sequences in case the winter window stays weak.",
        effects: { progress: 1, compliance: 2, budget: -2, relationships: 1 },
      },
      {
        label: "Keep the original forecast and hope the road season catches up",
        outcome:
          "The headline stays intact, but everyone downstream knows the schedule is now fiction with branding.",
        effects: { progress: 3, compliance: -4, relationships: -3 },
      },
    ],
  },
  {
    id: "exhibit-a-redline-return",
    title: "Exhibit A Redline Return",
    roles: ["permitter"],
    areaTags: ["bwbs", "peace-region", "peatland", "gas-interface", "northern-bc"],
    seasonBias: ["Spring Planning"],
    baseWeight: 2,
    description:
      "District review sends your access package back with redlines across the Exhibit A, clearing estimate, and deactivation notes just as breakup approaches.",
    options: [
      {
        label: "Rebuild the alignment package and deactivation logic",
        outcome:
          "You redraw the road, tighten the peatland rationale, and give reviewers a file that reads cleanly.",
        effects: { progress: -2, compliance: 6, budget: -2 },
      },
      {
        label: "Trim the spur to the defensible minimum and resubmit",
        outcome:
          "The footprint shrinks enough to answer most of the redlines, but the block loses some flexibility.",
        effects: { progress: -1, compliance: 4, forestHealth: 1 },
      },
      {
        label: "Argue the existing permit authority already covers it",
        outcome:
          "You save desk time for a moment, then the authority question becomes the whole review.",
        effects: { progress: 2, compliance: -6, relationships: -2 },
      },
    ],
  },
  {
    id: "significant-road-work-trigger",
    title: "Bridge Swap Triggers Significant Road Work",
    roles: ["permitter"],
    areaTags: ["salmon", "watershed", "steep", "northern-bc"],
    seasonBias: ["Summer Field"],
    baseWeight: 2,
    description:
      "A washed abutment on a fish-bearing access route turns a maintenance bridge fix into a larger realignment and structure than the district expected.",
    options: [
      {
        label: "Stop and file the significant road work package",
        outcome:
          "You lose the first fish window, but the engineering and habitat record finally match the job.",
        effects: { progress: -3, compliance: 6, budget: -2 },
      },
      {
        label: "Scale the design back to a defensible maintenance fix",
        outcome:
          "The crossing gets less future-proof, yet you stay inside a simpler approval path.",
        effects: { progress: -1, compliance: 3, forestHealth: 1 },
      },
      {
        label: "Mobilize on the original work order before questions harden",
        outcome:
          "Machines get moving fast, and so does district scrutiny.",
        effects: { progress: 3, compliance: -7, relationships: -3 },
      },
    ],
  },
  {
    id: "overlap-map-affidavit",
    title: "Overlap Map Affidavit",
    roles: ["permitter"],
    areaTags: ["winter-road", "gas-interface", "northern-bc"],
    seasonBias: ["Fall Integration"],
    description:
      "Title review finds a tenure overlap on one of your late-season files, and the district now wants a signed overlap memo before the package can move.",
    options: [
      {
        label: "Commission a clean overlap package and sworn map note",
        outcome:
          "It burns time, but the file stops wobbling and the overlap risk is finally documented properly.",
        effects: { progress: -2, compliance: 6, budget: -1 },
      },
      {
        label: "Pull the disputed block and advance the clean files first",
        outcome:
          "You preserve momentum on part of the program while conceding the overlap needs a slower resolution.",
        effects: { progress: -1, compliance: 4, relationships: 1 },
      },
      {
        label: "Call the overlap immaterial and keep the bundle intact",
        outcome:
          "The package looks faster until the title question becomes the first thing reviewers open.",
        effects: { progress: 2, compliance: -6, relationships: -2 },
      },
    ],
  },
  {
    id: "road-closeout-mismatch",
    title: "Road Closeout Record Mismatch",
    roles: ["permitter"],
    areaTags: ["winter-road", "remote-camps", "bwbs", "steep", "northern-bc"],
    seasonBias: ["Winter Review"],
    baseWeight: 2,
    description:
      "Demob notes say some spurs were deactivated, others are still under maintenance, and none of it lines up cleanly with the notices already on file.",
    options: [
      {
        label: "Reconcile the records and file the closeout properly",
        outcome:
          "You spend days chasing supervisors and maps, but the road file stops drifting.",
        effects: { progress: -2, compliance: 6, budget: -1 },
      },
      {
        label: "Keep maintenance open on the ambiguous segments",
        outcome:
          "It costs a bit more now, yet you avoid declaring an end state you cannot defend.",
        effects: { progress: -1, compliance: 3, budget: -2 },
      },
      {
        label: "Batch the notices later and hope nobody compares dates",
        outcome:
          "The paperwork feels deferred rather than solved, and that becomes obvious on review.",
        effects: { progress: 2, compliance: -6, relationships: -2 },
      },
    ],
  },
  {
    id: "thaw-ravine-realignment",
    title: "Thaw Ravine Realignment",
    roles: ["recce"],
    areaTags: ["steep", "remote-camps", "northern-bc"],
    seasonBias: ["Spring Planning"],
    description:
      "Breakup reactivates a ravine crossing you flagged in winter, and the traverse line you sold as workable no longer lands on stable ground.",
    options: [
      {
        label: "Reroute onto the ridge and refly the notes",
        outcome:
          "The line gets longer, but the traverse comes back onto ground that still makes sense after thaw.",
        effects: { progress: -2, compliance: 4, forestHealth: 2, budget: -1 },
      },
      {
        label: "Bring in a rope-and-geotech check before committing",
        outcome:
          "You burn a few field days getting the slope read properly instead of pretending the winter flagging still tells the truth.",
        effects: { progress: -3, compliance: 5, budget: -2 },
      },
      {
        label: "Keep the original line and trust it will dry out",
        outcome:
          "The shortcut survives on paper until later reviewers start asking why your traverse ignored the obvious movement.",
        effects: { progress: 3, compliance: -4, relationships: -1 },
      },
    ],
  },
  {
    id: "seep-slope-reroute",
    title: "Hidden Seep Complex on Spur Traverse",
    roles: ["recce"],
    areaTags: ["steep", "glacial", "northern-bc"],
    seasonBias: ["Summer Field"],
    baseWeight: 2,
    description:
      "Fresh recce flags a seep band crossing the exact sidehill chosen for a proposed spur, and the original line is moving just enough to unravel a cheap road.",
    options: [
      {
        label: "Reroute higher onto the ridge",
        outcome:
          "The road gets longer and more expensive, but the alignment comes back into defensible terrain.",
        effects: { progress: -2, compliance: 4, forestHealth: 3, budget: -2 },
      },
      {
        label: "Hold the line and bring in geotech",
        outcome:
          "You lose time while a specialist confirms what can actually stand up through breakup and storms.",
        effects: { progress: -3, compliance: 5, budget: -3 },
      },
      {
        label: "Build the original line with extra rock",
        outcome:
          "The shortcut keeps the schedule alive now, but future maintenance and stability risk immediately climb.",
        effects: { progress: 3, budget: -2, compliance: -4, forestHealth: -2 },
      },
    ],
  },
  {
    id: "weather-window-collapse",
    title: "Weather Window Collapse",
    roles: ["recce"],
    areaTags: ["remote-camps", "glacial", "northern-bc"],
    seasonBias: ["Fall Integration"],
    description:
      "Fog, early snow, and short daylight keep collapsing the last workable access window for one unfinished ridge traverse.",
    options: [
      {
        label: "Hold the crew in place and finish on the first clear break",
        outcome:
          "Camp costs climb, but the traverse comes home complete instead of half-believed.",
        effects: { progress: -1, compliance: 3, budget: -2, relationships: 1 },
      },
      {
        label: "Downscope to the critical control and leave the fringe notes",
        outcome:
          "You protect the most important data while accepting that part of the block will need another look next year.",
        effects: { progress: 1, compliance: 1, budget: -1 },
      },
      {
        label: "Push the crew through the bad window and finish now",
        outcome:
          "The notes come back fast, but the risk call reads worse every time the weather recap gets retold.",
        effects: { progress: 3, compliance: -4, relationships: -3 },
      },
    ],
  },
  {
    id: "whiteout-extraction-call",
    title: "Whiteout Extraction Call",
    roles: ["recce"],
    areaTags: ["winter-road", "remote-camps", "northern-bc"],
    seasonBias: ["Winter Review"],
    description:
      "A whiteout closes both the road and aviation window with one field crew still beyond the camp line during your final winter push.",
    options: [
      {
        label: "Shelter the crew in place and run strict sat check-ins",
        outcome:
          "No heroics, no headlines. The work stops, but the decision reads like leadership instead of panic.",
        effects: { progress: -3, compliance: 4, relationships: 2, budget: -1 },
      },
      {
        label: "Send a tracked recovery unit the moment visibility improves",
        outcome:
          "The extraction is slow but controlled, keeping the crew safe while preserving some confidence in the field plan.",
        effects: { progress: -1, compliance: 2, budget: -2, relationships: 1 },
      },
      {
        label: "Tell the crew to self-extract before conditions worsen",
        outcome:
          "You save time on the board and spend it all back when the call gets replayed as needless exposure.",
        effects: { progress: 2, compliance: -5, relationships: -4 },
      },
    ],
  },
  {
    id: "seedlot-vigour-drop",
    title: "Seedlot Vigour Drop at Cold Storage",
    roles: ["silviculture"],
    areaTags: ["sbs", "bwbs", "beetle-recovery"],
    seasonBias: ["Spring Planning"],
    preconditions: {
      operationStages: ["plant", "fill"],
      seasons: ["spring"],
    },
    description:
      "A nursery notice says one of your interior spruce lots lost vigour in cold storage and only part of the order should be planted.",
    options: [
      {
        label: "Reassign the best lots and rewrite the notes",
        outcome:
          "You protect the toughest blocks and document the shuffle, though the planning week gets consumed by revisions.",
        effects: { progress: -1, forestHealth: 4, compliance: 4, budget: -2 },
      },
      {
        label: "Blend pine or larch onto warmer aspects",
        outcome:
          "The mix is less elegant but operationally workable, and the rationale holds if the field notes stay tight.",
        effects: { progress: 1, forestHealth: 3, compliance: 2, relationships: 1 },
      },
      {
        label: "Plant the weak lot anyway",
        outcome:
          "Planting starts on time, but survival risk gets baked into the program from day one.",
        effects: { progress: 2, forestHealth: -4, compliance: -3, budget: 1 },
      },
    ],
  },
  {
    id: "herbicide-drift-complaint",
    title: "Herbicide Drift Complaint",
    roles: ["silviculture"],
    areaTags: ["community-interface", "watershed", "northern-bc"],
    seasonBias: ["Summer Field"],
    preconditions: {
      operationStages: ["brush"],
      seasons: ["summer"],
    },
    description:
      "A neighbouring landowner calls in a drift complaint after a hot morning treatment near the block edge, and the spray record will not speak for itself.",
    options: [
      {
        label: "Pause treatments and investigate every edge unit",
        outcome:
          "The program slows, but the file shows you took the complaint seriously before it hardened into enforcement.",
        effects: { progress: -2, compliance: 5, relationships: 4, budget: -2 },
      },
      {
        label: "Switch edge work to manual crews and keep the interior spray plan",
        outcome:
          "You keep most of the treatment target alive while reducing the risk on the visible ground.",
        effects: { progress: 1, compliance: 2, budget: -3, relationships: 2 },
      },
      {
        label: "Defend the spray record and continue as planned",
        outcome:
          "The hectares look good on the board right up until trust starts peeling away around the block.",
        effects: { progress: 3, compliance: -4, relationships: -5 },
      },
    ],
  },
  {
    id: "free-growing-catchup-plan",
    title: "Free-Growing Catch-Up Plan",
    roles: ["silviculture"],
    areaTags: ["sbs", "beetle-recovery", "northern-bc"],
    seasonBias: ["Fall Integration"],
    preconditions: {
      operationStages: ["survey"],
      standAgeClasses: ["survey-ready"],
      seasons: ["fall"],
    },
    context: {
      operation: "You are reviewing fall survey results on recovery blocks that should be tracking toward free growing.",
      objective: "Decide which units need immediate fill planting or brushing before next season.",
      stakes: "If you call weak ground acceptable, the next survey cycle will be defending biology that is already slipping.",
    },
    riskClass: "routine",
    description:
      "Fall survey plots on recovery units are coming in light after a wet summer pushed aspen suckering and grass over the crop trees.",
    options: [
      {
        label: "Package fill plant and brushing now",
        outcome:
          "You spend money now to rescue the weakest ground before the deficit compounds.",
        effects: { progress: -1, forestHealth: 5, compliance: 4, budget: -3 },
      },
      {
        label: "Rewrite targets around natural ingress",
        outcome:
          "You revise the survey rationale around natural ingress and mixed regeneration, but the record has to be explicit about what still needs follow-up.",
        effects: { progress: 1, forestHealth: 3, compliance: 2, relationships: 1 },
      },
      {
        label: "Roll the weak plots into next year",
        outcome:
          "The paperwork stays light for the moment, but the biological problem keeps growing underneath it.",
        effects: { progress: 2, budget: 1, compliance: -4, forestHealth: -2 },
      },
    ],
  },
  {
    id: "snow-press-browse-signal",
    title: "Snow Press and Browse Signal",
    roles: ["silviculture"],
    areaTags: ["bwbs", "sbs", "northern-bc"],
    seasonBias: ["Winter Review"],
    preconditions: {
      operationStages: ["inspection"],
      standAgeClasses: ["carryover"],
      seasons: ["winter"],
    },
    context: {
      operation: "You are doing winter regeneration review from field notes, browse observations, and accessible edge checks, not a full free-growing survey.",
      objective: "Set the spring follow-up plan for young mixed stands that are showing snow damage and browse.",
      stakes: "If you treat the signal as noise, the spring treatment budget and species plan will both be wrong before crews even mobilize.",
    },
    riskClass: "routine",
    description:
      "Winter access notes show snow press and heavy browse in young mixed stands near a block edge, and the spring treatment plan will be weak if the program rolls forward unchanged.",
    options: [
      {
        label: "Budget hotspot fill plant and protection",
        outcome:
          "You target the worst patches early and keep the damage from setting the tone for the whole block.",
        effects: { progress: -1, forestHealth: 4, compliance: 3, budget: -3 },
      },
      {
        label: "Shift future mixes to less palatable stock",
        outcome:
          "The next cycle becomes more defensible on tough ground, even if the future species mix moves away from the original planting plan.",
        effects: { progress: 0, forestHealth: 3, compliance: 2, relationships: 1 },
      },
      {
        label: "Treat it as normal browse and carry on",
        outcome:
          "You save money now, but the winter damage shows up again when next year's survival numbers are due.",
        effects: { progress: 2, budget: 1, compliance: -2, forestHealth: -3 },
      },
    ],
  },
  {
    id: "heritage-protocol-gap",
    title: "Heritage Protocol Gap Identified",
    description:
      "An Elders' advisory circle notes your referrals lack ceremony protocols for culturally modified trees.",
    roles: ["planner", "permitter"],
    areaTags: ["community-interface", "northern-bc"],
    seasonBias: ["Spring Planning"],
    options: [
      {
        label: "Co-write a protocol addendum and training plan",
        outcome:
          "You fund workshops and revise SOPs with Elders, strengthening partnership commitments.",
        effects: { progress: -2, relationships: 6, compliance: 4, forestHealth: 2, budget: -2 },
      },
      {
        label: "Hire cultural monitors for this season only",
        outcome:
          "Monitors join field teams, but the limited scope raises questions about long-term intent.",
        effects: { progress: 1, relationships: 3, compliance: 2, budget: -3 },
      },
      {
        label: "Document existing process and continue",
        outcome:
          "You insist current SOPs are sufficient. Trust erodes quickly.",
        effects: { progress: 2, relationships: -5, compliance: -3 },
      },
    ],
  },
  {
    id: "old-growth-audit",
    title: "Old-Growth Audit Surprise",
    description:
      "An independent audit reveals your old-growth retention is dipping toward provincial minimums.",
    roles: ["planner", "permitter"],
    areaTags: ["northern-bc", "forest-legacy"],
    seasonBias: ["Winter Review"],
    options: [
      {
        label: "Designate additional retention patches immediately",
        outcome:
          "You exceed minimums and publish the shift, signalling stewardship leadership.",
        effects: { progress: -3, forestHealth: 6, relationships: 4, compliance: 5 },
      },
      {
        label: "Plan phased retention gains over two years",
        outcome:
          "You pace improvements to cushion budgets while meeting new targets.",
        effects: { progress: -1, forestHealth: 4, compliance: 3, budget: -1 },
      },
      {
        label: "Dispute methodology and request a re-audit",
        outcome:
          "You seek clarification, delaying action but worrying environmental groups.",
        effects: { progress: 2, relationships: -3, compliance: -2 },
      },
    ],
  },
  {
    id: "wildlife-collar-drop",
    title: "Caribou GPS Collar Drop",
    description:
      "A collared caribou loses signal near your winter block, prompting concern about disturbance.",
    roles: ["recce", "silviculture"],
    areaTags: ["caribou", "winter-road"],
    seasonBias: ["Winter Review"],
    options: [
      {
        label: "Suspend work and support a tracking flight",
        outcome:
          "You co-fund an aerial search, locating the herd and reassuring guardians.",
        effects: { progress: -3, relationships: 4, compliance: 3, budget: -2 },
      },
      {
        label: "Deploy ground crews to search while operations continue",
        outcome:
          "Crews sweep the area cautiously. Operations slow but continue.",
        effects: { progress: -1, relationships: 2, compliance: 1, budget: -1 },
      },
      {
        label: "Rely on provincial wildlife staff to respond",
        outcome:
          "You defer to government teams. Guardians perceive the handoff as disengaged.",
        effects: { progress: 2, relationships: -3 },
      },
    ],
  },
  {
    id: "contractor-bankruptcy",
    title: "Key Contractor Bankruptcy",
    description:
      "A long-time road builder files for bankruptcy, leaving projects mid-stream.",
    roles: ["planner", "recce"],
    areaTags: ["winter-road", "remote-camps", "northern-bc"],
    seasonBias: ["Winter Review"],
    options: [
      {
        label: "Absorb crews into company operations",
        outcome:
          "You hire the core crew directly, stabilizing delivery but expanding payroll.",
        effects: { progress: 1, relationships: 2, compliance: 2, budget: -4 },
      },
      {
        label: "Rebid projects to other contractors",
        outcome:
          "New bidders take time to mobilize, delaying schedules but protecting capital.",
        effects: { progress: -4, budget: 2, relationships: -1 },
      },
      {
        label: "Pause worksites and renegotiate scope",
        outcome:
          "You shrink the program, frustrating mills yet avoiding risk.",
        effects: { progress: -3, relationships: -1, compliance: 1, budget: 1 },
      },
    ],
  },
  {
    id: "remote-camp-flooding",
    title: "Remote Camp Flooding",
    description:
      "Sudden snowmelt floods a remote BWBS camp, isolating staff and equipment.",
    roles: ["recce", "silviculture"],
    areaTags: ["remote-camps", "bwbs", "watershed"],
    seasonBias: ["Spring Planning", "Summer Field"],
    options: [
      {
        label: "Evacuate via helicopter and rebuild on higher ground",
        outcome:
          "Costs soar but staff safety and reputation remain intact.",
        effects: { progress: -4, relationships: 3, compliance: 3, budget: -6 },
      },
      {
        label: "Fortify camp with berms and pumps",
        outcome:
          "Crews construct berms, keeping operations alive while monitoring water levels.",
        effects: { progress: -1, relationships: 1, compliance: 2, budget: -3 },
      },
      {
        label: "Ride out the flood and prioritize production elsewhere",
        outcome:
          "You redeploy to drier blocks, leaving the camp to recover naturally.",
        effects: { progress: 2, relationships: -2, compliance: -1 },
      },
    ],
  },
  {
    id: "compliance-drone-sweep",
    title: "Compliance Drone Sweep",
    description:
      "The ministry launches unannounced drone inspections over your harvest blocks.",
    roles: ["planner", "permitter", "recce"],
    areaTags: ["technology", "northern-bc"],
    seasonBias: ["Summer Field"],
    options: [
      {
        label: "Invite inspectors into your live dashboards",
        outcome:
          "Transparency pays off—inspectors praise the access and flag minor tweaks collaboratively.",
        effects: { progress: 1, relationships: 4, compliance: 5, budget: -1 },
      },
      {
        label: "Stage rapid remediation crews",
        outcome:
          "You dispatch crews to tidy potential infractions before reports finalize.",
        effects: { progress: -1, compliance: 4, budget: -3 },
      },
      {
        label: "Question the legality of surprise flights",
        outcome:
          "You push back legally, buying time but raising enforcement heat.",
        effects: { progress: 2, relationships: -4, compliance: -4 },
      },
    ],
  },
  {
    id: "budget-emergency-loan",
    title: "Emergency Loan Decision",
    description:
      "Operating funds are exhausted. Finance offers an emergency loan that will dampen future budget gains.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    areaTags: ["northern-bc"],
    seasonBias: ["Fall Integration", "Winter Review"],
    requiresFlags: ["budgetEmergencyScheduled"],
    options: [
      {
        label: "Accept the loan and keep teams running",
        outcome:
          "You restore cash flow but commit to long-term repayments that trim future surpluses.",
        effects: { progress: 2, budget: 5, relationships: 1 },
        setFlags: { budgetLoanActive: true },
        clearFlags: ["budgetEmergencyScheduled"],
      },
      {
        label: "Slash program spend and self-fund recovery",
        outcome:
          "You cancel low-priority work, freeing cash without taking on debt.",
        effects: { progress: -4, relationships: -1, compliance: 2, budget: 3 },
        clearFlags: ["budgetEmergencyScheduled"],
      },
      {
        label: "Pause most operations until new fiscal year",
        outcome:
          "You idle crews and wait for new allocations, straining client relationships but avoiding debt.",
        effects: { progress: -6, relationships: -2, compliance: 4 },
        clearFlags: ["budgetEmergencyScheduled"],
      },
    ],
  },
  {
    id: "fpbc-competence-audit",
    title: "FPBC Competence Audit",
    description:
      "Your practice file has drawn enough scrutiny that FPBC asks for CPD records, your competence declaration, development plan, and work samples tied to your current practice areas.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    areaTags: ["northern-bc"],
    seasonBias: ["Winter Review", "Spring Planning"],
    requiresAnyFlags: ["professionalAuditActive"],
    context: {
      operation: "You are answering a live professional practice audit tied to the work you have been doing this season.",
      objective: "Show that your records, practice-area declaration, and work samples match the work you actually performed.",
      stakes: "A thin reply turns an administrative review into a deeper practice problem.",
    },
    riskClass: "calculated",
    options: [
      {
        label: "Clear the deck and submit a defensible package",
        outcome:
          "You assemble clean records, confirm your practice areas, and answer the audit carefully. It costs time, but the file holds together.",
        effects: { progress: -3, compliance: 7, budget: -2, relationships: 1 },
      },
      {
        label: "Bring in a mentor or peer reviewer before replying",
        outcome:
          "A second set of eyes tightens the rationale and spots weak notes before FPBC does.",
        effects: { progress: -2, compliance: 5, relationships: 3, budget: -1 },
      },
      {
        label: "Treat it like admin and send a thin package",
        outcome:
          "You move fast, but the sparse records make the audit feel heavier than it needed to be.",
        effects: { progress: 1, compliance: -5, relationships: -2 },
      },
    ],
  },
  {
    id: "fsp-comment-surge",
    title: "FSP Comment Surge",
    description:
      "The Forest Stewardship Plan review package draws a late wave of written comments on visual quality, water timing, and access assumptions, and the response record is due before the file can move.",
    roles: ["planner", "permitter"],
    areaTags: ["community-interface", "community-water", "watershed", "northern-bc"],
    seasonBias: ["Spring Planning", "Fall Integration"],
    processHookIds: ["fsp-public-review"],
    options: [
      {
        label: "Extend the review effort and answer every theme carefully",
        outcome:
          "You slow down, categorize the comments, and build a response package that reads like somebody actually listened.",
        effects: { progress: -3, compliance: 6, relationships: 5, budget: -2 },
      },
      {
        label: "Host focused field walks and revise the weak sections",
        outcome:
          "A tighter package emerges after a few painful but useful site visits. The file gets stronger and the argument gets narrower.",
        effects: { progress: -2, compliance: 5, relationships: 6, forestHealth: 2, budget: -2 },
      },
      {
        label: "Treat the comments as noise and keep the file moving",
        outcome:
          "The schedule holds for a moment, but the thin response record starts following the file everywhere.",
        effects: { progress: 3, compliance: -6, relationships: -5 },
      },
    ],
  },
  {
    id: "fom-consistency-gap",
    title: "FOM Consistency Gap",
    description:
      "District review catches a mismatch between the final Forest Operations Map and the cutting-permit package you were about to submit.",
    roles: ["planner", "permitter"],
    areaTags: ["northern-bc", "community-interface", "watershed", "karst"],
    seasonBias: ["Spring Planning", "Fall Integration"],
    processHookIds: ["fom-notice-cycle", "cutting-permit-admin"],
    options: [
      {
        label: "Pull the package back and resync the map set",
        outcome:
          "You lose a week rebuilding attachments, but the file stops bleeding credibility.",
        effects: { progress: -3, compliance: 7, budget: -2 },
      },
      {
        label: "Trim the disputed polygons and resubmit narrowly",
        outcome:
          "The permit package gets smaller, yet the clean match gives reviewers less to fight about.",
        effects: { progress: -1, compliance: 5, relationships: 2, forestHealth: 1 },
      },
      {
        label: "Explain the difference in a cover note and send it anyway",
        outcome:
          "The explanation reads thinner than you hoped, and the mismatch becomes the whole conversation.",
        effects: { progress: 2, compliance: -7, relationships: -3 },
      },
    ],
  },
  {
    id: "archaeology-escalation-pause",
    title: "Archaeology Escalation Pause",
    description:
      "An archaeology overview flags overlap with the planned footprint, and what looked like a desktop-screening exercise is now turning into permit and specialist waiting time.",
    roles: ["planner", "permitter", "recce"],
    areaTags: ["karst", "glacial", "community-interface", "northern-bc"],
    seasonBias: ["Spring Planning", "Summer Field", "Fall Integration"],
    processHookIds: ["archaeology-screening-ladder"],
    options: [
      {
        label: "Escalate immediately and book the specialist work",
        outcome:
          "You accept the delay early, preserve the evidence, and keep the file from turning into a mess later.",
        effects: { progress: -4, compliance: 6, relationships: 4, budget: -3 },
      },
      {
        label: "Redesign the layout away from the highest-risk ground",
        outcome:
          "The footprint shrinks, but the cleaner boundary gives everyone less to argue about.",
        effects: { progress: -2, compliance: 5, forestHealth: 2, relationships: 3 },
      },
      {
        label: "Keep recce moving while the desktop notes sit in a folder",
        outcome:
          "You buy short-term momentum, then lose it again when the gap becomes obvious.",
        effects: { progress: 3, compliance: -7, relationships: -4 },
      },
    ],
  },
  {
    id: "riparian-reclassification-call",
    title: "Riparian Reclassification Call",
    description:
      "A field revisit changes fish presence and channel-width assumptions on a stream you already used in layout and prescription work.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    areaTags: ["community-water", "watershed", "salmon", "peatland", "northern-bc"],
    seasonBias: ["Spring Planning", "Summer Field", "Fall Integration"],
    processHookIds: ["riparian-classification", "fish-crossing-remediation"],
    options: [
      {
        label: "Reclassify the stream and rebuild the treatment package",
        outcome:
          "It is painful rework, but the reserve widths, crossing notes, and regen plan line up again.",
        effects: { progress: -3, compliance: 7, forestHealth: 4, budget: -2 },
      },
      {
        label: "Keep the reserve wider and salvage the rest of the layout",
        outcome:
          "You lose some operable ground, yet the revised package stays coherent and defensible.",
        effects: { progress: -1, compliance: 5, forestHealth: 3, relationships: 1 },
      },
      {
        label: "Treat the new field call as overcautious and proceed",
        outcome:
          "The schedule looks better for a week or two, right up until the water file catches up.",
        effects: { progress: 2, compliance: -8, relationships: -3, forestHealth: -2 },
      },
    ],
  },
  {
    id: "road-use-permit-standoff",
    title: "Road Use Permit Standoff",
    description:
      "District staff flag that your Forest Service Road access needs a cleaner road use permit and a clearer primary-user maintenance plan before hauling can keep rolling.",
    roles: ["planner", "permitter", "recce"],
    areaTags: ["winter-road", "remote-camps", "steep", "gas-interface", "northern-bc"],
    seasonBias: ["Spring Planning", "Summer Field", "Fall Integration"],
    processHookIds: ["road-use-permit", "road-notifications"],
    options: [
      {
        label: "Take primary-user status and formalize maintenance splits",
        outcome:
          "You absorb the coordination headache, but the district sees a credible plan and the road politics cool down.",
        effects: { progress: -1, compliance: 6, relationships: 3, budget: -3 },
      },
      {
        label: "Negotiate a cost-share and radio-use agreement first",
        outcome:
          "It takes longer, but the users leave with clearer expectations and fewer surprise complaints.",
        effects: { progress: -2, compliance: 4, relationships: 4, budget: -1 },
      },
      {
        label: "Push traffic through while the paperwork catches up",
        outcome:
          "The road stays busy, but the district notices exactly what you hoped they would not.",
        effects: { progress: 2, compliance: -6, relationships: -3 },
      },
    ],
  },
  {
    id: "special-use-permit-stack",
    title: "Special Use Permit Stack",
    description:
      "Your camp, helipad, and log-dump footprint grew beyond what was shown in the main file, and the district now wants a separate special-use permit package for the support site.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    areaTags: ["remote-camps", "glacial", "gas-interface", "community-interface", "northern-bc"],
    seasonBias: ["Spring Planning", "Summer Field"],
    processHookIds: ["special-use-permit"],
    context: {
      operation: "You are trying to keep field support infrastructure legal while the main file is still moving.",
      objective: "Decide whether to authorize, shrink, or gamble on a support-site footprint that has outgrown the original plan.",
      stakes: "If the support site is not properly covered, the district can pull attention and schedule time away from the main work immediately.",
    },
    riskClass: "calculated",
    options: [
      {
        label: "Build the special-use permit package properly",
        outcome:
          "You burn time on maps, exhibits, and site details now, but the support site stops dragging the main file backward.",
        effects: { progress: -2, compliance: 6, budget: -2 },
      },
      {
        label: "Shrink the footprint and redesign camp logistics",
        outcome:
          "The crew loses convenience, but the smaller support layout is easier to authorize and defend.",
        effects: { progress: -1, compliance: 4, forestHealth: 2, budget: -1 },
      },
      {
        label: "Use the sites quietly and hope nobody asks",
        outcome:
          "It looks efficient for a week or two, right up until the district asks why the support site was built without its own permit package.",
        effects: { progress: 2, compliance: -7, relationships: -2 },
      },
    ],
  },
  // source: FPBC 2023-10 (Cover) / 2021-05 (Maundrell)
  {
    id: "stream-class-shortcut",
    title: "Desk Call on a Borderline Creek",
    description:
      "The road crew wants the culvert spec today. The desktop signal says the creek is probably non-classified, but no one has walked it and the block boundary is three days out.",
    roles: ["recce", "planner", "permitter"],
    areaTags: ["riparian", "fish-bearing"],
    seasonBias: ["Spring Planning", "Summer Field"],
    options: [
      {
        label: "Call it NCD off the orthophoto and keep the culvert order",
        outcome:
          "The road package moves and nobody notices for a month, until a First Nations crew finds fry in the channel during a joint tour.",
        effects: { progress: 6, forestHealth: -5, compliance: -6, relationships: -4 },
        setFlags: { streamMisclassified: true },
      },
      {
        label: "Send a biologist in for a same-week field check",
        outcome: "A two-day delay and a specialist invoice, but the classification holds up under review.",
        effects: { progress: -2, forestHealth: 4, compliance: 6, budget: -3 },
      },
      {
        label: "Walk the creek yourself and document every reach",
        outcome: "You reclassify it as fish-bearing, redesign to a clear-span, and the file is bulletproof.",
        effects: { progress: -4, forestHealth: 6, compliance: 7, relationships: 2, budget: -1 },
      },
    ],
  },
  // source: FPBC 2022-04 / 2022-09 (Chipman, Johnson)
  {
    id: "blanket-exemption-memory",
    title: "Is That Exemption Still Live?",
    description:
      "Your site plan sits over a Mule Deer Winter Range. Someone on the team is pretty sure there is a blanket GAR exemption from last year's salvage push. The harvest window closes in a week.",
    roles: ["planner", "permitter"],
    areaTags: ["wildlife", "salvage"],
    seasonBias: ["Winter Review", "Spring Planning"],
    options: [
      {
        label: "Sign on the remembered exemption and move the block forward",
        outcome:
          "Trees fall inside the winter range. Six months later the compliance branch confirms the exemption lapsed and your name is on the site plan.",
        effects: { progress: 8, compliance: -8, forestHealth: -3, relationships: -3 },
        setFlags: { mdwrExposure: true },
      },
      {
        label: "Pause the file and file a fresh exemption request",
        outcome: "The harvest window slips but the paperwork is clean when the auditor arrives.",
        effects: { progress: -5, compliance: 7, relationships: 2 },
      },
      {
        label: "Redesign the block to exit the winter range entirely",
        outcome: "You lose the volume but inherit a cleaner map and a story you can defend.",
        effects: { progress: -3, forestHealth: 6, compliance: 5, budget: -2 },
      },
    ],
  },
  // source: FPBC 2014-05 (Raby) / 2014-08 (K. Webber) / 2021-10 (McIntosh)
  {
    id: "bridge-signoff-window",
    title: "Temporary Bridge, Permanent Signature",
    description:
      "The fabricator is staging a reused Bailey span tomorrow. You have a pre-work inspection form in your bag and a contractor already moving trucks to the approach.",
    roles: ["permitter", "recce", "planner"],
    areaTags: ["bridges", "access"],
    seasonBias: ["Summer Field", "Fall Integration"],
    options: [
      {
        label: "Inspect girders, document condition, and hold hauling until the PEng agrees",
        outcome:
          "You catch a flange dent and delay hauling two days, but the CAS survives district review.",
        effects: { progress: -3, compliance: 8, relationships: 2, budget: -2 },
      },
      {
        label: "Sign the CAS now, mark 'N/A' on the damage questions, let trucks roll",
        outcome:
          "Hauling starts on time. Three weeks later a Forest Practices Board auditor photographs the cracks and your name is on the form.",
        effects: { progress: 9, compliance: -9, relationships: -4 },
        setFlags: { unsafeCrossing: true },
      },
      {
        label: "Demand a fresh PEng review before the first axle touches the deck",
        outcome: "The contractor grumbles and the schedule slips, but your file is untouchable.",
        effects: { progress: -5, compliance: 9, budget: -4 },
      },
    ],
  },
  // source: FPBC 2022-10 (Kestell)
  {
    id: "downstream-neighbour-intake",
    title: "Residents Downstream of the Block",
    description:
      "Two homesteads hold domestic water licences on the creek that drains your proposed cutblock. They have heard rumours and want to know whether you plan to tell them before trucks roll.",
    roles: ["planner", "permitter", "silviculture"],
    areaTags: ["community-water", "riparian"],
    seasonBias: ["Spring Planning"],
    options: [
      {
        label: "Write, map, and walk the block with both water licensees",
        outcome:
          "A full afternoon of conversation and a riparian reserve bump. They still disagree, but they sign acknowledgements.",
        effects: { progress: -2, relationships: 6, compliance: 6, budget: -2 },
      },
      {
        label: "Send the minimum legal referral letter and proceed",
        outcome:
          "You clear the formal bar. When a culvert is removed mid-season, one licensee files a complaint that outlasts the block.",
        effects: { progress: 5, compliance: -3, relationships: -6 },
        setFlags: { waterLicenseeComplaint: true },
      },
      {
        label: "Delay the block to redesign around an upslope haul route",
        outcome: "The mill reschedules and your reputation with local residents grows.",
        effects: { progress: -6, forestHealth: 4, relationships: 8, compliance: 4 },
      },
    ],
  },
  // source: FPBC 2021-01 (Dascher) / 2009-05 (Lay)
  {
    id: "own-land-temptation",
    title: "Work on Your Own Shoreline",
    description:
      "A regional district bylaw requires a Qualified Environmental Professional to assess the foreshore work on your private lake lot. You happen to be an RPF with riparian training.",
    roles: ["planner", "silviculture", "recce"],
    areaTags: ["riparian", "conflict"],
    seasonBias: ["Summer Field"],
    options: [
      {
        label: "Hire an independent QEP and step out of the file",
        outcome: "An invoice you hate and a clean paper trail. Your registration stays quiet.",
        effects: { progress: 0, compliance: 6, budget: -5, relationships: 2 },
      },
      {
        label: "Write the riparian assessment yourself and submit it to the district",
        outcome:
          "The district flags the conflict of interest. Your assessment is rejected and a complaint lands on the registrar's desk.",
        effects: { progress: 4, compliance: -8, relationships: -5 },
        setFlags: { conflictExposure: true },
      },
      {
        label: "Redesign the project to avoid triggering the RAPR assessment",
        outcome: "A smaller dock and a smaller headache. The foreshore stays intact.",
        effects: { progress: -2, forestHealth: 5, compliance: 4 },
      },
    ],
  },
  // source: FPBC 2023-08 (Angus)
  {
    id: "municipal-bylaw-blind-spot",
    title: "Municipal Bylaw Blind Spot",
    description:
      "Your client's private lot abuts a resort municipality's treed highway buffer, and the realtor now wants harvesting for a new driveway. The tree-cutting bylaw is not one you usually work with.",
    roles: ["planner", "permitter"],
    areaTags: ["community-interface", "private-land", "municipal"],
    seasonBias: ["Spring Planning", "Summer Field"],
    options: [
      {
        label: "Pause and book a municipal planner to walk the bylaw with you",
        outcome: "You lose two weeks and some margin, but the development permit gets written against the right bylaw on the first try.",
        effects: { progress: -3, compliance: 6, relationships: 3, budget: -2 },
      },
      {
        label: "Scope your services down and tell the client to hire the bylaw expertise directly",
        outcome: "The client grumbles about coordination but now there is a paper trail showing exactly who owns the municipal piece.",
        effects: { progress: -1, compliance: 4, relationships: 1 },
      },
      {
        label: "Assume the standard utility exemption covers the work and keep moving",
        outcome: "The crew starts falling trees before anyone reads the exemption closely, and the municipal contravention notice lands three weeks later.",
        effects: { progress: 3, compliance: -7, relationships: -4 },
        setFlags: { municipalBylawMissed: true },
      },
    ],
  },
  // source: FPBC 2022-10 (Kestell)
  {
    id: "wtra-trespass-silence",
    title: "WTRA Trespass Silence",
    description:
      "Your contractor accidentally cut 0.03 ha inside a wildlife tree retention area that was also buffering a neighbour's domestic water intake, and nobody has told the water licensee yet.",
    roles: ["recce", "permitter"],
    areaTags: ["community-water", "watershed", "private-land"],
    seasonBias: ["Summer Field", "Fall Integration"],
    options: [
      {
        label: "Drive out to the neighbour today and walk them through what happened",
        outcome: "The conversation is uncomfortable but the licensee appreciates hearing it from you before they see it on their trail camera.",
        effects: { progress: -1, relationships: 5, compliance: 5 },
      },
      {
        label: "Report the trespass to the Ministry and wait for them to notify the neighbour",
        outcome: "The ministry logs it cleanly. The neighbour hears about it second-hand and takes longer to warm back up.",
        effects: { progress: 0, relationships: -1, compliance: 4 },
      },
      {
        label: "Say nothing and hope the buffer grows in before anyone notices",
        outcome: "The licensee spots the stumps on a weekend walk and files a formal complaint citing a pattern of being kept in the dark.",
        effects: { progress: 2, compliance: -7, relationships: -5 },
        setFlags: { waterLicenseeComplaint: true, trespassHiddenFromNeighbour: true },
      },
    ],
  },
  // source: FPBC 2022-13 (Nickel)
  {
    id: "scaler-pressure-memo",
    title: "Scaler Coercion Memo",
    description:
      "A scaler in your yard emails that they feel pressured by your supervisor to downgrade loads beyond what the scaling manual supports, and has attached a week of examples.",
    roles: ["recce", "planner"],
    areaTags: ["yard", "northern-bc"],
    seasonBias: ["Fall Integration", "Winter Review"],
    options: [
      {
        label: "Pull the supervisor off scaling and bring in an independent review",
        outcome: "Yard throughput slows for a week, but the scalers visibly relax and the grading numbers stabilize against the manual.",
        effects: { progress: -3, compliance: 6, relationships: 4, budget: -2 },
      },
      {
        label: "Issue a written reminder that directions must align with the scaling manual",
        outcome: "The memo is noted. The supervisor stops putting the instruction in writing, but the scaler flags the same conversation happening verbally a month later.",
        effects: { progress: 1, compliance: 2, relationships: 1 },
      },
      {
        label: "Tell the scaler the supervisor is just focused on cost control and to keep scaling their best",
        outcome: "You lose the scaler's trust overnight, and a month later the ministry is asking about grading deduction patterns in your yard.",
        effects: { progress: 2, compliance: -6, relationships: -5 },
        setFlags: { scalingPressurePatternIgnored: true },
      },
    ],
  },
  // source: FPBC 2021-06 (Smart / Klahoose K4C)
  {
    id: "seedlot-zone-mismatch",
    title: "Seedlot Zone Mismatch",
    description:
      "Your nursery confirms that the seedlings lined up for spring planting are from a seedlot one zone south of the cutblocks. Forty-some blocks are already in the order.",
    roles: ["silviculture", "planner"],
    areaTags: ["reforestation", "coast", "community-forest"],
    seasonBias: ["Winter Review", "Spring Planning"],
    options: [
      {
        label: "Cancel the order and delay planting to source the right seedlot",
        outcome: "You eat a restocking fee and push planting into early summer, but the seedlings match the climate and the chief forester's standards.",
        effects: { progress: -4, forestHealth: 5, compliance: 6, budget: -5 },
      },
      {
        label: "Swap seedlots only on the coastal-aspect blocks and plant the rest",
        outcome: "The compromise thins the exposure but still leaves a chunk of ground with mismatched stock, and the silviculture auditor marks it.",
        effects: { progress: -1, forestHealth: 1, compliance: -2, budget: -2 },
      },
      {
        label: "Plant the existing stock and let nature sort out the mismatches",
        outcome: "The first hot summer hammers survival rates and the community forest partner demands to know how half a million seedlings ended up wrong.",
        effects: { progress: 2, forestHealth: -6, compliance: -6, relationships: -5 },
        setFlags: { wrongSeedzonePlanted: true },
      },
    ],
  },
  // source: FPBC 2014-05 (Raby)
  {
    id: "used-bridge-yard-pick",
    title: "Used Bridge Yard Pick",
    description:
      "You need a crossing fast and the licensee's yard has a pre-fabricated temporary bridge that has been installed and pulled three times already. The inspection paperwork is patchy.",
    roles: ["recce", "permitter"],
    areaTags: ["steep", "winter-road", "salmon"],
    seasonBias: ["Summer Field", "Fall Integration"],
    options: [
      {
        label: "Commission a full structural re-inspection before selecting the unit",
        outcome: "The engineer finds flange dents and recommends this unit go to scrap. You order a different bridge and lose a week.",
        effects: { progress: -3, compliance: 6, relationships: 2, budget: -4 },
      },
      {
        label: "Walk the bridge yourself with a checklist and accept it if nothing jumps out",
        outcome: "Your walkaround misses the stress cracks. The crossing holds, but every future audit will ask why you were the only eyes on it.",
        effects: { progress: 2, compliance: -3, forestHealth: -1 },
        setFlags: { bridgeWalkaroundShortcut: true },
      },
      {
        label: "Rely on the yard's existing inspection forms and sign the Crossing Assurance Statement",
        outcome: "Hauling starts, and an FPB auditor happens to catch a loaded truck crossing while a crack widens on video.",
        effects: { progress: 3, compliance: -8, forestHealth: -2, relationships: -3 },
        setFlags: { unsafeCrossing: true, crossingAssuranceSignedBlind: true },
      },
    ],
  },
  // source: FPBC 2020-03 (Peasgood)
  {
    id: "cruise-design-grid-shortcut",
    title: "Cruise Design Grid Shortcut",
    description:
      "Your cruise of four small expropriation parcels is behind schedule, and the Cruising Manual allows a 100 by 100 grid that waives the sampling error requirement. Two parcels look low volume from the road.",
    roles: ["planner", "recce"],
    areaTags: ["private-land", "cruise", "northern-bc"],
    seasonBias: ["Summer Field", "Fall Integration"],
    options: [
      {
        label: "Tighten the grid, walk every parcel, and keep full field notes",
        outcome: "The cruise runs long and the invoice balloons, but the volume estimate is defensible and the landowner sees the methodology.",
        effects: { progress: -4, compliance: 6, relationships: 3, budget: -3 },
      },
      {
        label: "Use the grid waiver but walk all four parcels before finalizing",
        outcome: "You stay on budget and still catch the merchantable patches you would have missed from the truck.",
        effects: { progress: -1, compliance: 3, budget: -1 },
      },
      {
        label: "Apply the grid waiver and exclude the two low-looking parcels on sight",
        outcome: "The report looks clean until the landowner points at satellite imagery and asks where the merchantable stems went.",
        effects: { progress: 3, compliance: -7, relationships: -5 },
        setFlags: { cruiseExcludedParcels: true, missingCruiseFieldNotes: true },
      },
    ],
  },
  // source: FPBC 2009-05 (Lay)
  {
    id: "elected-midproject",
    title: "Elected Mid-Project",
    description:
      "You are the prescribing RPF on a fuel-management project for a small village, and last week you were elected to council. The prescription is not yet implemented.",
    roles: ["planner", "silviculture"],
    areaTags: ["community-interface", "wildfire", "municipal"],
    seasonBias: ["Fall Integration", "Winter Review"],
    options: [
      {
        label: "Hand the RPF role to an independent colleague and recuse from council votes on the file",
        outcome: "You lose the contract but the prescription survives scrutiny and the council vote is clean.",
        effects: { progress: -3, compliance: 6, relationships: 4, budget: -3 },
      },
      {
        label: "Keep the RPF role but publicly declare the conflict at every council meeting",
        outcome: "The declarations paper over the optics but residents still struggle to tell which hat you are wearing.",
        effects: { progress: 0, compliance: 2, relationships: -1 },
      },
      {
        label: "Keep both roles quietly and tell concerned residents you already know what the community wants",
        outcome: "A neighbour complains to the professional regulator and to the ministry on the same week.",
        effects: { progress: 2, compliance: -7, relationships: -6 },
        setFlags: { dualRoleConflict: true },
      },
    ],
  },
  // source: FPBC 2022-04 / 2022-09 (Chipman, Johnson)
  {
    id: "referral-miss-at-two-levels",
    title: "Referral Miss at Two Levels",
    description:
      "An internal audit finds the same First Nation was missed on referrals for several fuel-management site plans, and both the planning forester and the forest manager signed pieces of the stack.",
    roles: ["planner", "permitter"],
    areaTags: ["community-forest", "first-nations", "wildfire"],
    seasonBias: ["Spring Planning", "Summer Field"],
    options: [
      {
        label: "Self-report to both the First Nation and the professional regulator the same week",
        outcome: "The Nation is hurt but grateful for the direct disclosure, and the regulator opens a process that ends in a consent order rather than a citation.",
        effects: { progress: -4, compliance: 6, relationships: 5, budget: -3 },
      },
      {
        label: "Apologize privately to the Nation and tighten the internal referral matrix",
        outcome: "The matrix is better. The Nation accepts the apology but notes they are now watching every site plan that crosses their territory.",
        effects: { progress: -1, compliance: 3, relationships: 2 },
      },
      {
        label: "Blame the FSP referral clause wording and keep the audit internal",
        outcome: "The Nation hears about it from a ministry compliance officer, and the trust damage is harder to undo than a direct admission would have been.",
        effects: { progress: 2, compliance: -5, relationships: -7 },
        setFlags: { firstNationReferralHidden: true },
      },
    ],
  },
  // source: FPBC 2013-13 (von der Gonna / McBride Community Forest)
  {
    id: "audit-laundry-list",
    title: "FPB Audit Laundry List",
    description:
      "A Forest Practices Board audit of your community forest lands ten findings at once: vague road mapping, drifting OGMA boundaries, unclear contractor obligations, and six more items.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    areaTags: ["community-forest", "audit"],
    seasonBias: ["Winter Review", "Spring Planning"],
    options: [
      {
        label: "Triage the ten findings and publish a public response plan",
        outcome: "The board likes the transparency. Community members show up to the plan meeting in good faith and the file starts to heal.",
        effects: { progress: -4, compliance: 6, relationships: 5, budget: -3 },
      },
      {
        label: "Fix the two or three easiest findings and debate the rest",
        outcome: "The easy wins help, but the unresolved findings follow you into the next annual report and sour the board's tone.",
        effects: { progress: 1, compliance: -2, relationships: -2 },
      },
      {
        label: "Dispute the methodology and keep operating while you litigate it",
        outcome: "The dispute buys a year but the cumulative publicity damages council's confidence in the forest manager role entirely.",
        effects: { progress: 3, compliance: -8, relationships: -6 },
        setFlags: { auditDisputeStance: true, regulatoryScrutiny: true },
      },
    ],
  },
  // source: FPBC 2010-03 (Parker)
  {
    id: "rely-on-client-salvage-numbers",
    title: "Rely on the Client's Salvage Numbers",
    description:
      "Your small-scale salvage client has been logging Douglas-fir for thirty years and already has dead-and-down and green-attacked volume estimates ready for you. Your field day is booked elsewhere.",
    roles: ["planner", "recce"],
    areaTags: ["salvage", "interior", "private-land"],
    seasonBias: ["Summer Field", "Fall Integration"],
    options: [
      {
        label: "Reschedule and walk the blocks yourself before the application",
        outcome: "You miss the deadline by a week but the field notes line up with what the ministry checkers eventually find.",
        effects: { progress: -3, compliance: 6, relationships: 2, budget: -2 },
      },
      {
        label: "Drive the blocks with the client and do a reduced visual check",
        outcome: "The visual check catches most of the outliers. Two applications still come back marked 'inaccurate' but nothing is suspended.",
        effects: { progress: 0, compliance: 2, relationships: 1 },
      },
      {
        label: "Sign the applications using the client's tally and move on",
        outcome: "Three applications get suspended the next spring and your name appears on the ministry's list of SSS submitters to watch.",
        effects: { progress: 3, compliance: -7, relationships: -3 },
        setFlags: { salvageEstimatesUnchecked: true },
      },
    ],
  },
];
