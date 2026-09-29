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
- **Sims:** `node scripts/simulate-expeditions.mjs --role planning --area all --compare` (also for `permitting`). Competent play grades about 98–100; reckless play grades 38–65 in every area. Competent planning still cannot win the three southern areas until they have planning block data.
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
