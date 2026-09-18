"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { updateTrade, type TradeFormState } from "@/app/actions/trades";
import { ConfluencePicker } from "@/components/ConfluencePicker";
import { EntryModelPicker } from "@/components/EntryModelPicker";
import { PairPicker } from "@/components/PairPicker";
import { ChartImageInput } from "@/components/ChartImageInput";
import { RrOutcomeFields } from "@/components/RrOutcomeFields";

type Opt = { id: string; name: string };
type PairOpt = { id: string; symbol: string };
type SetupOpt = { id: string; name: string };

type TradeForEdit = {
  id: string;
  accountId: string;
  pairId: string;
  entryModelId: string | null;
  position: "long" | "short";
  sessionId: string | null;
  rr: string | number;
  outcome: "win" | "loss" | "be";
  pnlUsd: string | number | null;
  preTrade: string | null;
  management: string | null;
  review: string | null;
  chartImageUrl: string | null;
};

const initialState: TradeFormState = {};

// Same reasoning as AddTradeForm — every plain field here is controlled
// (real React state) and submission is dispatched by hand (see
// handleSubmit) instead of via <form action={formAction}>, so this form
// never engages React's automatic reset-on-submit behavior that would
// otherwise silently wipe fields you'd already changed on a failed save.
// See the longer comment in AddTradeForm.tsx for what was actually
// happening.
export function EditTradeForm({
  trade,
  returnTo,
  dateValue,
  checkedSetupIds,
  accounts,
  pairs,
  entryModels,
  sessions,
  setups,
}: {
  trade: TradeForEdit;
  returnTo: string;
  dateValue: string;
  checkedSetupIds: string[];
  accounts: Opt[];
  pairs: PairOpt[];
  entryModels: Opt[];
  sessions: Opt[];
  setups: SetupOpt[];
}) {
  const [state, formAction, pending] = useActionState(updateTrade, initialState);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  const [date, setDate] = useState(dateValue);
  const [accountId, setAccountId] = useState(trade.accountId);
  const [position, setPosition] = useState<"long" | "short">(trade.position);
  const [sessionId, setSessionId] = useState(trade.sessionId ?? "");
  const [pnlUsd, setPnlUsd] = useState(trade.pnlUsd !== null ? String(trade.pnlUsd) : "");
  const [preTrade, setPreTrade] = useState(trade.preTrade ?? "");
  const [management, setManagement] = useState(trade.management ?? "");
  const [review, setReview] = useState(trade.review ?? "");

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1fr]">
      <input type="hidden" name="tradeId" value={trade.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
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
          <RrOutcomeFields defaultRr={Math.abs(Number(trade.rr))} defaultOutcome={trade.outcome} />
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
          <PairPicker initialPairs={pairs} defaultSelectedId={trade.pairId} />
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs" style={{ color: "var(--text-soft)" }}>
            Entry model (pick one — add your own below)
          </label>
          <EntryModelPicker initialEntryModels={entryModels} defaultSelectedId={trade.entryModelId ?? undefined} />
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs" style={{ color: "var(--text-soft)" }}>
            Setups / confluences (select all that apply — add your own below)
          </label>
          <ConfluencePicker initialSetups={setups} initialCheckedIds={checkedSetupIds} />
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs" style={{ color: "var(--text-soft)" }}>
            Chart screenshot
          </label>
          <ChartImageInput initialUrl={trade.chartImageUrl} />
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
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
