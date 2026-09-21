/**
 * Outbound email — currently just the "forgot password" reset link, via
 * Resend (a simple transactional-email API that works well on Vercel). No
 * other part of the app sends email yet.
 *
 * The Resend client is built lazily from RESEND_API_KEY so importing this
 * file never throws when that env var isn't set — e.g. in local dev before
 * Resend is configured — instead sendPasswordResetEmail below reports a
 * clear error the caller can show or log, rather than the whole app failing
 * to build or boot. See .env.example for the env vars this needs
 * (RESEND_API_KEY, RESEND_FROM_EMAIL).
 */
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Resend's own shared test domain — works out of the box with zero setup,
// but Resend will only actually deliver mail sent "from" it to the email
// address on the Resend account itself. Real delivery to members needs a
// verified sending domain and RESEND_FROM_EMAIL set to an address on it —
// see .env.example.
const FROM = process.env.RESEND_FROM_EMAIL || "The Backroom <onboarding@resend.dev>";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.error("[email] RESEND_API_KEY isn't set — can't send the password reset email. See .env.example.");
    return { ok: false, error: "Email isn't configured yet." };
  }

  const text = [
    `Hi ${name},`,
    "",
    "Someone (hopefully you) asked to reset your Backroom password.",
    "",
    `Reset it here: ${resetUrl}`,
    "",
    "This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p>Hi ${escapeHtml(name)},</p>
      <p>Someone (hopefully you) asked to reset your Backroom password.</p>
      <p style="margin: 28px 0;">
        <a href="${resetUrl}" style="background: #111111; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
          Reset your password
        </a>
      </p>
      <p style="color: #666666; font-size: 13px;">
        This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.
      </p>
      <p style="color: #999999; font-size: 12px; word-break: break-all;">${escapeHtml(resetUrl)}</p>
    </div>
  `.trim();

  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject: "Reset your Backroom password", text, html });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to send email." };
  }
}
