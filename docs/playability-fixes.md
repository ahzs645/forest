# Playability fixes and verification

2026-09-05. Local changes on `codex/playability-branch-integration`, following the manual campaign review of `991a9fe`. The original observations remain in `manual-playthrough-review.md`.

## Changes

| Playthrough issue | Current behavior |
| --- | --- |
| Deferring a washout erased the obstruction | Washouts and landslides remain as saved route constraints. Local work stays available; clearing the route or marking a detour consumes a shift. The constraint is enforced by travel mechanics as well as the menu. Manager delegation stays separate from field route handling. |
| Travel skipped the destination or reported excess distance | Travel stops at the named next block and clamps its reported distance, including fractional boundaries. |
| Securing cargo moved the crew backward | Incidental setbacks slow the next travel leg. Local work cannot erase that delay. Only an explicitly authored turn-back response changes position backward. |
| Brief replies unexpectedly consumed the day | Event options disclose whether work continues or the response uses the day. Explicit full-day work includes route clearing and GIS reconstruction; a brief written response or honest refusal leaves the work action available. Outcome acknowledgements distinguish returning to work from closing the shift. |
| Contradictory day narration | The quiet card retains the preceding event, storytelling occurs over breakfast, and a shift without travel no longer claims that assessment work happened in camp. Discovery tags display their readable names. |
| Summer briefing and workforce contradicted execution | The briefing explains summer planting inefficiency. Preview and execution share contractor selection, including available support outside its specialty. Options name the selected crews and outcomes announce deployments. Planting, brushing and surveys require an available workforce; invalid surveys do not increment counts or charge the survey fee. |
| GIS repair damaged stakeholder buy-in | Reconstruction uses the day without damaging buy-in. Failed alternatives affect data readiness directly. |
| Panels lagged decisions and purchases | Event frames refresh role mission panels, shared resource displays refresh after outcomes, and resupply purchases update the dashboard immediately. |
| Repeated permit deficiencies and frozen stages | Deficiency tickets have persistent readable identifiers. Road-stage labels follow actual chain progress. An open deficiency prioritizes its clean response; planning recommends direct submission when its confidence gain can close the approval gap. |
| Weak survey and season-end explanations | Failed surveys explain assessment confidence and contributing conditions. Season and year reviews show achieved/required counts. Shortcut temptations occur less frequently. |

The four-season campaign, recoverable seasonal failures, resource pressure and existing terminal presentation remain intact. These changes are local; they have not been committed or published.

## Verification

- Before changes, all 328 existing unit tests and the campaign smoke passed despite the manual defects. A new browser assertion reproduced the stale dashboard on fall day 2: the story showed day 2 while the panel still showed day 1's remaining time.
- Final unit run: **343 passed**, including obstruction persistence, precise destination limits, delayed travel, actual contractor selection, no-workforce handling, GIS consequences, manager delegation and advancing permit-stage labels.
- Final browser run: **49 passed**, including desktop, phone layouts, every role, failure endings and the full campaign. Regression coverage includes a saved authored washout, deferral through the normal UI, reload from the ordinary autosave, persistent closure, and successful clearing without moving the crew. The campaign test checks day counts, approval counts and named travel destinations while continuing through all four reviews and the year-end handoff.
- Event content lint: **177 events, 177 unique IDs**, passed. Seasonal content lint: **0 errors, 0 warnings**. JavaScript lint: **0 errors, 37 warnings**. Production build runs as part of browser verification; its chunk-size/dynamic-import warnings remain.

The balance harness drove 24 seeded campaign-length assignments per role using real mode runners. It recognizes the new route-clearing actions and support-only menus without unidentified-menu fallbacks.

| Assignment | Targets delivered | Median finish day | Deadline |
| --- | ---: | ---: | ---: |
| Recon | 21/24 | 19 | 24 |
| Planning | 21/24 | 17 | 26 |
| Permitting | 24/24 | 13 | 20 |
| Silviculture | 24/24 | 16 | 20 |

The remaining simulated losses were supply/fuel exhaustion or planning bankruptcy. This is evidence that completion is reachable under a consistent strategy, not a population win-rate estimate or proof that every possible choice succeeds.

The Mac remained locked during this implementation pass, so fresh verification used headless browser interaction and engine tests. The earlier visible manual campaign is documented separately. The updated local game is available at `http://127.0.0.1:5178/` while its development server is running.

## 2026-09-29 — Planning in the southern areas

- **Block data for Vancouver Island Coast, Kootenay Wetbelt and Okanagan/Shuswap Drybelt.** `js/data/json/planning/blockOptions.json` covered only the six northern areas, so the lead block set never locked there and the FOM could not publish. The three areas are now generated from BC OpenMaps like the others (`npm run refresh:planning-blocks -- --areas=vancouver-island-coast,kootenay-wetbelt,okanagan-shuswap-drybelt`), 24 planned cutblocks each, filtered to the South Island, Selkirk and Okanagan Shuswap districts. Each area records its own `generatedAt` and `dataWindow`.
- **No area can dead-end the block decision.** An area without a snapshot gets four labelled area-profile placeholder blocks instead of an empty pool (`js/data/planningBlocks.js`).
- **The triage scrutiny shift lands once.** The shift is a standing posture. Re-picking the same triage after an event reopens the block question moves nothing, and switching moves only the difference (`applyTriageScrutinyShift` in `js/modes/planning.js`).
- **Checks.** `tests/planningFomGate.test.mjs` drives every operating area, plus one with no snapshot, to FOM publication headlessly. `node scripts/simulate-expeditions.mjs --role planning --area all --runs 36` gives 36/36 wins in every area at full length. At campaign scale the southern areas win 36/36 and the northern areas 34–36/36.
## 2026-09-29: Campaign meters and carry-forward (playtest finding #9)

- **Season bridge.** Relationships and compliance now come from what happened in the season:
  - the relationship and compliance effects that events announced (`journey.standingLedger`);
  - each mode's own work: crew morale, the planning engagement record, and permitting's working relationships;
  - how far scrutiny moved from where the deployment opened.

  The bridge used to read `journey.metrics`, which only manager journeys have. Cause lines now name their drivers. The review no longer says "File compliance held" when scrutiny is at 100.
- **Honest numbers.** Reviews and the Year in Review print the change each meter actually took, with the earned amount when diminishing returns cut it (for example, "+8 (+14 earned)").
- **Fixes for the idle year:**
  - A 0% season now costs Progress -8.
  - A Push stance that falls short gives back its +3.
  - Unspent allowance earns Budget only in proportion to the work delivered.
- **Tier and ending copy.**
  - Solid needs at least 2 of 4 deployments delivered, and Outstanding needs at least 3.
  - The ending copy follows the number delivered.
  - The Year in Review names the floors that held the year back.
- **Fall carries into winter.** If the fall FSP was not approved, winter runs under an extension of the old plan: 4 cutting permits are held, starting scrutiny is higher and the district is cooler. Completion is still measured against the full program.
- **Event routing.**
  - A generic setback on a planning file now costs strain instead of lowering the current gate.
  - Traverse gains are clamped at the end of the route.
  - A cleanly answered deficiency letter is not sent again for the same file, and each clean answer lifts that file's approval odds.
- **Headless campaign sim.** Run it with `node scripts/simulate-campaign.mjs --difficulty normal`: 6 northern areas × 6 seeds per style.

| Style | Before: Solid / Mixed / Stumbled | After: Solid / Mixed / Stumbled |
| --- | --- | --- |
| good | 15 / 21 / 0 (mean R52 C68) | 36 / 0 / 0 (R65 C78) |
| average | 0 / 12 / 24 | 1 / 20 / 15 |
| terrible | 0 / 0 / 36 (P71) | 0 / 0 / 36 (P61) |
| idle | 0 / 0 / 36 (P52 B52) | 0 / 0 / 36 (P27 B38) |

