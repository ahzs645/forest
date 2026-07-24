#!/usr/bin/env node
/**
 * Playthrough transcript logger.
 *
 * Drives the real browser build end to end and writes a readable transcript:
 * every terminal delta, every decision prompt, every option offered, and the
 * one taken — plus a tail summary counting how often each prompt and choice
 * label repeated. That summary is the point: it is how you see, without
 * playing 250 turns by hand, that a quarter of the run was pressing next, or
 * that one option label appeared sixty times.
 *
 * Needs a build being served (npm run serve:e2e, or vite preview on 4173).
 *
 *   node scripts/playthrough-log.mjs --role 2 --area 0 --seed 1234 \
 *     --strategy shady --steps 250 --out /tmp/recce.log
 *
 * --mode        expedition (default) | campaign | seasonal
 * --role/--area zero-based index into the role/area pickers (expedition only)
 * --strategy    shady (always take the shortcut) | clean (never) | rotate
 * --url         base URL to drive (default http://127.0.0.1:4173/)
 */
import { chromium } from '@playwright/test';
import fs from 'fs';

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}

const roleIndex = Number(arg('role', 0));
const areaIndex = Number(arg('area', 0));
const difficulty = arg('difficulty', 'Greenhorn');
const seed = Number(arg('seed', 4242));
const strategy = arg('strategy', 'shady');
const maxSteps = Number(arg('steps', 400));
const outPath = arg('out', '/tmp/play.log');
const mode = arg('mode', 'expedition'); // expedition | campaign | seasonal
const baseUrl = arg('url', 'http://127.0.0.1:4173/');

const lines = [];
function out(s = '') {
  lines.push(s);
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}
);
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.addInitScript((seedStart) => {
  let s = seedStart;
  Math.random = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  try { localStorage.clear(); } catch (e) {}
}, seed);

await page.goto(baseUrl);
await page.waitForLoadState('networkidle');

async function safeText(sel) {
  try {
    const el = page.locator(sel).first();
    if (!(await el.count())) return '';
    return (await el.innerText()).trim();
  } catch { return ''; }
}

if (mode === 'expedition') {
  await page.click('#new-game-btn');
  await page.click('#intro-continue-btn');
  await page.locator('.role-card').nth(roleIndex).click();
  const roleName = await safeText(`.role-card >> nth=${roleIndex}`);
  out(`### ROLE: ${roleName.replace(/\n/g, ' | ')}`);
  await page.click('#role-continue-btn');
  await page.locator('.area-item').nth(areaIndex).click();
  const areaName = await safeText(`.area-item >> nth=${areaIndex}`);
  out(`### AREA: ${areaName.replace(/\n/g, ' | ')}`);
  await page.click('#area-continue-btn');
  await page.locator('#choices button').filter({ hasText: difficulty }).first().click();
  await page.locator('#choices button').filter({ hasText: 'Begin Journey' }).first().click();
} else if (mode === 'campaign') {
  await page.click('#campaign-btn');
} else if (mode === 'seasonal') {
  await page.click('#tui-mode-btn');
}

let prevTerminal = '';
let step = 0;
const choiceCounts = new Map();
const promptCounts = new Map();

function pickChoice(labels) {
  const lower = labels.map((l) => l.toLowerCase());
  if (strategy === 'shady') {
    const i = lower.findIndex((l) => /shortcut \(high risk\)|take the shortcut|high risk/.test(l));
    if (i >= 0) return i;
  }
  if (strategy === 'clean') {
    const i = lower.findIndex((l) => /refuse|document and report/.test(l));
    if (i >= 0) return i;
  }
  // Rotate through the options so a long run exercises more than option one.
  return step % labels.length;
}

while (step < maxSteps) {
  await page.waitForTimeout(120);
  const choices = page.locator('#choices button');
  const count = await choices.count().catch(() => 0);
  const inputVisible = await page.locator('#input-wrapper').isVisible().catch(() => false);

  const terminal = await safeText('#terminal');
  if (terminal !== prevTerminal) {
    let delta = terminal;
    if (terminal.startsWith(prevTerminal)) delta = terminal.slice(prevTerminal.length);
    prevTerminal = terminal;
    if (delta.trim()) {
      out('');
      out(delta.trim());
    }
  }

  if (inputVisible) {
    out(`[TEXT INPUT] -> "Playtest"`);
    await page.fill('#text-input', 'Playtest');
    await page.click('#submit-btn');
    step += 1;
    continue;
  }

  if (!count) {
    // maybe end screen
    const end = await safeText('#terminal');
    out('\n=== NO CHOICES AVAILABLE (end or stuck) ===');
    break;
  }

  const labels = await choices.allInnerTexts();
  const title = await safeText('#decision-title');
  const mission = await safeText('#mission-panel');
  const idx = pickChoice(labels.map((l) => l.trim()));

  promptCounts.set(title, (promptCounts.get(title) || 0) + 1);
  const chosen = labels[idx].trim();
  choiceCounts.set(chosen, (choiceCounts.get(chosen) || 0) + 1);

  out(`--- STEP ${step} | PROMPT: ${title} ---`);
  if (mission) out(`[MISSION PANEL] ${mission.replace(/\n+/g, ' | ')}`);
  labels.forEach((l, i) => out(`   ${i === idx ? '>' : ' '} [${i + 1}] ${l.trim().replace(/\n+/g, ' / ')}`));

  await choices.nth(idx).click({ timeout: 15000 }).catch(async () => {
    await page.keyboard.press('Enter');
  });
  step += 1;
}

const terminal = await safeText('#terminal');
if (terminal !== prevTerminal && terminal.startsWith(prevTerminal)) {
  out('');
  out(terminal.slice(prevTerminal.length).trim());
}

out('\n\n===== SUMMARY =====');
out(`steps: ${step}`);
out('\nPROMPT FREQUENCY:');
[...promptCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => out(`  ${v}x  ${k}`));
out('\nCHOICE LABEL FREQUENCY:');
[...choiceCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => out(`  ${v}x  ${k.replace(/\n+/g, ' / ')}`));
if (errors.length) {
  out('\nRUNTIME ERRORS:');
  errors.slice(0, 20).forEach((e) => out(`  ${e}`));
}

fs.writeFileSync(outPath, lines.join('\n'));
console.log(`wrote ${outPath} (${lines.length} lines, ${step} steps, ${errors.length} errors)`);
await browser.close();
