import { GameState } from "./gameModels.js";
import { choose_region, initial_setup, plan_harvest_schedule, conduct_harvest_operations, annual_management_decisions, quarter_end_summary, check_win_conditions } from "./gameLogic.js";
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
import { story_progression } from "./storyEvents.js";
import { strategic_management_decisions, getManagementStatus } from "./strategicManagement.js";
import { forest_management_planning, get_fmp_status_summary } from "./forestManagementPlanning.js";
import { competitive_market_events, getCompetitiveMarketStatus } from "./competitiveMarket.js";

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
    this.write("===============================================\n");
    const companyName = await ask("Name your forestry company:", this.terminal, this.input);
    this.state.companyName = companyName || "Northern Forest Solutions";

    await choose_region(this.state, this.write.bind(this), this.terminal, this.input);
    await initial_setup(this.state, this.write.bind(this), this.terminal, this.input);

    this.write(`\n${this.state.companyName} is now operational in the ${this.state.region} region!`);
    this.write(`Starting budget: ${formatCurrency(this.state.budget)}`);
    this.write("🗓️  Game runs quarterly - make decisions every 3 months!");
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
    const season_emojis = ["", "🌱", "☀️", "🍂", "❄️"];
    
    this.write(`\n${"-".repeat(60)}`);
    this.write(`${this.state.companyName} - ${season_emojis[this.state.quarter]} ${quarter_names[this.state.quarter]} Year ${this.state.year}`);
    this.write(`${"-".repeat(60)}\n`);

    // Seasonal events matching Python system
    if (this.state.quarter === 1) {
      this.write("🌱 SPRING: Planning and permit season begins!");
      await this.eventsRouter.random_policy_events(this.state, this.write.bind(this), this.terminal, this.input);
      await ongoing_first_nations_consultation(this.state, this.write.bind(this), this.terminal, this.input);
      await story_progression(this.state, this.write.bind(this), this.terminal, this.input);
      await plan_harvest_schedule(this.state, this.write.bind(this), this.terminal, this.input);
    } else if (this.state.quarter === 2) {
      this.write("☀️ SUMMER: Prime harvesting season!");
      await process_permits(this.state, this.write.bind(this), this.terminal, this.input);
      await conduct_harvest_operations(this.state, this.write.bind(this), this.terminal, this.input);
    } else if (this.state.quarter === 3) {
      this.write("🍂 FALL: Harvest continues, winter prep begins!");
      await process_permits(this.state, this.write.bind(this), this.terminal, this.input);
      await conduct_harvest_operations(this.state, this.write.bind(this), this.terminal, this.input);
    } else {
      this.write("❄️ WINTER: Planning season, limited field operations!");
      await maintain_certifications(this.state, this.write.bind(this), this.terminal, this.input);
      await this.eventsRouter.market_fluctuations(this.state, this.write.bind(this), this.terminal, this.input);
      
      // Pay liaison annual fee if applicable
      if (this.state.fn_liaison) {
        const liaisonCost = this.state.fn_liaison.cost;
        if (this.state.budget >= liaisonCost) {
          this.state.budget -= liaisonCost;
          this.write(`💰 Annual liaison fee: ${formatCurrency(liaisonCost)} paid to ${this.state.fn_liaison.name}`);
        } else {
          this.write(`❌ Cannot afford liaison fee! ${this.state.fn_liaison.name} contract terminated`);
          this.state.fn_liaison = null;
        }
      }
      
      await pay_ceo_annual_costs(this.state, this.write.bind(this));
    }

    // Wacky events if enabled
    if (this.enable_wacky_events) {
      await quarterly_wacky_events(this.state, this.write.bind(this), this.terminal, this.input);
    }
    
    // Workplace safety incidents
    await workplace_safety_incidents(this.state, this.write.bind(this), this.terminal, this.input);
    
    // Random illegal opportunities event
    await random_illegal_opportunities_event(this.state, this.write.bind(this), this.terminal, this.input);
    
    // Competitive market events
    await competitive_market_events(this.state, this.write.bind(this), this.terminal, this.input);
    
    // First Nations anger events
    const angerChance = Math.max(0.05, 0.25 - this.state.community_support * 0.15);
    if (check_anger_event_triggers(this.state) || Math.random() < angerChance) {
      await random_first_nations_anger_events(this.state, this.write.bind(this), this.terminal, this.input);
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
    
    // Strategic management decisions
    await strategic_management_decisions(this.state, this.write.bind(this), this.terminal, this.input);
    
    // CEO quarterly report
    await ceo_quarterly_report(this.state, this.write.bind(this));
    
    // Quarter end summary
    await quarter_end_summary(this.state, this.write.bind(this));
    
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
  }
}

const game = new Game();
game.start();
