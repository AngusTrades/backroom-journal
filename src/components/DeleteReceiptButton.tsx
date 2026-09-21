"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteReceipt } from "@/app/actions/receipts";

// Same confirm-then-delete pattern as DeletePayoutButton/UndoImportBatchButton.
export function DeleteReceiptButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Delete this receipt?")) return;
    startTransition(async () => {
      await deleteReceipt(id);
      router.refresh();
    });
  }

  return (
    <button type="button" className="btn btn-ghost" disabled={pending} onClick={handleClick}>
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
