"use server";

import { db } from "@/db";
import { accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAccountGroupById } from "@/db/queries";

export async function createAccount(formData: FormData) {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "paper") as
    | "prop_firm"
    | "live"
    | "paper"
    | "backtest"
    | "forward_test";
  const firm = String(formData.get("firm") ?? "").trim();
  const sizeUsdRaw = String(formData.get("sizeUsd") ?? "").trim();
  const status = String(formData.get("status") ?? "active") as
    | "active"
    | "passed"
    | "failed"
    | "funded"
    | "closed";
  const startingBalanceRaw = String(formData.get("startingBalance") ?? "").trim();
  const groupIdRaw = String(formData.get("groupId") ?? "").trim();
  // How many identical accounts to create in one go — e.g. 20 separate
  // Apex evals, all the same size/firm/status/group, instead of submitting
  // this form 20 times. Clamped to a sane range; 1 (the default) behaves
  // exactly as a single account always has, name untouched.
  const quantityRaw = String(formData.get("quantity") ?? "1").trim();
  const quantity = Math.max(1, Math.min(100, parseInt(quantityRaw, 10) || 1));

  if (!name) {
    throw new Error("Account name is required");
  }

  // A submitted groupId is only trusted once it's confirmed to be one of
  // this member's own groups — same ownership-check pattern as a submitted
  // pairId/entryModelId on a trade — so a tampered field can't file a new
  // account under someone else's group.
  let groupId: string | null = null;
  if (groupIdRaw) {
    const group = await getAccountGroupById(groupIdRaw, user.id);
    groupId = group?.id ?? null;
  }

  const rows = Array.from({ length: quantity }, (_, i) => ({
    userId: user.id,
    // Only number the name when actually making more than one — a single
    // account still gets exactly the name typed in, no "#1" tacked on.
    name: quantity > 1 ? `${name} #${i + 1}` : name,
    type,
    firm: firm || null,
    sizeUsd: sizeUsdRaw || null,
    status,
    startingBalance: startingBalanceRaw || sizeUsdRaw || "0",
    groupId,
  }));

  await db.insert(accounts).values(rows);

  revalidatePath("/accounts");
  revalidatePath("/add-trade");
  redirect("/accounts");
}

// Called directly from a client component (not via <form action>) so the
// caller can show a confirm dialog first — deleting an account cascades to
// its trades and payouts, so this is destructive and irreversible. Scoped to
// the current user's own accounts — id + userId both have to match, so
// there's no way to delete someone else's account by guessing its id.
// Called directly from a client component (not via <form action>), same
// "+ New X…" pattern as createAccountGroup/createTaxCategory — returns the
// created row so the caller (PayoutAccountSelect, on the Budgeting page's
// "Log a Payout" form) can drop it straight into its own local list and
// select it, without navigating to /accounts or resetting whatever else the
// member has already typed into that form.
//
// Deliberately minimal — just a name (and optional firm), defaulted to
// type "prop_firm" since an account being created specifically to log a
// payout against is almost always a funded prop-firm account rather than a
// paper/backtest one. Every other field (size, status, starting balance,
// group) keeps the schema default; the member can fill those in later from
// the Accounts page if they want the fuller picture there — this is a
// shortcut for "I need an account to attach this payout to right now", not
// a replacement for the full Add Account form. Unlike accountGroups/
// taxCategories, accounts has no unique (userId, name) constraint — a
// member can legitimately have two accounts named the same thing (e.g. two
// separate "Apex 50k" evals) — so this always inserts a fresh row rather
// than reusing one that matches by name.
export async function createAccountQuick(name: string, firm: string) {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return null;

  const [row] = await db
    .insert(accounts)
    .values({
      userId: user.id,
      name: trimmed,
      type: "prop_firm",
      firm: firm.trim() || null,
      status: "active",
      startingBalance: "0",
    })
    .returning();

  return row ?? null;
}

export async function deleteAccount(id: string) {
  const user = await requireUser();
  if (!id) return;
  await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, user.id)));
  revalidatePath("/accounts");
  revalidatePath("/add-trade");
  revalidatePath("/");
  revalidatePath("/analytics");
}

// Soft removal: an account you blew (or that failed eval) drops out of the
// active roster, but its trades and payouts are left completely untouched —
// the Budgeting page tags any of its payouts as coming from a blown account.
export async function markAccountBlown(id: string) {
  const user = await requireUser();
  if (!id) return;
  await db.update(accounts).set({ status: "failed" }).where(and(eq(accounts.id, id), eq(accounts.userId, user.id)));
  revalidatePath("/accounts");
  revalidatePath("/add-trade");
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/budgeting");
}

export async function reactivateAccount(id: string) {
  const user = await requireUser();
  if (!id) return;
  await db.update(accounts).set({ status: "active" }).where(and(eq(accounts.id, id), eq(accounts.userId, user.id)));
  revalidatePath("/accounts");
  revalidatePath("/add-trade");
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/budgeting");
}
