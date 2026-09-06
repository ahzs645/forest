import { trailState, trailAction, renderTrailFrame } from '../scene/trailView.js';

// Muted terrain, bright crew and warm equipment make the scene readable even
// at phone sizes. Everything is drawn with monospace character cells.
const COLORS = { sky: '#12242c', stars: '#cde4dc', cloud: '#799ca6', sun: '#edc977',
  ridge: '#466775', forest: '#426e69', canopy: '#71ab86', trunk: '#a58c68',
  ground: '#68817b', crew: '#f8e5b5', truck: '#e6bd71', sign: '#dcc695',
  danger: '#ffac87', water: '#87becf', snow: '#dbe9e6', tent: '#d9b57d',
  fire: '#ffc477', office: '#a7bfc0', paper: '#d3dfcc', seedling: '#b5d88a' };

export class TrailView {
  constructor(terminal) {
    this.root = document.createElement('section');
    this.root.className = 'trail-view';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Trail view');
    this.root.innerHTML = `<div class="trail-view-bar"><div class="trail-view-heading"><span class="trail-view-kicker">TRAIL VIEW</span><strong class="trail-view-title"></strong></div><button type="button" class="trail-motion" aria-label="Pause trail animation" aria-pressed="false">Pause</button><button type="button" class="trail-toggle" aria-expanded="true" aria-controls="trail-picture">Hide</button></div><div id="trail-picture" class="trail-picture"><canvas role="img"></canvas><div class="trail-caption"></div><div class="trail-progress" role="progressbar" aria-label="Deployment progress" aria-valuemin="0" aria-valuemax="100"><span></span></div></div>`;
    terminal.before(this.root);
    this.canvas = this.root.querySelector('canvas');
    this.picture = this.root.querySelector('.trail-picture');
    this.motion = this.root.querySelector('.trail-motion');
    this.toggle = this.root.querySelector('.trail-toggle');
    this.title = this.root.querySelector('.trail-view-title');
    this.caption = this.root.querySelector('.trail-caption');
    this.progress = this.root.querySelector('.trail-progress');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.paused = this.reduced.matches;
    this.collapsed = window.innerHeight < 600;
    this.tick = 0;
    this.motion.addEventListener('click', () => {
      this.paused = !this.paused; this.sync();
    });
    this.toggle.addEventListener('click', () => {
      this.collapsed = !this.collapsed; this.sync();
    });
    this.reduced.addEventListener('change', () => { this.paused = this.reduced.matches; this.sync(); });
    document.addEventListener('visibilitychange', () => this.sync());
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(this.canvas);
    this.sync();
  }

  update(journey, progress) {
    const prior = this.state;
    this.state = trailState(journey, progress);
    // Confirmed movement gets a short travelling beat. No invented distance.
    if (prior && prior.role === this.state.role && !this.state.desk
      && this.state.role !== 'silviculture' && this.state.distance > prior.distance) {
      this.action = 'travel'; this.actionUntil = Date.now() + 4000;
    }
    if (prior?.role !== this.state.role) this.action = null;
    this.root.hidden = false;
    this.title.textContent = this.state.place;
    this.progress.setAttribute('aria-valuenow', String(Math.round(this.state.progress)));
    this.progress.firstElementChild.style.width = `${this.state.progress}%`;
    this.describe();
    this.sync();
  }

  describe() {
    if (!this.state) return;
    const s = this.state;
    const beat = this.action === 'camp' ? 'Camp break' : s.obstruction ? 'Route blocked'
      : this.action === 'travel' ? 'On the move' : this.action === 'work' ? 'At work' : s.title;
    this.caption.textContent = `${beat} · ${s.weatherLabel} · ${Math.round(s.progress)}%`;
    this.canvas.setAttribute('aria-label', `${s.title} at ${s.place}. ${beat}. ${s.weatherLabel}. Deployment ${Math.round(s.progress)} percent complete.${s.next ? ` Next: ${s.next}.` : ''}`);
    this.root.dataset.scene = s.desk ? s.role : this.action === 'camp' ? 'camp' : s.role;
    this.root.dataset.blocked = String(Boolean(s.obstruction));
  }

  playAction(label) {
    if (!this.state || this.root.hidden) return;
    const action = trailAction(label);
    if (!action) return;
    this.action = action; this.actionUntil = Date.now() + 4000;
    this.describe(); this.draw();
  }

  sync() {
    clearInterval(this.timer);
    this.timer = null;
    this.picture.hidden = this.collapsed;
    this.root.classList.toggle('is-collapsed', this.collapsed);
    this.toggle.textContent = this.collapsed ? 'Show' : 'Hide';
    this.toggle.setAttribute('aria-expanded', String(!this.collapsed));
    this.motion.textContent = this.paused ? 'Play' : 'Pause';
    this.motion.setAttribute('aria-label', this.paused ? 'Play trail animation' : 'Pause trail animation');
    this.motion.setAttribute('aria-pressed', String(this.paused));
    this.draw();
    if (!this.paused && !this.collapsed && !this.root.hidden && !document.hidden) {
      this.timer = setInterval(() => { this.tick++; this.draw(); }, 180);
    }
  }

  draw() {
    if (!this.state || this.root.hidden || this.collapsed) return;
    if (this.action && Date.now() > this.actionUntil) { this.action = null; this.describe(); }
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    const cols = Math.max(44, Math.min(120, Math.floor(width / (height / 14 * .68))));
    this.frame = renderTrailFrame(this.state, this.tick, { cols, rows: 14, action: this.action });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio);
    }
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = COLORS.sky; ctx.fillRect(0, 0, width, height);
    const cellH = Math.min(height / this.frame.cells.length, width / (cols * .62));
    const cellW = width / cols;
    const x0 = (width - cols * cellW) / 2;
    const y0 = (height - this.frame.cells.length * cellH) / 2;
    ctx.font = `bold ${cellH}px monospace`;
    // Broad windows get a little extra spacing between cells, as a textmode
    // display does. The glyph itself keeps its normal proportions.
    ctx.textBaseline = 'top';
    for (let y = 0; y < this.frame.cells.length; y++) {
      for (let x = 0; x < cols; x++) {
        const { ch, tone } = this.frame.cells[y][x];
        if (ch === ' ') continue;
        ctx.fillStyle = COLORS[tone] || COLORS.crew;
        ctx.fillText(ch, x0 + x * cellW, y0 + y * cellH);
      }
    }
  }

  stop() {
    clearInterval(this.timer); this.timer = null;
    this.root.hidden = true; this.state = null; this.action = null; this.frame = null;
  }
}
