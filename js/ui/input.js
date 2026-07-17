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

      // Keyboard accelerator: 1-9 for the first nine, 0 for a tenth. Beyond ten
      // options there is no number key, so the badge is dropped rather than
      // promising a shortcut that does not exist.
      const shortcutKey = index < 9 ? String(index + 1) : index === 9 ? '0' : null;
      const prefix = shortcutKey ? `[${shortcutKey}] ` : '';

      if (isModern) {
        // Modern card layout with header and checkbox
        btn.innerHTML = `
          <div class="card-header">
            ${shortcutKey ? `<span class="card-kbd-badge">KEY [${shortcutKey}]</span>` : '<span class="card-kbd-badge card-kbd-badge--none"></span>'}
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
        // Classic mode: TUI option card — key badge, label, effects hint,
        // risk-tag chip (parsed from the " [SAFE]"-style suffix some modes
        // append to labels; shown as a chip instead of inline noise).
        const TAG_RE = /\s*\[(SAFE|RISKY|TRADEOFF)\]\s*/;
        let labelText = String(option.label ?? '');
        const tagMatch = labelText.match(TAG_RE);
        const tag = tagMatch ? tagMatch[1] : null;
        if (tag) labelText = labelText.replace(TAG_RE, ' ').replace(/\s{2,}/g, ' ').trim();

        const key = document.createElement('span');
        key.className = 'choice-key';
        key.textContent = shortcutKey || '·';
        btn.appendChild(key);

        const main = document.createElement('span');
        main.className = 'choice-main';

        const label = document.createElement('span');
        label.className = 'choice-label';
        label.textContent = labelText;
        main.appendChild(label);

        if (option.hint || option.description) {
          const hint = document.createElement('span');
          hint.className = 'choice-hint';
          hint.textContent = option.hint || option.description;
          main.appendChild(hint);
        }
        btn.appendChild(main);

        if (tag) {
          const chip = document.createElement('span');
          chip.className = `choice-tag tag-${tag.toLowerCase()}`;
          chip.textContent = tag;
          btn.appendChild(chip);
        }
      }

      btn.addEventListener('click', () => {
        // Save handler before hiding choices (which clears it)
        const handler = this._choiceHandler;
        this.write(`> ${option.label}`, 'term-dim');
        // Matching action animation on the field radio (chainsaw, boots, ...)
        this.playRadioAction?.(option.label);
        this._hideChoices();
        if (handler) {
          handler(option);
        }
      });

      this.choices.appendChild(btn);
    });

    // Arrow-key navigation: ↑/↓ (and j/k) move the selection bar through the
    // list, wrapping at the ends. Focus IS the selection — Enter activates.
    this.choices.onkeydown = (e) => {
      const isDown = e.key === 'ArrowDown' || e.key === 'j';
      const isUp = e.key === 'ArrowUp' || e.key === 'k';
      if (!isDown && !isUp) return;

      const buttons = Array.from(
        this.choices.querySelectorAll('.choice-btn, .decision-card')
      );
      if (!buttons.length) return;

      e.preventDefault();
      const current = buttons.indexOf(document.activeElement);
      const delta = isDown ? 1 : -1;
      const next = current === -1
        ? (isDown ? 0 : buttons.length - 1)
        : (current + delta + buttons.length) % buttons.length;
      buttons[next].focus();
      buttons[next].scrollIntoView({ block: 'nearest' });
    };

    // Keyboard hint under the list, only when there is a real choice to make
    if (this.choicesHint) {
      this.choicesHint.hidden = isModern || options.length < 2;
    }

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
    if (this.choicesHint) {
      this.choicesHint.hidden = true;
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

    // An empty submit accepts the default: callers pass their fallback via
    // `|| default`, so resolve with '' instead of swallowing the tap —
    // otherwise [ENTER] appears dead, especially on mobile.
    const value = this.textInput.value.trim();
    if (value) {
      this.write(`> ${value}`, 'term-dim');
    }
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
