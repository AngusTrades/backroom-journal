// Best-effort transaction extraction from a PDF statement (prop-firm payout
// exports, affiliate/processor statements, etc.) — the PDF sibling of
// TaxCsvImport's CSV parsing. A PDF has no columns to map, so instead of
// asking the member to pick which column is which (the CSV flow), this
// reads every line of text on the page and keeps the ones that contain
// BOTH something date-shaped and something money-shaped, treating whatever
// text is left on that line as the description. It will miss layouts where
// a transaction's date/amount/description are split across visually
// separate columns that don't share a text baseline, and it can't read a
// scanned (image-only) PDF at all since there's no text layer to extract —
// there's no one-click "Apex export" to build against without a real
// sample file, same situation CSV import was in (see TaxCsvImport.tsx).
//
// Runs server-side only (imported from tax.ts, a "use server" file) via
// pdfjs-dist's Node ("legacy") build — deliberately NOT the client/browser
// build, which needs a worker script bundled and served separately. Doing
// this in a server action sidesteps that entirely and keeps the same
// architecture CSV import already uses: parse into {date, amount,
// description} rows, hand them to the same importTaxEntries() insert path.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// Statically imported (not required by path at runtime) specifically so
// Turbopack bundles it normally, like any other import.
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// pdf.js's own Node fallback ("fake worker" — no real worker thread; it
// dynamically imports its worker module in-process to get
// WorkerMessageHandler) looks first for `globalThis.pdfjsWorker` before
// ever trying that dynamic import. Pre-loading the worker ourselves via a
// normal static import and stashing it there short-circuits that lookup
// entirely, which matters here because the dynamic-import fallback path
// ("./pdf.worker.mjs", resolved against pdf.mjs's own location) breaks
// once Turbopack bundles pdf.mjs into a chunk that doesn't have
// pdf.worker.mjs sitting next to it on disk — and require.resolve() of a
// literal string doesn't sidestep this either, since Turbopack statically
// rewrites that too, into an internal module id rather than a real path.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis.pdfjsWorker isn't typed; this is the shape pdf.js's Node fallback expects
(globalThis as any).pdfjsWorker = pdfjsWorker;

export type PdfCandidateRow = { date: string; amount: number; description: string | null };

// Same tolerant parsing as TaxCsvImport.tsx's parseAmount/parseDate — kept
// as a separate copy (not imported) since that file is "use client" and
// this one must stay server-only.
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

const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const DATE_PATTERN = new RegExp(
  `\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}|(?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+(?:${MONTHS})[a-z]*\\.?,?\\s+\\d{4}`,
  "i",
);
// Three shapes, tried in order: parenthesized (accounting-style negative,
// e.g. "($150.00)"), $-prefixed (e.g. "-$45.00", "$2,450.00"), and plain
// (e.g. "1,875.50", "-75.00") — always requiring exactly 2 decimal digits so
// this doesn't snag on account numbers or other bare integers.
const AMOUNT_PATTERN = /\(\$?-?[\d,]+\.\d{2}\)|-?\$\s?[\d,]+\.\d{2}|-?[\d,]+\.\d{2}\b/;

const MAX_ROWS = 5000;

// pdf.js's text items are word/run fragments with x/y positions, not lines
// — this regroups them into reading-order lines by clustering same-baseline
// (rounded y) items per page and joining left-to-right, which is what makes
// a table row ("2026-01-15   $2,450.00   Payout - Bi-weekly") read back as
// one line instead of three disconnected fragments.
async function extractLines(data: Uint8Array): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data, useWorkerFetch: false }).promise;
  const lines: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const bucket = rows.get(y);
      if (bucket) bucket.push({ x, str: item.str });
      else rows.set(y, [{ x, str: item.str }]);
    }
    const sortedYs = [...rows.keys()].sort((a, b) => b - a); // top of page first
    for (const y of sortedYs) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x);
      let line = "";
      for (const p of parts) {
        if (line && !line.endsWith(" ") && !p.str.startsWith(" ")) line += " ";
        line += p.str;
      }
      const cleaned = line.replace(/\s+/g, " ").trim();
      if (cleaned) lines.push(cleaned);
    }
  }
  return lines;
}

