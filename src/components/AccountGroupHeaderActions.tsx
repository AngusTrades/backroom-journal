"use client";

import { useTransition } from "react";
import { renameAccountGroup, deleteAccountGroup } from "@/app/actions/account-groups";

// Rename/delete controls that sit inside a group's <summary> header on the
// Accounts dashboard. Every click here has to stop the native <summary>
// click-to-toggle behavior (preventDefault on the click itself, not just
// the eventual action) or clicking "Rename"/"Delete" would also
// collapse/expand the group's card grid underneath it.
export function AccountGroupHeaderActions({
  id,
  name,
  accountCount,
}: {
  id: string;
  name: string;
  accountCount: number;
}) {
  const [pending, startTransition] = useTransition();

  function handleRename(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = window.prompt("Rename group to:", name);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === name) return;
    startTransition(async () => {
      const res = await renameAccountGroup(id, trimmed);
      if (res && !res.ok) window.alert(res.error ?? "Couldn't rename that group.");
    });
  }

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const consequence =
      accountCount > 0
        ? ` Its ${accountCount} account${accountCount === 1 ? "" : "s"} move back to Ungrouped — nothing else about them changes.`
        : "";
    const confirmed = window.confirm(`Delete the "${name}" group?${consequence}`);
    if (!confirmed) return;
    startTransition(async () => {
      await deleteAccountGroup(id);
    });
  }

  return (
    <span className="inline-flex items-center gap-2.5" style={{ fontSize: 11.5 }}>
      <button
        type="button"
        disabled={pending}
        onClick={handleRename}
        className="link"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
      >
        Rename
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={handleDelete}
        className="link"
        style={{ color: "var(--bad)", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
      >
        Delete
      </button>
    </span>
  );
}
