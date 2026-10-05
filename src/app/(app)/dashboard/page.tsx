import Link from "next/link";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  getAnalytics,
  getFormOptions,
  getTradesWithDetails,
  getPnlCalendarTrades,
  groupTradesByDay,
  getPnlCalendarPayouts,
  groupPayoutsByDay,
} from "@/db/queries";
import { PageHead } from "@/components/PageHead";
import { EquityCurve } from "@/components/EquityCurve";
import { DeleteTradeButton } from "@/components/DeleteTradeButton";
import { PnlCalendarGrid, type CalDayInfo } from "@/components/PnlCalendarGrid";
import { requireUser } from "@/lib/auth";
import { foldWeekends, isWeekend } from "@/lib/tradingDays";

export const dynamic = "force-dynamic";

// Trading days only — same Mon–Fri grid as the PnL Calendar page, with
// weekend activity folded into the neighbouring trading day.
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// One-glance landing page — lifetime KPIs + equity curve, this month's PnL
// calendar (every account, read-only — the full toolbar/filters live on
// /calendar), and the last few trades logged. Each card links through to
// its full page rather than duplicating that page's controls here.
export default async function DashboardPage() {
  const user = await requireUser();

  const [analytics, { accounts }, recentTrades] = await Promise.all([
    getAnalytics("lifetime", user.id),
    getFormOptions(user.id),
    getTradesWithDetails(user.id),
  ]);

  const accountIds = accounts.map((a) => a.id);
  const monthDate = startOfMonth(new Date());
  const gridStart = startOfWeek(monthDate, { weekStartsOn: 1 });
  const gridEndDay = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
  const weekdays = eachDayOfInterval({ start: gridStart, end: gridEndDay }).filter((d) => !isWeekend(d));
  const days: Date[] = [];
  for (let i = 0; i < weekdays.length; i += 5) {
    const row = weekdays.slice(i, i + 5);
    if (row.some((d) => isSameMonth(d, monthDate))) days.push(...row);
  }
  // Fetch from the Sunday before the grid: it folds into the first Monday.
  const fetchStart = new Date(gridStart);
  fetchStart.setDate(fetchStart.getDate() - 1);
  const rangeEnd = new Date(gridEndDay);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  rangeEnd.setHours(0, 0, 0, 0);

  const [tradeRows, payoutRows] =
    accountIds.length === 0
      ? [[], []]
      : await Promise.all([
          getPnlCalendarTrades(fetchStart, rangeEnd, accountIds),
          getPnlCalendarPayouts(fetchStart, rangeEnd, accountIds),
        ]);
  const byDay = foldWeekends(groupTradesByDay(tradeRows), (a, b) => ({
    tradeCount: a.tradeCount + b.tradeCount,
    pnlUsd: a.pnlUsd + b.pnlUsd,
    hasPnlData: a.hasPnlData || b.hasPnlData,
    totalRr: a.totalRr + b.totalRr,
  }));
  const payoutByDay = foldWeekends(groupPayoutsByDay(payoutRows), (a, b) => a + b);

  const netR = analytics.equityCurve.at(-1)?.cumulative ?? 0;
  const recent = recentTrades.slice(0, 6);

  return (
    <div>
      <PageHead
        title="Dashboard"
        subtitle="Everything at a glance — lifetime stats, this month's calendar, and your last few trades."
        action={
          <Link href="/add-trade" className="btn btn-primary">
            + Add Trade
          </Link>
        }
      />

      <div className="kpi-row kpi-row-5">
        <div className="kpi">
          <div className="k">Win Rate</div>
          <div className={`v ${analytics.winRate >= 50 ? "good" : "bad"}`}>{analytics.winRate.toFixed(1)}%</div>
        </div>
        <div className="kpi">
          <div className="k">Profit Factor</div>
          <div className={`v ${analytics.profitFactor >= 1 ? "good" : "bad"}`}>
            {Number.isFinite(analytics.profitFactor) ? analytics.profitFactor.toFixed(2) : "∞"}
          </div>
        </div>
        <div className="kpi">
          <div className="k">Net R</div>
          <div className={`v ${netR >= 0 ? "good" : "bad"}`}>
            {netR >= 0 ? "+" : ""}
            {netR.toFixed(2)}R
          </div>
        </div>
        <div className="kpi">
          <div className="k">Trades</div>
          <div className="v">{analytics.totalTrades}</div>
        </div>
        <div className="kpi">
          <div className="k">Payouts to Date</div>
          <div className="v good money">
            {analytics.payoutsTotal > 0 ? `$${analytics.payoutsTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
          </div>
        </div>
      </div>

      <div className="grid4">
        <div className="card card-pad">
          <h3>Equity Curve</h3>
          <div className="sub">Cumulative R across every logged trade.</div>
          <EquityCurve data={analytics.equityCurve} />
          <div style={{ marginTop: 10 }}>
            <Link href="/analytics" className="link">
              View full analytics →
            </Link>
          </div>
        </div>

        <div className="card card-pad">
          <h3>{format(monthDate, "MMMM yyyy")}</h3>
          <div className="sub">This month, all accounts.</div>
          {accountIds.length === 0 ? (
            <div className="sub" style={{ padding: "20px 0" }}>
              No accounts yet — add one to start seeing your calendar here.
            </div>
          ) : (
            <div className="cal-scroll-wrap">
              <div className="cal-grid cal-grid-weekly" style={{ marginBottom: 8 }}>
                {WEEKDAY_LABELS.map((w) => (
                  <div key={w} className="cal-weekday">
                    {w}
                  </div>
                ))}
                <div className="cal-weekday">Week</div>
              </div>
              <PnlCalendarGrid
                days={days.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  return { key, date: day.getDate(), inMonth: isSameMonth(day, monthDate), isToday: isToday(day) };
                })}
                byDay={Object.fromEntries(byDay) as Record<string, CalDayInfo>}
                payoutByDay={Object.fromEntries(payoutByDay)}
              />
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Link href="/calendar" className="link">
              View full calendar →
            </Link>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3>Recent Trades</h3>
        {recent.length === 0 ? (
          <div className="sub" style={{ padding: "8px 0" }}>
            No trades logged yet —{" "}
            <Link href="/add-trade" style={{ color: "var(--accent-strong)" }}>
              add your first one
            </Link>
            .
          </div>
        ) : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Pair</th>
                  <th>Session</th>
                  <th className="num">R:R</th>
                  <th className="num">P&amp;L</th>
                  <th>Outcome</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{formatDate(t.date)}</td>
                    <td>{t.account?.name}</td>
                    <td className="mono">{t.pair?.symbol}</td>
                    <td>{t.session?.name ?? "—"}</td>
                    <td className={`num mono pnl ${t.outcome === "loss" ? "bad" : t.outcome === "win" ? "good" : ""}`}>
                      {t.outcome === "loss" ? "−" : ""}
                      {Number(t.rr).toFixed(2)}R
                    </td>
                    <td className={`num mono pnl money ${t.pnlUsd !== null ? (Number(t.pnlUsd) >= 0 ? "good" : "bad") : ""}`}>
                      {t.pnlUsd !== null
                        ? `${Number(t.pnlUsd) >= 0 ? "+" : "−"}$${Math.abs(Number(t.pnlUsd)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                    <td>
                      <span className={`badge ${t.outcome}`}>
                        {t.outcome === "win" ? "WIN" : t.outcome === "loss" ? "LOSS" : "B/E"}
                      </span>
                    </td>
                    <td className="flex items-center gap-2.5" style={{ whiteSpace: "nowrap" }}>
                      <Link href={`/edit-trade/${t.id}`} className="link">
                        Edit
                      </Link>
                      <DeleteTradeButton id={t.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <Link href="/" className="link">
            View full journal →
          </Link>
        </div>
      </div>
    </div>
  );
}
