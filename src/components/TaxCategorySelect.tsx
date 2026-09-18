"use client";

import { useState, useTransition } from "react";
import { createTaxCategory } from "@/app/actions/tax";

type CategoryOpt = { id: string; name: string };

// A plain <select> (not the radio-tile grid pairs/entry models use — a tax
// category list can get long, and a dropdown is the right control for
// picking one from many) with an inline "+ New category" flow, same
// underlying pattern as PairPicker/EntryModelPicker: adding a category calls
// the server action directly and drops the new row straight into this
// component's own local list, no page-wide revalidation.
export function TaxCategorySelect({
  kind,
  initialCategories,
  value,
  onChange,
  id,
  name = "categoryId",
}: {
  kind: "income" | "expense";
  initialCategories: CategoryOpt[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
  name?: string;
}) {
  const [items, setItems] = useState(initialCategories);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const row = await createTaxCategory(kind, trimmed);
      if (row) {
        setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : [...prev, row]));
        onChange(row.id);
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
        value={value}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            setAdding(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="" disabled>
          Select…
        </option>
        {items.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="__new__">+ New category…</option>
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
            placeholder={kind === "income" ? "e.g. Lucid Payout" : "e.g. Software"}
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
