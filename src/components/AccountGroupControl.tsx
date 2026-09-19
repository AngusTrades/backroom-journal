"use client";

import { useState, useTransition } from "react";
import { createAccountGroup, setAccountGroup } from "@/app/actions/account-groups";

type GroupOpt = { id: string; name: string };

// Quick reassignment control for an already-existing account — used on each
// Accounts-dashboard card and on the account detail page, so organizing 20
// prop-firm accounts into groups doesn't require a separate "edit account"
// form. Same immediate-commit-on-change pattern as AccountStatusControl
// (calls the server action directly, no Save button), with the same
// "+ New group…" inline-add UX as AccountGroupSelect for the case where the
// group doesn't exist yet.
export function AccountGroupControl({
  accountId,
  currentGroupId,
  groups,
}: {
  accountId: string;
  currentGroupId: string | null;
  groups: GroupOpt[];
}) {
  const [items, setItems] = useState(groups);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();

  function commit(groupId: string | null) {
    startTransition(async () => {
      await setAccountGroup(accountId, groupId);
    });
  }

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const row = await createAccountGroup(trimmed);
      if (row) {
        setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : [...prev, row]));
        setNewName("");
        setAdding(false);
        await setAccountGroup(accountId, row.id);
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5 }}>
      <select
        aria-label="Account group"
        disabled={pending}
        value={currentGroupId ?? ""}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            setAdding(true);
            return;
          }
          commit(e.target.value || null);
        }}
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text-mute)",
          fontFamily: "inherit",
          fontSize: 11.5,
          padding: "3px 6px",
          maxWidth: 140,
        }}
      >
        <option value="">Ungrouped</option>
        {items.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
        <option value="__new__">+ New group…</option>
      </select>
      {adding && (
        <span className="inline-flex items-center gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Group name"
            autoFocus
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              fontSize: 11.5,
              padding: "3px 6px",
              width: 100,
              outline: "none",
            }}
          />
          <button
            type="button"
            className="link"
            disabled={pending || !newName.trim()}
            onClick={handleAdd}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
          >
            Add
          </button>
          <button
            type="button"
            className="link"
            onClick={() => setAdding(false)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
          >
            ✕
          </button>
        </span>
      )}
    </div>
  );
}
