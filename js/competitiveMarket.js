import { ask, askChoice, formatCurrency, formatVolume } from "./utils.js";

// Rival companies operating in BC forestry
export const RIVAL_COMPANIES = {
  PACIFIC_TIMBER: {
    name: "Pacific Timber Corp",
    size: "LARGE",
    specialization: "High-volume operations",
    market_share: 0.25,
    aggressiveness: 0.7,
    reputation: 0.6,
    financial_strength: 0.8,
    regions: ["SBS", "IDF"]
  },
  WESTERN_FOREST: {
    name: "Western Forest Industries", 
    size: "MEDIUM",
    specialization: "Sustainable forestry",
    market_share: 0.18,
    aggressiveness: 0.4,
    reputation: 0.8,
    financial_strength: 0.6,
    regions: ["IDF", "MS"]
  },
  NORTHERN_MILLS: {
    name: "Northern Mills Ltd",
    size: "LARGE", 
    specialization: "Integrated operations",
    market_share: 0.22,
    aggressiveness: 0.8,
    reputation: 0.5,
    financial_strength: 0.9,
    regions: ["SBS"]
  },
  COASTAL_LOGGING: {
    name: "Coastal Logging Co",
    size: "SMALL",
    specialization: "Niche markets",
    market_share: 0.12,
    aggressiveness: 0.5,
    reputation: 0.7,
    financial_strength: 0.4,
    regions: ["MS"]
  },
  GREEN_HARVEST: {
    name: "Green Harvest Solutions",
    size: "MEDIUM",
    specialization: "Certified forestry",
    market_share: 0.15,
    aggressiveness: 0.3,
    reputation: 0.9,
    financial_strength: 0.5,
    regions: ["IDF", "MS"]
  }
};

// Market dynamics and competitive pressures
export const MARKET_CONDITIONS = {
  OVERSUPPLY: {
    price_impact: -0.15,
    competition_level: 0.8,
    description: "Market oversaturated with timber supply"
  },
  BALANCED: {
    price_impact: 0,
    competition_level: 0.5,
    description: "Stable market conditions"
  },
  HIGH_DEMAND: {
    price_impact: 0.12,
    competition_level: 0.7,
    description: "Strong demand driving prices up"
  },
  SUPPLY_SHORTAGE: {
    price_impact: 0.25,
    competition_level: 0.9,
    description: "Supply constraints creating premium prices"
  }
};

/**
 * Initialize competitive market tracking
 */
export function initializeCompetitiveMarket(state) {
  if (!state.competitive_market) {
    state.competitive_market = {
      market_condition: "BALANCED",
      player_market_share: 0.08, // Starting small
      regional_competitors: [],
      competitive_pressures: [],
      
      // Market intelligence
      price_intelligence_level: 0.3, // How much you know about competitors
      competitor_relationships: {},
      
      // Historical tracking
      lost_contracts: 0,
      won_competitive_bids: 0,
      partnership_opportunities: [],
      
      // Market events
      recent_market_events: [],
      upcoming_competitive_threats: []
    };
    
    // Initialize competitors for the player's region
    initializeRegionalCompetitors(state);
  }
}

/**
 * Initialize competitors based on player's region
 */
function initializeRegionalCompetitors(state) {
  const cm = state.competitive_market;
  const playerRegion = state.region;
  
  Object.entries(RIVAL_COMPANIES).forEach(([key, company]) => {
    if (company.regions.includes(playerRegion)) {
      cm.regional_competitors.push({
        ...company,
        id: key,
        relationship: 0.5, // Neutral starting relationship
        recent_actions: [],
        threat_level: calculateThreatLevel(company, state)
      });
      
      cm.competitor_relationships[key] = {
        cooperation_level: 0.5,
        trust_level: 0.5,
        recent_interactions: []
      };
    }
  });
}

/**
 * Calculate threat level of competitor
 */
function calculateThreatLevel(competitor, state) {
  let threat = competitor.aggressiveness * 0.4;
  threat += competitor.financial_strength * 0.3;
  threat += competitor.market_share * 0.3;
  
  return Math.min(1.0, threat);
}

