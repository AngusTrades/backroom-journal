"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteImportBatch } from "@/app/actions/tax";

// Same window.confirm pattern as the existing account/trade delete buttons —
// undoing an import deletes every entry it created (cascade delete on the
// batch row), so it's worth a confirm.
export function UndoImportBatchButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Undo this import? Every entry it created will be deleted.")) return;
    startTransition(async () => {
      await deleteImportBatch(id);
      router.refresh();
    });
  }

  return (
    <button type="button" className="btn btn-ghost" disabled={pending} onClick={handleClick}>
      {pending ? "Undoing…" : "Undo"}
    </button>
  );
}