No style reaches Outstanding in the sim. Forest Health tops out near 64, below the ecological path's 67. Careful play averages Compliance 78, below the stewardship path's 88. Whether the campaign should have its own excellence gates is a separate balance decision.
## 2026-09-29: recon field mechanics (playtest follow-up)

- Event "+N km traverse" effects no longer move the crew. Gained ground is banked for the next leg, which still stops at the next stop, road check and crossing. Lost ground slows the next leg. A turn-back never goes behind the last stop.
- Event options that cost more cash than the crew has are left off the card, and the card gives the reason.
- Short rations are a standing order that holds until changed. An empty food box escalates health and morale loss every shift, rest does not offset it, and the crew drives out after six shifts. Full-or-short rations are not offered at zero food.
- A leg that ends within 1.5 km of a stop finishes it.
- Event fuel previews are in litres at the resolved scale, and gains are reported.
- A broken arm or concussion is treated once and then heals with time (broken arm: 12 shifts). A second kit is not spent.
- Resupply sells only what fits. The bear is reported to RAPP once. Fording a fish stream outside the summer work window costs scrutiny. The flood message matches the crossing type.
- Recon expedition sims: 24/24 wins before and after. The median dropped from 27 to 24 shifts because of the arrival snap.
## 2026-09-29: Silviculture playtest fixes

- **Contractor fatigue.** Fatigue is earned on the block and shed on days off (3 a day). Crews standing by no longer accrue it. Crews now work a real plant-and-plot rotation instead of one day on and two off, which brings contractor calls back. A contractor meeting is offered only when a foreman is available, and backing out of one keeps the day. Calling a crew onto the block is a free radio call. Brushing never puts the planters on the block.
- **What "delivered" means.** Victory, the objectives score and the failure reason all come from one assessment (`assessSilvicultureProgram`). It requires every block planted and inspected, fill done, the release queue treated, and the declarations in RESULTS. Planting quality also counts toward the grade. A program that is not delivered grades no higher than D, or F if under half of it was delivered. Time and resource scores scale by the share delivered.
- **Integrity.** Shortcuts go on a ledger (`js/modes/silvicultureIntegrity.js`). Each caught falsification costs 20 points on top of scrutiny, and each caught field shortcut costs 6. Two caught falsifications pull the program. A check at season close can surface records that were never caught during the season.
- **Final report.** Reporting as surveyed pays +4, or +2 when there is a false record. Spin is a +3/-12 gamble whose odds fall with scrutiny and false records.
- **Free-growing surveys.** A stand that fails waits out its resurvey interval (2 years), and its prescribed release joins this season's program. The free-growing list carries one spare opening. Sprayed brush takes 10 days before a surveyor can read the stand. Survey plots read the stand and the release program, not random noise.
- **Other fixes.**
  - Planting carries across block boundaries.
  - Holdbacks are released when a later block passes clean plots.
  - Dead "paused/blocked" options are replaced by reasons on the card.
  - Contractor-call outcomes and set-aside costs stay on the day card under "Earlier today".
  - Fuel and food event effects are charged to the budget.
  - Brush copy names the zone's species.
- **Evidence.** `node scripts/simulate-silviculture-policies.mjs` runs 8 seeds in each of the 9 areas:
  - competent: 72/72 wins, all grade A
  - neglect: 0/72 wins, all grade F
  - fraud: 0/72 wins, grades D/F
  - shortcuts with full delivery: mostly D/F once caught
## 2026-09-29 — Planner and permitter playtest fixes (W10)

- **Prepare Submission spam:** a filing that cannot cross the District Manager's gate is returned unread (day, $2,200, goodwill -3, scrutiny +2, DM readiness -5). Pre-submission meetings are the only way to the cap; the card says whether a filing will land.
- **Values Workshop:** values are shown on the day card, mission pane and workshop prompt. The analysis and Timber Supply Analysis wear the non-timber values down; below 40 a value blocks the session and submission and costs the file daily. The workshop has Back, and each line shows the whole day's cost.
- **Permit pipeline:** outside counter changes act on named files and are refused where the pipeline disallows them: nothing is conjured into `issued`, no file is deleted, setbacks pull the named file back to drafting. HCA permits sit outside the District Manager's 15.
- **Deficiency letters:** fast-track is decided that night with a higher chance of return. A cleanly answered gap is never the next letter on the same file. A district meeting decides only its own file.
- **Scoring and debrief:** an undelivered file earns no Time, and its unspent budget is scaled by work done. Resources use the run's own starting budget. Desk roles score the protagonist's wellbeing instead of a flat 50. A failed plan is handed over, not sealed.
- **Sims:** `node scripts/simulate-expeditions.mjs --role planning --area all --compare` (also for `permitting`). Competent play grades about 98–100; reckless play grades 38–65 in every area. The three southern areas have planning block data now, so competent planning wins there too.
## 2026-09-29 — General Manager (playtest #12)

- **Cut control decides the year.** 90–110% of the AAC is clean; outside it the year wins with a finding (and a qualified victory text); below 85% or above 115% the board ends the term. The overcut penalty ($60/m³ past 110%) now exceeds any margin. Objectives score reads the statement; the compliance component blends in the compliance meter.
- **Legible and steerable.** The projection follows the seasonal curve and the current run rate. A cut schedule (park a side / hold / add a shift) is set at each board review and raised by the woodlands manager whenever the projection leaves the band.
- **Nothing is wiped unread.** A Continue prompt holds quarter-end ledgers and the cut-control statement before the board review; the review reprints them; every ledger, audit and the statement go into the Log.
- **Honesty is viable.** Transparent reports of weak quarters cost no reputation and ease scrutiny; spun weak quarters risk a year-end restatement.
- **Certification is earned.** May registration audit against stated requirements, one October re-audit, October surveillance with suspension; premium and bonus start at issue.
- **Executive team and calendar.** The Expedition GM gets the CFO/woodlands/chief forester/IR/HSE team; the month drives the season so seasonal cards are gated; no CEO references.
- **Economy.** Stumpage tracks the log price, overhead $270k scaled by difficulty, January is a ledger month. `node scripts/simulate-manager.mjs` (40 seeds, normal): competent 40/40, honest 40/40, spin 40/40 at a lower grade, reckless 3/40 (overcut), random 34/40 and no Greenhorn bankruptcies.
## 2026-09-29 — Saves and UI (playtest audit, ui.md)

- **Saves:** every read is schema-checked (`js/game/saveLoad.js`). A corrupt, partial or older-schema expedition or campaign save is named, discarded and replaced by the hub, so it can no longer blank the app or strand a campaign screen. LOAD DATA only lists saves that load.
- **Leaving a run:** the prompt leads with Keep Playing (focused), offers Save & return, and puts Abandon last. Escape then Enter no longer deletes the run.
- **Landing:** the menu scrolls and fits above the footer at 1280×720, 1366×768 and 1024×768 once a career forest exists. Ctrl/Cmd/Alt chords no longer trigger shortcuts. The game shell is inert behind the landing and setup screens.
- **Themes:** the legacy colour aliases now resolve per theme, so green, amber and ice apply fully, including the Trail View. Dim text meets 4.5:1 in every theme.
- **Modern and Grid:** Modern keeps about five lines of story under the Trail View, and its phone cards stack. Grid clips on whole words with an ellipsis.
- **Career forest:** Campaign years, Seasonal years and Crisis debriefs are filed to the service record.
- **Intel and copy:** Intel counts and labels are corrected, the manifest reflects the province-wide game, and several copy nits are fixed.
- **Tests:** unit coverage is `tests/saveValidation.test.mjs` and `tests/careerTieredRuns.test.mjs`. Browser coverage is `tests/e2e/saves-ui.spec.js`.
## 2026-09-29 — event engine (playtest findings #5, #6, #7, #10, #14)

