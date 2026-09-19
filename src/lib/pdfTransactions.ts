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

export async function extractTransactionsFromPdf(data: Uint8Array): Promise<PdfCandidateRow[]> {
  const lines = await extractLines(data);
  return extractCandidateRows(lines);
}
