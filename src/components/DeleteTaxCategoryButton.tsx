"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteTaxCategoryWithEntries } from "@/app/actions/tax";

// Sits inside a <summary> (TaxEntryCategorySection's category header), so a
// click needs preventDefault + stopPropagation or the browser's native
// <details> toggle fires too and the accordion flips open/closed right as
// the confirm dialog appears. Bulk-deletes every entry filed under this
// category plus the category itself — the "clear out a whole category" tool
// next to each entry's own DeleteTaxEntryButton (the × on each line), for
// when there are dozens of entries to scrap rather than one at a time.
export function DeleteTaxCategoryButton({ categoryId, categoryName, count }: { categoryId: string; categoryName: string; count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const noun = count === 1 ? "entry" : "entries";
    if (!window.confirm(`Delete "${categoryName}" and all ${count} ${noun} in it? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteTaxCategoryWithEntries(categoryId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="btn btn-ghost"
      style={{ fontSize: 11, padding: "3px 8px" }}
    >
      {pending ? "Deleting…" : "Delete category"}
    </button>
  );
}
