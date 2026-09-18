"use client";

import { useEffect } from "react";
import { BrandCrest } from "@/components/BrandCrest";

// Top-level fallback for anything outside the signed-in app shell (login,
// signup) — those routes don't have (app)/error.tsx's sidebar layout above
// them, so this gets its own small centered card instead. Root layout
// crashes still fall through to global-error.tsx (Next's default in that
// case), but the root layout here only renders <html>/<head>/<body> and
// doesn't fetch or compute anything, so that's not a realistic path.
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="auth-shell">
      <div className="card card-pad auth-card" style={{ textAlign: "center" }}>
        <div className="auth-brand" style={{ justifyContent: "center" }}>
          <BrandCrest size={22} />
          <span className="auth-brand-name">
            THE <b>BACKROOM</b>
          </span>
        </div>
        <h3 style={{ marginBottom: 8 }}>Something went wrong</h3>
        <div className="sub" style={{ marginBottom: 18 }}>
          Try again — if it keeps happening, let August know what you were doing.
        </div>
        <button type="button" className="btn btn-primary w-full justify-center" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </div>
  );
}
