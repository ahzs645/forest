export class TerminalUI {
  constructor() {
    this.terminal = document.getElementById("terminal");
    this.input = document.getElementById("input");
    this.buttonContainer = document.getElementById("button-container");
    this.statusPanel = document.getElementById("status-content");
    this.statusToggle = document.getElementById("status-toggle");
    this.mobileHud = document.getElementById("mobile-hud");
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

    this._setInputMode("idle");
  }

  write(message = "") {
    if (!this.terminal) return;
    this.terminal.textContent += `${message}\n`;
    this.terminal.scrollTop = this.terminal.scrollHeight;
  }

  clear() {
    if (!this.terminal) return;
    this.terminal.textContent = "";
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
}
