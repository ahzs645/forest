export const FORESTER_ROLES = [
  {
    id: "planner",
    name: "Strategic Planner",
    description:
      "Build long range harvesting strategies across northern BC BEC zones, balancing values with land use plans.",
    tasks: [
      {
        id: "landscape",
        title: "Landscape Assessment",
        prompt:
          "A new five-year plan is due. How will you analyze the landscape before setting cutblocks?",
        options: [
          {
            label: "Lean on existing inventories to move quickly",
            outcome:
              "You reuse last year's LiDAR overlays. It's fast, but the hydrology updates will wait until next cycle.",
            effects: { progress: 9, forestHealth: -2, compliance: -2 },
          },
          {
            label: "Blend remote sensing with a watershed workshop",
            outcome:
              "You invite hydrologists and Indigenous guardians to ground-truth the data. The plan slows, but is richer.",
            effects: { progress: 5, forestHealth: 6, relationships: 4, compliance: 3 },
          },
          {
            label: "Pilot climate-adaptive scenario modeling",
            outcome:
              "You run adaptive models for fire and drought. Council is intrigued, yet the team needs coaching to interpret results.",
            effects: { progress: 3, forestHealth: 8, relationships: 2, compliance: 5 },
          },
        ],
      },
      {
        id: "constraints",
        title: "Values Balancing",
        prompt:
          "Several wildlife habitat and recreation overlays intersect proposed blocks. What's your approach?",
        options: [
          {
            label: "Negotiate minor boundary tweaks with regulators",
            outcome:
              "You adjust block boundaries slightly. Compliance improves, though the milling schedule gets tighter.",
            effects: { progress: 4, relationships: 5, compliance: 6 },
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
          },
        ],
      },
      {
        id: "integration",
        title: "Team Integration",
        prompt:
          "Operations, silviculture, and finance all want their needs reflected in the plan.",
        options: [
          {
            label: "Host an integrated planning charrette",
            outcome:
              "Two intense days yield a shared schedule. Everyone compromises a little and alignment improves.",
            effects: { progress: 6, relationships: 6, compliance: 2 },
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
            effects: { progress: 4, relationships: 5, compliance: 3 },
          },
        ],
      },
    ],
  },
  {
    id: "permitter",
    name: "Permitting Specialist",
    description:
      "Coordinate northern referrals, ensure submissions reflect local values, and shepherd approvals across agencies.",
    tasks: [
      {
        id: "package",
        title: "Application Packaging",
        prompt:
          "A bundle of cutting permit applications must leave the door this week.",
        options: [
          {
            label: "Bundle permits to fast-track volume",
            outcome:
              "You consolidate similar blocks to minimize paperwork. The ministry warns they expect pristine documentation.",
            effects: { progress: 5, compliance: -1, relationships: -2 },
          },
          {
            label: "Sequence submissions with targeted referrals",
            outcome:
              "You stage permits so each includes tailored referrals. Community partners feel heard, but it's slow.",
            effects: { progress: 2, compliance: 3, relationships: 3, budget: -1 },
          },
          {
            label: "Pause to rebuild GIS attachments",
            outcome:
              "New orthophotos reveal access concerns. You redo the spatial package before mailing anything.",
            effects: { progress: -4, compliance: 5, forestHealth: 2, budget: -2 },
          },
        ],
      },
      {
        id: "referrals",
        title: "Referral Follow-up",
        prompt:
          "Half of your referral responses are overdue.",
        options: [
          {
            label: "Call everyone for status updates",
            outcome:
              "You spend two days on the phone. Answers arrive and a few partners request more mitigation.",
            effects: { progress: 1, relationships: 3, compliance: 2 },
          },
          {
            label: "Escalate through ministry contacts",
            outcome:
              "Direct ministry outreach shakes loose responses quickly, though local Nations worry they were bypassed.",
            effects: { progress: 4, compliance: 1, relationships: -5 },
          },
          {
            label: "Extend deadlines and re-scope",
            outcome:
              "You officially extend the referral window and revise block notes. Production waits but trust grows.",
            effects: { progress: -5, relationships: 4, compliance: 3 },
          },
        ],
      },
      {
        id: "tracking",
        title: "Regulatory Tracking",
        prompt:
          "Rules change mid-quarter requiring updated professional sign-off.",
        options: [
          {
            label: "Bring in a third-party professional immediately",
            outcome:
              "An independent RPF signs off after a rapid review. It costs, yet regulators applaud the diligence.",
            effects: { progress: 1, compliance: 4, relationships: 1, budget: -5 },
          },
          {
            label: "Lobby for a grace period",
            outcome:
              "You coordinate with industry peers to request delayed implementation. Some relief is granted but scrutiny increases.",
            effects: { progress: 3, compliance: -1, relationships: -1 },
          },
          {
            label: "Document internal competency and carry on",
            outcome:
              "Your senior team self-certifies compliance. Files move, although auditors flag gaps for later review.",
            effects: { progress: 5, compliance: -5, relationships: -3 },
          },
        ],
      },
    ],
  },
  {
    id: "recce",
    name: "Recon Crew Lead",
    description:
      "Scout northern BC blocks, confirm rugged access, and collect field intel ahead of development.",
    tasks: [
      {
        id: "access",
        title: "Road Recon",
        prompt:
          "Spring melt damaged a key spur road. How do you respond?",
        options: [
          {
            label: "Contract emergency repair",
            outcome:
              "You mobilize a local contractor and reopen the spur quickly, but budgets take a hit.",
            effects: { progress: 5, relationships: 2, compliance: 1, budget: -6 },
          },
          {
            label: "Reroute crews to alternate access",
            outcome:
              "Longer quad trails keep work moving slowly while you plan a permanent fix.",
            effects: { progress: 1, forestHealth: 1, compliance: 1, budget: -2 },
          },
          {
            label: "Suspend work until maintenance funds arrive",
            outcome:
              "The crew catches up on paperwork. Nothing gets damaged but production pauses.",
            effects: { progress: -8, forestHealth: 2, relationships: 1 },
          },
        ],
      },
      {
        id: "intel",
        title: "Field Intelligence",
        prompt:
          "Two crews report unrecorded cultural features on separate ridges.",
        options: [
          {
            label: "GPS, photograph, and flag immediately",
            outcome:
              "You halt activity in both spots and send detailed reports. The Nations thank you for the respect.",
            effects: { progress: -3, relationships: 5, compliance: 4 },
          },
          {
            label: "Confirm with office staff before stopping work",
            outcome:
              "The office validates one find and questions the other. You lose a day verifying maps but avoid false alarms.",
            effects: { progress: 1, relationships: 1, compliance: 1 },
          },
          {
            label: "Keep working while documenting for later",
            outcome:
              "Crews stay productive, yet word spreads that you ignored a sensitive site.",
            effects: { progress: 5, relationships: -8, compliance: -6 },
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
            effects: { progress: 1, relationships: 3, compliance: 3, forestHealth: 1, budget: -1 },
          },
          {
            label: "Bring in an external safety auditor",
            outcome:
              "A specialist shadows the crew. Findings improve practices but slow the schedule.",
            effects: { progress: -4, compliance: 5, relationships: 1, budget: -3 },
          },
          {
            label: "Push to hit deliverables and coach later",
            outcome:
              "You prioritize schedules. A few more near-misses appear in the log and senior leadership takes note.",
            effects: { progress: 5, compliance: -4, relationships: -3 },
          },
        ],
      },
    ],
  },
  {
    id: "silviculture",
    name: "Silviculture Supervisor",
    description:
      "Design regeneration strategies tailored to northern BC, oversee planting, and monitor stand recovery.",
    tasks: [
      {
        id: "planting",
        title: "Planting Program",
        prompt:
          "Crew availability is tight and snow lingers in high elevation blocks.",
        options: [
          {
            label: "Stagger crews by elevation band",
            outcome:
              "You re-phase the program so warmer aspects go first. Productivity holds steady.",
            effects: { progress: 3, forestHealth: 3, relationships: 1 },
          },
          {
            label: "Charter extra helicopters to stay on schedule",
            outcome:
              "Aerial shuttles keep crews moving but run up costs.",
            effects: { progress: 6, forestHealth: 1, budget: -8 },
          },
          {
            label: "Delay start until weather stabilizes",
            outcome:
              "You wait out the snow. Seedlings stay healthy, yet production targets slip.",
            effects: { progress: -5, forestHealth: 4, compliance: 1 },
          },
        ],
      },
      {
        id: "regen",
        title: "Regeneration Strategy",
        prompt:
          "Pine beetle recovery blocks show poor survival.",
        options: [
          {
            label: "Switch to mixed species blends",
            outcome:
              "You diversify with larch and spruce. It impresses regulators and may resist pests better.",
            effects: { progress: 1, forestHealth: 5, compliance: 2, budget: -2 },
          },
          {
            label: "Apply intensive site prep and replant",
            outcome:
              "You scarify and replant aggressively. Survival improves though soil disturbance draws criticism.",
            effects: { progress: 3, forestHealth: 3, compliance: -1, budget: -4 },
          },
          {
            label: "Monitor longer before intervening",
            outcome:
              "You extend monitoring to gather more data. Budgets appreciate the pause, but mortality continues.",
            effects: { progress: -3, forestHealth: -3, relationships: 1, budget: 2 },
          },
        ],
      },
      {
        id: "reporting",
        title: "Stand Monitoring",
        prompt:
          "Regulator deadlines for FREP surveys land the same week as community tours.",
        options: [
          {
            label: "Send technical crews early and host tours later",
            outcome:
              "You finish compliance work first, then bring communities once data is in hand.",
            effects: { progress: 3, compliance: 5, relationships: 2, budget: -2 },
          },
          {
            label: "Merge the events into a single field day",
            outcome:
              "You walk the stands with everyone together. Questions take time but trust deepens.",
            effects: { progress: 1, relationships: 5, compliance: 2, budget: -1 },
          },
          {
            label: "Prioritize the community tour",
            outcome:
              "You showcase healthy stands. Regulators grant an extension yet remind you about future deadlines.",
            effects: { progress: 2, relationships: 4, compliance: -3 },
          },
        ],
      },
    ],
  },
];

