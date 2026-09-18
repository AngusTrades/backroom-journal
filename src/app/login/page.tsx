import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BrandCrest } from "@/components/BrandCrest";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
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
        <h3 style={{ marginBottom: 2 }}>Sign in</h3>
        <div className="sub" style={{ marginBottom: 16 }}>
          Member Desk — your own journal, accounts, and analytics.
        </div>
        <LoginForm />
        <div className="auth-footer">
          New here?{" "}
          <Link href="/signup" className="link">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