/**
 * Main competitive market events function
 */
export async function competitive_market_events(state, write, terminal, input) {
  initializeCompetitiveMarket(state);
  
  const cm = state.competitive_market;
  
  // Random chance of competitive event each quarter
  if (Math.random() < 0.4) {
    await triggerCompetitiveEvent(state, write, terminal, input);
  }
  
  // Market condition updates
  if (Math.random() < 0.15) {
    await updateMarketConditions(state, write);
  }
  
  // Competitor actions
  if (Math.random() < 0.3) {
    await competitorActions(state, write, terminal, input);
  }
}

/**
 * Trigger a competitive event
 */
async function triggerCompetitiveEvent(state, write, terminal, input) {
  const cm = state.competitive_market;
  const competitors = cm.regional_competitors;
  
  if (competitors.length === 0) return;
  
  const eventTypes = [
    "contract_competition",
    "price_war",
    "partnership_opportunity", 
    "market_disruption",
    "regulatory_challenge",
    "technology_advancement",
    "reputation_attack"
  ];
  
  const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  const competitor = competitors[Math.floor(Math.random() * competitors.length)];
  
  write("--- 🏢 COMPETITIVE MARKET EVENT ---");
  
  switch (eventType) {
    case "contract_competition":
      await handleContractCompetition(state, write, terminal, input, competitor);
      break;
    case "price_war":
      await handlePriceWar(state, write, terminal, input, competitor);
      break;
    case "partnership_opportunity":
      await handlePartnershipOpportunity(state, write, terminal, input, competitor);
      break;
    case "market_disruption":
      await handleMarketDisruption(state, write, competitor);
      break;
    case "regulatory_challenge":
      await handleRegulatoryChallenge(state, write, terminal, input, competitor);
      break;
    case "technology_advancement":
      await handleTechnologyAdvancement(state, write, competitor);
      break;
    case "reputation_attack":
      await handleReputationAttack(state, write, terminal, input, competitor);
      break;
  }
}

/**
 * Handle contract competition event
 */
async function handleContractCompetition(state, write, terminal, input, competitor) {
  const contractValue = 200000 + Math.random() * 300000;
  const competitorBid = contractValue * (0.85 + Math.random() * 0.2);
  
  write("🎯 MAJOR CONTRACT OPPORTUNITY");
  write(`A ${formatCurrency(contractValue)} timber supply contract is up for bid.`);
  write(`${competitor.name} is expected to bid around ${formatCurrency(competitorBid)}.`);
  write(`Your reputation: ${(state.reputation * 100).toFixed(0)}% vs their reputation: ${(competitor.reputation * 100).toFixed(0)}%`);
  
  const biddingOptions = [
    `Aggressive bid: ${formatCurrency(competitorBid * 0.9)} (90% of competitor)`,
    `Competitive bid: ${formatCurrency(competitorBid * 0.95)} (95% of competitor)`,
    `Strategic bid: ${formatCurrency(competitorBid * 1.02)} (102% of competitor, focus on quality)`,
    `Don't bid on this contract`
  ];
  
  const choice = await askChoice("Bidding strategy:", biddingOptions, terminal, input);
  
  if (choice === 3) {
    write("Decided not to participate in this bidding war.");
    return;
  }
  
  const playerBids = [competitorBid * 0.9, competitorBid * 0.95, competitorBid * 1.02];
  const playerBid = playerBids[choice];
  
  if (state.budget < playerBid * 0.1) { // Need 10% as bid bond
    write("❌ Insufficient funds for bid bond requirement!");
    return;
  }
  
  let winChance = 0.5; // Base 50% chance
  
  // Price competitiveness
  if (choice === 0) winChance += 0.3; // Aggressive pricing
  else if (choice === 1) winChance += 0.1; // Competitive pricing
  else winChance -= 0.2; // Premium pricing
  
  // Reputation factor
  winChance += (state.reputation - competitor.reputation) * 0.4;
  
  // Market share factor
  winChance += (state.competitive_market.player_market_share - competitor.market_share) * 0.3;
  
  // Certification bonus
  winChance += state.get_active_certifications().length * 0.08;
  
  const won = Math.random() < Math.max(0.1, Math.min(0.9, winChance));
  
  if (won) {
    write("🎉 CONTRACT WON!");
    write(`You've secured the ${formatCurrency(contractValue)} contract!`);
    
    state.budget += contractValue - playerBid;
    state.competitive_market.won_competitive_bids++;
    state.competitive_market.player_market_share += 0.02;
    state.reputation += 0.05;
    
    // Competitor relationship impact
    if (choice === 0) { // Aggressive bid
      competitor.relationship -= 0.15;
      write("⚠️  Aggressive bidding has strained relationship with " + competitor.name);
    }
    
  } else {
    write(`💸 Contract lost to ${competitor.name}`);
    write(`They won with better ${Math.random() < 0.5 ? 'pricing' : 'reputation/experience'}.`);
    
    state.competitive_market.lost_contracts++;
    competitor.market_share += 0.01;
    
    // Learning opportunity
    if (Math.random() < 0.3) {
      write("💡 Gained valuable intelligence about competitor pricing strategies");
      state.competitive_market.price_intelligence_level += 0.05;
    }
  }
}

