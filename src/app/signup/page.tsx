import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BrandCrest } from "@/components/BrandCrest";
import { SignupForm } from "@/components/SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
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
        <h3 style={{ marginBottom: 2 }}>Create your account</h3>
        <div className="sub" style={{ marginBottom: 16 }}>
          You&apos;ll need an invite code from The Backroom to sign up.
        </div>
        <SignupForm />
        <div className="auth-footer">
          Already have an account?{" "}
          <Link href="/login" className="link">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
