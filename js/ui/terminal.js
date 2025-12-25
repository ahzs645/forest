/**
 * Terminal Output Module
 * Handles writing to the terminal display
 */

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
   * Write a pre-formatted ASCII box
   * @param {string} content - Pre-formatted content
   */
  writeBox(content) {
    if (!this.terminal) return;

    const div = document.createElement('div');
    div.className = 'term-box ascii-box';
    div.textContent = content;
    this.terminal.appendChild(div);
    this._scrollToBottom();
  },

  /**
   * Clear the terminal
   */
  clear() {
    if (this.terminal) {
      this.terminal.innerHTML = '';
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
