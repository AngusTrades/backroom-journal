/**
 * Story Maker (owner-only): writes the text overlays for a story sequence: one headline + short body
 * per photo, from August's brief. Claude sees the actual photos so it can
 * match the right line to the right image (a chart screenshot gets the
 * results line, a lifestyle shot gets the hook, etc.) while keeping the
 * photo order the admin chose.
 *
 * Needs ANTHROPIC_API_KEY. The model can be overridden with ANTHROPIC_MODEL.
 */
import { z } from "zod";

const API_BASE = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

const SYSTEM_PROMPT = `You write Instagram Story text overlays for August ("Angus"), who trades NQ futures and runs The Backroom, a paid trading community (Discord + mentorship, prop-firm challenges, a $1K to $100K NQ challenge).

Voice: direct, confident, casual, like a trader talking to his community. Short punchy lines. No corporate speak, no hype-bro clichés, no "unlock your potential".

Hard rules:
- Exactly one frame per photo, in the order given. Where a photo is attached, look at it and write text that fits it. Photos marked as library backgrounds are random photos of August that you can't see: write text that works over any photo of him.
- headline: max 7 words. body: max 22 words, can be an empty string if the headline says it all.
- The frames read as a sequence: frame 1 hooks, the last frame carries any call to action.
- No hashtags. At most one emoji per frame, usually none.
- Never promise profits, guaranteed returns, or income. Results are framed as August's own, past results.
- August posts these himself and adds any link stickers, polls or tags in the Instagram app. If the brief wants people to go somewhere, a short CTA like "Tap the link" or "DM me [WORD]" is fine; don't write out URLs.
- Only use facts from the brief or clearly visible in the photos. Don't invent numbers.

For every photo you can see, also give "focus": where the main subject's face is (or the main subject, if there's no person), as fractions of the photo's width and height from the top-left corner, e.g. {"x":0.38,"y":0.62}. The photo gets cropped to a tall 9:16 story around this point, so be accurate. For library backgrounds you can't see, set "focus" to null.

Respond with ONLY a JSON object, no markdown fences, no commentary:
{"frames":[{"headline":"...","body":"...","focus":{"x":0.5,"y":0.4}}]}`;

const FocusSchema = z.object({ x: z.number(), y: z.number() });
const ResponseSchema = z.object({
  frames: z.array(
    z.object({ headline: z.string(), body: z.string().default(""), focus: FocusSchema.nullable().optional() }),
  ),
});

/** Where the subject is in a photo, as 0..1 fractions from the top-left. */
export type FocusPoint = { x: number; y: number };
export type FrameCopy = { headline: string; body: string; focus: FocusPoint | null };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
function cleanFocus(f: { x: number; y: number } | null | undefined): FocusPoint | null {
  if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.y)) return null;
  return { x: Math.round(clamp01(f.x) * 1000) / 1000, y: Math.round(clamp01(f.y) * 1000) / 1000 };
}

export class StoryWriterError extends Error {}

function dataUrlToImageBlock(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new StoryWriterError("One of the photos isn't a valid image.");
  return { type: "image" as const, source: { type: "base64" as const, media_type: match[1], data: match[2] } };
}

/** One slide: either a photo attached for Claude to look at, or a random
 * library background it doesn't need to see (keeps 10-slide stories cheap). */
export type SlideInput = { image: string } | { library: true };

export async function writeStoryCopy(brief: string, slides: SlideInput[]): Promise<FrameCopy[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new StoryWriterError("ANTHROPIC_API_KEY isn't set — add it in Vercel's environment variables.");
  }

  const content = [
    ...slides.flatMap((sl, i) =>
      "image" in sl
        ? [{ type: "text" as const, text: `Photo ${i + 1}:` }, dataUrlToImageBlock(sl.image)]
        : [{ type: "text" as const, text: `Photo ${i + 1}: (library background of August, not shown)` }],
    ),
    { type: "text" as const, text: `Brief from August:\n${brief}\n\nWrite ${slides.length} frame(s).` },
  ];

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
      cache: "no-store",
    });
  } catch {
    throw new StoryWriterError("Couldn't reach Claude — try again in a moment.");
  }

  const json = (await res.json().catch(() => null)) as {
    content?: { type: string; text?: string }[];
    error?: { message?: string };
  } | null;
  if (!res.ok || !json) {
    throw new StoryWriterError(`Claude returned an error: ${json?.error?.message ?? `HTTP ${res.status}`}`);
  }

  const text = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  let parsed: z.infer<typeof ResponseSchema>;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    parsed = ResponseSchema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    throw new StoryWriterError("Claude's reply couldn't be read — press Generate again.");
  }

  // Always hand back exactly one entry per photo, even if the model miscounted.
  return slides.map((sl, i) => ({
    headline: parsed.frames[i]?.headline.trim() ?? "",
    body: parsed.frames[i]?.body.trim() ?? "",
    focus: "image" in sl ? cleanFocus(parsed.frames[i]?.focus) : null,
  }));
}

const FOCUS_PROMPT = `For each photo, find where the main subject's face is (or the main subject, if there's no person). Give it as fractions of the photo's width and height from the top-left corner. The photo will be cropped to a tall 9:16 story around this point, so be accurate.

Respond with ONLY JSON, one entry per photo in order, no commentary:
{"points":[{"x":0.38,"y":0.62}]}`;

/**
 * Finds the subject in each photo so it can be cropped to 9:16 around it.
 * Used for library photos (sent as small thumbnails, so it's cheap). Never
 * throws: returns null for any photo it couldn't place, and the renderer
 * falls back to a center crop for those.
 */
export async function detectFocusPoints(images: string[]): Promise<(FocusPoint | null)[]> {
  const none = images.map(() => null);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || images.length === 0) return none;
  try {
    const res = await fetch(`${API_BASE}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: FOCUS_PROMPT,
        messages: [
          {
            role: "user",
            content: images.flatMap((img, i) => [
              { type: "text" as const, text: `Photo ${i + 1}:` },
              dataUrlToImageBlock(img),
            ]),
          },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) return none;
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).map((b) => b.text ?? "").join("");
    const parsed = z
      .object({ points: z.array(FocusSchema.nullable()) })
      .parse(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
    return images.map((_, i) => cleanFocus(parsed.points[i]));
  } catch {
    return none;
  }
}
