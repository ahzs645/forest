/**
 * BC Forestry Trail - Entry Point
 * Loaded by index.html as <script type="module" src="js/game.js">
 *
 * Add ?tui to the URL to use the terminal UI renderer instead of the web UI.
 */

import { ForestryTrailGame } from './game/ForestryTrailGame.js';

window.addEventListener('DOMContentLoaded', async () => {
  const isTUI = new URLSearchParams(window.location.search).has('tui');

  if (isTUI) {
    const { TuiUI } = await import('./tui-ui.js');
    const game = new ForestryTrailGame(new TuiUI());
    game.start();
  } else {
    const game = new ForestryTrailGame();
    game.start();
  }
});
