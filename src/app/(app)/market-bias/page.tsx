import Link from "next/link";
import {
  getSessionLogs,
  getSessionCorrelation,
  ANALYTICS_PERIODS,
  isAnalyticsPeriod,
  type AnalyticsPeriod,
} from "@/db/queries";
import { upsertSessionLog } from "@/app/actions/session-logs";
import { PageHead } from "@/components/PageHead";
import { DeleteSessionLogButton } from "@/components/DeleteSessionLogButton";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SESSION_ORDER = ["asia", "london", "new_york"] as const;
const SESSION_LABEL: Record<(typeof SESSION_ORDER)[number], string> = {
  asia: "Asia",
  london: "London",
  new_york: "New York",
};
const BIAS_LABEL: Record<string, string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
};
const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  lifetime: "Lifetime",
};
const periodSubtitle: Record<AnalyticsPeriod, string> = {
  daily: "Today so far.",
  weekly: "This week so far.",
  monthly: "This month so far.",
  yearly: "This year so far.",
  lifetime: "Every session you've ever logged.",
};

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isSessionValue(v: string | undefined): v is (typeof SESSION_ORDER)[number] {
  return !!v && (SESSION_ORDER as readonly string[]).includes(v);
}

function pct(n: number, of: number) {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

export default async function MarketBiasPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    corrTrigger?: string;
    corrDirection?: string;
    corrThreshold?: string;
    corrTarget?: string;
  }>;
}) {
  const {
    period: periodParam,
    corrTrigger: corrTriggerRaw,
    corrDirection: corrDirectionRaw,
    corrThreshold: corrThresholdRaw,
    corrTarget: corrTargetRaw,
  } = await searchParams;
  const period: AnalyticsPeriod = isAnalyticsPeriod(periodParam) ? periodParam : "lifetime";

  const corrTrigger = isSessionValue(corrTriggerRaw) ? corrTriggerRaw : "london";
  const corrDirection: "bearish" | "bullish" = corrDirectionRaw === "bullish" ? "bullish" : "bearish";
  const corrThresholdParsed = Number(corrThresholdRaw);
  const corrThreshold = Number.isFinite(corrThresholdParsed) && corrThresholdParsed >= 0 ? corrThresholdParsed : 50;
  const corrTarget = isSessionValue(corrTargetRaw) ? corrTargetRaw : "new_york";

  const user = await requireUser();
  const logs = await getSessionLogs(user.id, period);
  const correlation =
    corrTrigger === corrTarget
      ? null
      : await getSessionCorrelation(user.id, { triggerSession: corrTrigger, direction: corrDirection, thresholdPoints: corrThreshold, targetSession: corrTarget });

  const summaries = SESSION_ORDER.map((s) => {
    const rows = logs.filter((l) => l.session === s);
    const bullish = rows.filter((l) => l.bias === "bullish").length;
    const bearish = rows.filter((l) => l.bias === "bearish").length;
    const neutral = rows.filter((l) => l.bias === "neutral").length;
    const netPoints = rows.reduce((sum, l) => sum + Number(l.pointsMoved), 0);
    return { session: s, count: rows.length, bullish, bearish, neutral, netPoints };
  });

  const returnTo = period === "lifetime" ? "/market-bias" : `/market-bias?period=${period}`;

  return (
    <div>
      <PageHead
        title="Market Bias"
        subtitle={periodSubtitle[period]}
        action={
          <div className="period-tabs">
            {ANALYTICS_PERIODS.map((p) => (
              <a
                key={p}
                href={p === "lifetime" ? "/market-bias" : `/market-bias?period=${p}`}
                className={`period-tab ${p === period ? "active" : ""}`}
              >
                {PERIOD_LABEL[p]}
              </a>
            ))}
          </div>
        }
      />

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3>Log a Session</h3>
        <div className="sub" style={{ marginBottom: 12 }}>
          One entry per day per session — re-entering the same date and session just updates it, so
          it&apos;s safe to fix a mistake by logging it again.
        </div>
        <form action={upsertSessionLog} className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-5">
          <div className="field">
            <label htmlFor="date">Date</label>
            <input type="date" id="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          </div>
          <div className="field">
            <label htmlFor="session">Session</label>
            <select id="session" name="session" required defaultValue="asia">
              <option value="asia">Asia</option>
              <option value="london">London</option>
              <option value="new_york">New York</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="bias">Bias</label>
            <select id="bias" name="bias" required defaultValue="bullish">
              <option value="bullish">Bullish</option>
              <option value="bearish">Bearish</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="pointsMoved">Points moved</label>
            <input type="number" id="pointsMoved" name="pointsMoved" step="0.25" placeholder="e.g. 85 or -40" required />
          </div>
          <div className="field">
            <label htmlFor="note">Note (optional)</label>
            <input type="text" id="note" name="note" placeholder="e.g. FOMC, NFP, range day" />
          </div>
          <div className="field flex items-end" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="btn btn-primary">
              Save Entry
            </button>
          </div>
        </form>
        <div className="sub" style={{ marginTop: -4 }}>
          Points moved: positive for a push up that session, negative for a dump down.
        </div>
      </div>

      <div className="acct-grid" style={{ marginBottom: 20 }}>
        {summaries.map((s) => (
          <div key={s.session} className="card card-pad">
            <h3>{SESSION_LABEL[s.session]}</h3>
            <div className="flex items-center gap-2" style={{ marginBottom: 12, flexWrap: "wrap" }}>
              <span className="badge bullish">{s.bullish} Bullish</span>
              <span className="badge bearish">{s.bearish} Bearish</span>
              <span className="badge neutral">{s.neutral} Neutral</span>
            </div>
            <div
              style={{ fontSize: 10, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              Net Points
            </div>
            <div
              className="v"
              style={{
                fontFamily: "var(--font-data)",
                fontSize: 19,
                fontWeight: 600,
                marginTop: 5,
                color: s.netPoints > 0 ? "var(--good)" : s.netPoints < 0 ? "var(--bad)" : undefined,
              }}
            >
              {s.netPoints > 0 ? "+" : ""}
              {s.netPoints.toFixed(2)}
            </div>
            <div className="sub" style={{ marginTop: 6 }}>
              {s.count} day{s.count === 1 ? "" : "s"} logged
            </div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Session</th>
              <th>Bias</th>
              <th className="num">Points</th>
              <th>Note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--text-mute)", padding: "28px" }}>
                  No sessions logged yet for this period.
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="mono">{formatDate(l.date)}</td>
                <td>{SESSION_LABEL[l.session]}</td>
                <td>
                  <span className={`badge ${l.bias}`}>{BIAS_LABEL[l.bias]}</span>
                </td>
                <td className={`num mono pnl ${Number(l.pointsMoved) >= 0 ? "good" : "bad"}`}>
                  {Number(l.pointsMoved) >= 0 ? "+" : ""}
                  {Number(l.pointsMoved).toFixed(2)}
                </td>
                <td style={{ maxWidth: 240, whiteSpace: "normal" }}>{l.note ?? "—"}</td>
                <td className="flex items-center gap-2.5" style={{ whiteSpace: "nowrap" }}>
                  <Link href={`/market-bias/${l.id}/edit?returnTo=${encodeURIComponent(returnTo)}`} className="link">
                    Edit
                  </Link>
                  <DeleteSessionLogButton id={l.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <h3>Session Correlation</h3>
        <div className="sub" style={{ marginBottom: 12 }}>
          How often does one session reverse after another makes a big move — e.g. &quot;after London
          dumps 50+ points, how often does New York come back bullish?&quot; Uses your full logged
          history regardless of the period filter above, since this needs as many days as possible
          to mean anything.
        </div>
        <form method="GET" className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-5">
          {period !== "lifetime" && <input type="hidden" name="period" value={period} />}
          <div className="field">
            <label htmlFor="corrTrigger">When this session</label>
            <select id="corrTrigger" name="corrTrigger" defaultValue={corrTrigger}>
              <option value="asia">Asia</option>
              <option value="london">London</option>
              <option value="new_york">New York</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="corrDirection">moves this way</label>
            <select id="corrDirection" name="corrDirection" defaultValue={corrDirection}>
              <option value="bearish">Dumped (bearish)</option>
              <option value="bullish">Pumped (bullish)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="corrThreshold">by at least this many points</label>
            <input
              type="number"
              id="corrThreshold"
              name="corrThreshold"
              min={0}
              step="0.25"
              defaultValue={corrThreshold}
            />
          </div>
          <div className="field">
            <label htmlFor="corrTarget">how does this session react?</label>
            <select id="corrTarget" name="corrTarget" defaultValue={corrTarget}>
              <option value="asia">Asia</option>
              <option value="london">London</option>
              <option value="new_york">New York</option>
            </select>
          </div>
          <div className="field flex items-end">
            <button type="submit" className="btn btn-primary">
              Analyze
            </button>
          </div>
        </form>

        {correlation === null ? (
          <div className="sub" style={{ marginTop: 16 }}>
            Pick two different sessions to compare.
          </div>
        ) : correlation.triggerCount === 0 ? (
          <div className="sub" style={{ marginTop: 16 }}>
            No {SESSION_LABEL[corrTrigger]} days in your log {corrDirection === "bearish" ? "dumped" : "pumped"}{" "}
            {corrThreshold}+ points yet — log more history or lower the threshold.
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div className="sub" style={{ marginBottom: 10 }}>
              {SESSION_LABEL[corrTrigger]} {corrDirection === "bearish" ? "dumped" : "pumped"} {corrThreshold}+
              points on {correlation.triggerCount} day{correlation.triggerCount === 1 ? "" : "s"} in your log
              {correlation.sampleSize < correlation.triggerCount
                ? ` — ${correlation.sampleSize} of those also ${correlation.sampleSize === 1 ? "has" : "have"} a logged ${SESSION_LABEL[corrTarget]} entry`
                : ""}
              .
            </div>
            {correlation.sampleSize === 0 ? (
              <div className="sub">None of those days have a logged {SESSION_LABEL[corrTarget]} entry yet.</div>
            ) : (
              <>
                <div className="grid grid-cols-3" style={{ gap: 12 }}>
                  {(
                    [
                      { label: "Reversed", value: correlation.reversed, color: "var(--good)" },
                      { label: "Continued", value: correlation.continued, color: "var(--text)" },
                      { label: "Neutral", value: correlation.neutral, color: "var(--neutral)" },
                    ] as const
                  ).map((s) => (
                    <div
                      key={s.label}
                      style={{
                        border: "1px solid var(--border-soft)",
                        borderRadius: 9,
                        padding: "12px 14px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-mute)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {s.label}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-data)",
                          fontSize: 19,
                          fontWeight: 600,
                          marginTop: 5,
                          color: s.color,
                        }}
                      >
                        {pct(s.value, correlation.sampleSize)}%
                      </div>
                      <div className="sub" style={{ marginTop: 6 }}>
                        {s.value} of {correlation.sampleSize} days
                      </div>
                    </div>
                  ))}
                </div>
                {correlation.sampleSize < 10 && (
                  <div className="sub" style={{ marginTop: 12 }}>
                    Small sample size ({correlation.sampleSize} day{correlation.sampleSize === 1 ? "" : "s"}) — treat
                    this as a rough read until you&apos;ve logged more history.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
