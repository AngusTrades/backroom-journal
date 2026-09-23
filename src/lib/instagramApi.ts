/**
 * Instagram API with Instagram Login — the pieces DM auto-replies need.
 * Works with Creator and Business accounts, no Facebook Page required.
 *
 * Meta's rules this code lives within:
 * - A DM can only be sent to someone who messaged you in the last 24h.
 * - A comment can get ONE private reply (to the commenter's DMs), within
 *   7 days of the comment.
 * - Messages are max 1000 bytes.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instagramConnections } from "@/db/schema";

// Overridable so the whole flow can be tested against a local mock.
const GRAPH_BASE = process.env.IG_GRAPH_BASE ?? "https://graph.instagram.com";
const GRAPH_VERSION = process.env.IG_GRAPH_VERSION ?? "v25.0";
const DAY_MS = 86_400_000;

export class InstagramError extends Error {}

type Conn = typeof instagramConnections.$inferSelect;

async function graph<T>(
  path: string,
  opts: { method?: "GET" | "POST"; params?: Record<string, string>; json?: unknown; token?: string; versioned?: boolean } = {},
): Promise<T> {
  const { method = "GET", params = {}, json, token, versioned = true } = opts;
  const url = new URL(`${GRAPH_BASE}${versioned ? `/${GRAPH_VERSION}` : ""}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: json !== undefined ? JSON.stringify(json) : undefined, cache: "no-store" });
  } catch {
    throw new InstagramError("Couldn't reach Instagram's API.");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; error_user_msg?: string } } & T;
  if (!res.ok || body.error) {
    throw new InstagramError(body.error?.error_user_msg || body.error?.message || `Instagram API error (HTTP ${res.status})`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Connecting + tokens
// ---------------------------------------------------------------------------

/** Validates a pasted token, upgrades/refreshes it where possible, and
 * subscribes the account to DM + comment webhooks. */
export async function connectAccount(rawToken: string) {
  let token = rawToken.trim();
  let expiresIn: number | null = null;

  // A short-lived (1h) token can be swapped for a 60-day one with the app secret.
  const appSecret = process.env.IG_APP_SECRET;
  if (appSecret) {
    try {
      const ex = await graph<{ access_token: string; expires_in: number }>("/access_token", {
        params: { grant_type: "ig_exchange_token", client_secret: appSecret, access_token: token },
        versioned: false,
      });
      token = ex.access_token;
      expiresIn = ex.expires_in;
    } catch {
      // Already long-lived — use as-is.
    }
  }

  const me = await graph<{ id: string; user_id?: string; username: string }>("/me", {
    params: { fields: "user_id,username" },
    token,
  });
  const igUserId = me.user_id ?? me.id;

  if (expiresIn === null) {
    try {
      const r = await graph<{ access_token: string; expires_in: number }>("/refresh_access_token", {
        params: { grant_type: "ig_refresh_token", access_token: token },
        versioned: false,
      });
      token = r.access_token;
      expiresIn = r.expires_in;
    } catch {
      expiresIn = 60 * 86_400; // brand-new tokens can't be refreshed for 24h
    }
  }

  // Without this, Meta never sends the webhooks for this account.
  await graph(`/${igUserId}/subscribed_apps`, {
    method: "POST",
    params: { subscribed_fields: "messages,comments" },
    token,
  });

  return { igUserId, username: me.username, accessToken: token, tokenExpiresAt: new Date(Date.now() + expiresIn * 1000) };
}

/** Refreshes the token when it's within 20 days of expiring (Meta allows a
 * refresh once it's 24h old). Called opportunistically from the webhook and
 * the DM Replies page, so no scheduled job is needed. Never throws. */
export async function refreshIfDue(conn: Conn): Promise<Conn> {
  const dueSoon = !conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() - Date.now() < 20 * DAY_MS;
  const oldEnough = Date.now() - conn.tokenRefreshedAt.getTime() > DAY_MS;
  if (!dueSoon || !oldEnough) return conn;
  try {
    const r = await graph<{ access_token: string; expires_in: number }>("/refresh_access_token", {
      params: { grant_type: "ig_refresh_token", access_token: conn.accessToken },
      versioned: false,
    });
    const [updated] = await db
      .update(instagramConnections)
      .set({
        accessToken: r.access_token,
        tokenExpiresAt: new Date(Date.now() + r.expires_in * 1000),
        tokenRefreshedAt: new Date(),
      })
      .where(eq(instagramConnections.id, conn.id))
      .returning();
    return updated ?? conn;
  } catch {
    return conn;
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** Reply to someone who DM'd the account. */
export function sendDm(conn: Conn, recipientId: string, text: string) {
  return graph(`/${conn.igUserId}/messages`, {
    method: "POST",
    token: conn.accessToken,
    json: { recipient: { id: recipientId }, message: { text } },
  });
}

/** Send a comment's author a private DM (one allowed per comment). */
export function sendPrivateReply(conn: Conn, commentId: string, text: string) {
  return graph(`/${conn.igUserId}/messages`, {
    method: "POST",
    token: conn.accessToken,
    json: { recipient: { comment_id: commentId }, message: { text } },
  });
}

/** Public reply under a comment. */
export function replyToComment(conn: Conn, commentId: string, text: string) {
  return graph(`/${commentId}/replies`, { method: "POST", token: conn.accessToken, params: { message: text } });
}

// ---------------------------------------------------------------------------
// Webhook security
// ---------------------------------------------------------------------------

/** Meta signs every webhook POST with the app secret (X-Hub-Signature-256).
 * Anything unsigned or wrongly signed is rejected, so nobody else can make
 * the account send messages by calling the webhook URL. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.IG_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
