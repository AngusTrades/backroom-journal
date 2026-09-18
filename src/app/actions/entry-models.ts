"use server";

import { db } from "@/db";
import { entryModels } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

// Called directly from a client component (not via <form action>), so it can
// return the created row straight to the caller instead of redirecting.
// Mirrors createSetup in actions/setups.ts.
//
// Deliberately does NOT revalidatePath("/add-trade") — see the same note on
// createPair in actions/pairs.ts. EntryModelPicker already adds the new row
// into its own local list, and a page-wide revalidation here used to
// silently reset every other uncontrolled field on the Add/Edit Trade form
// (Account, Position, Session) mid-fill.
export async function createEntryModel(name: string) {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return null;

  await db.insert(entryModels).values({ userId: user.id, name: trimmed }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(entryModels)
    .where(and(eq(entryModels.userId, user.id), eq(entryModels.name, trimmed)))
    .limit(1);

  return row ?? null;
}

export async function deleteEntryModel(id: string) {
  const user = await requireUser();
  if (!id) return;
  // Ownership check first — an entry model only deletes if it's actually
  // this member's own.
  const [owned] = await db.select({ id: entryModels.id }).from(entryModels).where(and(eq(entryModels.id, id), eq(entryModels.userId, user.id))).limit(1);
  if (!owned) return;
  // Any past trades tagged with this entry model keep the trade itself —
  // the FK (trades.entryModelId, onDelete: "set null") just clears the tag
  // rather than blocking the delete or touching trade history.
  await db.delete(entryModels).where(eq(entryModels.id, id));
}
