# Forestry decision review — 6 September 2026

This pass reviewed the four main expedition roles as forestry work: what the player knows, what action they can take, what evidence that action produces, and what the result means for the next decision.

## Playthrough coverage

- Manually checked the opening recon decisions, notebook shortcut, save/resume, route choice and travel results in an isolated browser at port 5186. The user's expedition at port 5183 was left intact.
- Read a complete seeded campaign-length decision/consequence transcript for recon, planning, permitting and silviculture. These were automated runs through the real day runners, not four manual browser completions.
- Ran eight seeds per role at both campaign and full expedition length: 64 completed simulations, including losses.
- Browser tests cover the four-season campaign through the year-end review, role entry and action flow, the Trail View, phone layouts and the Classic, Modern and ASCII Grid displays.

The simulator now supports `node scripts/simulate-expeditions.mjs --runs 1 --scale campaign --transcript` to make decisions and consequences reviewable instead of reporting only wins.

## Changes

### Field observations must come from fieldwork

The old notebook action marked both access and sensitive-site checks complete, even at the starting camp without prior inspection. It now offers a return field visit only for earlier visited blocks. A visit costs one shift and four fuel, performs one missing check through the normal inspection handler, records the actual access finding and returns to camp without adding traverse progress. Another visit is needed if the sensitive-site check remains open. Unvisited, current and enjoined blocks cannot be signed off through this action; insufficient fuel prevents dispatch.

The saved `field_notebook` action identifier remains compatible. Already completed packages in older saves are retained.

### Tell the player what “unverified” means

The message now reads: “Not checked yet — Choose Work the block to inspect the road and crossing approaches. The map alone does not confirm access.” The action describes observing hazards without entering unsafe ground and states its shift cost. An inspection result is described as a field observation rather than construction or crossing authorization.

Sensitive-site checks now explain the work: locate streams and riparian areas, record recreation and visual concerns, and refer cultural indicators without disturbance. Storm observations carry access/drainage concerns instead of creating a smoke tag.

### Assign work only when a crew can perform it

Silviculture previously offered planting and brushing while every eligible contractor was recovering. Choosing them repeatedly did nothing until the free-action guard ended the day. Unstaffed field tasks are now omitted; the player can rest the crews or use an available survey team for inspection/survey work. The preview names that survey team rather than reporting “no available contractor” for an executable task.

### Separate new planting from older regeneration

The objective, survey description and context now distinguish the new planting program from older stands due for free-growing assessment. Survey findings refer to stocking criteria and an inconclusive assessment no longer implies that retrying immediately makes young trees mature. The generic claim that summer heat improves herbicide effectiveness was removed; the existing seasonal productivity modifier is described as a treatment window.

Planning's stakeholder action describes hearing concerns, recording responses and agreeing follow-up actions instead of “banking buy-in.”

### Start at camp, not half a kilometre before it

Distance scaling was changing the starting camp's zero-distance entry to 0.5 km. That made the first arrival disagree with the displayed leg distance. New routes retain a zero-distance starting camp; tests cover every area and both expedition scales. Existing saves retain their route geometry.

## Results

| Role | Campaign wins | Full expedition wins |
| --- | ---: | ---: |
| Recon | 8/8 | 3/8 |
| Planning | 7/8 | 8/8 |
| Permitting | 8/8 | 8/8 |
| Silviculture | 8/8 | 8/8 |

The full recon route remains substantially harder: the scripted policy lost crews or missed the access-season deadline. The planning campaign loss exhausted its budget. These are balance findings, not evidence of a broken completion path. The policy uses generic fallbacks for authored events, so its win rate is not an expert human benchmark.

Validation: 359 unit tests pass, including new checks for field follow-ups, contractor recovery and first-leg arrival geometry. Production build passes. Targeted lint has no errors and eight existing unused-variable warnings. The final browser run passes all six campaign and role-flow tests, including the four-season year-end review. All 16 Trail View checks passed in the preceding run, covering phone sizes, display modes, pause/hide controls, the plain Continue button and removal of duplicate routine animations. One earlier role smoke assertion expected the old access wording; it was updated and passes in the final run.

## Domain references and limits

BC Forest Safety Council identifies road surface, visibility, maintenance and industrial traffic among resource-road hazards. This informed the access-check wording: [Resource Road Safety](https://www.bcforestsafe.org/transportation/resource-road-safety-2/).

B.C.'s stocking guidance describes free-growing in terms of healthy, suitable trees and competition, and links the establishment-to-free-growing guidance. This informed the distinction between planting and older-stand assessment: [Stocking standards](https://www2.gov.bc.ca/gov/content/industry/forestry/managing-our-forest-resources/silviculture/stocking-standards).

B.C.'s FSP guidance distinguishes resource values, public review, engagement with affected First Nations and archaeological protection. This informed the sensitive-site and consultation wording: [Forest Stewardship Plans](https://www2.gov.bc.ca/gov/content/industry/forestry/managing-our-forest-resources/forest-stewardship-plans).

The game still compresses operational time, staffing, consultation and approvals into meters and daily actions. Silviculture uses aggregate program progress and probabilistic surveys, not individual stand growth or measured survey plots. This pass improves decision coherence; it does not replace those abstractions with a professional forestry model. General Manager and Seasonal Strategy did not receive a new domain audit in this pass.
