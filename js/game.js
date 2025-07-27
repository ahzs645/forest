import { GameState } from "./gameModels.js";
import { choose_region, initial_setup, plan_harvest_schedule, conduct_harvest_operations } from "./gameLogic.js";
import { EventsRouter } from "./events.js";
import { process_permits, selective_permit_submission } from "./permits.js";
import { ongoing_first_nations_consultation } from "./firstNations.js";
import { certification_opportunities, maintain_certifications } from "./certification.js";
import { illegal_opportunities } from "./illegalActivities.js";
import { quarterly_wacky_events } from "./wackyEvents.js";
import { liaison_management } from "./liaison.js";
import { ceo_management, pay_ceo_annual_costs } from "./ceo.js";
import { ask, formatCurrency, formatVolume } from "./utils.js";

class Game {
  constructor() {
    this.state = new GameState();
    this.terminal = document.getElementById("terminal");
    this.input = document.getElementById("input");
    this.statusPanel = document.getElementById("status-content");
    this.enable_wacky_events = false;
    this.eventsRouter = new EventsRouter();
  }

  async start() {
    this.write("Welcome to the BC Forestry Simulator");
    const companyName = await ask("Name your forestry company:", this.terminal, this.input);
    this.state.companyName = companyName || "Northern Forest Solutions";

    await choose_region(this.state, this.write.bind(this));
    await initial_setup(this.state, this.write.bind(this));

    this.write(`\n${this.state.companyName} is now operational in the ${this.state.region} region!`);
    this.updateStatus();
    this.gameLoop();
  }

  async gameLoop() {
    while (true) {
      await this.runQuarter();
      this.state.quarter++;
      if (this.state.quarter > 4) {
        this.state.quarter = 1;
        this.state.year++;
      }
      this.updateStatus();
    }
  }

  async runQuarter() {
    const quarter_names = ["", "Q1 (Spring)", "Q2 (Summer)", "Q3 (Fall)", "Q4 (Winter)"];
    const season_emojis = ["", "🌱", "☀️", "🍂", "❄️"];
    
    this.write(`\n--- ${season_emojis[this.state.quarter]} ${quarter_names[this.state.quarter]} ${this.state.year} ---`);

    // Seasonal events - like Python system
    if (this.state.quarter === 1) {
      this.write("🌱 SPRING: Planning and permit season begins!");
      await ongoing_first_nations_consultation(this.state, this.write.bind(this), this.terminal, this.input);
      await plan_harvest_schedule(this.state, this.write.bind(this), this.terminal, this.input);
      await selective_permit_submission(this.state, this.write.bind(this), this.terminal, this.input);
    } else if (this.state.quarter === 2) {
      this.write("☀️ SUMMER: Prime harvesting season!");
      process_permits(this.state, this.write.bind(this));
      conduct_harvest_operations(this.state, this.write.bind(this));
    } else if (this.state.quarter === 3) {
      this.write("🍂 FALL: Harvest continues, winter prep begins!");
      process_permits(this.state, this.write.bind(this));
      conduct_harvest_operations(this.state, this.write.bind(this));
    } else {
      this.write("❄️ WINTER: Planning season, limited field operations!");
      maintain_certifications(this.state, this.write.bind(this));
      pay_ceo_annual_costs(this.state);
    }

    // Use Events Router for all random events - like Python system
    await this.eventsRouter.runQuarterlyEvents(this.state, this.write.bind(this), this.terminal, this.input);

    // Optional wacky events
    if (this.enable_wacky_events) {
      await quarterly_wacky_events(this.state, this.write.bind(this), this.terminal, this.input);
    }

    // Management activities
    await illegal_opportunities(this.state, this.write.bind(this), this.terminal, this.input);
    await liaison_management(this.state, this.write.bind(this), this.terminal, this.input);
    await ceo_management(this.state, this.write.bind(this), this.terminal, this.input);

    await ask("Press Enter to continue...", this.terminal, this.input);
  }

  write(text) {
    this.terminal.textContent += `${text}\n`;
    this.terminal.scrollTop = this.terminal.scrollHeight;
  }

  updateStatus() {
    this.statusPanel.innerHTML = `
      <div class="info-item">
        <span class="info-label">Company:</span> ${this.state.companyName}
      </div>
      <div class="info-item">
        <span class="info-label">Year:</span> ${this.state.year}
      </div>
      <div class="info-item">
        <span class="info-label">Quarter:</span> Q${this.state.quarter}
      </div>
      <div class="info-item">
        <span class="info-label">Budget:</span> ${formatCurrency(this.state.budget)}
      </div>
      <div class="info-item">
        <span class="info-label">Reputation:</span> ${this.state.reputation.toFixed(2)}
      </div>
      <div class="info-item">
        <span class="info-label">AAC:</span> ${formatVolume(this.state.annual_allowable_cut)}
      </div>
    `;
  }
}

const game = new Game();
game.start();
