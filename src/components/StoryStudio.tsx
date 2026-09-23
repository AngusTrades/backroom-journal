"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { generateStoryCopy, getLibraryFocus } from "@/app/actions/stories";
import {
  STORY_H,
  STORY_W,
  compressPhoto,
  photoSize,
  renderStoryFrame,
  subjectFrameY,
  type FrameLayout,
  type TextPosition,
} from "@/lib/storyRender";

const MAX_PHOTOS = 10;

// A slide's background: either a photo added just for this story (data URL)
// or a photo from the library (served by /api/story-photo).
type Slide = { src: string; thumb: string; libraryId?: string };
type Focus = { x: number; y: number } | null;
type Frame = {
  photo: string;
  headline: string;
  body: string;
  libraryId?: string;
  focusX: number | null;
  focusY: number | null;
  /** What Claude detected, so "Re-center" can undo a manual drag. */
  autoFocus: Focus;
  textPos: TextPosition;
};

/** Put the text on the half of the frame the subject isn't in. */
async function autoTextPos(photo: string, focus: Focus): Promise<TextPosition> {
  if (!focus) return "bottom";
  try {
    const { w, h } = await photoSize(photo);
    return subjectFrameY(w, h, focus.y) > 0.55 ? "top" : "bottom";
  } catch {
    return "bottom";
  }
}

const libSlide = (id: string): Slide => ({
  src: `/api/story-photo/${id}`,
  thumb: `/api/story-photo/${id}?size=thumb`,
  libraryId: id,
});

/** Up to n random library ids, skipping ones already in use. */
function pickRandom(pool: string[], used: Set<string>, n: number): string[] {
  const free = pool.filter((id) => !used.has(id));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  return free.slice(0, n);
}

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

function FramePreview({
  frame,
  onCanvas,
  onFocusChange,
}: {
  frame: Frame;
  onCanvas: (c: HTMLCanvasElement | null) => void;
  onFocusChange: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const layout = useRef<FrameLayout | null>(null);
  const drag = useRef<{ px: number; py: number; fx: number; fy: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    renderStoryFrame(ref.current, frame)
      .then((l) => {
        layout.current = l;
        if (!cancelled) setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [frame]);

  // Dragging the preview slides the photo: moving right shows more of the
  // left side, like dragging a photo in Instagram's own crop tool.
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!layout.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, fx: frame.focusX ?? 0.5, fy: frame.focusY ?? 0.5 };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    const l = layout.current;
    if (!d || !l) return;
    const toFrame = STORY_W / e.currentTarget.clientWidth;
    // Only the range that actually changes the crop, so dragging past an
    // edge doesn't "store up" movement.
    const clamp = (v: number, drawn: number, size: number) => {
      const half = size / 2 / drawn;
      return half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, v));
    };
    const x = clamp(d.fx - ((e.clientX - d.px) * toFrame) / l.drawnW, l.drawnW, STORY_W);
    const y = clamp(d.fy - ((e.clientY - d.py) * toFrame) / l.drawnH, l.drawnH, STORY_H);
    onFocusChange(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000);
  }
  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div className="story-preview">
      <canvas
        ref={(c) => {
          ref.current = c;
          onCanvas(c);
        }}
        className="draggable"
        title="Drag to reposition the photo"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {failed && <div className="form-error">Preview failed to render.</div>}
    </div>
  );
}

