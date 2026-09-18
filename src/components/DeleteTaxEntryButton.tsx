"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteTaxEntry } from "@/app/actions/tax";

export function DeleteTaxEntryButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await deleteTaxEntry(id);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Delete entry"
      className="flex-none text-[13px] leading-none"
      style={{ color: "var(--text-mute)" }}
    >
      ×
    </button>
  );
}
