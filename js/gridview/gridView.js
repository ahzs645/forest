/**
 * Grid View
 * The full-ASCII alternate renderer. The DOM game screen keeps running as
 * the invisible source of truth; this projects it onto a TextmodeRenderer
 * cell grid every frame — panes drawn with box characters, choices as menu
 * rows with an inverse-video selection bar, art panes blitted as frames.
 * Clicks and taps are hit-tested against cell regions and forwarded to the
 * real DOM controls, so game logic and keyboard handling never notice
 * which renderer is on.
 */

import { TextmodeRenderer } from './renderer.js';
import { progressBar } from '../ascii.js';

const SIDEBAR_W = 34;
const MIN_COLS_FOR_SIDEBAR = 96;

function wrap(text, width) {
  const out = [];
  for (const raw of String(text ?? '').split('\n')) {
    let line = raw;
    if (!line.length) {
      out.push('');
      continue;
    }
    while (line.length > width) {
      let cut = line.lastIndexOf(' ', width);
      if (cut <= 0) cut = width;
      out.push(line.slice(0, cut));
      line = line.slice(cut).replace(/^ /, '');
    }
    out.push(line);
  }
  return out;
}

export class GridView {
  constructor(ui) {
    this.ui = ui;
    this.canvas = document.getElementById('grid-canvas');
    this.enabled = false;
    this._dirty = true;
    this._regions = [];
    this._scrollOffset = 0;
    this._observers = [];
    this._logLineCount = 0;

    if (!this.canvas) return;
    this.renderer = new TextmodeRenderer(this.canvas);

    this._onResize = () => {
      this.renderer.resize();
      this._dirty = true;
    };
    this._onFocus = () => { this._dirty = true; };
    this._onClick = (e) => this._handleClick(e);
    this._onWheel = (e) => this._handleWheel(e);
  }

