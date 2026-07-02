/**
 * Terminal Output Module
 * Handles writing to the terminal display
 */

import { playFrames } from '../scene/player.js';
import { matchEventVignette } from '../scene/vignettes.js';
import { buildTravelFrames } from '../scene/travelStrip.js';

// Cap on retained terminal lines; old lines are evicted from the top.
// Nodes carrying .scene-keep (actively animating scenes) are never evicted.
const MAX_LINES = 400;

/**
 * Terminal output mixin - provides methods for writing to the terminal
 */
export const TerminalMixin = {
  /**
   * Write a line to the terminal
   * @param {string} text - Text to display
   * @param {string} className - Optional CSS class
   */
  write(text, className = '') {
    if (!this.terminal) return;

    const line = document.createElement('div');
    line.className = `term-line ${className}`.trim();
    line.textContent = text;
    this.terminal.appendChild(line);
    this._capLines();
    this._scrollToBottom();
  },

  /**
   * Write HTML content to the terminal
   * @param {string} html - HTML string
   */
  writeHTML(html) {
    if (!this.terminal) return;

    const div = document.createElement('div');
    div.className = 'term-line';
    div.innerHTML = html;
    this.terminal.appendChild(div);
    this._capLines();
    this._scrollToBottom();
  },

  /**
   * Write a header line
   * @param {string} text - Header text
   */
  writeHeader(text) {
    this.write(text, 'term-header');
  },

  /**
   * Write a divider
   * @param {string} label - Optional label
   */
  writeDivider(label = '') {
    if (!this.terminal) return;

    const div = document.createElement('div');
    div.className = 'term-divider';
    div.textContent = label || '─'.repeat(40);
    this.terminal.appendChild(div);
    this._capLines();
    this._scrollToBottom();
  },

  /**
   * Write a warning message
   * @param {string} text - Warning text
   */
  writeWarning(text) {
    this.write(`⚠ ${text}`, 'term-warning');
  },

  /**
   * Write a danger/error message
   * @param {string} text - Error text
   */
  writeDanger(text) {
    this.write(`✗ ${text}`, 'term-danger');
  },

  /**
   * Write a positive/success message
   * @param {string} text - Success text
   */
  writePositive(text) {
    this.write(`✓ ${text}`, 'term-positive');
  },

  /**
   * Alias for writePositive
   * @param {string} text - Success text
   */
  writeSuccess(text) {
    this.writePositive(text);
  },

  /**
   * Write an informational message
   * @param {string} text - Info text
   */
  writeInfo(text) {
    this.write(text, 'term-dim');
  },

  /**
   * Write a pre-formatted ASCII box
   * @param {string} content - Pre-formatted content
   */
  writeBox(content) {
    if (!this.terminal) return;

    const div = document.createElement('div');
    div.className = 'term-box ascii-box';
    div.textContent = content;
    this.terminal.appendChild(div);
    this._capLines();
    this._scrollToBottom();
  },

  /**
   * Clear the terminal
   */
  clear() {
    if (this.terminal) {
      this.terminal.innerHTML = '';
    }
    // A campaign sets a persistent banner (season + year meters) so the
    // campaign layer stays visible inside deployments, whose day headers
    // clear the screen every render.
    if (this.campaignBanner) {
      this.write(this.campaignBanner, 'term-dim');
    }
  },

  /**
   * Play a short animated vignette for an event, when art matches.
   * Non-blocking: the animation loops a few times beside the decision,
   * then freezes on its last frame.
   * @param {Object} event - Event definition
   */
  playEventVignette(event) {
    if (!this.terminal) return;
    const vignette = matchEventVignette(event);
    if (!vignette) return;
    playFrames(this.terminal, vignette.frames, {
      delay: vignette.delay,
      loops: 3,
      holdLastFrame: true,
    });
  },

  /**
   * Play the travel strip for a day's movement. Resolves when the animation
   * completes (tap or keypress skips ahead).
   * @param {Object} ctx - See buildTravelFrames
   * @returns {Promise<void>}
   */
  playTravelStrip(ctx) {
    if (!this.terminal) return Promise.resolve();
    return playFrames(this.terminal, buildTravelFrames(ctx), {
      delay: 150,
      loops: 1,
      holdLastFrame: true,
    });
  },

  /**
   * Evict oldest lines past the cap, skipping live scene mounts
   * @private
   */
  _capLines() {
    if (!this.terminal) return;
    while (this.terminal.children.length > MAX_LINES) {
      let candidate = this.terminal.firstElementChild;
      while (candidate && candidate.classList.contains('scene-keep')) {
        candidate = candidate.nextElementSibling;
      }
      if (!candidate) return;
      candidate.remove();
    }
  },

  /**
   * Scroll terminal to bottom
   * @private
   */
  _scrollToBottom() {
    if (this.terminal) {
      this.terminal.scrollTop = this.terminal.scrollHeight;
    }
  }
};
