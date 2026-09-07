# Forester realism pass — 7 September 2026

This pass reviewed every part of the game the way a practising BC forester (RPF/RFT) would, in the office or in the field, and rebuilt the parts that would not survive that read. The illegal shortcuts stay: they are now offered by a named person, in the right role and season, with a payoff in the role's own currency and a catcher who really exists.

## How it was reviewed

Six independent audits read the code and generated transcripts for each role: recon, planning and permitting, silviculture and manager, the seasonal strategy game and campaign, the 208-act shortcut library, and the cross-cutting copy (units, institutions, glossary, scoring). Their findings were consolidated into six implementation workstreams with file ownership, built in parallel, merged, and re-verified against the simulators and the browser suites.

## Decisions applied everywhere

- The player is licensee-side. The District Manager approves FSPs and issues cutting and road permits; a Forest Operations Map is published for a comment period, not approved. There is no minister, cabinet or "ministerial confidence".
- Institutions are the real ones: Compliance and Enforcement natural resource officers inspect, the Forest Practices Board audits, Forest Professionals BC disciplines registrants, WorkSafeBC issues orders, BC Wildfire Service, the Conservation Officer Service, ENV, DFO, the Archaeology Branch, Timber Pricing and Revenue Branch each catch what they actually catch. "Ministry auditors", "safety inspectors from district" and "compliance officers" are gone.
- Units are metric: litres, kilometres, hectares, stems per hectare, degrees Celsius.
- Nobody dies. The worst crew outcome is a medevac and "off the crew for the season", with WorkSafeBC notified.
- The field crew is a layout crew (layout tech, timber cruiser, compassman, driver-swamper, OFA 3 attendant), and the silviculture crew is a checker, an accredited surveyor, an OFA 3 attendant and a driver. Crew role ids are unchanged so saves and odds predicates keep working.
- The campaign year runs in a forester's order: spring planting, summer layout, fall planning file, winter permitting push.
- Every option either uses the day or is a brief response, and the follow-up copy agrees with that.

## What changed, by area

### Recon Crew Lead
- Stops are blocks or waypoints. Only blocks carry an assessment package; a package is road and crossing notes on arrival, a boundary shift (ribbon, stream classification with S-class and RMA width, terrain and soils, danger trees) and a WTP/wildlife/cultural heritage sweep. Every area has four to six named blocks.
- Water crossings have modes: ford, bridge, ferry and culvert. Nobody walks a crew into a flood-stage channel; bridges are inspected and crossed one truck at a time; ferries wait for the window; culverts are walked and turned back from when undercut.
- The access verdict separates today's access from the development recommendation and no longer treats moose, caribou, visual quality or cultural protocol as road hazards.
- Fuel is in litres with a real price. The daily "fuel scavenging" invoice is gone; a fuel run and a grocery run are camp actions. The ration cache is one crate per cache.
- Injuries follow the outcome band, evacuation actually removes the person, route mishaps scale to the risk taken, and a finished traverse cannot be lost on the same shift.
- A crew without an OFA 3 attendant cannot work more than twenty minutes from hospital; it drives for a replacement instead.
- Spring applies breakup travel speed and road wear; a washout is reported to the road permit holder and worked around, not "cleared" by the crew.

### Strategic Planner
- The product is the licensee's FSP and first FOM, decided by the District Manager. Phases are Inventory & Data, Analysis & Draft Plan, Engagement & Public Review, District Manager Decision.
- The FOM comment period is mandatory; a pre-submission meeting with the district can only bring readiness within reach, and Prepare Submission (which checks the FOM, the water gate, the road file and registration) carries the last points.
- Compliance events no longer raise the decision-maker's confidence and relationship gestures no longer complete the engagement phase. Events carry explicit `data`, `analysis` and `buyIn` effects.
- The cutblock decision runs once, after the inventory, and picks a lead block set for the first FOM. "FN 22" became a heritage/referral load; reserve proximity is gone.
- CPD is no longer earned by doing your job and does not block a submission.

### Permitting Specialist
- The queue is named files (CP 52/953-98, RP Blackwater spur, RUP, SUP camp, HCA permit) in lanes with clocks: completeness screen, First Nations referral on the season's referral window, WSA s.11 notification, Archaeology Branch hold, District Manager decision. Permits are issued when their clock expires and their deficiencies are clear.
- Deficiency letters name the file and the actual gap (fish-stream culvert sizing, community watershed sediment memo, VQO renders, Exhibit A deactivation intent, referral response outstanding).
- "Process Permits" works the queue (draft, submit, chase the nearest clock) and disappears when only letters are left.

