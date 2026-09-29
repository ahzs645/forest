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
