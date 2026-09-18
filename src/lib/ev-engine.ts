// Monte Carlo EV engine — ported verbatim (same math, same firm data) from the
// approved EVCalculator.dc.html mockup / expectancy-desk.html standalone tool.

export type AccountConfig = {
  size: number;
  target: number;
  drawdown: number;
  dailyLoss: number | null;
  dailyLossHard: boolean;
  lockAtBreakeven: boolean;
  feeType: "subscription" | "one-time";
  feeMonthly?: number;
  feeOneTime?: number;
  activationFee: number;
  payoutThreshold: number;
  splitTier1Cap: number;
  splitTier1Rate: number;
  splitBaseRate: number;
  lifetimePayouts: number | null;
};

export type Firm = {
  firm: string;
  program: string;
  confidence: "high" | "medium" | "low";
  accounts: AccountConfig[];
  note: string;
  // Discount code August has arranged with this firm, if any — applies to
  // the eval/challenge fee shown at checkout (not activation fees or later
  // subscription months). null/undefined means no known discount right now.
  promoCode?: string;
  discountPct?: number;
  discountNote?: string;
};

export const FIRMS: Firm[] = [
  {
    firm: "Apex Trader Funding",
    program: "Apex 4.0 — EOD Trailing",
    confidence: "high",
    accounts: [
      { size: 25000, target: 1500, drawdown: 1000, dailyLoss: 500, dailyLossHard: false, lockAtBreakeven: true, feeType: "subscription", feeMonthly: 177, activationFee: 99, payoutThreshold: 1000, splitTier1Cap: 25000, splitTier1Rate: 1.0, splitBaseRate: 0.9, lifetimePayouts: 6 },
      { size: 50000, target: 3000, drawdown: 2000, dailyLoss: 1000, dailyLossHard: false, lockAtBreakeven: true, feeType: "subscription", feeMonthly: 197, activationFee: 99, payoutThreshold: 1500, splitTier1Cap: 25000, splitTier1Rate: 1.0, splitBaseRate: 0.9, lifetimePayouts: 6 },
      { size: 100000, target: 6000, drawdown: 3000, dailyLoss: 1500, dailyLossHard: false, lockAtBreakeven: true, feeType: "subscription", feeMonthly: 297, activationFee: 99, payoutThreshold: 2500, splitTier1Cap: 25000, splitTier1Rate: 1.0, splitBaseRate: 0.9, lifetimePayouts: 6 },
      { size: 150000, target: 9000, drawdown: 4000, dailyLoss: 2000, dailyLossHard: false, lockAtBreakeven: true, feeType: "subscription", feeMonthly: 397, activationFee: 99, payoutThreshold: 3500, splitTier1Cap: 25000, splitTier1Rate: 1.0, splitBaseRate: 0.9, lifetimePayouts: 6 },
    ],
    note: "Uncapped resets removed in 4.0. Funded payouts are lifetime-capped at 6 per account.",
    promoCode: "ANGUS",
    discountPct: 80,
    discountNote: "sometimes runs up to 90% off",
  },
  {
    firm: "Topstep",
    program: "Trading Combine",
    confidence: "medium",
    accounts: [
      { size: 50000, target: 3000, drawdown: 2000, dailyLoss: 1000, dailyLossHard: true, lockAtBreakeven: true, feeType: "subscription", feeMonthly: 49, activationFee: 149, payoutThreshold: 2000, splitTier1Cap: 10000, splitTier1Rate: 1.0, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 100000, target: 6000, drawdown: 3000, dailyLoss: 2000, dailyLossHard: true, lockAtBreakeven: true, feeType: "subscription", feeMonthly: 99, activationFee: 149, payoutThreshold: 3000, splitTier1Cap: 10000, splitTier1Rate: 1.0, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 150000, target: 9000, drawdown: 4500, dailyLoss: 3000, dailyLossHard: true, lockAtBreakeven: true, feeType: "subscription", feeMonthly: 199, activationFee: 149, payoutThreshold: 5000, splitTier1Cap: 10000, splitTier1Rate: 1.0, splitBaseRate: 0.9, lifetimePayouts: null },
    ],
    note: "Profit target shown (~6% of size) is the commonly-cited figure — confirm the exact dollar target on Topstep's Combine Parameters page.",
  },
  {
    firm: "MyFundedFutures",
    program: "Rapid",
    confidence: "low",
    accounts: [
      { size: 25000, target: 1500, drawdown: 1000, dailyLoss: null, dailyLossHard: false, lockAtBreakeven: false, feeType: "one-time", feeOneTime: 85, activationFee: 0, payoutThreshold: 1250, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 50000, target: 3000, drawdown: 2000, dailyLoss: null, dailyLossHard: false, lockAtBreakeven: false, feeType: "one-time", feeOneTime: 135, activationFee: 0, payoutThreshold: 1500, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 100000, target: 6000, drawdown: 3000, dailyLoss: null, dailyLossHard: false, lockAtBreakeven: false, feeType: "one-time", feeOneTime: 185, activationFee: 0, payoutThreshold: 2500, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 150000, target: 9000, drawdown: 4500, dailyLoss: null, dailyLossHard: false, lockAtBreakeven: false, feeType: "one-time", feeOneTime: 334, activationFee: 0, payoutThreshold: 3500, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
    ],
    note: "Sources disagreed on whether the eval fee is one-time or recurring — modeled as one-time. Drawdown is intraday-trailing during the evaluation, modeled without a breakeven lock.",
  },
  {
    firm: "Alpha Futures",
    program: "Standard (Zero for 25K)",
    confidence: "medium",
    accounts: [
      { size: 25000, target: 1500, drawdown: 1000, dailyLoss: 500, dailyLossHard: true, lockAtBreakeven: false, feeType: "subscription", feeMonthly: 89, activationFee: 0, payoutThreshold: 1250, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 50000, target: 3000, drawdown: 1500, dailyLoss: null, dailyLossHard: false, lockAtBreakeven: false, feeType: "subscription", feeMonthly: 129, activationFee: 0, payoutThreshold: 1500, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 100000, target: 6000, drawdown: 3000, dailyLoss: null, dailyLossHard: false, lockAtBreakeven: false, feeType: "subscription", feeMonthly: 239, activationFee: 0, payoutThreshold: 2500, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 150000, target: 9000, drawdown: 4500, dailyLoss: null, dailyLossHard: false, lockAtBreakeven: false, feeType: "subscription", feeMonthly: 349, activationFee: 0, payoutThreshold: 3500, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
    ],
    note: "Drawdown trails during the evaluation and converts to a static EOD floor once funded — approximated with the same drawdown amount throughout.",
    promoCode: "ANGUS",
    discountPct: 30,
  },
  {
    firm: "FundedNext Futures",
    program: "Flex Challenge",
    confidence: "medium",
    accounts: [
      { size: 50000, target: 2500, drawdown: 1500, dailyLoss: null, dailyLossHard: false, lockAtBreakeven: false, feeType: "one-time", feeOneTime: 70, activationFee: 0, payoutThreshold: 1250, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 100000, target: 5000, drawdown: 2500, dailyLoss: null, dailyLossHard: false, lockAtBreakeven: false, feeType: "one-time", feeOneTime: 130, activationFee: 0, payoutThreshold: 2500, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 150000, target: 8000, drawdown: 4000, dailyLoss: null, dailyLossHard: false, lockAtBreakeven: false, feeType: "one-time", feeOneTime: 250, activationFee: 0, payoutThreshold: 3500, splitTier1Cap: 0, splitTier1Rate: 0.9, splitBaseRate: 0.9, lifetimePayouts: null },
    ],
    note: "FundedNext advertises splits up to 95% — modeled conservatively at 90% here for consistency. No daily loss limit on Flex.",
    promoCode: "ANGUS",
    discountPct: 50,
  },
  {
    firm: "Blue Guardian",
    program: "Standard (futures)",
    confidence: "low",
    accounts: [
      { size: 50000, target: 3000, drawdown: 2500, dailyLoss: 1250, dailyLossHard: true, lockAtBreakeven: false, feeType: "one-time", feeOneTime: 150, activationFee: 0, payoutThreshold: 1500, splitTier1Cap: 15000, splitTier1Rate: 1.0, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 100000, target: 6000, drawdown: 5000, dailyLoss: 2500, dailyLossHard: true, lockAtBreakeven: false, feeType: "one-time", feeOneTime: 275, activationFee: 0, payoutThreshold: 3000, splitTier1Cap: 15000, splitTier1Rate: 1.0, splitBaseRate: 0.9, lifetimePayouts: null },
      { size: 150000, target: 9000, drawdown: 7500, dailyLoss: 3750, dailyLossHard: true, lockAtBreakeven: false, feeType: "one-time", feeOneTime: 400, activationFee: 0, payoutThreshold: 4500, splitTier1Cap: 15000, splitTier1Rate: 1.0, splitBaseRate: 0.9, lifetimePayouts: null },
    ],
    note: "Sources disagreed materially on Blue Guardian's drawdown percentage (4–6% depending on program) — a 5% midpoint is used here.",
    promoCode: "BALAGOON",
    discountPct: 40,
  },
];

const TRADING_DAYS_PER_MONTH = 20;
const EVAL_SIMS = 700;
const FUNDED_SIMS = 500;
const MAX_EVAL_TRADES = 400;

function mean(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function fmtMoney(n: number) {
  const sign = n < 0 ? "−" : "";
  return sign + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}
export function fmtPct(n: number) {
  return (n * 100).toFixed(1) + "%";
}

export function simulateEval(acc: AccountConfig, winRate: number, avgWin: number, avgLoss: number) {
  let passCount = 0;
  const winStreaks: number[] = [];
  const loseStreaks: number[] = [];
  const tradesUsed: number[] = [];
  for (let i = 0; i < EVAL_SIMS; i++) {
    let bal = 0;
    let peak = 0;
    let floor = -acc.drawdown;
    let curW = 0;
    let curL = 0;
    let maxW = 0;
    let maxL = 0;
    let outcome: "pass" | "fail" | null = null;
    let trades = 0;
    for (let t = 0; t < MAX_EVAL_TRADES; t++) {
      trades++;
      const win = Math.random() < winRate;
      if (win) {
        bal += avgWin;
        curW++;
        curL = 0;
        if (curW > maxW) maxW = curW;
      } else {
        if (acc.dailyLossHard && acc.dailyLoss != null && avgLoss > acc.dailyLoss) {
          outcome = "fail";
          break;
        }
        bal -= avgLoss;
        curL++;
        curW = 0;
        if (curL > maxL) maxL = curL;
      }
      if (bal > peak) {
        peak = bal;
        let nf = peak - acc.drawdown;
        if (acc.lockAtBreakeven) nf = Math.min(nf, 0);
        if (nf > floor) floor = nf;
      }
      if (bal <= floor) {
        outcome = "fail";
        break;
      }
      if (bal >= acc.target) {
        outcome = "pass";
        break;
      }
    }
    if (outcome === "pass") passCount++;
    winStreaks.push(maxW);
    loseStreaks.push(maxL);
    tradesUsed.push(trades);
  }
  return {
    passRate: passCount / EVAL_SIMS,
    avgTradesToOutcome: mean(tradesUsed),
    avgMaxWinStreak: mean(winStreaks),
    avgMaxLoseStreak: mean(loseStreaks),
  };
}

export function simulateFunded(acc: AccountConfig, winRate: number, avgWin: number, avgLoss: number, horizonDays: number) {
  const payouts: number[] = [];
  for (let i = 0; i < FUNDED_SIMS; i++) {
    let bal = 0;
    let peak = 0;
    let floor = -acc.drawdown;
    let bankBase = 0;
    let grossBanked = 0;
    let netBanked = 0;
    let payoutsUsed = 0;
    const maxPayouts = acc.lifetimePayouts == null ? Infinity : acc.lifetimePayouts;
    for (let t = 0; t < horizonDays; t++) {
      const win = Math.random() < winRate;
      if (win) bal += avgWin;
      else bal -= avgLoss;
      if (bal > peak) {
        peak = bal;
        let nf = peak - acc.drawdown;
        if (acc.lockAtBreakeven) nf = Math.min(nf, 0);
        if (nf > floor) floor = nf;
      }
      if (bal <= floor) break;
      if (payoutsUsed < maxPayouts && bal - bankBase >= acc.payoutThreshold) {
        const grossThis = acc.payoutThreshold;
        const rate = grossBanked < acc.splitTier1Cap ? acc.splitTier1Rate : acc.splitBaseRate;
        netBanked += grossThis * rate;
        grossBanked += grossThis;
        bankBase = bal;
        payoutsUsed++;
      }
    }
    payouts.push(netBanked);
  }
  return { expectedPayout: mean(payouts) };
}

export function costToOutcome(acc: AccountConfig, avgTradesToOutcome: number) {
  if (acc.feeType === "one-time") return acc.feeOneTime ?? 0;
  const months = Math.max(1, Math.ceil(avgTradesToOutcome / TRADING_DAYS_PER_MONTH));
  return (acc.feeMonthly ?? 0) * months;
}

// The sticker price for the eval/challenge itself — the one-time fee, or the
// first month's subscription price for firms billed that way. This is what
// a discount code applies against at checkout, distinct from costToOutcome
// (which projects the full multi-month cost of a subscription firm).
export function evalListPrice(acc: AccountConfig) {
  return acc.feeType === "one-time" ? (acc.feeOneTime ?? 0) : (acc.feeMonthly ?? 0);
}

export type Stats = {
  total: number;
  wins: number;
  avgWin: number;
  avgLoss: number;
  winRate: number;
  rr: number;
  expectancy: number;
};

export function deriveStats(total: number, wins: number, avgWin: number, avgLoss: number): Stats {
  const t = Math.max(1, total || 1);
  const w = Math.min(t, Math.max(0, wins || 0));
  const aw = Math.max(0.01, avgWin || 0.01);
  const al = Math.max(0.01, avgLoss || 0.01);
  const winRate = w / t;
  const rr = aw / al;
  const expectancy = winRate * aw - (1 - winRate) * al;
  return { total: t, wins: w, avgWin: aw, avgLoss: al, winRate, rr, expectancy };
}

type FirmMeta = {
  firmName: string;
  program: string;
  confidence: Firm["confidence"];
  note: string;
  promoCode?: string;
  discountPct?: number;
  discountNote?: string;
};

export type RankedAccount = AccountConfig &
  FirmMeta & {
    passRate: number;
    avgTradesToOutcome: number;
    avgMaxWinStreak: number;
    avgMaxLoseStreak: number;
    expectedPayout: number;
    cost: number;
    ev: number;
    listPrice: number;
    discountedPrice: number | null;
  };

export function allAccounts(): (AccountConfig & FirmMeta)[] {
  const rows: (AccountConfig & FirmMeta)[] = [];
  FIRMS.forEach((f) => {
    f.accounts.forEach((a) => {
      rows.push({
        ...a,
        firmName: f.firm,
        program: f.program,
        confidence: f.confidence,
        note: f.note,
        promoCode: f.promoCode,
        discountPct: f.discountPct,
        discountNote: f.discountNote,
      });
    });
  });
  return rows;
}

export function runSimulation(s: Stats, horizonDays: number): RankedAccount[] {
  const rows = allAccounts().map((acc) => {
    const evalRes = simulateEval(acc, s.winRate, s.avgWin, s.avgLoss);
    const fundedRes = simulateFunded(acc, s.winRate, s.avgWin, s.avgLoss, horizonDays);
    const cost = costToOutcome(acc, evalRes.avgTradesToOutcome);
    const ev = evalRes.passRate * (fundedRes.expectedPayout - acc.activationFee) - cost;
    const listPrice = evalListPrice(acc);
    const discountedPrice = acc.discountPct ? listPrice * (1 - acc.discountPct / 100) : null;
    return { ...acc, ...evalRes, ...fundedRes, cost, ev, listPrice, discountedPrice };
  });
  rows.sort((a, b) => b.ev - a.ev);
  return rows;
}
