"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEquitySwingEntries } from "@/app/actions/broker-statement";

type AccountOpt = { id: string; name: string; startingBalance: string | null };
type BalanceRow = { date: Date; balance: number };

// Same hand-rolled CSV parser as TaxCsvImport — kept as its own copy rather
// than imported, same reasoning as pdfTransactions.ts's separate copy of
// parseAmount/parseDate: small, self-contained, and this file has no other
// reason to depend on TaxCsvImport's internals.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[()$,\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return d;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function fmtUsd2(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function BrokerStatementImport({ accounts }: { accounts: AccountOpt[] }) {
  const router = useRouter();
  const inputId = useId();
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [dateCol, setDateCol] = useState("");
  const [balanceCol, setBalanceCol] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function resetFile() {
    setFile(null);
    setHeaders([]);
    setDataRows([]);
    setDateCol("");
    setBalanceCol("");
  }

  async function handleFile(f: File | undefined) {
    setResult(null);
    setPickError(null);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setPickError("That file is too large (5MB max).");
      return;
    }
    const text = await f.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setPickError("Couldn't find a header row plus at least one data row in that file.");
      return;
    }
    resetFile();
    setFile(f);
    setHeaders(rows[0]);
    setDataRows(rows.slice(1));

    const lower = rows[0].map((h) => h.toLowerCase());
    const guess = (needles: string[]) => {
      const idx = lower.findIndex((h) => needles.some((n) => h.includes(n)));
      return idx >= 0 ? rows[0][idx] : "";
    };
    setDateCol(guess(["date", "time"]));
    setBalanceCol(guess(["balance", "equity", "net liq", "netliq"]));
  }

  const dateIdx = headers.indexOf(dateCol);
  const balanceIdx = headers.indexOf(balanceCol);

  const rows: BalanceRow[] = useMemo(() => {
    if (dateIdx < 0 || balanceIdx < 0) return [];
    const parsed = dataRows
      .map((r) => ({ date: parseDate(r[dateIdx] ?? ""), balance: parseAmount(r[balanceIdx] ?? "") }))
      .filter((r): r is BalanceRow => r.date !== null && r.balance !== null);
    return parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [dataRows, dateIdx, balanceIdx]);

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const startingBalance = account ? Number(account.startingBalance ?? "0") : null;

  const swing = useMemo(() => {
    if (startingBalance === null || rows.length === 0) return null;

    let peak = startingBalance;
    let peakRow: BalanceRow | null = null;
    for (const r of rows) {
      if (r.balance > peak) {
        peak = r.balance;
        peakRow = r;
      }
    }
    // Peak never exceeded the starting balance — assume it held from the
    // start of the statement, so "after peak" covers every row.
    const peakDate = peakRow?.date ?? rows[0].date;

    let trough = peak;
    let troughDate = peakDate;
    for (const r of rows) {
      if (r.date.getTime() >= peakDate.getTime() && r.balance < trough) {
        trough = r.balance;
        troughDate = r.date;
      }
    }

    const final = rows[rows.length - 1];
    const gain = Math.round((peak - startingBalance) * 100) / 100;
    const loss = Math.round((peak - trough) * 100) / 100;
    const assumedPeakAtStart = peakRow === null;

    return { peak, peakDate, trough, troughDate, final, gain, loss, assumedPeakAtStart };
  }, [rows, startingBalance]);

  function handleCreate() {
    if (!account || !swing) return;
    startTransition(async () => {
      const res = await createEquitySwingEntries({
        accountId: account.id,
        startingBalance: startingBalance ?? 0,
        peak: swing.peak,
        peakDate: swing.peakDate.toISOString(),
        trough: swing.trough,
        troughDate: swing.troughDate.toISOString(),
      });
      if (res.ok) {
        setResult({
          ok: true,
          message: `Logged ${res.created} entr${res.created === 1 ? "y" : "ies"} for ${account.name}${
            res.gain && res.gain > 0 ? ` — gain ${fmtUsd2(res.gain)}` : ""
          }${res.loss && res.loss > 0 ? `, loss ${fmtUsd2(res.loss)}` : ""}.`,
        });
        resetFile();
        setAccountId("");
        router.refresh();
      } else {
        setResult({ ok: false, message: res.error ?? "Couldn't log those entries." });
      }
    });
  }

  return (
    <div data-testid="broker-statement-import">
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Account</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="" disabled>
            Select…
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {!file ? (
        <label
          htmlFor={inputId}
          className="flex items-center justify-center rounded-[9px] border border-dashed text-[12px] cursor-pointer"
          style={{
            borderColor: dragOver ? "var(--accent-line)" : "var(--border-soft)",
            background: dragOver ? "var(--surface)" : "var(--surface-2)",
            color: dragOver ? "var(--text)" : "var(--text-mute)",
            height: 64,
            textAlign: "center",
            padding: "0 12px",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFile(e.dataTransfer.files?.[0]);
          }}
        >
          Click or drag a balance/equity CSV export here
        </label>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="sub">{file.name}</div>
            <button type="button" className="btn btn-ghost" onClick={resetFile}>
              Remove
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="field">
              <label>Date column</label>
              <select value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
                <option value="" disabled>
                  Select…
                </option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Balance/Equity column</label>
              <select value={balanceCol} onChange={(e) => setBalanceCol(e.target.value)}>
                <option value="" disabled>
                  Select…
                </option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {rows.length === 0 && dateIdx >= 0 && balanceIdx >= 0 && (
            <div className="sub">No rows in that file parsed as a date + a balance — check the columns above.</div>
          )}

          {swing && account && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: "var(--surface-2)",
                border: "1px solid var(--border-soft)",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              <div>
                Starting balance: <strong>{fmtUsd2(startingBalance ?? 0)}</strong>
              </div>
              <div>
                Peak equity: <strong>{fmtUsd2(swing.peak)}</strong> on {fmtDate(swing.peakDate)}
                {swing.assumedPeakAtStart && (
                  <span className="sub"> (never exceeded the starting balance — assumed to hold from the start of this statement)</span>
                )}
              </div>
              <div>
                Trough after peak: <strong>{fmtUsd2(swing.trough)}</strong> on {fmtDate(swing.troughDate)}
              </div>
              <div>
                Final balance in file: <strong>{fmtUsd2(swing.final.balance)}</strong> on {fmtDate(swing.final.date)}
                {swing.final.balance !== swing.trough && (
                  <span className="sub"> — recovered some after bottoming out; the entries below still use the trough, not this final figure</span>
                )}
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-soft)" }}>
                {swing.gain > 0 && (
                  <div style={{ color: "var(--good)" }}>
                    Will log income: {fmtUsd2(swing.gain)} (deposit → peak, dated {fmtDate(swing.peakDate)})
                  </div>
                )}
                {swing.loss > 0 && (
                  <div style={{ color: "var(--bad)" }}>
                    Will log expense: {fmtUsd2(swing.loss)} (peak → trough, dated {fmtDate(swing.troughDate)})
                  </div>
                )}
                {swing.gain <= 0 && swing.loss <= 0 && <div className="sub">Nothing to log from this statement.</div>}
              </div>
            </div>
          )}

          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !account || !swing || (swing.gain <= 0 && swing.loss <= 0)}
              onClick={handleCreate}
            >
              {saving ? "Logging…" : "Create Tax Entries"}
            </button>
          </div>
        </div>
      )}

      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {pickError && (
        <div className="mt-1.5 text-[11px]" style={{ color: "var(--text-mute)" }}>
          {pickError}
        </div>
      )}
      {result && (
        <div className="mt-2 text-[12px]" style={{ color: result.ok ? "var(--good)" : "var(--bad)" }}>
          {result.message}
        </div>
      )}
    </div>
  );
}
