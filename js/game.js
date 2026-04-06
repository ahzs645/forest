/**
 * BC Forestry Trail - Entry Point
 * Loaded by index.html as <script type="module" src="js/game.js">
 */

import { ForestryTrailGame } from './game/ForestryTrailGame.js';

// Initialize game on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const game = new ForestryTrailGame();
  game.start();
});
