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
