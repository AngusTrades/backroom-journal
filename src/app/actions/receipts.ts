"use server";

import { db } from "@/db";
import { receipts, taxEntries } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getReceiptById, getTaxCategoryById } from "@/db/queries";

// Keep in sync with MAX_SOURCE_BYTES in ReceiptUpload.tsx — that's the
// client-side gate (checked against the raw file before it's even read),
// this is the server-side backstop against a tampered/direct call. Base64
// inflates the raw byte count by ~4/3, so the stored data URI can run a bit
// past this number — the cap is on the source file, not the encoded string.
const MAX_RECEIPT_SOURCE_BYTES = 8 * 1024 * 1024;

// Receipts are a flat per-member holding pen (see the comment on the
// `receipts` table) — no CSV/PDF-import-style batch or undo machinery here,
// just a straight insert/delete, same shape as createPayout. `amount` +
// `categoryId` are optional: when both are filled in on the upload form,
// this also drops a matching expense line into tax_entries (same table Log
// an Expense writes to) and links the two rows via receipts.taxEntryId, so
// dropping a receipt in is enough to have it show up in the expense totals
// too — no more separately re-typing the same figure into Log an Expense
// by hand. Both writes happen in one transaction so a failure partway
// through can't leave an orphaned tax entry with no receipt, or vice versa.
export async function uploadReceipt(formData: FormData) {
  const user = await requireUser();

  const fileDataUrl = String(formData.get("fileDataUrl") ?? "");
  const fileName = String(formData.get("fileName") ?? "").trim();
  const contentType = String(formData.get("contentType") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();

  if (!fileDataUrl || !fileName || !contentType) {
    throw new Error("Missing file.");
  }
  if (!contentType.startsWith("image/") && contentType !== "application/pdf") {
    throw new Error("Receipts can only be an image or a PDF.");
  }
  // Rough byte count from the data URI's base64 payload (after the comma),
  // without decoding the whole thing — good enough for a sanity cap.
  const base64 = fileDataUrl.slice(fileDataUrl.indexOf(",") + 1);
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_RECEIPT_SOURCE_BYTES * 1.4) {
    throw new Error("That file is too large.");
  }

  const date = dateRaw ? new Date(dateRaw) : new Date();
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date.");
  }

  // Logging an expense alongside the receipt is opt-in — an amount with no
  // category (or vice versa) is treated as "didn't mean to log one", not an
  // error, since the amount field is easy to leave filled in from a
  // previous receipt by mistake.
  let amount: number | null = null;
  if (amountRaw && categoryId) {
    amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter an amount greater than $0, or leave it blank.");
    }
    const category = await getTaxCategoryById(categoryId, user.id);
    if (!category || category.kind !== "expense") {
      throw new Error("That expense category doesn't belong to your login.");
    }
  }

  await db.transaction(async (tx) => {
    let taxEntryId: string | null = null;
    if (amount !== null && categoryId) {
      const [entry] = await tx
        .insert(taxEntries)
        .values({
          userId: user.id,
          kind: "expense",
          categoryId,
          date,
          amount: amount.toFixed(2),
          description: label || fileName,
          source: "manual",
        })
        .returning({ id: taxEntries.id });
      taxEntryId = entry.id;
    }

    await tx.insert(receipts).values({
      userId: user.id,
      date,
      label: label || null,
      fileName,
      contentType,
      fileDataUrl,
      taxEntryId,
    });
  });

  revalidatePath("/budgeting");
}

// Scoped to id + userId, same ownership-check pattern as deleteAccount — no
// way to delete someone else's receipt by guessing its id. When this
// receipt has a linked tax entry (see uploadReceipt above), that entry is
// deleted along with it — it only exists because this receipt created it,
// so keeping a now-orphaned expense line around after the source document
// is gone would just be a duplicate the member has to notice and clean up
// by hand. A tax entry deleted independently (from the Log an Expense list)
// does NOT take its receipt with it — see the onDelete: "set null" comment
// on the receipts table.
export async function deleteReceipt(id: string) {
  const user = await requireUser();
  if (!id) return;
  const receipt = await getReceiptById(id, user.id);
  if (!receipt) return;
  await db.transaction(async (tx) => {
    await tx.delete(receipts).where(and(eq(receipts.id, id), eq(receipts.userId, user.id)));
    if (receipt.taxEntryId) {
      await tx.delete(taxEntries).where(and(eq(taxEntries.id, receipt.taxEntryId), eq(taxEntries.userId, user.id)));
    }
  });
  revalidatePath("/budgeting");
}

// Used by the "Download Receipts" route handler (src/app/api/receipts-pdf)
// to fetch one receipt's full file data — kept as its own function (rather
// than folding into the route handler directly) so the ownership check
// lives in one place next to the other receipt actions.
export async function getOwnedReceiptFile(id: string) {
  const user = await requireUser();
  return getReceiptById(id, user.id);
}
