import { getAccountsWithStats, getAccountGroups } from "@/db/queries";
import { PageHead } from "@/components/PageHead";
import { createAccount } from "@/app/actions/accounts";
import { AccountStatusControl } from "@/components/AccountStatusControl";
import { AccountGroupSelect } from "@/components/AccountGroupSelect";
import { AccountGroupControl } from "@/components/AccountGroupControl";
import { AccountGroupHeaderActions } from "@/components/AccountGroupHeaderActions";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type AccountRow = Awaited<ReturnType<typeof getAccountsWithStats>>[number];
type GroupRow = Awaited<ReturnType<typeof getAccountGroups>>[number];

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

// One account card — pulled out of the grid-mapping below since it now
// renders identically inside three different places (a group's section, the
// Ungrouped section, and the flat no-groups-yet layout).
function AccountCard({ a, groups }: { a: AccountRow; groups: GroupRow[] }) {
  const meta = statusMeta(a.status, a.type);
  const size = Number(a.sizeUsd ?? a.startingBalance ?? 0);
  const winRate = a.tradeCount ? (a.wins / a.tradeCount) * 100 : 0;
  return (
    <div className="acct-card">
      <div className="acct-top">
        <div>
          <div className="acct-name">{a.name}</div>
          <div className="acct-sub">
            {typeLabel(a.type)}
            {a.firm ? ` · ${a.firm}` : ""}
          </div>
        </div>
        <span className={`status ${meta.cls}`}>{meta.label}</span>
      </div>
      <div className="balance money">${a.currentBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
      <div className="pnl-line">
        {a.tradeCount > 0 ? (
          <>
            {a.tradeCount} trades ·{" "}
            <b className={winRate >= 50 ? "good" : "bad"}>{winRate.toFixed(0)}% win rate</b>
            {size > 0 && Math.round(size) !== Math.round(a.currentBalance) && (
              <span className="money">
                {" "}
                · {a.currentBalance >= size ? "+" : "−"}$
                {Math.abs(a.currentBalance - size).toLocaleString(undefined, { maximumFractionDigits: 0 })} vs.{" "}
                {size.toLocaleString(undefined, { maximumFractionDigits: 0 })} size
              </span>
            )}
          </>
        ) : (
          "No trades logged yet"
        )}
      </div>
      <div className="acct-foot" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="rr">
          Total R: {a.totalRr >= 0 ? "+" : ""}
          {a.totalRr.toFixed(1)}R
          {a.totalPayouts > 0 && (
            <span className="money"> · ${a.totalPayouts.toLocaleString(undefined, { maximumFractionDigits: 0 })} paid out</span>
          )}
        </span>
        <a className="link" href={`/accounts/${a.id}`}>
          View account →
        </a>
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <AccountGroupControl accountId={a.id} currentGroupId={a.groupId} groups={groups} />
      </div>
    </div>
  );
}

// A group's collapsible section — the account count/balance/net R in the
// summary is what makes a busy roster (20 Apex accounts, say) readable at a
// glance without opening it. Native <details>/<summary>, same "plain HTML,
// no client JS for the shell" philosophy as the rest of the app; only the
// bits inside that need interactivity (the rename/delete buttons, the
// per-card group picker) are client components.
function GroupSection({
  title,
  accountsInGroup,
  groups,
  headerActions,
}: {
  title: string;
  accountsInGroup: AccountRow[];
  groups: GroupRow[];
  headerActions?: React.ReactNode;
}) {
  const totalBalance = accountsInGroup.reduce((s, a) => s + a.currentBalance, 0);
  const netR = accountsInGroup.reduce((s, a) => s + a.totalRr, 0);
  return (
    <details open style={{ marginBottom: 16 }}>
      <summary
        className="flex items-center justify-between flex-wrap gap-2"
        style={{
          cursor: "pointer",
          listStyle: "none",
          padding: "10px 4px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span className="flex items-center gap-2.5 flex-wrap">
          <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
          <span className="sub" style={{ fontSize: 11.5 }}>
            {accountsInGroup.length} account{accountsInGroup.length === 1 ? "" : "s"}
            {accountsInGroup.length > 0 && (
              <>
                {" "}
                · <span className="money">${totalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> ·{" "}
                <span className={netR >= 0 ? "good" : "bad"}>
                  {netR >= 0 ? "+" : ""}
                  {netR.toFixed(1)}R
                </span>
              </>
            )}
          </span>
        </span>
        {headerActions}
      </summary>
      <div style={{ paddingTop: 14 }}>
        {accountsInGroup.length === 0 ? (
          <div className="sub" style={{ padding: "4px 4px 8px" }}>
            No accounts in this group yet — assign one from its card above, or from Add Account below.
          </div>
        ) : (
          <div className="acct-grid">
            {accountsInGroup.map((a) => (
              <AccountCard key={a.id} a={a} groups={groups} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export default async function AccountsPage() {
  const user = await requireUser();
  const [accounts, groups] = await Promise.all([getAccountsWithStats(user.id), getAccountGroups(user.id)]);
  const activeAccounts = accounts.filter((a) => a.status !== "failed");
  const archivedAccounts = accounts.filter((a) => a.status === "failed");

  const totalValue = accounts.reduce((s, a) => s + a.currentBalance, 0);
  const netR = accounts.reduce((s, a) => s + a.totalRr, 0);
  const inEval = accounts.filter((a) => a.type === "prop_firm" && a.status === "active").length;

  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const ungroupedActive = activeAccounts.filter((a) => !a.groupId || !groupNameById.has(a.groupId));

  return (
    <div>
      <PageHead
        title="Accounts"
        subtitle="Every account you're trading, in one place."
        action={
          <a className="btn btn-primary" href="#add-account">
            + Add Account
          </a>
        }
      />

      <div className="kpi-row kpi-row-3">
        <div className="kpi">
          <div className="k">Total Current Balance</div>
          <div className="v">
            <span className="money">
              ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
        <div className="kpi">
          <div className="k">Net R (All Accounts)</div>
          <div className={`v ${netR >= 0 ? "good" : "bad"}`}>
            {netR >= 0 ? "+" : ""}
            {netR.toFixed(1)}R
          </div>
        </div>
        <div className="kpi">
          <div className="k">Accounts in Evaluation</div>
          <div className="v">{inEval}</div>
        </div>
      </div>

      {activeAccounts.length === 0 ? (
        <div className="card card-pad">
          <div className="sub">No active accounts yet.</div>
        </div>
      ) : groups.length === 0 ? (
        // Nobody's made a group yet — a flat grid is the right default,
        // exactly as before. Each card still carries the group picker so
        // starting your first group is one click away from any card.
        <div className="acct-grid">
          {activeAccounts.map((a) => (
            <AccountCard key={a.id} a={a} groups={groups} />
          ))}
        </div>
      ) : (
        <div>
          {groups.map((g) => {
            const accountsInGroup = activeAccounts.filter((a) => a.groupId === g.id);
            return (
              <GroupSection
                key={g.id}
                title={g.name}
                accountsInGroup={accountsInGroup}
                groups={groups}
                headerActions={
                  <AccountGroupHeaderActions id={g.id} name={g.name} accountCount={accountsInGroup.length} />
                }
              />
            );
          })}
          {ungroupedActive.length > 0 && (
            <GroupSection title="Ungrouped" accountsInGroup={ungroupedActive} groups={groups} />
          )}
        </div>
      )}

      {archivedAccounts.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ marginBottom: 4 }}>Archived Accounts</h3>
          <div className="sub" style={{ marginBottom: 12 }}>
            Blown accounts — pulled out of your active roster, but every trade and payout is still here.
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Group</th>
                  <th className="num">Total R</th>
                  <th className="num">Payouts</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {archivedAccounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td className="acct-sub">
                      {typeLabel(a.type)}
                      {a.firm ? ` · ${a.firm}` : ""}
                    </td>
                    <td className="acct-sub">{a.groupId ? (groupNameById.get(a.groupId) ?? "—") : "—"}</td>
                    <td className={`num pnl ${a.totalRr >= 0 ? "good" : "bad"}`}>
                      {a.totalRr >= 0 ? "+" : ""}
                      {a.totalRr.toFixed(1)}R
                    </td>
                    <td className="num mono money">
                      {a.totalPayouts > 0 ? `$${a.totalPayouts.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                    </td>
                    <td>
                      <span className="flex items-center justify-end gap-3">
                        <AccountStatusControl id={a.id} name={a.name} status={a.status} />
                        <a className="link" href={`/accounts/${a.id}`}>
                          View account →
                        </a>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card card-pad" id="add-account" style={{ marginTop: 24 }}>
        <h3>Add Account</h3>
        <form action={createAccount} className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <div className="field">
            <label>Account Name</label>
            <input type="text" name="name" placeholder="e.g. Bulenox 50k" required />
          </div>
          <div className="field">
            <label>Type</label>
            <select name="type" defaultValue="prop_firm">
              <option value="prop_firm">Prop Firm</option>
              <option value="live">Live</option>
              <option value="paper">Paper</option>
              <option value="backtest">Backtest</option>
              <option value="forward_test">Forward Test</option>
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue="active">
              <option value="active">Active / Evaluation</option>
              <option value="funded">Funded</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="field">
            <label>Firm (optional)</label>
            <input type="text" name="firm" placeholder="e.g. Bulenox" />
          </div>
          <div className="field">
            <label>Group (optional)</label>
            <AccountGroupSelect initialGroups={groups} />
          </div>
          <div className="field">
            <label>Account Size ($)</label>
            <input type="number" name="sizeUsd" step="1" placeholder="50000" />
          </div>
          <div className="field">
            <label>Starting Balance ($, if different)</label>
            <input type="number" name="startingBalance" step="1" placeholder="defaults to account size" />
          </div>
          <div className="field">
            <label>How Many? (optional)</label>
            <input type="number" name="quantity" min={1} max={100} step="1" defaultValue={1} />
            <div className="sub" style={{ marginTop: 4 }}>
              More than 1 creates that many accounts in one go — all the same type/firm/size/status/group — numbered
              &quot;#1&quot;, &quot;#2&quot;, etc. after the name (e.g. 20× &quot;Apex 50k&quot; → &quot;Apex 50k #1&quot;
              … &quot;Apex 50k #20&quot;).
            </div>
          </div>
          <div className="field md:col-span-3 flex items-end">
            <button type="submit" className="btn btn-primary">
              + Add Account(s)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
