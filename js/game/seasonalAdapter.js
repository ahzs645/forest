/**
 * Seasonal Adapter
 * Renders a seasonal-engine run through the expedition site's TerminalUI, so
 * the strategy game plays inside the main terminal instead of a separate
 * React app. TuiGameController stays the single source of truth (it also
 * drives the classic tui.html view, the balance sims, and the CLI) — this is
 * just its fourth renderer.
 *
 * Cards are rendered decision-first: title, one situation paragraph, choices.
 * The rest of what a card carries (context, flavor, why-now, provenance) sits
 * behind a free [More context] choice that never advances the controller.
 */

import { TuiGameController } from '../../tui/controller.js';
import { makeRng } from '../engine/rng.js';
import { formatMetricName } from '../engine/shared.js';

const METRIC_ORDER = ['progress', 'forestHealth', 'relationships', 'compliance', 'budget'];
const METRIC_SHORT = {
  progress: 'Progress',
  forestHealth: 'Forest',
  relationships: 'Relations',
  compliance: 'Compliance',
  budget: 'Budget',
};

/** One-line dashboard above every card. */
export function renderMetricStrip(ui, gameState = {}) {
  const metrics = gameState.metrics || {};
  const parts = METRIC_ORDER
    .filter((key) => metrics[key] !== undefined)
    .map((key) => `${METRIC_SHORT[key] || formatMetricName(key)} ${Math.round(metrics[key])}`);
  if (!parts.length) return;

  const season = gameState.currentSeasonContext?.label
    || (gameState.round ? `Season ${gameState.round}/${gameState.totalRounds || 4}` : '');
  const role = gameState.roleDisplayName || gameState.role?.name || '';
  const context = [season, role].filter(Boolean).join(' · ');
  if (context) ui.write(context, 'term-dim');
  ui.write(parts.join(' | '));
  const objective = gameState.objectiveStrip?.line || gameState.objectiveStrip;
  if (typeof objective === 'string' && objective) ui.write(objective, 'term-dim');
}

function riskTag(detail) {
  if (!detail) return '';
  if (detail.riskLevel === 'high') return ' [RISKY]';
  if (detail.riskLevel === 'medium') return ' [TRADEOFF]';
  if (detail.riskLevel === 'low' || detail.riskLevel === 'safe') return ' [SAFE]';
  return '';
}

function collectDetailLines(contentData = {}) {
  const lines = [];
  if (contentData.context) lines.push(contentData.context);
  if (contentData.whyNow) lines.push(`Why now: ${contentData.whyNow}`);
  if (contentData.flavor) lines.push(contentData.flavor);
  if (contentData.surfaceReason) lines.push(contentData.surfaceReason);
  if (contentData.sourceLabel) lines.push(`Source: ${contentData.sourceLabel}`);
  return lines.filter((line, i, all) => line && all.indexOf(line) === i);
}

function writeNotice(ui, notice) {
  if (!notice?.body && !notice?.heading) return;
  const style = notice.tone === 'danger'
    ? 'writeDanger'
    : notice.tone === 'warning' ? 'writeWarning' : 'write';
  if (notice.heading) ui.writeDivider(notice.heading);
  if (notice.body) {
    for (const line of String(notice.body).split('\n')) {
      if (!line.trim()) continue;
      (ui[style] || ui.write).call(ui, line);
    }
  }
  ui.write('');
}

/**
 * Render one seasonal card and resolve the player's real choice index.
 * Handles the free [More context] loop internally.
 * @returns {Promise<number>} index into `options`
 */
export async function promptSeasonalCard(ui, contentData = {}, options = [], gameState = null) {
  const details = contentData.optionDetails || [];
  const detailLines = collectDetailLines(contentData);
  let showDetail = false;

  for (;;) {
    ui.clear();
    if (gameState) {
      renderMetricStrip(ui, gameState);
      ui.write('');
    }

    writeNotice(ui, contentData.notice);

    const title = contentData.title || contentData.heading || contentData.text || '';
    if (contentData.cardLabel) ui.write(contentData.cardLabel, 'term-dim');
    if (title) ui.writeHeader(title);
    if (contentData.headline && contentData.headline !== title) ui.write(contentData.headline);
    const body = contentData.description || contentData.body || '';
    if (body) ui.write(body);
    if (Array.isArray(contentData.mission)) {
      for (const line of contentData.mission) ui.write(line, 'term-dim');
    } else if (typeof contentData.mission === 'string' && contentData.mission) {
      ui.write(contentData.mission, 'term-dim');
    }

    if (showDetail && detailLines.length) {
      ui.writeDivider('CONTEXT');
      for (const line of detailLines) ui.write(line, 'term-dim');
    }
    ui.write('');

    const choices = options.map((option, index) => {
      const label = typeof option === 'string' ? option : option?.label || String(option);
      const detail = details[index];
      return {
        label: `${label}${riskTag(detail)}`,
        description: detail?.preview || detail?.description || '',
        value: index,
      };
    });
    if (detailLines.length && !showDetail) {
      choices.push({ label: 'More context', description: 'Background on this card (free)', value: 'detail' });
    }

    const picked = await ui.promptChoice(contentData.decisionPrompt || '', choices);
    if (picked.value === 'detail') {
      showDetail = true;
      continue;
    }
    return picked.value;
  }
}

