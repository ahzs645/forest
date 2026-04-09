/**
 * BC Forestry Trail - Entry Point
 *
 * Two distinct games share this entry point:
 *
 *   (default)  Web game  — ForestryTrailGame + TerminalUI
 *              Expedition-mode crew simulation with multiple journey types.
 *
 *   ?tui       Redirects to the dedicated seasonal-strategy TUI at tui.html
 */

import { ForestryTrailGame } from './game/ForestryTrailGame.js';

window.addEventListener('DOMContentLoaded', () => {
  if (new URLSearchParams(window.location.search).has('tui')) {
    window.location.replace('./tui.html');
  } else {
    new ForestryTrailGame().start();
  }
});
