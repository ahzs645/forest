/**
 * TUI Renderer
 * Browser-native terminal UI using CSS Grid + Unicode box-drawing characters.
 * Implements the same interface as TerminalUI so ForestryTrailGame needs no changes.
 *
 * Activated via the ?tui URL parameter.
 * Performance: zero extra dependencies, pure DOM + CSS.
 */

import { getOperationalProgress } from './journey.js';

// ─── Palette (mirrors tui/palette.ts) ─────────────────────────────────────────

const C = {
  bg:          '#0d1117',
  headerBg:    '#2d5016',
  headerFg:    '#c9d1d9',
  dashBorder:  '#56d4dd',
  contentBorder:'#d29922',
  optsBorder:  '#58a6ff',
  fg:          '#c9d1d9',
  dim:         '#6e7681',
  cyan:        '#56d4dd',
  green:       '#3fb950',
  yellow:      '#e3b341',
  red:         '#f85149',
  blue:        '#58a6ff',
  selBg:       '#1f6feb',
  selFg:       '#ffffff',
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const TUI_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%;overflow:hidden;background:${C.bg}}
#tui-root{
  display:grid;
  grid-template-rows:1.6em 1fr auto;
  height:100vh;width:100vw;
  font-family:'Courier New',Courier,monospace;
  font-size:14px;
  color:${C.fg};
  background:${C.bg};
}
#tui-header{
  background:${C.headerBg};
  color:${C.headerFg};
  display:flex;justify-content:space-between;align-items:center;
  padding:0 1em;
  border-bottom:1px solid ${C.dashBorder};
  white-space:nowrap;overflow:hidden;
}
#tui-header-right{color:${C.dim};font-size:.85em;flex-shrink:0;padding-left:1em}
#tui-header-role{color:${C.cyan};margin-right:.5em}
#tui-body{
  display:grid;
  grid-template-columns:22ch 1fr;
  overflow:hidden;
}
#tui-dashboard{
  border-right:1px solid ${C.dashBorder};
  padding:.5em .6em;
  overflow-y:auto;overflow-x:hidden;
}
.tui-panel-title{color:${C.cyan};font-size:.8em;letter-spacing:.12em;margin-bottom:.35em;border-bottom:1px solid ${C.dashBorder}33;padding-bottom:.2em}
.tui-metric{display:flex;justify-content:space-between;gap:.5em;margin:.08em 0;font-size:.88em;line-height:1.35}
.tui-metric-label{color:${C.dim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tui-metric-value{color:${C.fg};flex-shrink:0;text-align:right}
.tui-metric-bar{height:3px;background:#21262d;margin:.05em 0 .35em;border-radius:2px}
.tui-metric-fill{height:100%;background:${C.green};border-radius:2px;transition:width .25s}
.tui-metric-fill.warn{background:${C.yellow}}
.tui-metric-fill.crit{background:${C.red}}
.tui-dash-sep{color:${C.dashBorder}44;margin:.3em 0;font-size:.75em;overflow:hidden;white-space:nowrap}
#tui-content{display:flex;flex-direction:column;overflow:hidden;border-left:none}
#tui-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:.6em 1em;scroll-behavior:smooth}
/* Content lines */
.tl{line-height:1.45;white-space:pre-wrap;word-break:break-word;min-height:.1em}
.tl-h{color:${C.yellow};font-weight:bold;border-bottom:1px solid ${C.contentBorder}55;margin-bottom:.2em;padding-bottom:.1em}
.tl-div{color:${C.dim};margin:.2em 0}
.tl-warn{color:${C.yellow}}
.tl-danger{color:${C.red}}
.tl-positive{color:${C.green}}
.tl-dim{color:${C.dim}}
.tl-box{color:${C.cyan};font-family:monospace;margin:.25em 0}
/* Options panel */
#tui-options{
  border-top:1px solid ${C.optsBorder};
  padding:.4em .8em .5em;
  max-height:13em;min-height:3.5em;
  overflow-y:auto;
}
.tui-opts-title{color:${C.blue};font-size:.8em;letter-spacing:.12em;margin-bottom:.2em}
.tui-opt{
  display:flex;align-items:baseline;gap:.6em;
  padding:.18em .4em;cursor:pointer;border-radius:2px;
  transition:background .08s;
}
.tui-opt:hover{background:${C.selBg}22}
.tui-opt.sel{background:${C.selBg};color:${C.selFg}}
.tui-opt-key{color:${C.blue};min-width:2.4em;flex-shrink:0;font-size:.85em}
.tui-opt.sel .tui-opt-key{color:${C.selFg}}
.tui-opt-label{flex:1}
.tui-opt-desc{color:${C.dim};font-size:.82em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:30em}
.tui-opt.sel .tui-opt-desc{color:#ffffff88}
/* Text input row */
.tui-input-row{display:flex;gap:.5em;align-items:center;padding:.2em 0}
.tui-input-prompt{color:${C.blue}}
.tui-input{
  flex:1;background:#21262d;color:${C.fg};
  border:1px solid ${C.optsBorder};
  padding:.25em .5em;
  font-family:inherit;font-size:1em;outline:none;
}
.tui-input:focus{border-color:${C.blue}}
/* Modal */
#tui-modal{
  position:fixed;inset:0;
  background:#000000bb;
  display:flex;align-items:center;justify-content:center;
  z-index:200;
}
#tui-modal.hidden{display:none}
#tui-modal-box{
  background:#161b22;
  border:1px solid ${C.optsBorder};
  padding:1.5em;
  min-width:24em;max-width:52em;
  max-height:80vh;overflow-y:auto;
}
#tui-modal-title{color:${C.yellow};font-weight:bold;margin-bottom:.75em;font-size:1.05em}
#tui-modal-body{line-height:1.55;margin-bottom:1em;color:${C.fg}}
#tui-modal-body p{margin:.3em 0}
#tui-modal-actions{display:flex;gap:.6em;flex-wrap:wrap}
.tui-mbtn{
  padding:.35em .9em;cursor:pointer;
  font-family:inherit;font-size:.95em;
  border:1px solid ${C.dim};background:transparent;color:${C.fg};
}
.tui-mbtn:hover{border-color:${C.blue};color:${C.blue}}
.tui-mbtn.pri{border-color:${C.blue};color:${C.blue}}
.tui-mbtn.pri:hover{background:${C.selBg};color:#fff;border-color:${C.selBg}}
/* Scrollbar */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${C.dim}44;border-radius:2px}
`;

// ─── TuiUI ────────────────────────────────────────────────────────────────────

export class TuiUI {
  constructor() {
    this._onRestart = null;
    this._onLog = null;
    this._modalOpen = false;
    this._modalDismissible = false;
    this._modalOnClose = null;
    this._choiceResolve = null;
    this._textResolve = null;
    this._selectedIndex = 0;
    this._currentOptions = [];

    this._buildDOM();
    this._bindGlobalKeys();
  }

  // ── DOM setup ────────────────────────────────────────────────────────────

  _buildDOM() {
    const style = document.createElement('style');
    style.textContent = TUI_CSS;
    document.head.appendChild(style);

    document.body.innerHTML = '';

    const root = document.createElement('div');
    root.id = 'tui-root';
    root.innerHTML = `
      <div id="tui-header">
        <span>BC Forestry Trail — Terminal Edition</span>
        <span id="tui-header-right">
          <span id="tui-header-role"></span>
          [R] Restart&nbsp; [L] Log&nbsp; [?] Help
        </span>
      </div>
      <div id="tui-body">
        <div id="tui-dashboard">
          <div class="tui-panel-title">METRICS</div>
          <div id="tui-metrics"></div>
        </div>
        <div id="tui-content">
          <div id="tui-scroll"></div>
        </div>
      </div>
      <div id="tui-options">
        <div class="tui-opts-title">OPTIONS</div>
        <div id="tui-opts-list"></div>
      </div>
    `;
    document.body.appendChild(root);

    // Modal overlay
    const modal = document.createElement('div');
    modal.id = 'tui-modal';
    modal.className = 'hidden';
    modal.innerHTML = `
      <div id="tui-modal-box">
        <div id="tui-modal-title"></div>
        <div id="tui-modal-body"></div>
        <div id="tui-modal-actions"></div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal && this._modalDismissible) this.closeModal();
    });
    document.body.appendChild(modal);

    this._elScroll   = document.getElementById('tui-scroll');
    this._elMetrics  = document.getElementById('tui-metrics');
    this._elOptsList = document.getElementById('tui-opts-list');
    this._elRole     = document.getElementById('tui-header-role');
    this._elModal    = document.getElementById('tui-modal');
    this._elMTitle   = document.getElementById('tui-modal-title');
    this._elMBody    = document.getElementById('tui-modal-body');
    this._elMActions = document.getElementById('tui-modal-actions');
  }

  // ── Global keyboard ──────────────────────────────────────────────────────

  _bindGlobalKeys() {
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      if (this._modalOpen) {
        if (e.key === 'Escape' && this._modalDismissible) {
          e.preventDefault();
          this.closeModal();
        }
        return;
      }

      if (!typing) {
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          if (this._onRestart) this._onRestart();
          return;
        }
        if (e.key === 'l' || e.key === 'L') {
          e.preventDefault();
          if (this._onLog) this._onLog();
          return;
        }
        if (e.key === '?' || e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          this.showHelp();
          return;
        }
      }

      // Choice navigation (active even while typing for number keys would conflict, so only arrows)
      if (this._choiceResolve && this._currentOptions.length > 0) {
        if (e.key === 'ArrowUp' || (!typing && e.key === 'k')) {
          e.preventDefault();
          this._selectedIndex = Math.max(0, this._selectedIndex - 1);
          this._renderOptions();
        } else if (e.key === 'ArrowDown' || (!typing && e.key === 'j')) {
          e.preventDefault();
          this._selectedIndex = Math.min(this._currentOptions.length - 1, this._selectedIndex + 1);
          this._renderOptions();
        } else if (e.key === 'Enter' && !typing) {
          e.preventDefault();
          this._confirmOption(this._selectedIndex);
        } else if (!typing && /^[1-9]$/.test(e.key)) {
          const i = parseInt(e.key, 10) - 1;
          if (i < this._currentOptions.length) this._confirmOption(i);
        }
      }
    });
  }

  // ── Output ───────────────────────────────────────────────────────────────

  write(text, className = '') {
    const el = document.createElement('div');
    if (!text && text !== 0) {
      el.style.height = '.5em';
    } else {
      el.className = `tl${className ? ' tl-' + className : ''}`;
      el.textContent = String(text);
    }
    this._elScroll.appendChild(el);
    this._scrollBottom();
  }

  writeHeader(text) {
    const el = document.createElement('div');
    el.className = 'tl tl-h';
    el.textContent = `▶ ${text}`;
    this._elScroll.appendChild(el);
    this._scrollBottom();
  }

  writeDivider(label = '') {
    const el = document.createElement('div');
    el.className = 'tl tl-div';
    if (label) {
      const dashes = '─'.repeat(Math.max(2, Math.floor((58 - label.length) / 2)));
      el.textContent = `${dashes} ${label} ${dashes}`;
    } else {
      el.textContent = '─'.repeat(60);
    }
    this._elScroll.appendChild(el);
    this._scrollBottom();
  }

  writeWarning(text)  { this.write(`⚠ ${text}`, 'warn'); }
  writeDanger(text)   { this.write(`✗ ${text}`, 'danger'); }
  writePositive(text) { this.write(`✓ ${text}`, 'positive'); }

  writeHTML(html) {
    const el = document.createElement('div');
    el.className = 'tl';
    el.innerHTML = html;
    this._elScroll.appendChild(el);
    this._scrollBottom();
  }

  writeBox(content) {
    const el = document.createElement('div');
    el.className = 'tl tl-box';
    el.textContent = content;
    this._elScroll.appendChild(el);
    this._scrollBottom();
  }

  clear() {
    this._elScroll.innerHTML = '';
  }

  _scrollBottom() {
    this._elScroll.scrollTop = this._elScroll.scrollHeight;
  }

  // ── Input ────────────────────────────────────────────────────────────────

  async promptChoice(prompt, options) {
    if (prompt) this.write(prompt, 'dim');
    this._currentOptions = options;
    this._selectedIndex = 0;
    this._renderOptions();

    return new Promise((resolve) => {
      this._choiceResolve = resolve;
    });
  }

  _renderOptions() {
    this._elOptsList.innerHTML = '';
    this._currentOptions.forEach((opt, i) => {
      const row = document.createElement('div');
      row.className = `tui-opt${i === this._selectedIndex ? ' sel' : ''}`;
      row.innerHTML = `
        <span class="tui-opt-key">[${i + 1}]</span>
        <span class="tui-opt-label">${opt.label}</span>
        ${opt.description || opt.hint
          ? `<span class="tui-opt-desc">${opt.description || opt.hint}</span>`
          : ''}
      `;
      row.addEventListener('click', () => this._confirmOption(i));
      row.addEventListener('mouseenter', () => {
        this._selectedIndex = i;
        this._renderOptions();
      });
      this._elOptsList.appendChild(row);
    });

    // Scroll selected option into view
    const sel = this._elOptsList.querySelector('.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  _confirmOption(index) {
    const opt = this._currentOptions[index];
    if (!opt || !this._choiceResolve) return;
    const resolve = this._choiceResolve;
    this._choiceResolve = null;
    this._currentOptions = [];
    this._elOptsList.innerHTML = '';
    resolve(opt);
  }

  async promptText(prompt, placeholder = 'Type here...') {
    if (prompt) this.write(prompt);

    this._elOptsList.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'tui-input-row';

    const promptEl = document.createElement('span');
    promptEl.className = 'tui-input-prompt';
    promptEl.textContent = '>';

    const input = document.createElement('input');
    input.className = 'tui-input';
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = placeholder; // pre-fill so Enter accepts the default
    input.autocomplete = 'off';
    input.spellcheck = false;

    row.appendChild(promptEl);
    row.appendChild(input);
    this._elOptsList.appendChild(row);
    input.focus();
    input.select();

    return new Promise((resolve) => {
      this._textResolve = resolve;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = input.value.trim() || placeholder;
          this._textResolve = null;
          this._elOptsList.innerHTML = '';
          resolve(val);
        }
      });
    });
  }

  // ── Dashboard / status ───────────────────────────────────────────────────

  updateAllStatus(journey) {
    const progress = getOperationalProgress(journey);
    const isProtagonist = journey.protagonist && (!journey.crew || journey.crew.length === 0);

    const rows = [];

    // Core progress
    rows.push({ label: 'Day / Shift', value: journey.day || 1 });
    rows.push({ label: 'Progress', value: `${progress}%`, bar: progress });

    if (isProtagonist) {
      const energy = journey.protagonist.energy ?? 100;
      const stress  = journey.protagonist.stress  ?? 0;
      rows.push({ label: 'Energy', value: `${energy}%`, bar: energy });
      rows.push({ label: 'Stress', value: `${stress}%`, bar: stress, invert: true });
    } else if (journey.crew?.length) {
      const active = journey.crew.filter(m => m.isActive !== false).length;
      const total  = journey.crew.length;
      const morale = Math.round(
        journey.crew.reduce((s, m) => s + (m.morale ?? 75), 0) / Math.max(total, 1)
      );
      rows.push({ label: 'Crew', value: `${active}/${total}` });
      rows.push({ label: 'Morale', value: `${morale}%`, bar: morale });
    }

    // Resources
    const r = journey.resources ?? {};
    if (r.budget       !== undefined) rows.push({ label: 'Budget',      value: `$${Number(r.budget).toLocaleString()}` });
    if (r.compliance   !== undefined) rows.push({ label: 'Compliance',  value: `${r.compliance}%`, bar: r.compliance });
    if (r.forestHealth !== undefined) rows.push({ label: 'Forest',      value: `${r.forestHealth}%`, bar: r.forestHealth });
    if (r.relationships!== undefined) rows.push({ label: 'Relations',   value: `${r.relationships}%`, bar: r.relationships });

    // Identity
    const name = journey.companyName || journey.crewName;
    if (name || journey.role?.name || journey.area?.name) {
      rows.push({ sep: true });
      if (name)                rows.push({ label: 'Company', value: name });
      if (journey.role?.name)  rows.push({ label: 'Role',    value: journey.role.name });
      if (journey.area?.name)  rows.push({ label: 'Area',    value: journey.area.name });
    }

    // Render
    this._elMetrics.innerHTML = '';
    for (const row of rows) {
      if (row.sep) {
        const sep = document.createElement('div');
        sep.className = 'tui-dash-sep';
        sep.textContent = '─'.repeat(20);
        this._elMetrics.appendChild(sep);
        continue;
      }

      const el = document.createElement('div');
      el.className = 'tui-metric';
      el.innerHTML = `<span class="tui-metric-label">${row.label}</span><span class="tui-metric-value">${row.value}</span>`;
      this._elMetrics.appendChild(el);

      if (row.bar !== undefined) {
        const pct = row.invert ? (100 - row.bar) : row.bar;
        const clamped = Math.max(0, Math.min(100, pct));
        const wrap = document.createElement('div');
        wrap.className = 'tui-metric-bar';
        const fill = document.createElement('div');
        fill.className = `tui-metric-fill${clamped < 30 ? ' crit' : clamped < 55 ? ' warn' : ''}`;
        fill.style.width = `${clamped}%`;
        wrap.appendChild(fill);
        this._elMetrics.appendChild(wrap);
      }
    }

    // Header role badge
    if (this._elRole && journey.journeyType) {
      this._elRole.textContent = journey.journeyType.toUpperCase() + ' //';
    }
  }

  // Stub methods — TUI integrates these into the dashboard above
  updateStatusBar()        {}
  updateCrewPanel()        {}
  updateResourcesPanel()   {}
  updateLocationPanel()    {}
  updateProtagonistPanel() {}
  setJourneyLayout()       {}
  togglePanel()            {}
  openStatusPanel()        {}
  closeStatusPanel()       {}

  // ── Modal ────────────────────────────────────────────────────────────────

  openModal({ title = '', dismissible = false, onClose, buildContent, actions = [] } = {}) {
    this._modalOpen = true;
    this._modalDismissible = dismissible;
    this._modalOnClose = onClose || null;

    this._elMTitle.textContent = title;
    this._elMBody.innerHTML = '';
    if (buildContent) buildContent(this._elMBody);

    this._elMActions.innerHTML = '';
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.className = `tui-mbtn${action.primary ? ' pri' : ''}`;
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        if (action.onSelect) action.onSelect();
        else this.closeModal();
      });
      this._elMActions.appendChild(btn);
    }

    this._elModal.classList.remove('hidden');
  }

  // Legacy modal style used by some internal callers
  showModal({ title = '', content = '', actions = [] } = {}) {
    this.openModal({
      title,
      dismissible: true,
      buildContent: (el) => {
        if (typeof content === 'string') {
          el.innerHTML = `<p>${content}</p>`;
        } else if (content instanceof HTMLElement) {
          el.appendChild(content);
        }
      },
      actions: actions.length
        ? actions.map(a => ({ label: a.label, primary: a.primary, onSelect: () => { this.closeModal(); if (a.onClick) a.onClick(); } }))
        : [{ label: 'OK', primary: true, onSelect: () => this.closeModal() }]
    });
  }

  closeModal() {
    if (!this._modalOpen) return;
    this._modalOpen = false;
    this._elModal.classList.add('hidden');
    if (this._modalOnClose) {
      const cb = this._modalOnClose;
      this._modalOnClose = null;
      cb();
    }
  }

  isModalOpen() {
    return this._modalOpen;
  }

  showHelp() {
    this.openModal({
      title: 'HELP — TUI CONTROLS',
      dismissible: true,
      buildContent: (el) => {
        el.innerHTML = `
          <p>↑ / k &nbsp; Move selection up</p>
          <p>↓ / j &nbsp; Move selection down</p>
          <p>[1-9]&nbsp; Select option by number</p>
          <p>Enter &nbsp; Confirm selection</p>
          <p>─────────────────────</p>
          <p>[R] Restart &nbsp; [L] Journey log &nbsp; [?] This help</p>
          <p>─────────────────────</p>
          <p>Click any option to select it. Hover to highlight.</p>
        `;
      },
      actions: [{ label: 'OK', primary: true, onSelect: () => this.closeModal() }]
    });
  }

  showGlossary() {
    this.openModal({
      title: 'GLOSSARY',
      dismissible: true,
      buildContent: (el) => {
        el.innerHTML = '<p>Full glossary is available in the standard web version.</p><p>Remove <code>?tui</code> from the URL to switch back.</p>';
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  }

  showLog(entries = []) {
    this.openModal({
      title: 'JOURNEY LOG',
      dismissible: true,
      buildContent: (el) => {
        if (!entries.length) {
          el.textContent = 'No log entries yet.';
          return;
        }
        entries.slice(-30).forEach(entry => {
          const p = document.createElement('p');
          p.textContent = typeof entry === 'string'
            ? entry
            : `${entry.day ? `Day ${entry.day}: ` : ''}${entry.text || entry.message || ''}`;
          el.appendChild(p);
        });
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  }

  showSettingsModal() {
    this.openModal({
      title: 'SETTINGS',
      dismissible: true,
      buildContent: (el) => {
        el.innerHTML = '<p>TUI mode active. Remove <code>?tui</code> from the URL to use the standard interface.</p>';
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  }

  // ── Initialization flow ──────────────────────────────────────────────────

  async runInitializationFlow({ roles = [], areas = [], defaultCrewName = 'The Timber Wolves' } = {}) {
    this.clear();
    this.writeHeader('INITIALIZING BC FORESTRY OS');
    this.write('> MOUNTING DRIVES...        OK');
    this.write('> BEC ZONES LOADED...       OK');
    this.write('> MARKET RATES...           UPDATED');
    this.write('> HQ CONNECTION...          CONNECTED');
    this.write('');

    const rawName   = await this.promptText('ENTER CREW HANDLE:', defaultCrewName);
    const crewName  = rawName || defaultCrewName;

    this.clear();
    this.writeHeader('SELECT OPERATOR CLASS');
    this.write(`Crew Handle: ${crewName}`);
    this.write('');

    const roleOpt = await this.promptChoice(
      'Choose your role:',
      roles.map(r => ({ label: r.name, description: r.description, value: r.id, _r: r }))
    );
    const role = roleOpt._r || roles.find(r => r.id === roleOpt.value) || roles[0];

    this.clear();
    this.writeHeader('SELECT OPERATING AREA');
    this.write(`Crew Handle: ${crewName}`);
    this.write(`Role: ${role.name}`);
    this.write('');

    const areaOpt = await this.promptChoice(
      'Choose your operating area:',
      areas.map(a => ({ label: a.name, description: a.becZone || a.region || '', value: a.id, _a: a }))
    );
    const area = areaOpt._a || areas.find(a => a.id === areaOpt.value) || areas[0];

    this.clear();

    const payload = { crewName, role, area };
    window.dispatchEvent(new CustomEvent('initFlowComplete', { detail: payload }));
    return payload;
  }

  prepareForNewGame() {
    this.clear();
    this._choiceResolve = null;
    this._textResolve   = null;
    this._currentOptions = [];
    this._elOptsList.innerHTML = '';
    this._elMetrics.innerHTML  = '';
    this.closeModal();
  }

  // ── Callbacks ────────────────────────────────────────────────────────────

  onRestartRequest(cb) { this._onRestart = cb; }
  onLogRequest(cb)     { this._onLog = cb; }
}
