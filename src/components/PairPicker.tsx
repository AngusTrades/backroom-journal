"use client";

import { useState, useTransition } from "react";
import { createPair, deletePair } from "@/app/actions/pairs";

type PairOpt = { id: string; symbol: string };

// Single-select version of EntryModelPicker — every member builds their own
// pair list from scratch via "+ Add" (so someone who only trades NQ and GC
// just adds those two), same pattern as entry models/confluences.
export function PairPicker({
  initialPairs,
  defaultSelectedId,
}: {
  initialPairs: PairOpt[];
  // Pre-select this id — used by the Edit Trade page to restore which pair
  // was already on the trade being edited. Add Trade omits this and starts
  // with nothing selected, same as before.
  defaultSelectedId?: string;
}) {
  const [items, setItems] = useState(initialPairs);
  const [selected, setSelected] = useState(defaultSelectedId ?? "");
  const [newSymbol, setNewSymbol] = useState("");
  const [blockedNote, setBlockedNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    const symbol = newSymbol.trim();
    if (!symbol) return;
    startTransition(async () => {
      const row = await createPair(symbol);
      if (row) {
        setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : [...prev, row]));
        setSelected(row.id);
        setNewSymbol("");
      }
    });
  }

  function handleRemove(id: string, symbol: string) {
    setBlockedNote(null);
    startTransition(async () => {
      const { deleted, inUse } = await deletePair(id);
      if (deleted) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setSelected((prev) => (prev === id ? "" : prev));
      } else if (inUse) {
        setBlockedNote(`${symbol} is used on an existing trade, so it can't be removed.`);
      }
    });
  }

  return (
    <div>
      {/* The real field the form submits — kept in sync with the radio
          selection below so createTrade() sees it as pairId, exactly like
          the old <select>. */}
      <input type="hidden" name="pairId" value={selected} />

      <div
        className="grid grid-cols-3 gap-x-3 gap-y-1.5 rounded-[9px] border p-3 max-h-[160px] overflow-auto"
        style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}
      >
        {items.length === 0 && (
          <div className="col-span-3 py-2 text-[12px]" style={{ color: "var(--text-mute)" }}>
            No pairs yet — add the ones you actually trade below (e.g. NQ, GC).
          </div>
        )}
        {items.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-soft)" }}>
            <label className="flex min-w-0 flex-1 items-center gap-1.5">
              <input
                type="radio"
                name="pairIdRadio"
                value={p.id}
                checked={selected === p.id}
                onChange={() => setSelected(p.id)}
              />
              <span className="truncate mono">{p.symbol}</span>
            </label>
            <button
              type="button"
              onClick={() => handleRemove(p.id, p.symbol)}
              aria-label={`Remove ${p.symbol}`}
              className="flex-none text-[13px] leading-none"
              style={{ color: "var(--text-mute)" }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {blockedNote && (
        <div className="mt-1.5 text-[11px]" style={{ color: "var(--text-mute)" }}>
          {blockedNote}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={newSymbol}
          onChange={(e) => setNewSymbol(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="New pair (e.g. NQ)"
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
        <button type="button" className="btn btn-ghost" disabled={pending || !newSymbol.trim()} onClick={handleAdd}>
          + Add
        </button>
      </div>
    </div>
  );
}
