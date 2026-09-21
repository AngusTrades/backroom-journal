"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AccountOpt = { id: string; name: string; groupId: string | null; firm: string | null };
type GroupOpt = { id: string; name: string };

// Lets a trade be journaled against several accounts/firms in one submit —
// e.g. the same signal taken on 5 separate Apex accounts. Checked ids go out
// as repeated `accountIds` checkbox values (same "name+value, no hidden
// input needed" pattern as ConfluencePicker's setupIds), so the server side
// just does `formData.getAll("accountIds")`.
//
// Accounts are grouped exactly like the Accounts page — each group gets its
// own "select all in this group" checkbox (indeterminate when only some of
// its accounts are checked) above its member accounts, with an "Ungrouped"
// bucket at the end for anything with no group.
export function AccountMultiSelect({
  accounts,
  groups,
  initialCheckedIds,
}: {
  accounts: AccountOpt[];
  groups: GroupOpt[];
  // Pre-check these ids — not currently used by Add Trade (everything
  // starts unchecked there), kept for symmetry with ConfluencePicker/
  // EntryModelPicker in case a future "duplicate this trade" flow wants it.
  initialCheckedIds?: string[];
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((initialCheckedIds ?? []).map((id) => [id, true])),
  );

  const byGroup = useMemo(() => {
    const map = new Map<string, AccountOpt[]>();
    for (const a of accounts) {
      const key = a.groupId && groups.some((g) => g.id === a.groupId) ? a.groupId : "__ungrouped";
      const list = map.get(key);
      if (list) list.push(a);
      else map.set(key, [a]);
    }
    return map;
  }, [accounts, groups]);

  function toggleOne(id: string, value: boolean) {
    setChecked((prev) => ({ ...prev, [id]: value }));
  }

  function toggleGroup(ids: string[], value: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = value;
      return next;
    });
  }

  const checkedCount = Object.values(checked).filter(Boolean).length;

  if (accounts.length === 0) {
    return <div className="sub">No accounts yet — add one on the Accounts page first.</div>;
  }

  return (
    <div>
      <div
        className="rounded-[9px] border p-3 max-h-[280px] overflow-auto"
        style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}
      >
        {groups.map((g) => {
          const members = byGroup.get(g.id) ?? [];
          if (members.length === 0) return null;
          return (
            <GroupBlock
              key={g.id}
              title={g.name}
              accounts={members}
              checked={checked}
              onToggleOne={toggleOne}
              onToggleAll={(value) => toggleGroup(members.map((a) => a.id), value)}
            />
          );
        })}
        {(byGroup.get("__ungrouped") ?? []).length > 0 && (
          <GroupBlock
            title={groups.length > 0 ? "Ungrouped" : null}
            accounts={byGroup.get("__ungrouped") ?? []}
            checked={checked}
            onToggleOne={toggleOne}
            onToggleAll={(value) => toggleGroup((byGroup.get("__ungrouped") ?? []).map((a) => a.id), value)}
          />
        )}
      </div>
      <div className="sub" style={{ marginTop: 4 }}>
        {checkedCount === 0
          ? "Select one or more accounts — check a whole group to journal this trade on every account in it."
          : `${checkedCount} account${checkedCount === 1 ? "" : "s"} selected — this trade will be logged on each one.`}
      </div>
    </div>
  );
}

function GroupBlock({
  title,
  accounts,
  checked,
  onToggleOne,
  onToggleAll,
}: {
  title: string | null;
  accounts: AccountOpt[];
  checked: Record<string, boolean>;
  onToggleOne: (id: string, value: boolean) => void;
  onToggleAll: (value: boolean) => void;
}) {
  const checkedInGroup = accounts.filter((a) => checked[a.id]).length;
  const allChecked = checkedInGroup === accounts.length;
  const someChecked = checkedInGroup > 0 && !allChecked;
  const groupCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (groupCheckboxRef.current) groupCheckboxRef.current.indeterminate = someChecked;
  }, [someChecked]);

  return (
    <div style={{ marginBottom: 10 }}>
      {title && (
        <label
          className="flex items-center gap-1.5 text-[12px]"
          style={{ color: "var(--text-soft)", fontWeight: 600, marginBottom: 3 }}
        >
          <input
            ref={groupCheckboxRef}
            type="checkbox"
            checked={allChecked}
            onChange={(e) => onToggleAll(e.target.checked)}
          />
          {title}{" "}
          <span className="sub" style={{ fontWeight: 400 }}>
            ({accounts.length})
          </span>
        </label>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1" style={{ paddingLeft: title ? 20 : 0 }}>
        {accounts.map((a) => (
          <label key={a.id} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-soft)" }}>
            <input
              type="checkbox"
              name="accountIds"
              value={a.id}
              checked={!!checked[a.id]}
              onChange={(e) => onToggleOne(a.id, e.target.checked)}
            />
            <span className="truncate">
              {a.name}
              {a.firm ? <span className="sub"> · {a.firm}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
