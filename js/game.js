import { GameState } from "./gameModels.js";
import { choose_region, initial_setup, plan_harvest_schedule, conduct_harvest_operations, annual_management_decisions, quarter_end_summary, check_win_conditions, quarterly_operations_setup } from "./gameLogic.js";
import { EventsRouter } from "./events.js";
import { process_permits, strategic_permit_submission } from "./permits.js";
import { ongoing_first_nations_consultation } from "./firstNations.js";
import { certification_opportunities, maintain_certifications } from "./certification.js";
import { random_illegal_opportunities_event, ongoing_criminal_consequences, continue_illegal_operations } from "./illegalActivities.js";
import { quarterly_wacky_events } from "./wackyEvents.js";
import { liaison_management } from "./liaison.js";
import { ceo_management, pay_ceo_annual_costs, ceo_automated_decisions, ceo_quarterly_report } from "./ceo.js";
import { random_first_nations_anger_events, check_anger_event_triggers } from "./firstNationsAnger.js";
import { workplace_safety_incidents, ongoing_safety_consequences } from "./workplaceSafety.js";
import { ask, formatCurrency, formatVolume } from "./utils.js";
import { generate_quarter_weather } from "./weather.js";
import { story_progression } from "./storyEvents.js";
import { strategic_management_decisions, getManagementStatus } from "./strategicManagement.js";
import { forest_management_planning, get_fmp_status_summary } from "./forestManagementPlanning.js";
import { competitive_market_events, getCompetitiveMarketStatus } from "./competitiveMarket.js";
import { quarterly_special_scenarios, decay_temporary_effects } from "./scenarios.js";
import { createRegionalLandscape, playSeasonalTransition, showLoggingTruck, showEventCutIn, updateStatusIcons } from "./pixelArt.js";

class Game {
  constructor() {
    this.state = new GameState();
    this.terminal = document.getElementById("terminal");
    this.input = document.getElementById("input");
    this.statusPanel = document.getElementById("status-content");
    this.statusToggle = document.getElementById("status-toggle");
    this.enable_wacky_events = false;
    this.eventsRouter = new EventsRouter();
    this.mobileHud = document.getElementById("mobile-hud");
    this._bindSettingsUI();
    this._bindStatusToggle();
    // Expose for console/manual triggers
    try { window.__game = this; } catch {}
  }

  async start() {
    this.write("Welcome to the BC Forestry Simulator");
    this.write("===============================================\n");
    const companyName = await ask("Name your forestry company:", this.terminal, this.input);
    this.state.companyName = companyName || "Northern Forest Solutions";

    await choose_region(this.state, this.write.bind(this), this.terminal, this.input);
    
    // Show regional landscape scene
    createRegionalLandscape(this.state.region, this.terminal);
    
    await initial_setup(this.state, this.write.bind(this), this.terminal, this.input);

    this.write(`\n${this.state.companyName} is now operational in the ${this.state.region} region!`);
    this.write(`Starting budget: ${formatCurrency(this.state.budget)}`);
    this.write("Game runs quarterly - make decisions every 3 months!");
    this.updateStatus();
    await this.gameLoop();
  }

  async gameLoop(quarters = 60) {
    let quarterCount = 0;
    while (quarterCount < quarters) {
      quarterCount++;
      await this.runQuarter();
      
      // Check win/loss conditions
      const [gameOver, message] = check_win_conditions(this.state);
      if (gameOver) {
        this.write(`\n🎯 ${message}`);
        break;
      }
      
      // Year-end continuation prompt
      if (this.state.quarter === 4 && quarterCount < quarters - 4) {
        const choice = await ask(
          `Continue to ${this.state.year + 1}?`,
          ["Yes", "No", "Play 1 more quarter only"],
          this.terminal,
          this.input
        );
        if (choice === 1) {
          this.write("You've decided to end operations. Thanks for playing!");
          break;
        } else if (choice === 2) {
          quarters = quarterCount + 1;
        }
      }
      
      // Advance quarter
      this.state.quarter++;
      if (this.state.quarter > 4) {
        this.state.quarter = 1;
        this.state.year++;
      }
      this.updateStatus();
    }
    this.write("\nThanks for playing the BC Forestry Simulator!");
  }

