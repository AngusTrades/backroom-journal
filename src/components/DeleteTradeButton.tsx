"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTrade } from "@/app/actions/trades";

export function DeleteTradeButton({
  id,
  // When set (the Edit Trade page), navigate here after deleting instead of
  // just relying on revalidation — the edit page has nothing left to show
  // once its trade is gone. Omit this on a per-row button (Journal table)
  // where staying on the same page is exactly right.
  returnTo,
  label = "Delete",
}: {
  id: string;
  returnTo?: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    const confirmed = window.confirm("Delete this trade? This can't be undone.");
    if (!confirmed) return;

    startTransition(async () => {
      await deleteTrade(id);
      if (returnTo) {
        router.push(returnTo);
      } else {
        // No page to navigate to (Journal row, account-detail row) — force
        // this page to refetch its server data so the deleted row actually
        // disappears instead of lingering until the next manual reload.
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Delete trade"
      className="link"
      style={{ color: "var(--bad)", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}
