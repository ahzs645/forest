/**
 * Textmode Renderer
 * A character cell-buffer painted to a full-screen <canvas> — the ascii-anim
 * method (textmode.html path), self-hosted instead of the CDN library so the
 * game stays dependency-free. Everything on screen is a (ch, fg, bg) cell;
 * the drawing API mirrors ascii-anim's helpers (drawText, drawBox, drawHLine)
 * with top-left (col,row) coordinates.
 */

export class TextmodeRenderer {
  constructor(canvas, { fontSize = 15 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fontSize = fontSize;
    this.cols = 0;
    this.rows = 0;
    this._cells = null;
    this.resize();
  }

  _font() {
    const family = getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace';
    return `${this.fontSize}px ${family}`;
  }

  /** Recompute the grid from the viewport. Call on resize. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Scale the type down a step on narrow screens so a useful number of
    // columns survives (ascii-anim's calcFontSize idea).
    this.fontSize = width < 520 ? 12 : width < 900 ? 13 : 15;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.ctx.font = this._font();
    this.cellW = this.ctx.measureText('M').width;
    this.cellH = Math.round(this.fontSize * 1.25);
    this.cols = Math.max(20, Math.floor(width / this.cellW));
    this.rows = Math.max(10, Math.floor(height / this.cellH));
    this._cells = new Array(this.cols * this.rows);
  }

  clear() {
    this._cells.fill(undefined);
  }

  set(col, row, ch, fg, bg) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    this._cells[row * this.cols + col] = { ch, fg, bg };
  }

  drawText(text, col, row, fg, bg) {
    const str = String(text ?? '');
    for (let i = 0; i < str.length; i++) {
      this.set(col + i, row, str[i], fg, bg);
    }
  }

  drawHLine(col, row, len, ch, fg) {
    for (let i = 0; i < len; i++) this.set(col + i, row, ch, fg);
  }

  /** Fill a rectangular region's background (for selection bars). */
  fillRect(col, row, w, h, bg, fg) {
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const cell = this._cells[(row + r) * this.cols + (col + c)];
        if (row + r >= this.rows || col + c >= this.cols) continue;
        this._cells[(row + r) * this.cols + (col + c)] = {
          ch: cell?.ch ?? ' ',
          fg: fg ?? cell?.fg,
          bg
        };
      }
    }
  }

  /** ┌─┤ TITLE ├────┐ box, ascii-anim's drawBox with an embedded title. */
  drawBox(col, row, w, h, fg, title) {
    if (w < 2 || h < 2) return;
    let top = '┌' + '─'.repeat(w - 2) + '┐';
    if (title) {
      const label = `┤ ${title} ├`;
      if (label.length <= w - 4) {
        top = '┌─' + label + '─'.repeat(w - 3 - label.length) + '┐';
      }
    }
    this.drawText(top, col, row, fg);
    this.drawText('└' + '─'.repeat(w - 2) + '┘', col, row + h - 1, fg);
    for (let r = 1; r < h - 1; r++) {
      this.set(col, row + r, '│', fg);
      this.set(col + w - 1, row + r, '│', fg);
    }
  }

  /** Blit a multiline string (art frames) with clipping. */
  drawLines(lines, col, row, fg, maxW = Infinity) {
    lines.forEach((line, r) => {
      this.drawText(String(line).slice(0, maxW), col, row + r, fg);
    });
  }

  /** Paint the buffer. */
  flush(canvasBg) {
    const { ctx, cols, rows, cellW, cellH } = this;
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = this._font();
    ctx.textBaseline = 'middle';

    // Backgrounds first so glyph overhang never gets painted over
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = this._cells[r * cols + c];
        if (cell?.bg) {
          ctx.fillStyle = cell.bg;
          ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = this._cells[r * cols + c];
        if (!cell || !cell.ch || cell.ch === ' ') continue;
        ctx.fillStyle = cell.fg || '#ccc';
        ctx.fillText(cell.ch, c * cellW, r * cellH + cellH / 2);
      }
    }
  }

  /** Pixel → cell coordinates for hit-testing. */
  cellAt(x, y) {
    return {
      col: Math.floor(x / this.cellW),
      row: Math.floor(y / this.cellH)
    };
  }
}
