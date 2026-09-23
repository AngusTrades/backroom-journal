"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { storyLibraryPhotos } from "@/db/schema";
import { requireInstagramOwner } from "@/lib/auth";
import {
  StoryWriterError,
  detectFocusPoints,
  writeStoryCopy,
  type FocusPoint,
  type FrameCopy,
  type SlideInput,
} from "@/lib/storyWriter";

const MAX_SLIDES = 10;
const MAX_BRIEF_CHARS = 2000;
const MAX_LIBRARY_PHOTOS = 300;
const MAX_UPLOAD_BATCH = 6;

const isImageDataUrl = (v: unknown): v is string =>
  typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v);
const isJpegDataUrl = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/jpeg;base64,");

/** Focus points for library photos, detecting (and saving) any that don't
 * have one yet, e.g. photos uploaded before focus detection existed. */
async function libraryFocusPoints(userId: string, ids: string[]): Promise<Map<string, FocusPoint | null>> {
  const out = new Map<string, FocusPoint | null>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      id: storyLibraryPhotos.id,
      focusX: storyLibraryPhotos.focusX,
      focusY: storyLibraryPhotos.focusY,
      thumbData: storyLibraryPhotos.thumbData,
    })
    .from(storyLibraryPhotos)
    .where(and(eq(storyLibraryPhotos.userId, userId), inArray(storyLibraryPhotos.id, [...new Set(ids)])));
  const missing = rows.filter((r) => r.focusX === null || r.focusY === null);
  for (const r of rows) {
    if (r.focusX !== null && r.focusY !== null) out.set(r.id, { x: Number(r.focusX), y: Number(r.focusY) });
  }
  for (let i = 0; i < missing.length; i += 8) {
    const chunk = missing.slice(i, i + 8);
    const points = await detectFocusPoints(chunk.map((r) => r.thumbData));
    for (const [k, r] of chunk.entries()) {
      const pt = points[k];
      out.set(r.id, pt);
      if (pt) {
        await db
          .update(storyLibraryPhotos)
          .set({ focusX: String(pt.x), focusY: String(pt.y) })
          .where(eq(storyLibraryPhotos.id, r.id));
      }
    }
  }
  return out;
}

export type GenerateStoryResult = { error: string } | { frames: FrameCopy[] };

/**
 * Story Maker: brief + slides in, one headline/body per slide out. A slide is
 * either a freshly added photo (sent to Claude so the text can fit it) or a
 * library photo (not sent: it's a random background, so the text is written
 * to work over any photo). Nothing about the story itself is saved.
 */
export async function generateStoryCopy(input: {
  brief: string;
  slides: ({ image: string } | { libraryId: string })[];
}): Promise<GenerateStoryResult> {
  const user = await requireInstagramOwner();
  const brief = String(input?.brief ?? "").trim().slice(0, MAX_BRIEF_CHARS);
  const slides = Array.isArray(input?.slides) ? input.slides : [];

  if (!brief) return { error: "Write a short brief first: what should the story be about?" };
  if (slides.length === 0) return { error: "Add at least one photo, or fill slides from your library." };
  if (slides.length > MAX_SLIDES) return { error: `Up to ${MAX_SLIDES} slides per story.` };

  const libraryIds = slides.flatMap((s) => ("libraryId" in s ? [String(s.libraryId)] : []));
  if (libraryIds.length > 0) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(storyLibraryPhotos)
      .where(and(eq(storyLibraryPhotos.userId, user.id), inArray(storyLibraryPhotos.id, [...new Set(libraryIds)])));
    if (n !== new Set(libraryIds).size) return { error: "A library photo is missing. Reload the page and try again." };
  }

  const writerSlides: SlideInput[] = [];
  for (const s of slides) {
    if ("libraryId" in s) writerSlides.push({ library: true });
    else if (isImageDataUrl(s.image)) writerSlides.push({ image: s.image });
    else return { error: "One of the photos couldn't be read. Try re-adding it." };
  }

  try {
    const [frames, libFocus] = await Promise.all([
      writeStoryCopy(brief, writerSlides),
      libraryFocusPoints(user.id, libraryIds),
    ]);
    return {
      frames: frames.map((f, i) => {
        const s = slides[i];
        return "libraryId" in s ? { ...f, focus: libFocus.get(String(s.libraryId)) ?? null } : f;
      }),
    };
  } catch (e) {
    if (e instanceof StoryWriterError) return { error: e.message };
    console.error("generateStoryCopy failed", e);
    return { error: "Couldn't generate the story text. Try again." };
  }
}

// ---------------------------------------------------------------------------
// Photo library
// ---------------------------------------------------------------------------
export type UploadLibraryResult = { error: string } | { ids: string[] };

/** Saves a small batch of already-compressed photos (the browser uploads a
 * big selection a few at a time to stay under the request size limit). */
export async function uploadLibraryPhotos(photos: { photo: string; thumb: string }[]): Promise<UploadLibraryResult> {
  const user = await requireInstagramOwner();
  const batch = Array.isArray(photos) ? photos : [];
  if (batch.length === 0) return { ids: [] };
  if (batch.length > MAX_UPLOAD_BATCH) return { error: "Too many photos in one request." };
  if (!batch.every((p) => isJpegDataUrl(p?.photo) && isJpegDataUrl(p?.thumb))) {
    return { error: "One of the photos couldn't be read." };
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(storyLibraryPhotos)
    .where(eq(storyLibraryPhotos.userId, user.id));
  if (n + batch.length > MAX_LIBRARY_PHOTOS) {
    return { error: `Your library is full (max ${MAX_LIBRARY_PHOTOS} photos). Delete some to add more.` };
  }

  // Find the subject in each photo once, now, from the small thumbnails.
  // If this fails (no API key, Claude down) the photo is still saved and
  // gets detected the first time it's used in a story.
  const focus = await detectFocusPoints(batch.map((p) => p.thumb));
  const rows = await db
    .insert(storyLibraryPhotos)
    .values(
      batch.map((p, i) => ({
        userId: user.id,
        photoData: p.photo,
        thumbData: p.thumb,
        focusX: focus[i] ? String(focus[i]!.x) : null,
        focusY: focus[i] ? String(focus[i]!.y) : null,
      })),
    )
    .returning({ id: storyLibraryPhotos.id });
  revalidatePath("/stories");
  revalidatePath("/stories/library");
  return { ids: rows.map((r) => r.id) };
}

export async function deleteLibraryPhoto(id: string) {
  const user = await requireInstagramOwner();
  await db
    .delete(storyLibraryPhotos)
    .where(and(eq(storyLibraryPhotos.id, id), eq(storyLibraryPhotos.userId, user.id)));
  revalidatePath("/stories");
  revalidatePath("/stories/library");
}

/** Focus point for one library photo (used when swapping a slide's photo). */
export async function getLibraryFocus(id: string): Promise<FocusPoint | null> {
  const user = await requireInstagramOwner();
  const points = await libraryFocusPoints(user.id, [String(id)]);
  return points.get(String(id)) ?? null;
}
