/**
 * Display Mode Manager
 * Handles Classic/Modern/Grid mode switching and persistence.
 * 'grid' is the full-ASCII canvas renderer (js/gridview/) — the DOM game
 * screen keeps running invisibly as the source of truth and the grid
 * projects it, so everything except pixels behaves like classic mode.
 */

const STORAGE_KEY = 'bcForestry_displayMode';
const DEFAULT_MODE = 'classic';
const VALID_MODES = new Set(['classic', 'modern', 'grid']);

export class DisplayModeManager {
  constructor() {
    this._mode = this._loadMode();
    this._listeners = [];
  }

  /**
   * Load mode from localStorage
   * @returns {string} 'classic' or 'modern'
   */
  _loadMode() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return VALID_MODES.has(stored) ? stored : DEFAULT_MODE;
    } catch {
      return DEFAULT_MODE;
    }
  }

  /**
   * Save mode to localStorage
   * @param {string} mode - The mode to save
   */
  _saveMode(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage may be unavailable (private browsing, etc.)
    }
  }

  /**
   * Get current display mode
   * @returns {string} 'classic' or 'modern'
   */
  get mode() {
    return this._mode;
  }

  /**
   * Set display mode
   * @param {string} mode - 'classic' or 'modern'
   */
  setMode(mode) {
    const newMode = VALID_MODES.has(mode) ? mode : 'classic';
    if (this._mode === newMode) return;

    this._mode = newMode;
    this._saveMode(newMode);
    document.body.dataset.displayMode = newMode;

    // Notify listeners
    this._listeners.forEach(fn => fn(newMode));
  }

  /**
   * Toggle between classic and modern mode
   */
  toggle() {
    this.setMode(this._mode === 'classic' ? 'modern' : 'classic');
  }

  /**
   * Check if current mode is modern
   * @returns {boolean}
   */
  isModern() {
    return this._mode === 'modern';
  }

  /**
   * Check if current mode is classic
   * @returns {boolean}
   */
  isClassic() {
    return this._mode === 'classic';
  }

  /**
   * Check if current mode is the ASCII grid renderer
   * @returns {boolean}
   */
  isGrid() {
    return this._mode === 'grid';
  }

  /**
   * Register a callback for mode changes
   * @param {Function} callback - Function to call when mode changes
   * @returns {Function} Unsubscribe function
   */
  onChange(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(fn => fn !== callback);
    };
  }

  /**
   * Apply current mode to the DOM
   * Should be called on page load
   */
  apply() {
    document.body.dataset.displayMode = this._mode;
  }
}

// Singleton instance
export const displayMode = new DisplayModeManager();
