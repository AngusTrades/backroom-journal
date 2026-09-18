import Link from "next/link";
import { cookies } from "next/headers";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  getFormOptions,
  getPnlCalendarTrades,
  groupTradesByDay,
  getPnlCalendarPayouts,
  groupPayoutsByDay,
  getNewsEventsForRange,
} from "@/db/queries";
import { PageHead } from "@/components/PageHead";
import { requireUser } from "@/lib/auth";
import { PnlCalendarGrid, type CalDayInfo, type CalNewsEvent } from "@/components/PnlCalendarGrid";
import { PersistedFilterPills } from "@/components/PersistedFilterPills";
import { nyDateKey } from "@/lib/newsTime";

export const dynamic = "force-dynamic";

const ACCOUNTS_COOKIE = "backroom-cal-accounts";
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthParam(v: string | undefined): Date {
  if (v && /^\d{4}-\d{2}$/.test(v)) {
    const [y, m] = v.split("-").map(Number);
    return startOfMonth(new Date(y, m - 1, 1));
  }
  return startOfMonth(new Date());
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; accounts?: string }>;
}) {
  const { month: monthParamRaw, accounts: accountsParamRaw } = await searchParams;
  const monthDate = parseMonthParam(monthParamRaw);
  const user = await requireUser();
  const { accounts } = await getFormOptions(user.id);

  const cookieStore = await cookies();
  const accountsCookie = cookieStore.get(ACCOUNTS_COOKIE)?.value;
  // Explicit URL param wins; otherwise fall back to your last pick so this
  // doesn't quietly reset to "all accounts" every time you come back.
  const accountsEffective = accountsParamRaw ?? accountsCookie ?? "all";

  const selectedIds =
    accountsEffective === "all"
      ? accounts.map((a) => a.id)
      : accountsEffective === "none"
        ? []
        : accountsEffective.split(",").filter(Boolean);
  const allSelected = selectedIds.length === accounts.length;

  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const gridEndDay = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEndDay });
  const rangeEnd = new Date(gridEndDay);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  rangeEnd.setHours(0, 0, 0, 0);

  const [rows, payoutRows, newsEvents] =
    selectedIds.length === 0
      ? [[], [], await getNewsEventsForRange(gridStart, rangeEnd)]
      : await Promise.all([
          getPnlCalendarTrades(gridStart, rangeEnd, selectedIds),
          getPnlCalendarPayouts(gridStart, rangeEnd, selectedIds),
          getNewsEventsForRange(gridStart, rangeEnd),
        ]);
  const byDay = groupTradesByDay(rows);
  const payoutByDay = groupPayoutsByDay(payoutRows);

  // Bucketed by New York calendar day, same as the News page — see
  // src/lib/newsTime.ts.
  const newsByDay = new Map<string, CalNewsEvent[]>();
  for (const ev of newsEvents) {
    const key = nyDateKey(ev.date, ev.timeMinutes);
    const list = newsByDay.get(key);
    const entry = { impact: ev.impact, title: ev.title, country: ev.country, date: ev.date, timeMinutes: ev.timeMinutes, time: ev.time };
    if (list) list.push(entry);
    else newsByDay.set(key, [entry]);
  }

  let monthPnl = 0;
  let monthHasPnlData = false;
  let monthRr = 0;
  let monthTradeCount = 0;
  let monthPayouts = 0;
  let greenDays = 0;
  let redDays = 0;
  for (const d of days) {
    if (!isSameMonth(d, monthDate)) continue;
    const key = format(d, "yyyy-MM-dd");
    monthPayouts += payoutByDay.get(key) ?? 0;
    const info = byDay.get(key);
    if (!info) continue;
    monthTradeCount += info.tradeCount;
    monthRr += info.totalRr;
    if (info.hasPnlData) {
      monthPnl += info.pnlUsd;
      monthHasPnlData = true;
      if (info.pnlUsd > 0) greenDays++;
      else if (info.pnlUsd < 0) redDays++;
    } else {
      if (info.totalRr > 0) greenDays++;
      else if (info.totalRr < 0) redDays++;
    }
  }

  function monthHref(d: Date) {
    const params = new URLSearchParams();
    params.set("month", monthParam(d));
    params.set("accounts", accountsEffective);
    return `/calendar?${params.toString()}`;
  }

  function toggleValue(accountId: string) {
    const next = selectedIds.includes(accountId)
      ? selectedIds.filter((id) => id !== accountId)
      : [...selectedIds, accountId];
    return next.length === 0 ? "none" : next.length === accounts.length ? "all" : next.join(",");
  }

  function toggleHref(accountId: string) {
    const params = new URLSearchParams();
    params.set("month", monthParam(monthDate));
    params.set("accounts", toggleValue(accountId));
    return `/calendar?${params.toString()}`;
  }

  return (
    <div>
      <PageHead title="PnL Calendar" subtitle="Daily P&L across whichever accounts you pick." />

      <div className="cal-toolbar">
        <div className="cal-nav">
          <Link href={monthHref(subMonths(monthDate, 1))} className="btn btn-ghost">
            ← Prev
          </Link>
          <div className="month-label">{format(monthDate, "MMMM yyyy")}</div>
          <Link href={monthHref(addMonths(monthDate, 1))} className="btn btn-ghost">
            Next →
          </Link>
          {monthParam(monthDate) !== monthParam(new Date()) && (
            <Link href={monthHref(new Date())} className="btn btn-ghost">
              Today
            </Link>
          )}
        </div>

        <PersistedFilterPills
          cookieName={ACCOUNTS_COOKIE}
          items={[
            {
              key: "all",
              label: "All accounts",
              active: allSelected,
              cookieValue: "all",
              href: `/calendar?${new URLSearchParams({ month: monthParam(monthDate), accounts: "all" }).toString()}`,
            },
            ...accounts.map((a) => ({
              key: a.id,
              label: a.name,
              active: selectedIds.includes(a.id),
              cookieValue: toggleValue(a.id),
              href: toggleHref(a.id),
            })),
          ]}
        />
      </div>

      <div className="kpi-row kpi-row-5" style={{ marginBottom: 20 }}>
        <div className="kpi">
          <div className="k">{monthHasPnlData ? "Month P&L ($)" : "Month Net R"}</div>
          <div className={`v ${monthHasPnlData ? "money" : ""} ${(monthHasPnlData ? monthPnl : monthRr) >= 0 ? "good" : "bad"}`}>
            {monthHasPnlData
              ? `${monthPnl >= 0 ? "+" : "−"}$${Math.abs(monthPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : `${monthRr >= 0 ? "+" : ""}${monthRr.toFixed(1)}R`}
          </div>
        </div>
        <div className="kpi">
          <div className="k">Trades This Month</div>
          <div className="v">{monthTradeCount}</div>
        </div>
        <div className="kpi">
          <div className="k">Payouts This Month</div>
          <div className="v money">{monthPayouts > 0 ? `$${monthPayouts.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</div>
        </div>
        <div className="kpi">
          <div className="k">Green Days</div>
          <div className="v good">{greenDays}</div>
        </div>
        <div className="kpi">
          <div className="k">Red Days</div>
          <div className="v bad">{redDays}</div>
        </div>
      </div>

      {selectedIds.length === 0 ? (
        <div className="card card-pad">
          <div className="sub">No accounts selected — pick at least one above to see its calendar.</div>
        </div>
      ) : (
        <div className="card card-pad">
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
              newsByDay={Object.fromEntries(newsByDay)}
            />
          </div>

          <div className="cal-legend">
            <span className="swatch">
              <i style={{ background: "var(--good)" }} /> Profitable day
            </span>
            <span className="swatch">
              <i style={{ background: "var(--bad)" }} /> Losing day
            </span>
            <span className="swatch">
              <i style={{ background: "var(--neutral)" }} /> Flat / break-even
            </span>
            <span className="swatch">
              <i style={{ background: "var(--bad)", borderRadius: "50%" }} /> High impact news
            </span>
            <span className="swatch">
              <i style={{ background: "var(--warn)", borderRadius: "50%" }} /> Medium impact news
            </span>
            <span>Use the checkboxes above to choose what shows per day.</span>
          </div>
        </div>
      )}
    </div>
  );
}
