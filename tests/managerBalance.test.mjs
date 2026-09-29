import test from 'node:test';
import assert from 'node:assert/strict';

import { simulateManagerYear, summarizeBatch, MANAGER_STYLES } from '../scripts/simulate-manager.mjs';

/**
 * Headless multi-seed years under the play styles the GM playtest used
 * (scripts/simulate-manager.mjs). Before the rebalance a 114% overcut won
 * with the biggest treasury, honest board reports were the reliable way to
 * lose, and a random policy could go bankrupt on Greenhorn.
 */

const SEEDS = Array.from({ length: 16 }, (_, index) => 7000 + index * 41);

async function batch(style, difficulty = 'normal', seeds = SEEDS) {
  const results = [];
  for (const seed of seeds) results.push(await simulateManagerYear(seed, style, { difficulty }));
  return results;
}

const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;

test('play styles separate: competent and honest win inside the band, reckless loses on cut control, spin grades below honesty', async () => {
  const competent = await batch('competent');
  const honest = await batch('honest');
  const reckless = await batch('reckless');
  const spin = await batch('spin');

  const c = summarizeBatch(competent);
  const h = summarizeBatch(honest);
  const r = summarizeBatch(reckless);
  const s = summarizeBatch(spin);

  assert.equal(c.wins, SEEDS.length, JSON.stringify(c.reasons));
  assert.ok(competent.every((result) => result.cutControl.startsWith('within band')), 'a competent GM lands the cut in the band');

  // Honest play can win: full transparency every quarter, no certificate, no spending.
  assert.ok(h.winRate >= 0.9, `honest wins ${h.wins}/${h.runs}: ${JSON.stringify(h.reasons)}`);

  // Pushing the cut and never slowing it is how a GM loses now.
  assert.ok(r.winRate <= 0.2, `reckless wins ${r.wins}/${r.runs}`);
  assert.ok(r.medianCut > 1.15, `reckless median cut ${r.medianCut}`);
  assert.ok(reckless.filter((result) => !result.victory).every((result) => /AAC|Budget exhausted/.test(result.reason)));

  // Spin is a gamble, not the dominant play: it can still win, but it grades
  // below the honest year and runs a hotter file.
  assert.ok(s.winRate >= 0.8, `spin wins ${s.wins}/${s.runs}`);
  assert.ok(mean(honest.map((result) => result.score)) > mean(spin.map((result) => result.score)),
    `honest ${mean(honest.map((result) => result.score))} vs spin ${mean(spin.map((result) => result.score))}`);
  assert.ok(mean(spin.map((result) => result.scrutiny)) > mean(honest.map((result) => result.scrutiny)) + 15);

  // The best years are the ones that did the job: competent outscores reckless by a grade band or more.
  assert.ok(c.medianScore - r.medianScore >= 30, `competent ${c.medianScore} vs reckless ${r.medianScore}`);
});

test('at competent play, spinning the board costs six points or more against telling it straight, and can still win', async () => {
  // The same GM, the same year, the same decisions, except the board prep
  // and the answer to the chair. Before, spin trailed honesty by two points.
  MANAGER_STYLES.__spinner = (journey, options, prompt) => options.find((o) => o.value === 'spin' || o.value === 'polish')
    || MANAGER_STYLES.competent(journey, options, prompt);
  try {
    for (const difficulty of ['normal', 'hard']) {
      const honest = await batch('competent', difficulty);
      const spun = await batch('__spinner', difficulty);
      const median = (results) => summarizeBatch(results).medianScore;
      assert.ok(median(honest) - median(spun) >= 6, `${difficulty}: honest ${median(honest)} vs spin ${median(spun)}`);
      assert.ok(mean(honest.map((r) => r.score)) - mean(spun.map((r) => r.score)) >= 6, `${difficulty} means`);
      assert.ok(summarizeBatch(spun).winRate >= 0.9, `${difficulty}: spin still wins`);
      // What it costs is the file the audit committee reads.
      assert.ok(mean(spun.map((r) => r.scrutiny)) > mean(honest.map((r) => r.scrutiny)) + 30);
    }
  } finally {
    delete MANAGER_STYLES.__spinner;
  }
});

test('a random policy does not go bankrupt on Greenhorn, and difficulty orders the treasuries', async () => {
  const seeds = Array.from({ length: 24 }, (_, index) => 9100 + index * 13);
  const easy = await batch('random', 'easy', seeds);
  assert.equal(easy.filter((result) => /Budget exhausted/.test(result.reason)).length, 0);

  const competentEasy = summarizeBatch(await batch('competent', 'easy'));
  const competentNormal = summarizeBatch(await batch('competent', 'normal'));
  const competentHard = summarizeBatch(await batch('competent', 'hard'));
  assert.ok(competentEasy.medianTreasury > competentNormal.medianTreasury);
  assert.ok(competentNormal.medianTreasury > competentHard.medianTreasury);
  assert.ok(competentHard.winRate >= 0.85, `hard is harder, not a coin flip: ${JSON.stringify(competentHard.reasons)}`);
});

