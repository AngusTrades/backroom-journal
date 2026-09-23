"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { updateTrade, type TradeFormState } from "@/app/actions/trades";
import { ConfluencePicker } from "@/components/ConfluencePicker";
import { EntryModelPicker } from "@/components/EntryModelPicker";
import { PairPicker } from "@/components/PairPicker";
import { ChartImageInput } from "@/components/ChartImageInput";
import { RrOutcomeFields } from "@/components/RrOutcomeFields";
import { computeR } from "@/lib/tradovate";

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
  rr: string | number | null;
  outcome: "win" | "loss" | "be";
  pnlUsd: string | number | null;
  preTrade: string | null;
  management: string | null;
  review: string | null;
  chartImageUrl: string | null;
  // Execution details — only set for trades imported from Tradovate.
  entryPrice: string | null;
  exitPrice: string | null;
  stopPrice: string | null;
  contracts: string | null;
  pointValue: string | null;
  exitAt: Date | null;
  source: string;
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

  // Imported trades get R from the stop price instead of a typed-in R.
  const imported = trade.entryPrice !== null && trade.contracts !== null;
  const canComputeR = imported && trade.pointValue !== null;
  const [stopPrice, setStopPrice] = useState(trade.stopPrice !== null ? String(Number(trade.stopPrice)) : "");
  const [outcome, setOutcome] = useState<"win" | "loss" | "be">(trade.outcome);
  const liveR =
    canComputeR && stopPrice.trim() !== "" && pnlUsd.trim() !== "" && Number.isFinite(Number(stopPrice))
      ? computeR({
          pnlUsd: Number(pnlUsd),
          entryPrice: Number(trade.entryPrice),
          stopPrice: Number(stopPrice),
          pointValue: Number(trade.pointValue),
          contracts: Number(trade.contracts),
        })
      : null;
  const riskUsd =
    canComputeR && stopPrice.trim() !== "" && Number.isFinite(Number(stopPrice))
      ? Math.abs(Number(trade.entryPrice) - Number(stopPrice)) * Number(trade.pointValue) * Number(trade.contracts)
      : null;
  const fmtNum = (v: string | null) => (v === null ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 }));

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1fr]">
      <input type="hidden" name="tradeId" value={trade.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="card p-5">
        <h3>Trade details</h3>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
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
          {imported ? (
            <>
              <div className="field">
                <label htmlFor="stopPrice">Stop price</label>
                <input
                  type="text"
                  inputMode="decimal"
                  id="stopPrice"
                  name="stopPrice"
                  placeholder={`e.g. ${fmtNum(trade.entryPrice)}`}
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  disabled={!canComputeR}
                />
              </div>
              <div className="field">
                <label htmlFor="outcome">Outcome</label>
                <select id="outcome" name="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as "win" | "loss" | "be")}>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="be">Break-even</option>
                </select>
              </div>
            </>
          ) : (
            <RrOutcomeFields defaultRr={Math.abs(Number(trade.rr ?? 0))} defaultOutcome={trade.outcome} />
          )}
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
        {imported ? (
          <div className="import-facts">
            <div className="import-facts-head">
              <span className="badge tradovate">Imported from Tradovate</span>
              <span className="r-result">
                {liveR !== null ? (
                  <>
                    = <strong className={outcome === "loss" ? "bad" : outcome === "win" ? "good" : ""}>
                      {outcome === "loss" ? "−" : ""}
                      {outcome === "be" ? "0.00" : liveR.toFixed(2)}R
                    </strong>
                    <span className="sub"> (${riskUsd?.toLocaleString(undefined, { maximumFractionDigits: 2 })} risked)</span>
                  </>
                ) : !canComputeR ? (
                  <span className="sub">$ per point unknown for this contract, so R can&apos;t be calculated.</span>
                ) : riskUsd === 0 ? (
                  <span className="sub">Stop can&apos;t be the same as the entry price.</span>
                ) : (
                  <span className="sub">Enter your stop to calculate R</span>
                )}
              </span>
            </div>
            <div className="import-facts-grid mono">
              <span>
                {trade.position === "long" ? "Long" : "Short"} {Number(trade.contracts)}
              </span>
              <span>Entry {fmtNum(trade.entryPrice)}</span>
              <span>Avg exit {fmtNum(trade.exitPrice)}</span>
              {trade.exitAt && (
                <span>
                  Exit {new Date(trade.exitAt).toISOString().slice(11, 16)} UTC
                </span>
              )}
            </div>
            <div className="sub">
              R = P&amp;L ÷ (entry-to-stop distance × ${fmtNum(trade.pointValue)}/pt × {Number(trade.contracts)} contract
              {Number(trade.contracts) === 1 ? "" : "s"}). Use your original stop, even if you moved it later.
            </div>
          </div>
        ) : (
          <div className="sub" style={{ marginTop: -6, marginBottom: 2 }}>
            R:R is stored as a positive number and Outcome is what makes it count against you in Net R — but you can
            still just type e.g. -2 for a 2R loss and it&apos;ll flip Outcome to Loss and normalize the number for you.
          </div>
        )}
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