  async runQuarter() {
    const quarter_names = ["", "Q1 (Spring)", "Q2 (Summer)", "Q3 (Fall)", "Q4 (Winter)"];
    
    this.write(`\n${"-".repeat(60)}`);
    this.write(`${this.state.companyName} - ${quarter_names[this.state.quarter]} Year ${this.state.year}`);
    this.write(`${"-".repeat(60)}\n`);

    // Show seasonal transition animation
    playSeasonalTransition(this.state.quarter, this.terminal);

    // Quarterly setup (Oregon Trail-style choices)
    await quarterly_operations_setup(this.state, this.write.bind(this), this.terminal, this.input);
    
    // Show logging truck during operations setup
    if (this.state.operations_pace === 'aggressive') {
      showLoggingTruck();
    }

    // Quarter weather
    const weather = generate_quarter_weather(this.state);
    if (weather && weather.condition !== 'clear') {
      this.write(`Weather: ${weather.description} (Output x${weather.harvest_multiplier.toFixed(2)}, Safety x${weather.safety_risk_multiplier.toFixed(2)})`);
    } else {
      this.write("Weather: Clear conditions");
    }

    // Core seasonal activities - streamlined and focused
    if (this.state.quarter === 1) {
      this.write("SPRING: Planning and permit season begins!");
      // Core spring activities: planning and permits
      await plan_harvest_schedule(this.state, this.write.bind(this), this.terminal, this.input);
      await ongoing_first_nations_consultation(this.state, this.write.bind(this), this.terminal, this.input);
      
      // Occasional spring events
      if (Math.random() < 0.4) {
        await this.eventsRouter.random_policy_events(this.state, this.write.bind(this), this.terminal, this.input);
      }
      if (Math.random() < 0.3) {
        await story_progression(this.state, this.write.bind(this), this.terminal, this.input);
      }
    } else if (this.state.quarter === 2 || this.state.quarter === 3) {
      const season = this.state.quarter === 2 ? "SUMMER" : "FALL";
      this.write(`${season}: ${this.state.quarter === 2 ? "Prime" : "Continued"} harvesting season!`);
      
      // Core harvesting activities
      await process_permits(this.state, this.write.bind(this), this.terminal, this.input);
      await conduct_harvest_operations(this.state, this.write.bind(this), this.terminal, this.input);
    } else {
      this.write("WINTER: Planning season, limited field operations!");
      
      // Annual costs and planning
      if (this.state.fn_liaison) {
        const liaisonCost = this.state.fn_liaison.cost;
        if (this.state.budget >= liaisonCost) {
          this.state.budget -= liaisonCost;
          this.write(`Annual liaison fee: ${formatCurrency(liaisonCost)} paid to ${this.state.fn_liaison.name}`);
        } else {
          this.write(`Cannot afford liaison fee! ${this.state.fn_liaison.name} contract terminated`);
          this.state.fn_liaison = null;
        }
      }
      
      await pay_ceo_annual_costs(this.state, this.write.bind(this));
      
      // Occasional winter activities
      if (Math.random() < 0.5) {
        await maintain_certifications(this.state, this.write.bind(this), this.terminal, this.input);
      }
      if (Math.random() < 0.4) {
        await this.eventsRouter.market_fluctuations(this.state, this.write.bind(this), this.terminal, this.input);
      }
    }

    // Single quarterly management decision - core gameplay
    const managementResult = await annual_management_decisions(this.state, this.write.bind(this), this.terminal, this.input);
    if (managementResult === "GAME_OVER") {
      return; // Exit quarter immediately if Don Kayne was hired
    }

    // Random events - streamlined and balanced
    const eventTypes = [];
    
    // Wacky events if enabled
    if (this.enable_wacky_events && Math.random() < 0.3) {
      eventTypes.push(() => quarterly_wacky_events(this.state, this.write.bind(this), this.terminal, this.input));
    }
    
    // Workplace safety incidents
    if (Math.random() < 0.25) {
      eventTypes.push(() => workplace_safety_incidents(this.state, this.write.bind(this), this.terminal, this.input));
    }
    
    // Illegal opportunities - now appears as random encounter, not menu choice
    await random_illegal_opportunities_event(this.state, this.write.bind(this), this.terminal, this.input);
    
    // Competitive market events
    if (Math.random() < 0.35) {
      eventTypes.push(() => competitive_market_events(this.state, this.write.bind(this), this.terminal, this.input));
    }
    
    // Special scenarios
    if (Math.random() < 0.2) {
      eventTypes.push(() => quarterly_special_scenarios(this.state, this.write.bind(this), this.terminal, this.input));
    }
    
    // First Nations anger events - triggered by conditions or chance
    const angerChance = Math.max(0.05, 0.2 - this.state.community_support * 0.1);
    if (check_anger_event_triggers(this.state) || Math.random() < angerChance) {
      eventTypes.push(() => random_first_nations_anger_events(this.state, this.write.bind(this), this.terminal, this.input));
    }
    
    // Execute one random event type if any are queued (prevents event overload)
    if (eventTypes.length > 0) {
      const randomEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      await randomEvent();
    }
    
    // CEO automated decisions
    const ceoActions = await ceo_automated_decisions(this.state, this.write.bind(this));
    if (ceoActions && ceoActions.length > 0) {
      this.write("\n--- CEO AUTOMATED ACTIONS ---");
      ceoActions.forEach(action => this.write(`👔 ${action}`));
    }
    
    // Ongoing consequences
    await ongoing_criminal_consequences(this.state, this.write.bind(this));
    await ongoing_safety_consequences(this.state, this.write.bind(this));
    
    // Continue multi-stage illegal operations
    await continue_illegal_operations(this.state, this.write.bind(this), this.terminal, this.input);
    
    // Strategic management decisions - replaced by combined quarterly activities above
    
    // CEO quarterly report
    await ceo_quarterly_report(this.state, this.write.bind(this));
    
    // Quarter end summary
    await quarter_end_summary(this.state, this.write.bind(this), this.terminal, this.input);
    
    // Decay temporary modifiers
    decay_temporary_effects(this.state, this.write.bind(this));
    
    await ask("Press Enter to continue...", this.terminal, this.input);
  }

