"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { importTaxEntries, extractPdfTransactions } from "@/app/actions/tax";
import { TaxCategorySelect } from "@/components/TaxCategorySelect";

type CategoryOpt = { id: string; name: string };
type ParsedRow = { date: string; amount: number; description: string | null };

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

// Binary-safe File -> base64, chunked so a multi-MB file doesn't blow the
// call stack on String.fromCharCode(...bytes) — used to hand a PDF to the
// extractPdfTransactions server action (see src/lib/pdfTransactions.ts for
// why that extraction runs server-side rather than in the browser).
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const PREVIEW_ROWS = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 4 * 1024 * 1024; // keep in sync with MAX_PDF_BYTES in app/actions/tax.ts

// Generic column-mapped CSV/text-file importer for prop-firm account
// purchases/resets, affiliate/Whop/Lucid payout exports, or anything else
// that comes as a spreadsheet — not a one-click "Apex export" button. No
// real prop-firm export file was available to build a firm-specific parser
// against this round; send August (or a future session) a real sample file
// and a firm-specific one-click importer can be built around its actual
// columns. Until then: pick which column is the date, which is the amount,
// and (optionally) which is the description, and every row that parses
// cleanly gets imported as one entry.
//
// PDFs go a different path: there are no columns to pick, so a dropped PDF
// is sent to extractPdfTransactions (a server action) which reads every
// line of the PDF's text and keeps the ones that look like a transaction
// (a date and an amount on the same line) — best effort, same spirit as the
// CSV path, just no mapping step since there's nothing to map.
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
  const [source, setSource] = useState<"csv" | "pdf" | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [pdfRows, setPdfRows] = useState<ParsedRow[]>([]);
  const [dateCol, setDateCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  const [descCol, setDescCol] = useState("");
  // "auto" (default/recommended): each row's own amount sign decides income
  // vs expense — positive rows file under the income category picked below,
  // negative rows under the expense one. "manual": force every row into one
  // kind regardless of sign (e.g. a cost list that's all positive numbers
  // but every row is still an expense).
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [incomeCategoryId, setIncomeCategoryId] = useState("");
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [importing, setImporting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function resetFile() {
    setFile(null);
    setSource(null);
    setHeaders([]);
    setDataRows([]);
    setPdfRows([]);
    setDateCol("");
    setAmountCol("");
    setDescCol("");
    setCategoryId("");
    setIncomeCategoryId("");
    setExpenseCategoryId("");
    setMode("auto");
  }

  async function handleFile(f: File | undefined) {
    if (extracting) return; // already reading a PDF — ignore a second drop until that resolves
    setResult(null);
    setPickError(null);
    if (!f) return;

    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      if (f.size > MAX_PDF_BYTES) {
        setPickError(`That PDF is too large (${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB max).`);
        return;
      }
      setExtracting(true);
      try {
        const base64 = await fileToBase64(f);
        const res = await extractPdfTransactions(base64);
        if (!res.ok) {
          setPickError(res.error);
          return;
        }
        resetFile();
        setFile(f);
        setSource("pdf");
        setPdfRows(res.rows);
      } catch {
        setPickError("Couldn't read that PDF — try a different file.");
      } finally {
        setExtracting(false);
      }
      return;
    }

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
    setSource("csv");
    setHeaders(rows[0]);
    setDataRows(rows.slice(1));

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

  const { validRows: csvValidRows, invalidCount } = useMemo(() => {
    if (dateIdx < 0 || amountIdx < 0) return { validRows: [] as ParsedRow[], invalidCount: 0 };
    const all = dataRows.map((r) => ({
      date: parseDate(r[dateIdx] ?? ""),
      amount: parseAmount(r[amountIdx] ?? ""),
      description: descIdx >= 0 ? (r[descIdx] ?? "").trim() || null : null,
    }));
    const valid = all.filter((r): r is ParsedRow => r.date !== null && r.amount !== null && r.amount !== 0);
    return { validRows: valid, invalidCount: all.length - valid.length };
  }, [dataRows, dateIdx, amountIdx, descIdx]);

  const validRows = source === "pdf" ? pdfRows : csvValidRows;
  const showPreview = source === "pdf" || (source === "csv" && dateIdx >= 0 && amountIdx >= 0);

  const positiveCount = useMemo(() => validRows.filter((r) => r.amount > 0).length, [validRows]);
  const negativeCount = useMemo(() => validRows.filter((r) => r.amount < 0).length, [validRows]);

  const canImport =
    validRows.length > 0 &&
    (mode === "manual" ? !!categoryId : (positiveCount === 0 || !!incomeCategoryId) && (negativeCount === 0 || !!expenseCategoryId));

  async function handleImport() {
    if (!file || validRows.length === 0 || !canImport) return;
    setImporting(true);
    setResult(null);

    const rowsToImport =
      mode === "manual" ? validRows.map((r) => ({ ...r, amount: kind === "income" ? Math.abs(r.amount) : -Math.abs(r.amount) })) : validRows;
    const categoryIds =
      mode === "manual"
        ? kind === "income"
          ? { income: categoryId }
          : { expense: categoryId }
        : { income: incomeCategoryId || undefined, expense: expenseCategoryId || undefined };

    const res = await importTaxEntries(file.name, rowsToImport, categoryIds);
    setImporting(false);
    if (res.ok) {
      const parts: string[] = [];
      if (res.insertedIncome) parts.push(`${res.insertedIncome} income row${res.insertedIncome === 1 ? "" : "s"}`);
      if (res.insertedExpense) parts.push(`${res.insertedExpense} expense row${res.insertedExpense === 1 ? "" : "s"}`);
      setResult({ ok: true, message: `Imported ${parts.join(" and ")} from ${file.name}.` });
      resetFile();
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
          style={{
            borderColor: dragOver ? "var(--accent-line)" : "var(--border-soft)",
            background: dragOver ? "var(--surface)" : "var(--surface-2)",
            color: dragOver ? "var(--text)" : "var(--text-mute)",
            height: 64,
            textAlign: "center",
            padding: "0 12px",
          }}
          onDragOver={(e) => {
            // Without this, the browser's default is to treat the drop as a
            // navigation (open the file in the tab) rather than firing onDrop
            // at all — this is what made dragging a CSV onto the box do
            // nothing (or blow away the page) instead of importing it.
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
        >
          {extracting
            ? "Reading PDF…"
            : dragOver
              ? "Drop it"
              : "Click or drag a CSV or PDF file here to import (account purchases, payout exports, statements)"}
        </label>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-[12px]" style={{ color: "var(--text-soft)" }}>
            <span className="mono">{file.name}</span> —{" "}
            {source === "pdf"
              ? `${pdfRows.length} transaction${pdfRows.length === 1 ? "" : "s"} found`
              : `${dataRows.length} row${dataRows.length === 1 ? "" : "s"} found`}
          </div>

          <div className="field">
            <label>How should this be categorized?</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "auto" | "manual")}
            >
              <option value="auto">Auto-detect from the amount — positive rows → income, negative → expense (recommended)</option>
              <option value="manual">Import every row as one kind, regardless of sign</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-4">
            {mode === "manual" ? (
              <>
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
              </>
            ) : (
              <>
                {(positiveCount > 0 || validRows.length === 0) && (
                  <div className="field">
                    <label>
                      Income category{" "}
                      {positiveCount > 0 && (
                        <span className="sub" style={{ fontWeight: 400 }}>
                          ({positiveCount} row{positiveCount === 1 ? "" : "s"})
                        </span>
                      )}
                    </label>
                    <TaxCategorySelect
                      kind="income"
                      initialCategories={incomeCategories}
                      value={incomeCategoryId}
                      onChange={setIncomeCategoryId}
                      name="importIncomeCategoryId"
                    />
                  </div>
                )}
                {(negativeCount > 0 || validRows.length === 0) && (
                  <div className="field">
                    <label>
                      Expense category{" "}
                      {negativeCount > 0 && (
                        <span className="sub" style={{ fontWeight: 400 }}>
                          ({negativeCount} row{negativeCount === 1 ? "" : "s"})
                        </span>
                      )}
                    </label>
                    <TaxCategorySelect
                      kind="expense"
                      initialCategories={expenseCategories}
                      value={expenseCategoryId}
                      onChange={setExpenseCategoryId}
                      name="importExpenseCategoryId"
                    />
                  </div>
                )}
              </>
            )}
            {source === "csv" && (
              <>
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
              </>
            )}
          </div>

          {showPreview && (
            <div>
              <div className="text-[12px] mb-1.5" style={{ color: "var(--text-soft)" }}>
                {source === "pdf" ? (
                  <>
                    {validRows.length} row{validRows.length === 1 ? "" : "s"} read from the PDF — this is a
                    best-effort scan of the file&apos;s text, so double-check them below before importing.
                  </>
                ) : (
                  <>
                    {validRows.length} row{validRows.length === 1 ? "" : "s"} look valid
                    {invalidCount > 0 ? `, ${invalidCount} skipped (couldn't read a date or amount — double check the column picks)` : ""}
                    .
                  </>
                )}
              </div>
              {mode === "auto" && positiveCount > 0 && negativeCount > 0 && (
                <div className="text-[12px] mb-1.5" style={{ color: "var(--text-soft)" }}>
                  {positiveCount} row{positiveCount === 1 ? "" : "s"} will be logged as income, {negativeCount} as expense.
                </div>
              )}
              {validRows.length > 0 && (
                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        {mode === "auto" && <th>Type</th>}
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, PREVIEW_ROWS).map((r, i) => (
                        <tr key={i}>
                          <td className="date">{new Date(r.date).toLocaleDateString()}</td>
                          <td className="mono money">${Math.abs(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          {mode === "auto" && (
                            <td className="mono" style={{ color: r.amount > 0 ? "var(--good)" : "var(--bad)" }}>
                              {r.amount > 0 ? "Income" : "Expense"}
                            </td>
                          )}
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
            <button type="button" className="btn btn-primary" disabled={importing || !canImport} onClick={handleImport}>
              {importing ? "Importing…" : `Import ${validRows.length || ""} row${validRows.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetFile}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv,text/plain,.pdf,application/pdf"
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
