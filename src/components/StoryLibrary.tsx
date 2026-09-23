"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLibraryPhoto, uploadLibraryPhotos } from "@/app/actions/stories";
import { compressPhoto } from "@/lib/storyRender";

const BATCH = 4;

// Story Maker photo library: upload a big batch once, reuse as random story
// backgrounds. Photos are compressed in the browser (full ~1920px + a small
// thumbnail) and uploaded a few at a time so large selections don't hit the
// request size limit.
export function StoryLibrary({ ids, max }: { ids: string[]; max: number }) {
  const router = useRouter();
  const inputId = useId();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const room = max - ids.length;
    const queue = picked.slice(0, room);
    if (queue.length === 0) {
      setError(`Your library is full (max ${max} photos). Delete some to add more.`);
      return;
    }
    setProgress({ done: 0, total: queue.length });
    let failed = 0;
    try {
      for (let i = 0; i < queue.length; i += BATCH) {
        const chunk = queue.slice(i, i + BATCH);
        const prepared: { photo: string; thumb: string }[] = [];
        for (const f of chunk) {
          try {
            prepared.push({ photo: await compressPhoto(f, 1920, 0.85), thumb: await compressPhoto(f, 360, 0.7) });
          } catch {
            failed++;
          }
        }
        const res = await uploadLibraryPhotos(prepared);
        if ("error" in res) {
          setError(res.error);
          break;
        }
        setProgress({ done: Math.min(i + chunk.length, queue.length), total: queue.length });
      }
      if (failed) setError(`${failed} photo(s) couldn't be processed and were skipped. Try JPEG or PNG.`);
      else if (picked.length > room) setError(`Library limit is ${max}: ${picked.length - room} photo(s) were skipped.`);
    } finally {
      setProgress(null);
      router.refresh();
    }
  }

  function remove(id: string) {
    setRemoving((s) => new Set(s).add(id));
    startTransition(async () => {
      await deleteLibraryPhoto(id);
      router.refresh();
    });
  }

  const visible = ids.filter((id) => !removing.has(id));

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
        <div>
          <h3>My Photos</h3>
          <div className="sub">
            {visible.length} of {max} photos. Story Maker picks random ones from here as backgrounds.
          </div>
        </div>
        <label htmlFor={inputId} className="btn btn-primary" aria-disabled={Boolean(progress)}>
          {progress ? `Uploading ${progress.done}/${progress.total}…` : "+ Upload photos"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={Boolean(progress)}
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

      {visible.length === 0 ? (
        <div className="sub">
          No photos yet. Select as many as you like at once. They&apos;re compressed before uploading, so 100 photos
          is fine.
        </div>
      ) : (
        <div className="story-thumbs">
          {visible.map((id) => (
            <div key={id} className="story-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/story-photo/${id}?size=thumb`} alt="" loading="lazy" />
              <div className="story-thumb-actions">
                <button type="button" onClick={() => remove(id)} aria-label="Delete photo">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
