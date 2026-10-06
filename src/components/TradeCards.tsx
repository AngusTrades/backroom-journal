import Link from "next/link";
import { DeleteTradeButton } from "@/components/DeleteTradeButton";

// Phone layout for any trade list: one card per trade instead of a wide table
// that forces sideways scrolling (and hides R:R / P&L / actions off-screen).
// Render it inside `md:hidden` and keep the table in a `hidden md:block`.

type TradeCard = {
  id: string;
  date: Date | string;
  outcome: "win" | "loss" | "be";
  rr: string | number | null;
  pnlUsd: string | number | null;
  chartImageUrl?: string | null;
  pair?: { symbol: string } | null;
  account?: { name: string } | null;
  session?: { name: string } | null;
};

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const LABEL_STYLE = {
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-mute)",
  marginBottom: 4,
} as const;

export function TradeCards({
  trades,
  showAccount = true,
  returnTo,
  emptyText = "No trades logged yet.",
}: {
  trades: TradeCard[];
  showAccount?: boolean;
  /** Where "Add stop" (imported trades with no R yet) should send the user back to. */
  returnTo?: string;
  emptyText?: React.ReactNode;
}) {
  if (trades.length === 0) {
    return (
      <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-mute)" }}>
        {emptyText}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {trades.map((t) => {
        const tone = t.outcome === "loss" ? "bad" : t.outcome === "win" ? "good" : "";
        const editHref = `/edit-trade/${t.id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
        return (
          <div key={t.id} className="card" style={{ padding: "16px 18px" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div className="min-w-0">
                <div className="truncate" style={{ fontWeight: 600, fontSize: 14 }}>
                  <span className="mono">{t.pair?.symbol}</span>
                  {showAccount && t.account?.name ? (
                    <span style={{ color: "var(--text-mute)", fontWeight: 400 }}> · {t.account.name}</span>
                  ) : null}
                  {!showAccount && t.session?.name ? (
                    <span style={{ color: "var(--text-mute)", fontWeight: 400 }}> · {t.session.name}</span>
                  ) : null}
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
                <div className="k" style={LABEL_STYLE}>
                  R:R
                </div>
                {t.rr === null ? (
                  <Link href={editHref} className="badge needs">
                    Add stop
                  </Link>
                ) : (
                  <div className={`mono pnl ${tone}`} style={{ fontSize: 19, fontWeight: 600 }}>
                    {t.outcome === "loss" ? "−" : ""}
                    {Number(t.rr).toFixed(2)}R
                  </div>
                )}
              </div>
              <div>
                <div className="k" style={LABEL_STYLE}>
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
                <a
                  href={t.chartImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link inline-flex items-center px-3"
                  style={{ minHeight: 44 }}
                >
                  Chart
                </a>
              )}
              <Link href={editHref} className="link inline-flex items-center px-3" style={{ minHeight: 44 }}>
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
  );
}
