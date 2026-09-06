# Manual campaign playthrough

Reviewed the local build at `991a9fe` on 2026-09-04 (Vancouver), using the visible browser interface. No game state was injected and no saves were edited. Routine acknowledgement buttons were advanced with UI helpers; substantive decisions were made from the displayed situation. This is one qualitative playthrough, not a win-rate estimate or a review of every region and standalone role.

## Result

Fraser Plateau Uplands, Journeyman difficulty, crew name **Plateau Crew**. Completed all four deployments and reached **Year in Review → Mixed**, with **3/4 deployments delivered**. No crash, stuck screen, or reload was needed.

| Season | Deployment | Observed result |
| --- | --- | --- |
| Spring | Recon Traverse | All 6 packages finalized on shift 22; 2 days remained before closeout. |
| Summer | Silviculture Program | Fell short at 80% overall; completed 2/2 surveys but missed the 3-block planting target. Continued into fall. |
| Fall | Planning File | Ministry approval after the day-22 action, with 4 days shown remaining; review scored objective completion at 86%. |
| Winter | Permitting Push | Reached 12/12 approvals after day 19; the next-day button opened the season review. |

Final meters: Progress **89**, Forest Health **54**, Relationships **54**, Compliance **57**, Budget **45**.

The campaign is playable end to end. Its seasonal arc, recoverable failure, and carry-forward field findings make sense. The weak point is consistency: the action text, time cost, resource model, and subsequent narration often describe different things.

## Highest-priority corrections

### 1. Dismissing an event can erase a physical obstruction

**Spring, shift 3:** “Road Washed Out” said the road had collapsed into a creek and there was “No way through.” Choosing **Set it aside** added scrutiny, restored the normal work menu, and allowed **Move on to Blackwater Road → Stay Mainline**. Travel then covered 9.5 km without resolving that washout. The new card also claimed the radio had been quiet through breakfast, immediately after the radio warning.

**Why this matters:** The player learns that ignoring the situation changes physical reality. The useful ability to defer a phone call is being applied to obstacles that must persist.

**Fix:** Separate deferrable requests from persistent route conditions. Deferring a washout response should leave the closure active and expose an alternative route or work at the current location. Preserve the day's event context when returning to the action menu.

Code starting point: `js/journey/daySituation.js:94` adds the generic dismissal option; its dismissal path only applies scrutiny/human costs. The field travel path must also consult persistent constraints.

### 2. Travel skips the destination named by the choice, and delays move the crew backward

**Spring, shift 6 → 7:** “Move on to Blackwater Road” carried the crew past Blackwater into Old Burn Edge. The missed block then required notebook catch-up.

**Shift 16:** “Move on to Pine Plantation Corridor” passed Pine and arrived at Dry Creek Gully in one action. The travel result said 12.5 km, despite only roughly 7 km remaining in the whole route.

**Shift 17 → 18:** At Dry Creek, **Supplies Lost → Secure remaining cargo** described stopping to re-tie the load. Its -1 km effect moved the crew back to Pine Plantation. Returning to Dry Creek triggered another crossing of the same creek.

**Fix:** Either stop at the named destination or explicitly offer a full-day traverse that may pass several blocks. Report actual distance gained after clamping. Model delay as time or reduced future travel, reserving negative position changes for an explicit decision to turn back.

Code starting points: `js/modes/recon.js:542` names the next block; `js/journey/fieldMechanics.js:835` adds the whole day's distance; `js/journey/blockNav.js:45` advances through every crossed block. `js/events/resolution.js:442` subtracts generic progress directly from position and resynchronizes the current block.

### 3. The player cannot reliably predict whether a choice uses the day

**Spring, shift 5:** **Skip the Archaeology Ladder → Refuse and keep it clean** advertised +2 morale and no time cost, but ended the shift. Its acknowledgement said to return to the shift.

Other apparently brief choices also consumed a whole day. In fall, **Media Inquiry → Provide a written statement only** advertised -1h, then advanced the day without allowing file work. Conversely, some substantial events allowed normal work afterward.

**Fix:** Show the actual time contract on every option: “brief response; work continues” or “uses this shift.” Decide time cost per response, rather than solely from the event's severity. Make acknowledgement wording match the next screen.

Code starting points: `js/journey/daySituation.js:31` classifies whole-day cost by event severity. `js/modes/recon.js:316` promises to return to the shift even when the action ends it.

### 4. Summer's briefing and contractor presentation contradict the actual work rules

The summer briefing says **“Planting windows are open”**. The first work option says **“Plant Block (reduced efficiency)”**, and the outcome warns **“Off-season planting reduced efficiency.”** The player has just been assigned this season and cannot choose a different calendar window.

