# BC Forestry Simulator

A rebuilt, choice-driven forestry operations simulator grounded in northern British Columbia BEC zones. Pick the type of forester you want to be, choose a northern operating area, and shepherd an integrated year of work. Every season you complete core duties for your specialization and react to a contextual issue drawn from an event library that considers both your role and the selected landscape.

## Play in the browser

Open `index.html` in your browser to launch the retro terminal interface. Tap the on-screen buttons or type numbers/labels to answer prompts — the layout is fully mobile friendly. Use the top-right **Glossary** button to search forestry jargon, and tap any highlighted in-line term to jump straight to its definition. Hit **Restart** (or press `ESC`) to open a confirmation modal before wiping your run and selecting a new crew.

### Forester specializations

Each role comes with bespoke tasks that appear every season:

- **Strategic Planner** – landscape analysis, values balancing, and integration workshops.
- **Permitting Specialist** – application packaging, referral follow-up, and regulatory tracking.
- **Recon Crew Lead** – field access, cultural feature intelligence, and safety rhythms.
- **Silviculture Supervisor** – planting coordination, regeneration strategy, and monitoring.

### Operating areas

Six northern BC operating areas capture BEC zones, dominant species, and landscape tags used to drive event selection.

- Fort St. John Plateau — BWBSmw1 peatland plateaus and gas interface roads
- Muskwa Foothills — BWBSdk2 permafrost slopes and remote camps
- Bulkley Valley Escarpment — SBSmc2 community interface benches and water intakes
- Fraser Plateau Uplands — SBSwk1 wildfire-prone spruce and beetle legacies
- Skeena-Nass Transition — CWHws2 salmon systems with karst plateaus
- Tahltan Highland — SWBmk glacial headwaters and alpine parklands

### Dynamic issue library

Every season the simulator draws a random issue that matches your specialization and the active operating area tags. Responses adjust five shared metrics — operational progress, forest health, relationships, regulatory confidence, and budget flexibility. Your year-end summary reflects the trade-offs you navigated.

Wildcard mischief, risk plays, and seasonal news flashes keep runs varied. Illegal options now swing between hush-hush wins and investigations, while risk gambles read the room—higher compliance or frayed relationships shift the odds and payout magnitude. At the end of each season the Northern Timber Times prints a headline based on your biggest metric swing to celebrate (or roast) your strategy.

## Command line quick run

A lightweight CLI runner is available for automated playthroughs:

```bash
node cli.mjs --runs 3 --rounds 4 --role planner --area fort-st-john-plateau
```

Options:

- `--runs` Number of simulations to run (default `1`).
- `--rounds` Number of seasons to simulate (default `4`).
- `--role` Optional role ID (defaults to random).
- `--area` Optional operating area ID (defaults to random).
- `--log` Output season summaries for each run.

Each run makes heuristic decisions that prioritise balanced performance.

## Local development

The interactive version is a static site; no build step is required. Open `index.html` directly or serve the folder with any static server. Game content is organized under `js/data/` with dedicated modules for roles, operating areas, and dynamic issues, making it easy to extend forester duties or add new geography.

## Future directions

Curious about where the simulator could head next? Check out [`docs/future_directions.md`](docs/future_directions.md) for a curated list of mechanics, humour, and accessibility enhancements inspired by community feedback.
