/**
 * Modal Module
 * Handles modal dialogs, help, glossary, and settings
 */

import { displayMode } from '../displayMode.js';
import { GLOSSARY_TERMS } from '../data/glossary.js';
import { LEGACY_GLOSSARY_TERMS } from '../data/legacyGlossary.js';

/**
 * Modal management mixin
 */
export const ModalMixin = {
  /**
   * Show a modal dialog
   * @param {Object} options - Modal options
   */
  showModal(options) {
    const { title, content, actions = [] } = options;

    if (this.modalTitle) {
      this.modalTitle.textContent = title || '';
    }

    if (this.modalBody) {
      if (typeof content === 'string') {
        this.modalBody.innerHTML = `<p>${content}</p>`;
      } else if (content instanceof HTMLElement) {
        this.modalBody.innerHTML = '';
        this.modalBody.appendChild(content);
      }
    }

    if (this.modalActions) {
      this.modalActions.innerHTML = '';

      const buttons = actions.length ? actions : [{ label: 'OK', primary: true }];

      for (const action of buttons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `modal-btn ${action.primary ? 'primary' : ''}`.trim();
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          this.closeModal();
          if (action.onClick) action.onClick();
        });
        this.modalActions.appendChild(btn);
      }
    }

    if (this.modal) {
      this.modal.hidden = false;
    }
  },

  /**
   * Open a modal dialog (game.js-style interface)
   * @param {Object} options - Modal options
   */
  openModal(options) {
    const { title, dismissible = false, buildContent, actions = [], onClose } = options;

    if (this.modalTitle) {
      this.modalTitle.textContent = title || '';
    }

    if (this.modalBody) {
      this.modalBody.innerHTML = '';
      if (buildContent) {
        buildContent(this.modalBody);
      }
    }

    if (this.modalActions) {
      this.modalActions.innerHTML = '';

      for (const action of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `modal-btn ${action.primary ? 'primary' : ''}`.trim();
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          if (action.onSelect) action.onSelect();
        });
        this.modalActions.appendChild(btn);
      }
    }

    this._modalOnClose = onClose;
    this._modalDismissible = dismissible;

    if (this.modal) {
      this.modal.hidden = false;
    }
  },

  /**
   * Close the modal
   */
  closeModal() {
    if (this.modal) {
      this.modal.hidden = true;
    }
    if (this._modalOnClose) {
      this._modalOnClose();
      this._modalOnClose = null;
    }
  },

  /**
   * Check if modal is currently open
   * @returns {boolean}
   */
  isModalOpen() {
    return this.modal && !this.modal.hidden;
  },

  /**
   * Show help modal
   */
  showHelp() {
    this.showModal({
      title: 'HOW TO PLAY',
      content: `
        <p><strong>BC FORESTRY TRAIL</strong></p>
        <p>Guide your crew through the northern BC wilderness.</p>
        <br>
        <p><strong>Controls:</strong></p>
        <p>[1-9] - Select options</p>
        <p>[S] - Toggle status panel</p>
        <p>[L] - View journey log</p>
        <p>[ESC] - Close panels</p>
        <br>
        <p><strong>Field Roles:</strong></p>
        <p>Survey forest blocks during 8-9 hour shifts. Keep radio contact while managing fuel, food, and equipment.</p>
        <br>
        <p><strong>Desk Roles:</strong></p>
        <p>Process permits against a deadline. Manage budget and stakeholders.</p>
        <br>
        <p><strong>Keep your crew healthy and reach your goal!</strong></p>
      `,
      actions: [{ label: 'Got it!', primary: true }]
    });
  },

  /**
   * Show settings modal with display mode toggle
   */
  showSettingsModal() {
    this.openModal({
      title: 'SETTINGS',
      dismissible: true,
      buildContent: (container) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'settings-form';

        // Display Mode Section
        const displaySection = document.createElement('div');
        displaySection.className = 'settings-section';
        displaySection.innerHTML = `
          <div class="settings-label">DISPLAY MODE</div>
          <div class="settings-toggle-group">
            <button type="button" class="settings-toggle-btn ${displayMode.mode === 'classic' ? 'active' : ''}" data-mode="classic">
              <span class="toggle-icon">[T]</span>
              <span class="toggle-label">Classic</span>
              <span class="toggle-desc">Terminal style</span>
            </button>
            <button type="button" class="settings-toggle-btn ${displayMode.mode === 'modern' ? 'active' : ''}" data-mode="modern">
              <span class="toggle-icon">[C]</span>
              <span class="toggle-label">Modern</span>
              <span class="toggle-desc">Card layout</span>
            </button>
          </div>
        `;

        // Bind toggle buttons
        displaySection.querySelectorAll('.settings-toggle-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            displayMode.setMode(btn.dataset.mode);
            displaySection.querySelectorAll('.settings-toggle-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.mode === displayMode.mode);
            });
          });
        });

        wrapper.appendChild(displaySection);
        container.appendChild(wrapper);
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  },

  /**
   * Show glossary modal
   */
  showGlossary() {
    const combined = [...(Array.isArray(GLOSSARY_TERMS) ? GLOSSARY_TERMS : []), ...(Array.isArray(LEGACY_GLOSSARY_TERMS) ? LEGACY_GLOSSARY_TERMS : [])]
      .filter((t) => t && typeof t.term === 'string' && typeof t.description === 'string');

    const seen = new Set();
    const terms = combined.filter((t) => {
      const key = t.term.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.term.localeCompare(b.term));

    this.openModal({
      title: 'GLOSSARY',
      dismissible: true,
      buildContent: (container) => {
        const wrapper = document.createElement('div');

        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search terms...';
        input.className = 'text-input';
        input.style.width = '100%';
        input.style.marginBottom = '12px';

        const list = document.createElement('div');
        list.style.maxHeight = '52vh';
        list.style.overflow = 'auto';

        const render = (query) => {
          const q = (query || '').trim().toLowerCase();
          const filtered = q
            ? terms.filter((t) => t.term.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
            : terms;

          list.innerHTML = '';

          if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No matches.';
            empty.className = 'term-dim';
            list.appendChild(empty);
            return;
          }

          for (const t of filtered.slice(0, 80)) {
            const row = document.createElement('div');
            row.style.marginBottom = '10px';

            const title = document.createElement('div');
            title.textContent = t.term;
            title.style.fontWeight = '700';

            const desc = document.createElement('div');
            desc.textContent = t.description;
            desc.className = 'term-dim';
            desc.style.marginTop = '2px';

            row.appendChild(title);
            row.appendChild(desc);
            list.appendChild(row);
          }
        };

        input.addEventListener('input', () => render(input.value));

        wrapper.appendChild(input);
        wrapper.appendChild(list);
        container.appendChild(wrapper);

        render('');
        setTimeout(() => input.focus(), 0);
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  },

  /**
   * Show journey log modal
   * @param {Object[]} logEntries - Formatted log entries
   */
  showLog(logEntries) {
    if (!logEntries || logEntries.length === 0) {
      this.showModal({
        title: 'JOURNEY LOG',
        content: '<p>No events recorded yet.</p>',
        actions: [{ label: 'Close', primary: true }]
      });
      return;
    }

    // Build log content
    const logHtml = logEntries.map(entry => {
      const icon = entry.icon || '·';
      const detail = entry.detail ? ` - ${entry.detail}` : '';
      const dayLabel = entry.dayLabel || 'Day';
      return `<div class="log-entry log-${entry.type}">
        <span class="log-day">${dayLabel} ${entry.day}</span>
        <span class="log-icon">${icon}</span>
        <span class="log-summary">${entry.summary}${detail}</span>
      </div>`;
    }).join('');

    this.showModal({
      title: 'JOURNEY LOG',
      content: `<div class="log-list">${logHtml}</div>`,
      actions: [{ label: 'Close', primary: true }]
    });
  },

  /**
   * Show restart confirmation
   */
  confirmRestart() {
    return new Promise((resolve) => {
      this.showModal({
        title: 'RESTART GAME?',
        content: 'Your current progress will be lost.',
        actions: [
          { label: 'Cancel', onClick: () => resolve(false) },
          { label: 'Restart', primary: true, onClick: () => resolve(true) }
        ]
      });
    });
  },

  /**
   * Open context-specific glossary
   * @private
   */
  _openContextGlossary(title, terms = []) {
    const entries = Array.isArray(terms) ? terms : [];

    if (!entries.length) {
      this.showModal({
        title,
        content: '<p>No glossary terms available yet.</p>',
        actions: [{ label: 'Close', primary: true }]
      });
      return;
    }

    this.openModal({
      title,
      dismissible: true,
      buildContent: (container) => {
        const list = document.createElement('div');
        list.className = 'modal-glossary-list';

        entries.forEach((term) => {
          const row = document.createElement('div');
          row.className = 'modal-glossary-term';

          const termTitle = document.createElement('div');
          termTitle.className = 'modal-glossary-title';
          termTitle.textContent = term.term;

          const desc = document.createElement('div');
          desc.className = 'modal-glossary-desc';
          desc.textContent = term.description;

          row.appendChild(termTitle);
          row.appendChild(desc);
          list.appendChild(row);
        });

        container.appendChild(list);
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  },

  /**
   * Find a glossary term by name
   * @private
   */
  _findGlossaryTerm(term) {
    return (
      GLOSSARY_TERMS.find((entry) => entry.term === term) || LEGACY_GLOSSARY_TERMS.find((entry) => entry.term === term)
    );
  }
};
