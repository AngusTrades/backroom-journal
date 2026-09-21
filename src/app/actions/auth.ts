"use server";

import { db } from "@/db";
import { users, inviteCodes, authSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  createSessionForUser,
  destroyCurrentSession,
  getBaseUrl,
  hashPassword,
  isFirstEverUser,
  verifyPassword,
} from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";

export type AuthFormState = { error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signup(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (!name) return { error: "Enter your name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password needs to be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Those passwords don't match." };
  if (!code) return { error: "An invite code is required to sign up." };

  const [inviteRow] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
  if (!inviteRow || !inviteRow.active) {
    return { error: "That invite code isn't valid. Double-check it or ask whoever gave it to you." };
  }
  if (inviteRow.maxUses !== null && inviteRow.usesCount >= inviteRow.maxUses) {
    return { error: "That invite code has already been used up." };
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return { error: "An account with that email already exists — log in instead." };
  }

  const role = (await isFirstEverUser()) ? "admin" : "member";
  const passwordHash = await hashPassword(password);

  const [created] = await db
    .insert(users)
    .values({ name, email, passwordHash, role })
    .returning({ id: users.id });

  const nextUses = inviteRow.usesCount + 1;
  await db
    .update(inviteCodes)
    .set({
      usesCount: nextUses,
      active: inviteRow.maxUses !== null && nextUses >= inviteRow.maxUses ? false : inviteRow.active,
    })
    .where(eq(inviteCodes.id, inviteRow.id));

  await createSessionForUser(created.id);
  redirect("/");
}

export async function login(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Same generic message whether the email doesn't exist or the password is
  // wrong — doesn't tell an attacker which emails have accounts.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }

  await createSessionForUser(user.id);
  redirect("/");
}

export async function logout() {
  await destroyCurrentSession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Forgot password — request a reset link by email, then set a new password
// from the token in that link. See createPasswordResetToken/
// consumePasswordResetToken in lib/auth.ts for the token itself, and
// lib/email.ts for the actual send (via Resend).
// ---------------------------------------------------------------------------

export type ForgotPasswordFormState = { error?: string; sent?: boolean };

export async function requestPasswordReset(
  _prevState: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  const [user] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email)).limit(1);

  // Only actually send when the account exists, but always report the same
  // "sent" outcome either way — same reasoning as login's generic "invalid
  // email or password" message, so this form can't be used to check which
  // emails have an account here.
  if (user) {
    const token = await createPasswordResetToken(user.id);
    const baseUrl = await getBaseUrl();
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    const result = await sendPasswordResetEmail(email, user.name, resetUrl);
    if (!result.ok) {
      // A real send failure (Resend not configured, API error, etc.) — this
      // is the one case worth surfacing, since silently telling someone
      // "check your email" when nothing was sent would just leave them
      // stuck with no way to reset their password at all.
      console.error("[auth] password reset email failed to send:", result.error);
      return { error: "Couldn't send that email right now — try again in a bit." };
    }
  }

  return { sent: true };
}

export async function resetPassword(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) return { error: "That reset link is invalid or has expired — request a new one." };
  if (password.length < 8) return { error: "Password needs to be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Those passwords don't match." };

  const consumed = await consumePasswordResetToken(token);
  if (!consumed) return { error: "That reset link is invalid or has expired — request a new one." };

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, consumed.userId));

  // A password reset should log the member out everywhere it's currently
  // signed in — the whole point is that whatever the old password was
  // shouldn't keep working, on this device or any other.
  await db.delete(authSessions).where(eq(authSessions.userId, consumed.userId));

  redirect("/login?reset=1");
}
