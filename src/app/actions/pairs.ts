"use server";

import { db } from "@/db";
import { pairs, trades, accounts } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

// Called directly from a client component (not via <form action>), so it can
// return the created row straight to the caller instead of redirecting.
// Mirrors createEntryModel in actions/entry-models.ts. Symbols are stored
// uppercase ("nq" -> "NQ") since that's how everyone actually writes them.
//
// Deliberately does NOT revalidatePath("/add-trade") — PairPicker already
// adds the new row straight into its own local list (see setItems in
// PairPicker.tsx), so nothing on the page needs a server refresh to show
// it. A revalidatePath here used to force the whole Add/Edit Trade page to
// re-render mid-fill, which silently reset every other uncontrolled field
// on the form (Account, Position, Session) back to blank — so adding a
// pair partway through logging a trade could wipe the account you'd
// already picked, with no visible sign anything had changed, until Save
// failed. Both routes are force-dynamic anyway, so a later full page load
// still sees the new pair without this.
export async function createPair(symbol: string) {
  const user = await requireUser();
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed) return null;

  await db.insert(pairs).values({ userId: user.id, symbol: trimmed }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.userId, user.id), eq(pairs.symbol, trimmed)))
    .limit(1);

  return row ?? null;
}

// Unlike entry models (trades.entryModelId is nullable, ON DELETE SET NULL),
// trades.pairId is required — a trade can't exist without a pair. So a pair
// that's already tagged on at least one of this member's trades can't be
// deleted (it would either fail the DB's foreign key or silently orphan
// trade history); the caller only removes it from its list once `deleted`
// comes back true.
export async function deletePair(id: string): Promise<{ deleted: boolean; inUse: boolean }> {
  const user = await requireUser();
  if (!id) return { deleted: false, inUse: false };

  // Ownership check first — a pair only deletes if it's actually this
  // member's own.
  const [owned] = await db.select({ id: pairs.id }).from(pairs).where(and(eq(pairs.id, id), eq(pairs.userId, user.id))).limit(1);
  if (!owned) return { deleted: false, inUse: false };

  const accountIds = (await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, user.id))).map((a) => a.id);
  const inUse =
    accountIds.length > 0 &&
    (await db.select({ id: trades.id }).from(trades).where(and(eq(trades.pairId, id), inArray(trades.accountId, accountIds))).limit(1))
      .length > 0;
  if (inUse) return { deleted: false, inUse: true };

  await db.delete(pairs).where(eq(pairs.id, id));
  // Same reasoning as createPair above — PairPicker removes it from its
  // own local list itself, so no page-wide revalidation is needed (or
  // wanted, since it would reset sibling fields).
  return { deleted: true, inUse: false };
}
