# BC Forestry Simulator

A rebuilt, choice-driven forestry operations simulator grounded in northern British Columbia BEC zones. Pick the type of forester you want to be, choose a northern operating area, and shepherd an integrated year of work. Every season you complete core duties for your specialization and react to a contextual issue drawn from an event library that considers both your role and the selected landscape.

## Play in the browser

Open `index.html` in your browser to launch the retro terminal interface. Tap the on-screen buttons or type numbers/labels to answer prompts — the layout is fully mobile friendly. Press `ESC` at any time to restart with a different combination of role and operating area.

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
