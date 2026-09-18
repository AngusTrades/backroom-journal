"use client";

import { useTransition } from "react";
import { markAccountBlown, reactivateAccount } from "@/app/actions/accounts";

// A quick, non-destructive way to take an account out of active rotation.
// Unlike Delete, this never touches trades or payouts — it just flips the
// account's status, so payout history stays intact and gets tagged as
// coming from a blown account.
export function AccountStatusControl({ id, name, status }: { id: string; name: string; status: string }) {
  const [pending, startTransition] = useTransition();

  if (status === "failed") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => { await reactivateAccount(id); })}
        aria-label={`Reactivate ${name}`}
        className="link"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
      >
        {pending ? "…" : "↺ Reactivate"}
      </button>
    );
  }

  function handleBlow() {
    const confirmed = window.confirm(
      `Mark "${name}" as blown? It drops out of your active accounts, but every trade and payout tied to it stays exactly as-is — future payouts from it will just show as coming from a blown account. You can reactivate it anytime.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      await markAccountBlown(id);
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleBlow}
      aria-label={`Mark ${name} as blown`}
      className="link"
      style={{ color: "var(--bad)", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
    >
      {pending ? "…" : "✕ Blown"}
    </button>
  );
}