  write(text) {
    this.terminal.textContent += `${text}\n`;
    // Use requestAnimationFrame for better scrolling
    requestAnimationFrame(() => {
      this.terminal.scrollTop = this.terminal.scrollHeight;
    });
  }

  updateStatus() {
    const quarter_names = ["", "Spring", "Summer", "Fall", "Winter"];
    const budgetColor = this.state.budget < 0 ? "style='color: #ff0000'" : "";
    const repColor = this.state.reputation < 0.3 ? "style='color: #ff9900'" : "";
    const communityColor = this.state.community_support < 0.3 ? "style='color: #ff9900'" : "";
    
    // Get strategic management status
    const mgmtStatus = getManagementStatus(this.state);
    const fmpStatus = get_fmp_status_summary(this.state);
    const marketStatus = getCompetitiveMarketStatus(this.state);
    const mgmtColor = mgmtStatus.actions_used >= mgmtStatus.actions_available ? "style='color: #ff9900'" : "";
    
    this.statusPanel.innerHTML = `
      <div class="info-item">
        <span class="info-label">COMPANY:</span> <span class="info-value">${this.state.companyName}</span>
      </div>
      <div class="info-item">
        <span class="info-label">DATE:</span> <span class="info-value">${this.state.year} Q${this.state.quarter} (${quarter_names[this.state.quarter]})</span>
      </div>
      <div class="info-item">
        <span class="info-label">BUDGET:</span> <span class="info-value" ${budgetColor}>${formatCurrency(this.state.budget)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">REPUTATION:</span> <span class="info-value" ${repColor}>${(this.state.reputation * 100).toFixed(0)}%</span>
      </div>
      <div class="info-item">
        <span class="info-label">COMMUNITY SUPPORT:</span> <span class="info-value" ${communityColor}>${(this.state.community_support * 100).toFixed(0)}%</span>
      </div>
      <div class="info-item">
        <span class="info-label">OPERATIONS:</span> <span class="info-value">${this.state.operations_pace} pace</span>
      </div>
      <div class="info-item">
        <span class="info-label">CREW MORALE:</span> <span class="info-value">${(this.state.crew_morale * 100).toFixed(0)}%</span>
      </div>
      <hr>
      <div class="info-item">
        <span class="info-label">WEATHER:</span> <span class="info-value">${this.state.weather?.description || 'Clear'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">OUTPUT MOD:</span> <span class="info-value">x${(this.state.weather?.harvest_multiplier ?? 1).toFixed(2)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">SAFETY RISK:</span> <span class="info-value">x${(this.state.weather?.safety_risk_multiplier ?? 1).toFixed(2)}</span>
      </div>
      <hr>
      <div class="info-item">
        <span class="info-label">MANAGEMENT:</span> <span class="info-value" ${mgmtColor}>${mgmtStatus.actions_used}/${mgmtStatus.actions_available} actions</span>
      </div>
      <div class="info-item">
        <span class="info-label">COMPANY SIZE:</span> <span class="info-value">${mgmtStatus.company_size}</span>
      </div>
      <div class="info-item">
        <span class="info-label">FMP STATUS:</span> <span class="info-value" style="color: ${fmpStatus.color}">${fmpStatus.status}</span>
      </div>
      <div class="info-item">
        <span class="info-label">MARKET SHARE:</span> <span class="info-value">${marketStatus.player_market_share}</span>
      </div>
      <div class="info-item">
        <span class="info-label">MARKET CONDITION:</span> <span class="info-value">${marketStatus.market_condition}</span>
      </div>
      <hr>
      <div class="info-item">
        <span class="info-label">AAC:</span> <span class="info-value">${formatVolume(this.state.annual_allowable_cut)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">SAFETY:</span> <span class="info-value">${this.state.safety_violations} violations</span>
      </div>
      ${this.state.ceo ? `
      <div class="info-item">
        <span class="info-label">CEO:</span> <span class="info-value">${this.state.ceo.name}</span>
      </div>` : ''}
      <hr>
      <div class="info-item">
        <span class="info-label">LOG PRICES:</span>
      </div>
      ${Object.entries(this.state.log_prices).map(([grade, price]) => `
        <div class="info-item" style="margin-left: 15px;">
          <span class="info-label">${grade.charAt(0).toUpperCase() + grade.slice(1)}:</span>
          <span class="info-value">${formatCurrency(price)}/m³</span>
        </div>
      `).join('')}
    `;
    // Mobile HUD (compact) - using text indicators instead of emojis
    if (this.mobileHud) {
      this.mobileHud.innerHTML = `
        <div class="hud-item">$ ${formatCurrency(this.state.budget)}</div>
        <div class="hud-item">REP ${(this.state.reputation * 100).toFixed(0)}%</div>
        <div class="hud-item">COM ${(this.state.community_support * 100).toFixed(0)}%</div>
        <div class="hud-item">${this.state.year} ${quarter_names[this.state.quarter]}</div>
      `;
    }
    
    // Add animated status icons
    setTimeout(() => {
      updateStatusIcons(this.statusPanel, this.state);
    }, 100);
  }