- **Planning progress** (`js/events/resolution.js`): generic `progress` on a planning file is the planner's own time (energy/stress), never a gate. Data, analysis, buy-in and DM readiness move only on the planner's actions or an explicit `data`/`analysis`/`buyIn` key. The option hint reads "lost time on the file" / "time back on the file".
- **Permit events stay inside the pipeline** (`js/events/resolution.js`, `js/journey/permitPipeline.js`): `permits_approved` signs only files already at decision and not held (WSA window, HCA pause); generic progress moves the soonest live clock a day either way; counters are never edited by events, and reconciling a counter shortfall sends the surplus file back to drafted instead of deleting it (no more orphaned HCA permits).
- **Set it aside** (`js/events/deferral.js`, `js/journey/daySituation.js`): deferrals cost by severity, an imposed situation (every option costly) lands its least-bad certain option's cost anyway, the cost waits behind a "Take the day back" button, and every deferral is logged as a situation the compliance tally counts.
- **Goodwill** (`js/events/resolution.js`, `js/game/debrief.js`): every event outcome prints "District goodwill ±N → M", warns at 15 or below, and the debrief opens with the end reason before the archive prompt. Hints say "goodwill" on desk files.
- **Reload determinism** (`js/events/dayRng.js`, both game loops, `js/modes/permitting.js` night): each day is seeded at the boundary before the save; the draw, temptation lane, outcome band, injury, reaction and permitting night roll from that seed, so a reload replays the day.
- **Seasonal probability** (`js/engine/content.js`): the seasonal draw folds the deck's `probability` into the weight (squared below the deck median, floored to keep rare cards alive) and never draws probability-0 payoffs cold. Seeded 1,080-year sim: any joke card 39% → 3% of years.

## 2026-09-29 — Regional content (playtest workstream W2)

- **Recon routes for the south.** Vancouver Island Coast, Kootenay Wetbelt and Okanagan/Shuswap Drybelt each have their own twelve-stop recon route (`js/data/json/field/blocks.json`) instead of falling back to Fort St. John. Areas gain `mainland`, `freeze-thaw`, `ich` and `idf` tags.
- **Region gating.** `northern-bc` no longer matches `bc-wide` in reverse, so northern-only cards stay north. Caribou, moose, grizzly, -30C and breakup cards are gated to the areas where they belong. Place names that leaked through broad tags are gone. Shared field events no longer use recon wording, and area situations only play in their home area.
- **Silviculture by zone.** Release copy, manual-release targets, sheep grazing (Interior only), contractor names and drought/brush pressure now differ between coast, wetbelt and drybelt. The coast gets its own campaign briefings.
- **File names and BC facts.** Permit files are named after the area's own route blocks and roads, and labels are unique. RUP letters ask for road-use terms. Spills are reported to the EMCR spill line with a 100 L framing. Riparian, glossary, MSSpa and trap-tree details are corrected.
- **Tests.** `tests/regionalContent.test.mjs` fails when an area lacks its own route or when regional wording can be drawn outside its region.
## 2026-09-29 — Seasonal Strategy playtest fixes

- Paperwork chains advance (the stage index was written to a stale copy) and process cards show stage-specific answers.
- Dead seasonal content revived: 15 unreachable issues retagged or given flag producers; caught-shortcut fallout always has somewhere to land. `lint:seasonal` now fails on unknown area tags, undrawable issues, flags nothing sets, dead schedules and ungated season-bound copy.
- Season gating: events honour `seasons`; heat dome, whiteout, early snow, snowmelt flooding and the pine beetle chain are season-locked.
- Ending tier is read off the displayed score; meter gates cap the score and the scorecard says which gate held the year back.
- Hub: "Your mission" brief, line-by-line "Why This Happened", no duplicated alert, [L] Log reads the seasonal year, role card explains why General Manager is not offered.
- Field events: gains no longer add Progress, gambles land as their expected outcome, medevac is charged. Practice-burden cards log CPD; the CPD gap is prorated across the year.
- Expedition housekeeping: scrutiny clamped at 100, crew ids unique across reloads, resource scoring uses the run's real starting stores. eslint warnings 31 -> 5.
- Balance (`npm run sim:seasonal`, 12,600 years): greedy 2.28 -> 2.22, role-optimal 2.05 -> 1.85, cautious 1.80 -> 1.72, balanced 1.47 -> 1.50; greedy Outstanding by role planner 3% -> 15%, silviculture 30% -> 7%.

## 2026-09-29 — Illegal-act library content (wave 2, F2a)

- **Caught paragraphs** (`js/data/illegalActs.js`): the ENV, BCWS, RCMP, Transport Canada, DFO, C&E, Timber Pricing and Revenue Branch templates now say only what the institution does, so they hold for every act it catches (spray and smoke as well as spills, a false fire claim as well as a fire). No template names its own delay; `catch.lagDays` is the act's.
- **Clean and go-around lines:** 44 acts whose category line described a different act carry their own `cleanOutcome`/`goAround`; the category go-around lines read the same at a desk or a tailgate.
- **Proposers:** self-proposed acts have their own refusal lines and are never re-offered or gone around; field voices are plain noun phrases ("The client's forester, at the tailgate"). Two surgical edits in `js/events/selection.js` (the voice table, the self deck).
- **Facts and fit:** riparian reserve from the top of the bank, pre-1846 CMTs, opening-size cap, CRP, PMP, RFT registration, no statutory trapline/outfitter terms, forged RP amendment, check scaling; coastal/interior gates; planting, camp, bear and spray acts out of winter; field roles no longer authorise haul; duplicates removed or split by role.
- **Payoffs:** lines are noun phrases, never name a figure the mechanic does not pay, and desk/program budget payoffs are capped. `js/data/mischief.js` no longer pays fraud in compliance.
- **Tests:** `tests/illegalActsContent.test.mjs`.
## 2026-09-29 — General Manager residuals (round 2, F5b)

