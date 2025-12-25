/**
 * Display Mode Manager
 * Handles Classic/Modern mode switching and persistence
 */

const STORAGE_KEY = 'bcForestry_displayMode';
const DEFAULT_MODE = 'classic';

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
      return stored === 'modern' ? 'modern' : DEFAULT_MODE;
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
    const newMode = mode === 'modern' ? 'modern' : 'classic';
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
