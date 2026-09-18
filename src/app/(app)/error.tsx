"use client";

import { useEffect } from "react";
import Link from "next/link";

// Error boundary for everything inside the signed-in app shell (Journal,
// Add/Edit Trade, Analytics, Accounts, etc.) — the sidebar layout above
// this stays mounted, so only the page content is swapped for this card.
// Anything that still throws here (a real bug, a tampered request) now
// lands on a plain "something went wrong" card instead of Next's raw
// stack-trace overlay/crash page. The common, expected mistakes (forgot to
// pick a pair, left a required field blank) are handled inline on their
// own forms and never reach this boundary at all.
export default function AppError({
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
    <div className="card card-pad" style={{ maxWidth: 460, margin: "80px auto", textAlign: "center" }}>
      <h3 style={{ marginBottom: 8 }}>Something went wrong</h3>
      <div className="sub" style={{ marginBottom: 18 }}>
        Nothing else on your account was touched. Try again, or head back to the Journal.
      </div>
      <div className="flex items-center justify-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          Try again
        </button>
        <Link href="/" className="btn btn-ghost">
          Back to Journal
        </Link>
      </div>
    </div>
  );
}
