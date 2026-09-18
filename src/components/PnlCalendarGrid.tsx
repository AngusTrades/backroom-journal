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

      <div className="cal-grid">
        {days.map((day) => {
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

          return (
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
                      ↑ ${payoutAmt.toLocaleString(undefined, { maximumFractionDigits: 0 })} payout
                    </div>
                  )}
                  {pnlActive && (
                    <div className="cal-amt money">
                      {info.pnlUsd >= 0 ? "+" : "−"}${Math.abs(info.pnlUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
            </div>
          );
        })}
      </div>
    </>
  );
}