export function StoryStudio({ libraryIds }: { libraryIds: string[] }) {
  const inputId = useId();
  const [brief, setBrief] = useState("");
  const [photos, setPhotos] = useState<Slide[]>([]);
  const [fillCount, setFillCount] = useState(10);
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
      const compressed = await Promise.all(picked.map((f) => compressPhoto(f)));
      setPhotos((p) => [...p, ...compressed.map((c) => ({ src: c, thumb: c }))]);
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

  const usedIds = (list: { libraryId?: string }[]) =>
    new Set(list.flatMap((x) => (x.libraryId ? [x.libraryId] : [])));

  function fillFromLibrary() {
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    const ids = pickRandom(libraryIds, usedIds(photos), Math.min(fillCount, room));
    if (ids.length === 0) {
      setError(room === 0 ? `A story can have up to ${MAX_PHOTOS} slides.` : "No unused library photos left.");
      return;
    }
    setPhotos((p) => [...p, ...ids.map(libSlide)]);
  }

  /** Replace slide i's background with a different random library photo. */
  function swapPhoto(i: number) {
    const current = frames ?? photos;
    const [id] = pickRandom(libraryIds, usedIds(current), 1);
    if (!id) {
      setError("No other library photos to swap in.");
      return;
    }
    if (frames) {
      const src = libSlide(id).src;
      void (async () => {
        const focus = await getLibraryFocus(id).catch(() => null);
        const textPos = await autoTextPos(src, focus);
        setFrames(
          (fs) =>
            fs &&
            fs.map((f, k) =>
              k === i
                ? { ...f, photo: src, libraryId: id, focusX: focus?.x ?? null, focusY: focus?.y ?? null, autoFocus: focus, textPos }
                : f,
            ),
        );
      })();
    } else {
      setPhotos((p) => p.map((x, k) => (k === i ? libSlide(id) : x)));
    }
  }

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await generateStoryCopy({
        brief,
        slides: photos.map((p) => (p.libraryId ? { libraryId: p.libraryId } : { image: p.src })),
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      const built = await Promise.all(
        photos.map(async (p, i): Promise<Frame> => {
          const focus = res.frames[i].focus;
          return {
            photo: p.src,
            libraryId: p.libraryId,
            headline: res.frames[i].headline,
            body: res.frames[i].body,
            focusX: focus?.x ?? null,
            focusY: focus?.y ?? null,
            autoFocus: focus,
            textPos: await autoTextPos(p.src, focus),
          };
        }),
      );
      setFrames(built);
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
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              // Keep any swapped backgrounds when rewriting.
              setPhotos(frames.map((f) => (f.libraryId ? libSlide(f.libraryId) : { src: f.photo, thumb: f.photo })));
              startTransition(async () => {
                setError(null);
                const res = await generateStoryCopy({
                  brief,
                  slides: frames.map((f) => (f.libraryId ? { libraryId: f.libraryId } : { image: f.photo })),
                });
                if ("error" in res) setError(res.error);
                else
                  setFrames(
                    (fs) =>
                      fs && fs.map((f, i) => ({ ...f, headline: res.frames[i].headline, body: res.frames[i].body })),
                  );
              });
            }}
            disabled={pending}
          >
            {pending ? "Rewriting…" : "Rewrite text"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              // Carry any swapped backgrounds back to the composer.
              setPhotos(frames.map((f) => (f.libraryId ? libSlide(f.libraryId) : { src: f.photo, thumb: f.photo })));
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
                <div className="flex gap-2">
                  {libraryIds.length > 0 && (
                    <button type="button" className="btn btn-ghost" onClick={() => swapPhoto(i)} title="Random library photo">
                      ↻ Photo
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => void downloadOne(i)}>
                    Download
                  </button>
                </div>
              </div>
              <FramePreview
                frame={f}
                onCanvas={(c) => {
                  canvases.current[i] = c;
                }}
                onFocusChange={(x, y) => update(i, { focusX: x, focusY: y })}
              />
              <div className="story-frame-tools">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => update(i, { textPos: f.textPos === "top" ? "bottom" : "top" })}
                  title="Move the text"
                >
                  Text: {f.textPos === "top" ? "Top" : "Bottom"}
                </button>
                {(f.focusX !== (f.autoFocus?.x ?? null) || f.focusY !== (f.autoFocus?.y ?? null)) && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => update(i, { focusX: f.autoFocus?.x ?? null, focusY: f.autoFocus?.y ?? null })}
                  >
                    Re-center
                  </button>
                )}
                <span className="sub">Drag photo to move</span>
              </div>
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
              <img src={p.thumb} alt={`Photo ${i + 1}`} />
              <span className="story-thumb-n mono">{i + 1}</span>
              <div className="story-thumb-actions">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">
                  ←
                </button>
                <button type="button" onClick={() => setPhotos((p) => p.filter((_, k) => k !== i))} aria-label="Remove">
                  ×
                </button>
                {libraryIds.length > 0 && (
                  <button type="button" onClick={() => swapPhoto(i)} aria-label="Swap for a random library photo">
                    ↻
                  </button>
                )}
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

      <div className="story-library-row">
        {libraryIds.length > 0 ? (
          <>
            <select value={fillCount} onChange={(e) => setFillCount(Number(e.target.value))} aria-label="How many">
              {Array.from({ length: MAX_PHOTOS }, (_, k) => k + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={fillFromLibrary}
              disabled={photos.length >= MAX_PHOTOS}
            >
              Add random from library
            </button>
            <span className="sub">
              {libraryIds.length} photo{libraryIds.length === 1 ? "" : "s"} in your library ·{" "}
              <Link href="/stories/library" className="story-link">
                Manage
              </Link>
            </span>
          </>
        ) : (
          <span className="sub">
            Tip: upload a batch of photos of yourself once and Story Maker can fill stories with random backgrounds.{" "}
            <Link href="/stories/library" className="story-link">
              Set up your photo library →
            </Link>
          </span>
        )}
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
