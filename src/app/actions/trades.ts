"use server";

import { db } from "@/db";
import { trades, tradeSetups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAccountById, getEntryModelById, getPairById, getTradeById } from "@/db/queries";
import { computeR } from "@/lib/tradovate";

// R:R is always stored as a non-negative magnitude — every Net R rollup
// (account stats, analytics, calendar) applies the sign itself from
// `outcome` (loss -> subtract, be -> 0, win -> add). Typing "-1" for a loss
// used to double-negate and add to Net R instead of subtracting from it;
// normalizing here means that can't happen regardless of what's typed.
function normalizeRr(raw: string): string {
  const n = Math.abs(Number(raw));
  return Number.isFinite(n) ? String(n) : "0";
}

// ChartImageInput submits a compressed base64 data URI (or "" if no
// screenshot was attached/it was removed) — only ever trust it if it's
// actually shaped like one, so a tampered field can't smuggle in an
// arbitrary string.
function normalizeChartImageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.startsWith("data:image/") ? trimmed : null;
}

// Expected/validation errors (a required field left empty, a tampered id)
// are modeled as a return value instead of a thrown Error — per Next.js's
// own guidance, throwing here would bubble up to the nearest error
// boundary and replace the whole form with a crash screen, wiping
// everything else the member had already filled in. Returning
// { error } instead lets the form (via useActionState) show the message
// inline and leaves the rest of the form exactly as it was.
export type TradeFormState = { error?: string };

export async function createTrade(_prevState: TradeFormState, formData: FormData): Promise<TradeFormState> {
  const user = await requireUser();

  const date = String(formData.get("date") ?? "");
  // Journaling the same trade across several accounts/firms at once (a
  // member running the same signal on 5 Apex accounts, say) — one or more
  // accounts, deduped in case a group selection and an individual pick
  // overlap. Every other field below is shared across all of them; only
  // accountId varies per inserted row.
  const accountIds = Array.from(new Set(formData.getAll("accountIds").map(String).filter(Boolean)));
  const pairId = String(formData.get("pairId") ?? "");
  const entryModelId = String(formData.get("entryModelId") ?? "") || null;
  const position = String(formData.get("position") ?? "long") as "long" | "short";
  const sessionId = String(formData.get("sessionId") ?? "") || null;
  const rr = normalizeRr(String(formData.get("rr") ?? "0"));
  const outcome = String(formData.get("outcome") ?? "win") as "win" | "loss" | "be";
  const pnlUsdRaw = String(formData.get("pnlUsd") ?? "").trim();
  const preTrade = String(formData.get("preTrade") ?? "") || null;
  const management = String(formData.get("management") ?? "") || null;
  const review = String(formData.get("review") ?? "") || null;
  const chartImageUrl = normalizeChartImageUrl(String(formData.get("chartImageUrl") ?? ""));
  const setupIds = formData.getAll("setupIds").map(String);

  // Checked individually (not one combined message) so the form can tell
  // you exactly what's missing — "Pick a pair" is a lot more useful than a
  // generic "some fields are required" when the other two are obviously
  // filled in.
  if (!date) return { error: "Pick a date and time." };
  if (accountIds.length === 0) return { error: "Pick at least one account." };
  if (!pairId) {
    return { error: "Pick a pair before saving — use the pair picker below (add one with \"+ Add\" first if you haven't yet)." };
  }

  // Make sure every account this trade is being journaled against actually
  // belongs to the signed-in member — otherwise a tampered accountId in the
  // form could log a trade onto someone else's account. Rejects the whole
  // submission if any one of them doesn't check out, rather than silently
  // dropping just that account.
  const ownedAccounts = await Promise.all(accountIds.map((id) => getAccountById(id, user.id)));
  if (ownedAccounts.some((a) => !a)) {
    return { error: "One of the selected accounts doesn't belong to your login." };
  }

  // Pairs are per-member now too (like entry models/setups), so a tampered
  // pairId in the form can't tag a trade with another member's private pair.
  const pair = await getPairById(pairId, user.id);
  if (!pair) {
    return { error: "That pair doesn't belong to your login." };
  }

  // Same ownership check for entry model — it's per-member now (like
  // setups), so a tampered entryModelId in the form can't tag a trade with
  // another member's private entry model.
  if (entryModelId) {
    const entryModel = await getEntryModelById(entryModelId, user.id);
    if (!entryModel) {
      return { error: "That entry model doesn't belong to your login." };
    }
  }

  // Same R:R/outcome/P&L/narrative on every selected account — dollar P&L
  // will often actually differ per account (different sizing on the same
  // move), so a member logging across several accounts at once should
  // still open each inserted trade afterward and adjust its own $ figure
  // if it wasn't identical everywhere.
  const insertedRows = await db
    .insert(trades)
    .values(
      accountIds.map((accountId) => ({
        date: new Date(date),
        accountId,
        pairId,
        entryModelId,
        position,
        sessionId,
        rr,
        outcome,
        pnlUsd: pnlUsdRaw ? pnlUsdRaw : null,
        preTrade,
        management,
        review,
        chartImageUrl,
      })),
    )
    .returning({ id: trades.id });

  if (setupIds.length > 0 && insertedRows.length > 0) {
    await db.insert(tradeSetups).values(
      insertedRows.flatMap((row) => setupIds.map((setupId) => ({ tradeId: row.id, setupId }))),
    );
  }

  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/accounts");
  for (const accountId of accountIds) revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/calendar");
  redirect("/");
}

