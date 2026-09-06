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
