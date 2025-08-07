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
  
  write(`\\n--- 🏢 COMPETITIVE MARKET EVENT ---`);
  
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
  
  write(`🎯 MAJOR CONTRACT OPPORTUNITY`);
  write(`A ${formatCurrency(contractValue)} timber supply contract is up for bid.`);
  write(`${competitor.name} is expected to bid around ${formatCurrency(competitorBid)}.`);
  write(`Your reputation: ${(state.reputation * 100).toFixed(0)}% vs their reputation: ${(competitor.reputation * 100).toFixed(0)}%`);
  
  const biddingOptions = [
    `Aggressive bid: ${formatCurrency(competitorBid * 0.9)} (90% of competitor)`,
    `Competitive bid: ${formatCurrency(competitorBid * 0.95)} (95% of competitor)`,\n    `Strategic bid: ${formatCurrency(competitorBid * 1.02)} (102% of competitor, focus on quality)`,\n    `Don't bid on this contract`\n  ];\n  \n  const choice = await askChoice(\"Bidding strategy:\", biddingOptions, terminal, input);\n  \n  if (choice === 3) {\n    write(\"Decided not to participate in this bidding war.\");\n    return;\n  }\n  \n  const playerBids = [competitorBid * 0.9, competitorBid * 0.95, competitorBid * 1.02];\n  const playerBid = playerBids[choice];\n  \n  if (state.budget < playerBid * 0.1) { // Need 10% as bid bond\n    write(\"❌ Insufficient funds for bid bond requirement!\");\n    return;\n  }\n  \n  let winChance = 0.5; // Base 50% chance\n  \n  // Price competitiveness\n  if (choice === 0) winChance += 0.3; // Aggressive pricing\n  else if (choice === 1) winChance += 0.1; // Competitive pricing\n  else winChance -= 0.2; // Premium pricing\n  \n  // Reputation factor\n  winChance += (state.reputation - competitor.reputation) * 0.4;\n  \n  // Market share factor\n  winChance += (state.competitive_market.player_market_share - competitor.market_share) * 0.3;\n  \n  // Certification bonus\n  winChance += state.get_active_certifications().length * 0.08;\n  \n  const won = Math.random() < Math.max(0.1, Math.min(0.9, winChance));\n  \n  if (won) {\n    write(`\\n🎉 CONTRACT WON!`);\n    write(`You've secured the ${formatCurrency(contractValue)} contract!`);\n    \n    state.budget += contractValue - playerBid;\n    state.competitive_market.won_competitive_bids++;\n    state.competitive_market.player_market_share += 0.02;\n    state.reputation += 0.05;\n    \n    // Competitor relationship impact\n    if (choice === 0) { // Aggressive bid\n      competitor.relationship -= 0.15;\n      write(\"⚠️  Aggressive bidding has strained relationship with \" + competitor.name);\n    }\n    \n  } else {\n    write(`\\n💸 Contract lost to ${competitor.name}`);\n    write(`They won with better ${Math.random() < 0.5 ? 'pricing' : 'reputation/experience'}.`);\n    \n    state.competitive_market.lost_contracts++;\n    competitor.market_share += 0.01;\n    \n    // Learning opportunity\n    if (Math.random() < 0.3) {\n      write(\"💡 Gained valuable intelligence about competitor pricing strategies\");\n      state.competitive_market.price_intelligence_level += 0.05;\n    }\n  }\n}\n\n/**\n * Handle price war scenario\n */\nasync function handlePriceWar(state, write, terminal, input, competitor) {\n  write(`⚔️  PRICE WAR INITIATED`);\n  write(`${competitor.name} has significantly reduced their prices in your market area.`);\n  write(`This aggressive pricing is putting pressure on all market participants.`);\n  \n  const priceReduction = 0.08 + Math.random() * 0.12; // 8-20% price reduction\n  write(`Market prices have dropped by approximately ${(priceReduction * 100).toFixed(1)}%.`);\n  \n  const responseOptions = [\n    \"Match their prices (maintain market share, reduce profits)\",\n    \"Differentiate on quality/service (risk losing volume)\",\n    \"Focus on niche markets (avoid direct competition)\", \n    \"Aggressive counter-pricing (escalate price war)\",\n    \"Wait and see approach (minimal action)\"\n  ];\n  \n  const choice = await askChoice(\"Response strategy:\", responseOptions, terminal, input);\n  \n  switch (choice) {\n    case 0: // Match prices\n      state.log_prices.sawlogs *= (1 - priceReduction * 0.8);\n      state.log_prices.pulp *= (1 - priceReduction * 0.8);\n      state.log_prices.firewood *= (1 - priceReduction * 0.8);\n      write(\"✅ Matched competitor pricing - maintained market share\");\n      write(\"📉 Profit margins reduced significantly\");\n      break;\n      \n    case 1: // Quality differentiation\n      if (state.reputation > 0.6) {\n        write(\"✅ Successfully differentiated on quality and service\");\n        write(\"📈 Premium pricing maintained with loyal customers\");\n        state.reputation += 0.05;\n      } else {\n        write(\"⚠️  Quality differentiation partially successful\");\n        write(\"📉 Lost some volume to lower-priced competitors\");\n        state.competitive_market.player_market_share -= 0.03;\n      }\n      break;\n      \n    case 2: // Niche markets\n      write(\"✅ Successfully pivoted to specialized market segments\");\n      write(\"📊 Avoided direct price competition\");\n      state.log_prices.sawlogs *= 1.05; // 5% premium in niche\n      break;\n      \n    case 3: // Escalate\n      state.log_prices.sawlogs *= (1 - priceReduction * 1.2);\n      state.log_prices.pulp *= (1 - priceReduction * 1.2);\n      write(\"⚔️  Price war escalated - market becomes increasingly unprofitable\");\n      competitor.relationship -= 0.25;\n      break;\n      \n    case 4: // Wait and see\n      write(\"⏳ Taking wait-and-see approach\");\n      state.competitive_market.player_market_share -= 0.05;\n      write(\"📉 Lost some market share to aggressive competitors\");\n      break;\n  }\n}\n\n/**\n * Handle partnership opportunity\n */\nasync function handlePartnershipOpportunity(state, write, terminal, input, competitor) {\n  write(`🤝 PARTNERSHIP OPPORTUNITY`);\n  write(`${competitor.name} has approached you about a potential partnership.`);\n  \n  const partnershipTypes = [\n    {\n      name: \"Joint Venture on Large Contract\",\n      investment: 150000,\n      benefit: \"Shared risk, higher win probability on major contracts\",\n      relationship_boost: 0.3\n    },\n    {\n      name: \"Shared Infrastructure Development\", \n      investment: 200000,\n      benefit: \"Cost reduction on roads, equipment sharing\",\n      relationship_boost: 0.2\n    },\n    {\n      name: \"Market Intelligence Sharing\",\n      investment: 50000,\n      benefit: \"Better competitor insights, coordinated pricing\",\n      relationship_boost: 0.15\n    },\n    {\n      name: \"Technology Partnership\",\n      investment: 120000,\n      benefit: \"Shared R&D costs, operational efficiency gains\",\n      relationship_boost: 0.25\n    }\n  ];\n  \n  const partnership = partnershipTypes[Math.floor(Math.random() * partnershipTypes.length)];\n  \n  write(`Partnership Type: ${partnership.name}`);\n  write(`Required Investment: ${formatCurrency(partnership.investment)}`);\n  write(`Expected Benefit: ${partnership.benefit}`);\n  write(`\\nCompetitor Profile:`);\n  write(`  Financial Strength: ${(competitor.financial_strength * 100).toFixed(0)}%`);\n  write(`  Reputation: ${(competitor.reputation * 100).toFixed(0)}%`);\n  write(`  Current Relationship: ${(competitor.relationship * 100).toFixed(0)}%`);\n  \n  const partnershipOptions = [\n    \"Accept partnership proposal\",\n    \"Negotiate better terms (50% more cost, 50% more benefit)\",\n    \"Counter with different partnership type\",\n    \"Decline partnership opportunity\"\n  ];\n  \n  const choice = await askChoice(\"Partnership decision:\", partnershipOptions, terminal, input);\n  \n  if (choice === 0) {\n    // Accept partnership\n    if (state.budget >= partnership.investment) {\n      state.budget -= partnership.investment;\n      competitor.relationship += partnership.relationship_boost;\n      \n      // Apply partnership benefits\n      applyPartnershipBenefits(state, partnership);\n      \n      write(`✅ Partnership established with ${competitor.name}`);\n      write(`💰 Investment: ${formatCurrency(partnership.investment)}`);\n      write(`📈 Relationship improved significantly`);\n      \n    } else {\n      write(`❌ Insufficient budget for partnership investment`);\n    }\n    \n  } else if (choice === 1) {\n    // Negotiate better terms\n    const negotiatedCost = partnership.investment * 1.5;\n    if (state.budget >= negotiatedCost && Math.random() < 0.6) {\n      state.budget -= negotiatedCost;\n      competitor.relationship += partnership.relationship_boost * 0.8; // Slightly less relationship boost\n      \n      // Enhanced benefits\n      applyPartnershipBenefits(state, partnership, 1.5);\n      \n      write(`✅ Successfully negotiated enhanced partnership terms`);\n      write(`💰 Investment: ${formatCurrency(negotiatedCost)}`);\n      write(`📈 Enhanced benefits secured`);\n      \n    } else {\n      write(`❌ Negotiation failed - partnership opportunity lost`);\n      competitor.relationship -= 0.05;\n    }\n    \n  } else if (choice === 2) {\n    // Counter proposal\n    write(`🔄 Counter-proposal made - awaiting their response...`);\n    if (Math.random() < 0.4) {\n      write(`✅ Counter-proposal accepted - alternative partnership formed`);\n      // Simplified alternative partnership\n      state.budget -= partnership.investment * 0.7;\n      competitor.relationship += partnership.relationship_boost * 0.6;\n    } else {\n      write(`❌ Counter-proposal rejected`);\n    }\n    \n  } else {\n    write(`📵 Partnership opportunity declined`);\n    competitor.relationship -= 0.1;\n  }\n}\n\n/**\n * Apply partnership benefits to game state\n */\nfunction applyPartnershipBenefits(state, partnership, multiplier = 1.0) {\n  const sm = state.strategic_management;\n  if (!sm) return;\n  \n  switch (partnership.name) {\n    case \"Joint Venture on Large Contract\":\n      state.competitive_market.won_competitive_bids += Math.floor(2 * multiplier);\n      state.permit_bonus += 0.05 * multiplier;\n      break;\n      \n    case \"Shared Infrastructure Development\":\n      sm.bonuses.cost_reduction += 0.08 * multiplier;\n      sm.bonuses.operational_efficiency += 0.06 * multiplier;\n      break;\n      \n    case \"Market Intelligence Sharing\":\n      state.competitive_market.price_intelligence_level += 0.15 * multiplier;\n      sm.bonuses.competitive_advantage += 0.1 * multiplier;\n      break;\n      \n    case \"Technology Partnership\":\n      sm.bonuses.technology_bonus += 0.12 * multiplier;\n      sm.bonuses.productivity += 0.08 * multiplier;\n      break;\n  }\n}\n\n/**\n * Handle market disruption\n */\nasync function handleMarketDisruption(state, write, competitor) {\n  write(`🌪️  MARKET DISRUPTION`);\n  \n  const disruptionTypes = [\n    \"New technology adoption by major competitor\",\n    \"International trade policy changes\",\n    \"Major customer bankruptcy/consolidation\", \n    \"Supply chain disruption\",\n    \"Environmental regulation changes\",\n    \"Currency exchange rate volatility\"\n  ];\n  \n  const disruption = disruptionTypes[Math.floor(Math.random() * disruptionTypes.length)];\n  write(`Event: ${disruption}`);\n  \n  // Apply market disruption effects\n  const priceVolatility = 0.05 + Math.random() * 0.15;\n  const direction = Math.random() < 0.5 ? -1 : 1;\n  \n  Object.keys(state.log_prices).forEach(grade => {\n    state.log_prices[grade] *= (1 + direction * priceVolatility);\n  });\n  \n  write(`📊 Market prices ${direction > 0 ? 'increased' : 'decreased'} by ${(priceVolatility * 100).toFixed(1)}%`);\n  \n  // Competitor advantage/disadvantage\n  if (Math.random() < 0.3) {\n    if (competitor.specialization.includes(\"technology\") || competitor.financial_strength > 0.7) {\n      write(`⚠️  ${competitor.name} appears well-positioned to benefit from this disruption`);\n      competitor.market_share += 0.02;\n    } else {\n      write(`📉 ${competitor.name} struggling to adapt to market changes`);\n      competitor.market_share -= 0.01;\n    }\n  }\n}\n\n/**\n * Handle regulatory challenge\n */\nasync function handleRegulatoryChallenge(state, write, terminal, input, competitor) {\n  write(`⚖️  REGULATORY CHALLENGE`);\n  write(`${competitor.name} has challenged one of your permits through legal action.`);\n  write(`They claim procedural violations in the approval process.`);\n  \n  const challengeTypes = [\n    { issue: \"First Nations consultation adequacy\", cost: 45000, reputation_risk: 0.08 },\n    { issue: \"Environmental assessment completeness\", cost: 35000, reputation_risk: 0.06 },\n    { issue: \"Public consultation process\", cost: 25000, reputation_risk: 0.04 },\n    { issue: \"Technical compliance issues\", cost: 30000, reputation_risk: 0.05 }\n  ];\n  \n  const challenge = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];\n  write(`Challenge Issue: ${challenge.issue}`);\n  write(`Estimated Legal Defense Cost: ${formatCurrency(challenge.cost)}`);\n  \n  const responseOptions = [\n    \"Fight the challenge in court (full legal defense)\",\n    \"Negotiate settlement out of court\", \n    \"Address the issues raised and resubmit\",\n    \"Withdraw the challenged permit\"\n  ];\n  \n  const choice = await askChoice(\"Legal strategy:\", responseOptions, terminal, input);\n  \n  switch (choice) {\n    case 0: // Fight in court\n      if (state.budget >= challenge.cost) {\n        state.budget -= challenge.cost;\n        const winChance = 0.6 + (state.reputation - 0.5) * 0.3;\n        \n        if (Math.random() < winChance) {\n          write(`✅ Legal challenge successfully defended`);\n          write(`📈 Precedent set - strengthened position for future permits`);\n          state.permit_bonus += 0.05;\n          competitor.relationship -= 0.2;\n        } else {\n          write(`❌ Legal challenge lost`);\n          write(`📉 Permit revoked and reputation damaged`);\n          state.reputation -= challenge.reputation_risk;\n          // Remove a random approved permit\n          const approvedBlocks = state.harvest_blocks.filter(b => b.permit_status === \"approved\");\n          if (approvedBlocks.length > 0) {\n            approvedBlocks[0].permit_status = \"denied\";\n          }\n        }\n      } else {\n        write(`❌ Insufficient budget for legal defense`);\n      }\n      break;\n      \n    case 1: // Negotiate settlement\n      const settlementCost = challenge.cost * 0.6;\n      if (state.budget >= settlementCost) {\n        state.budget -= settlementCost;\n        write(`✅ Settlement reached - permit maintained with conditions`);\n        write(`💰 Settlement cost: ${formatCurrency(settlementCost)}`);\n        competitor.relationship -= 0.1;\n      } else {\n        write(`❌ Cannot afford settlement - challenge proceeds to court`);\n      }\n      break;\n      \n    case 2: // Address issues\n      const remedyCost = challenge.cost * 0.4;\n      if (state.budget >= remedyCost) {\n        state.budget -= remedyCost;\n        write(`✅ Issues addressed and permit resubmitted`);\n        write(`📈 Improved processes for future applications`);\n        state.permit_bonus += 0.03;\n      } else {\n        write(`❌ Cannot afford remediation costs`);\n      }\n      break;\n      \n    case 3: // Withdraw permit\n      write(`📉 Permit withdrawn to avoid legal costs`);\n      write(`⚠️  Sets precedent for future challenges`);\n      state.reputation -= challenge.reputation_risk * 0.5;\n      state.permit_bonus -= 0.02;\n      break;\n  }\n}\n\n/**\n * Handle technology advancement\n */\nasync function handleTechnologyAdvancement(state, write, competitor) {\n  write(`🚀 TECHNOLOGY ADVANCEMENT`);\n  write(`${competitor.name} has invested in new technology that gives them a competitive advantage.`);\n  \n  const techTypes = [\n    { name: \"Advanced GPS/GIS Mapping\", advantage: \"15% operational efficiency\" },\n    { name: \"Automated Harvesting Equipment\", advantage: \"20% cost reduction\" },\n    { name: \"AI-Powered Forest Management\", advantage: \"Better yield prediction\" },\n    { name: \"Drone-Based Forest Monitoring\", advantage: \"Enhanced environmental compliance\" },\n    { name: \"Blockchain Supply Chain Tracking\", advantage: \"Premium certified pricing\" }\n  ];\n  \n  const tech = techTypes[Math.floor(Math.random() * techTypes.length)];\n  write(`Technology: ${tech.name}`);\n  write(`Competitive Advantage: ${tech.advantage}`);\n  \n  // Increase competitor's effectiveness\n  competitor.financial_strength += 0.05;\n  competitor.market_share += 0.02;\n  \n  write(`\\n💡 Market Intelligence: This technology might be worth investing in for your company.`);\n  write(`📊 Competitor's market position strengthened`);\n}\n\n/**\n * Handle reputation attack\n */\nasync function handleReputationAttack(state, write, terminal, input, competitor) {\n  write(`📰 REPUTATION ATTACK`);\n  write(`${competitor.name} (or their allies) have launched a public campaign questioning your practices.`);\n  \n  const attackTypes = [\n    { issue: \"Environmental stewardship practices\", impact: 0.08 },\n    { issue: \"First Nations relationship claims\", impact: 0.10 },\n    { issue: \"Worker safety record questions\", impact: 0.06 },\n    { issue: \"Sustainable forestry certifications\", impact: 0.07 }\n  ];\n  \n  const attack = attackTypes[Math.floor(Math.random() * attackTypes.length)];\n  write(`Attack Focus: ${attack.issue}`);\n  write(`Potential reputation damage: ${(attack.impact * 100).toFixed(1)}%`);\n  \n  const responseOptions = [\n    \"Launch aggressive counter-campaign ($60,000)\",\n    \"Professional PR response and fact correction ($35,000)\",\n    \"Transparent disclosure and improvement plan ($45,000)\",\n    \"Ignore the attacks and let them fade\",\n    \"Seek mediation with competitor\"\n  ];\n  \n  const choice = await askChoice(\"Response strategy:\", responseOptions, terminal, input);\n  \n  switch (choice) {\n    case 0: // Aggressive counter\n      if (state.budget >= 60000) {\n        state.budget -= 60000;\n        write(`⚔️  Counter-campaign launched`);\n        if (Math.random() < 0.6) {\n          write(`✅ Successfully defended reputation`);\n          competitor.reputation -= 0.05;\n          competitor.relationship -= 0.3;\n        } else {\n          write(`❌ Counter-attack backfired - appears defensive`);\n          state.reputation -= attack.impact * 0.7;\n        }\n      }\n      break;\n      \n    case 1: // Professional PR\n      if (state.budget >= 35000) {\n        state.budget -= 35000;\n        write(`📢 Professional PR response deployed`);\n        state.reputation -= attack.impact * 0.4; // Reduced damage\n        write(`📈 Damage control successful - reputation partially protected`);\n      }\n      break;\n      \n    case 2: // Transparency\n      if (state.budget >= 45000) {\n        state.budget -= 45000;\n        write(`🔍 Transparent response with improvement commitments`);\n        state.reputation -= attack.impact * 0.2; // Minimal damage\n        write(`📈 Transparency builds long-term trust`);\n        state.community_support += 0.05;\n      }\n      break;\n      \n    case 3: // Ignore\n      write(`🤫 Decided to ignore the attacks`);\n      state.reputation -= attack.impact;\n      write(`📉 Reputation damage from unanswered allegations`);\n      break;\n      \n    case 4: // Mediation\n      write(`🕊️  Seeking mediation with competitor`);\n      if (Math.random() < 0.4) {\n        write(`✅ Mediation successful - attacks withdrawn`);\n        competitor.relationship += 0.1;\n      } else {\n        write(`❌ Mediation failed - attacks continue`);\n        state.reputation -= attack.impact * 0.8;\n      }\n      break;\n  }\n}\n\n/**\n * Update overall market conditions\n */\nasync function updateMarketConditions(state, write) {\n  const cm = state.competitive_market;\n  const conditions = Object.keys(MARKET_CONDITIONS);\n  const newCondition = conditions[Math.floor(Math.random() * conditions.length)];\n  \n  if (newCondition !== cm.market_condition) {\n    const oldCondition = MARKET_CONDITIONS[cm.market_condition];\n    const newConditionData = MARKET_CONDITIONS[newCondition];\n    \n    cm.market_condition = newCondition;\n    \n    write(`\\n--- 📊 MARKET CONDITIONS UPDATE ---`);\n    write(`Market Status: ${newConditionData.description}`);\n    \n    // Apply price changes\n    const priceChange = newConditionData.price_impact - oldCondition.price_impact;\n    if (Math.abs(priceChange) > 0.05) {\n      Object.keys(state.log_prices).forEach(grade => {\n        state.log_prices[grade] *= (1 + priceChange);\n      });\n      \n      write(`💰 Timber prices ${priceChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(priceChange * 100).toFixed(1)}%`);\n    }\n  }\n}\n\n/**\n * Competitor actions each quarter\n */\nasync function competitorActions(state, write, terminal, input) {\n  const cm = state.competitive_market;\n  const activeCompetitor = cm.regional_competitors[Math.floor(Math.random() * cm.regional_competitors.length)];\n  \n  if (!activeCompetitor) return;\n  \n  const actions = [\n    \"market_expansion\",\n    \"capacity_increase\", \n    \"price_adjustment\",\n    \"strategic_partnership\",\n    \"technology_investment\"\n  ];\n  \n  const action = actions[Math.floor(Math.random() * actions.length)];\n  \n  write(`\\n--- 👁️  COMPETITOR INTELLIGENCE ---`);\n  write(`${activeCompetitor.name} has made a strategic move:`);\n  \n  switch (action) {\n    case \"market_expansion\":\n      write(`📈 Expanding operations into new market segments`);\n      activeCompetitor.market_share += 0.01;\n      break;\n      \n    case \"capacity_increase\":\n      write(`🏭 Increasing production capacity significantly`);\n      activeCompetitor.financial_strength += 0.03;\n      break;\n      \n    case \"price_adjustment\":\n      const adjustment = Math.random() < 0.5 ? \"reduced\" : \"increased\";\n      write(`💰 ${adjustment.charAt(0).toUpperCase() + adjustment.slice(1)} pricing strategy`);\n      break;\n      \n    case \"strategic_partnership\":\n      write(`🤝 Formed new strategic partnership`);\n      activeCompetitor.reputation += 0.02;\n      break;\n      \n    case \"technology_investment\":\n      write(`🚀 Major technology investment announced`);\n      activeCompetitor.threat_level += 0.05;\n      break;\n  }\n  \n  activeCompetitor.recent_actions.push({ action, quarter: state.quarter, year: state.year });\n}\n\n/**\n * Get competitive market status for display\n */\nexport function getCompetitiveMarketStatus(state) {\n  initializeCompetitiveMarket(state);\n  const cm = state.competitive_market;\n  \n  return {\n    market_condition: cm.market_condition,\n    player_market_share: (cm.player_market_share * 100).toFixed(1) + \"%\",\n    regional_competitors: cm.regional_competitors.length,\n    competitive_wins: cm.won_competitive_bids,\n    contracts_lost: cm.lost_contracts,\n    price_intelligence: (cm.price_intelligence_level * 100).toFixed(0) + \"%\"\n  };\n}"