/** Year-end summary, decision-first with the full review behind a free action. */
export async function promptSummaryCard(ui, contentData = {}, options = [], gameState = null) {
  let showFull = false;
  for (;;) {
    ui.clear();
    if (gameState) {
      renderMetricStrip(ui, gameState);
      ui.write('');
    }
    ui.writeHeader(contentData.heading || 'Year End Review');
    if (contentData.tier) {
      ui.write(`ENDING: ${String(contentData.tier).toUpperCase()}${contentData.score != null ? ` · SCORE ${contentData.score}/100` : ''}`);
    }
    if (contentData.body) ui.write(contentData.body);
    for (const reason of contentData.scoreReasons || []) ui.write(`• ${reason}`);
    if (contentData.style?.label) {
      ui.write(`Style: ${contentData.style.label} — ${contentData.style.tendency || ''}`, 'term-dim');
    }
    for (const bullet of contentData.bullets || []) ui.write(bullet);

    if (showFull) {
      const sections = [
        ['KEY DECISIONS', contentData.highlights],
        ['SEASON REVIEW', contentData.seasonSummaries],
        ['TRENDLINES', contentData.trendLines],
      ];
      for (const [label, lines] of sections) {
        if (!Array.isArray(lines) || !lines.length) continue;
        ui.writeDivider(label);
        for (const line of lines) ui.write(line, 'term-dim');
      }
      if (contentData.roleLens) {
        ui.writeDivider('ROLE LENS');
        ui.write(contentData.roleLens, 'term-dim');
      }
    }
    ui.write('');

    const choices = options.map((option, index) => ({
      label: typeof option === 'string' ? option : option?.label || String(option),
      value: index,
    }));
    if (!showFull) {
      choices.push({ label: 'Review the full year', description: 'Decisions, seasons, trendlines (free)', value: 'detail' });
    }

    const picked = await ui.promptChoice('', choices);
    if (picked.value === 'detail') {
      showFull = true;
      continue;
    }
    return picked.value;
  }
}

/**
 * Play a full seasonal run inside the terminal.
 * @param {Object} ui - TerminalUI
 * @param {Object} [options]
 * @param {number} [options.seed] - seeded rng (defaults to a random seed so
 *   the controller's season-boundary autosave stays functional)
 * @param {{companyName: string, roleIndex: number, areaIndex: number}} [options.preset]
 *   - skip the controller's setup cards (used by the campaign)
 * @param {string} [options.saveKey] - override the controller autosave slot
 * @returns {Promise<{state: Object, summary: Object, quit: boolean}>}
 */
// The expedition status bar and stat cards show journey data the seasonal
// game doesn't have; hide them while the adapter owns the screen.
// (Exported for the campaign, which alternates between strategy cards and
// live deployments.)
export function setExpeditionChromeHidden(hidden) {
  if (typeof document === 'undefined') return;
  for (const id of ['status-bar', 'stat-cards']) {
    const el = document.getElementById(id);
    if (el) el.style.display = hidden ? 'none' : '';
  }
}

export async function runSeasonalGame(ui, options = {}) {
  setExpeditionChromeHidden(true);
  try {
    return await runSeasonalGameInner(ui, options);
  } finally {
    setExpeditionChromeHidden(false);
  }
}

async function runSeasonalGameInner(ui, options = {}) {
  const seed = options.seed ?? Math.floor(Math.random() * 0x100000000);
  const controller = new TuiGameController({
    rng: makeRng(seed),
    ...(options.saveKey ? { saveKey: options.saveKey } : {}),
    onExit: () => {},
  });

  if (options.preset) {
    controller.setInputText(options.preset.companyName || 'The Timber Wolves');
    controller.submitCurrent();
    controller.selectOption(options.preset.roleIndex ?? 0);
    controller.selectOption(options.preset.areaIndex ?? 0);
  }

  let guard = 0;
  while (guard++ < 2000) {
    const view = controller.getState();
    const { mode, contentData } = view;

    if (mode === 'setup-name') {
      ui.clear();
      ui.writeHeader('SEASONAL STRATEGY');
      ui.write('Four seasons, five meters, one operating area. Decisions echo.');
      ui.write('');
      const name = await ui.promptText('Company name:', 'e.g. Northern Canopy Ltd.');
      controller.setInputText(name || 'The Timber Wolves');
      controller.submitCurrent();
      continue;
    }

    if (mode === 'end') {
      const summary = contentData;
      const optionLabels = view.options || [];
      if (optionLabels.length) {
        const index = await promptSummaryCard(ui, contentData, optionLabels, view.gameState);
        const label = String(optionLabels[index] || '').toLowerCase();
        if (label.includes('again')) {
          controller.selectOption(index);
          continue;
        }
      }
      return { state: controller.gs, summary, quit: false };
    }

    const optionLabels = view.options || [];
    if (!optionLabels.length) {
      // Non-interactive beat (shouldn't happen in seasonal flow) — nudge past.
      controller.submitCurrent();
      continue;
    }

    const index = await promptSeasonalCard(ui, contentData, optionLabels, view.gameState);
    controller.selectOption(index);
  }

  return { state: controller.gs, summary: null, quit: true };
}