/**
 * Handle price war scenario
 */
async function handlePriceWar(state, write, terminal, input, competitor) {
  write("⚔️  PRICE WAR INITIATED");
  write(`${competitor.name} has significantly reduced their prices in your market area.`);
  write("This aggressive pricing is putting pressure on all market participants.");
  
  const priceReduction = 0.08 + Math.random() * 0.12; // 8-20% price reduction
  write(`Market prices have dropped by approximately ${(priceReduction * 100).toFixed(1)}%.`);
  
  const responseOptions = [
    "Match their prices (maintain market share, reduce profits)",
    "Differentiate on quality/service (risk losing volume)",
    "Focus on niche markets (avoid direct competition)", 
    "Aggressive counter-pricing (escalate price war)",
    "Wait and see approach (minimal action)"
  ];
  
  const choice = await askChoice("Response strategy:", responseOptions, terminal, input);
  
  switch (choice) {
    case 0: // Match prices
      state.log_prices.sawlogs *= (1 - priceReduction * 0.8);
      state.log_prices.pulp *= (1 - priceReduction * 0.8);
      state.log_prices.firewood *= (1 - priceReduction * 0.8);
      write("✅ Matched competitor pricing - maintained market share");
      write("📉 Profit margins reduced significantly");
      break;
      
    case 1: // Quality differentiation
      if (state.reputation > 0.6) {
        write("✅ Successfully differentiated on quality and service");
        write("📈 Premium pricing maintained with loyal customers");
        state.reputation += 0.05;
      } else {
        write("⚠️  Quality differentiation partially successful");
        write("📉 Lost some volume to lower-priced competitors");
        state.competitive_market.player_market_share -= 0.03;
      }
      break;
      
    case 2: // Niche markets
      write("✅ Successfully pivoted to specialized market segments");
      write("📊 Avoided direct price competition");
      state.log_prices.sawlogs *= 1.05; // 5% premium in niche
      break;
      
    case 3: // Escalate
      state.log_prices.sawlogs *= (1 - priceReduction * 1.2);
      state.log_prices.pulp *= (1 - priceReduction * 1.2);
      write("⚔️  Price war escalated - market becomes increasingly unprofitable");
      competitor.relationship -= 0.25;
      break;
      
    case 4: // Wait and see
      write("⏳ Taking wait-and-see approach");
      state.competitive_market.player_market_share -= 0.05;
      write("📉 Lost some market share to aggressive competitors");
      break;
  }
}

/**
 * Handle partnership opportunity
 */
