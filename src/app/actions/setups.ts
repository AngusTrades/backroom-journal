"use server";

import { db } from "@/db";
import { setups, tradeSetups } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

// Called directly from a client component (not via <form action>), so it can
// return the created row straight to the caller instead of redirecting.
//
// Deliberately does NOT revalidatePath("/add-trade") — see the same note on
// createPair in actions/pairs.ts. ConfluencePicker already adds the new row
// into its own local list, and a page-wide revalidation here used to
// silently reset every other uncontrolled field on the Add/Edit Trade form
// (Account, Position, Session) mid-fill.
export async function createSetup(name: string) {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return null;

  await db.insert(setups).values({ userId: user.id, name: trimmed }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(setups)
    .where(and(eq(setups.userId, user.id), eq(setups.name, trimmed)))
    .limit(1);

  return row ?? null;
}

export async function deleteSetup(id: string) {
  const user = await requireUser();
  if (!id) return;
  // Ownership check first — a setup only deletes if it's actually this
  // member's own (and only their own trade_setups links get cleaned up).
  const [owned] = await db.select({ id: setups.id }).from(setups).where(and(eq(setups.id, id), eq(setups.userId, user.id))).limit(1);
  if (!owned) return;
  await db.delete(tradeSetups).where(eq(tradeSetups.setupId, id));
  await db.delete(setups).where(eq(setups.id, id));
}
