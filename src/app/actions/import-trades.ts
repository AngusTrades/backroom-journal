"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pairs, trades } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getAccountById } from "@/db/queries";
import { IMPORT_TIME_ZONES, parseTradovatePerformance, type ImportTimeZone } from "@/lib/tradovate";

const MAX_CSV_CHARS = 2_000_000;

export type ImportTradesResult =
  | { error: string }
  | { imported: number; skipped: number; newPairs: string[]; warnings: string[] };

/**
 * Imports a Tradovate Performance CSV into one of the member's accounts.
 * The server re-parses the raw file itself (never trusts the browser's
 * preview), matches or creates the member's pairs, and inserts one journal
 * trade per round trip. Imported trades have $ P&L and outcome but no R
 * until the stop is entered on Edit Trade. Re-importing an overlapping
 * export is safe: trades already in this account are skipped.
 */
export async function importTradovateTrades(input: {
  csv: string;
  accountId: string;
  timeZone: ImportTimeZone;
}): Promise<ImportTradesResult> {
  const user = await requireUser();
  const csv = String(input?.csv ?? "");
  if (!csv.trim()) return { error: "Pick a file first." };
  if (csv.length > MAX_CSV_CHARS) return { error: "That file is too large. Export a shorter date range." };

  const timeZone = IMPORT_TIME_ZONES.some((z) => z.value === input?.timeZone) ? input.timeZone : "UTC";
  const account = await getAccountById(String(input?.accountId ?? ""), user.id);
  if (!account) return { error: "Pick one of your accounts to import into." };

  const parsed = parseTradovatePerformance(csv, timeZone);
  if ("error" in parsed) return { error: parsed.error };

  // Match each contract to the member's own pair list: "NQZ6" matches a pair
  // named NQ (or NQ1 / the full contract), otherwise a new "NQ" pair is made.
  const existing = await db.select().from(pairs).where(eq(pairs.userId, user.id));
  const bySymbol = new Map(existing.map((p) => [p.symbol.toUpperCase(), p.id]));
  const newPairs: string[] = [];
  const pairIdFor = new Map<string, string>();
  for (const t of parsed.trades) {
    if (pairIdFor.has(t.symbol)) continue;
    let id =
      bySymbol.get(t.root) ?? bySymbol.get(`${t.root}1`) ?? bySymbol.get(t.symbol.toUpperCase());
    if (!id) {
      const [row] = await db
        .insert(pairs)
        .values({ userId: user.id, symbol: t.root })
        .onConflictDoNothing()
        .returning({ id: pairs.id });
      id = row?.id;
      if (!id) {
        // Raced with another insert of the same symbol: read it back.
        const again = await db.select().from(pairs).where(eq(pairs.userId, user.id));
        id = again.find((p) => p.symbol.toUpperCase() === t.root)?.id;
      } else newPairs.push(t.root);
      if (!id) return { error: `Couldn't set up the ${t.root} pair. Try again.` };
      bySymbol.set(t.root, id);
    }
    pairIdFor.set(t.symbol, id);
  }

  const inserted = await db
    .insert(trades)
    .values(
      parsed.trades.map((t) => ({
        date: new Date(t.entryAt),
        exitAt: new Date(t.exitAt),
        accountId: account.id,
        pairId: pairIdFor.get(t.symbol)!,
        position: t.position,
        rr: null,
        outcome: t.outcome,
        pnlUsd: t.pnlUsd.toFixed(2),
        entryPrice: String(t.entryPrice),
        exitPrice: String(t.exitPrice),
        contracts: String(t.contracts),
        pointValue: t.pointValue === null ? null : String(t.pointValue),
        source: "tradovate",
        externalId: t.externalId,
      })),
    )
    .onConflictDoNothing({ target: [trades.accountId, trades.externalId] })
    .returning({ id: trades.id });

  const missingPointValue = parsed.trades.filter((t) => t.pointValue === null).map((t) => t.root);
  const warnings = [...parsed.warnings];
  if (missingPointValue.length > 0) {
    warnings.push(
      `Couldn't work out $ per point for ${[...new Set(missingPointValue)].join(", ")}, so R can't be ` +
        "calculated for those trades yet. Their $ P&L is still correct.",
    );
  }

  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${account.id}`);
  revalidatePath("/calendar");

  return {
    imported: inserted.length,
    skipped: parsed.trades.length - inserted.length,
    newPairs,
    warnings,
  };
}
