import Link from "next/link";
import { getTradesWithDetails } from "@/db/queries";
import { PageHead } from "@/components/PageHead";
import { DeleteTradeButton } from "@/components/DeleteTradeButton";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function JournalPage() {
  const user = await requireUser();
  const tradeRows = await getTradesWithDetails(user.id);

  const totalTrades = tradeRows.length;
  const wins = tradeRows.filter((t) => t.outcome === "win").length;
  const winRate = totalTrades ? (wins / totalTrades) * 100 : 0;
  // Imported trades have no R until their stop is entered — R stats only
  // count trades where R is known.
  const rTrades = tradeRows.filter((t) => t.rr !== null);
  const needsStop = totalTrades - rTrades.length;
  const avgRr = rTrades.length ? rTrades.reduce((sum, t) => sum + Number(t.rr), 0) / rTrades.length : 0;
  const totalRr = rTrades.reduce((sum, t) => sum + Number(t.rr) * (t.outcome === "loss" ? -1 : t.outcome === "be" ? 0 : 1), 0);
  const totalPnlUsd = tradeRows.reduce((sum, t) => sum + (t.pnlUsd !== null ? Number(t.pnlUsd) : 0), 0);
  const hasPnlData = tradeRows.some((t) => t.pnlUsd !== null);

  return (
    <div>
      <PageHead
        title="Journal"
        subtitle="Every trade, every confluence, in one place."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/import-trades" className="btn btn-ghost">
              Import from Tradovate
            </Link>
            <Link href="/add-trade" className="btn btn-primary">
              + Add Trade
            </Link>
          </div>
        }
      />

      {needsStop > 0 && (
        <div className="card card-pad needs-banner" style={{ marginBottom: 16 }}>
          <span className="badge needs">Add stop</span> {needsStop} imported trade{needsStop === 1 ? "" : "s"}{" "}
          {needsStop === 1 ? "needs" : "need"} a stop price before {needsStop === 1 ? "it counts" : "they count"} toward
          your R stats. Open them with Edit below.
        </div>
      )}

      <div className="kpi-row">
        <div className="kpi">
          <div className="k">Total Trades</div>
          <div className="v">{totalTrades}</div>
        </div>
        <div className="kpi">
          <div className="k">Win Rate</div>
          <div className="v">{winRate.toFixed(1)}%</div>
        </div>
        <div className="kpi">
          <div className="k">Avg R:R</div>
          <div className="v">{avgRr.toFixed(2)}R</div>
        </div>
        <div className="kpi">
          <div className="k">Net R</div>
          <div className={`v ${totalRr >= 0 ? "good" : "bad"}`}>
            {totalRr >= 0 ? "+" : ""}
            {totalRr.toFixed(2)}R
          </div>
        </div>
        {hasPnlData && (
          <div className="kpi">
            <div className="k">Net P&amp;L ($)</div>
            <div className={`v money ${totalPnlUsd >= 0 ? "good" : "bad"}`}>
              {totalPnlUsd >= 0 ? "+" : "−"}${Math.abs(totalPnlUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        )}
      </div>

      {/* Phones: one card per trade (the 11-column table below is unreadable
          at 390px and forces sideways scrolling). md+ keeps the table. */}
      <div className="flex flex-col gap-3 md:hidden">
        {tradeRows.length === 0 && (
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-mute)" }}>
            No trades logged yet —{" "}
            <Link href="/add-trade" style={{ color: "var(--accent-strong)" }}>
              add your first one
            </Link>
            .
          </div>
        )}
        {tradeRows.map((t) => {
          const tone = t.outcome === "loss" ? "bad" : t.outcome === "win" ? "good" : "";
          return (
            <div key={t.id} className="card" style={{ padding: "16px 18px" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div className="min-w-0">
                  <div className="truncate" style={{ fontWeight: 600, fontSize: 14 }}>
                    <span className="mono">{t.pair?.symbol}</span>
                    {t.account?.name ? <span style={{ color: "var(--text-mute)", fontWeight: 400 }}> · {t.account.name}</span> : null}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 2 }}>
                    {formatDate(t.date)}
                  </div>
                </div>
                <span className={`badge ${t.outcome}`}>
                  {t.outcome === "win" ? "WIN" : t.outcome === "loss" ? "LOSS" : "B/E"}
                </span>
              </div>
              <div
                className="grid grid-cols-2 gap-3"
                style={{ padding: "12px 0", borderTop: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)" }}
              >
                <div>
                  <div className="k" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 4 }}>
                    R:R
                  </div>
                  <div className={`mono pnl ${tone}`} style={{ fontSize: 19, fontWeight: 600 }}>
                    {t.outcome === "loss" ? "−" : ""}
                    {Number(t.rr).toFixed(2)}R
                  </div>
                </div>
                <div>
                  <div className="k" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 4 }}>
                    P&amp;L
                  </div>
                  <div
                    className={`mono pnl money ${t.pnlUsd !== null ? (Number(t.pnlUsd) >= 0 ? "good" : "bad") : ""}`}
                    style={{ fontSize: 19, fontWeight: 600 }}
                  >
                    {t.pnlUsd !== null
                      ? `${Number(t.pnlUsd) >= 0 ? "+" : "−"}$${Math.abs(Number(t.pnlUsd)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end" style={{ paddingTop: 4, gap: 2 }}>
                {t.chartImageUrl && (
                  <a href={t.chartImageUrl} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center px-3" style={{ minHeight: 44 }}>
                    Chart
                  </a>
                )}
                <Link href={`/edit-trade/${t.id}`} className="link inline-flex items-center px-3" style={{ minHeight: 44 }}>
                  Edit
                </Link>
                <span className="inline-flex items-center px-3" style={{ minHeight: 44 }}>
                  <DeleteTradeButton id={t.id} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="table-wrap hidden md:block">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Account</th>
              <th>Pair</th>
              <th>Entry Model</th>
              <th>Setups</th>
              <th>Position</th>
              <th>Session</th>
              <th className="num">R:R</th>
              <th className="num">P&amp;L</th>
              <th>Outcome</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tradeRows.length === 0 && (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", color: "var(--text-mute)", padding: "28px" }}>
                  No trades logged yet —{" "}
                  <Link href="/add-trade" style={{ color: "var(--accent-strong)" }}>
                    add your first one
                  </Link>
                  .
                </td>
              </tr>
            )}
            {tradeRows.map((t) => (
              <tr key={t.id}>
                <td className="mono">{formatDate(t.date)}</td>
                <td>{t.account?.name}</td>
                <td className="mono">{t.pair?.symbol}</td>
                <td>{t.entryModel?.name ?? "—"}</td>
                <td style={{ maxWidth: 220, whiteSpace: "normal" }}>
                  {t.tradeSetups.length > 0
                    ? t.tradeSetups.map((ts) => ts.setup.name).join(", ")
                    : "—"}
                </td>
                <td>{t.position === "long" ? "Long" : "Short"}</td>
                <td>{t.session?.name ?? "—"}</td>
                <td className={`num mono pnl ${t.rr === null ? "" : t.outcome === "loss" ? "bad" : t.outcome === "win" ? "good" : ""}`}>
                  {t.rr === null ? (
                    <Link href={`/edit-trade/${t.id}`} className="badge needs">
                      Add stop
                    </Link>
                  ) : (
                    <>
                      {t.outcome === "loss" ? "−" : ""}
                      {Number(t.rr).toFixed(2)}R
                    </>
                  )}
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
                  {t.chartImageUrl && (
                    <a href={t.chartImageUrl} target="_blank" rel="noopener noreferrer" className="link">
                      Chart
                    </a>
                  )}
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
    </div>
  );
}
