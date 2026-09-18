"use server";

import { db } from "@/db";
import { payouts, taxProfile, taxCategories, taxEntries, taxImportBatches } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAccountById, getPayoutById, getTaxCategoryById, getTaxEntryById } from "@/db/queries";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  OTHER: "Other",
};

export async function updateTaxProfile(formData: FormData) {
  const user = await requireUser();

  const countryCode = String(formData.get("countryCode") ?? "US");
  const country = COUNTRY_NAMES[countryCode] ?? countryCode;
  const filingStatus = String(formData.get("filingStatus") ?? "").trim();
  const blendedRatePct = String(formData.get("blendedRatePct") ?? "").trim();

  const existing = await db.select().from(taxProfile).where(eq(taxProfile.userId, user.id)).limit(1);

  if (existing.length > 0) {
    await db
      .update(taxProfile)
      .set({
        country,
        countryCode,
        filingStatus: filingStatus || null,
        blendedRatePct: blendedRatePct || null,
        updatedAt: new Date(),
      })
      .where(eq(taxProfile.id, existing[0].id));
  } else {
    await db.insert(taxProfile).values({
      userId: user.id,
      country,
      countryCode,
      filingStatus: filingStatus || null,
      blendedRatePct: blendedRatePct || null,
    });
  }

  revalidatePath("/budgeting");
  redirect("/budgeting");
}

