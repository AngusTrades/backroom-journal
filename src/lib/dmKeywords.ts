/**
 * Keyword matching for Instagram auto-replies. Pure (no server imports) so
 * the DM Replies page can use it for its "test a message" box.
 *
 * Capitals, punctuation, emoji and extra spaces are always ignored. Each
 * keyword has a match mode:
 *   exact    — the whole message must be the keyword:
 *              "Challenge!" → CHALLENGE, "is the challenge open?" → no match
 *   contains — the keyword appears anywhere, as whole word(s):
 *              "is the challenge open?" → CHALLENGE, "challenges" → no match
 * When several keywords fit, an exact match wins, then the longest keyword
 * (so "THE BACKROOM" beats "BACKROOM").
 */
export function normalizeKeyword(text: string): string {
  return text
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type MatchMode = "exact" | "contains";

export function matchKeyword<T extends { keyword: string; matchMode?: string }>(text: string, keywords: T[]): T | null {
  const norm = normalizeKeyword(text);
  if (!norm) return null;
  const exact = keywords.find((k) => k.keyword === norm);
  if (exact) return exact;
  const padded = ` ${norm} `;
  const contained = keywords
    .filter((k) => k.matchMode === "contains" && k.keyword && padded.includes(` ${k.keyword} `))
    .sort((a, b) => b.keyword.length - a.keyword.length);
  return contained[0] ?? null;
}

/** Instagram's limit for a DM text is 1000 bytes (not characters). */
export const MAX_REPLY_BYTES = 1000;
export const byteLength = (s: string) => new TextEncoder().encode(s).length;