test('no posture and certificate pair is free: each one gives something up', async () => {
  // The whole seed set: lean FSC passes its audit about as often as not
  // (roughly 45% over 60 fresh seeds), so a ten-seed slice read 5 or 6
  // depending on nothing but how the month's dice fell.
  const seeds = SEEDS;
  const pair = async (posture, cert) => {
    MANAGER_STYLES.__pair = (journey, options, prompt) => {
      if (/operating posture/.test(prompt)) return options.find((o) => o.value === posture);
      if (/Certification/.test(prompt)) return options.find((o) => o.value === cert);
      return MANAGER_STYLES.competent(journey, options, prompt);
    };
    try {
      const results = await batch('__pair', 'normal', seeds);
      return {
        treasury: mean(results.map((result) => result.treasury)),
        compliance: mean(results.map((result) => result.compliance)),
        certified: results.filter((result) => result.certifications.some((entry) => entry.endsWith(':certified'))).length,
        wins: results.filter((result) => result.victory).length,
        score: mean(results.map((result) => result.score)),
      };
    } finally {
      delete MANAGER_STYLES.__pair;
    }
  };
  const steadyCsa = await pair('steady', 'CSA');
  const leanCsa = await pair('lean', 'CSA');
  const leanFsc = await pair('lean', 'FSC');
  const partnershipFsc = await pair('relationship', 'FSC');
  const steadyNone = await pair('steady', 'none');

  // Cost discipline banks cash and pays for it in the file.
  assert.ok(leanCsa.treasury > steadyCsa.treasury);
  assert.ok(leanCsa.compliance < steadyCsa.compliance - 10);
  // FSC's audit wants the Nation onside: a cost-cutting year rarely passes it,
  // a partnership year nearly always does.
  assert.ok(leanFsc.certified <= seeds.length / 2, `lean FSC certified ${leanFsc.certified}`);
  assert.ok(partnershipFsc.certified >= seeds.length - 1, `partnership FSC certified ${partnershipFsc.certified}`);
  // Skipping certification is a choice, not a mistake: no system to run and
  // no audit to fail keeps the treasury richer, and the certificate is what
  // the grade and the buyers pay for (asserted below).
  assert.ok(steadyNone.treasury > steadyCsa.treasury, `none ${steadyNone.treasury} vs CSA ${steadyCsa.treasury}`);
  const growthNone = await pair('growth', 'none');
  for (const result of [steadyCsa, leanCsa, leanFsc, partnershipFsc, steadyNone, growthNone]) {
    assert.ok(result.wins >= seeds.length - 1);
  }

  // The choice shows in the grade: competent play no longer pads every pair
  // to 100. Cost discipline is the richer year and the lower grade; pushing
  // the cut without a certificate is the clearly weaker line.
  assert.ok(steadyCsa.score >= 98, `steady CSA ${steadyCsa.score}`);
  assert.ok(leanCsa.score < steadyCsa.score, `lean CSA ${leanCsa.score} vs steady CSA ${steadyCsa.score}`);
  assert.ok(steadyNone.score < steadyCsa.score);
  assert.ok(steadyCsa.score - growthNone.score >= 4, `steady CSA ${steadyCsa.score} vs growth none ${growthNone.score}`);
  assert.ok(growthNone.score >= 85, 'a weaker line is still a winning year');
});

test('an overcut does not pay: steering Push the cut into the band ends the year richer than riding it to 114%', async () => {
  const year = async (seed, pace) => {
    MANAGER_STYLES.__push = (journey, options, prompt) => {
      if (/operating posture/.test(prompt)) return options.find((o) => o.value === 'growth');
      return options.find((o) => ['none', 'hold', 'plan', 'desk', 'rehearse', 'transparent', 'set_aside', pace].includes(o.value))
        || options.find((o) => o.recommended);
    };
    try {
      return await simulateManagerYear(seed, '__push');
    } finally {
      delete MANAGER_STYLES.__push;
    }
  };
  // Whether a given seed's pace:1 year actually rides past the band depends on
  // which situations the seed deals, so the claim is tested on the seeds that
  // do overcut: there, steering must land in the band and pay better.
  let overcutSeeds = 0;
  let steeredTotal = 0;
  let riddenTotal = 0;
  for (const seed of [4321, 4322, 4323, 4324, 4325, 4326, 4327, 4328, 4329, 4330]) {
    const ridden = await year(seed, 'pace:1');
    if (ridden.journey.ledger.cutControlStatus !== 'overcut') continue;
    overcutSeeds += 1;
    const steered = await year(seed, 'steer');
    assert.equal(steered.journey.ledger.cutControlStatus, 'in_band', `${seed} ${steered.cutControl}`);
    steeredTotal += steered.treasury;
    riddenTotal += ridden.treasury;
    assert.ok(steered.score > ridden.score, `${seed}: steered ${steered.score} vs ridden ${ridden.score}`);
  }
  // Situations differ between two runs of one seed once the pace changes, so
  // the money claim is on the total across the overcut seeds, not on each.
  assert.ok(steeredTotal > riddenTotal, `steered ${steeredTotal} vs ridden ${riddenTotal}`);
  assert.ok(overcutSeeds >= 3, `only ${overcutSeeds} of 10 seeds rode past the band`);
});

