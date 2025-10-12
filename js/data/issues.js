export const ISSUE_LIBRARY = [
  {
    id: "peatland-subsidence",
    title: "Muskeg Subsidence on Haul Route",
    description:
      "A warm spell is softening peatland crossings along your mainline north of the Peace River, and loaded trucks are starting to break through.",
    roles: ["recce", "planner"],
    areaTags: ["peatland", "bwbs", "peace-region"],
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
];

