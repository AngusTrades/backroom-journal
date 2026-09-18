"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deletePayout } from "@/app/actions/tax";

export function DeletePayoutButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      "Remove this payout? This undoes its effect on the account balance and your tax income total. This can't be undone.",
    );
    if (!confirmed) return;

    startTransition(async () => {
      await deletePayout(id);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Remove payout"
      className="link"
      style={{ color: "var(--bad)", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