async function handlePartnershipOpportunity(state, write, terminal, input, competitor) {
  write("🤝 PARTNERSHIP OPPORTUNITY");
  write(`${competitor.name} has approached you about a potential partnership.`);
  
  const partnershipTypes = [
    {
      name: "Joint Venture on Large Contract",
      investment: 150000,
      benefit: "Shared risk, higher win probability on major contracts",
      relationship_boost: 0.3
    },
    {
      name: "Shared Infrastructure Development", 
      investment: 200000,
      benefit: "Cost reduction on roads, equipment sharing",
      relationship_boost: 0.2
    },
    {
      name: "Market Intelligence Sharing",
      investment: 50000,
      benefit: "Better competitor insights, coordinated pricing",
      relationship_boost: 0.15
    },
    {
      name: "Technology Partnership",
      investment: 120000,
      benefit: "Shared R&D costs, operational efficiency gains",
      relationship_boost: 0.25
    }
  ];
  
  const partnership = partnershipTypes[Math.floor(Math.random() * partnershipTypes.length)];
  
  write(`Partnership Type: ${partnership.name}`);
  write(`Required Investment: ${formatCurrency(partnership.investment)}`);
  write(`Expected Benefit: ${partnership.benefit}`);
  write("Competitor Profile:");
  write(`  Financial Strength: ${(competitor.financial_strength * 100).toFixed(0)}%`);
  write(`  Reputation: ${(competitor.reputation * 100).toFixed(0)}%`);
  write(`  Current Relationship: ${(competitor.relationship * 100).toFixed(0)}%`);
  
  const partnershipOptions = [
    "Accept partnership proposal",
    "Negotiate better terms (50% more cost, 50% more benefit)",
    "Counter with different partnership type",
    "Decline partnership opportunity"
  ];
  
  const choice = await askChoice("Partnership decision:", partnershipOptions, terminal, input);
  
  if (choice === 0) {
    // Accept partnership
    if (state.budget >= partnership.investment) {
      state.budget -= partnership.investment;
      competitor.relationship += partnership.relationship_boost;
      
      // Apply partnership benefits
      applyPartnershipBenefits(state, partnership);
      
      write(`✅ Partnership established with ${competitor.name}`);
      write(`💰 Investment: ${formatCurrency(partnership.investment)}`);
      write("📈 Relationship improved significantly");
      
    } else {
      write("❌ Insufficient budget for partnership investment");
    }
    
  } else if (choice === 1) {
    // Negotiate better terms
    const negotiatedCost = partnership.investment * 1.5;
    if (state.budget >= negotiatedCost && Math.random() < 0.6) {
      state.budget -= negotiatedCost;
      competitor.relationship += partnership.relationship_boost * 0.8; // Slightly less relationship boost
      
      // Enhanced benefits
      applyPartnershipBenefits(state, partnership, 1.5);
      
      write("✅ Successfully negotiated enhanced partnership terms");
      write(`💰 Investment: ${formatCurrency(negotiatedCost)}`);
      write("📈 Enhanced benefits secured");
      
    } else {
      write("❌ Negotiation failed - partnership opportunity lost");
      competitor.relationship -= 0.05;
    }
    
  } else if (choice === 2) {
    // Counter proposal
    write("🔄 Counter-proposal made - awaiting their response...");
    if (Math.random() < 0.4) {
      write("✅ Counter-proposal accepted - alternative partnership formed");
      // Simplified alternative partnership
      state.budget -= partnership.investment * 0.7;
      competitor.relationship += partnership.relationship_boost * 0.6;
    } else {
      write("❌ Counter-proposal rejected");
    }
    
  } else {
    write("📵 Partnership opportunity declined");
    competitor.relationship -= 0.1;
  }
}

/**
 * Apply partnership benefits to game state
 */
function applyPartnershipBenefits(state, partnership, multiplier = 1.0) {
  const sm = state.strategic_management;
  if (!sm) return;
  
  switch (partnership.name) {
    case "Joint Venture on Large Contract":
      state.competitive_market.won_competitive_bids += Math.floor(2 * multiplier);
      state.permit_bonus += 0.05 * multiplier;
      break;
      
    case "Shared Infrastructure Development":
      sm.bonuses.cost_reduction += 0.08 * multiplier;
      sm.bonuses.operational_efficiency += 0.06 * multiplier;
      break;
      
    case "Market Intelligence Sharing":
      state.competitive_market.price_intelligence_level += 0.15 * multiplier;
      sm.bonuses.competitive_advantage += 0.1 * multiplier;
      break;
      
    case "Technology Partnership":
      sm.bonuses.technology_bonus += 0.12 * multiplier;
      sm.bonuses.productivity += 0.08 * multiplier;
      break;
  }
}

