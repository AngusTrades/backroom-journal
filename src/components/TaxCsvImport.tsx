"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { importTaxEntries } from "@/app/actions/tax";
import { TaxCategorySelect } from "@/components/TaxCategorySelect";

type CategoryOpt = { id: string; name: string };

// Hand-rolled CSV parser (no new dependency, same philosophy as the News
// feed's hand-written XML parser) — handles quoted fields with embedded
// commas/newlines, which a plain text.split(",") would mangle.
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

// Handles "$1,234.50", "1234.50", and accounting-style "(450.00)" for a
// negative — common across prop-firm/payment-processor exports.
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[()$,\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

const PREVIEW_ROWS = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Generic column-mapped CSV/text-file importer for prop-firm account
// purchases/resets, affiliate/Whop/Lucid payout exports, or anything else
// that comes as a spreadsheet — not a one-click "Apex export" button. No
// real prop-firm export file was available to build a firm-specific parser
// against this round; send August (or a future session) a real sample file
// and a firm-specific one-click importer can be built around its actual
// columns. Until then: pick which column is the date, which is the amount,
// and (optionally) which is the description, and every row that parses
// cleanly gets imported as one entry.
export function TaxCsvImport({
  incomeCategories,
  expenseCategories,
}: {
  incomeCategories: CategoryOpt[];
  expenseCategories: CategoryOpt[];
}) {
  const router = useRouter();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [dateCol, setDateCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [importing, setImporting] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

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
    setFile(f);
    setHeaders(rows[0]);
    setDataRows(rows.slice(1));
    setCategoryId("");

    const lower = rows[0].map((h) => h.toLowerCase());
    const guess = (needles: string[]) => {
      const idx = lower.findIndex((h) => needles.some((n) => h.includes(n)));
      return idx >= 0 ? rows[0][idx] : "";
    };
    setDateCol(guess(["date"]));
    setAmountCol(guess(["amount", "total", "price", "cost"]));
    setDescCol(guess(["desc", "memo", "note", "item", "name"]));
  }

  const dateIdx = headers.indexOf(dateCol);
  const amountIdx = headers.indexOf(amountCol);
  const descIdx = headers.indexOf(descCol);

  const { validRows, invalidCount } = useMemo(() => {
    if (dateIdx < 0 || amountIdx < 0) return { validRows: [] as { date: string; amount: number; description: string | null }[], invalidCount: 0 };
    const all = dataRows.map((r) => ({
      date: parseDate(r[dateIdx] ?? ""),
      amount: parseAmount(r[amountIdx] ?? ""),
      description: descIdx >= 0 ? (r[descIdx] ?? "").trim() || null : null,
    }));
    const valid = all.filter((r): r is { date: string; amount: number; description: string | null } => r.date !== null && r.amount !== null && r.amount !== 0);
    return { validRows: valid, invalidCount: all.length - valid.length };
  }, [dataRows, dateIdx, amountIdx, descIdx]);

  async function handleImport() {
    if (!file || !categoryId || validRows.length === 0) return;
    setImporting(true);
    setResult(null);
    const res = await importTaxEntries(kind, categoryId, file.name, validRows);
    setImporting(false);
    if (res.ok) {
      setResult({ ok: true, message: `Imported ${res.inserted} row${res.inserted === 1 ? "" : "s"} from ${file.name}.` });
      setFile(null);
      setHeaders([]);
      setDataRows([]);
      setDateCol("");
      setAmountCol("");
      setDescCol("");
      setCategoryId("");
      router.refresh();
    } else {
      setResult({ ok: false, message: res.error ?? "Import failed." });
    }
  }

  return (
    <div data-testid="tax-csv-import">
      {!file ? (
        <label
          htmlFor={inputId}
          className="flex items-center justify-center rounded-[9px] border border-dashed text-[12px] cursor-pointer"
          style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)", color: "var(--text-mute)", height: 64 }}
        >
          Click to pick a CSV file to import (account purchases, payout exports, anything spreadsheet-shaped)
        </label>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-[12px]" style={{ color: "var(--text-soft)" }}>
            <span className="mono">{file.name}</span> — {dataRows.length} row{dataRows.length === 1 ? "" : "s"} found
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-4">
            <div className="field">
              <label>Import as</label>
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as "income" | "expense");
                  setCategoryId("");
                }}
              >
                <option value="expense">Expense / write-off</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="field">
              <label>Category</label>
              <TaxCategorySelect
                kind={kind}
                initialCategories={kind === "income" ? incomeCategories : expenseCategories}
                value={categoryId}
                onChange={setCategoryId}
                name="importCategoryId"
              />
            </div>
            <div className="field">
              <label>Date column</label>
              <select value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
                <option value="">Select…</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Amount column</label>
              <select value={amountCol} onChange={(e) => setAmountCol(e.target.value)}>
                <option value="">Select…</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Description column (optional)</label>
              <select value={descCol} onChange={(e) => setDescCol(e.target.value)}>
                <option value="">None</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {dateIdx >= 0 && amountIdx >= 0 && (
            <div>
              <div className="text-[12px] mb-1.5" style={{ color: "var(--text-soft)" }}>
                {validRows.length} row{validRows.length === 1 ? "" : "s"} look valid
                {invalidCount > 0 ? `, ${invalidCount} skipped (couldn't read a date or amount — double check the column picks)` : ""}.
              </div>
              {validRows.length > 0 && (
                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, PREVIEW_ROWS).map((r, i) => (
                        <tr key={i}>
                          <td className="date">{new Date(r.date).toLocaleDateString()}</td>
                          <td className="mono money">${Math.abs(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="mono">{r.description ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validRows.length > PREVIEW_ROWS && (
                    <div className="p-2 text-[11px]" style={{ color: "var(--text-mute)" }}>
                      + {validRows.length - PREVIEW_ROWS} more row{validRows.length - PREVIEW_ROWS === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={importing || !categoryId || validRows.length === 0}
              onClick={handleImport}
            >
              {importing ? "Importing…" : `Import ${validRows.length || ""} row${validRows.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setFile(null);
                setHeaders([]);
                setDataRows([]);
                setResult(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {pickError && (
        <div className="mt-1.5 text-[11px]" style={{ color: "var(--text-mute)" }}>
          {pickError}
        </div>
      )}
      {result && (
        <div className={`mt-2 text-[12px] ${result.ok ? "" : "form-error"}`} style={result.ok ? { color: "var(--good)" } : undefined}>
          {result.message}
        </div>
      )}
    </div>
  );
}
