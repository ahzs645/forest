# Forestry Simulator

This repository contains two text-based games about planning a forestry operation in British Columbia's interior.

- **Web game** – open `index.html` in a browser or deploy the repository to GitHub Pages. The page shows a faux terminal where you type commands to progress through a long scenario.
- **Terminal game** – run `python3 forestry_game.py` for a console version with the same expanded choices and outcomes.

Gameplay now includes multiple planning phases: drafting the Forest Stewardship Plan, early consultation, old‑growth decisions, vegetation control, wildfire actions, heritage assessments, weather planning, species selection and new options for site preparation and crew training. The `docs/BC_interior_context.md` file provides background on provincial requirements, First Nations engagement and industry issues that inspired the game design.

The repository ships with a GitHub Actions workflow (`.github/workflows/pages.yml`) that publishes the web game to GitHub Pages whenever the `work` branch is updated. No build step is needed—static files are uploaded directly.
