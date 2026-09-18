"use client";

import { useState, useTransition } from "react";
import { createSetup, deleteSetup } from "@/app/actions/setups";

type Setup = { id: string; name: string };

export function ConfluencePicker({
  initialSetups,
  initialCheckedIds,
}: {
  initialSetups: Setup[];
  // Pre-check these ids — used by the Edit Trade page to restore which
  // confluences were already tagged on the trade being edited. Add Trade
  // omits this and everything starts unchecked, same as before.
  initialCheckedIds?: string[];
}) {
  const [items, setItems] = useState(initialSetups);
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((initialCheckedIds ?? []).map((id) => [id, true])),
  );
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const row = await createSetup(name);
      if (row) {
        setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : [...prev, row]));
        setChecked((prev) => ({ ...prev, [row.id]: true }));
        setNewName("");
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      await deleteSetup(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setChecked((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });
  }

  return (
    <div>
      <div
        className="grid grid-cols-3 gap-x-3 gap-y-1.5 rounded-[9px] border p-3 max-h-[220px] overflow-auto"
        style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}
      >
        {items.length === 0 && (
          <div className="col-span-3 py-2 text-[12px]" style={{ color: "var(--text-mute)" }}>
            No confluences yet — add your first one below.
          </div>
        )}
        {items.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-soft)" }}>
            <label className="flex min-w-0 flex-1 items-center gap-1.5">
              <input
                type="checkbox"
                name="setupIds"
                value={s.id}
                checked={!!checked[s.id]}
                onChange={(e) => setChecked((prev) => ({ ...prev, [s.id]: e.target.checked }))}
              />
              <span className="truncate">{s.name}</span>
            </label>
            <button
              type="button"
              onClick={() => handleRemove(s.id)}
              aria-label={`Remove ${s.name}`}
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
          placeholder="New confluence / strategy name"
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
