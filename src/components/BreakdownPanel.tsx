import type { Breakdown } from "@/db/queries";

export function BreakdownPanel({
  title,
  rows,
  showRr = false,
}: {
  title: string;
  rows: Breakdown[];
  showRr?: boolean;
}) {
  const top = rows.slice(0, 6);
  return (
    <div className="card card-pad">
      <h3>{title}</h3>
      {showRr && (
        <div className="bar-head">
          <span></span>
          <span></span>
          <span>WR</span>
          <span>Avg RR</span>
          <span>n</span>
        </div>
      )}
      {top.length === 0 && (
        <div className="py-3 text-[12px]" style={{ color: "var(--text-mute)" }}>
          No data yet.
        </div>
      )}
      {top.map((r) => (
        <div key={r.name} className={`bar-row ${showRr ? "with-rr" : ""}`}>
          <span className="lbl">{r.name}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(2, r.winRate)}%` }} />
          </div>
          <span className="pct">{r.winRate.toFixed(0)}%</span>
          {showRr && <span className="rr">{r.avgRr.toFixed(1)}R</span>}
          <span className="cnt">n={r.trades}</span>
        </div>
      ))}
    </div>
  );
}
