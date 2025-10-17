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
];
