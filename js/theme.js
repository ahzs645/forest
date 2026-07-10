/**
 * Theme Manager
 * Handles color theme (green phosphor / amber CRT / ice) and the CRT
 * scanline effect, persisted to localStorage. Applied as data attributes
 * on <body>: data-theme and data-crt.
 */

const THEME_KEY = 'bcForestry_theme';
const CRT_KEY = 'bcForestry_crt';

export const THEMES = [
  { id: 'dark', label: 'TUI dark' },
  { id: 'green', label: 'Green phosphor' },
  { id: 'amber', label: 'Amber CRT' },
  { id: 'ice', label: 'Ice' }
];

const DEFAULT_THEME = 'dark';
const VALID_THEMES = new Set(THEMES.map(t => t.id));

export class ThemeManager {
  constructor() {
    this._theme = this._load(THEME_KEY, DEFAULT_THEME, v => VALID_THEMES.has(v));
    // Scanlines read as CRT-retro; the default TUI-dark theme is cleaner
    // without them, so they're opt-in.
    this._crt = this._load(CRT_KEY, 'off', v => v === 'on' || v === 'off');
  }

  _load(key, fallback, isValid) {
    try {
      const stored = localStorage.getItem(key);
      return stored && isValid(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  }

  _save(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage may be unavailable (private browsing, etc.)
    }
  }

  get theme() {
    return this._theme;
  }

  get crt() {
    return this._crt === 'on';
  }

  setTheme(theme) {
    if (!VALID_THEMES.has(theme) || theme === this._theme) return;
    this._theme = theme;
    this._save(THEME_KEY, theme);
    this.apply();
  }

  setCrt(enabled) {
    this._crt = enabled ? 'on' : 'off';
    this._save(CRT_KEY, this._crt);
    this.apply();
  }

  /** Apply current theme to the DOM. Call once on boot. */
  apply() {
    document.body.dataset.theme = this._theme;
    document.body.dataset.crt = this._crt;
  }
}

// Singleton instance
export const theme = new ThemeManager();
