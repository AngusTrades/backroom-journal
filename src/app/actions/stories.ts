"use server";

import { requireInstagramOwner } from "@/lib/auth";
import { StoryWriterError, writeStoryCopy, type FrameCopy } from "@/lib/storyWriter";

const MAX_PHOTOS = 10;
const MAX_BRIEF_CHARS = 2000;

export type GenerateStoryResult = { error: string } | { frames: FrameCopy[] };

// Story Maker: brief + photos in, one headline/body per photo out. Nothing is
// saved anywhere: the browser renders the frames and you download them.
export async function generateStoryCopy(input: { brief: string; photos: string[] }): Promise<GenerateStoryResult> {
  await requireInstagramOwner();
  const brief = String(input?.brief ?? "").trim().slice(0, MAX_BRIEF_CHARS);
  const photos = Array.isArray(input?.photos) ? input.photos : [];

  if (!brief) return { error: "Write a short brief first: what should the story be about?" };
  if (photos.length === 0) return { error: "Add at least one photo." };
  if (photos.length > MAX_PHOTOS) return { error: `Up to ${MAX_PHOTOS} photos per story.` };
  if (!photos.every((p) => typeof p === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(p))) {
    return { error: "One of the photos couldn't be read. Try re-adding it." };
  }

  try {
    return { frames: await writeStoryCopy(brief, photos) };
  } catch (e) {
    if (e instanceof StoryWriterError) return { error: e.message };
    console.error("generateStoryCopy failed", e);
    return { error: "Couldn't generate the story text. Try again." };
  }
}