// A line counts as a transaction candidate only when it has BOTH a
// date-shaped substring and a money-shaped one — that combination is rare
// enough in headers/footers/balance lines ("Page 1 of 3", "Total: $7,300")
// that requiring both is most of what keeps this from importing garbage,
// without needing per-provider layout knowledge.
function extractCandidateRows(lines: string[]): PdfCandidateRow[] {
  const rows: PdfCandidateRow[] = [];
  for (const line of lines) {
    if (rows.length >= MAX_ROWS) break;
    const dateMatch = line.match(DATE_PATTERN);
    if (!dateMatch) continue;
    const amountMatch = line.match(AMOUNT_PATTERN);
    if (!amountMatch) continue;
    const date = parseDate(dateMatch[0]);
    const amount = parseAmount(amountMatch[0]);
    if (date === null || amount === null || amount === 0) continue;
    let description = line.replace(dateMatch[0], "").replace(amountMatch[0], "").replace(/\s{2,}/g, " ").trim();
    description = description.replace(/^[-–—,:\s]+|[-–—,:\s]+$/g, "").trim();
    rows.push({ date, amount, description: description || null });
  }
  return rows;
}

// Fallback for single-invoice-style PDFs (an Apex/aMember-style receipt,
// not a multi-row ledger statement) where the date and the total sit on
// separate lines — e.g. a "Date: Sep 22, 2026" line up top and a "Total
// $245.00" line down near the bottom, with line items and a subtotal in
// between. extractCandidateRows above requires both on the SAME line by
// design (that's what keeps it from importing headers/footers out of a
// real statement), so a layout like this comes back empty even though the
// PDF has a perfectly readable text layer. Only tried when the per-line
// pass above found nothing — a real multi-row statement should always win
// there, since it's the stricter, safer match.
function extractInvoiceFallbackRow(lines: string[]): PdfCandidateRow | null {
  // Date: prefer a line explicitly labeled "Date:" — steers past an invoice
  // number, phone number, or street address that might otherwise look
  // date-shaped ("2028 E. Ben White Blvd Ste 240-9873" has no date pattern,
  // but a labeled line is still the safer signal in general). Falls back to
  // the first date-shaped substring anywhere on the page.
  let date: string | null = null;
  const labeledDateLine = lines.find((l) => /\bdate\s*:/i.test(l) && DATE_PATTERN.test(l));
  if (labeledDateLine) {
    const m = labeledDateLine.match(DATE_PATTERN);
    if (m) date = parseDate(m[0]);
  }
  if (date === null) {
    for (const line of lines) {
      const m = line.match(DATE_PATTERN);
      if (m) {
        const d = parseDate(m[0]);
        if (d !== null) {
          date = d;
          break;
        }
      }
    }
  }
  if (date === null) return null;

  // Amount: a line that starts with the word "Total" and carries a
  // money-shaped amount is the invoice's actual bottom-line total — not a
  // line item's unit price, and not "Subtotal" (the leading `^\s*` anchor
  // means "total" has to start the line, and there's no word boundary
  // between "Sub" and "total" for \b to land on, so "Subtotal $2,205.00"
  // doesn't match here even though it contains the substring "total").
  let amount: number | null = null;
  const totalLine = lines.find((l) => /^\s*total\b/i.test(l) && AMOUNT_PATTERN.test(l));
  if (totalLine) {
    const m = totalLine.match(AMOUNT_PATTERN);
    if (m) amount = parseAmount(m[0]);
  }
  if (amount === null) {
    // No labeled total line found — fall back to the largest money-shaped
    // amount anywhere on the page, on the assumption that a single-invoice
    // PDF's biggest dollar figure is more likely to be its total than a
    // per-unit price or a discount line.
    let best: number | null = null;
    for (const line of lines) {
      const m = line.match(AMOUNT_PATTERN);
      if (m) {
        const n = parseAmount(m[0]);
        if (n !== null && (best === null || Math.abs(n) > Math.abs(best))) best = n;
      }
    }
    amount = best;
  }
  if (amount === null || amount === 0) return null;

  // No attempt at a description here — picking the right line item out of
  // an arbitrary invoice layout is too fragile to guess at with one sample
  // file to go on. The member sees this row in the import preview with a
  // "—" description (same as any parsed row with nothing left after
  // stripping date+amount) and can double-check it before importing.
  return { date, amount, description: null };
}

export async function extractTransactionsFromPdf(data: Uint8Array): Promise<PdfCandidateRow[]> {
  const lines = await extractLines(data);
  const rows = extractCandidateRows(lines);
  if (rows.length > 0) return rows;
  const fallback = extractInvoiceFallbackRow(lines);
  return fallback ? [fallback] : [];
}