/**
 * Handle market disruption
 */
async function handleMarketDisruption(state, write, competitor) {
  write("🌪️  MARKET DISRUPTION");
  
  const disruptionTypes = [
    "New technology adoption by major competitor",
    "International trade policy changes",
    "Major customer bankruptcy/consolidation", 
    "Supply chain disruption",
    "Environmental regulation changes",
    "Currency exchange rate volatility"
  ];
  
  const disruption = disruptionTypes[Math.floor(Math.random() * disruptionTypes.length)];
  write(`Event: ${disruption}`);
  
  // Apply market disruption effects
  const priceVolatility = 0.05 + Math.random() * 0.15;
  const direction = Math.random() < 0.5 ? -1 : 1;
  
  Object.keys(state.log_prices).forEach(grade => {
    state.log_prices[grade] *= (1 + direction * priceVolatility);
  });
  
  write(`📊 Market prices ${direction > 0 ? 'increased' : 'decreased'} by ${(priceVolatility * 100).toFixed(1)}%`);
  
  // Competitor advantage/disadvantage
  if (Math.random() < 0.3) {
    if (competitor.specialization.includes("technology") || competitor.financial_strength > 0.7) {
      write(`⚠️  ${competitor.name} appears well-positioned to benefit from this disruption`);
      competitor.market_share += 0.02;
    } else {
      write(`📉 ${competitor.name} struggling to adapt to market changes`);
      competitor.market_share -= 0.01;
    }
  }
}

/**
 * Handle regulatory challenge
 */
async function handleRegulatoryChallenge(state, write, terminal, input, competitor) {
  write("⚖️  REGULATORY CHALLENGE");
  write(`${competitor.name} has challenged one of your permits through legal action.`);
  write("They claim procedural violations in the approval process.");
  
  const challengeTypes = [
    { issue: "First Nations consultation adequacy", cost: 45000, reputation_risk: 0.08 },
    { issue: "Environmental assessment completeness", cost: 35000, reputation_risk: 0.06 },
    { issue: "Public consultation process", cost: 25000, reputation_risk: 0.04 },
    { issue: "Technical compliance issues", cost: 30000, reputation_risk: 0.05 }
  ];
  
  const challenge = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];
  write(`Challenge Issue: ${challenge.issue}`);
  write(`Estimated Legal Defense Cost: ${formatCurrency(challenge.cost)}`);
  
  const responseOptions = [
    "Fight the challenge in court (full legal defense)",
    "Negotiate settlement out of court", 
    "Address the issues raised and resubmit",
    "Withdraw the challenged permit"
  ];
  
  const choice = await askChoice("Legal strategy:", responseOptions, terminal, input);
  
  switch (choice) {
    case 0: // Fight in court
      if (state.budget >= challenge.cost) {
        state.budget -= challenge.cost;
        const winChance = 0.6 + (state.reputation - 0.5) * 0.3;
        
        if (Math.random() < winChance) {
          write("✅ Legal challenge successfully defended");
          write("📈 Precedent set - strengthened position for future permits");
          state.permit_bonus += 0.05;
          competitor.relationship -= 0.2;
        } else {
          write("❌ Legal challenge lost");
          write("📉 Permit revoked and reputation damaged");
          state.reputation -= challenge.reputation_risk;
          // Remove a random approved permit
          const approvedBlocks = state.harvest_blocks.filter(b => b.permit_status === "approved");
          if (approvedBlocks.length > 0) {
            approvedBlocks[0].permit_status = "denied";
          }
        }
      } else {
        write("❌ Insufficient budget for legal defense");
      }
      break;
      
    case 1: // Negotiate settlement
      const settlementCost = challenge.cost * 0.6;
      if (state.budget >= settlementCost) {
        state.budget -= settlementCost;
        write("✅ Settlement reached - permit maintained with conditions");
        write(`💰 Settlement cost: ${formatCurrency(settlementCost)}`);
        competitor.relationship -= 0.1;
      } else {
        write("❌ Cannot afford settlement - challenge proceeds to court");
      }
      break;
      
    case 2: // Address issues
      const remedyCost = challenge.cost * 0.4;
      if (state.budget >= remedyCost) {
        state.budget -= remedyCost;
        write("✅ Issues addressed and permit resubmitted");
        write("📈 Improved processes for future applications");
        state.permit_bonus += 0.03;
      } else {
        write("❌ Cannot afford remediation costs");
      }
      break;
      
    case 3: // Withdraw permit
      write("📉 Permit withdrawn to avoid legal costs");
      write("⚠️  Sets precedent for future challenges");
      state.reputation -= challenge.reputation_risk * 0.5;
      state.permit_bonus -= 0.02;
      break;
  }
}

