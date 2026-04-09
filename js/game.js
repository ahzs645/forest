/**
 * BC Forestry Trail - Entry Point
 *
 * Two distinct games share this entry point:
 *
 *   (default)  Web game  — ForestryTrailGame + TerminalUI
 *              Oregon Trail-style crew simulation with multiple journey types.
 *
 *   ?tui       Redirects to the dedicated React terminal edition at tui.html
 */

import { ForestryTrailGame } from './game/ForestryTrailGame.js';

window.addEventListener('DOMContentLoaded', () => {
  if (new URLSearchParams(window.location.search).has('tui')) {
    window.location.replace('./tui.html');
  } else {
    new ForestryTrailGame().start();
  }
});