### Silviculture Supervisor
- The program runs five vintages at once: plant this year's blocks, walk quality plots the next morning (payment holdback rides on them), fill plant last year's openings that fell below minimum stocking, release the 2–5 year old stands, and survey the 8–15 year old openings for free growing.
- Surveys report against a stocking standard derived from the BEC zone: well-spaced stems per hectare against the MSS, percent of plots free growing, the competition ratio, and a prescription on failure. Surveys need an accredited surveyor.
- Contractors carry planters, a per-tree price, quality and holdback, and certifications; brushing offers manual saw crews, glyphosate under a Pest Management Plan (with the pesticide-free zone and the community reaction) or grazing where the area allows.
- Block lines carry zone, area, species mix, density and stock type.

### General Manager
- The year opens with an operating posture set with the woodlands team, not by hiring a CEO. A monthly ledger delivers cubic metres against the AAC at a log price less stumpage and logging costs, with overhead, certification cost and premium, quarterly board reviews and a year-end cut-control statement.
- Six new manager desk events: mill curtailment, BCTS bid, softwood duty deposit, First Nations revenue sharing, contractor rate renegotiation, log export permit. Certifications are SFI, CSA Z809 (PEFC-endorsed) and FSC.

### Shortcut temptations
- All 220 acts now carry a proposer, a first-person pitch, a phase, a tier (core, grey, comic), a category, a payoff in the role's currency and a catcher with a lag. Comic acts (Bigfoot and friends) stay, at about one in seven offers and never on hard difficulty.
- Recon only sees layout-phase acts; the General Manager only sees manager-tagged ones. Sixteen new acts cover the things a BC forester would recognise: signing a free-growing survey you did not walk, calling an S3 an S4, backdating the site plan, counting plots twice, reporting a block planted in RESULTS before it is, running without the ETV, working through a high-hazard shutdown, hauling on a closed road at breakup.
- Saying no is brief and free. Setting a proposal aside costs nothing; the proposer may drop it, come back with a sharper pitch, or go around you, which raises the harder question of whether to report something you did not do.
- Being caught names the institution and its process, and leaves a flag that shifts the odds on later gambles. Declining never counts against you.

### Seasonal strategy and shared data
- Issues carry an area allowlist; a Smithers turbidity advisory no longer fires in the Okanagan, and assignment cards no longer carry the previous season's context.
- Operating areas carry corrected subzones and species (Fraser Plateau SBSdw2, Okanagan IDFxh1, Kootenay ICHmw2, Skeena CWHws1, Fort St. John BWBSmw; white spruce, not cedar, at Tahltan; Gitlax̱t'aamiks; the Sinixt in the Kootenays).
- Glossary entries for free growing, riparian reserves, referrals, consultation, hazard abatement, cutting permits and the AAC were rewritten.
- The expedition score no longer penalises carrying spare fuel or rewards having more incidents; it counts situations closed clean.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 483 unit tests pass (359 before the pass) |
| `npm run lint:events`, `npm run lint:seasonal`, `npx eslint .` | clean |
| Expedition simulator, 8 runs per role, campaign and full scale | recon 8/8 and 8/8 (full scale was 3/8), planning 8/8 and 8/8, permitting 8/8 and 8/8, silviculture 8/8 and 8/8, manager 6/8 |
| Seasonal simulator | Outstanding stays under a tenth of runs; the balanced-strategy tier spread is 0/60/46/2 |
| Playwright, desktop and mobile projects | 112 desktop and 2 mobile tests pass on the final tree |

## Limits and follow-ups

- The seasonal strategy game's scripted "balanced" policy now finds silviculture at Fraser Plateau harder than before (cautious and weakest-metric play do as well or better). That is a policy artefact worth a look in a later balance pass.
- The full-scale recon deadline has slack now that the crew no longer dies; it could be tightened from 40 to about 34 days.
- Manager temptations use the corporate profile but not manager-specific caught outcomes yet.
- The game still compresses referral windows, contractor economics and survey work into single days. This pass makes the compression honest; it does not replace it with a professional model.
