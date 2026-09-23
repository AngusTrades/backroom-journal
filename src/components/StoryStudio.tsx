"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { generateStoryCopy } from "@/app/actions/stories";
import { compressPhoto, renderStoryFrame } from "@/lib/storyRender";

const MAX_PHOTOS = 10;

type Frame = { photo: string; headline: string; body: string };

function fileName(i: number) {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `backroom-story-${date}-${i + 1}.jpg`;
}

async function frameBlob(canvas: HTMLCanvasElement, frame: Frame): Promise<Blob> {
  // Re-render right before export so the file always matches the current text.
  await renderStoryFrame(canvas, frame);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/jpeg", 0.92),
  );
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function FramePreview({ frame, onCanvas }: { frame: Frame; onCanvas: (c: HTMLCanvasElement | null) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    renderStoryFrame(ref.current, frame)
      .then(() => !cancelled && setFailed(false))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [frame]);
  return (
    <div className="story-preview">
      <canvas
        ref={(c) => {
          ref.current = c;
          onCanvas(c);
        }}
      />
      {failed && <div className="form-error">Preview failed to render.</div>}
    </div>
  );
}

export function StoryStudio() {
  const inputId = useId();
  const [brief, setBrief] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);

  // Nothing is saved server-side, so warn before a refresh/close loses the work.
  useEffect(() => {
    if (!frames) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [frames]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setProcessing(true);
    try {
      const room = MAX_PHOTOS - photos.length;
      const picked = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, room);
      const compressed = await Promise.all(picked.map(compressPhoto));
      setPhotos((p) => [...p, ...compressed]);
      if (files.length > room) setError(`Only ${MAX_PHOTOS} photos per story. The rest were skipped.`);
    } catch {
      setError("One of those images couldn't be processed. Try a JPEG or PNG.");
    } finally {
      setProcessing(false);
    }
  }

  function move(i: number, dir: -1 | 1) {
    setPhotos((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await generateStoryCopy({ brief, photos });
      if ("error" in res) setError(res.error);
      else setFrames(photos.map((photo, i) => ({ photo, ...res.frames[i] })));
    });
  }

  function update(i: number, patch: Partial<Frame>) {
    setFrames((fs) => fs && fs.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  }

  async function downloadOne(i: number) {
    const c = canvases.current[i];
    if (!c || !frames) return;
    downloadBlob(await frameBlob(c, frames[i]), fileName(i));
  }

  async function saveAll() {
    if (!frames) return;
    setError(null);
    setSaving(true);
    try {
      const files: File[] = [];
      for (const [i, f] of frames.entries()) {
        const c = canvases.current[i];
        if (!c) throw new Error("A preview hasn't loaded yet.");
        files.push(new File([await frameBlob(c, f)], fileName(i), { type: "image/jpeg" }));
      }
      // On a phone this opens the share sheet, where "Save N Images" puts them
      // straight into your camera roll. On a computer it downloads each file.
      if (navigator.canShare?.({ files })) {
        try {
          await navigator.share({ files });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      for (const f of files) {
        downloadBlob(f, f.name);
        await new Promise((r) => setTimeout(r, 350));
      }
    } catch (e) {
      setError((e as Error).message || "Couldn't export the frames.");
    } finally {
      setSaving(false);
    }
  }

  if (frames) {
    return (
      <div>
        <div className="card card-pad story-actions" style={{ marginTop: 0, marginBottom: 16 }}>
          <button type="button" className="btn btn-primary" onClick={saveAll} disabled={saving}>
            {saving ? "Exporting…" : `Save all ${frames.length} frame${frames.length === 1 ? "" : "s"}`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={generate} disabled={pending}>
            {pending ? "Rewriting…" : "Rewrite text"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setFrames(null);
              setError(null);
            }}
          >
            ← Back to photos &amp; brief
          </button>
          <span className="sub" style={{ marginLeft: "auto" }}>
            Not saved anywhere. Download before leaving this page.
          </span>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="story-grid">
          {frames.map((f, i) => (
            <div key={i} className="card card-pad">
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span className="mono sub">Frame {i + 1}</span>
                <button type="button" className="btn btn-ghost" onClick={() => void downloadOne(i)}>
                  Download
                </button>
              </div>
              <FramePreview frame={f} onCanvas={(c) => {
                  canvases.current[i] = c;
                }} />
              <div className="field" style={{ marginTop: 10 }}>
                <label>Headline</label>
                <input
                  type="text"
                  value={f.headline}
                  maxLength={200}
                  onChange={(e) => update(i, { headline: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label>Body</label>
                <textarea rows={3} value={f.body} maxLength={400} onChange={(e) => update(i, { body: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <h3>New Story</h3>
      <div className="sub" style={{ marginBottom: 12 }}>
        Write what the story should be about and add your photos in the order you want them. Claude writes one frame
        per photo; you tweak the text and download the finished images.
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>Brief</label>
        <textarea
          rows={4}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          maxLength={2000}
          placeholder={"e.g. Today's NQ recap: took the London sweep long, +2.5R.\nRemind people the $1K → $100K challenge is live, DM me CHALLENGE."}
        />
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>
          Photos ({photos.length}/{MAX_PHOTOS})
        </label>
        <div className="story-thumbs">
          {photos.map((p, i) => (
            <div key={i} className="story-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt={`Photo ${i + 1}`} />
              <span className="story-thumb-n mono">{i + 1}</span>
              <div className="story-thumb-actions">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">
                  ←
                </button>
                <button type="button" onClick={() => setPhotos((p) => p.filter((_, k) => k !== i))} aria-label="Remove">
                  ×
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label="Move later">
                  →
                </button>
              </div>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label htmlFor={inputId} className="story-thumb story-thumb-add">
              {processing ? "Processing…" : "+ Add photos"}
            </label>
          )}
        </div>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

      <button
        type="button"
        className="btn btn-primary"
        onClick={generate}
        disabled={pending || processing || photos.length === 0 || !brief.trim()}
      >
        {pending ? "Claude is writing…" : "Generate story"}
      </button>
    </div>
  );
}
