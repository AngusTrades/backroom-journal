import { getAnalytics, ANALYTICS_PERIODS, isAnalyticsPeriod, type AnalyticsPeriod } from "@/db/queries";
import { PageHead } from "@/components/PageHead";
import { EquityCurve } from "@/components/EquityCurve";
import { BreakdownPanel } from "@/components/BreakdownPanel";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  lifetime: "Lifetime",
};

function currentStreak(equityCurve: { cumulative: number }[]) {
  // Reconstruct win/loss/be sequence isn't directly available here; derive
  // a simple streak from consecutive positive deltas in the curve.
  if (equityCurve.length === 0) return "—";
  let streak = 0;
  let dir: "W" | "L" | null = null;
  for (let i = equityCurve.length - 1; i >= 0; i--) {
    const prev = i === 0 ? 0 : equityCurve[i - 1].cumulative;
    const delta = equityCurve[i].cumulative - prev;
    const thisDir: "W" | "L" | null = delta > 0 ? "W" : delta < 0 ? "L" : null;
    if (thisDir === null) break;
    if (dir === null) dir = thisDir;
    if (thisDir !== dir) break;
    streak++;
  }
  return dir ? `${streak}${dir}` : "—";
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period: AnalyticsPeriod = isAnalyticsPeriod(periodParam) ? periodParam : "lifetime";

  const user = await requireUser();
  const a = await getAnalytics(period, user.id);
  const streak = currentStreak(a.equityCurve);

  const periodSubtitle: Record<AnalyticsPeriod, string> = {
    daily: "Today so far.",
    weekly: "This week so far.",
    monthly: "This month so far.",
    yearly: "This year so far.",
    lifetime: "Every trade you've ever logged.",
  };

  return (
    <div>
      <PageHead
        title="Analytics"
        subtitle={periodSubtitle[period]}
        action={
          <div className="period-tabs">
            {ANALYTICS_PERIODS.map((p) => (
              <a key={p} href={p === "lifetime" ? "/analytics" : `/analytics?period=${p}`} className={`period-tab ${p === period ? "active" : ""}`}>
                {PERIOD_LABEL[p]}
              </a>
            ))}
          </div>
        }
      />

      <div className="kpi-row kpi-row-7">
        <div className="kpi">
          <div className="k">
            {period === "lifetime" ? "Payouts to Date" : `Payouts (${PERIOD_LABEL[period]})`}
          </div>
          <div className="v good money">
            {a.payoutsTotal > 0 ? `$${a.payoutsTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
          </div>
        </div>
        <div className="kpi">
          <div className="k">Win Rate</div>
          <div className={`v ${a.winRate >= 50 ? "good" : "bad"}`}>{a.winRate.toFixed(1)}%</div>
        </div>
        <div className="kpi">
          <div className="k">Profit Factor</div>
          <div className={`v ${a.profitFactor >= 1 ? "good" : "bad"}`}>
            {Number.isFinite(a.profitFactor) ? a.profitFactor.toFixed(2) : "∞"}
          </div>
        </div>
        <div className="kpi">
          <div className="k">Avg R:R</div>
          <div className={`v ${a.avgRr >= 0 ? "good" : "bad"}`}>
            {a.avgRr >= 0 ? "+" : ""}
            {a.avgRr.toFixed(2)}R
          </div>
        </div>
        <div className="kpi">
          <div className="k">Net R</div>
          <div className={`v ${(a.equityCurve.at(-1)?.cumulative ?? 0) >= 0 ? "good" : "bad"}`}>
            {(a.equityCurve.at(-1)?.cumulative ?? 0) >= 0 ? "+" : ""}
            {(a.equityCurve.at(-1)?.cumulative ?? 0).toFixed(2)}R
          </div>
        </div>
        <div className="kpi">
          <div className="k">Trades</div>
          <div className="v">{a.totalTrades}</div>
        </div>
        <div className="kpi">
          <div className="k">Current Streak</div>
          <div className={`v ${streak.endsWith("W") ? "good" : streak.endsWith("L") ? "bad" : ""}`}>{streak}</div>
        </div>
      </div>

      <div className="card card-pad equity-card">
        <h3>Equity Curve</h3>
        <div className="sub">
          Cumulative R {period === "lifetime" ? "across every logged trade" : `— ${periodSubtitle[period].toLowerCase()}`}
        </div>
        <EquityCurve data={a.equityCurve} />
      </div>

      <div className="grid4">
        <BreakdownPanel title="Win Rate by Confluence" rows={a.bySetup} showRr />
        <BreakdownPanel title="Win Rate by Entry Model" rows={a.byEntryModel} />
        <BreakdownPanel title="Win Rate by Session" rows={a.bySession} />
        <BreakdownPanel title="Win Rate by Pair" rows={a.byPair} />
      </div>
    </div>
  );
}
