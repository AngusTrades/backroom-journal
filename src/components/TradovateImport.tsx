"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { importTradovateTrades, type ImportTradesResult } from "@/app/actions/import-trades";
import { IMPORT_TIME_ZONES, parseTradovatePerformance, type ImportTimeZone } from "@/lib/tradovate";

const PREF_KEY = "backroom-tradovate-import";

function money(n: number) {
  return `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TradovateImport({ accounts }: { accounts: { id: string; name: string }[] }) {
  const fileId = useId();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [timeZone, setTimeZone] = useState<ImportTimeZone>("UTC");
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportTradesResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Remember the last account + time zone used, per browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage after mount
      if (accounts.some((a) => a.id === saved.accountId)) setAccountId(saved.accountId);
      if (IMPORT_TIME_ZONES.some((z) => z.value === saved.timeZone)) setTimeZone(saved.timeZone);
    } catch {}
  }, [accounts]);
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ accountId, timeZone }));
    } catch {}
  }, [accountId, timeZone]);

  // Same parser the server uses, so the preview is exactly what gets imported.
  const preview = useMemo(() => (csv ? parseTradovatePerformance(csv, timeZone) : null), [csv, timeZone]);
  const fmtTime = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    [timeZone],
  );

  async function pickFile(file: File | undefined) {
    setResult(null);
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
  }

  function runImport() {
    setResult(null);
    startTransition(async () => {
      const res = await importTradovateTrades({ csv, accountId, timeZone });
      setResult(res);
      if (!("error" in res)) {
        setCsv("");
        setFileName(null);
      }
    });
  }

  const trades = preview && !("error" in preview) ? preview.trades : [];
  const net = trades.reduce((s, t) => s + t.pnlUsd, 0);

  if (accounts.length === 0) {
    return (
      <div className="card card-pad">
        <div className="sub">
          You need an account to import into. <Link href="/accounts" className="link">Add one on Accounts →</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="grid gap-3.5 md:grid-cols-3">
          <div className="field">
            <label htmlFor="importAccount">Import into account</label>
            <select id="importAccount" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="importTz">Times in the file are in</label>
            <select id="importTz" value={timeZone} onChange={(e) => setTimeZone(e.target.value as ImportTimeZone)}>
              {IMPORT_TIME_ZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={fileId}>Tradovate Performance CSV</label>
            <input
              id={fileId}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="sub" style={{ marginTop: 10 }}>
          In Tradovate: Account Reports → Performance → pick the dates → export CSV. Times must match your platform&apos;s
          time zone setting. Re-importing overlapping dates is safe: trades already in this account are skipped. $ P&amp;L is
          as Tradovate reports it, before commissions.
        </div>
      </div>

      {result && "error" in result && <div className="form-error" style={{ marginBottom: 16 }}>{result.error}</div>}
      {result && !("error" in result) && (
        <div className="card card-pad import-done" style={{ marginBottom: 16 }}>
          <div>
            <strong>
              Imported {result.imported} trade{result.imported === 1 ? "" : "s"}
            </strong>
            {result.skipped > 0 && <> · {result.skipped} already in your journal (skipped)</>}
            {result.newPairs.length > 0 && <> · added pair{result.newPairs.length === 1 ? "" : "s"} {result.newPairs.join(", ")}</>}
          </div>
          {result.warnings.map((w) => (
            <div key={w} className="sub">
              {w}
            </div>
          ))}
          {result.imported > 0 && (
            <div className="sub" style={{ marginTop: 6 }}>
              Next: open each one on the Journal (marked <span className="badge needs">Add stop</span>) to add your stop,
              confluences and notes.{" "}
              <Link href="/" className="link">
                Go to Journal →
              </Link>
            </div>
          )}
        </div>
      )}

      {preview && "error" in preview && <div className="form-error" style={{ marginBottom: 16 }}>{preview.error}</div>}

      {trades.length > 0 && (
        <>
          <div className="card card-pad" style={{ marginBottom: 12 }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 style={{ margin: 0 }}>
                  {trades.length} trade{trades.length === 1 ? "" : "s"} in {fileName}
                </h3>
                <div className="sub">
                  Net{" "}
                  <span className={`pnl ${net >= 0 ? "good" : "bad"}`} style={{ fontWeight: 600 }}>
                    {money(net)}
                  </span>
                  {preview && !("error" in preview) && preview.warnings.length > 0 && <> · {preview.warnings.join(" ")}</>}
                </div>
              </div>
              <button type="button" className="btn btn-primary" onClick={runImport} disabled={pending || !accountId}>
                {pending ? "Importing…" : `Import ${trades.length} trade${trades.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Contract</th>
                  <th>Side</th>
                  <th className="num">Qty</th>
                  <th className="num">Entry</th>
                  <th className="num">Avg exit</th>
                  <th className="num">P&amp;L</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.externalId}>
                    <td className="mono">{fmtTime.format(new Date(t.entryAt))}</td>
                    <td className="mono">
                      {t.symbol}
                      {t.rows > 1 && <span className="sub"> · {t.rows} fills combined</span>}
                    </td>
                    <td>{t.position === "long" ? "Long" : "Short"}</td>
                    <td className="num mono">{t.contracts}</td>
                    <td className="num mono">{t.entryPrice.toLocaleString()}</td>
                    <td className="num mono">{t.exitPrice.toLocaleString()}</td>
                    <td className={`num mono pnl money ${t.pnlUsd >= 0 ? "good" : "bad"}`}>{money(t.pnlUsd)}</td>
                    <td>
                      <span className={`badge ${t.outcome}`}>
                        {t.outcome === "win" ? "WIN" : t.outcome === "loss" ? "LOSS" : "B/E"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
