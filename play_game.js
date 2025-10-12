#!/usr/bin/env node

import { spawn } from 'child_process';

const extraArgs = process.argv.slice(2);
const cliArgs = ['cli.mjs', '--runs', '1', '--rounds', '4', '--log', ...extraArgs];

const game = spawn('node', cliArgs, { stdio: 'inherit' });

game.on('close', (code) => {
  process.exit(code);
});

game.on('error', (err) => {
  console.error('Unable to launch CLI runner:', err);
  process.exit(1);
});
