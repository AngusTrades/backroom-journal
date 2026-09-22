"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadReceipt } from "@/app/actions/receipts";
import { TaxCategorySelect } from "@/components/TaxCategorySelect";

type CategoryOpt = { id: string; name: string };

// Drop zone for the receipts holder on the Budgeting & Tax page — same
// "no file storage service to set up" philosophy as ChartImageInput
// (Add/Edit Trade's chart screenshot), extended to also accept PDFs (a lot
// of real receipts are emailed invoices, not photos). Images are
// compressed/re-encoded client-side like a chart screenshot, but kept at a
// higher resolution and quality than a trade screenshot — a receipt needs
// to stay legible as a tax record, not just recognizable at a glance.
// PDFs are stored byte-for-byte (base64'd, not re-encoded) since there's no
// equivalent client-side PDF re-compression worth doing here.
const MAX_DIMENSION = 2200;
const JPEG_QUALITY = 0.88;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // keep in sync with MAX_RECEIPT_SOURCE_BYTES in actions/receipts.ts

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image in this browser.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ReceiptUpload({ expenseCategories }: { expenseCategories: CategoryOpt[] }) {
  const router = useRouter();
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [pickedDataUrl, setPickedDataUrl] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState("");
  const [pickedType, setPickedType] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(todayInputValue());
  // Optional — filling this in also logs a matching line in the expense
  // log (see uploadReceipt), so a receipt doesn't have to be re-typed by
  // hand into Log an Expense to actually count toward the totals. Left
  // blank, the receipt is just filed away same as before.
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");

  function reset() {
    setPickedDataUrl(null);
    setPickedName("");
    setPickedType("");
    setLabel("");
    setDate(todayInputValue());
    setAmount("");
    setCategoryId("");
  }

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setError("Receipts can only be an image or a PDF.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError(`That file is too large (${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)}MB max).`);
      return;
    }
    setProcessing(true);
    try {
      const dataUrl = isPdf ? await fileToDataUrl(file) : await compressImage(file);
      setPickedDataUrl(dataUrl);
      setPickedName(file.name);
      setPickedType(isPdf ? "application/pdf" : "image/jpeg");
    } catch {
      setError("Couldn't read that file — try a different one.");
    } finally {
      setProcessing(false);
    }
  }

  const wantsExpenseLog = amount.trim() !== "";
  const canSave = !pending && (!wantsExpenseLog || Boolean(categoryId));

  function handleSave() {
    if (!pickedDataUrl || !canSave) return;
    setError(null);
    const fd = new FormData();
    fd.set("fileDataUrl", pickedDataUrl);
    fd.set("fileName", pickedName);
    fd.set("contentType", pickedType);
    fd.set("label", label);
    fd.set("date", date);
    if (wantsExpenseLog) {
      fd.set("amount", amount);
      fd.set("categoryId", categoryId);
    }
    startTransition(async () => {
      try {
        await uploadReceipt(fd);
        router.refresh();
        reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save that receipt — try again.");
      }
    });
  }

  if (pickedDataUrl) {
    return (
      <div className="flex flex-col gap-2" style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 9, border: "1px solid var(--border-soft)" }}>
        <div className="flex items-start gap-3">
          {pickedType === "application/pdf" ? (
            <div
              className="flex items-center justify-center rounded-[7px]"
              style={{ width: 56, height: 56, background: "var(--surface)", border: "1px solid var(--border-soft)", fontSize: 10, color: "var(--text-mute)", flexShrink: 0 }}
            >
              PDF
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- data URI, not a next/image-managed asset
            <img
              src={pickedDataUrl}
              alt="Receipt preview"
              className="rounded-[7px] border"
              style={{ borderColor: "var(--border-soft)", width: 56, height: 56, objectFit: "cover", flexShrink: 0 }}
            />
          )}
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pickedName}
            </div>
            <input type="text" placeholder="Label (optional) — e.g. Apex 50k reset" value={label} onChange={(e) => setLabel(e.target.value)} />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div style={{ paddingTop: 4, borderTop: "1px solid var(--border-soft)" }}>
          <div className="sub" style={{ marginBottom: 6 }}>
            Also log this as an expense (optional) — fill in the amount to add it straight to your expense totals.
          </div>
          <div className="flex gap-1.5">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount ($)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-w-0"
              style={{ flex: "0 0 120px" }}
            />
            {wantsExpenseLog && (
              <div className="min-w-0 flex-1">
                <TaxCategorySelect kind="expense" initialCategories={expenseCategories} value={categoryId} onChange={setCategoryId} />
              </div>
            )}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="flex gap-1.5">
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={handleSave}>
            {pending ? "Saving…" : "Save Receipt"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={reset}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="flex items-center justify-center rounded-[9px] border border-dashed text-[12px] cursor-pointer"
        style={{
          borderColor: dragOver ? "var(--accent-line)" : "var(--border-soft)",
          background: dragOver ? "var(--surface)" : "var(--surface-2)",
          color: dragOver ? "var(--text)" : "var(--text-mute)",
          height: 64,
          textAlign: "center",
          padding: "0 12px",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
      >
        {processing ? "Processing…" : "Click or drag a receipt here (photo or PDF)"}
      </label>
      <input id={inputId} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => void handleFile(e.target.files?.[0])} />
      {error && (
        <div className="mt-1.5 text-[11px]" style={{ color: "var(--text-mute)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