/**
 * Handle technology advancement
 */
async function handleTechnologyAdvancement(state, write, competitor) {
  write("🚀 TECHNOLOGY ADVANCEMENT");
  write(`${competitor.name} has invested in new technology that gives them a competitive advantage.`);
  
  const techTypes = [
    { name: "Advanced GPS/GIS Mapping", advantage: "15% operational efficiency" },
    { name: "Automated Harvesting Equipment", advantage: "20% cost reduction" },
    { name: "AI-Powered Forest Management", advantage: "Better yield prediction" },
    { name: "Drone-Based Forest Monitoring", advantage: "Enhanced environmental compliance" },
    { name: "Blockchain Supply Chain Tracking", advantage: "Premium certified pricing" }
  ];
  
  const tech = techTypes[Math.floor(Math.random() * techTypes.length)];
  write(`Technology: ${tech.name}`);
  write(`Competitive Advantage: ${tech.advantage}`);
  
  // Increase competitor's effectiveness
  competitor.financial_strength += 0.05;
  competitor.market_share += 0.02;
  
  write("💡 Market Intelligence: This technology might be worth investing in for your company.");
  write("📊 Competitor's market position strengthened");
}

/**
 * Handle reputation attack
 */
async function handleReputationAttack(state, write, terminal, input, competitor) {
  write("📰 REPUTATION ATTACK");
  write(`${competitor.name} (or their allies) have launched a public campaign questioning your practices.`);
  
  const attackTypes = [
    { issue: "Environmental stewardship practices", impact: 0.08 },
    { issue: "First Nations relationship claims", impact: 0.10 },
    { issue: "Worker safety record questions", impact: 0.06 },
    { issue: "Sustainable forestry certifications", impact: 0.07 }
  ];
  
  const attack = attackTypes[Math.floor(Math.random() * attackTypes.length)];
  write(`Attack Focus: ${attack.issue}`);
  write(`Potential reputation damage: ${(attack.impact * 100).toFixed(1)}%`);
  
  const responseOptions = [
    "Launch aggressive counter-campaign ($60,000)",
    "Professional PR response and fact correction ($35,000)",
    "Transparent disclosure and improvement plan ($45,000)",
    "Ignore the attacks and let them fade",
    "Seek mediation with competitor"
  ];
  
  const choice = await askChoice("Response strategy:", responseOptions, terminal, input);
  
  switch (choice) {
    case 0: // Aggressive counter
      if (state.budget >= 60000) {
        state.budget -= 60000;
        write("⚔️  Counter-campaign launched");
        if (Math.random() < 0.6) {
          write("✅ Successfully defended reputation");
          competitor.reputation -= 0.05;
          competitor.relationship -= 0.3;
        } else {
          write("❌ Counter-attack backfired - appears defensive");
          state.reputation -= attack.impact * 0.7;
        }
      }
      break;
      
    case 1: // Professional PR
      if (state.budget >= 35000) {
        state.budget -= 35000;
        write("📢 Professional PR response deployed");
        state.reputation -= attack.impact * 0.4; // Reduced damage
        write("📈 Damage control successful - reputation partially protected");
      }
      break;
      
    case 2: // Transparency
      if (state.budget >= 45000) {
        state.budget -= 45000;
        write("🔍 Transparent response with improvement commitments");
        state.reputation -= attack.impact * 0.2; // Minimal damage
        write("📈 Transparency builds long-term trust");
        state.community_support += 0.05;
      }
      break;
      
    case 3: // Ignore
      write("🤫 Decided to ignore the attacks");
      state.reputation -= attack.impact;
      write("📉 Reputation damage from unanswered allegations");
      break;
      
    case 4: // Mediation
      write("🕊️  Seeking mediation with competitor");
      if (Math.random() < 0.4) {
        write("✅ Mediation successful - attacks withdrawn");
        competitor.relationship += 0.1;
      } else {
        write("❌ Mediation failed - attacks continue");
        state.reputation -= attack.impact * 0.8;
      }
      break;
  }
}

