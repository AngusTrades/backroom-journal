"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSessionLog } from "@/app/actions/session-logs";

export function DeleteSessionLogButton({
  id,
  // When set (the Edit Session Entry page), navigate here after deleting.
  // Omit this on a per-row button (the Market Bias table) where staying on
  // the same page — refreshed in place — is exactly right.
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
    const confirmed = window.confirm("Delete this session entry? This can't be undone.");
    if (!confirmed) return;

    startTransition(async () => {
      await deleteSessionLog(id);
      if (returnTo) {
        router.push(returnTo);
      } else {
        // No page to navigate to — force this page to refetch its server
        // data so the deleted row actually disappears instead of lingering
        // until the next manual reload (same fix applied to trade deletes).
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Delete session entry"
      className="link"
      style={{ color: "var(--bad)", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}
