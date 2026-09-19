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
import { getNewsEventsForRange, getLastNewsSyncAt, getDistinctNewsCountries } from "@/db/queries";
import { syncNews } from "@/app/actions/news";
import { PageHead } from "@/components/PageHead";
import { requireUser } from "@/lib/auth";
import { abbreviateNewsTitle } from "@/lib/newsAbbreviate";
import { nyTimeLabel, nyDateKey, nyDateOnly } from "@/lib/newsTime";
import { PersistedFilterPills } from "@/components/PersistedFilterPills";

const CURRENCIES_COOKIE = "backroom-news-currencies";
const IMPACT_RANK: Record<string, number> = { high: 0, medium: 1 };

export const dynamic = "force-dynamic";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const IMPACT_LABEL: Record<string, string> = { high: "High", medium: "Medium" };

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

function formatEventDate(d: Date) {
  return format(d, "EEE, MMM d");
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    day?: string;
    currencies?: string;
    synced?: string;
    syncError?: string;
    syncNote?: string;
  }>;
}) {
  const {
    month: monthParamRaw,
    day: dayParamRaw,
    currencies: currenciesParamRaw,
    synced,
    syncError,
    syncNote,
  } = await searchParams;
  const monthDate = parseMonthParam(monthParamRaw);
  const user = await requireUser();
  const isAdmin = user.role === "admin";

  const cookieStore = await cookies();
  const currenciesCookie = cookieStore.get(CURRENCIES_COOKIE)?.value;
  // Explicit URL param wins (you just clicked something); otherwise fall
  // back to whatever you had selected last time, so the filter doesn't
  // quietly reset to "all assets" every time you come back to this page.
  const currenciesEffective = currenciesParamRaw ?? currenciesCookie ?? "all";

  const selectedDay = dayParamRaw && /^\d{4}-\d{2}-\d{2}$/.test(dayParamRaw) ? dayParamRaw : null;

  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const gridEndDay = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEndDay });
  const rangeEnd = new Date(gridEndDay);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  rangeEnd.setHours(0, 0, 0, 0);

  const [allEvents, lastSyncedAt, availableCurrencies] = await Promise.all([
    getNewsEventsForRange(gridStart, rangeEnd),
    isAdmin ? getLastNewsSyncAt() : Promise.resolve(null),
    getDistinctNewsCountries(),
  ]);

  const selectedCurrencies =
    currenciesEffective === "all"
      ? availableCurrencies
      : currenciesEffective === "none"
        ? []
        : currenciesEffective.split(",").filter(Boolean);
  const allCurrenciesSelected = selectedCurrencies.length === availableCurrencies.length;

  const events = allCurrenciesSelected ? allEvents : allEvents.filter((ev) => selectedCurrencies.includes(ev.country));

  // Bucketed by the New York calendar day the event actually falls on, not
  // its raw UTC day — see src/lib/newsTime.ts for why those can differ.
  const eventsByDay = new Map<string, typeof events>();
  for (const ev of events) {
    const key = nyDateKey(ev.date, ev.timeMinutes);
    const list = eventsByDay.get(key);
    if (list) list.push(ev);
    else eventsByDay.set(key, [ev]);
  }

  const monthEvents = events.filter((ev) => isSameMonth(nyDateOnly(ev.date, ev.timeMinutes), monthDate));
  const highCount = monthEvents.filter((ev) => ev.impact === "high").length;
  const mediumCount = monthEvents.filter((ev) => ev.impact === "medium").length;

  const tableEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : monthEvents;

  // Phone-only replacement for the day-grid calendar above — a flat,
  // ForexFactory-style list: just the date, then everything coming out that
  // date stacked below it. Reuses tableEvents (so it respects the same
  // whole-month/single-day selection as the grid and the detail table did)
  // grouped by NY calendar day and sorted chronologically within each day.
  const mobileGroups: { key: string; label: string; events: typeof tableEvents }[] = [];
  {
    const sorted = [...tableEvents].sort((a, b) => {
      const ad = nyDateOnly(a.date, a.timeMinutes).getTime();
      const bd = nyDateOnly(b.date, b.timeMinutes).getTime();
      if (ad !== bd) return ad - bd;
      return (a.timeMinutes ?? -1) - (b.timeMinutes ?? -1);
    });
    for (const ev of sorted) {
      const dayDate = nyDateOnly(ev.date, ev.timeMinutes);
      const key = format(dayDate, "yyyy-MM-dd");
      const last = mobileGroups[mobileGroups.length - 1];
      if (last && last.key === key) {
        last.events.push(ev);
      } else {
        mobileGroups.push({ key, label: formatEventDate(dayDate), events: [ev] });
      }
    }
  }

  function monthHref(d: Date) {
    const params = new URLSearchParams();
    params.set("month", monthParam(d));
    params.set("currencies", currenciesEffective);
    return `/news?${params.toString()}`;
  }

  function dayHref(key: string) {
    const params = new URLSearchParams();
    params.set("month", monthParam(monthDate));
    params.set("day", key);
    params.set("currencies", currenciesEffective);
    return `/news?${params.toString()}`;
  }

  function currencyValue(currency: string) {
    const next = selectedCurrencies.includes(currency)
      ? selectedCurrencies.filter((c) => c !== currency)
      : [...selectedCurrencies, currency];
    return next.length === 0 ? "none" : next.length === availableCurrencies.length ? "all" : next.join(",");
  }

  function currencyHref(currency: string) {
    const params = new URLSearchParams();
    params.set("month", monthParam(monthDate));
    if (selectedDay) params.set("day", selectedDay);
    params.set("currencies", currencyValue(currency));
    return `/news?${params.toString()}`;
  }

  const currentReturnTo = `/news?${new URLSearchParams({
    month: monthParam(monthDate),
    ...(selectedDay ? { day: selectedDay } : {}),
    currencies: currenciesEffective,
  }).toString()}`;

  return (
    <div>
      <PageHead
        title="News"
        subtitle="Red and orange folder economic events, synced from ForexFactory's calendar."
      />

      {synced !== undefined && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: "var(--good-line)" }}>
          <div className="sub" style={{ color: "var(--good)" }}>
            Synced — {synced} high/medium impact event{synced === "1" ? "" : "s"} imported or updated.
          </div>
          {syncNote && (
            <div className="sub" style={{ marginTop: 4 }}>
              {syncNote}
            </div>
          )}
        </div>
      )}
      {syncError !== undefined && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: "var(--bad-line)" }}>
          <div className="sub" style={{ color: "var(--bad)" }}>
            Sync failed: {syncError}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="card card-pad" style={{ marginBottom: 24 }}>
          <h3>Sync News (Admin)</h3>
          <div className="sub" style={{ marginBottom: 12 }}>
            Pulls last/this/next week from ForexFactory&apos;s public calendar feed. Only high (red folder) and
            medium (orange folder) impact events are kept — low impact and holidays are discarded automatically.
            Re-syncing just updates existing events, so it&apos;s safe to click any time. This updates the calendar
            for every member, not just you.
          </div>
          <form action={syncNews} className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
            <input type="hidden" name="returnTo" value={currentReturnTo} />
            <button type="submit" className="btn btn-primary">
              Sync Now
            </button>
            <span className="sub" style={{ margin: 0 }}>
              {lastSyncedAt ? `Last synced ${format(lastSyncedAt, "MMM d, yyyy 'at' h:mm a")}` : "Never synced yet."}
            </span>
          </form>
        </div>
      )}

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
        {selectedDay && (
          <Link href={monthHref(monthDate)} className="btn btn-ghost">
            Show whole month
          </Link>
        )}
      </div>

      {availableCurrencies.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <PersistedFilterPills
            cookieName={CURRENCIES_COOKIE}
            items={[
              {
                key: "all",
                label: "All assets",
                active: allCurrenciesSelected,
                cookieValue: "all",
                href: `/news?${new URLSearchParams({
                  month: monthParam(monthDate),
                  ...(selectedDay ? { day: selectedDay } : {}),
                  currencies: "all",
                }).toString()}`,
              },
              ...availableCurrencies.map((c) => ({
                key: c,
                label: c,
                active: selectedCurrencies.includes(c),
                cookieValue: currencyValue(c),
                href: currencyHref(c),
              })),
            ]}
          />
        </div>
      )}

      <div className="kpi-row kpi-row-3" style={{ marginBottom: 24 }}>
        <div className="kpi">
          <div className="k">High Impact This Month</div>
          <div className="v bad">{highCount}</div>
        </div>
        <div className="kpi">
          <div className="k">Medium Impact This Month</div>
          <div className="v" style={{ color: "var(--warn)" }}>
            {mediumCount}
          </div>
        </div>
        <div className="kpi">
          <div className="k">Total Events This Month</div>
          <div className="v">{monthEvents.length}</div>
        </div>
      </div>

      <div className="card card-pad news-calendar-card" style={{ marginBottom: 24 }}>
        <div className="cal-scroll-wrap">
        <div className="cal-grid" style={{ marginBottom: 8 }}>
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="cal-weekday">
              {w}
            </div>
          ))}
        </div>

        <div className="cal-grid">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(key) ?? [];
            const hasHigh = dayEvents.some((ev) => ev.impact === "high");
            const hasNews = dayEvents.length > 0;
            const cls = [
              "cal-day",
              !isSameMonth(day, monthDate) && "outside",
              isToday(day) && "today",
              hasHigh && "has-high-news",
              hasNews && !hasHigh && "has-news",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <Link
                key={key}
                href={dayHref(key)}
                className={cls}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  outline: selectedDay === key ? "2px solid var(--accent)" : undefined,
                }}
              >
                <div className="cal-daynum">{day.getDate()}</div>
                {hasNews && (
                  <div className="news-tags">
                    {[...dayEvents]
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
                    {dayEvents.length > 3 && <span className="news-tag-more">+{dayEvents.length - 3} more</span>}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
        </div>

        <div className="cal-legend">
          <span className="swatch">
            <i style={{ background: "var(--bad)", borderRadius: "50%" }} /> High impact
          </span>
          <span className="swatch">
            <i style={{ background: "var(--warn)", borderRadius: "50%" }} /> Medium impact
          </span>
          <span>Click a day to see just that day&apos;s events below.</span>
        </div>
      </div>

      <div className="card card-pad news-mobile-list" style={{ marginBottom: 24 }}>
        {mobileGroups.length === 0 ? (
          <div className="sub" style={{ textAlign: "center", padding: "16px 0", margin: 0 }}>
            {isAdmin
              ? "No high/medium impact events for this range yet — click Sync Now above."
              : "No high/medium impact events for this range yet."}
          </div>
        ) : (
          mobileGroups.map((group) => (
            <div key={group.key} className="news-day-group">
              <div className="news-day-header">{group.label}</div>
              {group.events.map((ev) => (
                <div key={ev.id} className="news-event-row">
                  <span className={`news-event-dot ${ev.impact}`} />
                  <span className="news-event-time">{nyTimeLabel(ev.date, ev.timeMinutes, ev.time)}</span>
                  <span className="news-event-currency">{ev.country}</span>
                  <span className="news-event-title">{abbreviateNewsTitle(ev.title)}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="sub" style={{ marginBottom: 8 }}>
        Full forecast / previous detail for every event below — scroll if the list runs long.
      </div>
      <div className="table-wrap" style={{ maxHeight: 480, overflowY: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time (NY)</th>
              <th>Currency</th>
              <th>Event</th>
              <th>Impact</th>
              <th>Forecast</th>
              <th>Previous</th>
            </tr>
          </thead>
          <tbody>
            {tableEvents.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--text-mute)", padding: "28px" }}>
                  {isAdmin
                    ? "No high/medium impact events for this range yet — click Sync Now above."
                    : "No high/medium impact events for this range yet."}
                </td>
              </tr>
            )}
            {tableEvents.map((ev) => (
              <tr key={ev.id}>
                <td className="mono">{formatEventDate(nyDateOnly(ev.date, ev.timeMinutes))}</td>
                <td className="mono">{nyTimeLabel(ev.date, ev.timeMinutes, ev.time)}</td>
                <td className="mono">{ev.country}</td>
                <td style={{ whiteSpace: "normal" }}>
                  {ev.sourceUrl ? (
                    <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
                      {abbreviateNewsTitle(ev.title)}
                    </a>
                  ) : (
                    abbreviateNewsTitle(ev.title)
                  )}
                  {abbreviateNewsTitle(ev.title) !== ev.title && (
                    <div style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 2 }}>{ev.title}</div>
                  )}
                </td>
                <td>
                  <span className={`badge ${ev.impact}`}>{IMPACT_LABEL[ev.impact]}</span>
                </td>
                <td className="mono">{ev.forecast ?? "—"}</td>
                <td className="mono">{ev.previous ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
