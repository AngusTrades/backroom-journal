import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccountById, getAccountGroups, getTradesForAccount, getPayoutsForAccount, getTaxProfile } from "@/db/queries";
import { PageHead } from "@/components/PageHead";
import { AccountStatusControl } from "@/components/AccountStatusControl";
import { AccountGroupControl } from "@/components/AccountGroupControl";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { DeleteTradeButton } from "@/components/DeleteTradeButton";
import { DeletePayoutButton } from "@/components/DeletePayoutButton";
import { createPayout } from "@/app/actions/tax";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function statusMeta(status: string, type: string): { cls: string; label: string } {
  if (status === "passed") return { cls: "passed", label: "PASSED" };
  if (status === "failed") return { cls: "failed", label: "BLOWN" };
  if (status === "closed") return { cls: "paper", label: "CLOSED" };
  if (status === "funded") return { cls: "live", label: "FUNDED" };
  // active
  if (type === "live") return { cls: "live", label: "LIVE" };
  if (type === "paper" || type === "backtest" || type === "forward_test") return { cls: "paper", label: "PAPER" };
  return { cls: "eval", label: "EVAL" };
}

function typeLabel(type: string) {
  switch (type) {
    case "prop_firm":
      return "Prop Firm";
    case "live":
      return "Live";
    case "paper":
      return "Paper";
    case "backtest":
      return "Backtest";
    case "forward_test":
      return "Forward Test";
    default:
      return type;
  }
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const account = await getAccountById(id, user.id);
  if (!account) notFound();

  const [tradeRows, payoutRows, taxProfile, groups] = await Promise.all([
    getTradesForAccount(id),
    getPayoutsForAccount(id),
    getTaxProfile(user.id),
    getAccountGroups(user.id),
  ]);

  const tradeCount = tradeRows.length;
  const wins = tradeRows.filter((t) => t.outcome === "win").length;
  const winRate = tradeCount ? (wins / tradeCount) * 100 : 0;
  const totalRr = tradeRows.reduce(
    (s, t) => s + (t.rr === null ? 0 : Number(t.rr) * (t.outcome === "loss" ? -1 : t.outcome === "be" ? 0 : 1)),
    0,
  );
  const totalPnlUsd = tradeRows.reduce((s, t) => s + (t.pnlUsd !== null ? Number(t.pnlUsd) : 0), 0);
  const totalPayouts = payoutRows.reduce((s, p) => s + Number(p.netAmount), 0);
  const totalPayoutsGross = payoutRows.reduce((s, p) => s + Number(p.grossAmount), 0);
  // Live balance: starting balance, plus every trade's realized $ P&L
  // (trades logged without a $ amount contribute 0), minus what's actually
  // been withdrawn via payouts.
  const currentBalance = Number(account.startingBalance ?? 0) + totalPnlUsd - totalPayoutsGross;
  const size = Number(account.sizeUsd ?? account.startingBalance ?? 0);
  const meta = statusMeta(account.status, account.type);

  return (
    <div>
      <PageHead
        title={account.name}
        subtitle={`${typeLabel(account.type)}${account.firm ? ` · ${account.firm}` : ""}${size > 0 ? ` · ${size.toLocaleString(undefined, { maximumFractionDigits: 0 })} size` : ""}`}
        action={
          <Link href="/accounts" className="btn btn-ghost">
            ← All Accounts
          </Link>
        }
      />

      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`status ${meta.cls}`}>{meta.label}</span>
            <AccountStatusControl id={account.id} name={account.name} status={account.status} />
            <AccountGroupControl accountId={account.id} currentGroupId={account.groupId} groups={groups} />
          </div>
          <DeleteAccountButton id={account.id} name={account.name} tradeCount={tradeCount} totalPayouts={totalPayouts} />
        </div>
      </div>

      <div className="kpi-row kpi-row-5" style={{ marginBottom: 24 }}>
        <div className="kpi">
          <div className="k">Current Balance</div>
          <div className="v money">${currentBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="kpi">
          <div className="k">Net P&amp;L ($)</div>
          <div className={`v money ${totalPnlUsd >= 0 ? "good" : "bad"}`}>
            {totalPnlUsd >= 0 ? "+" : "−"}${Math.abs(totalPnlUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="kpi">
          <div className="k">Total R</div>
          <div className={`v ${totalRr >= 0 ? "good" : "bad"}`}>
            {totalRr >= 0 ? "+" : ""}
            {totalRr.toFixed(1)}R
          </div>
        </div>
        <div className="kpi">
          <div className="k">Win Rate</div>
          <div className="v">{tradeCount ? `${winRate.toFixed(0)}%` : "—"}</div>
        </div>
        <div className="kpi">
          <div className="k">Total Payouts</div>
          <div className="v money">${totalPayouts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      <h3 style={{ marginBottom: 10 }}>Trades</h3>
      <div className="table-wrap" style={{ marginBottom: payoutRows.length > 0 ? 20 : 0 }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
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
                <td colSpan={10} style={{ textAlign: "center", color: "var(--text-mute)", padding: "28px" }}>
                  No trades logged on this account yet.
                </td>
              </tr>
            )}
            {tradeRows.map((t) => (
              <tr key={t.id}>
                <td className="mono">{formatDate(t.date)}</td>
                <td className="mono">{t.pair?.symbol}</td>
                <td>{t.entryModel?.name ?? "—"}</td>
                <td style={{ maxWidth: 220, whiteSpace: "normal" }}>
                  {t.tradeSetups.length > 0 ? t.tradeSetups.map((ts) => ts.setup.name).join(", ") : "—"}
                </td>
                <td>{t.position === "long" ? "Long" : "Short"}</td>
                <td>{t.session?.name ?? "—"}</td>
                <td className={`num mono pnl ${t.rr === null ? "" : t.outcome === "loss" ? "bad" : t.outcome === "win" ? "good" : ""}`}>
                  {t.rr === null ? (
                    <Link href={`/edit-trade/${t.id}?returnTo=${encodeURIComponent(`/accounts/${account.id}`)}`} className="badge needs">
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
                  <span className={`badge ${t.outcome}`}>{t.outcome === "win" ? "WIN" : t.outcome === "loss" ? "LOSS" : "B/E"}</span>
                </td>
                <td className="flex items-center gap-2.5" style={{ whiteSpace: "nowrap" }}>
                  {t.chartImageUrl && (
                    <a href={t.chartImageUrl} target="_blank" rel="noopener noreferrer" className="link">
                      Chart
                    </a>
                  )}
                  <Link href={`/edit-trade/${t.id}?returnTo=/accounts/${id}`} className="link">
                    Edit
                  </Link>
                  <DeleteTradeButton id={t.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginBottom: 10 }}>Payouts</h3>
      {payoutRows.length > 0 ? (
        <div className="table-wrap" style={{ marginBottom: 24 }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Gross</th>
                <th className="num">Net</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payoutRows.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{formatDate(p.date)}</td>
                  <td className="mono num money">${Number(p.grossAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="mono num money">${Number(p.netAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>
                    <DeletePayoutButton id={p.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card card-pad" style={{ marginBottom: 24 }}>
          <div className="sub">No payouts logged on this account yet.</div>
        </div>
      )}

      <div className="card card-pad">
        <h3>Log a Payout</h3>
        <div className="sub" style={{ marginBottom: 12 }}>
          Withdrew money from this account? Log it here — it shows up on Budgeting &amp; Tax, pulls this account&apos;s
          current balance down by the gross amount, and marks the day on the PnL calendar.
        </div>
        <form action={createPayout} className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-4">
          <input type="hidden" name="accountId" value={account.id} />
          <input type="hidden" name="returnTo" value={`/accounts/${account.id}`} />
          <div className="field">
            <label>Date</label>
            <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          </div>
          <div className="field">
            <label>Gross Amount ($)</label>
            <input type="number" name="grossAmount" step="0.01" placeholder="e.g. 4000" required />
          </div>
          <div className="field">
            <label>Set-Aside %</label>
            <input type="number" name="setAsidePct" step="0.1" defaultValue={taxProfile?.blendedRatePct ?? ""} />
          </div>
          <div className="field flex items-end">
            <button type="submit" className="btn btn-primary">
              + Log Payout
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
