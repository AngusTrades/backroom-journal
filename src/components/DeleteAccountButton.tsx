"use client";

import { useTransition } from "react";
import { deleteAccount } from "@/app/actions/accounts";

export function DeleteAccountButton({
  id,
  name,
  tradeCount,
  totalPayouts,
}: {
  id: string;
  name: string;
  tradeCount: number;
  totalPayouts: number;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const parts: string[] = [];
    if (tradeCount > 0) parts.push(`${tradeCount} logged trade${tradeCount === 1 ? "" : "s"}`);
    if (totalPayouts > 0) parts.push("its payout history");
    const consequence = parts.length ? ` This also permanently deletes ${parts.join(" and ")}.` : "";

    const confirmed = window.confirm(`Delete "${name}"?${consequence} This can't be undone.`);
    if (!confirmed) return;

    startTransition(async () => {
      await deleteAccount(id);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={`Delete ${name}`}
      className="link"
      style={{ color: "var(--bad)", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
