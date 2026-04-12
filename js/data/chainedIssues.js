/**
 * Chained Issues — follow-up events triggered by flags set during earlier
 * player choices.  Import and spread into ISSUE_LIBRARY so the engine can
 * surface them when flag conditions are met.
 */
export const CHAINED_ISSUES = [
  // ───────────────────────────────────────────────
  //  1. Triggered by regular task choices
  // ───────────────────────────────────────────────

  {
    id: "ministry-data-audit",
    title: "Ministry Data Audit",
    description:
      "The ministry noticed your landscape plan relies on last cycle's hydrology data. An auditor wants to review your spatial inputs.",
    roles: ["planner"],
    areaTags: [],
    requiresFlags: ["outdatedData"],
    excludeFlags: ["dataAuditResolved"],
    baseWeight: 1,
    options: [
      {
        label: "Commission emergency updated LiDAR",
        outcome:
          "Expensive, but the fresh data impresses the auditor and strengthens the plan.",
        effects: { progress: -3, compliance: 5, forestHealth: 3, budget: -5 },
        clearFlags: ["outdatedData"],
        setFlags: { dataAuditResolved: true },
      },
      {
        label: "Defend the existing dataset in writing",
        outcome:
          "Your memo is technically sound but the auditor marks the file for follow-up next year.",
        effects: { progress: 2, compliance: -4, relationships: -2 },
      },
      {
        label: "Blame the previous planner's handover notes",
        outcome:
          "The auditor shrugs but your predecessor's friends on council are furious.",
        effects: { relationships: -6, compliance: 1, progress: 3 },
      },
    ],
  },

  {
    id: "permit-deficiency",
    title: "Permit Deficiency Notice",
    description:
      "The ministry returns a batch of permits flagged as deficient. Rushed documentation has gaps.",
    roles: ["permitter"],
    areaTags: [],
    requiresFlags: ["rushJob"],
    excludeFlags: ["deficiencyResolved"],
    baseWeight: 1,
    options: [
      {
        label: "Pull an all-nighter to fix the package",
        outcome:
          "The revised package is bulletproof. Ministry approves within the week.",
        effects: { progress: -4, compliance: 6, budget: -2 },
        clearFlags: ["rushJob"],
        setFlags: { deficiencyResolved: true },
      },
      {
        label: "Argue the deficiencies are cosmetic",
        outcome:
          "Some corrections are accepted but three permits are returned again.",
        effects: { progress: 3, compliance: -5, relationships: -3 },
      },
      {
        label: "Hire a contract RPF to redo the submissions",
        outcome:
          "The professional polish is unmistakable. Costly, but the file is now ironclad.",
        effects: { progress: -1, compliance: 7, budget: -6 },
        clearFlags: ["rushJob"],
        setFlags: { deficiencyResolved: true },
      },
    ],
  },

  {
    id: "community-blockade",
    title: "Community Road Blockade",
    description:
      "Members of the local Nation have set up a checkpoint on the main access road. They want answers about the cultural features your crew documented but kept working through.",
    roles: ["recce"],
    areaTags: [],
    requiresFlags: ["culturalTension"],
    excludeFlags: ["blockadeResolved"],
    baseWeight: 1,
    options: [
      {
        label: "Halt all operations and meet elders on-site",
        outcome:
          "Two days of respectful dialogue lead to a shared protection plan. The blockade lifts peacefully.",
        effects: { progress: -6, relationships: 8, compliance: 4 },
        clearFlags: ["culturalTension"],
        setFlags: { blockadeResolved: true },
      },
      {
        label: "Send the company liaison to negotiate access",
        outcome:
          "Partial agreement reached. The checkpoint stays but lets essential vehicles through.",
        effects: { progress: -2, relationships: 3, compliance: 2 },
      },
      {
        label: "Seek a court injunction to reopen the road",
        outcome:
          "The injunction is granted but the Nation vows to fight every future referral. Media picks up the story.",
        effects: { progress: 4, relationships: -12, compliance: -3 },
      },
    ],
  },

  {
    id: "regulatory-spotlight",
    title: "Regulatory Spotlight",
    description:
      "As warned, regulators are watching closely. A compliance officer shows up unannounced to inspect the blocks you pushed through with enhanced mitigation.",
    roles: ["planner"],
    areaTags: [],
    requiresFlags: ["regulatoryScrutiny"],
    excludeFlags: ["scrutinyResolved"],
    baseWeight: 1,
    options: [
      {
        label: "Walk the blocks personally and show the mitigation working",
        outcome:
          "The officer is impressed by the on-ground results. File noted as exemplary.",
        effects: { progress: -2, compliance: 6, forestHealth: 2, relationships: 3 },
        clearFlags: ["regulatoryScrutiny"],
        setFlags: { scrutinyResolved: true },
      },
      {
        label: "Provide the paperwork and let it speak for itself",
        outcome:
          "Adequate but uninspiring. The officer schedules another visit next quarter.",
        effects: { compliance: 2, progress: 1 },
      },
      {
        label: "Delay the visit citing safety concerns",
        outcome:
          "The officer is not amused. Your file moves to the priority audit queue.",
        effects: { progress: 3, compliance: -6, relationships: -2 },
      },
    ],
  },

  // ───────────────────────────────────────────────
  //  2. Triggered by mischief / investigation flags
  // ───────────────────────────────────────────────

  {
    id: "formal-investigation",
    title: "Formal Investigation",
    description:
      "A formal investigation has been opened. Inspectors arrive with files, questions, and a mandate to dig deep.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    areaTags: [],
    requiresAnyFlags: [
      "underInvestigation",
      "forgeryInvestigation",
      "environmentalViolation",
      "safetyInvestigation",
      "culturalViolation",
      "ethicsInquiry",
    ],
    excludeFlags: ["investigationResolved"],
    baseWeight: 3,
    options: [
      {
        label: "Cooperate fully and open all records",
        outcome:
          "Full transparency leads to a stern warning and a compliance plan, but no charges.",
        effects: { progress: -5, compliance: 5, relationships: 3, budget: -4 },
        clearFlags: [
          "underInvestigation",
          "forgeryInvestigation",
          "environmentalViolation",
          "safetyInvestigation",
          "culturalViolation",
          "ethicsInquiry",
        ],
        setFlags: { investigationResolved: true },
      },
      {
        label: "Retain legal counsel and say nothing",
        outcome:
          "The lawyers slow things down but costs pile up. The investigation remains open.",
        effects: { budget: -8, compliance: -2, progress: -3 },
      },
      {
        label: "Blame a subcontractor and provide selective documents",
        outcome:
          "The subcontractor disputes your version. Investigators widen their scope.",
        effects: { relationships: -8, compliance: -4, progress: 2 },
      },
    ],
  },

  {
    id: "environmental-audit-fallout",
    title: "Environmental Audit Fallout",
    description:
      "Environment ministry auditors have flagged irregularities in your ecological data. A field verification team is being dispatched.",
    roles: ["planner", "silviculture"],
    areaTags: [],
    requiresAnyFlags: [
      "environmentalAudit",
      "silvicultureAudit",
      "plantingFraud",
      "freeGrowingFraud",
    ],
    excludeFlags: ["envAuditResolved"],
    baseWeight: 3,
    options: [
      {
        label: "Fund a third-party ecological review",
        outcome:
          "The independent review finds problems but your proactive response earns credit.",
        effects: { budget: -8, compliance: 6, forestHealth: 4, progress: -4 },
        clearFlags: [
          "environmentalAudit",
          "silvicultureAudit",
          "plantingFraud",
          "freeGrowingFraud",
        ],
        setFlags: { envAuditResolved: true },
      },
      {
        label: "Challenge the audit methodology",
        outcome:
          "Your technical objections delay the process but the auditors double down.",
        effects: { compliance: -5, progress: 3, relationships: -3 },
      },
      {
        label: "Accept the findings and commit to remediation",
        outcome:
          "The remediation plan is expensive but restores credibility with both regulators and communities.",
        effects: { progress: -6, forestHealth: 5, compliance: 4, relationships: 2 },
        clearFlags: [
          "environmentalAudit",
          "silvicultureAudit",
          "plantingFraud",
          "freeGrowingFraud",
        ],
        setFlags: { envAuditResolved: true },
      },
    ],
  },

  {
    id: "budget-freeze",
    title: "Budget Freeze",
    description:
      "Finance has frozen discretionary spending pending an internal audit. Your operational flexibility is severely constrained.",
    roles: ["permitter", "planner"],
    areaTags: [],
    requiresAnyFlags: ["auditTriggered"],
    excludeFlags: ["budgetFreezeResolved"],
    baseWeight: 2,
    options: [
      {
        label: "Prioritize critical path items only",
        outcome:
          "Tight focus gets essentials done. The freeze lifts after a clean quarterly review.",
        effects: { progress: -4, budget: 4, compliance: 3 },
        clearFlags: ["auditTriggered"],
        setFlags: { budgetFreezeResolved: true },
      },
      {
        label: "Lobby the regional manager for an exception",
        outcome:
          "Partial exception granted for field work, but office budgets remain frozen.",
        effects: { budget: -2, relationships: -3, progress: 2 },
      },
      {
        label: "Redirect crew budgets to cover the gap",
        outcome:
          "Crews grumble about lost overtime pay. Work continues but morale tanks.",
        effects: { progress: 5, relationships: -5, budget: -3 },
      },
    ],
  },
  // source: FPBC 2022-10 (Kestell)
  {
    id: "water-licensee-formal-complaint",
    title: "Water Licensee Formal Complaint",
    description:
      "The neighbour whose water intake sits below your block has filed a joint complaint with the regulator citing both the trespass and a pattern of being kept in the dark.",
    roles: ["planner", "permitter", "recce"],
    areaTags: ["community-water", "private-land"],
    requiresAnyFlags: ["waterLicenseeComplaint", "trespassHiddenFromNeighbour"],
    excludeFlags: ["licenseeComplaintResolved"],
    baseWeight: 2,
    options: [
      {
        label: "Meet the licensee on-site with the sediment sampling data in hand",
        outcome:
          "The data shows the drinking water is still within standards. The licensee accepts the apology and the regulator closes the file with a caution.",
        effects: { progress: -3, compliance: 6, relationships: 6, budget: -2 },
        clearFlags: ["waterLicenseeComplaint", "trespassHiddenFromNeighbour"],
        setFlags: { licenseeComplaintResolved: true },
      },
      {
        label: "Send a formal written response and let counsel handle it",
        outcome:
          "The paperwork is thorough but the licensee reads coldness into every paragraph and escalates to the local MLA.",
        effects: { progress: -1, compliance: 1, relationships: -4, budget: -4 },
      },
      {
        label: "Question the licensee's water system design in your response",
        outcome:
          "The regulator flags the response as unbecoming and notes a pattern of undermining complainants that follows you into the next file.",
        effects: { progress: 1, compliance: -6, relationships: -7 },
      },
    ],
  },
  // source: FPBC 2021-06 (Smart / Klahoose K4C)
  {
    id: "silviculture-audit-seedlot-traceback",
    title: "Silviculture Audit: Seedlot Traceback",
    description:
      "Regional silviculture auditors want a block-by-block traceback of every seedlot used in last spring's planting, and your cutblock list has forty-some suspect lines.",
    roles: ["silviculture", "planner"],
    areaTags: ["reforestation", "community-forest"],
    requiresFlags: ["wrongSeedzonePlanted"],
    excludeFlags: ["seedlotTracebackResolved"],
    baseWeight: 2,
    options: [
      {
        label: "Run the full traceback, fund fill-planting where survival is failing",
        outcome:
          "The traceback is exhausting and the fill-planting budget hurts, but the remediation plan satisfies the auditors and the chief forester's team.",
        effects: { progress: -5, forestHealth: 6, compliance: 6, budget: -8 },
        clearFlags: ["wrongSeedzonePlanted"],
        setFlags: { seedlotTracebackResolved: true, silvicultureAudit: true },
      },
      {
        label: "Submit a high-level summary and resist the block-by-block request",
        outcome:
          "The auditors are unimpressed. The file moves up a level and the timeline gets formal.",
        effects: { progress: 1, compliance: -5, relationships: -2 },
      },
      {
        label: "Blame the nursery packing labels and step back from the file",
        outcome:
          "The nursery produces their pick slips within days and the blame lands squarely back on the forest professional who signed the request.",
        effects: { progress: 2, compliance: -7, relationships: -4 },
      },
    ],
  },
  // source: FPBC 2013-13 (von der Gonna / McBride Community Forest)
  {
    id: "community-forest-board-showdown",
    title: "Community Forest Board Showdown",
    description:
      "The community forest board has called a special meeting to discuss the unresolved FPB audit findings, and council members have been reading the file all week.",
    roles: ["planner", "permitter"],
    areaTags: ["community-forest", "audit"],
    requiresFlags: ["auditDisputeStance"],
    excludeFlags: ["boardShowdownResolved"],
    baseWeight: 2,
    options: [
      {
        label: "Attend in person with a full remediation schedule and an apology",
        outcome:
          "The meeting is tense but ends with the board endorsing the remediation path and keeping the forest manager structure intact.",
        effects: { progress: -4, compliance: 6, relationships: 6 },
        clearFlags: ["auditDisputeStance"],
        setFlags: { boardShowdownResolved: true },
      },
      {
        label: "Send written comments and decline the meeting invitation",
        outcome:
          "The absence is read as avoidance. The board votes to bring in an independent reviewer at your expense.",
        effects: { progress: 1, compliance: -3, relationships: -5, budget: -5 },
      },
      {
        label: "Threaten to resign if the board keeps pushing on the findings",
        outcome:
          "The board accepts your resignation with relief and your professional file inherits a reputational hit that outlives the audit itself.",
        effects: { progress: -2, compliance: -6, relationships: -8 },
      },
    ],
  },
  // source: FPBC 2022-04 / 2022-09 (Chipman, Johnson)
  {
    id: "nation-general-meeting-invite",
    title: "Nation General Meeting Invitation",
    description:
      "The First Nation whose referral was missed has invited you to present at their next general meeting, with elders, youth, and community members in the room.",
    roles: ["planner", "permitter", "silviculture"],
    areaTags: ["first-nations", "community-forest"],
    requiresFlags: ["firstNationReferralHidden"],
    excludeFlags: ["nationMeetingResolved"],
    baseWeight: 2,
    options: [
      {
        label: "Accept the invitation, attend without slides, and listen first",
        outcome:
          "The meeting is long and hard but ends with a commitment to co-develop the next round of site plans.",
        effects: { progress: -4, compliance: 5, relationships: 8, forestHealth: 2 },
        clearFlags: ["firstNationReferralHidden"],
        setFlags: { nationMeetingResolved: true },
      },
      {
        label: "Attend with your counsel and a prepared statement",
        outcome:
          "The statement is polished but the community reads it as defensive and declines to schedule a follow-up.",
        effects: { progress: 0, compliance: 1, relationships: -3 },
      },
      {
        label: "Decline the invitation citing scheduling conflicts",
        outcome:
          "The Nation issues a public statement, the regulator opens a second file, and the licensee starts looking for a different forest manager.",
        effects: { progress: 1, compliance: -7, relationships: -10 },
      },
    ],
  },
  // source: FPBC 2020-03 (Peasgood)
  {
    id: "landowner-satellite-rebuttal",
    title: "Landowner's Satellite Rebuttal",
    description:
      "The private landowner has hired an independent analyst, produced satellite and orthophoto evidence of merchantable volume on the parcels you excluded, and copied the regulator on their letter.",
    roles: ["planner", "recce"],
    areaTags: ["private-land", "cruise"],
    requiresAnyFlags: ["cruiseExcludedParcels", "missingCruiseFieldNotes"],
    excludeFlags: ["satelliteRebuttalResolved"],
    baseWeight: 2,
    options: [
      {
        label: "Commission an independent re-cruise and share the raw data with the landowner",
        outcome:
          "The re-cruise confirms there was merchantable volume. The settlement is expensive but the regulator closes the file with a records-management requirement.",
        effects: { progress: -5, compliance: 6, relationships: 4, budget: -7 },
        clearFlags: ["cruiseExcludedParcels", "missingCruiseFieldNotes"],
        setFlags: { satelliteRebuttalResolved: true },
      },
      {
        label: "Defend the original cruise design in writing and cite the manual waiver",
        outcome:
          "The manual citation is technically correct but the landowner's satellite evidence is photographic. The regulator escalates the file.",
        effects: { progress: 1, compliance: -5, relationships: -4 },
      },
      {
        label: "Offer a token payment in exchange for the complaint being withdrawn",
        outcome:
          "The landowner rejects the offer, publishes the exchange online, and the forum of readers includes three of your current clients.",
        effects: { progress: 0, compliance: -7, relationships: -6, budget: -3 },
      },
    ],
  },
];
