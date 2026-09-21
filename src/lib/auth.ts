/**
 * Auth core — password hashing, session tokens, and the current-user lookup
 * every page/action uses to scope data to one member.
 *
 * Deliberately NOT a JWT: session tokens are opaque random strings stored in
 * `auth_sessions` (see schema.ts), so a logout — or August revoking someone —
 * actually invalidates the session server-side instead of just deleting a
 * cookie the token would otherwise still be valid until.
 *
 * Password hashing uses Node's built-in `crypto.scrypt` (no extra dependency,
 * no native bindings to worry about) — a random per-password salt plus a
 * scrypt-derived key, stored together as "salt:hash" hex.
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, passwordResetTokens, users } from "@/db/schema";

export const SESSION_COOKIE = "backroom_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — short-lived, matches most "forgot password" conventions

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
};

// Password hashing/verification live in ./password.ts (no Next.js imports,
// so it's also usable from standalone scripts like db/seed.ts) — re-exported
// here so most of the app can just import everything from @/lib/auth.
export { hashPassword, verifyPassword } from "./password";

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export async function createSessionForUser(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(authSessions).values({ token, userId, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(authSessions).where(eq(authSessions.token, token));
  }
  cookieStore.delete(SESSION_COOKIE);
}

// Deduped per request — every page/action that calls this within the same
// request only hits the DB once.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(eq(authSessions.token, token), gt(authSessions.expiresAt, new Date())))
    .limit(1);

  return rows[0] ?? null;
});

/** Call at the top of any protected page/layout. Redirects if signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Call at the top of an admin-only page. 404s (not just redirects) for a
 * signed-in non-admin so the page's existence isn't obviously advertised. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/** True only for the very first account ever created — used to auto-promote
 * the first signup to admin so there's always someone who can issue invite
 * codes without needing direct DB access. */
export async function isFirstEverUser(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length === 0;
}

// ---------------------------------------------------------------------------
// Password reset — one-time, 1-hour tokens (see the comment on
// passwordResetTokens in schema.ts). Mirrors createSessionForUser's shape:
// a random opaque token stored server-side, not a self-contained signed
// link, so a token can actually be invalidated (used, expired, or
// superseded by a newer request) rather than just trusting its own expiry.
// ---------------------------------------------------------------------------

/** Issues a fresh reset token for this user, clearing out any older ones
 * first so only the most recently emailed link ever works — an old reset
 * email sitting in an inbox can't be replayed after a newer one was
 * requested. */
export async function createPasswordResetToken(userId: string): Promise<string> {
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await db.insert(passwordResetTokens).values({ token, userId, expiresAt });
  return token;
}

/** Validates and consumes a reset token in one step — a token can only ever
 * be used once, expired or not, since this deletes it either way it's
 * looked up. Returns the userId it was issued for, or null if the token
 * doesn't exist or has expired. */
export async function consumePasswordResetToken(token: string): Promise<{ userId: string } | null> {
  const rows = await db
    .select({ userId: passwordResetTokens.userId, expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);
  const row = rows[0];
  if (row) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  }
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return { userId: row.userId };
}

/** The site's own base URL, for building an absolute link in an email (a
 * relative path means nothing once it's outside the browser). Prefers an
 * explicit APP_URL (useful for a custom domain or a non-default
 * environment) and otherwise derives it from the incoming request's own
 * host — works out of the box on Vercel with no extra configuration. */
export async function getBaseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
