/**
 * Tradovate "Performance" report (Account Reports → Performance → export CSV)
 * → round-trip trades ready to insert into the journal.
 *
 * Pure TypeScript with no server or DB imports, so the import page can run the
 * exact same parse for its preview that the server runs on import.
 *
 * The export has one row per matched lot pair (FIFO): a buy fill and a sell
 * fill, their prices, quantity, $ P&L and timestamps. Example, a short on
 * 2 NQ covered in two pieces:
 *
 *   symbol,...,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration
 *   NQZ6,...,670821350108,670821350062,1,30951.00,30967.50,$330.00,09/23/2026 13:28:02,09/23/2026 13:25:23,...
 *   NQZ6,...,670821350139,670821350062,1,30927.00,30967.50,$810.00,09/23/2026 13:37:26,09/23/2026 13:25:23,...
 *
 * Rows that share a fill (same sellFillId above: one entry, two exits) are
 * one trade. Grouping is by connected fills, so scale-ins (several entry
 * fills, one exit) and scale-outs both collapse into a single trade.
 */

export type ImportTimeZone = "UTC" | "America/New_York" | "Europe/Oslo";

export const IMPORT_TIME_ZONES: { value: ImportTimeZone; label: string }[] = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York" },
  { value: "Europe/Oslo", label: "Oslo" },
];

export type ImportedTrade = {
  /** Stable id for de-duplication: "tradovate:<lowest fill id in the trade>". */
  externalId: string;
  symbol: string; // contract as exported, e.g. "NQZ6"
  root: string; // product without the month/year code, e.g. "NQ"
  position: "long" | "short";
  contracts: number;
  entryPrice: number; // qty-weighted average
  exitPrice: number; // qty-weighted average
  pnlUsd: number;
  outcome: "win" | "loss" | "be";
  entryAt: string; // ISO, UTC
  exitAt: string; // ISO, UTC
  /** $ per 1.00 price move per contract. Null only if it can't be derived
   * from the file and the product isn't in the fallback table. */
  pointValue: number | null;
  rows: number;
};

export type ParseResult = { trades: ImportedTrade[]; warnings: string[] } | { error: string };

// Fallback $/point per contract, used only when a trade's point value can't
// be derived from its own rows (e.g. a scratch trade with no price change).
const POINT_VALUES: Record<string, number> = {
  NQ: 20, MNQ: 2, ES: 50, MES: 5, YM: 5, MYM: 0.5, RTY: 50, M2K: 5,
  GC: 100, MGC: 10, SI: 5000, SIL: 1000, HG: 25000, MHG: 2500,
  CL: 1000, MCL: 100, NG: 10000, QM: 500,
  ZB: 1000, ZN: 1000, ZF: 1000, ZT: 2000,
  "6E": 125000, M6E: 12500, "6B": 62500, M6B: 6250, "6J": 12500000, "6A": 100000, "6C": 100000,
};

const REQUIRED = [
  "symbol", "buyFillId", "sellFillId", "qty", "buyPrice", "sellPrice", "pnl", "boughtTimestamp", "soldTimestamp",
] as const;

/** Minimal RFC-4180 CSV parser: handles quoted fields ("$1,140.00") and
 * doubled quotes; tolerates \r\n. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** "$1,140.00" → 1140, "$(250.00)" / "-$250.00" / "($250.00)" → -250. Returns cents. */
function moneyToCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const negative = s.includes("(") || s.includes("-");
  const n = Number(s.replace(/[$,()\-\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (negative ? -1 : 1);
}

/** Offset (ms) of a time zone from UTC at a given instant. */
function tzOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant;
}

/** "09/23/2026 13:25:23" as wall-clock time in `timeZone` → UTC epoch ms. */
export function parseTimestamp(raw: string, timeZone: ImportTimeZone): number | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(raw);
  if (!m) return null;
  const [, mo, d, y, h, mi, s] = m.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  if (timeZone === "UTC") return wall;
  // Two passes so a wall time right next to a DST switch still lands right.
  let utc = wall - tzOffsetMs(wall, timeZone);
  utc = wall - tzOffsetMs(utc, timeZone);
  return utc;
}

/** "NQZ6" → "NQ", "MNQH27" → "MNQ", "6EZ6" → "6E". Unknown shapes pass through. */
export function contractRoot(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  const m = /^(.+?)[FGHJKMNQUVXZ]\d{1,2}$/.exec(s);
  return m ? m[1] : s;
}

type Row = {
  line: number;
  symbol: string;
  buyFill: string;
  sellFill: string;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  pnlCents: number;
  boughtAt: number;
  soldAt: number;
  position: "long" | "short";
};

function compareIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function parseTradovatePerformance(text: string, timeZone: ImportTimeZone = "UTC"): ParseResult {
  const table = parseCsv(text);
  if (table.length === 0) return { error: "That file is empty." };

  const header = table[0].map((h) => h.trim());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const missing = REQUIRED.filter((c) => col[c] === undefined);
  if (missing.length > 0) {
    return {
      error:
        "This doesn't look like a Tradovate Performance export (missing " +
        missing.join(", ") +
        "). In Tradovate, export it from Account Reports → Performance.",
    };
  }

  const warnings: string[] = [];
  const rows: Row[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const cell = (c: string) => (r[col[c]] ?? "").trim();
    const qty = Number(cell("qty"));
    const buyPrice = Number(cell("buyPrice").replace(/,/g, ""));
    const sellPrice = Number(cell("sellPrice").replace(/,/g, ""));
    const pnlCents = moneyToCents(cell("pnl"));
    const boughtAt = parseTimestamp(cell("boughtTimestamp"), timeZone);
    const soldAt = parseTimestamp(cell("soldTimestamp"), timeZone);
    const buyFill = cell("buyFillId");
    const sellFill = cell("sellFillId");
    if (
      !cell("symbol") || !buyFill || !sellFill || !(qty > 0) || !Number.isFinite(buyPrice) ||
      !Number.isFinite(sellPrice) || pnlCents === null || boughtAt === null || soldAt === null
    ) {
      warnings.push(`Skipped line ${i + 1}: couldn't read it.`);
      continue;
    }
    // Whichever side happened first opened the position. Same-second fills
    // fall back to fill id order (ids increase over time).
    const shortFirst = soldAt !== boughtAt ? soldAt < boughtAt : compareIds(sellFill, buyFill) < 0;
    rows.push({
      line: i + 1, symbol: cell("symbol"), buyFill, sellFill, qty, buyPrice, sellPrice, pnlCents,
      boughtAt, soldAt, position: shortFirst ? "short" : "long",
    });
  }
  if (rows.length === 0) return { error: warnings.length ? "No rows in that file could be read." : "No trades in that file." };

  // Union rows that share a fill (per symbol + direction) into round trips.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const union = (a: string, b: string) => {
    for (const k of [a, b]) if (!parent.has(k)) parent.set(k, k);
    parent.set(find(a), find(b));
  };
  const key = (r: Row, fill: string) => `${r.symbol}|${r.position}|${fill}`;
  for (const r of rows) union(key(r, r.buyFill), key(r, r.sellFill));

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const g = find(key(r, r.buyFill));
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }

  const trades: ImportedTrade[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const short = first.position === "short";
    const contracts = g.reduce((s, r) => s + r.qty, 0);
    const entryPrice = g.reduce((s, r) => s + (short ? r.sellPrice : r.buyPrice) * r.qty, 0) / contracts;
    const exitPrice = g.reduce((s, r) => s + (short ? r.buyPrice : r.sellPrice) * r.qty, 0) / contracts;
    const pnlCents = g.reduce((s, r) => s + r.pnlCents, 0);
    const entryAt = Math.min(...g.map((r) => (short ? r.soldAt : r.boughtAt)));
    const exitAt = Math.max(...g.map((r) => (short ? r.boughtAt : r.soldAt)));
    const minFill = g.flatMap((r) => [r.buyFill, r.sellFill]).sort(compareIds)[0];
    const root = contractRoot(first.symbol);

    // Every row's pnl = (sellPrice - buyPrice) * qty * pointValue, so the
    // point value falls straight out of any row where the price moved.
    let pointValue: number | null = null;
    for (const r of g) {
      const move = (r.sellPrice - r.buyPrice) * r.qty;
      if (Math.abs(move) > 1e-9 && r.pnlCents !== 0) {
        pointValue = Math.round((r.pnlCents / 100 / move) * 10000) / 10000;
        break;
      }
    }
    pointValue ??= POINT_VALUES[root] ?? null;

    trades.push({
      externalId: `tradovate:${minFill}`,
      symbol: first.symbol,
      root,
      position: first.position,
      contracts,
      entryPrice: Math.round(entryPrice * 10000) / 10000,
      exitPrice: Math.round(exitPrice * 10000) / 10000,
      pnlUsd: pnlCents / 100,
      outcome: pnlCents > 0 ? "win" : pnlCents < 0 ? "loss" : "be",
      entryAt: new Date(entryAt).toISOString(),
      exitAt: new Date(exitAt).toISOString(),
      pointValue,
      rows: g.length,
    });
  }

  trades.sort((a, b) => a.entryAt.localeCompare(b.entryAt));
  return { trades, warnings };
}

/** R multiple as a positive magnitude (outcome carries the sign, same as
 * every other R in the journal). Null when the stop gives zero risk. */
export function computeR(input: {
  pnlUsd: number;
  entryPrice: number;
  stopPrice: number;
  pointValue: number;
  contracts: number;
}): number | null {
  const risk = Math.abs(input.entryPrice - input.stopPrice) * input.pointValue * input.contracts;
  if (!(risk > 0)) return null;
  return Math.round((Math.abs(input.pnlUsd) / risk) * 100) / 100;
}
