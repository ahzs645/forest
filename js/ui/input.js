/**
 * Input Module
 * Handles text input and choice selection
 */

import { displayMode } from '../displayMode.js';

/**
 * Input handling mixin
 */
export const InputMixin = {
  /**
   * Prompt for text input
   * @param {string} prompt - Prompt message
   * @param {string} placeholder - Input placeholder
   * @returns {Promise<string>} User input
   */
  async promptText(prompt, placeholder = 'Type here...') {
    this.write(prompt);
    this._hideChoices();
    this._showInput(placeholder);

    return new Promise((resolve) => {
      this._pending = resolve;
    });
  },

  /**
   * Prompt for a choice selection
   * @param {string} prompt - Prompt message
   * @param {Object[]} options - Array of { label, value, hint }
   * @returns {Promise<Object>} Selected option
   */
  async promptChoice(prompt, options) {
    this.write(prompt);
    this._hideInput();
    this._showChoices(options);

    return new Promise((resolve) => {
      this._choiceHandler = resolve;
    });
  },

  /**
   * Show text input
   * @private
   */
  _showInput(placeholder) {
    if (!this.inputWrapper || !this.textInput) return;

    this.inputWrapper.hidden = false;
    this.textInput.placeholder = placeholder;
    this.textInput.value = '';
    this.textInput.focus();
  },

  /**
   * Hide text input
   * @private
   */
  _hideInput() {
    if (this.inputWrapper) {
      this.inputWrapper.hidden = true;
    }
  },

  /**
   * Show choice buttons
   * @private
   */
  _showChoices(options) {
    if (!this.choices) return;

    this.choices.innerHTML = '';
    this._currentOptions = options; // Store for mode change re-render

    const isModern = displayMode.isModern();

    // Set container class based on mode
    this.choices.className = isModern
      ? 'choices choices--modern'
      : 'choices choices--classic';

    options.forEach((option, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = isModern ? 'decision-card' : 'choice-btn';

      if (isModern) {
        // Modern card layout with header and checkbox
        btn.innerHTML = `
          <div class="card-header">
            <span class="card-kbd-badge">KEY [${index + 1}]</span>
            <span class="card-checkbox">&#10003;</span>
          </div>
          <div class="card-content">
            <span class="card-label">${option.label}</span>
            ${option.hint || option.description
              ? `<span class="card-hint">${option.hint || option.description}</span>`
              : ''}
          </div>
        `;
      } else {
        // Classic terminal style
        const label = document.createElement('span');
        label.className = 'choice-label';
        label.textContent = `[${index + 1}] ${option.label}`;
        btn.appendChild(label);

        if (option.hint || option.description) {
          const hint = document.createElement('span');
          hint.className = 'choice-hint';
          hint.textContent = option.hint || option.description;
          btn.appendChild(hint);
        }
      }

      btn.addEventListener('click', () => {
        // Save handler before hiding choices (which clears it)
        const handler = this._choiceHandler;
        this.write(`> ${option.label}`, 'term-dim');
        this._hideChoices();
        if (handler) {
          handler(option);
        }
      });

      this.choices.appendChild(btn);
    });

    // Focus first button
    const firstBtn = this.choices.querySelector('.choice-btn, .decision-card');
    if (firstBtn) firstBtn.focus();
  },

  /**
   * Hide choice buttons
   * @private
   */
  _hideChoices() {
    if (this.choices) {
      this.choices.innerHTML = '';
    }
    this._choiceHandler = null;
    this._currentOptions = null;
  },

  /**
   * Handle text input submission
   * @private
   */
  _handleTextSubmit() {
    if (!this.textInput || !this._pending) return;

    const value = this.textInput.value.trim();
    if (!value) return;

    this.write(`> ${value}`, 'term-dim');
    this._hideInput();

    const resolver = this._pending;
    this._pending = null;
    resolver(value);
  },

  /**
   * Check if an input element is focused
   * @private
   */
  _isInputFocused() {
    const active = document.activeElement;
    return active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
  }
};
