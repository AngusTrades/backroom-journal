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
- Exactly one frame per photo, in the order given. Look at each photo and write text that fits it.
- headline: max 7 words. body: max 22 words, can be an empty string if the headline says it all.
- The frames read as a sequence: frame 1 hooks, the last frame carries any call to action.
- No hashtags. At most one emoji per frame, usually none.
- Never promise profits, guaranteed returns, or income. Results are framed as August's own, past results.
- August posts these himself and adds any link stickers, polls or tags in the Instagram app. If the brief wants people to go somewhere, a short CTA like "Tap the link" or "DM me [WORD]" is fine; don't write out URLs.
- Only use facts from the brief or clearly visible in the photos. Don't invent numbers.

Respond with ONLY a JSON object, no markdown fences, no commentary:
{"frames":[{"headline":"...","body":"..."}]}`;

const ResponseSchema = z.object({
  frames: z.array(z.object({ headline: z.string(), body: z.string().default("") })),
});

export type FrameCopy = { headline: string; body: string };

export class StoryWriterError extends Error {}

function dataUrlToImageBlock(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new StoryWriterError("One of the photos isn't a valid image.");
  return { type: "image" as const, source: { type: "base64" as const, media_type: match[1], data: match[2] } };
}

export async function writeStoryCopy(brief: string, photos: string[]): Promise<FrameCopy[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new StoryWriterError("ANTHROPIC_API_KEY isn't set — add it in Vercel's environment variables.");
  }

  const content = [
    ...photos.flatMap((p, i) => [{ type: "text" as const, text: `Photo ${i + 1}:` }, dataUrlToImageBlock(p)]),
    { type: "text" as const, text: `Brief from August:\n${brief}\n\nWrite ${photos.length} frame(s).` },
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
  return photos.map((_, i) => ({
    headline: parsed.frames[i]?.headline.trim() ?? "",
    body: parsed.frames[i]?.body.trim() ?? "",
  }));
}