On **summer day 4**, the card said **“NOBODY ON THE GROUND”** and **“The program does not move until a crew is on it.”** The roster showed 0 deployed, 2 ready, 1 recovering. Clicking Plant Block nevertheless planted **4,878 seedlings**. Day 6 repeated the contradiction with **5,222 seedlings**. Spending day 5 deploying Northern did not produce a visibly deployed crew at the next morning's action screen.

**Diagnosis:** Task execution can automatically deploy ready contractors, while choice summaries explicitly inspect contractors without deploying them. Planting also has a productivity fallback when no contractor is selected. This is not enough evidence to say every observed seedling was produced without workers; it is firm evidence that the UI misdescribes how staffing works.

**Fix:** Explain and preview automatic deployment, including the selected crew and expected output, or require deployment consistently. Do not say work is impossible when the action can staff itself. Align the campaign's seasonal assignment, briefing, and efficiency explanation; if heat is an intended constraint, describe it before planting.

Code starting points: `js/game/campaign.js:49`, `js/season.js:79`, `js/modes/silviculture.js:319`, `js/modes/silviculture.js:1350`, `js/modes/silviculture.js:1397`, and the fallback at `js/modes/silviculture.js:695`.

### 5. Generic progress effects produce unrelated consequences

**Fall, day 11:** **GIS Data Corrupted → Rebuild from field notes** said the data was reconstructed and two days were lost. Its mechanical consequence was **Stakeholder buy-in -15%**. Data completeness and analysis stayed intact. A file repair became a relationship penalty because that was the current planning phase.

**Fix:** Give events explicit, relevant effects. A corrupted data package should affect data readiness or require recovery work. A time loss should not silently target whichever success meter happens to be active.

Code starting point: `js/events/resolution.js:495` translates generic progress into a different metric based on the current planning phase.

## Clarity and pacing problems

| Observation | Suggested correction |
| --- | --- |
| After driving/walking a block to ground-truth access, spring's end-of-shift summary says the crew “stayed in camp.” | Distinguish assessment work from resting and actual camp work. See `js/journey/fieldMechanics.js:842`. |
| Spring shift 4 opens with campfire stories “after a long day,” then returns to a morning breakfast card in the same shift. | Give events a time-of-day context and compose the resulting day's narration around it. |
| Supplies, approvals, days remaining, and checklist progress often lag the current event or result. Winter day 5's event showed 4 approvals while the mission panel still showed 2. | Refresh the shared panels after every state mutation and before each decision, including events and shop purchases. |
| Spring's values sweep prints `cultural_hold`; the final sweep prints `watershed_watch, access_rehab`. | Use the existing human-readable discovery labels in outcomes. |
| Many events repeat the same refuse / shortcut / report template for blatant wrongdoing. Refusing can be more expensive in time than dismissing it. | Reduce their frequency and write more choices between credible competing needs. Make honest refusal a plausible brief response. |
| Winter repeatedly returns “Access engineering note” after a clean response, with no permit identifier or specific new deficiency. | Identify the affected permit, what was fixed, what remains, and whether this is a different file. |
| Winter labels Road Permit File “Best move” while the mission recommends Clean response. Road stages continue to display Screen while outcomes advance map, submit, and maintenance. | Derive the recommendation and stage label from the same active workflow state. |
| Fall repeatedly recommends Ministerial Outreach before submission, while Prepare Submission is already enabled and gives +14 confidence versus +8 from outreach in this run. | Explain the budget/energy/time tradeoff and recommend according to the actual blocker and deadline. |
| Summer survey failure says only “more monitoring needed,” without an actionable reason. | Explain the missing requirement or failed risk check and what improves the next attempt. |
| Summer and winter closeout text reports aggregate completion but gives little detail about the specific unfinished work. | Include achieved/required counts and one or two concrete consequences for the next season. |

## What to preserve

- Four distinct seasons make the campaign feel like a complete year rather than one endless work queue.
- Missing summer's target does not erase spring's success or end the campaign. The Mixed ending reflects the combined result.
- The planning checklist and explicit before/after changes are the clearest feedback in the game.
- Carry-forward findings are visible in later work: spring's assessments improved fall's data, analysis, and stakeholder sessions.
- Food, fuel, and route decisions create understandable pressure in recon. I deliberately resupplied twice and used a winch at the high-water crossing.
- The terminal presentation has a consistent identity. The main usability need is accurate, synchronized information rather than a visual overhaul.

## Recommended next implementation pass

First fix destination handling, persistent hazards, response-specific time costs, and contradictory contractor staffing. Then synchronize panels and give each event consequences that match its story. Finally improve repeated-event variety and the season-end explanations.

Replay this route after those changes, following normal visible guidance. Add focused regression checks for the confirmed behavior: dismissing a closure cannot clear it; securing cargo cannot change location; travel stops at its stated destination or clearly describes otherwise; displayed staffing and actual task staffing agree; an action's displayed time cost matches the day transition.

No game code was changed during this playthrough. The browser was left on the expanded year-end review.