- **No save-scum.** The monthly ledger (volume noise, log-price drift) and the year-end restatement check roll from the month's stored seed (`js/events/dayRng.js`), so a reload replays the same ledger and the same audit (`tests/managerReplay.test.mjs`).
- **The board reads the whole quarter.** A quarter is weak when deliveries are more than 15% over or 10% under plan, when the year is projected out of the band (or December's statement has a finding), or when the treasury is empty or under half its opening. A spun overcut now goes to the restatement audit.
- **Areas differ.** Each of the nine areas sets log price, stumpage, logging and haul cost, price swing and the delivery curve (interior breakup, winter-road thaw, coast fire shutdowns, wet transition, dry belt). The operating plan names the wood and its market.
- **Cards fit the month and the job.** Fire and smoke cards are gated to fire season, washouts to storm season, and ice roads to winter. The "CEO's ear" budget fight is dropped. The woodlot-overcut and community-forest shortcuts are struck from the draw with a gate in the mode code. Replacement crews resolve as the Labour Relations Code s.68 problem they are.
- **Nothing is hidden.** Ledger-hook options carry a `ledger:` chip with their lasting per-m³ or volume effect. Event reputation changes print. The certification requirements stay on the pane all year and are read against the meters in the audit month and the month before. Strategic results are held before the card and kept in the Log.
- **Months, not days.** Progress and milestones follow the calendar. Outcome, set-aside, resume, location-panel and service-record copy say "month".
- **The choice shows in the grade.** Push the cut and cost discipline now carry their advertised scrutiny and executive-team costs. Cost discipline books a $0.50/m³ silviculture provision at year end. The GM's victory bonus is 5 points (was 10). Competent play by posture × certificate (normal, 20 seeds) now scores 92–100 (was 98–100 with medians of 100), and every pair still wins 20/20. Honest play wins 30/30 on normal and 29/30 on hard.
## 2026-09-29 — Seasonal shortcut engine (F1a)

- **A clean take pays the act's own payoff.** `adaptIllegalActTemptation` (`js/engine/content.js`) now builds the offer from `act.payoff` (`buildIllegalActPayoff`): dollars land on Budget, days/files/volume/shifts on Progress, +5..+10, always outweighing the clean band's own costs (Compliance -2; Forest Health -3 for ecological acts; Relationships -2 for community acts). The role profiles' `successBaseEffects`/`gainRange`/`baseSuccess` are gone; `failConfig` (the caught band) is unchanged.
- **Three bands, honest odds.** `js/risk.js` resolves clean / noticed / caught (`result.band`), with band shares from the act tier (`SHORTCUT_BAND_ODDS`), shifted by tags, a prior shortcut this year (-0.15) and an institution already watching (-0.2), then by the file: a trusted file gets the benefit of the doubt, one under scrutiny does not (this reverses the old "high compliance makes cheating harder"). Caught never drops below 15%. Noticed lands the payoff at Compliance -4 / Relationships -2 and leaves the watch flags; no fallout.
- **The promised fallout is the card that is dealt.** A catch schedules one `id` (the heaviest routed candidate whose gates are open in the season it lands, `falloutLandingContext`), with the rest as fallbacks; `resolvePendingIssue` keeps the promise whenever it can. The notice reads "Fallout (manageable): X. It lands next season." Pending entries carry `causedBy.kind = "shortcut"`, `actId`, `institution`; the dealt card carries `scheduled`, `causedBy`, `sourceTitle`, and `surfaceReason` "you took the shortcut “X” in summer, and C&E caught it." A second due follow-up is picked up by the season's second contested call (`drawIssue({ drainPending })`).
- **Last-season catches settle at year end.** The notice says the fallout "lands after the year closes and goes on next year's file"; `applyRoundConsequences` settles it as the `unlanded-fallout` consequence (Compliance -3/-1, or -6/-3 for a serious card), named in "Why This Happened" and the Year End Review. `describeConsequences` now falls back to the logged title/cause instead of a raw id.
- **Go-around silence is not free** (`js/events/selection.js`, `js/journey/daySituation.js`): condoning a thing already done costs Compliance -2, scrutiny +3 and a `contractor_owns_you` flag; "Report it" no longer costs scrutiny.
- **Gating** (`js/data/illegalActs.js`): grizzly and nesting acts, planting crews and camps stay out of winter; coastal fir and the coastal seed variance are gated by BEC; whitebark cones to the interior; the 40 ha cap to the Coast and Southern Interior (FPPR s.64). A silviculture deployment runs the growing season, so its brushing/survey acts are reachable there; the regen-delay push is fall/winter.
- **Fields for the card UI (F1b):** on the offer card `shortcut {actId,title,proposer,institution,category,tier}`, `odds {clean,noticed,caught}`, `oddsLine`, `payoffChip`, `payoffLine`, `payoffEffects`, `institution`, `promisedFallout {id,title,severity}`; on the take option the same plus `bands.{clean,noticed,caught}.{effects,outcome}`; on the fallout card `causedBy`, `sourceTitle`, `scheduled`; on `gs.lastDecision` and the outcome notice, `band`.
- **Sims** (`node scratchpad f1a-sim.mjs`, 4 roles × 9 areas × 12 seeds, balanced play elsewhere): take-all vs refuse-all mean score planner 52.0→58.1 vs 61.6, permitter 50.9→59.3 vs 61.3, recce 55.2→58.7 vs 61.7, silviculture 48.8→53.1 vs 55.2; net-positive clean takes 0–41% → 100%; promised fallout dealt next season 37–62% → 100%; final-season catches resolved in the review 0 → 26/26. Tests: `tests/seasonalShortcuts.test.mjs`.
## 2026-09-29 — Silviculture residuals (round 2)

- **Coast budget.** Day 1 and the binder say what the budget assumes: what planting, fill, surveys and overhead need, and what the release queue costs by each method. Cylinder release (saw crews clear a ring round each crop tree, $560/ha) is a chemical-free route the budget carries on every area and difficulty. Four saw crews brush 30 ha on a normal day, not 48 to 65. Each release day is quoted and confirmed before the crews go out.
- **Events.** Fuel and food costs are priced into the budget, but gains, first-aid counts and traverse time setbacks are dropped. Buying food no longer earns money. Options that say they take the day now spend it. Traverse-only cards are skipped. The chainsaw partial band evacuates the worker it says was lost.
- **Crews on days off.** Field tasks stay on the card, disabled, with the day the crew is back. Surveyors never plant, and fill does not call the saw crew in beside the planters.
- **Standing.** Glyphosate on sensitive ground writes relationships to the standing ledger. After three spray days the Nation asks for no more spraying, and glyphosate is shown off the table.
- **Copy.** Stand-down reasons follow the season and the ground. Contractor calls fit the outfit, and quality disputes follow short plots. Milestones print the program's real numbers. The panel refreshes after the day's work.
- **End of run.** A delivered run graded D or F is "EXPEDITION COMPLETE", not "SUCCESSFUL". A pulled or failed program is handed over, not reported, and its narrative follows what was planted. The expedition gets the silviculture crew. The grade reads the difficulty-adjusted budget.
- **Sims.** `node scripts/simulate-silviculture-policies.mjs` now covers 9 areas x 3 difficulties with a no-spray `honest` policy, 8 seeds each:
  - competent: 216/216 wins
  - honest: 216/216 wins, never broke; about $26k left on the hard coast
  - neglect: 0/216 wins
  - fraud: 0/216 wins
## 2026-09-29 — Planner and permitter residuals (round 2, F5a)

- **Set-aside charges are proportionate** (`js/events/deferral.js`): every option is priced the same way, gambles at their expected cost, and the cheapest is charged. The charge is capped at two steep hits for a moderate call and three for a severe one, and at 6% or 10% of the run's starting budget. Setting aside the billing dispute now costs about $2,000, not the $18,000 invoice. A test walks every desk event.
- **Goodwill 0 ends the run on the spot.** A desk run whose morning situation spends the last goodwill or budget ends before the day menu opens. On the losing night the button reads "The work stops here...".
- **Mid-day checkpoint** (`js/journey/deskMechanics.js`): the desk day saves once its situation is settled and again after the day's action. A reload resumes from there instead of replaying the morning. The leave dialog now promises only "its last checkpoint".
- **Permit queue.** A filed CP goes in with its HCA application, and a drafted HCA that holds a CP is filed first. Holds say where the HCA actually is, and the Archaeology Branch decides it. Fast-track, chase and follow-up print their goodwill and scrutiny moves. Compliance Admin is always offered, and the area's paperwork lane is a separate option that drafts its own permit type. Letters no longer invent referral dates, and the follow-up names the file it moves.
- **Scoring and debrief.** On a desk, the straight record is worth +4 and thanks +2. Spin is a +4/−10 gamble that loses on average. An undelivered file scales Wellbeing by the share of work done. Spin on an approved plan no longer reads as a failed file.
- **Honest copy.** Relationship lines show what moved. Time saved on an idle queue drafts, files or says it bought nothing. "Permit Issued Early" needs a signable file. Also fixed: "Block 7", "summer intern", brief responses that narrated days, the milestone, CPD and value labels, the end-screen phase and full stops, moments, and personal bests. The meter is called GOODWILL everywhere on a desk.
- **Sims:** `node scripts/simulate-expeditions.mjs --role permitting --area all --compare` gives competent 8/8 (98–100) in every area and reckless 2–6/8 (51–70). Planning gives competent 8/8 (96–99) and reckless 0/8 (30–40).
- **Not done here:** shortcut card text (the N-7 riparian slope pitch, "Ten minutes" on Document and report) belongs to the temptation workstream.
## 2026-09-29 — Seasonal shortcut presentation (wave 2, F1b)

- **Offer card** (`tui/controller.js` `buildShortcutBrief`, hub `js/game/seasonalAdapter.js`, classic `src/tui-browser/App.jsx`): a danger banner ("Shortcut offer · off the books"), a headline naming who checks, the pitch, then its terms: what it pays, the odds it holds this season (read from `resolveRisk`, or from the card when the engine carries odds/payoff) and "Saying no costs nothing". The take option prices each band with the same odds. No "upside here is regulatory defensibility" framing, no "Pressure points" tag line, no "Adapted …" dev flavour, no More context. Decline stays first and selected. Theme tokens in the hub (`scss/components/_shortcut.scss`).
- **Fits the screen:** the hub pins the banner (or the title on a phone) to the top of the log; the classic view reveals the offer in the Field Radio, hides the Last Decision panel on any card that opens with the same outcome notice, and tightens its chrome below 800 px tall. Whole offer readable at 1280×720 and 390×844 in both views.
- **Fallout** says "Because you took: <act> — your summer shortcut." under its title (hub and classic). A catch in the final season no longer promises fallout (unless the teaser says it lands).
- **Previews** show the gain a meter will actually take, marked "(tapered: meter high)".
- **Also:** "steady-program" reads as "Steady program" with a cause; Play Again clears the hub's dashboard; classic `?classic=1` answers G/P/L/S/? with panels (and header buttons); a partial Seasonal save is validated (`validateSeasonalSave`) and offered for discard instead of dead-ending.
- **Tests:** `tests/shortcutPresentation.test.mjs`, `tests/saveValidation.test.mjs`, `tests/insights.test.mjs`; browser `tests/e2e/seasonal-shortcut.spec.js` (hub × 4 themes, classic desktop/phone, fallout, panels, Play Again, partial save).
## 2026-09-29 — Recon regressions (round-2 retest, F3)

- **Short rations** stay a standing order but lapse with their reason: when the box is restocked above the warning line (at the morning beat, a grocery run, the cache or the supply point), or when someone falls to morale 30 while the box can carry full meals. Each lift prints why. The order, the morning beat and the mission panel all state the cost (4 morale a shift each).
- **Grade:** a recon season that was not delivered earns no Time. Objectives count packages, not kilometres. A recon win gets no flat +10, and Resources can reach 100. Time runs from a clean run (two shifts a package, one a leg) down to the layout window. Careful seasons score 85-95, and only a flawless season scores 100. The crew-loss ending reads "NO CREW LEFT - N quit and M were sent out".
- **Landslide:** "Turn back and report" closes the road until the next shift, and the crew can take the old spur around meanwhile.
- **Stop gating:**
  - Block-ground cards (`stopKinds: ["block"]`) and layout shortcuts on a block's own ground are not drawn at waypoints.
  - Ealue Lake is a road-end block with a float-plane cache.
  - Fair-weather cards skip storms (`notInWeather`).
- **Arrival snap:** decided on the rounded figure the player sees.
- **Injuries and crossings:**
  - A route-mishap fracture goes out on the ETV the same shift.
  - A broken bridge bills only trips back over it: town runs and return visits.
- **Storm days:** event cards carry the grounding, and their options read "storm holds the crew in camp". "Stand down until comms are restored" uses the shift.
- **Prices:**
  - The supply point lists what the card cannot cover, with the shortfall.
  - Town runs the card cannot pay for are named in the camp prompt instead of burning a shift.
  - A set-aside never lands an option the card could not pay for.
  - The recon medevac charges standby time ($1,200); WorkSafeBC covers the flight.
- **Ferry at FLOOD** offers only the wait, which ends the harness spin at Tahltan.
- **Campaign Budget line (small hook in campaign.js):** shortcut cash is not savings, and no thrift credit goes to a season whose crew went hungry or quit.
- **Sim (`--role recon --area all`, 8 runs per area):**
  - Before: 56/64, with Tahltan spinning.
  - After: 72/72.
  - Matrix of 9 areas × 12 seeds, competent policy, easy/normal/hard: before 0.97/0.84/0.55, after 1.00/1.00/0.90. The policy now manages fuel and supply stops and does not set aside injuries.
  - With the unchanged policy: 1.00/0.97/0.84.
## 2026-09-29 — Shortcut mechanics and presentation (wave 2, F2b)

- **Odds are honest.** Every shortcut keeps a caught band by severity (serious harm or a criminal/federal catcher 15%, core 10%, grey/comic 5%); the chip names all three bands and the catcher, first on the option, and the card's stakes say why today's odds moved (who is watching, prior shortcuts, a clean record).
- **One set of numbers.** Chip, stakes and outcome read the same effects: a GM is paid the sum the pitch names, a desk budget only what fits under its ceiling (the outcome prints what landed), a recce crew cash only at wallet scale, a planner the gate the pitch names, a permitter the clock-days the queue can take, silviculture a program day per shift.
- **Fallout lands later.** `catch.lagDays` is read: the caught band is the finding, and the determination arrives as its own card on its due day, naming the act and the day (`js/events/fallout.js`). Leftovers settle before the debrief scores. Every catcher now costs money or the role's own work.
- **Consequences stay visible.** Watch flags announce themselves, stand on the mission panel with any determination still due, and worsen later odds on screen. An open FPBC complaint survives a registration renewal. The Campaign carries flags, taken acts and unlanded determinations into the next season and lists the season's shortcuts in its review (`js/events/shortcutRecord.js`).
- **Tone.** No reaction praises a shortcut; the GM's report goes to the audit committee.
- **Presentation.** The card opens `== SHORTCUT · PHONE CALL ==` (FALLOUT for a determination) in the theme's warning colour, the log anchors on it in Classic, Modern and Grid at desktop and phone size, shortcut options carry an OFF-BOOK chip, and a focused Grid option shows its full detail.
- **Cadence and reloads.** The offer chance ramps with quiet days (no more day-7 timer); a GM hears about two offers a year with a four-month cooldown; silviculture contractor calls roll on the day seed.
- **Tests.** `tests/shortcutMechanics.test.mjs`, `tests/e2e/shortcut-card.spec.js`.
## 2026-09-29 — Campaign tiers and seasonal balance (wave 2, F4)

- **One tier decision.** `gradeTier()` in `js/engine/scoring.js` reads one gate table per mode (`SEASONAL_TIER_GATES`, `CAMPAIGN_TIER_GATES`). The seasonal ending, the score cap, the "held back" line, the Year in Review and the service record all use it. The campaign grades the year once (`gradeCampaignYear`) and files that grade, so a capped Mixed year is no longer recorded as a Solid victory.
- **Campaign Outstanding is reachable.** It needs all four deployments delivered and one of two excellence paths. Forest Health now answers the work:
  - planting quality counts only for blocks actually planted;
  - a treated release queue earns +2, and an untreated one costs Forest Health;
  - recon sweeps count against the package target;
  - an approved plan earns credit for its biodiversity.
- **Solid names what fell short**, for example: "Outstanding needs Budget 40+ (you have 36), Compliance 85+ (you have 83)."
- **Budget is value for money.** Each season compares the work delivered with the allowance spent. Spending the allowance on its work is on budget. Shortcut cash is not counted as a saving, and shifts on an empty food box cancel any thrift credit.
- **Completion.** A planning file that clears every gate reads 100%, not 85%. A spring that skipped its fill no longer reads 100%.
- **Reviews add up.**
  - Every "Why this happened" line shows its amount.
  - A meter moved by two causes shows each one.
  - Crisis cards are listed.
  - Each review ends with a season total, and the Year in Review's season lines sum to the trendlines.
  - A save at year end resumes as "Year in Review".
- **Seasonal content.**
  - The FPB audit card now arrives only after a year that gave it something to find, and its copy fits every role and area.
  - Desk roles can log CPD: a "CPD Log Behind" card lands once a year when the log falls behind.
- **Harness.** `js/engine/simulate.js` now scrambles seeds and gives each role and area its own policy stream. Before this, one seed decided the random policy's picks in all 36 combos. The stock silviculture policy in `scripts/simulate-expeditions.mjs` is now the competent policy from `simulate-silviculture-policies.mjs`: 24/24 full length and 12/12 at campaign scale, up from 12/24 and 5/12.
- **Balance.** The comeback window repairs slipping standing from the second season, the steady program pays from a weakest meter of 35, and the Mixed floors sit just above the trust and audit lines. Results from `sim:seasonal` (12,600 years, same harness before and after):

  | Style | Stumbled before → after | Mean tier before → after |
  | --- | --- | --- |
  | random | 54% → 39% | 0.59 → 0.73 |
  | weakest-metric | 18% → 6% | — |
  | greedy | — | 2.13 → 2.06 |
  | aggressive | 100% → 99% | — |

  In `simulate-campaign.mjs` (normal, 9 areas × 6 seeds), careful play reaches Outstanding in 7/54 years and average play in 0/54.

## 2026-09-29 — Integration after the wave-2 merge

- **One set of shortcut numbers.** The offer card, the take option's three bands, the hub text and the classic panel print the engine's own odds (`riskBandOdds`), rounded once by `riskBandPercents` (`js/risk.js`) so clean + noticed + caught is always 100 and matches the engine's `oddsLine`. The controller no longer bisects `resolveRisk` for odds.
- **Priced when shown.** The offer is drawn at the season's start, but the cards before it move the meters. The controller now rebuilds the offer from its act when it comes up, so what the card prints is what the roll applies. The payoff chip shows the tapered gain a high meter actually takes.
- **Final-season fallout.** Merged teasers keep the card id they deliver, so a final-season catch still shows "It lands after the year closes". A non-shortcut choice in the final season no longer promises fallout past the year, because nothing settles it.
- **Provenance.** `describeCardCause` has one path for shortcut fallout: "Because you took: X — your fall shortcut." Who caught it stays in the surface reason.
- **Money.** `formatDollars` prints an overdrawn budget, treasury or cash line as -$858, not $-858.
- **Campaign review.** A failed season no longer reads "the crew was still delivering" or "production stayed high".
- **Browser suite.** The campaign spec's bot looped on the new release confirmation, picking "Choose another method — Back to…" every time, and never reached recon travel. Travel itself was fine: it stops at its named destination and says so. A rounding flake (about 1 run in 100) in the 7.5 km arrival-snap unit test is fixed.
- **Checks.** `npm test` 837/837, Playwright 142/142. Gates: recon, planning, permitting, silviculture and GM 8/8 in every area (72/72 each); silviculture 24/24 at full length; every role 8/8 at campaign scale; GM honest 30/30 on normal. `sim:seasonal` is unchanged from the merge base. `simulate-campaign` good play: 7 Outstanding, 28 Solid, 1 Mixed of 36. The silviculture "release 99% of 260 ha" loss did not reproduce at this head: 270/270 across 9 areas × 30 seeds, and 162/162 in the policy sim.

## 2026-09-29 — Silviculture residuals (wave 3, W3-E)

- **Each outfit works its own contract.** The saw crew no longer plants or fills when the planters are off. That includes the day after a "No planting today" stand-down, when it used to bill $0.32/tree with no holdback. Plant and fill wait for the planters and say until when.
- **Casualties are the person who was hurt** (`fitEventToCrew`).
  - A saw kickback hurts one of the brushing contractor's cutters. That outfit loses productivity; your crew loses nobody.
  - Any other injury names one member of your crew, chosen on the day's dice. It is never the attendant doing the treating, and every band lands on that person.
  - The departure line follows the option: a medevac is flown out, an ETV run goes in the ETV.
  - `js/events/resolution.js` honours `crewEffect.victimId` and `crewEffect.departure`.
  - When a crew role leaves, the day card says what the crew can no longer do and offers "Bring up a replacement …" (a day and $600–$1,400).
  - With your own OFA 3 gone, cards read "the contractor's attendant".
- **Release quotes hold for the day.** The day's release factor is rolled once on the day seed and kept, so backing out and reopening the brush menu quotes the same hectares.
- **Set-aside is never the cheap way out.** When the cheapest answer to an imposed situation takes the day (a washed-out road, a WorkSafeBC tour, a dead radio, a boundary re-run), setting it aside takes the day as well, and the option says so. A storm whose card says nobody works today takes the day whatever the answer. The change is local to `js/modes/silviculture.js` (`setAsideCostsTheDay`); `deferral.js` is untouched.
- **Program facts for shortcut gating.** `getSilvicultureFacts(journey)` in `js/modes/silviculture.js` returns plain values and is safe on any journey:
  - `plantingRemaining`: trees
  - `blocksRemaining`
  - `fillRemaining`
  - `releaseQueueRemaining`: ha
  - `surveysRemaining`
  - `seedlingsOnHand`
  - `plantersOnStandDown`
  - `surveyorOnCrew`
  - `accreditedSurveyor`: your crew or a contractor
  - `firstAidAttendant`
  - `sprayClosed`

  Example: `onlyWhen: (j) => getSilvicultureFacts(j).plantingRemaining > 0`.
- **Contractor calls.**
  - An upgraded camp stays upgraded.
  - An inspection or upgrade stops sickness calls for ten days.
  - Stand-downs come only for an outfit with work left.
  - "Keep them on the block" states a 25% chance that someone is hurt, and applies it: scrutiny +6 and compliance −4. Compliance now actually lands on the standing ledger; before, it landed nowhere.
  - The split-crew call and its answer describe the same deal.
- **Smaller fixes.**
  - A release that eats into money reserved for planting, fill and surveys says so before you send the crews.
  - Meetings and briefings print the numbers they move.
  - Fill stays on the card on plot days, with the reason it waits.
  - Milestones say "by weight".
  - The release line reads "VI-34 (2014): 23 of 38 ha".
  - The doubled colon in the plot line is gone, and so are the "0 available" counts.
  - Novelty legacy cards (TikTok, a celebrity, first contact) stay out of the program.
- **Checks.**
  - `simulate-silviculture-policies` across 9 areas × 3 difficulties × 6 seeds, before → after:
    - competent 162/162 → 162/162 (mean 99.7)
    - honest 162/162 → 162/162
    - neglect 0 → 0
    - fraud 0 → 0
  - Tests: `tests/silvicultureRound3.test.mjs`.
## 2026-09-29 — Shortcut cost honesty and consequences (wave 3, W3-A)

- **One projection, one set of numbers.** `projectAppliedEffects` (`js/events/resolution.js`) turns authored effects into what lands: a compliance loss adds 1.5× to scrutiny, a relationship loss a third; on a permitting desk compliance moves goodwill one for one; a desk's reputation lands on relationships. `applyEventEffects` applies that projection and `describeEffectChips` prints it, so a determination priced "-10 compliance, +15 scrutiny" reads and lands as "+30 scrutiny, -10 goodwill". The stakes line now names the clean band's scrutiny, the +5 finding on the day of a catch, and the files a catch opens; the go-around set-aside says what silence costs (-2 compliance, +6 scrutiny). `tests/shortcutHonesty.test.mjs` checks chip = applied for every band of every act for every role.
- **A catch costs the grade.** `scoreIntegrityPenalty` now charges every role per caught shortcut (12 serious, 8 core, 4 grey/comic), landed in season or settled at the debrief; silviculture keeps its ledger. Desk determinations are capped at five days so a file closed early meets them in season. Sim (3 areas × 8 seeds, normal): take-all vs refuse-all planning 90.5 vs 97.4 (was 93.6), permitting 93.9 vs 99.3 (was 96.5, all A), GM 90 vs 95.1; a clean take still pays in the role's currency.
- **Serious catches cost more than they pay.** For acts at the serious floor the determination takes back 1.5× the money and all the work the shortcut paid (a $12,000 buried spill is an $18,000 finding).
- **Each institution's own watch.** `TEMPTATION_WATCH_FLAGS`: a DFO finding sets `dfo_watching` ("DFO is watching the crossings"), not the C&E watch; only the institution that would catch an act reads that act closely (+0.20 caught), any other watch +0.05 noticed. An FPBC complaint file is decided after eight days: the registration can then be renewed and FPBC keeps watching. Permitting no longer calls Renew Registration the "Best move" while the file is open, and says when it is decided.
- **Planner payoffs fit the gate.** A gate at 100 cannot be paid; the payoff falls to the gate the plan is on, capped at the room left, or to time back on the file.
- **Campaign carry-forward** reconciles the log before collecting a season, so the last shortcut of a season counts in later odds.
- **Silviculture close check** reads only records somebody noticed, at the act's own caught odds, on the day's dice; a clean take stays buried. Take-all silviculture: 46.2 → 69.9 mean, honest 97.4.
- **Seasonal.** A noticed take sets `watched:<institution>` and opens no chained issue (unlinked audit cards after noticed-only years: 48 → 1 in 720 years); a shortcut's fallout keeps its own pending entry and provenance beside another source's card, so it is dealt with "Because you took" or settled at year end; the offer prints why the odds moved.
## 2026-09-29 — W3-B: shortcut placement, premises and payoffs

- **Premises.** An act's `onlyWhen` names what its pitch is about (`ACT_PREMISES` in `js/data/illegalActs.js`): planting still owed, planters not on days off, a planted block waiting on plots, release or free-growing still owed, the FOM out for comment, a permit ahead of or out on referral, relations bad enough for a blockade. `actMatchesTemptationContext` reads them per run (a run that does not keep the subject is not gated), and a set-aside re-offer whose premise is gone is dropped. No more cash for planters after planting, buried boxes after the fill, or buried FOM comments after they were answered.
- **Stops.** Block-ground acts (by category, or an act's own `stopKinds`) stay off waypoints whatever their phase, and off a block whose package is closed; the Elder card and "Old Ribbon" follow the same rule. Recon is not offered ground on the next leg at the last open block, and a planner is not paid in a gate already met.
- **Who is asked.** The GM no longer hears registrant, consultant or planting-crew acts; its own acts are corporate, harvest or haul, and the five `recce-` ids are renamed (old ids still resolve). The woodlot, community-forest and "(Ret)" acts are retired; the appraisal and carbon-dashboard acts leave the planner; the seed-variance act is the Island silviculture forester's; the fire-claim act waits for fire season; knapweed stays in the Interior.
- **Payoffs.** Poaching pays a grocery run, not $300; the WTP card no longer offers a bonus it never charges; the blockade's clean band is no longer filmed; plate swapping is an RCMP file; old-growth theft, scaler and salvage payoffs sit at or under what the catch costs.
- **Tests.** `tests/illegalActsContent.test.mjs`: premise vocabulary, a true/false state matrix for every premise across roles, areas and seasons, the named playtest cases, waypoint/closed-package/final-block stop checks, and GM and planner fit.
## 2026-09-29 — Wave 3: General Manager (W3-C)

- **Ledger hooks follow the band.** A hook lands only on the band whose outcome the player read (`js/modes/manager.js` `LEDGER_HOOKS`, `shownBand`). A lost BCTS bid, a refused export permit, a failed surplus test and a counter read as bad faith book nothing. Mediation's curtailment lands only when the processor is pulled. Chips say both sides: "ledger if it lands: …; if not: …".
- **A card's operations are this month's wood.** Generic `progress` on a GM card no longer moves the ops meter, which scaled the whole licence's run rate (one +8 was +18,424 m³). It becomes ±250 m³ a point on this month's deliveries, capped at 2,500 m³, and shows on the chip, the "Ledger:" line and the Delivered line. A shortcut's operations are paid as margin at today's rate, so the gain chip, the stakes and the applied budget agree, and the resolver's progress-scrutiny coupling no longer fires for the GM. Strategic decisions that move the ops meter print what they do to December's projection, and the discretionary-spend options show their meter numbers.
- **Resignations.** When the poaching card's text says the woodlands manager leaves, the seat goes to an acting successor, who carries the posture on the pane, in the quarterly lines and in the epilogue. A generic card's "someone leaves" no longer empties a random executive seat.
- **Shortcuts the GM cannot be asked.** "Wear Every Hat", "Drop the (Ret)" and "Drop a Tree Near the Blockade" are struck from the GM's draw. No blockade exists in a GM year. The act data is untouched.
- **Honesty margin.** Board answers are tabled and printed (for example "Reputation +4 -> 54, political capital -2 -> 62, scrutiny +12 -> 48%"). Spin costs more scrutiny: +6 on a sound quarter, +12 on a weak one, +3 for a polished deck. A restated quarter also puts compliance -3 and scrutiny +8 on the file.
- **Certification is a trade-off.** Premiums are now $0.50, $1 and $2/m³, and annual costs $60k, $90k and $120k (the system plus audits) (`certifications.json`, GM-only). A standard costs more than it earns in the year it is booked. Skipping keeps more cash and avoids audits; certifying earns the grade and reputation.
- **Sims** (`simulate-manager.mjs`, 30 seeds; median score, median treasury; before → after):

  | Style | Normal | Hard |
  | --- | --- | --- |
  | competent | 100, $1.50M → 100, $1.27M | 100, $1.14M → 100, $0.97M |
  | honest | 94 → 95 | 95 → 95 |
  | spin | 93 → 90 | 93 → 90 |
  | reckless | 41, 0/30 → 38, 0/30 | 41, 1/30 → 37, 0/30 |

  Competent vs. the same play with every board spun: 100 vs 96 → 100 vs 92 on normal, and 100 vs 97 → 100 vs 94 on hard. Spin still wins 30/30. Competent with no certificate grades 98 against SFI's 100, and ends $60k richer.
## 2026-09-29 — Wave 3: recon residuals (W3-F1)

- **Shop.** A part-load "Full restock" is billed its share of the $700 bundle, not full price, and leaves the shelf when fewer than two of its lines would land. Rows keep their number for the whole visit; an item that stops fitting or that the card can no longer cover stays in place, disabled with the reason.
- **Storm follow-up.** A card that is weather (`arrivesAsWeather: "storm"`, `js/events/scheduled.js`) sets the day's sky, so "Major Storm Hits" grounds the shift and its options read "storm holds the crew in camp". The warning that schedules it is traverse-only. Sudden Storm stays out of winter. Day 1 rolls the role's season, and a summer pass no longer freezes.
- **Cards fit the stop.** Layout cards (the Elder's CMTs, old ribbon, eagle nest, unmapped creek, survey pins and others) carry `needsOpenPackage` and fit only a cutblock whose package is open. At the last stop, a card's next-leg km and delay come off (`fitEventToRemainingRoute`), and road-ahead cards (`needsNextLeg`) are not dealt. "Send out your sick crew member" is not offered when nobody is sick.
- **Gambles.** An option with odds names its bad band on the chip ("if it goes wrong: -100 L fuel, -14% equip, -$300"). A hidden outcome names the money it can cost.
- **Grade.** Recon Time is measured against the clean run. Crew welfare starts at 100 and takes off evacuations, quits, logged injuries and wear. A crew that drove out when the food ran out counts as gone. An undelivered season is capped: F under half its packages, D otherwise. Results:
  - Careful 25-shift Tahltan fixture: A 99 → 91.
  - Flawless: 100.
  - Idle starve-out: D 50 → F.
  - `sim:expeditions --role recon --area all --difficulty all --compare --runs 12` (new flags), mean grade before → after:

    | Policy | Easy | Normal | Hard |
    | --- | --- | --- | --- |
    | careful | 95 → 93 | 90 → 90 | 78 → 74 |
    | competent | 85 → 83 | 84 → 81 | 80 → 76 |
    | idle | 30 → 26 | 31 → 25 | 29 → 26 |

  - Competent hard wins at 24 runs: 199/216 → 202/216.
- **Epilogues.** Lines come from each member's role, condition and the attendant's call count, and no two crew get the same line. A walked-off crew gets walk-off lines.
- **Road.** The old spur around a slide is the day's slow leg; before, it covered nothing and also slowed the next leg. "Turn back and report" slows the reopened leg by a quarter, not three quarters.
- **Copy.**
  - A road leg is "Covered N km of road".
  - A hungry stand-down is not recovery, and fog is not a "good road".
  - Bridge and culvert gauges have their own lines.
  - Endings say how many shifts were left instead of "as summer settled in".
  - CMTs are not redcedar in the north, and the fuel dump drains to waste drums.
  - A fistfight is an incident report.
  - Assorted title and duration contradictions are fixed.
## 2026-09-29 — Wave 3: planner and permitter residuals (W3-F2)

- **The District Manager's own conditions.** A plan is not signed at scrutiny 75% or more, or while a regulator's open file on one of its shortcuts has not landed. Both show on the mission checklist, in the guidance and in the blocked submission. A District Compliance Review (a day, $900) takes scrutiny down 12.
- **Closing on conduct.** `summarizeDeskConduct` / `rateDeskConduct` (`js/scoring.js`) read the run's off-book calls, catches, scrutiny, goodwill and report. The epilogue, the approval narratives and a desk integrity charge (noticed -3, caught -8, cap 20) follow them, not stress alone.
- **Heritage permits.** No District Manager event signs an HCA permit, an issued one releases its CP (no "(Day ?)"), and letters are filtered by permit type (HCA permits get an archaeological-assessment letter, never a VIA).
- **Desk cards.** No card twice in one run; phone shortcuts are declined by phone; permit-desk chips carry compliance's goodwill; morale chips on a desk read as stress; ten-minute answers do not "cut into the day"; desk copy stops claiming days and crews; cards read ON YOUR DESK; unlawful answers on ordinary cards are OFF-BOOK; the FPB reports, it does not decide penalties; one energy meter.
- **Set-aside.** On a desk it costs the cheapest lawful answer in full (minor cards too), never the off-book one.
- **Permit season.** 16 desk days for 15 permits (Greenhorn 19), every permit needed by the deadline; Old Growth reads files harder. `simulate-expeditions.mjs --difficulty all --compare` (new `shortcuts` policy: competent play plus every OFF-BOOK option), 12 seeds × 9 areas, win % before → after:

  | Permitter | Greenhorn | Journeyman | Old Growth |
  | --- | --- | --- | --- |
  | competent | 100 → 98 | 100 → 83 | 97 → 65 |
  | shortcuts | 100 → 99 (grade 97 → 88) | 99 → 84 (97 → 75) | 97 → 66 (96 → 59) |
  | reckless | 78 → 31 | 44 → 6 | 20 → 5 |

  Planner Journeyman: competent 100 → 100, shortcuts 92 → 89 (grade 91 → 79), reckless 0 → 0.
## 2026-09-29 — Wave 3: seasonal engine and campaign

- **CPD reminder.** It no longer takes the summer contested call. A season kept to the standards (no aggressive stance on the planned work, no shortcut) logs its share of the 30-hour FPBC year, so careful desk and field years keep pace. The "CPD Log Behind" card comes once a year, only when the log is more than a season behind. It is an extra card after the season's own (`CALENDAR_REMINDERS`), never an issue draw. It was in 100% of years; now it is in 6–9% (the pushed ones). Round 2 now deals 48 distinct issues, up from 2. The summer-only heat dome, herbicide drift, camp flooding and beetle escalation cards are all dealt again. `lint:seasonal` checks calendar cards and that no round-end pass queues into an issue slot, and a matrix test covers every one-season issue.
- **No repeats in a year.** The seasonal deal keeps a per-year memory of the issues and events already answered. Scheduled follow-ups, including shortcut fallout, are exempt. Years with a repeated issue fell from 16–30% to under 1%.
- **Recoveries credit what the season did.** The documentation rebound needs compliance work that season. The comeback window says whether the calls went into the meter; in a campaign it pays only for that work. A campaign season that fell short gets no dividend and no steady-program top-up, and neither does any season with a noticed or caught shortcut. A season that fell short earns no thrift credit for unspent allowance.
- **Hard fall file.** On hard, the fall planning allowance is the normal allowance plus a contingency (`HARD_FALL_ALLOWANCE`). Careful play now clears the hard fall in 93% of runs, up from 48%, and careless play still fails it.
- **Copy and odds.** The desk "rate you" odds line now names the district goodwill it reads and its value. The joke cards appear in about 3% of field years, down from 7–10%.
- **Leftovers.**
  - Evacuated crew are no longer hit by the pace and the weather.
  - The fish-passage and smoke-hold cards reach the coast and the Okanagan.
  - The dead seasonal comic gate is gone.
  - Both eslint warnings are fixed.
## 2026-09-29 — Wave 3: UI and renderer residuals

- **Modern budget.** The sidebar reads what is left of the run's own starting budget, not a fixed $10,000 (a GM opened at 8500%).
- **Grid on a phone.** An OFF-BOOK option takes two taps: the first opens its whole detail with "Tap again to take it." Mission facts and checklist lines wrap instead of losing their tail.
- **Short log panes.** Every day card anchors the log on its first line, so the event's name is not under the Trail View. While a shortcut or fallout card is up, the picture folds to its bar so the pitch and odds get the room.
- **Fallout, display side.** "Answer for it" is a TRADEOFF, not RISKY. A late catch states the capped delay the queue applies. Budget chips are abbreviated only when exact. A fine bigger than the purse says what it will actually take.
- **Leave prompts.** Campaign and Seasonal default to Keep Playing, like the expedition.
- **Settings in-game.** Classic and Grid have a Settings button and the O key; Help links to it. Crisis from the landing files its career tree, and `tui.html` wears the Settings theme.
- **Smaller fixes.** Intel role cards no longer repeat, acronym tags are upper case, and the search box no longer autofocuses on touch. Summer has no freeze-up or heavy snow.
## 2026-09-29 — Campaign bot loop and silent no-ops

- **Campaign spec.** The day-13 "free-growing survey does nothing" loop was the bot, not the game. It filtered the disabled Brush row ("Waits for Northern Regen Co, on days off until day 14.") out of its labels but clicked by index into the unfiltered buttons, so it clicked the disabled row every pass. It now clicks the button it picked, and the matrix script skips disabled rows. The survey itself passes FS-29 when chosen.
- **Silviculture refusals stay on screen.** A task, meeting or rotation that cannot go once chosen keeps its reason on its own row, disabled, for the rest of the day, instead of printing a line the redraw wiped and offering the same no-op again. A replacement the program cannot pay for is disabled on the card with the figures.
- **No silent no-op test.** Every enabled option on silviculture and recon day cards is chosen across areas, days, stressed setups and state changes between card and call; each must spend the day, change the state, or leave its reason visible. Recon, planning, permitting and GM already acknowledge or gate their refusals.
## 2026-09-30 — Round-4 audit fixes (N-1 to N-11)

- **Old Growth recon** counts its extra trouble once, on the day gate (1.15), not again on the card roll; the careful sim policy answers with the safe line. Careful hard wins 56% → 86% (648 runs; 92% on the repo sim's seeds), competent 94% → 97–99%.
- **GM stop-works.** A partly or badly wrong card that costs serious operations stops the work (50% of plan for 2–3 months), and an operations card left with the division stops it for a quarter (30%). Both are printed on the chip or set-aside line, in the monthly ledger, on the panel and in the projection. Random GM wins 100/93/85% → 77/61/45% (216 years a cell; the matrix harness 100/100/93 → 83/61/37); competent and honest 99.5–100%.
- **Shortcut honesty.** The noticed band's stakes project the band whole (+12 scrutiny, not +11, for a payoff over six points of work). A planner's compliance prints as professional standing at the size it lands. Silviculture cards say a noticed record is read again at season close, at the printed odds. A rested planner is not promised time back.
- **Campaign.** A delivered season can use the comeback window again, and only a caught shortcut withholds the dividends. Average years stumbled 22/37/35% → 9/19/20%, Mixed is now the modal tier, careful tiers are unchanged, and terrible and idle years still stumble. The hard fall allowance is now equal to normal instead of 12% above it.
- **Saves and dead content.** An old open FPBC file gets its review clock. An old catch-all C&E watch is remapped to the institution that noticed. The blockade act is retired, and the GM unfit list, the unused mischief options and `getRoleTasks` are removed. The CPD reminder test is now bounded per strategy across three seed bases.