  _bindSettingsUI() {
    const gear = document.getElementById('settings-gear');
    const panel = document.getElementById('settings-panel');
    const overlay = document.getElementById('settings-overlay');
    const toggleWacky = document.getElementById('toggle-wacky');
    const toggleAuto = document.getElementById('toggle-auto');
    const auto1y = document.getElementById('auto-1y');
    const auto3y = document.getElementById('auto-3y');
    const auto10q = document.getElementById('auto-10q');
    const sizeSmall = document.getElementById('size-small');
    const sizeMedium = document.getElementById('size-medium');
    const sizeLarge = document.getElementById('size-large');
    if (!gear || !panel) return;
    const open = () => { panel.classList.add('open'); overlay?.classList.add('show'); };
    const close = () => { panel.classList.remove('open'); overlay?.classList.remove('show'); };
    gear.addEventListener('click', open);
    overlay?.addEventListener('click', close);
    document.getElementById('settings-close')?.addEventListener('click', close);
    toggleWacky?.addEventListener('change', (e) => {
      this.enable_wacky_events = e.target.checked;
      this.write(`Wacky events ${this.enable_wacky_events ? 'enabled' : 'disabled'}.`);
    });
    toggleAuto?.addEventListener('change', (e) => {
      this.enableAuto(e.target.checked);
      this.write(`Auto Play ${e.target.checked ? 'enabled' : 'disabled'}.`);
    });
    auto1y?.addEventListener('click', () => this.runAutoQuarters(4));
    auto3y?.addEventListener('click', () => this.runAutoQuarters(12));
    auto10q?.addEventListener('click', () => this.runAutoQuarters(10));
    const setSize = (sz) => {
      document.body.dataset.textSize = sz; // CSS hooks sizes
      this.terminal.scrollTop = this.terminal.scrollHeight;
    };
    sizeSmall?.addEventListener('click', () => setSize('small'));
    sizeMedium?.addEventListener('click', () => setSize('medium'));
    sizeLarge?.addEventListener('click', () => setSize('large'));
  }

  enableAuto(enabled) {
    try {
      if (!window.AUTO_PLAY) {
        window.AUTO_PLAY = {
          enabled: false,
          nextIndex: (_q, options) => Math.floor(Math.random() * options.length),
          nextText: () => ''
        };
      }
      window.AUTO_PLAY.enabled = enabled;
    } catch {}
  }

  async runAutoQuarters(n) {
    this.enableAuto(true);
    for (let i = 0; i < n; i++) {
      await this.runQuarter();
      const [gameOver, message] = check_win_conditions(this.state);
      if (gameOver) { this.write(`\n🎯 ${message}`); break; }
      this.state.quarter++;
      if (this.state.quarter > 4) { this.state.quarter = 1; this.state.year++; }
      this.updateStatus();
    }
    this.write('\nAuto-run complete.');
    this.enableAuto(false);
    // Reset UI state to clean state after auto-play
    const { resetUIState } = await import('./utils.js');
    resetUIState();
  }

  _bindStatusToggle() {
    const toggle = this.statusToggle;
    const content = this.statusPanel;
    if (!toggle || !content) return;
    const arrow = toggle.querySelector('.status-arrow');

    const collapse = () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', (!expanded).toString());
      content.style.display = expanded ? 'none' : 'block';
      if (arrow) arrow.textContent = expanded ? '▸' : '▾';
    };

    toggle.addEventListener('click', collapse);
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        collapse();
      }
    });

    if (window.innerWidth <= 768) {
      collapse();
    }
  }
}

const game = new Game();
game.start();
