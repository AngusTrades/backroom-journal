"use client";

import { useEffect, useState } from "react";
import { abbreviateNewsTitle } from "@/lib/newsAbbreviate";
import { nyTimeLabel } from "@/lib/newsTime";

export type CalDayInfo = { tradeCount: number; pnlUsd: number; hasPnlData: boolean; totalRr: number };
export type CalDay = { key: string; date: number; inMonth: boolean; isToday: boolean };
export type CalNewsEvent = {
  impact: string;
  title: string;
  country: string;
  date: Date;
  timeMinutes: number | null;
  time: string | null;
};

const STORAGE_KEY = "backroom-cal-stats";
const IMPACT_RANK: Record<string, number> = { high: 0, medium: 1 };

// $ figures in the calendar grid render TWICE — a full "$11,988" version and
// a "$12k" compact one — and CSS (the .amt-full / .amt-compact rules next to
// .cal-grid-weekly in globals.css) picks which one is visible per
// breakpoint, hiding compact on desktop and full on phone. Doing the switch
// in CSS rather than a JS viewport check keeps server and client render
// identical (no hydration mismatch) and needs no matchMedia listener. Below
// $10k both strings are identical, so nothing changes below that threshold.
function fmtUsdMagnitude(n: number): string {
  const abs = Math.abs(n);
  return `$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtUsdMagnitudeCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs < 10000) return fmtUsdMagnitude(n);
  return `$${Math.round(abs / 1000)}k`;
}
function ResponsiveUsdMagnitude({ value }: { value: number }) {
  return (
    <>
      <span className="amt-full">{fmtUsdMagnitude(value)}</span>
      <span className="amt-compact">{fmtUsdMagnitudeCompact(value)}</span>
    </>
  );
}

type WeekSummary = {
  label: string;
  pnlUsd: number;
  hasPnlData: boolean;
  totalRr: number;
  tradeCount: number;
  payout: number;
  isCurrent: boolean;
};

// One summary per row of the grid (always full 7-day weeks — see
// calendar/page.tsx, which builds `days` from startOfWeek/endOfWeek). Each
// week is labeled "Week N", counting from 1 and resetting whenever the row
// crosses into a new month — decided by the month of that row's Thursday,
// the same "which month does this week belong to" convention ISO week
// numbering uses, since the Thursday is guaranteed to fall in whichever
// month has 4+ of the row's 7 days.
function buildWeekSummaries(
  days: CalDay[],
  byDay: Record<string, CalDayInfo>,
  payoutByDay: Record<string, number>,
): WeekSummary[] {
  const weeks: WeekSummary[] = [];
  const weekOfMonthCounts = new Map<string, number>();

  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    if (chunk.length === 0) continue;
    const thursday = chunk[3] ?? chunk[chunk.length - 1];
    const monthKey = thursday.key.slice(0, 7); // "yyyy-MM"
    const weekOfMonth = (weekOfMonthCounts.get(monthKey) ?? 0) + 1;
    weekOfMonthCounts.set(monthKey, weekOfMonth);

    let pnlUsd = 0;
    let hasPnlData = false;
    let totalRr = 0;
    let tradeCount = 0;
    let payout = 0;
    let isCurrent = false;
    for (const day of chunk) {
      if (day.isToday) isCurrent = true;
      const info = byDay[day.key];
      if (info) {
        tradeCount += info.tradeCount;
        totalRr += info.totalRr;
        if (info.hasPnlData) {
          pnlUsd += info.pnlUsd;
          hasPnlData = true;
        }
      }
      const p = payoutByDay[day.key];
      if (p !== undefined) payout += p;
    }

    weeks.push({ label: `Week ${weekOfMonth}`, pnlUsd, hasPnlData, totalRr, tradeCount, payout, isCurrent });
  }

  return weeks;
}

// Which per-day stats to show on the calendar (trade count / $ P&L / net R /
// news) — independently toggleable so you can strip the grid down to just
// what you care about. Remembered per-browser via localStorage.
export function PnlCalendarGrid({
  days,
  byDay,
  payoutByDay,
  newsByDay,
}: {
  days: CalDay[];
  byDay: Record<string, CalDayInfo>;
  payoutByDay: Record<string, number>;
  newsByDay?: Record<string, CalNewsEvent[]>;
}) {
  const [showTrades, setShowTrades] = useState(true);
  const [showPnl, setShowPnl] = useState(true);
  const [showRr, setShowRr] = useState(false);
  const [showNews, setShowNews] = useState(true);

  // One-time sync from localStorage (a browser-only external source) after
  // mount. This can't be done via useState's lazy initializer instead —
  // that runs during SSR too, where localStorage isn't available, and would
  // make the client's first render disagree with the server-rendered HTML.
  /* eslint-disable react-hooks/set-state-in-effect -- deliberate post-mount sync from an external store, see above */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (typeof parsed.trades === "boolean") setShowTrades(parsed.trades);
      if (typeof parsed.pnl === "boolean") setShowPnl(parsed.pnl);
      if (typeof parsed.rr === "boolean") setShowRr(parsed.rr);
      if (typeof parsed.news === "boolean") setShowNews(parsed.news);
    } catch {}
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggle(which: "trades" | "pnl" | "rr" | "news") {
    const next = { trades: showTrades, pnl: showPnl, rr: showRr, news: showNews };
    next[which] = !next[which];
    setShowTrades(next.trades);
    setShowPnl(next.pnl);
    setShowRr(next.rr);
    setShowNews(next.news);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <>
      <div className="cal-stat-toggles">
        <span className="cal-stat-toggles-label">Show:</span>
        <label className="cal-stat-toggle">
          <input type="checkbox" checked={showTrades} onChange={() => toggle("trades")} />
          Trades
        </label>
        <label className="cal-stat-toggle">
          <input type="checkbox" checked={showPnl} onChange={() => toggle("pnl")} />
          P&amp;L ($)
        </label>
        <label className="cal-stat-toggle">
          <input type="checkbox" checked={showRr} onChange={() => toggle("rr")} />
          R
        </label>
        {newsByDay && (
          <label className="cal-stat-toggle">
            <input type="checkbox" checked={showNews} onChange={() => toggle("news")} />
            News
          </label>
        )}
      </div>

      <div className="cal-grid cal-grid-weekly">
        {(() => {
          const weeks = buildWeekSummaries(days, byDay, payoutByDay);
          const cells: React.ReactNode[] = [];

          days.forEach((day, idx) => {
            const info = byDay[day.key];
            const payoutAmt = payoutByDay[day.key];
            const dayNews = showNews ? (newsByDay?.[day.key] ?? []) : [];
            const pnlActive = Boolean(info && showPnl && info.hasPnlData);
            const rrActive = Boolean(info && showRr);
            const outcome = pnlActive
              ? info.pnlUsd > 0
                ? "good"
                : info.pnlUsd < 0
                  ? "bad"
                  : "flat"
              : rrActive
                ? info.totalRr > 0
                  ? "good"
                  : info.totalRr < 0
                    ? "bad"
                    : "flat"
                : "";
            const cls = ["cal-day", !day.inMonth && "outside", day.isToday && "today", outcome].filter(Boolean).join(" ");
            const showTradeCount = Boolean(info && showTrades);
            const hasAnything = pnlActive || rrActive || showTradeCount || payoutAmt !== undefined;

            cells.push(
              <div key={day.key} className={cls}>
                <div className="cal-daynum">{day.date}</div>
                {dayNews.length > 0 && (
                  <div className="news-tags">
                    {[...dayNews]
                      .sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0))
                      .slice(0, 3)
                      .map((ev, i) => (
                        <span
                          key={i}
                          className={`news-tag ${ev.impact}`}
                          title={`${nyTimeLabel(ev.date, ev.timeMinutes, ev.time)} NY — ${ev.country} ${abbreviateNewsTitle(ev.title)} — ${ev.title}`}
                        >
                          {abbreviateNewsTitle(ev.title)}
                        </span>
                      ))}
                    {dayNews.length > 3 && <span className="news-tag-more">+{dayNews.length - 3} more</span>}
                  </div>
                )}
                {hasAnything && (
                  <div className="cal-daybody">
                    {payoutAmt !== undefined && (
                      <div className="cal-payout money">
                        ↑ <ResponsiveUsdMagnitude value={payoutAmt} /> payout
                      </div>
                    )}
                    {pnlActive && (
                      <div className="cal-amt money">
                        {info.pnlUsd >= 0 ? "+" : "−"}
                        <ResponsiveUsdMagnitude value={info.pnlUsd} />
                      </div>
                    )}
                    {rrActive && (
                      <div className={pnlActive ? "cal-amt-secondary" : "cal-amt"}>
                        {info.totalRr >= 0 ? "+" : ""}
                        {info.totalRr.toFixed(1)}R
                      </div>
                    )}
                    {showTradeCount && (
                      <div className="cal-count">
                        {info.tradeCount} trade{info.tradeCount === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                )}
              </div>,
            );

            // End of a row (Sunday, every 7th cell) — drop in that week's
            // TopstepX-style rollup: total P&L (or net R with no $ logged,
            // same fallback the day cells and the month KPI use), trade
            // count, and — in the same accent color the per-day payout line
            // above uses — how much came out in payouts that week.
            if ((idx + 1) % 7 === 0) {
              const week = weeks[Math.floor(idx / 7)];
              if (week) {
                const weekOutcome = week.hasPnlData
                  ? week.pnlUsd > 0
                    ? "good"
                    : week.pnlUsd < 0
                      ? "bad"
                      : "flat"
                  : week.totalRr > 0
                    ? "good"
                    : week.totalRr < 0
                      ? "bad"
                      : "flat";
                cells.push(
                  <div key={`week-${idx}`} className={`cal-week-summary ${week.isCurrent ? "current" : ""}`}>
                    <div className="cal-week-label">{week.label}</div>
                    <div className={`cal-week-total ${weekOutcome}`}>
                      {week.hasPnlData ? (
                        <>
                          {week.pnlUsd >= 0 ? "+" : "−"}
                          <ResponsiveUsdMagnitude value={week.pnlUsd} />
                        </>
                      ) : (
                        `${week.totalRr >= 0 ? "+" : ""}${week.totalRr.toFixed(1)}R`
                      )}
                    </div>
                    {week.payout > 0 && (
                      <div className="cal-week-payout money">
                        ↑ <ResponsiveUsdMagnitude value={week.payout} /> payout
                      </div>
                    )}
                    <div className="cal-week-count">
                      {week.tradeCount} trade{week.tradeCount === 1 ? "" : "s"}
                    </div>
                  </div>,
                );
              }
            }
          });

          return cells;
        })()}
      </div>
    </>
  );
}
