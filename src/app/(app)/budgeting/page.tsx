import Link from "next/link";
import {
  getPayoutsWithAccount,
  getTaxProfile,
  getFormOptions,
  getTaxCategories,
  getTaxEntriesForYear,
  getPayoutsForTaxYear,
  getTaxYears,
  getTaxImportBatches,
  summarizeTaxYear,
} from "@/db/queries";
import { PageHead } from "@/components/PageHead";
import { updateTaxProfile, createPayout } from "@/app/actions/tax";
import { requireUser } from "@/lib/auth";
import { TaxEntryForm } from "@/components/TaxEntryForm";
import { DeleteTaxEntryButton } from "@/components/DeleteTaxEntryButton";
import { DeletePayoutButton } from "@/components/DeletePayoutButton";
import { TaxCsvImport } from "@/components/TaxCsvImport";
import { UndoImportBatchButton } from "@/components/UndoImportBatchButton";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "CH", name: "Switzerland" },
  { code: "IE", name: "Ireland" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "IN", name: "India" },
  { code: "NG", name: "Nigeria" },
  { code: "ZA", name: "South Africa" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "MY", name: "Malaysia" },
  { code: "NO", name: "Norway" },
  { code: "RU", name: "Russia" },
  { code: "OTHER", name: "Other" },
];

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtUsd2(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function BudgetingPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser();
  const { year: yearParam } = await searchParams;
  const nowYear = new Date().getFullYear();
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : nowYear;

  const [payoutRows, profile, formOptions, categories, entriesForYear, yearPayouts, taxYears, importBatches] = await Promise.all([
    getPayoutsWithAccount(user.id),
    getTaxProfile(user.id),
    getFormOptions(user.id),
    getTaxCategories(user.id),
    getTaxEntriesForYear(user.id, year),
    getPayoutsForTaxYear(user.id, year),
    getTaxYears(user.id),
    getTaxImportBatches(user.id),
  ]);

  const summary = summarizeTaxYear(year, entriesForYear, yearPayouts);
  const incomeEntries = entriesForYear.filter((e) => e.kind === "income");
  const expenseEntries = entriesForYear.filter((e) => e.kind === "expense");

  const now = new Date();
  const ytd = payoutRows.filter((p) => p.date.getFullYear() === now.getFullYear());
  const grossYtd = ytd.reduce((s, p) => s + Number(p.grossAmount), 0);
  const setAsideYtd = ytd.reduce((s, p) => s + (Number(p.grossAmount) - Number(p.netAmount)), 0);
  const blendedRate = Number(profile?.blendedRatePct ?? 0);
  const estTaxOwedYtd = grossYtd * (blendedRate / 100);
  const shortfall = setAsideYtd - estTaxOwedYtd;
  const setAsidePct = estTaxOwedYtd > 0 ? Math.min(100, (setAsideYtd / estTaxOwedYtd) * 100) : 100;

  return (
    <div>
      <PageHead title="Budgeting & Tax" subtitle="Every payout gets a set-aside recommendation the moment it lands." />

      <div className="kpi-row kpi-row-5">
        <div className="kpi">
          <div className="k">Payouts YTD</div>
          <div className="v good money">{fmtUsd(grossYtd)}</div>
        </div>
        <div className="kpi">
          <div className="k">Est. Tax Owed YTD</div>
          <div className="v money">{fmtUsd(estTaxOwedYtd)}</div>
        </div>
        <div className="kpi">
          <div className="k">Set Aside So Far</div>
          <div className="v money">{fmtUsd(setAsideYtd)}</div>
        </div>
        <div className="kpi">
          <div className="k">Shortfall</div>
          <div className={`v money ${shortfall >= 0 ? "good" : "bad"}`}>
            {shortfall >= 0 ? "+" : "−"}
            {fmtUsd(Math.abs(shortfall))}
          </div>
        </div>
        <div className="kpi">
          <div className="k">Blended Rate</div>
          <div className="v">{blendedRate ? `${blendedRate.toFixed(0)}%` : "—"}</div>
        </div>
      </div>

      <div className="board">
        <div className="card no-print">
          <h3>Filing Region</h3>
          <form action={updateTaxProfile} className="flex flex-col gap-3">
            <div className="field">
              <label>Country</label>
              <select name="countryCode" defaultValue={profile?.countryCode ?? "US"} id="countryCode">
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Filing Status</label>
              <input type="text" name="filingStatus" defaultValue={profile?.filingStatus ?? ""} placeholder="e.g. Individual" />
            </div>
            <div className="field">
              <label>Blended Est. Rate (%)</label>
              <input
                type="number"
                name="blendedRatePct"
                step="0.1"
                defaultValue={profile?.blendedRatePct ?? ""}
                placeholder="e.g. 29"
              />
            </div>
            <button type="submit" className="btn btn-ghost">
              Save Filing Region
            </button>
          </form>
          <div className="disclaimer">
            Estimate only, not tax advice — rates you enter are your own illustrative placeholders. Confirm actual
            treatment with a licensed accountant for your country before relying on these numbers.
          </div>
        </div>

        <div className="main-col">
          <div className="card setaside-card no-print">
            <h3>Set-Aside Progress</h3>
            <div className="setaside-row">
              <div className="setaside-track">
                <div className="setaside-fill" style={{ width: `${setAsidePct}%` }} />
              </div>
              <div className="setaside-label money">
                {fmtUsd(setAsideYtd)} / {fmtUsd(estTaxOwedYtd)} owed
              </div>
            </div>
          </div>

          {payoutRows.length === 0 ? (
            <div className="card card-pad no-print" style={{ marginBottom: 20 }}>
              <div className="sub">No payouts logged yet.</div>
            </div>
          ) : (
            <div className="table-card no-print" style={{ marginBottom: 20 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source</th>
                    <th>Gross Payout</th>
                    <th>Set-Aside %</th>
                    <th>Set-Aside</th>
                    <th>Net</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutRows.map((p) => {
                    const gross = Number(p.grossAmount);
                    const net = Number(p.netAmount);
                    const setAside = gross - net;
                    return (
                      <tr key={p.id}>
                        <td className="date">{fmtDate(p.date)}</td>
                        <td className="mono">
                          {p.account?.name ?? "—"}
                          {p.account?.status === "failed" ? (
                            <span className="sub" style={{ marginLeft: 6 }}>
                              (blown account)
                            </span>
                          ) : null}
                        </td>
                        <td className="pnl good money">+{fmtUsd(gross)}</td>
                        <td className="mono">{p.setAsidePct ? `${Number(p.setAsidePct).toFixed(0)}%` : "—"}</td>
                        <td className="mono money">{fmtUsd(setAside)}</td>
                        <td className="mono money">{fmtUsd(net)}</td>
                        <td>
                          <DeletePayoutButton id={p.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="card card-pad no-print">
            <h3>Log a Payout</h3>
            <form action={createPayout} className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-4">
              <div className="field">
                <label>Date</label>
                <input type="date" name="date" required />
              </div>
              <div className="field">
                <label>Account</label>
                <select name="accountId" required defaultValue="">
                  <option value="" disabled>
                    Select…
                  </option>
                  {formOptions.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Gross Amount ($)</label>
                <input type="number" name="grossAmount" step="0.01" required />
              </div>
              <div className="field">
                <label>Set-Aside %</label>
                <input type="number" name="setAsidePct" step="0.1" defaultValue={profile?.blendedRatePct ?? ""} />
              </div>
              <div className="field md:col-span-4 flex items-end">
                <button type="submit" className="btn btn-primary">
                  + Log Payout
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------
          Tax Year Summary — the actual tax calculator. Income by category
          (including automatic Account Payouts), expenses/write-offs by
          category, and a net total. This block (and only this block) is
          what "Print / Save as PDF" produces — see the @media print rules
          in globals.css.
          ----------------------------------------------------------------- */}
      <div className="card card-pad" style={{ marginTop: 24 }}>
        <div className="flex items-start justify-between gap-4 no-print" style={{ marginBottom: 4 }}>
          <div>
            <h3>Tax Year Summary</h3>
            <div className="sub">Every dollar in, every write-off out, for one tax year.</div>
          </div>
          <PrintButton />
        </div>

        <div className="tax-year-pills no-print">
          {taxYears.map((y) => (
            <Link key={y} href={`/budgeting?year=${y}`} className={`acct-pill ${y === year ? "active" : ""}`}>
              {y}
            </Link>
          ))}
        </div>

        <div className="print-area">
          <h3 style={{ marginBottom: 2 }}>{year} — Income &amp; Write-Off Summary</h3>
          <div className="sub" style={{ marginBottom: 16 }}>
            The Backroom — Member Desk. Generated for {user.name}.
          </div>

          <div style={{ marginBottom: 18 }}>
            <div className="tax-category-head" style={{ fontSize: 13.5, borderBottom: "1px solid var(--border-soft)", paddingBottom: 8 }}>
              <span>Income</span>
              <span className="amt" style={{ color: "var(--good)" }}>
                {fmtUsd2(summary.totalIncome)}
              </span>
            </div>
            {summary.income.length === 0 ? (
              <div className="sub" style={{ padding: "8px 2px" }}>
                No income logged for {year} yet.
              </div>
            ) : (
              summary.income.map((cat) => (
                <div key={cat.categoryName} className="tax-category-block">
                  <div className="tax-category-head">
                    <span>{cat.categoryName}</span>
                    <span className="amt">{fmtUsd2(cat.total)}</span>
                  </div>
                  {cat.lines.map((line) => (
                    <div key={line.id} className="tax-line-row">
                      <span className="desc">
                        {fmtDate(line.date)} {line.description ? `— ${line.description}` : ""}
                      </span>
                      <span className="amt">{fmtUsd2(line.amount)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div style={{ marginBottom: 8 }}>
            <div className="tax-category-head" style={{ fontSize: 13.5, borderBottom: "1px solid var(--border-soft)", paddingBottom: 8 }}>
              <span>Expenses / Write-offs</span>
              <span className="amt" style={{ color: "var(--bad)" }}>
                {fmtUsd2(summary.totalExpense)}
              </span>
            </div>
            {summary.expense.length === 0 ? (
              <div className="sub" style={{ padding: "8px 2px" }}>
                No expenses logged for {year} yet.
              </div>
            ) : (
              summary.expense.map((cat) => (
                <div key={cat.categoryName} className="tax-category-block">
                  <div className="tax-category-head">
                    <span>{cat.categoryName}</span>
                    <span className="amt">{fmtUsd2(cat.total)}</span>
                  </div>
                  {cat.lines.map((line) => (
                    <div key={line.id} className="tax-line-row">
                      <span className="desc">
                        {fmtDate(line.date)} {line.description ? `— ${line.description}` : ""}
                      </span>
                      <span className="amt">{fmtUsd2(line.amount)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="tax-net-row">
            <span>Net ({year})</span>
            <span className="amt" style={{ color: summary.net >= 0 ? "var(--good)" : "var(--bad)" }}>
              {summary.net >= 0 ? "" : "−"}
              {fmtUsd2(Math.abs(summary.net))}
            </span>
          </div>

          <div className="disclaimer">
            This is a summary ledger built from what you&apos;ve logged here — it is not tax advice and not an official
            IRS, Skatteetaten, or other tax-authority form. Use it as the source numbers when you (or your
            accountant) fill out your actual return, and confirm categorization and totals with a licensed tax
            professional before filing.
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------
          Manual income/expense logging — freeform, member-named categories,
          same "+ Add your own" pattern as Pairs/Setups/Entry Models.
          ----------------------------------------------------------------- */}
      <div className="tax-entry-board no-print" style={{ marginTop: 24 }}>
        <div className="card card-pad">
          <h3>Log Income</h3>
          <div className="sub" style={{ marginBottom: 10 }}>
            Anything that isn&apos;t an account payout — affiliate/Whop/coaching payouts, whatever you name it.
          </div>
          <TaxEntryForm kind="income" initialCategories={categories.income} />
          {incomeEntries.length > 0 && (
            <div className="table-card" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {incomeEntries.map((e) => (
                    <tr key={e.id}>
                      <td className="date">{fmtDate(e.date)}</td>
                      <td className="mono">{e.category.name}</td>
                      <td className="mono">{e.description ?? "—"}</td>
                      <td className="pnl good money">+{fmtUsd2(Number(e.amount))}</td>
                      <td>
                        <DeleteTaxEntryButton id={e.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h3>Log an Expense / Write-off</h3>
          <div className="sub" style={{ marginBottom: 10 }}>
            Prop-firm evaluations, account resets, software, data feeds — anything you&apos;d write off.
          </div>
          <TaxEntryForm kind="expense" initialCategories={categories.expense} />
          {expenseEntries.length > 0 && (
            <div className="table-card" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenseEntries.map((e) => (
                    <tr key={e.id}>
                      <td className="date">{fmtDate(e.date)}</td>
                      <td className="mono">{e.category.name}</td>
                      <td className="mono">{e.description ?? "—"}</td>
                      <td className="pnl bad money">−{fmtUsd2(Number(e.amount))}</td>
                      <td>
                        <DeleteTaxEntryButton id={e.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* -----------------------------------------------------------------
          CSV import — a generic column-mapped importer (see TaxCsvImport
          for why this isn't a firm-specific one-click import yet).
          ----------------------------------------------------------------- */}
      <div className="card card-pad no-print" style={{ marginTop: 20 }}>
        <h3>Import from a file</h3>
        <div className="sub" style={{ marginBottom: 10 }}>
          Import account purchases/resets, or any income/expense export, from a CSV file — pick which columns are
          which and every row that parses gets logged.
        </div>
        <TaxCsvImport incomeCategories={categories.income} expenseCategories={categories.expense} />

        {importBatches.length > 0 && (
          <div className="table-card" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Imported</th>
                  <th>File</th>
                  <th>Type</th>
                  <th>Rows</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {importBatches.map((b) => (
                  <tr key={b.id}>
                    <td className="date">{fmtDate(b.createdAt)}</td>
                    <td className="mono">{b.filename}</td>
                    <td className="mono">{b.kind === "income" ? "Income" : "Expense"}</td>
                    <td className="mono">{b.rowCount}</td>
                    <td>
                      <UndoImportBatchButton id={b.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
