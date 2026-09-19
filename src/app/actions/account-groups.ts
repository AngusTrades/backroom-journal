"use server";

import { db } from "@/db";
import { accountGroups, accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getAccountById, getAccountGroupById } from "@/db/queries";

// Called directly from a client component (not via <form action>), same
// "+ New X…" pattern as createEntryModel/createPair/createTaxCategory —
// returns the created row so the caller can drop it straight into its own
// local list.
//
// Deliberately does NOT revalidatePath when called from the Add Account
// form's inline "+ New group…" picker (AccountGroupSelect) — the Add
// Account form is a plain uncontrolled <form action={createAccount}>, and a
// page-wide revalidation mid-fill would reset every other field the member
// has already typed (the same React-auto-reset gotcha documented on
// createEntryModel/createPair). AccountGroupControl (the accounts-page/
// account-detail reassignment control) also calls this for its own
// "+ New group…" option, where the same caution isn't strictly necessary but
// costs nothing to keep consistent.
export async function createAccountGroup(name: string) {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return null;

  await db.insert(accountGroups).values({ userId: user.id, name: trimmed }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(accountGroups)
    .where(and(eq(accountGroups.userId, user.id), eq(accountGroups.name, trimmed)))
    .limit(1);

  return row ?? null;
}

export async function renameAccountGroup(id: string, name: string) {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!id || !trimmed) return { ok: false, error: "Enter a name." };

  const owned = await getAccountGroupById(id, user.id);
  if (!owned) return { ok: false, error: "That group doesn't belong to your login." };
  if (trimmed === owned.name) return { ok: true };

  try {
    await db.update(accountGroups).set({ name: trimmed }).where(eq(accountGroups.id, id));
  } catch {
    // Unique (userId, name) violation — already have a group by that name.
    return { ok: false, error: `You already have a group called "${trimmed}".` };
  }

  revalidatePath("/accounts");
  return { ok: true };
}

// Deleting a group doesn't touch the accounts in it — `accounts.groupId`'s
// FK (onDelete: "set null") just drops them back into "Ungrouped", same
// treatment as deleting an entry model clearing the tag off past trades
// rather than deleting the trades themselves.
export async function deleteAccountGroup(id: string) {
  const user = await requireUser();
  if (!id) return;
  const owned = await getAccountGroupById(id, user.id);
  if (!owned) return;
  await db.delete(accountGroups).where(eq(accountGroups.id, id));
  revalidatePath("/accounts");
}

// Reassigns one account to a group (or back to "Ungrouped" when groupId is
// null) — the quick per-card/detail-page control, not a full account edit.
// A null groupId is always allowed (leaving a group); a non-null one is
// checked against this member's own groups so a tampered field can't file
// an account under someone else's group id.
export async function setAccountGroup(accountId: string, groupId: string | null) {
  const user = await requireUser();
  if (!accountId) return;

  const account = await getAccountById(accountId, user.id);
  if (!account) return;

  if (groupId) {
    const group = await getAccountGroupById(groupId, user.id);
    if (!group) return;
  }

  await db.update(accounts).set({ groupId }).where(eq(accounts.id, accountId));
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
}