test('the ledger arithmetic is exact: every printed month reconciles and the treasury closes to the dollar', async () => {
  // A GM who spends nothing and sets every situation aside, so the only money
  // movements are the certificate, the monthly ledgers, the year-end
  // cut-control penalty, a cost-cutting year's silviculture provision and
  // whatever the set-aside situations land. A clean year, an overcut year
  // and a cost-discipline year.
  const hands = (posture, pace) => (journey, options, prompt) => {
    if (/operating posture/.test(prompt)) return options.find((o) => o.value === posture);
    if (/Certification/.test(prompt)) return options.find((o) => o.value === 'CSA');
    return options.find((o) => ['hold', 'plan', 'desk', 'rehearse', 'transparent', 'set_aside', pace].includes(o.value))
      || options.find((o) => o.recommended);
  };
  const cases = [['steady', null], ['growth', 'pace:1'], ['lean', null]];
  for (const [posture, pace] of cases) {
    const lines = [];
    MANAGER_STYLES.__ledger = hands(posture, pace);
    let result;
    try {
      result = await simulateManagerYear(4321, '__ledger', { trace: (line) => lines.push(line) });
    } finally {
      delete MANAGER_STYLES.__ledger;
    }
    const { journey } = result;
    const ledger = journey.ledger;
    assert.equal(ledger.months.length, 12);
    assert.ok(journey.resources.budget > 0, 'the reconciliation needs an unclamped treasury');

    // Setting a situation aside now lands its least cost, and that can be
    // money: whatever a month's treasury shows beyond its net is that spend.
    let treasury = ledger.startTreasury - 100000;
    let unexplained = 0;
    for (const month of ledger.months) {
      assert.equal(month.margin, month.logPrice + month.premium - month.stumpage - month.cost);
      assert.equal(month.revenue, Math.round(month.delivered * month.margin));
      assert.equal(month.net, month.revenue - month.overhead - month.certCost - month.standby);
      treasury += month.net;
      unexplained += month.treasury - treasury;
      treasury = month.treasury;
    }
    assert.equal(ledger.deliveredYtd, ledger.months.reduce((sum, month) => sum + month.delivered, 0));
    const deferredSpend = (journey.log || [])
      .filter((entry) => entry.setAside)
      .reduce((sum, entry) => sum + (Number(entry.effects?.budget) || 0), 0);
    assert.equal(unexplained, deferredSpend, 'every dollar beyond the ledgers is a set-aside charge');
    assert.equal(journey.resources.budget, treasury - (ledger.overcutPenalty || 0) - (ledger.silvicultureProvision || 0));
    if (posture === 'lean') {
      assert.equal(ledger.silvicultureProvision, Math.round(ledger.deliveredYtd * 0.5), 'the deferred silviculture is booked');
      assert.ok(lines.some((line) => line.startsWith(`The auditors book the silviculture the year deferred as a provision: $${ledger.silvicultureProvision.toLocaleString()}`)));
    } else {
      assert.equal(ledger.silvicultureProvision, undefined);
    }
    if (posture === 'growth') {
      assert.ok(ledger.overcutPenalty > 0, 'the overcut year pays its penalty');
      assert.equal(ledger.overcutPenalty, Math.round(ledger.deliveredYtd - ledger.aac * 1.1) * 60);
    }

    // The printed lines say the same thing: margin × volume, charges, net.
    const printed = lines.filter((line) => /^Log price \$/.test(line));
    assert.equal(printed.length, 12);
    printed.forEach((line, index) => {
      const month = ledger.months[index];
      const match = line.match(/= \$(-?[\d.]+)\/m³ margin -> ([+-])\$([\d,]+)$/);
      assert.ok(match, line);
      assert.equal(Number(match[1]), month.margin);
      assert.equal(Number(`${match[2]}${match[3].replaceAll(',', '')}`), month.revenue);
    });

    // Quarterly board totals are the sums of their months.
    for (const quarter of [1, 2, 3, 4]) {
      const months = ledger.months.filter((month) => Math.ceil(month.month / 3) === quarter);
      const volume = months.reduce((sum, month) => sum + month.delivered, 0);
      const net = months.reduce((sum, month) => sum + month.net, 0);
      const sign = net >= 0 ? '+' : '-';
      assert.ok(lines.some((line) => line.includes(`Quarter: ${volume.toLocaleString()} m³, net ${sign}$${Math.abs(net).toLocaleString()}`)), `Q${quarter}`);
    }
  }
});
