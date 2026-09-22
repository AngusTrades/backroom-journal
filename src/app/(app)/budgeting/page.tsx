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
  getReceiptsForYear,
  summarizeTaxYear,
} from "@/db/queries";
import { PageHead } from "@/components/PageHead";
import { updateTaxProfile, createPayout } from "@/app/actions/tax";
import { requireUser } from "@/lib/auth";
import { TaxEntryForm } from "@/components/TaxEntryForm";
import { PayoutAccountSelect } from "@/components/PayoutAccountSelect";
import { DeleteTaxEntryButton } from "@/components/DeleteTaxEntryButton";
import { DeleteTaxCategoryButton } from "@/components/DeleteTaxCategoryButton";
import { DeletePayoutButton } from "@/components/DeletePayoutButton";
import { TaxCsvImport } from "@/components/TaxCsvImport";
import { UndoImportBatchButton } from "@/components/UndoImportBatchButton";
import { PrintButton } from "@/components/PrintButton";
import { ReceiptUpload } from "@/components/ReceiptUpload";
import { DeleteReceiptButton } from "@/components/DeleteReceiptButton";
import { BrokerStatementImport } from "@/components/BrokerStatementImport";
import { computeBracketTax, getCountryTaxModel, getFilingStatusOptions } from "@/lib/taxBrackets";

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
function fmtLocal(n: number, currency: string) {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

type TaxEntryRow = Awaited<ReturnType<typeof getTaxEntriesForYear>>[number];
type TaxEntryCategoryGroup = { categoryName: string; total: number; items: TaxEntryRow[] };

// Groups a kind's entries ("income" or "expense") by category name — e.g.
// every "Topstep Combine" purchase collapses into one "Topstep Combine"
// bucket instead of one row per purchase. Highest-total category first, so
// the biggest spend ("you've used $X on Apex resets") leads.
function groupTaxEntriesByCategory(entries: TaxEntryRow[]): TaxEntryCategoryGroup[] {
  const byCategory = new Map<string, TaxEntryCategoryGroup>();
  for (const e of entries) {
    const key = e.category.name;
    const amount = Number(e.amount);
    const existing = byCategory.get(key);
    if (existing) {
      existing.total += amount;
      existing.items.push(e);
    } else {
      byCategory.set(key, { categoryName: key, total: amount, items: [e] });
    }
  }
  return Array.from(byCategory.values()).sort((a, b) => b.total - a.total);
}

// One category's entries, collapsed by default. With hundreds or thousands
// of prop-firm purchases (combines, resets, activation fees) piling up over
// a year, a flat per-entry table becomes unreadable — this collapses it to
// "$X on Topstep Combines" at a glance, expandable per category. Reuses the
// .tax-category-block/.tax-category-head/.tax-line-row classes the printed
// Tax Year Summary above already uses, so the look matches; this whole
// section lives inside .tax-entry-board.no-print, so it's excluded from
// printing entirely — the print output is untouched and stays fully
// itemized exactly as before.
function TaxEntryCategorySection({ group, kind }: { group: TaxEntryCategoryGroup; kind: "income" | "expense" }) {
  const color = kind === "income" ? "var(--good)" : "var(--bad)";
  const sign = kind === "income" ? "+" : "−";
  return (
    <details className="tax-category-block">
      <summary className="tax-category-head" style={{ cursor: "pointer", listStyle: "none" }}>
        <span>
          {group.categoryName}{" "}
          <span className="sub" style={{ fontWeight: 400 }}>
            {group.items.length} {group.items.length === 1 ? "entry" : "entries"}
          </span>
        </span>
        <span className="amt" style={{ color }}>
          <span className="money">
            {sign}
            {fmtUsd2(group.total)}
          </span>
          <DeleteTaxCategoryButton categoryId={group.items[0].category.id} categoryName={group.categoryName} count={group.items.length} />
        </span>
      </summary>
      {group.items.map((e) => (
        <div key={e.id} className="tax-line-row">
          <span className="desc">
            {fmtDate(e.date)} {e.description ? `— ${e.description}` : ""}
          </span>
          <span className="amt" style={{ color }}>
            <span className="money">
              {sign}
              {fmtUsd2(Number(e.amount))}
            </span>
            <DeleteTaxEntryButton id={e.id} />
          </span>
        </div>
      ))}
    </details>
  );
}

type PayoutRow = Awaited<ReturnType<typeof getPayoutsWithAccount>>[number];
type PayoutFirmGroup = { firmName: string; totalGross: number; totalNet: number; totalSetAside: number; items: PayoutRow[] };

// Same idea as groupTaxEntriesByCategory, for the payouts list — once
// you're running dozens of accounts across several firms, a flat "every
// payout ever" table gets just as unreadable as the tax entries did.
// Grouping by the account's firm answers "how much have I been paid out
// by Apex vs Topstep" at a glance, expandable to the individual payouts.
function groupPayoutsByFirm(rows: PayoutRow[]): PayoutFirmGroup[] {
  const byFirm = new Map<string, PayoutFirmGroup>();
  for (const p of rows) {
    const key = p.account?.firm?.trim() || "No Firm Set";
    const gross = Number(p.grossAmount);
    const net = Number(p.netAmount);
    const setAside = gross - net;
    const existing = byFirm.get(key);
    if (existing) {
      existing.totalGross += gross;
      existing.totalNet += net;
      existing.totalSetAside += setAside;
      existing.items.push(p);
    } else {
      byFirm.set(key, { firmName: key, totalGross: gross, totalNet: net, totalSetAside: setAside, items: [p] });
    }
  }
  return Array.from(byFirm.values()).sort((a, b) => b.totalGross - a.totalGross);
}

// One firm's payouts, collapsed by default — reuses the same
// .tax-category-block/.tax-category-head look as the tax entry groups above
// so the whole page reads consistently, with the original payouts table
// (Date/Account/Gross/Set-Aside/Net/Actions) nested inside each firm.
function PayoutFirmSection({ group }: { group: PayoutFirmGroup }) {
  return (
    <details className="tax-category-block">
      <summary className="tax-category-head" style={{ cursor: "pointer", listStyle: "none" }}>
        <span>
          {group.firmName}{" "}
          <span className="sub" style={{ fontWeight: 400 }}>
            {group.items.length} {group.items.length === 1 ? "payout" : "payouts"}
          </span>
        </span>
        <span className="amt good money">+{fmtUsd(group.totalGross)}</span>
      </summary>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Account</th>
              <th>Gross Payout</th>
              <th>Set-Aside %</th>
              <th>Set-Aside</th>
              <th>Net</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((p) => {
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
    </details>
  );
}

export default async function BudgetingPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser();
  const { year: yearParam } = await searchParams;
  const nowYear = new Date().getFullYear();
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : nowYear;

  const [payoutRows, profile, formOptions, categories, entriesForYear, yearPayouts, taxYears, importBatches, receiptsForYear] =
    await Promise.all([
      getPayoutsWithAccount(user.id),
      getTaxProfile(user.id),
      getFormOptions(user.id),
      getTaxCategories(user.id),
      getTaxEntriesForYear(user.id, year),
      getPayoutsForTaxYear(user.id, year),
      getTaxYears(user.id),
      getTaxImportBatches(user.id),
      getReceiptsForYear(user.id, year),
    ]);

  const summary = summarizeTaxYear(year, entriesForYear, yearPayouts);
  const incomeEntries = entriesForYear.filter((e) => e.kind === "income");
  const expenseEntries = entriesForYear.filter((e) => e.kind === "expense");

  const now = new Date();
  const ytd = payoutRows.filter((p) => p.date.getFullYear() === now.getFullYear());
  const grossYtd = ytd.reduce((s, p) => s + Number(p.grossAmount), 0);
  const setAsideYtd = ytd.reduce((s, p) => s + (Number(p.grossAmount) - Number(p.netAmount)), 0);

  // Logged income entries (manual + CSV/PDF-imported) for the *current
  // calendar year* specifically — separate from `incomeEntries` above,
  // which is scoped to whatever tax `year` is selected in the Tax Year
  // Summary below. Reuses that fetch when the two years match (the common
  // case) instead of firing a second query.
  const incomeEntriesForCurrentYear =
    year === now.getFullYear() ? incomeEntries : (await getTaxEntriesForYear(user.id, now.getFullYear())).filter((e) => e.kind === "income");
  const loggedIncomeYtd = incomeEntriesForCurrentYear.reduce((s, e) => s + Number(e.amount), 0);
  // Total income YTD — payouts plus everything logged as income (manual
  // entries and CSV/PDF imports), so a member paid mostly through Whop/
  // affiliate income rather than account payouts still gets an accurate
  // tax owed / set-aside estimate instead of one based on payouts alone.
  const totalIncomeYtd = grossYtd + loggedIncomeYtd;

  // Auto-calculated bracket rate, once a country with a bracket table is set
  // and there's YTD income logged to bracket-match against. A manually
  // entered blendedRatePct always wins over the auto figure — it's an
  // override, not a second source of truth.
  const countryCode = profile?.countryCode ?? "US";
  const taxModel = getCountryTaxModel(countryCode);
  const filingStatusOptions = getFilingStatusOptions(countryCode);
  const bracketResult =
    taxModel && totalIncomeYtd > 0 ? computeBracketTax(countryCode, profile?.filingStatus ?? taxModel.defaultStatus, totalIncomeYtd) : null;
  const manualRateOverride = profile?.blendedRatePct ? Number(profile.blendedRatePct) : null;
  const isAutoRate = manualRateOverride === null && bracketResult !== null;
  const blendedRate = manualRateOverride ?? bracketResult?.effectiveRatePct ?? 0;

  const estTaxOwedYtd = totalIncomeYtd * (blendedRate / 100);
  const shortfall = setAsideYtd - estTaxOwedYtd;
  const setAsidePct = estTaxOwedYtd > 0 ? Math.min(100, (setAsideYtd / estTaxOwedYtd) * 100) : 100;

  // Potential deduction value — for the selected tax YEAR's net result
  // (summary.net, not the YTD figure above), if losses outran gains. Uses
  // the country's flat/base rate (Norway: the flat 22% "alminnelig
  // inntekt" rate, i.e. the first bracket) rather than the blended rate
  // above — trinnskatt and equivalent progressive add-ons generally tax
  // personal/business income, not capital losses, so the top-bracket-
  // inclusive blended rate would overstate what a loss is actually worth.
  // A manually entered override rate still wins, same as everywhere else
  // on this page. Converted to the filing country's own currency using
  // the same ballpark FX rate taxBrackets.ts already uses for brackets.
  const countryName = COUNTRIES.find((c) => c.code === countryCode)?.name ?? countryCode;
  const netLossUsd = summary.net < 0 ? Math.abs(summary.net) : 0;
  const flatRatePct =
    manualRateOverride ?? (taxModel ? taxModel.bracketsFor(profile?.filingStatus ?? taxModel.defaultStatus)[0].rate * 100 : null);
  const refundEstimateUsd = netLossUsd > 0 && flatRatePct !== null ? netLossUsd * (flatRatePct / 100) : null;
  const refundEstimateLocal =
    refundEstimateUsd !== null && taxModel && taxModel.currency !== "USD" ? refundEstimateUsd / taxModel.fxToUsd : null;

  return (
    <div>
      <PageHead title="Budgeting & Tax" subtitle="Every payout gets a set-aside recommendation the moment it lands." />

      <div className="kpi-row kpi-row-5">
        <div className="kpi">
          <div className="k">Total Income YTD</div>
          <div className="v good money">{fmtUsd(totalIncomeYtd)}</div>
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
          <div className="k">
            {isAutoRate ? "Blended Rate (auto)" : manualRateOverride !== null ? "Blended Rate (override)" : "Blended Rate"}
          </div>
          <div className="v">{blendedRate ? `${blendedRate.toFixed(1)}%` : "—"}</div>
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
              {filingStatusOptions && filingStatusOptions.length > 1 ? (
                <select
                  name="filingStatus"
                  defaultValue={
                    profile?.filingStatus && filingStatusOptions.some((o) => o.value === profile.filingStatus)
                      ? profile.filingStatus
                      : taxModel!.defaultStatus
                  }
                >
                  {filingStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : filingStatusOptions ? (
                <>
                  <input type="hidden" name="filingStatus" value={filingStatusOptions[0].value} />
                  <div className="sub" style={{ padding: "9px 10px" }}>
                    {filingStatusOptions[0].label} — filing status doesn&apos;t change your bracket here.
                  </div>
                </>
              ) : (
                <input type="text" name="filingStatus" defaultValue={profile?.filingStatus ?? ""} placeholder="e.g. Individual" />
              )}
            </div>
            <div className="field">
              <label>{taxModel ? "Override Rate (%) — optional" : "Blended Est. Rate (%)"}</label>
              <input
                type="number"
                name="blendedRatePct"
                step="0.1"
                defaultValue={profile?.blendedRatePct ?? ""}
                placeholder={taxModel ? `auto: ${bracketResult ? bracketResult.effectiveRatePct.toFixed(1) : "—"}%` : "e.g. 29"}
              />
            </div>
            <button type="submit" className="btn btn-ghost">
              Save Filing Region
            </button>
          </form>

          {taxModel ? (
            <div className="sub" style={{ marginTop: 12, lineHeight: 1.5 }}>
              {bracketResult ? (
                <>
                  <strong style={{ color: "var(--text-soft)" }}>
                    Auto-calculated from {fmtUsd(totalIncomeYtd)} logged this year: {bracketResult.effectiveRatePct.toFixed(1)}% effective
                    ({bracketResult.marginalRatePct.toFixed(0)}% marginal bracket).
                  </strong>{" "}
                  {manualRateOverride !== null && "Currently overridden by the rate above."} {taxModel.note}
                </>
              ) : (
                <>Log a payout to see your bracket auto-calculate. {taxModel.note}</>
              )}
            </div>
          ) : (
            <div className="sub" style={{ marginTop: 12 }}>
              Bracket auto-calc isn&apos;t set up for {COUNTRIES.find((c) => c.code === countryCode)?.name ?? countryCode} yet — enter
              your own blended rate above.
            </div>
          )}

          <div className="disclaimer">
            Estimate only, not tax advice — brackets are simplified (see the note above) and any rate you enter yourself is your own
            illustrative placeholder. Confirm actual treatment with a licensed accountant for your country before relying on these
            numbers.
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
            <div className="card card-pad no-print" style={{ marginBottom: 24 }}>
              <div className="sub">No payouts logged yet.</div>
            </div>
          ) : (
            <div className="card card-pad no-print" style={{ marginBottom: 24 }}>
              <h3>Payouts</h3>
              <div className="sub" style={{ marginBottom: 10 }}>
                Every payout, grouped by prop firm — see how much you&apos;ve been paid out from each one.
              </div>
              {groupPayoutsByFirm(payoutRows).map((g) => (
                <PayoutFirmSection key={g.firmName} group={g} />
              ))}
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
                <PayoutAccountSelect initialAccounts={formOptions.accounts} />
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
              <span className="amt money" style={{ color: "var(--good)" }}>
                {fmtUsd2(summary.totalIncome)}
              </span>
            </div>
            {summary.income.length === 0 ? (
              <div className="sub" style={{ padding: "8px 2px" }}>
                No income logged for {year} yet.
              </div>
            ) : (
              summary.income.map((cat) => (
                <details key={cat.categoryName} className="tax-category-block">
                  <summary className="tax-category-head" style={{ cursor: "pointer", listStyle: "none" }}>
                    <span>
                      {cat.categoryName}{" "}
                      <span className="sub" style={{ fontWeight: 400 }}>
                        {cat.lines.length} {cat.lines.length === 1 ? "entry" : "entries"}
                      </span>
                    </span>
                    <span className="amt money">{fmtUsd2(cat.total)}</span>
                  </summary>
                  {cat.lines.map((line) => (
                    <div key={line.id} className="tax-line-row">
                      <span className="desc">
                        {fmtDate(line.date)} {line.description ? `— ${line.description}` : ""}
                      </span>
                      <span className="amt money">{fmtUsd2(line.amount)}</span>
                    </div>
                  ))}
                </details>
              ))
            )}
          </div>

          <div style={{ marginBottom: 8 }}>
            <div className="tax-category-head" style={{ fontSize: 13.5, borderBottom: "1px solid var(--border-soft)", paddingBottom: 8 }}>
              <span>Expenses / Write-offs</span>
              <span className="amt money" style={{ color: "var(--bad)" }}>
                {fmtUsd2(summary.totalExpense)}
              </span>
            </div>
            {summary.expense.length === 0 ? (
              <div className="sub" style={{ padding: "8px 2px" }}>
                No expenses logged for {year} yet.
              </div>
            ) : (
              summary.expense.map((cat) => (
                <details key={cat.categoryName} className="tax-category-block">
                  <summary className="tax-category-head" style={{ cursor: "pointer", listStyle: "none" }}>
                    <span>
                      {cat.categoryName}{" "}
                      <span className="sub" style={{ fontWeight: 400 }}>
                        {cat.lines.length} {cat.lines.length === 1 ? "entry" : "entries"}
                      </span>
                    </span>
                    <span className="amt money">{fmtUsd2(cat.total)}</span>
                  </summary>
                  {cat.lines.map((line) => (
                    <div key={line.id} className="tax-line-row">
                      <span className="desc">
                        {fmtDate(line.date)} {line.description ? `— ${line.description}` : ""}
                      </span>
                      <span className="amt money">{fmtUsd2(line.amount)}</span>
                    </div>
                  ))}
                </details>
              ))
            )}
          </div>

          <div className="tax-net-row">
            <span>Net ({year})</span>
            <span className="amt money" style={{ color: summary.net >= 0 ? "var(--good)" : "var(--bad)" }}>
              {summary.net >= 0 ? "" : "−"}
              {fmtUsd2(Math.abs(summary.net))}
            </span>
          </div>

          {netLossUsd > 0 && (
            <div className="tax-refund-note">
              {taxModel && flatRatePct !== null && refundEstimateUsd !== null ? (
                <>
                  <strong>If you lose more than you gain:</strong> {year}&apos;s logged result was a net loss of{" "}
                  <span className="money">{fmtUsd2(netLossUsd)}</span>. At {countryName}&apos;s flat {flatRatePct.toFixed(1)}% rate on
                  realized losses, that could be worth roughly{" "}
                  <strong className="money">
                    {refundEstimateLocal !== null
                      ? `${fmtLocal(refundEstimateLocal, taxModel.currency)} (~${fmtUsd2(refundEstimateUsd)})`
                      : fmtUsd2(refundEstimateUsd)}
                  </strong>{" "}
                  back — as a lower bill, a refund, or a carried-forward loss, depending on how {countryName} treats trading losses. This
                  uses the flat base rate only (not the blended bracket rate above, since add-on brackets like trinnskatt generally don&apos;t
                  apply to capital losses) and a ballpark exchange rate — confirm the exact figures, any loss limits or carryforward rules,
                  and today&apos;s exchange rate with a licensed tax professional before filing.
                </>
              ) : (
                <>
                  <strong>If you lose more than you gain:</strong> {year}&apos;s logged result was a net loss of{" "}
                  <span className="money">{fmtUsd2(netLossUsd)}</span>. Set a country with bracket auto-calc, or enter an override rate,
                  in Filing Region to estimate what that loss could be
                  worth back on your taxes.
                </>
              )}
            </div>
          )}

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
            <div style={{ marginTop: 16 }}>
              {groupTaxEntriesByCategory(incomeEntries).map((g) => (
                <TaxEntryCategorySection key={g.categoryName} group={g} kind="income" />
              ))}
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
            <div style={{ marginTop: 16 }}>
              {groupTaxEntriesByCategory(expenseEntries).map((g) => (
                <TaxEntryCategorySection key={g.categoryName} group={g} kind="expense" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* -----------------------------------------------------------------
          CSV/PDF import — a generic column-mapped (CSV) or best-effort
          text-scan (PDF) importer (see TaxCsvImport for why this isn't a
          firm-specific one-click import yet).
          ----------------------------------------------------------------- */}
      <div className="card card-pad no-print" style={{ marginTop: 24 }}>
        <h3>Import from a file</h3>
        <div className="sub" style={{ marginBottom: 10 }}>
          Import account purchases/resets, or any income/expense export, from a CSV or PDF file. For a CSV, pick
          which columns are which; for a PDF statement, every date-and-amount line found in the text gets pulled out
          automatically. Either way, review the rows before importing.
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

      {/* -----------------------------------------------------------------
          Receipts — a general holding pen for purchase receipts/invoices.
          Scoped to the same selected `year` as the rest of the page.
          Deliberately NOT part of the printed Tax Year Summary
          (.print-area) — a receipt is a source document, not a ledger
          line, and a browser can't reliably merge an arbitrary uploaded
          PDF/image into that print output anyway. It travels as its own
          companion download instead. A receipt still doesn't HAVE to be
          tied to a logged income/expense line (ReceiptUpload's amount field
          is optional) — but when it is, the "Logged" column below shows it,
          so it's visible at a glance which receipts already count toward
          the expense totals and which are just filed for reference.
          ----------------------------------------------------------------- */}
      <div className="card card-pad no-print" style={{ marginTop: 24 }}>
        <div className="flex items-start justify-between gap-4" style={{ marginBottom: 4 }}>
          <div>
            <h3>Receipts</h3>
            <div className="sub" style={{ marginBottom: 10 }}>
              Drop every receipt/invoice here as you get it — a photo or a PDF — and keep them all on hand for{" "}
              {year}. Fill in the amount to also log it as an expense.
            </div>
          </div>
          {receiptsForYear.length > 0 && (
            <a href={`/api/receipts-pdf?year=${year}`} className="btn btn-ghost" style={{ whiteSpace: "nowrap" }}>
              Download Receipts ({receiptsForYear.length})
            </a>
          )}
        </div>

        <ReceiptUpload expenseCategories={categories.expense} />

        {receiptsForYear.length > 0 && (
          <div className="table-card" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Label</th>
                  <th>File</th>
                  <th>Type</th>
                  <th>Logged</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {receiptsForYear.map((r) => (
                  <tr key={r.id}>
                    <td className="date">{fmtDate(r.date)}</td>
                    <td>{r.label ?? <span className="sub">—</span>}</td>
                    <td className="mono" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.fileName}
                    </td>
                    <td className="mono">{r.contentType === "application/pdf" ? "PDF" : "Image"}</td>
                    <td className={`mono${r.taxEntryId ? " money" : ""}`}>
                      {r.taxEntryId ? `− $${Number(r.taxEntryAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="sub">—</span>}
                    </td>
                    <td>
                      <DeleteReceiptButton id={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* -----------------------------------------------------------------
          Broker statement PnL high/low — for a live account that ran up
          before giving it back (deposit → peak equity → drawdown), the
          deductible loss isn't just "final minus deposit": realized gains
          up to the peak and the realized loss given back after it are two
          separate figures for tax purposes (same gross-gains/gross-losses
          shape as the Norway example this page's refund estimate is built
          on). This reads a broker statement's balance-over-time export,
          finds the peak and the lowest point after it, and logs both as
          tax entries — see BrokerStatementImport for the actual math.
          ----------------------------------------------------------------- */}
      <div className="card card-pad no-print" style={{ marginTop: 24 }}>
        <h3>Broker Statement — PnL High/Low</h3>
        <div className="sub" style={{ marginBottom: 10 }}>
          Upload a balance/equity export from a live account (any CSV with a date column and a balance column) and
          this finds the peak equity it reached and the lowest point afterward — the gains you ran it up to, and the
          loss you gave back, logged as separate entries below instead of just the net change.
        </div>
        <BrokerStatementImport accounts={formOptions.accounts} />
      </div>
    </div>
  );
}
