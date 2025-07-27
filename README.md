# Forestry Simulator

This repository contains text-based games in a retro "faux terminal" style.

- **Web game** – open `index.html` in a browser or deploy to GitHub Pages. The page shows a terminal where you type commands. The `trailDemo.js` script provides a short retro intro with simple screen swipe animations.
- **Command line prototype** – run `python3 forestry_game.py` if you want to try the older console version.

Gameplay now includes multiple planning phases: drafting the Forest Stewardship Plan, early consultation, old‑growth decisions, vegetation control, wildfire actions, heritage assessments, weather planning, species selection and new options for site preparation and crew training. The `docs/BC_interior_context.md` file provides background on provincial requirements, First Nations engagement and industry issues that inspired the game design.

To publish the game on GitHub Pages just push changes to the `work` branch. The included workflow (`.github/workflows/pages.yml`) uploads the repository as a static site each time you push.