export async function createPayout(formData: FormData) {
  const user = await requireUser();

  const dateRaw = String(formData.get("date") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  const grossAmountRaw = String(formData.get("grossAmount") ?? "0");
  const setAsidePctRaw = String(formData.get("setAsidePct") ?? "0");
  // Lets a caller (e.g. the account detail page) send the user back to
  // itself instead of always landing on /budgeting.
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/budgeting";

  if (!dateRaw || !accountId) {
    throw new Error("Date and account are required");
  }

  // Same ownership gate as createTrade — a payout can only be logged against
  // an account that actually belongs to the signed-in member.
  const account = await getAccountById(accountId, user.id);
  if (!account) {
    throw new Error("That account doesn't belong to your login.");
  }

  const grossAmount = Number(grossAmountRaw);
  const setAsidePct = Number(setAsidePctRaw) || 0;
  const netAmount = grossAmount - grossAmount * (setAsidePct / 100);

  await db.insert(payouts).values({
    date: new Date(dateRaw),
    accountId,
    grossAmount: grossAmount.toFixed(2),
    netAmount: netAmount.toFixed(2),
    setAsidePct: setAsidePct ? setAsidePct.toFixed(2) : null,
  });

  // A payout is money leaving the trading account, so it moves that
  // account's live current-balance figure and the PnL calendar too — not
  // just the tax page.
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/budgeting");
  revalidatePath("/calendar");
  redirect(returnTo);
}

// Removes a logged payout — undoes its effect on the account's current
// balance, the Budgeting & Tax income total, and the PnL calendar mark, same
// set of pages createPayout touches. This is a plain delete (no soft-delete/
// undo trail like the tax-entry CSV import batches have) since a payout is a
// single manually-logged row, not a multi-row import.
export async function deletePayout(id: string) {
  const user = await requireUser();
  if (!id) return;

  const payout = await getPayoutById(id, user.id);
  if (!payout) return;

  await db.delete(payouts).where(eq(payouts.id, id));

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${payout.accountId}`);
  revalidatePath("/budgeting");
  revalidatePath("/calendar");
}

// ---------------------------------------------------------------------------
// Tax calculator — categories, entries, CSV import. Mirrors the
// pairs/entry-models "+ Add your own" pattern: categories are freeform,
// per-member, named by the member ("Lucid Payout", "Affiliate Payout",
// "Prop Firm Account Purchase", whatever they actually use).
// ---------------------------------------------------------------------------

// Called directly from a client component (TaxCategorySelect), same pattern
// as createPair/createEntryModel — returns the created row so the caller can
// add it straight into its own local list instead of a page-wide refresh.
export async function createTaxCategory(kind: "income" | "expense", name: string) {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return null;

  await db.insert(taxCategories).values({ userId: user.id, kind, name: trimmed }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(taxCategories)
    .where(and(eq(taxCategories.userId, user.id), eq(taxCategories.kind, kind), eq(taxCategories.name, trimmed)))
    .limit(1);

  return row ?? null;
}

export async function deleteTaxCategory(id: string): Promise<{ deleted: boolean; inUse: boolean }> {
  const user = await requireUser();
  if (!id) return { deleted: false, inUse: false };

  const owned = await getTaxCategoryById(id, user.id);
  if (!owned) return { deleted: false, inUse: false };

  const [used] = await db.select({ id: taxEntries.id }).from(taxEntries).where(eq(taxEntries.categoryId, id)).limit(1);
  if (used) return { deleted: false, inUse: true };

  await db.delete(taxCategories).where(eq(taxCategories.id, id));
  return { deleted: true, inUse: false };
}

// Expected/validation errors modeled as a return value (Next 16's documented
// pattern), same as TradeFormState in actions/trades.ts — a missing category
// or a bad amount shows inline on the form instead of a crash screen.
export type TaxEntryFormState = { error?: string };

export async function createTaxEntry(_prevState: TaxEntryFormState, formData: FormData): Promise<TaxEntryFormState> {
  const user = await requireUser();

  const kind = String(formData.get("kind") ?? "") as "income" | "expense";
  const categoryId = String(formData.get("categoryId") ?? "");
  const dateRaw = String(formData.get("date") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;

  if (kind !== "income" && kind !== "expense") return { error: "Something went wrong with that form — refresh and try again." };
  if (!dateRaw) return { error: "Pick a date." };
  if (!categoryId) return { error: `Pick a category — use "+ New category" below if you haven't added one yet.` };

  const category = await getTaxCategoryById(categoryId, user.id);
  if (!category || category.kind !== kind) {
    return { error: "That category doesn't belong to your login." };
  }

  const amount = Math.abs(Number(amountRaw));
  if (!amountRaw || !Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter an amount greater than $0." };
  }

  await db.insert(taxEntries).values({
    userId: user.id,
    kind,
    categoryId,
    date: new Date(dateRaw),
    amount: amount.toFixed(2),
    description,
    source: "manual",
  });

  revalidatePath("/budgeting");
  return {};
}

export async function deleteTaxEntry(id: string) {
  const user = await requireUser();
  if (!id) return;
  const entry = await getTaxEntryById(id, user.id);
  if (!entry) return;
  await db.delete(taxEntries).where(eq(taxEntries.id, id));
  revalidatePath("/budgeting");
}

// CSV/text-file import — a generic column-mapped importer (date/amount/
// description columns, one kind + one category for the whole file), not a
// firm-specific one-click import. No real prop-firm export file was
// available to build or test a firm-specific parser against, so this is the
// safer, working starting point: any CSV a prop firm (or Lucid/Whop/an
// affiliate dashboard) exports can be pointed at it by picking which columns
// mean what. Parsing itself happens client-side in TaxCsvImport.tsx; this
// action just receives the already-parsed rows and writes them.
export async function importTaxEntries(
  kind: "income" | "expense",
  categoryId: string,
  filename: string,
  rows: { date: string; amount: number; description: string | null }[],
): Promise<{ ok: boolean; error?: string; inserted?: number }> {
  const user = await requireUser();

  if (kind !== "income" && kind !== "expense") return { ok: false, error: "Invalid import type." };
  const category = await getTaxCategoryById(categoryId, user.id);
  if (!category || category.kind !== kind) return { ok: false, error: "That category doesn't belong to your login." };
  if (rows.length === 0) return { ok: false, error: "Nothing to import — no valid rows were found in that file." };
  if (rows.length > 5000) return { ok: false, error: "That file has more than 5,000 rows — split it up and import in batches." };

  const [batch] = await db
    .insert(taxImportBatches)
    .values({ userId: user.id, filename: filename.slice(0, 200), kind, rowCount: rows.length })
    .returning({ id: taxImportBatches.id });

  await db.insert(taxEntries).values(
    rows.map((r) => ({
      userId: user.id,
      kind,
      categoryId,
      date: new Date(r.date),
      amount: Math.abs(r.amount).toFixed(2),
      description: r.description,
      source: "import",
      importBatchId: batch.id,
    })),
  );

  revalidatePath("/budgeting");
  return { ok: true, inserted: rows.length };
}

// Deleting a batch cascades to its entries (tax_entries.import_batch_id,
// onDelete: "cascade") — a bad import (wrong column mapping, wrong
// category) undoes in one click without hand-picking rows.
export async function deleteImportBatch(id: string) {
  const user = await requireUser();
  if (!id) return;
  const [owned] = await db
    .select({ id: taxImportBatches.id })
    .from(taxImportBatches)
    .where(and(eq(taxImportBatches.id, id), eq(taxImportBatches.userId, user.id)))
    .limit(1);
  if (!owned) return;
  await db.delete(taxImportBatches).where(eq(taxImportBatches.id, id));
  revalidatePath("/budgeting");
}