export async function updateTrade(_prevState: TradeFormState, formData: FormData): Promise<TradeFormState> {
  const user = await requireUser();

  const tradeId = String(formData.get("tradeId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "") || "/";
  const date = String(formData.get("date") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  const pairId = String(formData.get("pairId") ?? "");
  const entryModelId = String(formData.get("entryModelId") ?? "") || null;
  const position = String(formData.get("position") ?? "long") as "long" | "short";
  const sessionId = String(formData.get("sessionId") ?? "") || null;
  const rr = normalizeRr(String(formData.get("rr") ?? "0"));
  const outcome = String(formData.get("outcome") ?? "win") as "win" | "loss" | "be";
  const pnlUsdRaw = String(formData.get("pnlUsd") ?? "").trim();
  const preTrade = String(formData.get("preTrade") ?? "") || null;
  const management = String(formData.get("management") ?? "") || null;
  const review = String(formData.get("review") ?? "") || null;
  const chartImageUrl = normalizeChartImageUrl(String(formData.get("chartImageUrl") ?? ""));
  const setupIds = formData.getAll("setupIds").map(String);

  if (!tradeId) return { error: "That trade link looks broken — go back and open Edit again." };
  if (!date) return { error: "Pick a date and time." };
  if (!accountId) return { error: "Pick an account." };
  if (!pairId) {
    return { error: "Pick a pair before saving — use the pair picker below (add one with \"+ Add\" first if you haven't yet)." };
  }

  // Confirm this trade actually belongs to the signed-in member (via its
  // current account) before changing anything about it.
  const existing = await getTradeById(tradeId, user.id);
  if (!existing) {
    return { error: "That trade doesn't belong to your login." };
  }

  // Same ownership checks as createTrade — a tampered accountId/entryModelId
  // in the form still can't move a trade onto someone else's account or tag
  // it with someone else's private entry model.
  const account = await getAccountById(accountId, user.id);
  if (!account) {
    return { error: "That account doesn't belong to your login." };
  }
  const pair = await getPairById(pairId, user.id);
  if (!pair) {
    return { error: "That pair doesn't belong to your login." };
  }
  if (entryModelId) {
    const entryModel = await getEntryModelById(entryModelId, user.id);
    if (!entryModel) {
      return { error: "That entry model doesn't belong to your login." };
    }
  }

  // Imported trades: R comes from the stop price (never from a typed R) so
  // it always matches the real $ P&L. No stop yet → R stays unknown (null)
  // and the trade keeps its "Add stop" flag.
  let finalRr: string | null = rr;
  let stopPrice: string | null = existing.stopPrice;
  if (existing.entryPrice !== null && existing.contracts !== null) {
    const stopRaw = String(formData.get("stopPrice") ?? "").trim().replace(/,/g, "");
    if (!stopRaw || existing.pointValue === null) {
      finalRr = null;
      stopPrice = stopRaw && Number.isFinite(Number(stopRaw)) ? stopRaw : null;
    } else {
      const stop = Number(stopRaw);
      if (!Number.isFinite(stop)) return { error: "The stop price isn't a number." };
      if (!pnlUsdRaw) return { error: "Enter the P&L so R can be calculated from your stop." };
      const r = computeR({
        pnlUsd: Number(pnlUsdRaw),
        entryPrice: Number(existing.entryPrice),
        stopPrice: stop,
        pointValue: Number(existing.pointValue),
        contracts: Number(existing.contracts),
      });
      if (r === null) return { error: "The stop can't be the same as the entry price." };
      finalRr = outcome === "be" ? "0" : String(r);
      stopPrice = String(stop);
    }
  }

  await db
    .update(trades)
    .set({
      date: new Date(date),
      accountId,
      pairId,
      entryModelId,
      position,
      sessionId,
      rr: finalRr,
      stopPrice,
      outcome,
      pnlUsd: pnlUsdRaw ? pnlUsdRaw : null,
      preTrade,
      management,
      review,
      chartImageUrl,
    })
    .where(eq(trades.id, tradeId));

  // Re-sync confluence tags — simplest correct approach is clear and
  // re-insert rather than diffing which ones changed.
  await db.delete(tradeSetups).where(eq(tradeSetups.tradeId, tradeId));
  if (setupIds.length > 0) {
    await db.insert(tradeSetups).values(setupIds.map((setupId) => ({ tradeId, setupId })));
  }

  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  if (existing.accountId !== accountId) revalidatePath(`/accounts/${existing.accountId}`);
  revalidatePath("/calendar");
  redirect(returnTo);
}

// Called directly from a client component (not via <form action>) so the
// caller can show a confirm dialog first — deleting a trade also removes its
// confluence tags (cascade via trade_setups) and is irreversible. Ownership
// is checked by loading the trade through getTradeById first (id + the
// trade's account both have to belong to the signed-in member).
export async function deleteTrade(id: string) {
  const user = await requireUser();
  if (!id) return;
  const trade = await getTradeById(id, user.id);
  if (!trade) return;
  await db.delete(trades).where(eq(trades.id, id));
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${trade.accountId}`);
  revalidatePath("/calendar");
}
