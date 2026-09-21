"use client";

import { useState, useTransition } from "react";
import { createAccountQuick } from "@/app/actions/accounts";

type AccountOpt = { id: string; name: string };

// The "Log a Payout" form's account picker — same underlying "+ New X…"
// pattern as AccountGroupSelect/TaxCategorySelect: adding an account calls
// createAccountQuick directly and drops the new row straight into this
// component's own local list, no page-wide revalidation, so logging a
// payout against a brand-new account doesn't need a trip to the Accounts
// page first. Uncontrolled (manages its own selection state, like
// AccountGroupSelect) so it drops straight into the plain server-rendered
// <form action={createPayout}> on the Budgeting page without that form
// needing to become a client component.
export function PayoutAccountSelect({
  initialAccounts,
  id,
  name = "accountId",
}: {
  initialAccounts: AccountOpt[];
  id?: string;
  name?: string;
}) {
  const [items, setItems] = useState(initialAccounts);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFirm, setNewFirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const row = await createAccountQuick(trimmed, newFirm);
      if (row) {
        setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : [...prev, row]));
        setSelected(row.id);
        setNewName("");
        setNewFirm("");
        setAdding(false);
      }
    });
  }

  return (
    <div>
      <select
        id={id}
        name={name}
        required
        value={selected}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            setAdding(true);
            return;
          }
          setSelected(e.target.value);
        }}
      >
        <option value="" disabled>
          Select…
        </option>
        {items.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
        <option value="__new__">+ New account…</option>
      </select>
      {adding && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Account name — e.g. Apex 50k #2"
            autoFocus
            className="min-w-0 flex-1"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              color: "var(--text)",
              fontFamily: "var(--font-data)",
              fontSize: 13,
              padding: "6px 8px",
              outline: "none",
            }}
          />
          <input
            type="text"
            value={newFirm}
            onChange={(e) => setNewFirm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Firm — e.g. Apex (optional)"
            className="min-w-0 flex-1"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              color: "var(--text)",
              fontFamily: "var(--font-data)",
              fontSize: 13,
              padding: "6px 8px",
              outline: "none",
            }}
          />
          <div className="flex gap-1.5">
            <button type="button" className="btn btn-ghost" disabled={pending || !newName.trim()} onClick={handleAdd}>
              Add
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setAdding(false);
                setNewName("");
                setNewFirm("");
              }}
            >
              Cancel
            </button>
          </div>
          <div className="sub" style={{ fontSize: 11 }}>
            Created as a Prop Firm account — set its size, status, or group later from Accounts if you want the fuller picture there.
          </div>
        </div>
      )}
    </div>
  );
}