  enable() {
    if (!this.canvas || this.enabled) return;
    this.enabled = true;
    this.canvas.hidden = false;
    this.renderer.resize();
    this._scrollOffset = 0;

    window.addEventListener('resize', this._onResize);
    document.addEventListener('focusin', this._onFocus);
    document.addEventListener('focusout', this._onFocus);
    this.canvas.addEventListener('click', this._onClick);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });

    const observer = new MutationObserver(() => { this._dirty = true; });
    observer.observe(document.querySelector('.game-wrapper'), {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'style', 'value']
    });
    this._observers.push(observer);

    this.ui.textInput?.addEventListener('input', this._onFocus);

    // Repaint loop: mutation-driven, with a heartbeat for the input cursor
    // blink and any animation the observer misses.
    this._timer = setInterval(() => {
      const inputVisible = this.ui.inputWrapper && !this.ui.inputWrapper.hidden;
      if (this._dirty || inputVisible) this._draw();
    }, 120);
    this._draw();
  }

  disable() {
    if (!this.canvas || !this.enabled) return;
    this.enabled = false;
    this.canvas.hidden = true;
    clearInterval(this._timer);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('focusin', this._onFocus);
    document.removeEventListener('focusout', this._onFocus);
    this.canvas.removeEventListener('click', this._onClick);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.ui.textInput?.removeEventListener('input', this._onFocus);
    for (const observer of this._observers) observer.disconnect();
    this._observers = [];
  }

  // ── input routing ──────────────────────────────────

  _handleClick(e) {
    const { col, row } = this.renderer.cellAt(e.offsetX, e.offsetY);
    for (const region of this._regions) {
      if (row >= region.y && row < region.y + region.h && col >= region.x && col < region.x + region.w) {
        region.action();
        return;
      }
    }
  }

  _handleWheel(e) {
    if (!this._logGeom) return;
    const { col, row } = this.renderer.cellAt(e.offsetX, e.offsetY);
    const g = this._logGeom;
    if (col < g.x || col >= g.x + g.w || row < g.y || row >= g.y + g.h) return;
    e.preventDefault();
    const max = Math.max(0, g.totalLines - g.h);
    this._scrollOffset = Math.max(0, Math.min(max, this._scrollOffset + (e.deltaY > 0 ? -3 : 3)));
    this._dirty = true;
  }

  // ── painting ───────────────────────────────────────

  _colors() {
    const style = getComputedStyle(document.body);
    const get = (name, fallback) => (style.getPropertyValue(name) || fallback).trim();
    return {
      canvas: get('--canvas', '#0a0e14'),
      border: get('--border', '#2b3646'),
      borderStrong: get('--border-strong', '#40506a'),
      text: get('--text', '#c3cedd'),
      bright: get('--text-bright', '#eaf1fa'),
      muted: get('--text-muted', '#8494ab'),
      dim: get('--text-dim', '#55637a'),
      accent: get('--accent', '#58a6ff'),
      accentContrast: get('--accent-contrast', '#04121f'),
      ok: get('--ok', '#3fb950'),
      warn: get('--warn', '#d29922'),
      danger: get('--danger', '#f85149'),
      surface: get('--surface', '#10161f')
    };
  }

  _draw() {
    this._dirty = false;
    this._regions = [];
    const t = this.renderer;
    const C = this._colors();
    t.clear();

    const cols = t.cols;
    const rows = t.rows;
    const hasSidebar = cols >= MIN_COLS_FOR_SIDEBAR;
    const sideW = hasSidebar ? SIDEBAR_W : 0;
    const mainX = sideW;
    const mainW = cols - sideW;

    this._drawHeader(t, C, cols);
    this._drawStatusStrip(t, C, cols);

    const top = 2;
    const bottom = rows - 1; // footer row

    // Narrow screens: [S] opens the status view as a full grid overlay
    // (there is no sidebar to project it into).
    if (!hasSidebar && this.ui._isPanelOpen) {
      t.drawBox(0, top, cols, bottom - top, C.borderStrong, 'STATUS REPORT');
      this._drawSidebar(t, C, 1, top + 1, cols - 2, bottom - top - 2);
      const close = '[S] close';
      t.drawText(close, cols - close.length - 3, top, C.warn);
      this._regions.push({
        x: 0, y: top, w: cols, h: 1,
        action: () => this.ui.closeStatusPanel()
      });
      this._drawFooter(t, C, rows - 1, cols);
      t.flush(C.canvas);
      return;
    }

    // Options pane height: measured from live choices/input
    const optionRows = this._optionEntries();
    const inputVisible = this.ui.inputWrapper && !this.ui.inputWrapper.hidden;
    let optH = 0;
    if (optionRows.length) optH = Math.min(optionRows.length + 2, Math.max(5, Math.floor(rows * 0.45)));
    else if (inputVisible) optH = 3;

    const logH = bottom - top - optH - (hasSidebar ? 0 : (this.ui._missionStatus ? 1 : 0));

    if (hasSidebar) this._drawSidebar(t, C, 0, top, sideW, bottom - top);
    if (!hasSidebar && this.ui._missionStatus) this._drawMissionStrip(t, C, 0, top, cols);

    const logY = top + (!hasSidebar && this.ui._missionStatus ? 1 : 0);
    this._drawLog(t, C, mainX, logY, mainW, logH);

    if (optionRows.length) {
      this._drawOptions(t, C, mainX, bottom - optH, mainW, optH, optionRows);
    } else if (inputVisible) {
      this._drawInput(t, C, mainX, bottom - optH, mainW);
    }

    this._drawFooter(t, C, rows - 1, cols);
    t.flush(C.canvas);
  }

  _drawHeader(t, C, cols) {
    const title = cols >= 84 ? '▲ BC FORESTRY TRAIL' : '▲ BCFT';
    t.drawText(title, 1, 0, C.bright);

    // Hotkeys lay out right-to-left; whatever would collide with the title
    // is dropped rather than smeared over it.
    const buttons = Array.from(document.querySelectorAll('.header-actions .header-btn'))
      .map((btn) => ({ label: btn.textContent.trim(), click: () => btn.click() }))
      .reverse();
    let x = cols - 1;
    for (const btn of buttons) {
      x -= btn.label.length;
      if (x <= title.length + 3) break;
      t.drawText(btn.label, x, 0, C.muted);
      this._regions.push({ x, y: 0, w: btn.label.length, h: 1, action: btn.click });
      x -= 2;
    }
  }

  _drawStatusStrip(t, C, cols) {
    const items = Array.from(document.querySelectorAll('#status-bar .status-item'));
    let x = 1;
    for (const item of items) {
      const label = item.querySelector('.status-label')?.textContent.trim() || '';
      const value = (item.querySelector('.status-value')?.textContent || '').replace(/\s+/g, ' ').trim();
      if (x > 1) {
        t.drawText('│', x, 1, C.border);
        x += 2;
      }
      t.drawText(label, x, 1, C.dim);
      x += label.length + 1;
      t.drawText(value, x, 1, C.bright);
      x += value.length + 1;
      if (x >= cols - 8) break;
    }
  }

  _drawSidebar(t, C, x, y, w, h) {
    const innerX = x + 1;
    const innerW = w - 3;
    let row = y;
    const limit = y + h;

    const section = (title) => {
      if (row >= limit - 1) return false;
      t.drawText(`── ${title} `.padEnd(innerW + 1, '─'), innerX, row, C.dim);
      row += 1;
      return true;
    };
    const line = (text, fg) => {
      if (row >= limit) return;
      t.drawText(String(text).slice(0, innerW), innerX + 1, row, fg);
      row += 1;
    };

    // Vertical divider between sidebar and main pane
    for (let r = y; r < limit; r++) t.set(x + w - 1, r, '│', C.border);

    // FIELD RADIO
    const radioVisible = this.ui.radioSection && !this.ui.radioSection.hidden
      && this.ui.radioPanel?.textContent;
    if (radioVisible && section('FIELD RADIO')) {
      const frame = this.ui.radioPanel.textContent.split('\n');
      const artW = Math.max(...frame.map((l) => l.length));
      const artX = innerX + Math.max(1, Math.floor((innerW - artW) / 2));
      t.drawLines(frame, artX, row, C.accent, innerW);
      row += frame.length + 1;
    }

    // MISSION
    const mission = this.ui._missionStatus;
    if (mission && section('MISSION')) {
      if (mission.objective) {
        for (const l of wrap(mission.objective, innerW - 1)) line(l, C.bright);
      }
      if (mission.meter && Number.isFinite(mission.meter.value)) {
        const v = Math.max(0, Math.min(100, Math.round(mission.meter.value)));
        const label = (mission.meter.label || 'PROGRESS').toUpperCase();
        const text = mission.meter.text || `${v}%`;
        line(`${label}${' '.repeat(Math.max(1, innerW - 1 - label.length - text.length))}${text}`, C.dim);
        line(progressBar(v, innerW - 1, false), C.accent);
      }
      for (const fact of mission.facts || []) {
        if (fact?.value === undefined || fact?.value === null || fact?.value === '') continue;
        const label = String(fact.label);
        const value = String(fact.value);
        const pad = Math.max(1, innerW - 1 - label.length - value.length);
        const tone = fact.tone === 'danger' ? C.danger : fact.tone === 'warn' ? C.warn : fact.tone === 'ok' ? C.ok : C.text;
        if (row >= limit) break;
        t.drawText(label.slice(0, innerW), innerX + 1, row, C.muted);
        t.drawText(value.slice(0, innerW - label.length - 1), innerX + 1 + label.length + pad, row, tone);
        row += 1;
      }
      for (const item of mission.checklist || []) {
        line(`${item.done ? '[x]' : '[ ]'} ${item.label}`, item.done ? C.ok : C.text);
      }
      if (mission.guidance) {
        for (const l of wrap(`> ${mission.guidance}`, innerW - 1)) line(l, C.accent);
      }
      for (const alert of mission.alerts || []) {
        const tone = alert.level === 'danger' ? C.danger : alert.level === 'ok' ? C.ok : C.warn;
        for (const l of wrap(`▎${alert.text}`, innerW - 1)) line(l, tone);
      }
      row += 1;
    }

    // CREW
    const crew = Array.from(document.querySelectorAll('#crew-panel .crew-member, #crew-panel .protagonist-status'));
    if (crew.length && section('CREW')) {
      for (const member of crew) {
        if (row >= limit) break;
        const name = member.querySelector('.crew-name')?.textContent.trim();
        const role = member.querySelector('.crew-role')?.textContent.trim();
        const hp = member.querySelector('.crew-stats')?.textContent.replace(/\s+/g, ' ').trim();
        const status = member.classList.contains('critical') ? C.danger
          : member.classList.contains('injured') ? C.warn
            : member.classList.contains('inactive') ? C.dim : C.text;
        if (name) {
          line(`${name}${role ? ` · ${role}` : ''}`, status);
          if (hp) line(` ${hp}`, C.muted);
        } else {
          for (const l of wrap(member.textContent.replace(/\s+/g, ' ').trim(), innerW - 1).slice(0, 4)) line(l, C.text);
        }
      }
      row += 1;
    }

    // SUPPLIES
    const supplies = Array.from(document.querySelectorAll('#resources-panel .resource-row'));
    if (supplies.length && section('SUPPLIES')) {
      for (const supply of supplies) {
        if (row >= limit) break;
        const label = supply.querySelector('.resource-label')?.textContent.trim() || '';
        const bar = supply.querySelector('.resource-bar-text');
        const barText = bar?.textContent.trim() || '';
        const value = supply.querySelector('.resource-value')?.textContent.trim() || '';
        const tone = bar?.classList.contains('critical') ? C.danger
          : bar?.classList.contains('low') ? C.warn : C.text;
        t.drawText(label.padEnd(7).slice(0, 7), innerX + 1, row, C.muted);
        t.drawText(barText.slice(0, innerW - 14), innerX + 8, row, tone);
        t.drawText(value.padStart(5).slice(0, 6), innerX + innerW - 6, row, C.bright);
        row += 1;
      }
      row += 1;
    }

    // LOCATION
    const location = document.getElementById('location-panel');
    const locationText = location?.textContent.trim();
    if (locationText && section('LOCATION')) {
      const parts = Array.from(location.children)
        .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      for (const part of parts) {
        for (const l of wrap(part, innerW - 1)) line(l, C.muted);
        if (row >= limit) break;
      }
    }
  }

  _drawMissionStrip(t, C, x, y, w) {
    const mission = this.ui._missionStatus;
    if (!mission) return;
    let sx = x + 1;
    if (mission.meter && Number.isFinite(mission.meter.value)) {
      const bar = progressBar(mission.meter.value, 6, false);
      t.drawText(bar, sx, y, C.accent);
      sx += bar.length + 1;
      const text = mission.meter.text || '';
      t.drawText(text, sx, y, C.bright);
      sx += text.length + 1;
    }
    t.drawText(String(mission.objective || mission.guidance || '').slice(0, w - sx - 1), sx, y, C.muted);
  }

  _logStyles(C) {
    return {
      'term-header': C.bright,
      'term-dim': C.dim,
      'term-warning': C.warn,
      'term-danger': C.danger,
      'term-positive': C.ok,
      'term-divider': C.dim
    };
  }

  _drawLog(t, C, x, y, w, h) {
    t.drawBox(x, y, w, h, C.borderStrong, 'FIELD LOG');
    const innerX = x + 2;
    const innerW = w - 4;
    const innerH = h - 2;
    const styles = this._logStyles(C);

    // Flatten the terminal DOM into styled, wrapped lines
    const lines = [];
    for (const node of this.ui.terminal?.children || []) {
      const fg = [...node.classList].map((cls) => styles[cls]).find(Boolean) || C.text;
      const isPre = node.tagName === 'PRE' || node.classList.contains('term-box')
        || node.classList.contains('scene-canvas') || node.classList.contains('ascii-box');
      if (isPre) {
        for (const line of node.textContent.split('\n')) lines.push({ text: line.slice(0, innerW), fg: C.accent });
      } else {
        const text = node.textContent.replace(/\s+/g, ' ').trim();
        if (!text) { lines.push({ text: '', fg }); continue; }
        for (const line of wrap(text, innerW)) lines.push({ text: line, fg });
        if (node.classList.contains('term-header')) {
          lines.push({ text: '─'.repeat(Math.min(innerW, 40)), fg: C.border });
        }
      }
    }

    // New content snaps the view back to the bottom
    if (lines.length !== this._logLineCount) {
      this._logLineCount = lines.length;
      this._scrollOffset = 0;
    }
    this._logGeom = { x: innerX, y: y + 1, w: innerW, h: innerH, totalLines: lines.length };

    const start = Math.max(0, lines.length - innerH - this._scrollOffset);
    const visible = lines.slice(start, start + innerH);
    visible.forEach((line, r) => t.drawText(line.text, innerX, y + 1 + r, line.fg));

    if (this._scrollOffset > 0) {
      t.drawText(`↓ ${this._scrollOffset} more`, x + w - 12, y + h - 1, C.warn);
    }
  }

  _optionEntries() {
    return Array.from(this.ui.choices?.querySelectorAll('button') || []).map((btn) => ({
      key: btn.querySelector('.choice-key')?.textContent.trim() || '',
      label: btn.querySelector('.choice-label')?.textContent.trim()
        || btn.textContent.replace(/\s+/g, ' ').trim(),
      hint: btn.querySelector('.choice-hint')?.textContent.trim() || '',
      tag: btn.querySelector('.choice-tag')?.textContent.trim() || '',
      focused: document.activeElement === btn,
      click: () => btn.click()
    }));
  }

  _drawOptions(t, C, x, y, w, h, entries) {
    t.drawBox(x, y, w, h, C.borderStrong, 'RESPOND');
    const innerX = x + 2;
    const innerW = w - 4;
    const visible = entries.slice(0, h - 2);
    const focusIndex = entries.findIndex((e) => e.focused);

    visible.forEach((entry, r) => {
      const rowY = y + 1 + r;
      const tagText = entry.tag ? ` ‹${entry.tag}›` : '';
      let text = `${entry.key ? `${entry.key} ` : '  '}${entry.label}`;
      if (entry.hint) text += ` · ${entry.hint}`;
      text = text.slice(0, innerW - tagText.length - 3);

      if (entry.focused) {
        t.fillRect(x + 1, rowY, w - 2, 1, C.accent);
        t.drawText(`> ${text}`, innerX, rowY, C.accentContrast, C.accent);
        if (entry.tag) t.drawText(tagText, x + w - 2 - tagText.length, rowY, C.accentContrast, C.accent);
      } else {
        t.drawText('  ' + text.slice(2), innerX, rowY, C.text);
        if (entry.key) t.drawText(entry.key, innerX, rowY, C.dim);
        if (entry.tag) {
          const tone = /SAFE/.test(entry.tag) ? C.ok : /RISKY/.test(entry.tag) ? C.danger : C.warn;
          t.drawText(tagText, x + w - 2 - tagText.length, rowY, tone);
        }
      }
      this._regions.push({ x: x + 1, y: rowY, w: w - 2, h: 1, action: entry.click });
    });

    if (entries.length > visible.length) {
      t.drawText(`… ${entries.length - visible.length} more (number keys work)`, innerX, y + h - 1, C.warn);
    }
    // Keep the focused-but-clipped case honest
    if (focusIndex >= visible.length && focusIndex !== -1) {
      t.drawText('▼', x + w - 3, y + h - 1, C.accent);
    }
  }

  _drawInput(t, C, x, y, w) {
    t.drawBox(x, y, w, 3, C.borderStrong, 'INPUT');
    const value = this.ui.textInput?.value || '';
    const placeholder = this.ui.textInput?.placeholder || '';
    const blink = Math.floor(Date.now() / 500) % 2 === 0;
    const shown = value || '';
    t.drawText('> ', x + 2, y + 1, C.accent);
    if (shown) {
      t.drawText(shown.slice(-(w - 10)), x + 4, y + 1, C.bright);
    } else {
      t.drawText(placeholder.slice(0, w - 10), x + 4, y + 1, C.dim);
    }
    if (blink) t.drawText('█', x + 4 + Math.min(shown.length, w - 10), y + 1, C.accent);
    const enter = '[ENTER]';
    t.drawText(enter, x + w - 2 - enter.length, y + 1, C.muted);
    this._regions.push({ x: x + 1, y: y + 1, w: w - 2, h: 1, action: () => this.ui.textInput?.focus() });
    this._regions.push({
      x: x + w - 2 - enter.length, y: y + 1, w: enter.length, h: 1,
      action: () => this.ui.submitBtn?.click()
    });
  }

  _drawFooter(t, C, y, cols) {
    const hint = '↑↓ select · Enter confirm · 1–9 jump · S status · G glossary · ? help';
    t.drawText(hint.slice(0, cols - 2), 1, y, C.dim);
  }
}
