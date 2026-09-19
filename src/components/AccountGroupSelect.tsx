"use client";

import { useState, useTransition } from "react";
import { createAccountGroup } from "@/app/actions/account-groups";

type GroupOpt = { id: string; name: string };

// The Add Account form's group picker — same underlying pattern as
// TaxCategorySelect/PairPicker's "+ Add" flow: adding a group calls the
// server action directly and drops the new row straight into this
// component's own local list, no page-wide revalidation (see the comment on
// createAccountGroup for why that matters here specifically). Grouping is
// optional, unlike a tax category — "No group" is always the first option
// and the default.
//
// Unlike TaxCategorySelect (which needs its parent to hold the selected id,
// since picking an income/expense "kind" elsewhere changes the category
// list), the Add Account form has no other field that depends on which
// group is selected — so this manages its own selection state internally
// and can drop straight into the plain server-rendered <form
// action={createAccount}> without that form needing to become a client
// component. `value`/`onChange` are optional escape hatches for a future
// caller that does need to react to the selection.
export function AccountGroupSelect({
  initialGroups,
  value,
  onChange,
  id,
  name = "groupId",
}: {
  initialGroups: GroupOpt[];
  value?: string;
  onChange?: (id: string) => void;
  id?: string;
  name?: string;
}) {
  const [items, setItems] = useState(initialGroups);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();
  const [internalValue, setInternalValue] = useState("");
  const selected = value ?? internalValue;
  const setSelected = onChange ?? setInternalValue;

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const row = await createAccountGroup(trimmed);
      if (row) {
        setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : [...prev, row]));
        setSelected(row.id);
        setNewName("");
        setAdding(false);
      }
    });
  }

  return (
    <div>
      <select
        id={id}
        name={name}
        value={selected}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            setAdding(true);
            return;
          }
          setSelected(e.target.value);
        }}
      >
        <option value="">No group</option>
        {items.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
        <option value="__new__">+ New group…</option>
      </select>
      {adding && (
        <div className="mt-1.5 flex gap-1.5">
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
            placeholder="e.g. Apex"
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
          <button type="button" className="btn btn-ghost" disabled={pending || !newName.trim()} onClick={handleAdd}>
            Add
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
