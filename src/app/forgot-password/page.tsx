import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BrandCrest } from "@/components/BrandCrest";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="auth-shell">
      <div className="card card-pad auth-card">
        <div className="auth-brand">
          <BrandCrest size={22} />
          <span className="auth-brand-name">
            THE <b>BACKROOM</b>
          </span>
        </div>
        <h3 style={{ marginBottom: 2 }}>Reset your password</h3>
        <div className="sub" style={{ marginBottom: 16 }}>
          Enter the email on your account and we&apos;ll send you a link to set a new password.
        </div>
        <ForgotPasswordForm />
        <div className="auth-footer">
          <Link href="/login" className="link">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
