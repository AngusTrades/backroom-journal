/**
 * Keyword matching for Instagram auto-replies. Pure (no server imports) so
 * the DM Replies page can use it for its "test a message" box.
 *
 * A message matches only if the WHOLE message is the keyword, ignoring
 * capitals, punctuation, emoji and extra spaces:
 *   "challenge", "Challenge!", "  CHALLENGE 🔥" → CHALLENGE
 *   "is the challenge still open?"             → no match (a human answers)
 */
export function normalizeKeyword(text: string): string {
  return text
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchKeyword<T extends { keyword: string }>(text: string, keywords: T[]): T | null {
  const norm = normalizeKeyword(text);
  if (!norm) return null;
  return keywords.find((k) => k.keyword === norm) ?? null;
}

/** Instagram's limit for a DM text is 1000 bytes (not characters). */
export const MAX_REPLY_BYTES = 1000;
export const byteLength = (s: string) => new TextEncoder().encode(s).length;
