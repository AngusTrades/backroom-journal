"use server";

import { db } from "@/db";
import { payouts, taxProfile, taxCategories, taxEntries, taxImportBatches } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAccountById, getPayoutById, getTaxCategoryById, getTaxEntryById } from "@/db/queries";
import { extractTransactionsFromPdf, type PdfCandidateRow } from "@/lib/pdfTransactions";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  CH: "Switzerland",
  IE: "Ireland",
  ES: "Spain",
  IT: "Italy",
  IN: "India",
  NG: "Nigeria",
  ZA: "South Africa",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  SG: "Singapore",
  ID: "Indonesia",
  PH: "Philippines",
  MY: "Malaysia",
  NO: "Norway",
  RU: "Russia",
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

// The bulk counterpart to deleteTaxCategory above — that one refuses when
// the category has entries in it (protecting against an accidental empty
// click), this one is the deliberate "scrap the whole thing" action: deletes
// every tax entry filed under this category, then the category itself, in
// one shot instead of clearing it out one DeleteTaxEntryButton click at a
// time. Scoped to categories owned by this member, same ownership gate as
// every other tax action. Any import batch those entries came from is left
// alone (its rowCount can end up stale) — the same simplification a single
// deleteTaxEntry call already accepts; "Account Payouts" isn't a real
// taxCategories row (it's synthesized from the payouts table in
// summarizeTaxYear), so it can never reach this action in the first place.
export async function deleteTaxCategoryWithEntries(id: string): Promise<{ ok: boolean; deletedCount?: number }> {
  const user = await requireUser();
  if (!id) return { ok: false };

  const category = await getTaxCategoryById(id, user.id);
  if (!category) return { ok: false };

  const deletedRows = await db
    .delete(taxEntries)
    .where(and(eq(taxEntries.categoryId, id), eq(taxEntries.userId, user.id)))
    .returning({ id: taxEntries.id });
  await db.delete(taxCategories).where(eq(taxCategories.id, id));

  revalidatePath("/budgeting");
  return { ok: true, deletedCount: deletedRows.length };
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
// PDF sibling of the CSV path above — same destination shape ({date,
// amount, description} rows handed to importTaxEntries below), different
// source parsing since a PDF has no columns to map. See
// src/lib/pdfTransactions.ts for how the rows get pulled out. Runs the
// (somewhat heavier) PDF text extraction in a server action rather than in
// the browser — see that file's header comment for why.
const MAX_PDF_BYTES = 4 * 1024 * 1024; // base64-encoded, this is ~5.4MB over the wire — see serverActions.bodySizeLimit in next.config.ts

export async function extractPdfTransactions(
  base64: string,
): Promise<{ ok: true; rows: PdfCandidateRow[] } | { ok: false; error: string }> {
  await requireUser();

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  } catch {
    return { ok: false, error: "Couldn't read that file." };
  }
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return { ok: false, error: `That PDF is too large (${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB max).` };
  }

  let rows: PdfCandidateRow[];
  try {
    rows = await extractTransactionsFromPdf(bytes);
  } catch {
    return { ok: false, error: "Couldn't read that PDF — it may be password-protected or corrupted." };
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error:
        "Couldn't find any date-and-amount lines in that PDF. It might be a scanned/image-only statement (no selectable text), or a layout this can't parse yet — you can still add entries by hand below.",
    };
  }

  return { ok: true, rows };
}

// Splits the parsed rows by the sign of their amount — positive rows become
// income, negative rows become expense — instead of forcing the whole file
// into one kind the member has to pick up front. This is what makes
// TaxCsvImport's "auto-detect" mode work: a payout/ledger export that nets
// out fees and refunds per line (positive for money in, negative for money
// out) gets filed correctly without the member re-running the import twice
// or ending up with an all-expense file just because that was whichever
// option the kind dropdown happened to be on. A file the member wants
// forced into one kind regardless of sign (TaxCsvImport's "manual" mode —
// e.g. a cost list that's all positive numbers but is still every row an
// expense) pre-flips every row's sign client-side before calling this, so
// it still lands entirely in one bucket here.
// Up to two import batches get created (one per kind actually present) —
// each independently undoable via the existing UndoImportBatchButton, same
// as a single-kind import always was; a file that turns out to be all one
// sign still produces just the one batch it always did.
export async function importTaxEntries(
  filename: string,
  rows: { date: string; amount: number; description: string | null }[],
  categoryIds: { income?: string; expense?: string },
): Promise<{ ok: boolean; error?: string; insertedIncome?: number; insertedExpense?: number }> {
  const user = await requireUser();

  if (rows.length === 0) return { ok: false, error: "Nothing to import — no valid rows were found in that file." };
  if (rows.length > 5000) return { ok: false, error: "That file has more than 5,000 rows — split it up and import in batches." };

  const incomeRows = rows.filter((r) => r.amount > 0);
  const expenseRows = rows.filter((r) => r.amount < 0);

  if (incomeRows.length > 0 && !categoryIds.income) {
    return { ok: false, error: "Pick a category for the income rows." };
  }
  if (expenseRows.length > 0 && !categoryIds.expense) {
    return { ok: false, error: "Pick a category for the expense rows." };
  }

  let incomeCategory: Awaited<ReturnType<typeof getTaxCategoryById>> | null = null;
  let expenseCategory: Awaited<ReturnType<typeof getTaxCategoryById>> | null = null;
  if (categoryIds.income) {
    incomeCategory = await getTaxCategoryById(categoryIds.income, user.id);
    if (!incomeCategory || incomeCategory.kind !== "income") {
      return { ok: false, error: "That income category doesn't belong to your login." };
    }
  }
  if (categoryIds.expense) {
    expenseCategory = await getTaxCategoryById(categoryIds.expense, user.id);
    if (!expenseCategory || expenseCategory.kind !== "expense") {
      return { ok: false, error: "That expense category doesn't belong to your login." };
    }
  }

  let insertedIncome = 0;
  let insertedExpense = 0;

  if (incomeRows.length > 0 && incomeCategory) {
    const [batch] = await db
      .insert(taxImportBatches)
      .values({ userId: user.id, filename: filename.slice(0, 200), kind: "income", rowCount: incomeRows.length })
      .returning({ id: taxImportBatches.id });
    await db.insert(taxEntries).values(
      incomeRows.map((r) => ({
        userId: user.id,
        kind: "income" as const,
        categoryId: incomeCategory.id,
        date: new Date(r.date),
        amount: Math.abs(r.amount).toFixed(2),
        description: r.description,
        source: "import",
        importBatchId: batch.id,
      })),
    );
    insertedIncome = incomeRows.length;
  }

  if (expenseRows.length > 0 && expenseCategory) {
    const [batch] = await db
      .insert(taxImportBatches)
      .values({ userId: user.id, filename: filename.slice(0, 200), kind: "expense", rowCount: expenseRows.length })
      .returning({ id: taxImportBatches.id });
    await db.insert(taxEntries).values(
      expenseRows.map((r) => ({
        userId: user.id,
        kind: "expense" as const,
        categoryId: expenseCategory.id,
        date: new Date(r.date),
        amount: Math.abs(r.amount).toFixed(2),
        description: r.description,
        source: "import",
        importBatchId: batch.id,
      })),
    );
    insertedExpense = expenseRows.length;
  }

  revalidatePath("/budgeting");
  return { ok: true, insertedIncome, insertedExpense };
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
