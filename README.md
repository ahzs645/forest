# Forestry Simulator

This repository contains text-based games in a retro "faux terminal" style.

- **Web game** – open `index.html` in a browser or deploy to GitHub Pages. The page shows a terminal where you type commands. The `trailDemo.js` script provides a short retro intro with simple screen swipe animations.
- **Command line prototype** – run `python3 forestry_game.py` if you want to try the older console version.

Gameplay now includes multiple planning phases: drafting the Forest Stewardship Plan, early consultation, old‑growth decisions, vegetation control, wildfire actions, heritage assessments, weather planning, species selection and new options for site preparation and crew training. The `docs/BC_interior_context.md` file provides background on provincial requirements, First Nations engagement and industry issues that inspired the game design.

To publish the game on GitHub Pages just push changes to the `work` branch. The included workflow (`.github/workflows/pages.yml`) uploads the repository as a static site each time you push.

## What’s New
- Weather system each quarter that modifies harvest output and safety risk.
- Special quarterly scenarios: labor strike, supply chain disruption, invasive species, community outreach opportunity.
- Auto Play mode for quick simulations without manual input.

## Using Auto Play
1. Open `index.html` in a browser.
2. Click the gear icon to open Settings.
3. Toggle `Enable Auto Play`.
4. Use the `Run 1 Year`, `Run 3 Years`, or `Run 10 Quarters` buttons to simulate multiple quarters automatically.

## CLI Mode (headless)
Run automated simulations from the terminal:

```
node cli.mjs --runs 3 --quarters 16 --profile balanced
```

- `--runs`: number of separate simulations
- `--quarters`: max quarters per simulation
- `--profile`: `balanced` | `aggressive` (influences auto decisions)
 - `--step`: interactive, step-by-step CLI playthrough (prompts for each choice and pauses between quarters)
