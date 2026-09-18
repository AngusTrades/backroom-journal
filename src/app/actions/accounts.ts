"use server";

import { db } from "@/db";
import { accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

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

  if (!name) {
    throw new Error("Account name is required");
  }

  await db.insert(accounts).values({
    userId: user.id,
    name,
    type,
    firm: firm || null,
    sizeUsd: sizeUsdRaw || null,
    status,
    startingBalance: startingBalanceRaw || sizeUsdRaw || "0",
  });

  revalidatePath("/accounts");
  revalidatePath("/add-trade");
  redirect("/accounts");
}

// Called directly from a client component (not via <form action>) so the
// caller can show a confirm dialog first — deleting an account cascades to
// its trades and payouts, so this is destructive and irreversible. Scoped to
// the current user's own accounts — id + userId both have to match, so
// there's no way to delete someone else's account by guessing its id.
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
