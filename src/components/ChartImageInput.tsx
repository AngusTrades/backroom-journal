"use client";

import { useId, useState } from "react";

// Chart screenshot picker for the Add/Edit Trade forms. Compresses the
// image client-side (long edge capped at 1600px, re-encoded as JPEG) before
// putting it in a hidden "chartImageUrl" field as a base64 data URI — the
// server action just receives a string, no separate upload step or file
// storage to wire up. Keeping it small client-side matters here since it's
// going straight into a Postgres text column.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024; // 20MB — sanity cap before we even try to process it

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

export function ChartImageInput({ initialUrl }: { initialUrl?: string | null }) {
  const [preview, setPreview] = useState<string | null>(initialUrl ?? null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That's not an image file.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError("That image is too large (20MB max) — try a smaller screenshot.");
      return;
    }
    setProcessing(true);
    try {
      const dataUrl = await compressImage(file);
      setPreview(dataUrl);
    } catch {
      setError("Couldn't process that image — try a different file.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div>
      <input type="hidden" name="chartImageUrl" value={preview ?? ""} />

      {preview ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI, not a next/image-managed asset */}
          <img
            src={preview}
            alt="Trade chart screenshot"
            className="rounded-[9px] border"
            style={{ borderColor: "var(--border-soft)", maxHeight: 140, maxWidth: 220, objectFit: "cover" }}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="btn btn-ghost" style={{ cursor: "pointer" }}>
              Replace
            </label>
            <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex items-center justify-center rounded-[9px] border border-dashed text-[12px] cursor-pointer"
          style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)", color: "var(--text-mute)", height: 72 }}
        >
          {processing ? "Processing…" : "Click to attach a chart screenshot (optional)"}
        </label>
      )}

      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && (
        <div className="mt-1.5 text-[11px]" style={{ color: "var(--text-mute)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
