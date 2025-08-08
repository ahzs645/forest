#!/usr/bin/env node

import { spawn } from 'child_process';

// Different strategy profiles for testing
const strategies = {
  aggressive: {
    name: 'Aggressive',
    decisions: {
      'where will you operate': '1', // SBS - high AAC
      'stewardship plan': '1', // Minimal plan
      'archaeological': '1', // Minimal survey
      'operations pace': '3', // Aggressive pace
      'harvest': '3', // Aggressive harvest
      'quarterly activity': '1', // Focus on permits
      'maintenance': '2', // Skip maintenance
      'first nations': '3', // Minimal compliance
      'safety': '3', // Minimize response
      'illegal': '1', // Take illegal opportunities
      'concealment': '1', // Pay for concealment
      'proceed with illegal': '1', // Proceed
      'strategic action': '4', // Permit management
      'proceed with this': '1', // Yes
      'equipment maintenance': '2', // Skip
      'response': '2', // Minimize costs
      'bidding': '1', // Aggressive bid
      'consultation': '3', // Minimal
      'crisis': '2', // Focus on equipment
    }
  },
  
  conservative: {
    name: 'Conservative',
    decisions: {
      'where will you operate': '2', // IDF - moderate
      'stewardship plan': '2', // Comprehensive
      'archaeological': '2', // Full assessment
      'operations pace': '1', // Cautious
      'harvest': '1', // Conservative harvest
      'quarterly activity': '2', // Engage First Nations
      'maintenance': '1', // Yes to maintenance
      'first nations': '1', // Comprehensive
      'safety': '1', // Full cooperation
      'illegal': '5', // Decline illegal
      'decline': '1', // Confirm decline
      'strategic action': '2', // First Nations focus
      'proceed with this': '1', // Yes
      'equipment maintenance': '1', // Yes
      'response': '1', // Full compliance
      'bidding': '3', // Quality focus
      'consultation': '1', // Comprehensive
      'crisis': '1', // Help communities
    }
  },
  
  balanced: {
    name: 'Balanced',
    decisions: {
      'where will you operate': '1', // SBS
      'stewardship plan': '2', // Comprehensive
      'archaeological': '2', // Full assessment
      'operations pace': '2', // Normal
      'harvest': '2', // Moderate
      'quarterly activity': '1', // Permits
      'maintenance': '1', // Yes
      'first nations': '2', // Individual meetings
      'safety': '2', // Standard compliance
      'illegal': '5', // Decline
      'strategic action': '1', // Permit management
      'proceed with this': '1', // Yes
      'equipment maintenance': '1', // Yes
      'response': '2', // Standard
      'bidding': '2', // Competitive
      'consultation': '2', // Individual
      'crisis': '1', // Help communities
    }
  },
  
  random: {
    name: 'Random',
    decisions: {} // Will use random selection
  }
};

async function runStrategy(strategy, quarters = 8) {
  return new Promise((resolve) => {
    const results = {
      strategy: strategy.name,
      quarters: [],
      finalBudget: 0,
      finalReputation: 0,
      finalCommunity: 0,
      safetyViolations: 0,
      bankrupt: false,
      decisions: []
    };
    
    const game = spawn('node', ['cli.mjs', '--runs', '1', '--quarters', quarters.toString(), '--profile', 'balanced', '--step'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let buffer = '';
    let quarterCount = 0;
    
    function makeDecision(question) {
      const q = question.toLowerCase();
      
      // Track decision
      let decision = '1';
      
      // Check strategy decisions
      for (const [key, value] of Object.entries(strategy.decisions)) {
        if (q.includes(key)) {
          decision = value;
          break;
        }
      }
      
      // Random strategy
      if (strategy.name === 'Random') {
        const matches = question.match(/^\d+\./gm);
        if (matches) {
          decision = Math.floor(Math.random() * matches.length + 1).toString();
        }
      }
      
      // Default for "Press Enter"
      if (q.includes('press enter')) {
        decision = '';
      }
      
      results.decisions.push({ question: question.trim().slice(0, 50), choice: decision });
      return decision;
    }
    
    game.stdout.on('data', (data) => {
      const text = data.toString();
      buffer += text;
      
      // Extract quarterly data if present
      if (text.includes('Quarter Summary')) {
        quarterCount++;
      }
      
      // Check for prompts
      if (buffer.includes('>') && !buffer.trim().endsWith('---')) {
        const lines = buffer.split('\n');
        const questionLine = lines[lines.length - 2] || lines[lines.length - 1];
        const decision = makeDecision(questionLine);
        
        setTimeout(() => {
          game.stdin.write(decision + '\n');
          buffer = '';
        }, 10);
      }
      
      // Extract final results
      if (text.includes('=== RUN #1 SUMMARY ===')) {
        const summaryText = text.split('=== RUN #1 SUMMARY ===')[1];
        const budgetMatch = summaryText.match(/Budget: ([\d,]+|NaN)/);
        const repMatch = summaryText.match(/Reputation: (-?\d+)%/);
        const commMatch = summaryText.match(/Community: (\d+)%/);
        const safetyMatch = summaryText.match(/Safety violations: (\d+)/);
        
        if (budgetMatch) {
          results.finalBudget = budgetMatch[1] === 'NaN' ? 'BANKRUPT' : parseInt(budgetMatch[1].replace(/,/g, ''));
          results.bankrupt = budgetMatch[1] === 'NaN';
        }
        if (repMatch) results.finalReputation = parseInt(repMatch[1]);
        if (commMatch) results.finalCommunity = parseInt(commMatch[1]);
        if (safetyMatch) results.safetyViolations = parseInt(safetyMatch[1]);
      }
    });
    
    game.on('close', () => {
      resolve(results);
    });
    
    game.on('error', (err) => {
      console.error('Game error:', err);
      resolve(results);
    });
  });
}

// Run tests
console.log('Testing different strategies...\n');

for (const [key, strategy] of Object.entries(strategies)) {
  console.log(`\nTesting ${strategy.name} strategy...`);
  const result = await runStrategy(strategy, 8);
  
  console.log(`\n=== ${strategy.name} Strategy Results ===`);
  console.log(`Final Budget: ${result.bankrupt ? 'BANKRUPT' : '$' + result.finalBudget.toLocaleString()}`);
  console.log(`Final Reputation: ${result.finalReputation}%`);
  console.log(`Community Relations: ${result.finalCommunity}%`);
  console.log(`Safety Violations: ${result.safetyViolations}`);
  console.log(`Key Decisions Made: ${result.decisions.length}`);
  
  // Show first few decisions
  console.log('\nFirst 5 decisions:');
  result.decisions.slice(0, 5).forEach(d => {
    console.log(`  ${d.question}... => Choice ${d.choice}`);
  });
}

console.log('\n\n=== ANALYSIS COMPLETE ===');