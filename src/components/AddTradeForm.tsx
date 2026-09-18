"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { createTrade, type TradeFormState } from "@/app/actions/trades";
import { ConfluencePicker } from "@/components/ConfluencePicker";
import { EntryModelPicker } from "@/components/EntryModelPicker";
import { PairPicker } from "@/components/PairPicker";
import { ChartImageInput } from "@/components/ChartImageInput";
import { RrOutcomeFields } from "@/components/RrOutcomeFields";

type Opt = { id: string; name: string };
type PairOpt = { id: string; symbol: string };
type SetupOpt = { id: string; name: string };

const initialState: TradeFormState = {};

// Every plain field below (date/account/position/session/pnl/narrative) is
// a CONTROLLED input, not defaultValue-based — belt-and-suspenders with the
// custom submit handling below (see handleSubmit) that keeps this form out
// of React's own automatic reset-on-submit behavior in the first place.
export function AddTradeForm({
  accounts,
  pairs,
  entryModels,
  sessions,
  setups,
  today,
}: {
  accounts: Opt[];
  pairs: PairOpt[];
  entryModels: Opt[];
  sessions: Opt[];
  setups: SetupOpt[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(createTrade, initialState);

  // Submitted by hand (preventDefault + startTransition) instead of the
  // plain <form action={formAction}> binding. React 19 quietly calls its
  // own requestFormReset() on EVERY submit of a <form action={fn}> — pass
  // or fail — which schedules a native-style reset of every field in the
  // form back to blank. That reset doesn't always land in the same commit
  // as the error message, so a failed "Pick a pair" submit can look fine
  // for a moment and then, on whatever unrelated re-render happens next
  // (adding a pair, an entry model, anything), silently wipe the date,
  // account, position, session, and narrative fields the member had
  // already filled in — with no visible sign anything changed until Save
  // is pressed again and they're just gone. Dispatching the action this
  // way instead never engages that native-submit code path in the first
  // place, so it never fires.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [position, setPosition] = useState<"long" | "short">("long");
  const [sessionId, setSessionId] = useState("");
  const [pnlUsd, setPnlUsd] = useState("");
  const [preTrade, setPreTrade] = useState("");
  const [management, setManagement] = useState("");
  const [review, setReview] = useState("");

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1fr]">
      <div className="card p-5">
        <h3>Trade details</h3>
        <div className="grid grid-cols-2 gap-3.5">
          <div className="field">
            <label htmlFor="date">Date &amp; time</label>
            <input
              type="datetime-local"
              id="date"
              name="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="accountId">Account</label>
            <select id="accountId" name="accountId" required value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="" disabled>
                Select account
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="position">Position</label>
            <select id="position" name="position" value={position} onChange={(e) => setPosition(e.target.value as "long" | "short")}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sessionId">Session</label>
            <select id="sessionId" name="sessionId" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">—</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <RrOutcomeFields defaultRr="1.0" defaultOutcome="win" />
          <div className="field">
            <label htmlFor="pnlUsd">P&amp;L ($, optional)</label>
            <input
              type="number"
              id="pnlUsd"
              name="pnlUsd"
              step="0.01"
              placeholder="e.g. -450 for a loss"
              value={pnlUsd}
              onChange={(e) => setPnlUsd(e.target.value)}
            />
          </div>
        </div>
        <div className="sub" style={{ marginTop: -6, marginBottom: 2 }}>
          R:R is stored as a positive number and Outcome is what makes it count against you in Net R — but you can
          still just type e.g. -2 for a 2R loss and it&apos;ll flip Outcome to Loss and normalize the number for you.
        </div>
        <div className="sub" style={{ marginTop: -6, marginBottom: 2 }}>
          Enter the real dollar result if you know it — it flows straight into this account&apos;s current balance and
          the PnL calendar. Leave it blank to keep tracking this trade in R only.
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs" style={{ color: "var(--text-soft)" }}>
            Pair (pick one — add your own below)
          </label>
          <PairPicker initialPairs={pairs} />
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs" style={{ color: "var(--text-soft)" }}>
            Entry model (pick one — add your own below)
          </label>
          <EntryModelPicker initialEntryModels={entryModels} />
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs" style={{ color: "var(--text-soft)" }}>
            Setups / confluences (select all that apply — add your own below)
          </label>
          <ConfluencePicker initialSetups={setups} />
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs" style={{ color: "var(--text-soft)" }}>
            Chart screenshot
          </label>
          <ChartImageInput />
        </div>
      </div>

      <div className="card p-5">
        <h3>Trade narrative</h3>
        <div className="field mb-3.5">
          <label htmlFor="preTrade">Pre-trade thesis</label>
          <textarea
            id="preTrade"
            name="preTrade"
            rows={4}
            placeholder="What's the setup, and why are you taking it?"
            value={preTrade}
            onChange={(e) => setPreTrade(e.target.value)}
          />
        </div>
        <div className="field mb-3.5">
          <label htmlFor="management">Management</label>
          <textarea
            id="management"
            name="management"
            rows={4}
            placeholder="Entry, stop, targets, BE logic — how it was actually managed."
            value={management}
            onChange={(e) => setManagement(e.target.value)}
          />
        </div>
        <div className="field mb-4">
          <label htmlFor="review">Review</label>
          <textarea
            id="review"
            name="review"
            rows={4}
            placeholder="Post-trade reflection."
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
        </div>
        {state.error && (
          <div className="form-error" style={{ marginBottom: 12 }}>
            {state.error}
          </div>
        )}
        <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>
          {pending ? "Saving…" : "Save trade"}
        </button>
      </div>
    </form>
  );
}
