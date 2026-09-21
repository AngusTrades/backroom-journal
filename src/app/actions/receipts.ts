"use server";

import { db } from "@/db";
import { receipts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getReceiptById } from "@/db/queries";

// Keep in sync with MAX_SOURCE_BYTES in ReceiptUpload.tsx — that's the
// client-side gate (checked against the raw file before it's even read),
// this is the server-side backstop against a tampered/direct call. Base64
// inflates the raw byte count by ~4/3, so the stored data URI can run a bit
// past this number — the cap is on the source file, not the encoded string.
const MAX_RECEIPT_SOURCE_BYTES = 8 * 1024 * 1024;

// Receipts are a flat per-member holding pen (see the comment on the
// `receipts` table) — no CSV/PDF-import-style batch or undo machinery here,
// just a straight insert/delete, same shape as createPayout.
export async function uploadReceipt(formData: FormData) {
  const user = await requireUser();

  const fileDataUrl = String(formData.get("fileDataUrl") ?? "");
  const fileName = String(formData.get("fileName") ?? "").trim();
  const contentType = String(formData.get("contentType") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();

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

  await db.insert(receipts).values({
    userId: user.id,
    date,
    label: label || null,
    fileName,
    contentType,
    fileDataUrl,
  });

  revalidatePath("/budgeting");
}

// Scoped to id + userId, same ownership-check pattern as deleteAccount —
// no way to delete someone else's receipt by guessing its id.
export async function deleteReceipt(id: string) {
  const user = await requireUser();
  if (!id) return;
  await db.delete(receipts).where(and(eq(receipts.id, id), eq(receipts.userId, user.id)));
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
