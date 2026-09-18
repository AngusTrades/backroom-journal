"use client";

import { useState } from "react";
import { deriveStats, runSimulation, fmtMoney, fmtPct, type RankedAccount, type Stats } from "@/lib/ev-engine";

const HORIZON_OPTIONS = [
  { value: 20, label: "1 month" },
  { value: 60, label: "3 months" },
  { value: 120, label: "6 months" },
  { value: 240, label: "12 months" },
];

export function EVCalculator() {
  const [totalTrades, setTotalTrades] = useState(120);
  const [winningTrades, setWinningTrades] = useState(54);
  const [avgWin, setAvgWin] = useState(650);
  const [avgLoss, setAvgLoss] = useState(310);
  const [horizon, setHorizon] = useState(60);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ stats: Stats; rows: RankedAccount[] } | null>(null);

  const liveStats = deriveStats(totalTrades, winningTrades, avgWin, avgLoss);

  function handleRun() {
    setRunning(true);
    // Let the button repaint to "Simulating…" before the synchronous crunch.
    setTimeout(() => {
      const s = deriveStats(totalTrades, winningTrades, avgWin, avgLoss);
      const rows = runSimulation(s, horizon);
      setResults({ stats: s, rows });
      setRunning(false);
    }, 30);
  }

  const rows = results?.rows ?? [];
  const stats = results?.stats ?? liveStats;
  const best = rows[0];
  const avgPass = rows.length ? rows.reduce((s, r) => s + r.passRate, 0) / rows.length : 0;
  const top10 = rows.slice(0, 10);
  const maxAbs = top10.length ? Math.max(...top10.map((r) => Math.abs(r.ev)), 1) : 1;

  return (
    <div>
      <div className="ev-steps">
        <div className="ev-step">
          <div className="num">1</div>
          <div>
            <div className="t">Enter your trade stats</div>
            <div className="d">Sample size, win rate, avg win/loss</div>
          </div>
        </div>
        <div className="ev-step">
          <div className="num">2</div>
          <div>
            <div className="t">Run the simulation</div>
            <div className="d">700 evaluation runs per account, simulated</div>
          </div>
        </div>
        <div className="ev-step">
          <div className="num">3</div>
          <div>
            <div className="t">Read the ranking</div>
            <div className="d">EV, pass rate, streaks, per account</div>
          </div>
        </div>
      </div>

      <div className="ev-board">
        <div className="card ev-rail">
          <div className="ev-rail-head">
            <div className="eyebrow">Your trade history</div>
            <h2>Enter your stats</h2>
          </div>
          <div className="ev-field-group">
            <div className="field">
              <label>Total trades in sample</label>
              <input type="number" min={10} step={1} value={totalTrades} onChange={(e) => setTotalTrades(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Winning trades</label>
              <input type="number" min={0} step={1} value={winningTrades} onChange={(e) => setWinningTrades(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Average win ($)</label>
              <input type="number" min={1} step={1} value={avgWin} onChange={(e) => setAvgWin(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Average loss ($, positive number)</label>
              <input type="number" min={1} step={1} value={avgLoss} onChange={(e) => setAvgLoss(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Funded-phase horizon</label>
              <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
                {HORIZON_OPTIONS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
              <div className="hint">How long you'd trade the funded account before this projection stops.</div>
            </div>
          </div>
          <div className="ev-derived">
            <div>
              <div className="k">Win rate</div>
              <div className="v">{fmtPct(liveStats.winRate)}</div>
            </div>
            <div>
              <div className="k">Reward:Risk</div>
              <div className="v">{liveStats.rr.toFixed(2)}R</div>
            </div>
            <div>
              <div className="k">Expectancy / trade</div>
              <div className={`v ${liveStats.expectancy >= 0 ? "pos" : "neg"}`}>{fmtMoney(liveStats.expectancy)}</div>
            </div>
            <div>
              <div className="k">Sample size</div>
              <div className="v">{liveStats.total}</div>
            </div>
          </div>
          <button className="ev-run-btn" disabled={running} onClick={handleRun}>
            {running ? "Simulating…" : "Run simulation"}
          </button>
          <div className="ev-sim-note">
            {results
              ? `${rows.length} accounts simulated · 700 evaluation runs each`
              : "Example stats shown — replace with your own trade history, then run."}
          </div>
        </div>

        <div className="main-col">
          {!results ? (
            <div className="card card-pad">
              <div className="sub">Run the simulation to rank every prop-firm account by expected value.</div>
            </div>
          ) : (
            <>
              <div className="ev-stat-row">
                <div className="ev-stat-tile pick">
                  <div className="k">Best expected value</div>
                  <div className="v">{best.firmName}</div>
                  <div className="sub">
                    {best.size / 1000}K · {fmtMoney(best.ev)} EV · {fmtPct(best.passRate)} pass rate
                  </div>
                </div>
                <div className="ev-stat-tile">
                  <div className="k">Your expectancy per trade</div>
                  <div className="v" style={{ color: stats.expectancy >= 0 ? "var(--good)" : "var(--bad)" }}>
                    {fmtMoney(stats.expectancy)}
                  </div>
                  <div className="sub">
                    {fmtPct(stats.winRate)} win rate · {stats.rr.toFixed(2)}R avg trade
                  </div>
                </div>
                <div className="ev-stat-tile">
                  <div className="k">Average pass rate across all accounts</div>
                  <div className="v">{fmtPct(avgPass)}</div>
                  <div className="sub">{rows.length} firm/account combinations simulated</div>
                </div>
              </div>

              <div className="ev-section-head">
                <h3>Expected value by account</h3>
                <span className="note">
                  Top {Math.min(10, rows.length)} of {rows.length} accounts, by EV
                </span>
              </div>
              <div className="card ev-chart-panel">
                {top10.map((r) => {
                  const pct = Math.min(100, (Math.abs(r.ev) / maxAbs) * 100);
                  const isPos = r.ev >= 0;
                  return (
                    <div className="bar-row" key={`${r.firmName}-${r.size}`}>
                      <div className="lbl">
                        {r.firmName} {r.size / 1000}K
                      </div>
                      <div className="bar-track">
                        <div className={`bar-fill ${isPos ? "good" : "bad"}`} style={{ left: 0, width: `${pct}%` }} />
                      </div>
                      <div className={`val ${isPos ? "pos" : "neg"}`}>{fmtMoney(r.ev)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="ev-legend-line">
                <span>
                  <span className="dot" style={{ background: "var(--good)" }}></span>Positive EV
                </span>
                <span>
                  <span className="dot" style={{ background: "var(--bad)" }}></span>Negative EV
                </span>
              </div>

              <div className="ev-section-head">
                <h3>Full ranking</h3>
                <span className="note">Sorted by expected value, highest first</span>
              </div>
              <div className="table-wrap">
                <table style={{ minWidth: 1050 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Firm / account</th>
                      <th className="num">Eval fee</th>
                      <th className="num">Target</th>
                      <th className="num">Drawdown</th>
                      <th className="num">Pass rate</th>
                      <th className="num">Avg trades to outcome</th>
                      <th className="num">Max win streak</th>
                      <th className="num">Max lose streak</th>
                      <th className="num">Expected value</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.firmName}-${r.size}`} className={i === 0 ? "top" : ""}>
                        <td className="ev-rank">{i + 1}</td>
                        <td className="firm">
                          <div className="fname">{r.firmName}</div>
                          <div className="facct">
                            {r.program} · {r.size / 1000}K
                          </div>
                        </td>
                        <td className="num mono ev-fee-cell">
                          {r.discountedPrice != null ? (
                            <>
                              <div className="ev-fee-orig money">{fmtMoney(r.listPrice)}</div>
                              <div className="ev-fee-disc money">{fmtMoney(r.discountedPrice)}</div>
                              <div className="ev-fee-code">
                                code {r.promoCode} · {r.discountPct}% off
                                {r.discountNote ? ` (${r.discountNote})` : ""}
                              </div>
                            </>
                          ) : (
                            <span className="money">{fmtMoney(r.listPrice)}</span>
                          )}
                        </td>
                        <td className="num mono">{fmtMoney(r.target)}</td>
                        <td className="num mono">{fmtMoney(r.drawdown)}</td>
                        <td className="num mono">{fmtPct(r.passRate)}</td>
                        <td className="num mono">{r.avgTradesToOutcome.toFixed(0)}</td>
                        <td className="num mono">{r.avgMaxWinStreak.toFixed(1)}</td>
                        <td className="num mono">{r.avgMaxLoseStreak.toFixed(1)}</td>
                        <td className={`num mono ${r.ev >= 0 ? "ev-pos" : "ev-neg"}`}>{fmtMoney(r.ev)}</td>
                        <td>
                          <span className={`conf-badge ${r.confidence === "low" ? "low" : ""}`}>
                            {r.confidence === "low" ? "check first" : "verified"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="ev-swap-note">
            <b>Firm list note:</b> FundedElite runs forex/CFD (MT5) accounts, not real futures evaluations, so it isn't in
            this ranking — including it would have meant faking futures numbers it doesn't have. Take Profit Trader and
            Bulenox are both solid, currently-active options for the 7th slot.
          </div>

          <div className="ev-method">
            <h3>How this works, and what to double-check</h3>
            <div className="ev-method-grid">
              <div>
                <p>
                  <b>Simulation.</b> For each account, 700 independent evaluation attempts are simulated, one trade per
                  day, up to 400 trades. Win probability = your win rate; each win/loss moves the balance by your average
                  win/loss. A drawdown floor tracks the account&apos;s rule (trailing or EOD-static, locking at breakeven
                  where the firm does that) — crossing it fails the attempt. Reaching the profit target first is a pass.
                  Pass rate = share of simulations that passed.
                </p>
                <p>
                  <b>Funded phase.</b> A second simulation runs the same stats forward across your chosen horizon on the
                  funded account, banking a payout each time profit clears that firm&apos;s typical payout threshold.
                  Expected value combines this: <code>EV = pass rate × (expected payout − activation fee) − cost to reach an outcome</code>.
                </p>
              </div>
              <div>
                <p>
                  <b>What&apos;s simplified.</b> Reset fees and repeat attempts after a fail aren&apos;t modeled — this is
                  expected value for a single evaluation attempt. Profit splits use each firm&apos;s headline tier rule
                  where published. Payout timing within the funded phase is approximated, not each firm&apos;s exact
                  withdrawal schedule.
                </p>
                <p>
                  <b>Eval fee discounts.</b> The Eval fee column shows the checkout price before and after each
                  firm&apos;s discount code — it only applies to the one-time eval/challenge fee, not activation fees or
                  later subscription months. Codes and percentages change on the firm&apos;s side without notice, so
                  confirm the current discount at checkout before buying.
                </p>
                <p>
                  <b>Confidence key.</b> Fee and rule structures change often — some numbers here are firm-published,
                  others are cross-referenced from third-party trackers.
                </p>
                <div className="ev-confidence-key">
                  <span>
                    <span className="conf-badge">verified</span> firm&apos;s own pricing page
                  </span>
                  <span>
                    <span className="conf-badge low">check first</span> conflicting sources — confirm before funding
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="ev-footer">
            This tool estimates outcomes from simulated trade sequences and publicly available fee/rule data — it is not
            a guarantee of any firm&apos;s pass rate, payout, or financial outcome, and isn&apos;t financial advice. Prop
            firm rules and pricing change frequently; confirm current terms directly with each firm before purchasing an
            evaluation.
          </div>
        </div>
      </div>
    </div>
  );
}
