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
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, users } from "@/db/schema";

export const SESSION_COOKIE = "backroom_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
