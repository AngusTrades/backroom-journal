import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BrandCrest } from "@/components/BrandCrest";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { token } = await searchParams;

  return (
    <div className="auth-shell">
      <div className="card card-pad auth-card">
        <div className="auth-brand">
          <BrandCrest size={22} />
          <span className="auth-brand-name">
            THE <b>BACKROOM</b>
          </span>
        </div>
        <h3 style={{ marginBottom: 2 }}>Set a new password</h3>

        {!token ? (
          <>
            <div className="sub" style={{ marginBottom: 16 }}>
              That link is missing its reset token — copy the link from the email again, or request a new one.
            </div>
            <div className="auth-error">Invalid or missing reset link.</div>
          </>
        ) : (
          <>
            <div className="sub" style={{ marginBottom: 16 }}>
              Choose a new password for your account.
            </div>
            <ResetPasswordForm token={token} />
          </>
        )}

        <div className="auth-footer">
          <Link href="/forgot-password" className="link">
            Request a new link
          </Link>{" "}
          ·{" "}
          <Link href="/login" className="link">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
