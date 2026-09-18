"use client";

import { useState, useTransition } from "react";
import { createEntryModel, deleteEntryModel } from "@/app/actions/entry-models";

type EntryModelOpt = { id: string; name: string };

// Single-select version of ConfluencePicker — every member builds their own
// entry-model list from scratch via "+ Add", same pattern as confluences,
// just one selection per trade instead of many.
export function EntryModelPicker({
  initialEntryModels,
  defaultSelectedId,
}: {
  initialEntryModels: EntryModelOpt[];
  // Pre-select this id — used by the Edit Trade page to restore which entry
  // model was already on the trade being edited. Add Trade omits this and
  // starts with nothing selected, same as before.
  defaultSelectedId?: string;
}) {
  const [items, setItems] = useState(initialEntryModels);
  const [selected, setSelected] = useState(defaultSelectedId ?? "");
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const row = await createEntryModel(name);
      if (row) {
        setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : [...prev, row]));
        setSelected(row.id);
        setNewName("");
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      await deleteEntryModel(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelected((prev) => (prev === id ? "" : prev));
    });
  }

  return (
    <div>
      {/* The real field the form submits — kept in sync with the radio
          selection below so createTrade() sees it as entryModelId, exactly
          like the old <select>. */}
      <input type="hidden" name="entryModelId" value={selected} />

      <div
        className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-[9px] border p-3 max-h-[160px] overflow-auto"
        style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}
      >
        {items.length === 0 && (
          <div className="col-span-2 py-2 text-[12px]" style={{ color: "var(--text-mute)" }}>
            No entry models yet — add your first one below.
          </div>
        )}
        {items.map((e) => (
          <div key={e.id} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-soft)" }}>
            <label className="flex min-w-0 flex-1 items-center gap-1.5">
              <input
                type="radio"
                name="entryModelIdRadio"
                value={e.id}
                checked={selected === e.id}
                onChange={() => setSelected(e.id)}
              />
              <span className="truncate">{e.name}</span>
            </label>
            <button
              type="button"
              onClick={() => handleRemove(e.id)}
              aria-label={`Remove ${e.name}`}
              className="flex-none text-[13px] leading-none"
              style={{ color: "var(--text-mute)" }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
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
          placeholder="New entry model name"
          className="min-w-0 flex-1"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            color: "var(--text)",
            fontFamily: "var(--font-data)",
            fontSize: 13,
            padding: "8px 10px",
            outline: "none",
          }}
        />
        <button type="button" className="btn btn-ghost" disabled={pending || !newName.trim()} onClick={handleAdd}>
          + Add
        </button>
      </div>
    </div>
  );
}
