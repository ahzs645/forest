export class TerminalUI {
  constructor() {
    this.terminal = document.getElementById("terminal");
    this.input = document.getElementById("input");
    this.buttonContainer = document.getElementById("button-container");
    this.statusPanel = document.getElementById("status-content");
    this.statusToggle = document.getElementById("status-toggle");
    this.mobileHud = document.getElementById("mobile-hud");
    this.restartButton = document.getElementById("restart-button");
    this.glossaryButton = document.getElementById("glossary-button");
    this.modal = document.getElementById("modal");
    this.modalDialog = this.modal?.querySelector(".modal-dialog");
    this.modalTitle = document.getElementById("modal-title");
    this.modalBody = document.getElementById("modal-body");
    this.modalActions = document.getElementById("modal-actions");
    this._modalKeyHandler = null;
    this._modalOnClose = null;
    this._lastFocus = null;
    this._modalDismissible = true;
    this._glossaryEntries = [];
    this._glossaryLookup = new Map();
    this._glossaryRegex = null;
    this._restartHandler = null;
    this._pending = null;
    this._choiceKeyHandler = null;
    this._inputMode = "idle";

    if (this.input) {
      this.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          this._handleSubmit();
        }
      });
    }

    if (this.statusToggle && this.statusPanel) {
      const togglePanel = () => {
        const expanded = this.statusToggle.getAttribute("aria-expanded") === "true";
        const next = !expanded;
        this.statusToggle.setAttribute("aria-expanded", String(next));
        this.statusPanel.hidden = !next;
        const arrow = this.statusToggle.querySelector(".status-arrow");
        if (arrow) {
          arrow.textContent = next ? "▾" : "▸";
        }
      };
      this.statusToggle.addEventListener("click", togglePanel);
      this.statusToggle.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          togglePanel();
        }
      });
    }

    if (this.restartButton) {
      this.restartButton.addEventListener("click", () => {
        if (typeof this._restartHandler === "function") {
          this._restartHandler();
        }
      });
    }

    if (this.glossaryButton) {
      this.glossaryButton.addEventListener("click", () => {
        this.showGlossary();
      });
    }

    if (this.terminal) {
      this.terminal.addEventListener("click", (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const button = target?.closest(".glossary-term");
        if (!button) {
          return;
        }
        const termKey = button.getAttribute("data-term-key") ?? "";
        const entry = this._glossaryLookup.get(termKey);
        if (entry) {
          event.preventDefault();
          this.showGlossary({ focusTerm: entry.term });
        }
      });
    }

    if (this.modal) {
      this.modal.addEventListener("click", (event) => {
        if (event.target === this.modal && this._modalDismissible) {
          this.closeModal();
        }
      });
    }

    this._setInputMode("idle");
  }

  write(message = "") {
    if (!this.terminal) return;
    const text = String(message ?? "");
    const segments = text.split(/\n/);
    segments.forEach((segment) => {
      const line = this._createLine(segment);
      this.terminal.appendChild(line);
    });
    this.terminal.scrollTop = this.terminal.scrollHeight;
  }

  clear() {
    if (!this.terminal) return;
    this.terminal.innerHTML = "";
  }

  async promptText(question, placeholder = "Type your response") {
    this.write(question);
    return new Promise((resolve) => {
      this._awaitInput((value) => {
        this._setInputMode("idle");
        resolve(value.trim());
      }, placeholder);
    });
  }

  async promptChoice(question, options) {
    this.write(question);
    this._setInputMode("choice");
    this._pending = null;

    return new Promise((resolve) => {
      const cleanup = () => {
        this._clearButtons();
        this._setInputMode("idle");
        if (this.input) {
          this.input.value = "";
          this.input.blur();
        }
      };

      const choose = (option) => {
        cleanup();
        resolve(option);
      };

      this._showButtons(options, choose);
      this._enableChoiceKeyboard(options, choose);
    });
  }

  updateStatus(state) {
    if (!state || !this.statusPanel) return;
    const { companyName, role, area, metrics, round, totalRounds } = state;
    const roundLabel = `${Math.min(round, totalRounds)}/${totalRounds}`;

    const tagMarkup = (area.tags || [])
      .map((tag) => `<span class="tag">${tag.replace(/-/g, " ")}</span>`)
      .join("");

    this.statusPanel.innerHTML = `
      <div>
        <div class="status-company">${companyName}</div>
        <div class="status-role">${role.name}</div>
        <div class="status-area">
          <strong>${area.name}</strong>
          <div class="bec">${area.becZone}</div>
          <p>${area.description}</p>
          ${tagMarkup ? `<div class="tags" aria-label="Area tags">${tagMarkup}</div>` : ""}
        </div>
      </div>
      <div class="status-round">Season ${roundLabel}</div>
      <div class="metrics">
        ${this._metricRow("Operational Progress", metrics.progress)}
        ${this._metricRow("Forest Health", metrics.forestHealth)}
        ${this._metricRow("Relationships", metrics.relationships)}
        ${this._metricRow("Compliance", metrics.compliance)}
        ${this._metricRow("Budget Flexibility", metrics.budget)}
      </div>
    `;

    if (this.mobileHud) {
      this.mobileHud.innerHTML = `
        <div class="hud-item"><span>Season</span>${roundLabel}</div>
        <div class="hud-item"><span>Role</span>${role.name}</div>
        <div class="hud-item"><span>BEC</span>${area.becCode || area.becZone.split(" ")[0]}</div>
        <div class="hud-item"><span>Forest</span>${Math.round(metrics.forestHealth)}</div>
        <div class="hud-item"><span>Compliance</span>${Math.round(metrics.compliance)}</div>
      `;
    }
  }

  onRestartRequest(handler) {
    this._restartHandler = handler;
  }

  loadGlossary(entries = []) {
    this._glossaryEntries = Array.isArray(entries) ? entries.slice() : [];
    this._glossaryLookup.clear();
    const patternParts = [];
    this._glossaryEntries.forEach((entry) => {
      if (!entry || !entry.term) {
        return;
      }
      const key = this._normalizeTerm(entry.term);
      if (!this._glossaryLookup.has(key)) {
        this._glossaryLookup.set(key, entry);
        patternParts.push(this._escapeRegex(entry.term));
      }
    });
    patternParts.sort((a, b) => b.length - a.length);
    this._glossaryRegex = patternParts.length
      ? new RegExp(`\\b(${patternParts.join("|")})\\b`, "gi")
      : null;
    if (this.glossaryButton) {
      const hasEntries = this._glossaryEntries.length > 0;
      this.glossaryButton.hidden = !hasEntries;
      this.glossaryButton.disabled = !hasEntries;
      this.glossaryButton.setAttribute("aria-disabled", hasEntries ? "false" : "true");
    }
  }

  showGlossary({ focusTerm = "" } = {}) {
    if (!this._glossaryEntries.length) {
      return;
    }
    const normalizedFocus = this._normalizeTerm(focusTerm);
    this.openModal({
      title: "Field Glossary",
      dismissible: true,
      buildContent: (container) => {
        const intro = document.createElement("p");
        intro.textContent = "Key forestry terms encountered in northern BC operations.";
        intro.style.marginTop = "0";
        container.appendChild(intro);

        const searchLabel = document.createElement("label");
        searchLabel.className = "glossary-search";
        searchLabel.textContent = "Search glossary";
        const searchInput = document.createElement("input");
        searchInput.type = "search";
        searchInput.placeholder = "Type to filter terms...";
        searchInput.setAttribute("aria-label", "Search glossary terms");
        searchInput.autocomplete = "off";
        searchInput.spellcheck = false;
        searchInput.inputMode = "search";
        searchLabel.appendChild(searchInput);
        container.appendChild(searchLabel);

        const list = document.createElement("ul");
        list.className = "glossary-list";
        container.appendChild(list);

        const renderList = () => {
          const query = searchInput.value.trim().toLowerCase();
          list.innerHTML = "";
          const matches = this._glossaryEntries.filter((entry) => {
            if (!query) return true;
            const haystack = `${entry.term} ${entry.description}`.toLowerCase();
            return haystack.includes(query);
          });
          if (!matches.length) {
            const empty = document.createElement("li");
            empty.className = "glossary-empty";
            empty.textContent = "No terms match your search.";
            list.appendChild(empty);
            return;
          }
          matches.forEach((entry) => {
            const item = document.createElement("li");
            item.className = "glossary-item";
            const termButton = document.createElement("button");
            termButton.type = "button";
            termButton.className = "glossary-item-title";
            termButton.textContent = entry.term;
            termButton.addEventListener("click", () => {
              searchInput.value = entry.term;
              renderList();
              searchInput.focus({ preventScroll: true });
            });
            const description = document.createElement("p");
            description.className = "glossary-item-description";
            description.textContent = entry.description;
            item.appendChild(termButton);
            item.appendChild(description);
            list.appendChild(item);
          });
        };

        searchInput.addEventListener("input", renderList);

        if (normalizedFocus && this._glossaryLookup.has(normalizedFocus)) {
          searchInput.value = this._glossaryLookup.get(normalizedFocus).term;
        } else if (focusTerm) {
          searchInput.value = focusTerm;
        }

        renderList();
        requestAnimationFrame(() => {
          searchInput.focus({ preventScroll: true });
          if (searchInput.value) {
            searchInput.select();
          }
        });
      },
      actions: [
        {
          label: "Close",
          primary: true,
          onSelect: () => this.closeModal(),
        },
      ],
    });
  }

  openModal({ title = "", buildContent, actions = [], dismissible = true, onClose = null }) {
    if (!this.modal || !this.modalDialog || !this.modalTitle || !this.modalBody || !this.modalActions) {
      return;
    }
    this._modalDismissible = dismissible;
    this._modalOnClose = typeof onClose === "function" ? onClose : null;
    this._lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.modal.hidden = false;
    this.modal.setAttribute("aria-hidden", "false");
    this.modalTitle.textContent = title;
    this.modalBody.innerHTML = "";
    if (typeof buildContent === "function") {
      buildContent(this.modalBody);
    } else if (typeof buildContent === "string") {
      this.modalBody.textContent = buildContent;
    }
    this.modalActions.innerHTML = "";
    const buttonConfigs = actions.length
      ? actions
      : [
          {
            label: "Close",
            primary: true,
            onSelect: () => this.closeModal(),
          },
        ];
    const buttons = buttonConfigs.map((config) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = config.label;
      if (config.primary) {
        button.classList.add("primary");
      }
      button.addEventListener("click", () => {
        if (typeof config.onSelect === "function") {
          config.onSelect();
        } else {
          this.closeModal();
        }
      });
      this.modalActions.appendChild(button);
      return button;
    });
    if (this._modalKeyHandler) {
      document.removeEventListener("keydown", this._modalKeyHandler);
    }
    this._modalKeyHandler = (event) => {
      if (event.key === "Escape" && this._modalDismissible) {
        event.preventDefault();
        this.closeModal();
      }
    };
    document.addEventListener("keydown", this._modalKeyHandler);
    const focusTarget = buttons.find((button) => button.classList.contains("primary")) ?? buttons[0];
    if (focusTarget) {
      requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    }
  }

  closeModal() {
    if (!this.modal) {
      return;
    }
    this.modal.hidden = true;
    this.modal.setAttribute("aria-hidden", "true");
    if (this._modalKeyHandler) {
      document.removeEventListener("keydown", this._modalKeyHandler);
      this._modalKeyHandler = null;
    }
    const onClose = this._modalOnClose;
    this._modalOnClose = null;
    if (this._lastFocus && typeof this._lastFocus.focus === "function") {
      requestAnimationFrame(() => this._lastFocus?.focus({ preventScroll: true }));
    }
    this._lastFocus = null;
    if (typeof onClose === "function") {
      onClose();
    }
  }

  isModalOpen() {
    if (!this.modal) {
      return false;
    }
    return !this.modal.hidden;
  }

  _metricRow(label, value) {
    const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
    return `
      <div class="metric">
        <span>${label}</span>
        <div class="bar">
          <div class="fill" style="width: ${safeValue}%"></div>
          <span class="value">${Math.round(safeValue)}</span>
        </div>
      </div>
    `;
  }

  _awaitInput(resolver, placeholder, options = {}) {
    if (!this.input) return;
    if (!options.keepButtons) {
      this._clearButtons();
    }
    this._pending = resolver;
    this.input.value = "";
    if (placeholder) {
      this.input.placeholder = placeholder;
    }
    this._setInputMode("text");
    this.input.focus({ preventScroll: true });
  }

  _handleSubmit() {
    if (!this._pending || !this.input) {
      return;
    }
    const value = this.input.value;
    if (!value.trim()) {
      return;
    }
    this.write(`> ${value}`);
    const resolver = this._pending;
    this._pending = null;
    resolver(value);
  }

  _showButtons(options, onSelect) {
    if (!this.buttonContainer) return;
    this.buttonContainer.innerHTML = "";
    this.buttonContainer.classList.add("active");
    options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-btn";
      button.textContent = `${index + 1}. ${option.label}`;
      button.addEventListener("click", () => {
        onSelect(option);
      });
      this.buttonContainer.appendChild(button);
    });
    if (window.matchMedia("(max-width: 860px)").matches) {
      requestAnimationFrame(() => {
        this.buttonContainer?.scrollIntoView({ block: "end", behavior: "smooth" });
      });
    }
  }

  _clearButtons() {
    if (!this.buttonContainer) return;
    this.buttonContainer.innerHTML = "";
    this.buttonContainer.classList.remove("active");
    this._removeChoiceKeyHandler();
  }

  _enableChoiceKeyboard(options, choose) {
    this._removeChoiceKeyHandler();
    const handler = (event) => {
      if (!/^[1-9]$/.test(event.key)) {
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      if (index < 0 || index >= options.length) {
        return;
      }
      const target = event.target;
      if (target) {
        const tagName = typeof target.tagName === "string" ? target.tagName.toLowerCase() : "";
        if (tagName === "input" || tagName === "textarea" || target.isContentEditable) {
          return;
        }
      }
      event.preventDefault();
      choose(options[index]);
    };
    document.addEventListener("keydown", handler);
    this._choiceKeyHandler = handler;
  }

  _removeChoiceKeyHandler() {
    if (this._choiceKeyHandler) {
      document.removeEventListener("keydown", this._choiceKeyHandler);
      this._choiceKeyHandler = null;
    }
  }

  _setInputMode(mode) {
    if (!this.input) return;
    this._inputMode = mode;
    if (mode === "text") {
      this.input.classList.remove("input-hidden");
      this.input.removeAttribute("aria-hidden");
      this.input.disabled = false;
    } else {
      this.input.classList.add("input-hidden");
      this.input.setAttribute("aria-hidden", "true");
      this.input.disabled = true;
    }
  }

  _createLine(text = "") {
    const line = document.createElement("div");
    line.className = "terminal-line";
    const content = String(text ?? "");
    if (!content) {
      line.classList.add("terminal-line--spacer");
      line.innerHTML = "&nbsp;";
      return line;
    }
    const regex = this._glossaryRegex;
    if (!regex) {
      line.textContent = content;
      return line;
    }
    regex.lastIndex = 0;
    let lastIndex = 0;
    let match;
    let matched = false;
    while ((match = regex.exec(content)) !== null) {
      const [termText] = match;
      const matchStart = match.index;
      const matchEnd = matchStart + termText.length;
      if (matchStart > lastIndex) {
        line.appendChild(document.createTextNode(content.slice(lastIndex, matchStart)));
      }
      const normalized = this._normalizeTerm(termText);
      const entry = this._glossaryLookup.get(normalized);
      if (entry) {
        matched = true;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "glossary-term";
        button.setAttribute("data-term-key", normalized);
        button.setAttribute("title", `View glossary definition for ${entry.term}`);
        button.setAttribute("aria-label", `Open glossary definition for ${entry.term}`);
        button.textContent = termText;
        line.appendChild(button);
      } else {
        line.appendChild(document.createTextNode(termText));
      }
      lastIndex = matchEnd;
    }
    if (lastIndex < content.length) {
      line.appendChild(document.createTextNode(content.slice(lastIndex)));
    }
    if (!matched) {
      line.textContent = content;
    }
    regex.lastIndex = 0;
    return line;
  }

  _normalizeTerm(term) {
    return String(term ?? "").trim().toLowerCase();
  }

  _escapeRegex(value) {
    return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
