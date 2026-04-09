/**
 * TUI Game Orchestrator
 * Browser port of tui/useGameFlow.ts — runs the engine.js game loop
 * through TuiUI instead of @opentui/react.
 *
 * This is a different game from ForestryTrailGame (web version):
 *  - 5 metrics: progress, forestHealth, relationships, compliance, budget
 *  - 4 seasons, each with role tasks + a random issue
 *  - Manager/strategic decision-making (no crew management)
 */

import {
  createInitialState,
  getRoleTasks,
  applyOptionOutcome,
  applyRoundConsequences,
  drawIssue,
  buildSummary,
  SEASONS,
} from './engine.js';
import { FORESTER_ROLES, OPERATING_AREAS } from './data/index.js';

const CONSEQUENCE_LABELS = {
  'contractor-attrition': 'Contractor attrition from sustained budget stress',
  'trust-deficit':        'Low-trust environment slowed high-confidence pathways',
  'audit-escalation':     'Audit escalation after repeated compliance drops',
};

export class TuiGame {
  constructor(ui) {
    this.ui = ui;
    this.gs  = null;

    // Wire restart key back into start()
    ui.onRestartRequest(() => this._promptRestart());
    ui.onLogRequest(() => this._showHistory());
  }

  async start() {
    this.ui.prepareForNewGame();
    this.gs = null;
    await this._setupFlow();
    await this._gameLoop();
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  async _setupFlow() {
    const { ui } = this;

    ui.clear();
    ui.writeHeader('BC FORESTRY TRAIL — TERMINAL EDITION');
    ui.write('');
    ui.write('A management simulation of sustainable forestry in British Columbia.');
    ui.write('Balance five metrics across four seasons of strategic decisions:');
    ui.write('');
    ui.write('  Progress · Forest Health · Relationships · Compliance · Budget');
    ui.write('');

    const companyName = await ui.promptText('Enter your company name:', 'Forest Co-op');

    ui.clear();
    ui.writeHeader('SELECT YOUR SPECIALIZATION');
    ui.write('Each role unlocks different task sets and challenges.');
    ui.write('');

    const roleOpt = await ui.promptChoice('Choose your role:', FORESTER_ROLES.map(r => ({
      label: r.name,
      description: r.description,
      value: r.id,
      _r: r,
    })));
    const role = roleOpt._r || FORESTER_ROLES.find(r => r.id === roleOpt.value) || FORESTER_ROLES[0];

    ui.clear();
    ui.writeHeader('SELECT YOUR OPERATING AREA');
    ui.write(`Company: ${companyName}`);
    ui.write(`Role:    ${role.name}`);
    ui.write('');

    const areaOpt = await ui.promptChoice('Choose your operating area:', OPERATING_AREAS.map(a => ({
      label: a.name,
      description: a.becZone || a.region || '',
      value: a.id,
      _a: a,
    })));
    const area = areaOpt._a || OPERATING_AREAS.find(a => a.id === areaOpt.value) || OPERATING_AREAS[0];

    this.gs = createInitialState({ companyName, roleId: role.id, areaId: area.id });
    ui.updateTuiStatus(this.gs);

    ui.clear();
    ui.writeHeader(`${companyName.toUpperCase()} — ${role.name}`);
    ui.write(`Operating Area: ${area.name}`);
    if (area.becZone) ui.write(`BEC Zone:       ${area.becZone}`);
    ui.write('');
    ui.write('You will navigate four seasons of forestry operations,');
    ui.write('making decisions that affect all five metrics.');
    ui.write('');
    ui.write('Use ↑↓ or j/k to navigate · [1-9] direct select · Enter to confirm');
    ui.write('[R] Restart · [L] Decision history · [?] Help');
    ui.write('');

    await ui.promptChoice('', [{ label: 'Begin Season 1', value: 'start' }]);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  async _gameLoop() {
    const { ui, gs } = this;

    for (let round = 1; round <= gs.totalRounds; round++) {
      gs.round = round;
      const season = SEASONS[round - 1];

      // Season intro
      ui.clear();
      ui.writeHeader(season);
      ui.write(`Season ${round} of ${gs.totalRounds}`);
      ui.write('');
      ui.write('A new season begins. Review your standing and prepare your decisions.');
      ui.updateTuiStatus(gs);

      await ui.promptChoice('', [{ label: `Begin ${season}`, value: 'go' }]);

      // Tasks
      for (const task of getRoleTasks(gs)) {
        await this._presentItem('task', task);
        ui.updateTuiStatus(gs);
      }

      // Random issue
      const issue = drawIssue(gs);
      if (issue) {
        await this._presentItem('issue', issue);
        ui.updateTuiStatus(gs);
      }

      // End-of-round consequences
      const consequences = applyRoundConsequences(gs);

      // Snapshot timeline
      if (Array.isArray(gs.timeline)) {
        gs.timeline.push({ round, season, metrics: { ...gs.metrics } });
      }

      ui.updateTuiStatus(gs);

      if (consequences.length > 0) {
        ui.clear();
        ui.writeHeader('End of Season — Consequences');
        ui.write('');
        for (const c of consequences) {
          ui.writeWarning(CONSEQUENCE_LABELS[c] || c);
        }
        ui.write('');
        ui.updateTuiStatus(gs);
        await ui.promptChoice('', [{ label: 'Continue', value: 'next' }]);
      }
    }

    await this._showEndGame();
  }

  // ── Present a task or issue ───────────────────────────────────────────────

  async _presentItem(type, item) {
    const { ui, gs } = this;
    const isIssue = type === 'issue';

    ui.clear();
    ui.writeHeader(`${isIssue ? '⚠ ISSUE: ' : ''}${item.title}`);
    if (item.description) ui.write(item.description);
    if (isIssue && item.flavor) {
      ui.write('');
      ui.write(item.flavor, 'dim');
    }
    ui.write('');
    ui.updateTuiStatus(gs);

    const choiceOpts = item.options.map(o => ({
      label: o.label,
      description: o.outcome,
      _opt: o,
    }));

    const chosen = await ui.promptChoice('Choose your action:', choiceOpts);
    const opt = chosen._opt;

    applyOptionOutcome(gs, opt, {
      type,
      id: item.id,
      title: item.title,
      option: opt.label,
      round: gs.round,
    });

    // Show result
    const risk = opt._riskResult;
    const header = risk
      ? (risk.success ? '✅ Success — ' : '❌ Caught — ') + opt.label
      : `Outcome: ${opt.label}`;
    const body = risk ? risk.outcome : (opt.outcome || '');

    ui.clear();
    ui.writeHeader(header);
    if (body) ui.write(body);
    ui.write('');
    if (opt.effects && Object.keys(opt.effects).length > 0) {
      const parts = Object.entries(opt.effects)
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => `${_metricLabel(k)} ${v > 0 ? '+' : ''}${v}`);
      if (parts.length) ui.write(`Effects: ${parts.join(' · ')}`, 'dim');
    }
    ui.updateTuiStatus(gs);

    await ui.promptChoice('', [{ label: 'Continue', value: 'next' }]);
  }

  // ── End game ──────────────────────────────────────────────────────────────

  async _showEndGame() {
    const { ui, gs } = this;
    const summary = buildSummary(gs);

    ui.clear();
    ui.writeHeader('YEAR END REVIEW');
    ui.write(summary.overall);
    ui.write('');

    if (summary.messages?.length) {
      ui.writeDivider('SEASON HIGHLIGHTS');
      for (const m of summary.messages) ui.write(m);
      ui.write('');
    }

    if (summary.achievements?.length) {
      ui.writeDivider('ACHIEVEMENTS');
      for (const a of summary.achievements) ui.write(a);
      ui.write('');
    }

    if (summary.highlights?.length) {
      ui.writeDivider('KEY DECISIONS');
      for (const h of summary.highlights) ui.write(h);
      ui.write('');
    }

    if (summary.legacy?.trendLines?.length) {
      ui.writeDivider('METRIC TRENDS');
      for (const t of summary.legacy.trendLines) ui.write(t);
      ui.write('');
    }

    if (summary.projection?.length) {
      ui.writeDivider('FUTURE OUTLOOK');
      for (const p of summary.projection) ui.write(p);
      ui.write('');
    }

    ui.updateTuiStatus(gs);

    const choice = await ui.promptChoice('What next?', [
      { label: 'Play Again', value: 'replay' },
      { label: 'Switch to Web Version', value: 'web' },
    ]);

    if (choice.value === 'replay') {
      await this.start();
    } else {
      window.location.assign('./index.html');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _promptRestart() {
    const { ui } = this;
    ui.openModal({
      title: 'Restart?',
      dismissible: true,
      buildContent: (el) => {
        const p = document.createElement('p');
        p.textContent = 'This will abandon your current game and restart from the beginning.';
        el.appendChild(p);
      },
      actions: [
        {
          label: 'Restart',
          primary: true,
          onSelect: () => {
            ui.closeModal();
            this.start();
          },
        },
        { label: 'Cancel', onSelect: () => ui.closeModal() },
      ],
    });
  }

  _showHistory() {
    const { ui, gs } = this;
    if (!gs?.history?.length) {
      ui.showModal({ title: 'Decision History', content: 'No decisions yet.' });
      return;
    }
    ui.openModal({
      title: 'Decision History',
      dismissible: true,
      buildContent: (el) => {
        gs.history.slice(-20).forEach(entry => {
          const p = document.createElement('p');
          const delta = Object.entries(entry.effects || {})
            .filter(([, v]) => v !== 0)
            .map(([k, v]) => `${_metricLabel(k)} ${v > 0 ? '+' : ''}${v}`)
            .join(', ');
          p.textContent = `S${entry.round} · ${entry.title} → ${entry.option}${delta ? ` (${delta})` : ''}`;
          el.appendChild(p);
        });
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => ui.closeModal() }],
    });
  }
}

function _metricLabel(key) {
  return { progress: 'Progress', forestHealth: 'Forest', relationships: 'Relations', compliance: 'Compliance', budget: 'Budget' }[key] ?? key;
}
