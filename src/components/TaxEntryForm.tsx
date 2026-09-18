"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { createTaxEntry, type TaxEntryFormState } from "@/app/actions/tax";
import { TaxCategorySelect } from "@/components/TaxCategorySelect";

type CategoryOpt = { id: string; name: string };

const initialState: TaxEntryFormState = {};

// Same controlled-fields + manual-dispatch pattern as AddTradeForm/
// EditTradeForm (see the longer comment there for why) — every field here
// is real React state and submission goes through onSubmit + startTransition
// instead of <form action={fn}>, so this form never engages React 19's
// reset-everything-on-submit behavior. A fresh form built after that bug was
// found, so it starts out right rather than needing the same fix later.
export function TaxEntryForm({ kind, initialCategories }: { kind: "income" | "expense"; initialCategories: CategoryOpt[] }) {
  const [state, formAction, pending] = useActionState(createTaxEntry, initialState);
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const submittedRef = useRef(false);

  // `state` is a fresh object literal every time the action returns
  // successfully ({} !== the initialState constant), so this only fires
  // after an actual successful submit — not on first mount.
  useEffect(() => {
    if (submittedRef.current && state !== initialState && !state.error) {
      setCategoryId("");
      setAmount("");
      setDescription("");
      submittedRef.current = false;
    }
  }, [state]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submittedRef.current = true;
    startTransition(() => {
      formAction(formData);
    });
  }

  const idPrefix = `tax-${kind}`;

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-4">
      <input type="hidden" name="kind" value={kind} />
      <div className="field">
        <label htmlFor={`${idPrefix}-date`}>Date</label>
        <input
          type="date"
          id={`${idPrefix}-date`}
          name="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-category`}>Category</label>
        <TaxCategorySelect
          id={`${idPrefix}-category`}
          kind={kind}
          initialCategories={initialCategories}
          value={categoryId}
          onChange={setCategoryId}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-amount`}>Amount ($)</label>
        <input
          type="number"
          id={`${idPrefix}-amount`}
          name="amount"
          step="0.01"
          min="0"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-description`}>Description (optional)</label>
        <input
          type="text"
          id={`${idPrefix}-description`}
          name="description"
          placeholder={kind === "income" ? "e.g. Affiliate payout — August" : "e.g. Apex 150k eval reset"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {state.error && (
        <div className="form-error md:col-span-4" style={{ marginBottom: 0 }}>
          {state.error}
        </div>
      )}
      <div className="field md:col-span-4 flex items-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : kind === "income" ? "+ Log Income" : "+ Log Expense"}
        </button>
      </div>
    </form>
  );
}