/**
 * Update overall market conditions
 */
async function updateMarketConditions(state, write) {
  const cm = state.competitive_market;
  const conditions = Object.keys(MARKET_CONDITIONS);
  const newCondition = conditions[Math.floor(Math.random() * conditions.length)];
  
  if (newCondition !== cm.market_condition) {
    const oldCondition = MARKET_CONDITIONS[cm.market_condition];
    const newConditionData = MARKET_CONDITIONS[newCondition];
    
    cm.market_condition = newCondition;
    
    write("--- 📊 MARKET CONDITIONS UPDATE ---");
    write(`Market Status: ${newConditionData.description}`);
    
    // Apply price changes
    const priceChange = newConditionData.price_impact - oldCondition.price_impact;
    if (Math.abs(priceChange) > 0.05) {
      Object.keys(state.log_prices).forEach(grade => {
        state.log_prices[grade] *= (1 + priceChange);
      });
      
      write(`💰 Timber prices ${priceChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(priceChange * 100).toFixed(1)}%`);
    }
  }
}

/**
 * Competitor actions each quarter
 */
async function competitorActions(state, write, terminal, input) {
  const cm = state.competitive_market;
  const activeCompetitor = cm.regional_competitors[Math.floor(Math.random() * cm.regional_competitors.length)];
  
  if (!activeCompetitor) return;
  
  const actions = [
    "market_expansion",
    "capacity_increase", 
    "price_adjustment",
    "strategic_partnership",
    "technology_investment"
  ];
  
  const action = actions[Math.floor(Math.random() * actions.length)];
  
  write("--- 👁️  COMPETITOR INTELLIGENCE ---");
  write(`${activeCompetitor.name} has made a strategic move:`);
  
  switch (action) {
    case "market_expansion":
      write("📈 Expanding operations into new market segments");
      activeCompetitor.market_share += 0.01;
      break;
      
    case "capacity_increase":
      write("🏭 Increasing production capacity significantly");
      activeCompetitor.financial_strength += 0.03;
      break;
      
    case "price_adjustment":
      const adjustment = Math.random() < 0.5 ? "reduced" : "increased";
      write(`💰 ${adjustment.charAt(0).toUpperCase() + adjustment.slice(1)} pricing strategy`);
      break;
      
    case "strategic_partnership":
      write("🤝 Formed new strategic partnership");
      activeCompetitor.reputation += 0.02;
      break;
      
    case "technology_investment":
      write("🚀 Major technology investment announced");
      activeCompetitor.threat_level += 0.05;
      break;
  }
  
  activeCompetitor.recent_actions.push({ action, quarter: state.quarter, year: state.year });
}

/**
 * Get competitive market status for display
 */
export function getCompetitiveMarketStatus(state) {
  initializeCompetitiveMarket(state);
  const cm = state.competitive_market;
  
  return {
    market_condition: cm.market_condition,
    player_market_share: (cm.player_market_share * 100).toFixed(1) + "%",
    regional_competitors: cm.regional_competitors.length,
    competitive_wins: cm.won_competitive_bids,
    contracts_lost: cm.lost_contracts,
    price_intelligence: (cm.price_intelligence_level * 100).toFixed(0) + "%"
  };
}