export const FORESTER_ROLES = [
  {
    id: "planner",
    name: "Strategic Planner",
    seasonalName: "Strategic Planner",
    journeyType: "desk",
    description:
      "Build long range harvesting strategies across northern BC BEC zones, balancing values with land use plans.",
    tasks: [
      {
        id: "landscape",
        title: "Landscape Assessment",
        prompt:
          "A new five-year plan is due, and your FSP / Forest Operations Map story needs to survive public review. How will you analyze the landscape before setting cutblocks?",
        processHookIds: ["fsp-public-review", "fom-notice-cycle"],
        options: [
          {
            label: "Lean on existing inventories to move quickly",
            outcome:
              "You reuse last year's LiDAR overlays. It's fast, but the hydrology updates will wait until next cycle.",
            effects: { progress: 9, forestHealth: -2, compliance: -2 },
            setFlags: { outdatedData: true },
          },
          {
            label: "Blend remote sensing with a watershed workshop",
            outcome:
              "You invite hydrologists and Indigenous guardians to ground-truth the data. The plan slows, but is richer.",
            effects: { progress: 5, forestHealth: 6, relationships: 4, compliance: 3, budget: -3 },
          },
          {
            label: "Pilot climate-adaptive scenario modeling",
            outcome:
              "You run adaptive models for fire and drought. Council is intrigued, yet the team needs coaching to interpret results.",
            effects: { progress: 3, forestHealth: 8, relationships: -1, compliance: 5, budget: -4 },
          },
        ],
      },
      {
        id: "constraints",
        title: "Values Balancing",
        prompt:
          "Several wildlife habitat and recreation overlays intersect proposed blocks just as the FOM and referral package are being assembled. What's your approach?",
        processHookIds: ["fom-notice-cycle", "riparian-classification"],
        options: [
          {
            label: "Negotiate minor boundary tweaks with regulators",
            outcome:
              "You adjust block boundaries slightly. Compliance improves, though the milling schedule gets tighter.",
            effects: { progress: 4, relationships: 5, compliance: 6, forestHealth: -3 },
          },
          {
            label: "Suspend the blocks to study alternatives",
            outcome:
              "You pause development entirely and form a joint working group. Stakeholders appreciate the caution but production slips.",
            effects: { progress: -4, forestHealth: 7, relationships: 7, compliance: 5 },
          },
          {
            label: "Document mitigation and proceed",
            outcome:
              "You submit enhanced mitigation plans and continue. Regulators warn they will be watching closely.",
            effects: { progress: 7, compliance: 1, relationships: -3 },
            setFlags: { regulatoryScrutiny: true },
          },
        ],
      },
      {
        id: "integration",
        title: "Team Integration",
        prompt:
          "Operations, silviculture, and finance all want their needs reflected in the FSP, the FOM response package, and the cutting-permit sequence.",
        processHookIds: ["fsp-public-review", "cutting-permit-admin"],
        options: [
          {
            label: "Host an integrated planning charrette",
            outcome:
              "Two intense days yield a shared schedule. Everyone compromises a little and alignment improves.",
            effects: { progress: 6, relationships: 6, compliance: 2, budget: -3 },
          },
          {
            label: "Let operations lead to keep timelines",
            outcome:
              "Operations drives decisions. Field staff are energized, but stewardship staff feel sidelined.",
            effects: { progress: 8, relationships: -4, forestHealth: -2 },
          },
          {
            label: "Stagger stakeholder syncs over the quarter",
            outcome:
              "You facilitate a rolling series of updates. It is slower, yet issues surface early and get resolved collaboratively.",
            effects: { progress: 4, relationships: 5, compliance: 3, budget: -2 },
          },
        ],
      },
    ],
  },
  {
    id: "permitter",
    name: "Permitting Specialist",
    seasonalName: "Permitting Specialist",
    journeyType: "desk",
    description:
      "Coordinate northern referrals, ensure submissions reflect local values, and shepherd approvals across agencies.",
    tasks: [
      {
        id: "package",
        title: "Application Packaging",
        prompt:
          "A bundle of cutting permit and road permit files must leave the door this week, each with clean FOM consistency and attachment checks.",
        processHookIds: ["cutting-permit-admin", "road-permit-package", "fom-notice-cycle"],
        options: [
          {
            label: "Bundle permits to fast-track volume",
            outcome:
              "You consolidate similar blocks to minimize paperwork. The ministry warns they expect pristine documentation.",
            effects: { progress: 8, compliance: 1, relationships: -3 },
            setFlags: { rushJob: true },
            scheduleIssues: { id: "permit-deficiency", delay: 1 },
          },
          {
            label: "Sequence submissions with targeted referrals",
            outcome:
              "You stage permits so each includes tailored referrals. Community partners feel heard.",
            effects: { progress: 5, compliance: 5, relationships: 5, budget: -3 },
          },
          {
            label: "Pause to rebuild GIS attachments",
            outcome:
              "New orthophotos reveal access concerns. You redo the spatial package before mailing anything.",
            effects: { progress: -2, compliance: 7, forestHealth: 4 },
          },
        ],
      },
      {
        id: "referrals",
        title: "Referral Follow-up",
        prompt:
          "Half of your FOM, archaeology, and hydrology referral responses are overdue.",
        processHookIds: ["fom-notice-cycle", "archaeology-screening-ladder", "riparian-classification"],
        options: [
          {
            label: "Call everyone for status updates",
            outcome:
              "You spend two days on the phone. Answers arrive and a few partners request more mitigation.",
            effects: { progress: 1, relationships: 6, compliance: 4 },
          },
          {
            label: "Escalate through ministry contacts",
            outcome:
              "Direct ministry outreach shakes loose responses quickly, though local Nations worry they were bypassed.",
            effects: { progress: 6, compliance: 2, relationships: -3 },
          },
          {
            label: "Extend deadlines and re-scope",
            outcome:
              "You officially extend the referral window and revise block notes. Production waits but trust grows.",
            effects: { progress: -3, relationships: 7, compliance: 5 },
          },
        ],
      },
      {
        id: "tracking",
        title: "Regulatory Tracking",
        prompt:
          "Rules change mid-quarter, and the backlog now needs updated professional sign-off, cleaner amendment records, and fresher road notices.",
        processHookIds: ["cutting-permit-admin", "road-notifications"],
        options: [
          {
            label: "Bring in a third-party professional immediately",
            outcome:
              "An independent RPF signs off after a rapid review. It costs, yet regulators applaud the diligence.",
            effects: { progress: 2, compliance: 8, relationships: 3, budget: -5 },
          },
          {
            label: "Lobby for a grace period",
            outcome:
              "You coordinate with industry peers to request delayed implementation. Some relief is granted but scrutiny increases.",
            effects: { progress: 5, compliance: 3, relationships: -2 },
          },
          {
            label: "Document internal competency and carry on",
            outcome:
              "Your senior team self-certifies compliance. Files move, although auditors flag gaps for later review.",
            effects: { progress: 7, compliance: -3, relationships: -2 },
          },
        ],
      },
    ],
  },
  {
    id: "recce",
    name: "Recon Crew Lead",
    seasonalName: "Field Technician",
    journeyType: "field",
    description:
      "Scout northern BC blocks, confirm rugged access, and collect field intel ahead of development.",
    tasks: [
      {
        id: "access",
        title: "Road Recon",
        prompt:
          "Spring melt damaged a key spur road, and the district wants to know whether this is still maintenance, a road use permit problem, or significant road work. How do you respond?",
        processHookIds: ["road-use-permit", "significant-road-work", "road-notifications"],
        options: [
          {
            label: "Contract emergency repair",
            outcome:
              "You mobilize a local contractor and reopen the spur quickly, but budgets take a hit.",
            effects: { progress: 8, relationships: 3, compliance: -2, budget: -4 },
          },
          {
            label: "Reroute crews to alternate access",
            outcome:
              "Longer quad trails keep work moving slowly while you plan a permanent fix.",
            effects: { progress: 3, forestHealth: 2, compliance: 1, budget: -1 },
          },
          {
            label: "Suspend work until maintenance funds arrive",
            outcome:
              "The crew catches up on paperwork. Nothing gets damaged but production pauses.",
            effects: { progress: -5, forestHealth: 4, relationships: 2 },
          },
        ],
      },
      {
        id: "intel",
        title: "Field Intelligence",
        prompt:
          "Two crews report unrecorded cultural features on separate ridges after a desktop archaeology screen came back 'low concern.'",
        processHookIds: ["archaeology-screening-ladder"],
        options: [
          {
            label: "GPS, photograph, and flag immediately",
            outcome:
              "You halt activity in both spots and send detailed reports. The Nations thank you for the respect.",
            effects: { progress: -3, relationships: 8, compliance: 6 },
          },
          {
            label: "Confirm with office staff before stopping work",
            outcome:
              "The office validates one find and questions the other. You lose a day verifying maps but avoid false alarms.",
            effects: { progress: 3, relationships: -1, compliance: 2 },
          },
          {
            label: "Keep working while documenting for later",
            outcome:
              "Crews stay productive, yet word spreads that you ignored a sensitive site.",
            effects: { progress: 7, relationships: -5, compliance: -4 },
            setFlags: { culturalTension: true },
          },
        ],
      },
      {
        id: "safety",
        title: "Crew Safety Rhythm",
        prompt:
          "Sledder access and steep terrain have raised near-miss reports.",
        options: [
          {
            label: "Institute daily tailgate reviews with photos",
            outcome:
              "The crew walks slopes each morning and shares pictures. Morale rises and hazards drop.",
            effects: { progress: -1, relationships: 5, compliance: 5, forestHealth: 1, budget: -2 },
          },
          {
            label: "Bring in an external safety auditor",
            outcome:
              "A specialist shadows the crew. Findings improve practices but slow the schedule.",
            effects: { progress: -2, compliance: 7, relationships: 2, budget: -4 },
          },
          {
            label: "Push to hit deliverables and coach later",
            outcome:
              "You prioritize schedules. A few more near-misses appear in the log and senior leadership takes note.",
            effects: { progress: 6, compliance: -3, relationships: -2 },
          },
        ],
      },
    ],
  },
  {
    id: "silviculture",
    name: "Silviculture Supervisor",
    seasonalName: "Silviculture Supervisor",
    journeyType: "field",
    description:
      "Design regeneration strategies tailored to northern BC, oversee planting, and monitor stand recovery.",
    tasks: [
      {
        id: "planting",
        title: "Planting Program",
        prompt:
          "Crew availability is tight, snow lingers in high elevation blocks, and the camp-plus-helipad footprint is starting to look like its own occupancy file.",
        processHookIds: ["special-use-permit"],
        options: [
          {
            label: "Stagger crews by elevation band",
            outcome:
              "You re-phase the program so warmer aspects go first. Productivity holds steady.",
            effects: { progress: 6, forestHealth: 5, relationships: 3, budget: -3, compliance: -1 },
          },
          {
            label: "Charter extra helicopters to stay on schedule",
            outcome:
              "Aerial shuttles keep crews moving but run up costs.",
            effects: { progress: 8, forestHealth: 3, budget: -5 },
          },
          {
            label: "Delay start until weather stabilizes",
            outcome:
              "You wait out the snow. Seedlings stay healthy, yet production targets slip.",
            effects: { progress: -3, forestHealth: 6, compliance: 2 },
          },
        ],
      },
      {
        id: "regen",
        title: "Regeneration Strategy",
        prompt:
          "Pine beetle recovery blocks show poor survival, especially where riparian treatment and microsite limits are squeezing the prescription.",
        processHookIds: ["riparian-classification"],
        options: [
          {
            label: "Switch to mixed species blends",
            outcome:
              "You diversify with larch and spruce. It impresses regulators and may resist pests better.",
            effects: { progress: 1, forestHealth: 8, compliance: 4, budget: -3 },
          },
          {
            label: "Apply intensive site prep and replant",
            outcome:
              "You scarify and replant aggressively. Survival improves though soil disturbance draws criticism.",
            effects: { progress: 5, forestHealth: 5, compliance: 1, budget: -4 },
          },
          {
            label: "Monitor longer before intervening",
            outcome:
              "You extend monitoring to gather more data. Budgets appreciate the pause, but mortality continues.",
            effects: { progress: -2, forestHealth: -1, relationships: 2, budget: 3 },
          },
        ],
      },
      {
        id: "reporting",
        title: "Stand Monitoring",
        prompt:
          "Regulator deadlines for FREP surveys and riparian follow-up land the same week as community tours.",
        processHookIds: ["riparian-classification", "special-use-permit"],
        options: [
          {
            label: "Send technical crews early and host tours later",
            outcome:
              "You finish compliance work first, then bring communities once data is in hand.",
            effects: { progress: 5, compliance: 7, relationships: -2, budget: -3 },
          },
          {
            label: "Merge the events into a single field day",
            outcome:
              "You walk the stands with everyone together. Questions take time but trust deepens.",
            effects: { progress: 2, relationships: 7, compliance: 2 },
          },
          {
            label: "Prioritize the community tour",
            outcome:
              "You showcase healthy stands. Regulators grant an extension yet remind you about future deadlines.",
            effects: { progress: 3, relationships: 6, compliance: -1, budget: -2 },
          },
        ],
      },
    ],
  },
  {
    id: "manager",
    name: "General Manager",
    seasonalName: "General Manager",
    seasonalEnabled: false,
    journeyType: "manager",
    description:
      "Oversee both field operations and strategic desk initiatives, managing CEOs and certifications.",
    tasks: [
      {
        id: "gm_init",
        title: "Strategic Priorities",
        prompt: "Establish your primary objective for this term.",
        options: [
          {
            label: "Focus on rapid growth",
            outcome: "Selected aggressive growth strategy. Expect higher returns but more pushback.",
            effects: { budget: 20000, reputation: -1, progress: 10 },
          },
          {
            label: "Focus on sustainability",
            outcome: "Selected sustainable strategy. Operations will be slower but steadier.",
            effects: { reputation: 3, relationships: 5, budget: -5000 },
          },
        ],
      },
    ],
  },
];
