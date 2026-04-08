/**
 * BC Forestry Trail - Entry Point
 *
 * Two distinct games share this entry point:
 *
 *   (default)  Web game  — ForestryTrailGame + TerminalUI
 *              Oregon Trail-style crew simulation with multiple journey types.
 *
 *   ?tui       TUI game  — TuiGame + TuiUI
 *              Manager/metrics game (4 seasons, 5 metrics) ported from
 *              tui/useGameFlow.ts. Uses js/engine.js, no @opentui/react needed.
 */

import { ForestryTrailGame } from './game/ForestryTrailGame.js';

window.addEventListener('DOMContentLoaded', async () => {
  if (new URLSearchParams(window.location.search).has('tui')) {
    const [{ TuiUI }, { TuiGame }] = await Promise.all([
      import('./tui-ui.js'),
      import('./tui-game.js'),
    ]);
    const ui   = new TuiUI();
    const game = new TuiGame(ui);
    game.start();
  } else {
    new ForestryTrailGame().start();
  }
});
