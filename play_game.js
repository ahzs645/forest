#!/usr/bin/env node

import { spawn } from 'child_process';
import readline from 'readline';

const game = spawn('node', ['cli.mjs', '--runs', '1', '--quarters', '8', '--profile', 'balanced', '--step'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let buffer = '';

// Game decisions based on a balanced strategy
const decisions = {
  'where will you operate': '1', // SBS region
  'stewardship plan': '2', // Comprehensive plan
  'archaeological': '2', // Full assessment
  'operations pace': '2', // Normal pace
  'harvest': '2', // Moderate schedule
  'quarterly activity': '1', // Permits focus
  'continue to': '1', // Yes continue
  'maintenance': '1', // Yes to maintenance
  'first nations': '2', // Respectful approach
  'safety': '1', // Prioritize safety
  'market': '2', // Balanced approach
  'illegal': '1', // Decline illegal activities
  'ceo': '2', // Balanced CEO decisions
};

function makeDecision(question) {
  const q = question.toLowerCase();
  for (const [key, value] of Object.entries(decisions)) {
    if (q.includes(key)) {
      console.log(`Decision for "${question.trim()}": ${value}`);
      return value;
    }
  }
  // Default choice
  console.log(`Default decision for "${question.trim()}": 1`);
  return '1';
}

game.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);
  buffer += text;
  
  // Check if we have a prompt
  if (buffer.includes('>') && !buffer.trim().endsWith('---')) {
    const lines = buffer.split('\n');
    const questionLine = lines[lines.length - 2] || lines[lines.length - 1];
    const decision = makeDecision(questionLine);
    
    setTimeout(() => {
      game.stdin.write(decision + '\n');
      buffer = '';
    }, 100);
  }
});

game.stderr.on('data', (data) => {
  process.stderr.write(data);
});

game.on('close', (code) => {
  console.log(`\nGame finished with code ${code}`);
  rl.close();
  process.exit(code);
});

game.on('error', (err) => {
  console.error('Failed to start game:', err);
  rl.close();
  process.exit(1);
});