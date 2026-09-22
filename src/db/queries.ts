import { db } from "./index";
import {
  accounts,
  accountGroups,
  entryModels,
  pairs,
  sessions,
  setups,
  trades,
  tradeSetups,
  payouts,
  taxProfile,
  taxCategories,
  taxEntries,
  taxImportBatches,
  copyDestinations,
  sessionLogs,
  newsEvents,
  receipts,
} from "./schema";
import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { startOfDay, startOfWeek, startOfMonth, startOfYear } from "date-fns";

// ---------------------------------------------------------------------------
// Every query below is scoped to one member's own data by userId — either
// directly (accounts, setups, entryModels, taxProfile all carry a userId
// column) or via this account-id lookup (trades/payouts only carry
// accountId, so "this member's trades" means "trades whose account belongs
// to this member").
// ---------------------------------------------------------------------------
async function getUserAccountIds(userId: string): Promise<string[]> {
  const rows = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, userId));
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Analytics time-period filter — Daily/Weekly/Monthly/Yearly are "since the
// start of the current period, through now"; Lifetime applies no filter.
// ---------------------------------------------------------------------------
export const ANALYTICS_PERIODS = ["daily", "weekly", "monthly", "yearly", "lifetime"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export function isAnalyticsPeriod(value: unknown): value is AnalyticsPeriod {
  return typeof value === "string" && (ANALYTICS_PERIODS as readonly string[]).includes(value);
}

export function periodStart(period: AnalyticsPeriod): Date | undefined {
  const now = new Date();
  switch (period) {
    case "daily":
      return startOfDay(now);
    case "weekly":
      return startOfWeek(now, { weekStartsOn: 1 });
    case "monthly":
      return startOfMonth(now);
    case "yearly":
      return startOfYear(now);
    case "lifetime":
      return undefined;
  }
}

export async function getTradesWithDetails(userId: string) {
  const accountIds = await getUserAccountIds(userId);
  if (accountIds.length === 0) return [];
  return db.query.trades.findMany({
    where: inArray(trades.accountId, accountIds),
    orderBy: [desc(trades.date)],
    with: {
      account: true,
      pair: true,
      entryModel: true,
      session: true,
      tradeSetups: { with: { setup: true } },
    },
  });
}

export async function getFormOptions(userId: string) {
  const [accountRows, pairRows, entryModelRows, sessionRows, setupRows, accountGroupRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.name),
    db.select().from(pairs).where(eq(pairs.userId, userId)).orderBy(pairs.symbol),
    db.select().from(entryModels).where(eq(entryModels.userId, userId)).orderBy(entryModels.name),
    db.select().from(sessions).orderBy(sessions.name),
    db.select().from(setups).where(eq(setups.userId, userId)).orderBy(setups.name),
    db.select().from(accountGroups).where(eq(accountGroups.userId, userId)).orderBy(accountGroups.name),
  ]);
  return {
    accounts: accountRows,
    pairs: pairRows,
    entryModels: entryModelRows,
    sessions: sessionRows,
    setups: setupRows,
    accountGroups: accountGroupRows,
  };
}

export async function getAccountsWithStats(userId: string) {
  const accountRows = await db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.name);
  const accountIds = accountRows.map((a) => a.id);

  const tradeStats =
    accountIds.length === 0
      ? []
      : await db
          .select({
            accountId: trades.accountId,
            tradeCount: sql<number>`count(*)::int`,
            wins: sql<number>`count(*) filter (where ${trades.outcome} = 'win')::int`,
            avgRr: sql<number>`coalesce(avg(${trades.rr}), 0)::float`,
            totalRr: sql<number>`coalesce(sum(case when ${trades.outcome} = 'loss' then -${trades.rr} when ${trades.outcome} = 'be' then 0 else ${trades.rr} end), 0)::float`,
            totalPnlUsd: sql<number>`coalesce(sum(${trades.pnlUsd}), 0)::float`,
          })
          .from(trades)
          .where(inArray(trades.accountId, accountIds))
          .groupBy(trades.accountId);

  const payoutStats =
    accountIds.length === 0
      ? []
      : await db
          .select({
            accountId: payouts.accountId,
            totalPayouts: sql<number>`coalesce(sum(${payouts.netAmount}), 0)::float`,
            totalPayoutsGross: sql<number>`coalesce(sum(${payouts.grossAmount}), 0)::float`,
          })
          .from(payouts)
          .where(inArray(payouts.accountId, accountIds))
          .groupBy(payouts.accountId);

  const statsByAccount = new Map(tradeStats.map((s) => [s.accountId, s]));
  const payoutsByAccount = new Map(payoutStats.map((s) => [s.accountId, s]));

  return accountRows.map((a) => {
    const totalPnlUsd = statsByAccount.get(a.id)?.totalPnlUsd ?? 0;
    const totalPayoutsGross = payoutsByAccount.get(a.id)?.totalPayoutsGross ?? 0;
    // Live balance: starting balance, plus every trade's realized $ P&L
    // (trades with no $ entered contribute 0 — they're still tracked in R),
    // minus whatever's actually been pulled out of the account via payouts.
    const currentBalance = Number(a.startingBalance ?? 0) + totalPnlUsd - totalPayoutsGross;
    return {
      ...a,
      tradeCount: statsByAccount.get(a.id)?.tradeCount ?? 0,
      wins: statsByAccount.get(a.id)?.wins ?? 0,
      avgRr: statsByAccount.get(a.id)?.avgRr ?? 0,
      totalRr: statsByAccount.get(a.id)?.totalRr ?? 0,
      totalPnlUsd,
      totalPayouts: payoutsByAccount.get(a.id)?.totalPayouts ?? 0,
      currentBalance,
    };
  });
}

// A member's own account groups (e.g. "Apex", "Live Accounts") — used both
// to populate the "+ New group…" pickers and to organize the Accounts
// dashboard into collapsible sections instead of one flat grid. Ordered by
// name, same convention as pairs/entry models/setups.
export async function getAccountGroups(userId: string) {
  return db.select().from(accountGroups).where(eq(accountGroups.userId, userId)).orderBy(accountGroups.name);
}

// Same ownership-gate pattern as getAccountById/getEntryModelById — used by
// renameAccountGroup/deleteAccountGroup so a tampered group id in a form
// can't touch another member's group.
export async function getAccountGroupById(id: string, userId: string) {
  const rows = await db
    .select()
    .from(accountGroups)
    .where(and(eq(accountGroups.id, id), eq(accountGroups.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPayoutsWithAccount(userId: string) {
  const accountIds = await getUserAccountIds(userId);
  if (accountIds.length === 0) return [];
  return db.query.payouts.findMany({
    where: inArray(payouts.accountId, accountIds),
    orderBy: [desc(payouts.date)],
    with: { account: true },
  });
}

// Scoped by userId too — this is the security gate for account detail pages
// and every action that mutates a specific account: fetch it here first, and
// treat "not found" (null) exactly like "doesn't exist", never distinguish
// it from "exists but isn't yours".
export async function getAccountById(id: string, userId: string) {
  const rows = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).limit(1);
  return rows[0] ?? null;
}

// Same ownership-gate pattern as getAccountById — used when saving a trade
// so a tampered entryModelId in the form can't attach another member's
// private entry model to your trade.
export async function getEntryModelById(id: string, userId: string) {
  const rows = await db.select().from(entryModels).where(and(eq(entryModels.id, id), eq(entryModels.userId, userId))).limit(1);
  return rows[0] ?? null;
}

// Same ownership-gate pattern again — pairs are per-member now too, so a
// tampered pairId in the form can't attach another member's private pair to
// your trade.
export async function getPairById(id: string, userId: string) {
  const rows = await db.select().from(pairs).where(and(eq(pairs.id, id), eq(pairs.userId, userId))).limit(1);
  return rows[0] ?? null;
}

// Ownership-gated fetch for the Edit Trade page — trades don't carry a
// userId column directly, so "belongs to this member" means "its account
// belongs to this member." A trade on someone else's account is treated
// exactly like a nonexistent one (null), same as getAccountById.
export async function getTradeById(id: string, userId: string) {
  const accountIds = await getUserAccountIds(userId);
  if (accountIds.length === 0) return null;
  const row = await db.query.trades.findFirst({
    where: and(eq(trades.id, id), inArray(trades.accountId, accountIds)),
    with: {
      tradeSetups: { with: { setup: true } },
    },
  });
  return row ?? null;
}

export async function getTradesForAccount(accountId: string) {
  return db.query.trades.findMany({
    where: eq(trades.accountId, accountId),
    orderBy: [desc(trades.date)],
    with: {
      pair: true,
      entryModel: true,
      session: true,
      tradeSetups: { with: { setup: true } },
    },
  });
}

export async function getPayoutsForAccount(accountId: string) {
  return db.select().from(payouts).where(eq(payouts.accountId, accountId)).orderBy(desc(payouts.date));
}

// Same ownership-gate pattern as getTradeById — payouts don't carry a
// userId directly (only accountId), so ownership is checked by making sure
// the payout's account belongs to this member.
export async function getPayoutById(id: string, userId: string) {
  const accountIds = await getUserAccountIds(userId);
  if (accountIds.length === 0) return null;
  const rows = await db
    .select()
    .from(payouts)
    .where(and(eq(payouts.id, id), inArray(payouts.accountId, accountIds)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTaxProfile(userId: string) {
  const rows = await db.select().from(taxProfile).where(eq(taxProfile.userId, userId)).limit(1);
  return rows[0] ?? null;
}

// Market session bias log — one row per (member, date, session). Reuses the
// same Daily/Weekly/Monthly/Yearly/Lifetime period filter as Analytics.
export async function getSessionLogs(userId: string, period: AnalyticsPeriod = "lifetime") {
  const from = periodStart(period);
  const conditions = [eq(sessionLogs.userId, userId)];
  if (from) conditions.push(gte(sessionLogs.date, from));
  return db
    .select()
    .from(sessionLogs)
    .where(and(...conditions))
    .orderBy(desc(sessionLogs.date), sessionLogs.session);
}

export async function getSessionLogById(id: string, userId: string) {
  const rows = await db
    .select()
    .from(sessionLogs)
    .where(and(eq(sessionLogs.id, id), eq(sessionLogs.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export type SessionCorrelationResult = {
  // Days where the trigger session moved `thresholdPoints`+ in `direction`.
  triggerCount: number;
  // Of those, how many also have a logged entry for the target session —
  // the actual sample the percentages below are computed from.
  sampleSize: number;
  reversed: number; // target session's bias is the opposite of `direction`
  continued: number; // target session's bias matches `direction`
  neutral: number; // target session was logged neutral that day
};

// "After <triggerSession> moves <thresholdPoints>+ points <direction>, how
// does <targetSession> usually go that same day?" — entirely computable from
// the bias + points-moved you already log every day on this page, no real
// OHLC/session-range data needed. Always looks at a member's full history
// (ignores the Daily/Weekly/Monthly/Yearly/Lifetime tabs above), since a
// correlation study needs as many days as possible to mean anything.
export async function getSessionCorrelation(
  userId: string,
  opts: {
    triggerSession: "asia" | "london" | "new_york";
    direction: "bearish" | "bullish";
    thresholdPoints: number;
    targetSession: "asia" | "london" | "new_york";
  },
): Promise<SessionCorrelationResult> {
  const { triggerSession, direction, thresholdPoints, targetSession } = opts;

  const triggerRows = await db
    .select({ date: sessionLogs.date, pointsMoved: sessionLogs.pointsMoved })
    .from(sessionLogs)
    .where(and(eq(sessionLogs.userId, userId), eq(sessionLogs.session, triggerSession)));

  const matchingDates = new Set<string>();
  for (const row of triggerRows) {
    const pts = Number(row.pointsMoved);
    const hit = direction === "bearish" ? pts <= -thresholdPoints : pts >= thresholdPoints;
    if (hit) matchingDates.add(row.date.toISOString());
  }
  const triggerCount = matchingDates.size;
  if (triggerCount === 0) {
    return { triggerCount: 0, sampleSize: 0, reversed: 0, continued: 0, neutral: 0 };
  }

  const targetRows = await db
    .select({ date: sessionLogs.date, bias: sessionLogs.bias })
    .from(sessionLogs)
    .where(and(eq(sessionLogs.userId, userId), eq(sessionLogs.session, targetSession)));

  const oppositeBias = direction === "bearish" ? "bullish" : "bearish";
  const sameBias = direction === "bearish" ? "bearish" : "bullish";
  let sampleSize = 0;
  let reversed = 0;
  let continued = 0;
  let neutral = 0;
  for (const row of targetRows) {
    if (!matchingDates.has(row.date.toISOString())) continue;
    sampleSize++;
    if (row.bias === oppositeBias) reversed++;
    else if (row.bias === sameBias) continued++;
    else neutral++;
  }

  return { triggerCount, sampleSize, reversed, continued, neutral };
}

// News events — shared across every member (not scoped to a userId). `end`
// is exclusive, matching the PnL calendar's range queries.
export async function getNewsEventsForRange(start: Date, end: Date) {
  return db
    .select()
    .from(newsEvents)
    .where(and(gte(newsEvents.date, start), lt(newsEvents.date, end)))
    .orderBy(newsEvents.date, newsEvents.timeMinutes, newsEvents.title);
}

export async function getLastNewsSyncAt(): Promise<Date | null> {
  const rows = await db.select({ at: sql<Date>`max(${newsEvents.syncedAt})` }).from(newsEvents);
  return rows[0]?.at ?? null;
}

// Every currency/country code that's ever shown up in a synced news event —
// drives the News page's asset filter. Majors first (the order most traders
// think in), then whatever else the feed has brought in, alphabetically.
const MAJOR_CURRENCY_ORDER = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNY"];

export async function getDistinctNewsCountries(): Promise<string[]> {
  const rows = await db.selectDistinct({ country: newsEvents.country }).from(newsEvents);
  const all = rows.map((r) => r.country).filter(Boolean);
  return all.sort((a, b) => {
    const ai = MAJOR_CURRENCY_ORDER.indexOf(a);
    const bi = MAJOR_CURRENCY_ORDER.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b);
  });
}

export type Breakdown = { name: string; trades: number; wins: number; winRate: number; avgRr: number };

export async function getAnalytics(period: AnalyticsPeriod = "lifetime", userId: string) {
  const accountIds = await getUserAccountIds(userId);
  const from = periodStart(period);
  const dateCond = from ? gte(trades.date, from) : undefined;

  if (accountIds.length === 0) {
    return {
      period,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgRr: 0,
      profitFactor: 0,
      payoutsTotal: 0,
      equityCurve: [] as { date: Date; cumulative: number }[],
      bySetup: [] as Breakdown[],
      byEntryModel: [] as Breakdown[],
      bySession: [] as Breakdown[],
      byPair: [] as Breakdown[],
    };
  }

  const scopeCond = inArray(trades.accountId, accountIds);
  // and() is typed as possibly returning undefined (it can, given an empty
  // variadic list) even though both arguments here are always defined —
  // fall back to scopeCond so `cond` itself is never undefined.
  const cond: SQL = (dateCond ? and(scopeCond, dateCond) : scopeCond) ?? scopeCond;

  const allTrades = await db.select().from(trades).where(cond);
  const totalTrades = allTrades.length;
  const wins = allTrades.filter((t) => t.outcome === "win").length;
  const losses = allTrades.filter((t) => t.outcome === "loss").length;
  const winRate = totalTrades ? (wins / totalTrades) * 100 : 0;
  const avgRr = totalTrades ? allTrades.reduce((s, t) => s + Number(t.rr), 0) / totalTrades : 0;

  const grossWin = allTrades.filter((t) => t.outcome === "win").reduce((s, t) => s + Number(t.rr), 0);
  const grossLoss = allTrades.filter((t) => t.outcome === "loss").reduce((s, t) => s + Number(t.rr), 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  // Equity curve: cumulative R over time (loss subtracts, be is flat)
  const sorted = [...allTrades].sort((a, b) => a.date.getTime() - b.date.getTime());
  let cumulative = 0;
  const equityCurve = sorted.map((t) => {
    const delta = t.outcome === "loss" ? -Number(t.rr) : t.outcome === "be" ? 0 : Number(t.rr);
    cumulative += delta;
    return { date: t.date, cumulative };
  });

  const bySetup = await breakdownBySetup(accountIds, cond);
  const byEntryModel = await breakdownByJoin(entryModels, trades.entryModelId, entryModels.id, entryModels.name, cond);
  const bySession = await breakdownByJoin(sessions, trades.sessionId, sessions.id, sessions.name, cond);
  const byPair = await breakdownByJoin(pairs, trades.pairId, pairs.id, pairs.symbol, cond);

  // Payouts landed in this same period — gross amount, same convention as
  // the Budgeting and PnL Calendar pages' payout totals. Own date filter
  // (payouts.date, not trades.date) since a payout isn't a trade row; "how
  // much have I actually been paid out so far this month" is what the
  // Monthly tab answers here.
  const payoutScope = inArray(payouts.accountId, accountIds);
  const payoutCond: SQL = (from ? and(payoutScope, gte(payouts.date, from)) : payoutScope) ?? payoutScope;
  const payoutRows = await db.select({ grossAmount: payouts.grossAmount }).from(payouts).where(payoutCond);
  const payoutsTotal = payoutRows.reduce((s, p) => s + Number(p.grossAmount), 0);

  return {
    period,
    totalTrades,
    wins,
    losses,
    winRate,
    avgRr,
    profitFactor,
    payoutsTotal,
    equityCurve,
    bySetup,
    byEntryModel,
    bySession,
    byPair,
  };
}

async function breakdownBySetup(accountIds: string[], cond: SQL): Promise<Breakdown[]> {
  const rows = await db
    .select({
      name: setups.name,
      tradeCount: sql<number>`count(*)::int`,
      wins: sql<number>`count(*) filter (where ${trades.outcome} = 'win')::int`,
      avgRr: sql<number>`coalesce(avg(${trades.rr}), 0)::float`,
    })
    .from(tradeSetups)
    .innerJoin(setups, eq(tradeSetups.setupId, setups.id))
    .innerJoin(trades, eq(tradeSetups.tradeId, trades.id))
    .where(cond)
    .groupBy(setups.name)
    .orderBy(sql`count(*) desc`);

  return rows.map((r) => ({
    name: r.name,
    trades: r.tradeCount,
    wins: r.wins,
    winRate: r.tradeCount ? (r.wins / r.tradeCount) * 100 : 0,
    avgRr: r.avgRr,
  }));
}

async function breakdownByJoin(
  table: typeof entryModels | typeof sessions | typeof pairs,
  fk: typeof trades.entryModelId | typeof trades.sessionId | typeof trades.pairId,
  refId: typeof entryModels.id | typeof sessions.id | typeof pairs.id,
  refName: typeof entryModels.name | typeof sessions.name | typeof pairs.symbol,
  cond: SQL,
): Promise<Breakdown[]> {
  const rows = await db
    .select({
      name: refName,
      tradeCount: sql<number>`count(*)::int`,
      wins: sql<number>`count(*) filter (where ${trades.outcome} = 'win')::int`,
      avgRr: sql<number>`coalesce(avg(${trades.rr}), 0)::float`,
    })
    .from(trades)
    .innerJoin(table, eq(fk, refId))
    .where(cond)
    .groupBy(refName)
    .orderBy(sql`count(*) desc`);

  return rows.map((r) => ({
    name: r.name,
    trades: r.tradeCount,
    wins: r.wins,
    winRate: r.tradeCount ? (r.wins / r.tradeCount) * 100 : 0,
    avgRr: r.avgRr,
  }));
}

// ---------------------------------------------------------------------------
// PnL Calendar — daily $ P&L (and R, as a fallback for trades logged without
// a dollar amount) across whichever accounts are selected, for one visible
// calendar range (a month plus the lead/trail days from adjacent months
// needed to fill out the grid). Callers pass account ids already scoped to
// the current member (via getFormOptions(userId).accounts) so no separate
// userId parameter is needed here — but accountIds is REQUIRED (not
// optional) specifically so an "all accounts" selection can never turn into
// "no account filter at all", which used to mean every member's trades
// table-wide. An empty array means "this member has no accounts (or picked
// none)" and returns nothing, never "everyone's".
// ---------------------------------------------------------------------------
export type DailyPnl = {
  tradeCount: number;
  pnlUsd: number;
  hasPnlData: boolean;
  totalRr: number;
};

export async function getPnlCalendarTrades(rangeStart: Date, rangeEnd: Date, accountIds: string[]) {
  if (accountIds.length === 0) return [];
  return db
    .select({
      date: trades.date,
      pnlUsd: trades.pnlUsd,
      rr: trades.rr,
      outcome: trades.outcome,
    })
    .from(trades)
    .where(and(gte(trades.date, rangeStart), lt(trades.date, rangeEnd), inArray(trades.accountId, accountIds)));
}

export async function getPnlCalendarPayouts(rangeStart: Date, rangeEnd: Date, accountIds: string[]) {
  if (accountIds.length === 0) return [];
  return db
    .select({ date: payouts.date, grossAmount: payouts.grossAmount })
    .from(payouts)
    .where(and(gte(payouts.date, rangeStart), lt(payouts.date, rangeEnd), inArray(payouts.accountId, accountIds)));
}

export function groupPayoutsByDay(rows: { date: Date; grossAmount: string }[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const p of rows) {
    const key = `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, "0")}-${String(p.date.getDate()).padStart(2, "0")}`;
    byDay.set(key, (byDay.get(key) ?? 0) + Number(p.grossAmount));
  }
  return byDay;
}

export function groupTradesByDay(
  rows: { date: Date; pnlUsd: string | null; rr: string; outcome: "win" | "loss" | "be" }[],
): Map<string, DailyPnl> {
  const byDay = new Map<string, DailyPnl>();
  for (const t of rows) {
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}-${String(t.date.getDate()).padStart(2, "0")}`;
    const entry = byDay.get(key) ?? { tradeCount: 0, pnlUsd: 0, hasPnlData: false, totalRr: 0 };
    entry.tradeCount += 1;
    if (t.pnlUsd !== null) {
      entry.pnlUsd += Number(t.pnlUsd);
      entry.hasPnlData = true;
    }
    entry.totalRr += t.outcome === "loss" ? -Number(t.rr) : t.outcome === "be" ? 0 : Number(t.rr);
    byDay.set(key, entry);
  }
  return byDay;
}

// ---------------------------------------------------------------------------
// Tax calculator — categories are per-member, freeform-named (like
// pairs/setups/entry models above). Entries carry userId/kind directly
// (unlike trades/payouts, which only reach a member via their account), so
// these query straight off taxEntries.userId with no account-id indirection.
// ---------------------------------------------------------------------------
export async function getTaxCategories(userId: string) {
  const rows = await db
    .select()
    .from(taxCategories)
    .where(eq(taxCategories.userId, userId))
    .orderBy(taxCategories.kind, taxCategories.name);
  return {
    income: rows.filter((r) => r.kind === "income"),
    expense: rows.filter((r) => r.kind === "expense"),
  };
}

export async function getTaxCategoryById(id: string, userId: string) {
  const rows = await db
    .select()
    .from(taxCategories)
    .where(and(eq(taxCategories.id, id), eq(taxCategories.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTaxEntryById(id: string, userId: string) {
  const rows = await db
    .select()
    .from(taxEntries)
    .where(and(eq(taxEntries.id, id), eq(taxEntries.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

function taxYearRange(year: number) {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

export async function getTaxEntriesForYear(userId: string, year: number) {
  const { start, end } = taxYearRange(year);
  return db.query.taxEntries.findMany({
    where: and(eq(taxEntries.userId, userId), gte(taxEntries.date, start), lt(taxEntries.date, end)),
    orderBy: [desc(taxEntries.date)],
    with: { category: true },
  });
}

// Existing account payouts, for the same tax year — these are NOT duplicated
// into taxEntries; the year-summary view folds them in as automatic,
// read-only "Account Payouts" income lines (see summarizeTaxYear below).
export async function getPayoutsForTaxYear(userId: string, year: number) {
  const accountIds = await getUserAccountIds(userId);
  if (accountIds.length === 0) return [];
  const { start, end } = taxYearRange(year);
  return db.query.payouts.findMany({
    where: and(inArray(payouts.accountId, accountIds), gte(payouts.date, start), lt(payouts.date, end)),
    orderBy: [desc(payouts.date)],
    with: { account: true },
  });
}

// Every calendar year that has at least one tax entry or payout, plus the
// current year always included so a member with nothing logged yet still
// sees a year to start in.
export async function getTaxYears(userId: string): Promise<number[]> {
  const accountIds = await getUserAccountIds(userId);
  const [entryYears, payoutYears] = await Promise.all([
    db
      .select({ y: sql<number>`extract(year from ${taxEntries.date})::int` })
      .from(taxEntries)
      .where(eq(taxEntries.userId, userId)),
    accountIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ y: sql<number>`extract(year from ${payouts.date})::int` })
          .from(payouts)
          .where(inArray(payouts.accountId, accountIds)),
  ]);
  const years = new Set<number>([new Date().getFullYear(), ...entryYears.map((r) => r.y), ...payoutYears.map((r) => r.y)]);
  return Array.from(years).sort((a, b) => b - a);
}

export async function getTaxImportBatches(userId: string) {
  return db.select().from(taxImportBatches).where(eq(taxImportBatches.userId, userId)).orderBy(desc(taxImportBatches.createdAt));
}

// Receipts held for one tax year — scoped by the receipt's own `date`
// (when the purchase happened, not when it was uploaded), same convention
// as tax entries. Doesn't return `fileDataUrl` — that can be a multi-MB
// base64 string per row and this is used to render the held-receipts list,
// which only needs the filename/label/date/size to show a thumbnail-less
// row; the full file is fetched separately (by id) only when actually
// viewed, downloaded, or bundled into the combined PDF.
export async function getReceiptsForYear(userId: string, year: number) {
  const { start, end } = taxYearRange(year);
  const rows = await db
    .select({
      id: receipts.id,
      date: receipts.date,
      label: receipts.label,
      fileName: receipts.fileName,
      contentType: receipts.contentType,
      createdAt: receipts.createdAt,
      taxEntryId: receipts.taxEntryId,
      taxEntryAmount: taxEntries.amount,
    })
    .from(receipts)
    .leftJoin(taxEntries, eq(receipts.taxEntryId, taxEntries.id))
    .where(and(eq(receipts.userId, userId), gte(receipts.date, start), lt(receipts.date, end)))
    .orderBy(desc(receipts.date));
  return rows;
}

// The full-row counterpart to getReceiptsForYear, fileDataUrl included —
// used only by the "Download Receipts" route handler to build the combined
// PDF, never by a page render (see the comment above getReceiptsForYear for
// why that split exists). Ascending by date: a packet reads as a
// chronological paper trail, oldest receipt first.
export async function getReceiptsForYearWithFiles(userId: string, year: number) {
  const { start, end } = taxYearRange(year);
  return db
    .select()
    .from(receipts)
    .where(and(eq(receipts.userId, userId), gte(receipts.date, start), lt(receipts.date, end)))
    .orderBy(receipts.date);
}

export async function getReceiptById(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
    .limit(1);
  return row ?? null;
}

// Every calendar year that has at least one receipt, for the same
// "always show the current year, plus every year with something in it"
// year-pill pattern getTaxYears already uses.
export async function getReceiptYears(userId: string): Promise<number[]> {
  const rows = await db
    .select({ y: sql<number>`extract(year from ${receipts.date})::int` })
    .from(receipts)
    .where(eq(receipts.userId, userId));
  const years = new Set<number>([new Date().getFullYear(), ...rows.map((r) => r.y)]);
  return Array.from(years).sort((a, b) => b - a);
}

export type TaxSummaryLine = {
  id: string;
  date: Date;
  amount: number;
  description: string | null;
  categoryName: string;
  editable: boolean; // false for automatic account-payout lines — those are managed from Accounts/Budgeting's payout log, not deletable here
};

export type TaxCategorySubtotal = { categoryName: string; total: number; lines: TaxSummaryLine[] };

export type TaxYearSummary = {
  year: number;
  income: TaxCategorySubtotal[];
  expense: TaxCategorySubtotal[];
  totalIncome: number;
  totalExpense: number;
  net: number;
};

// Pure grouping/totals logic — takes already-fetched rows so it's easy to
// reason about and test independently of the DB. Account payouts are folded
// in as a single "Account Payouts" category (one line per payout, described
// by which account it came from) alongside every custom income category.
export function summarizeTaxYear(
  year: number,
  entries: Awaited<ReturnType<typeof getTaxEntriesForYear>>,
  payoutRows: Awaited<ReturnType<typeof getPayoutsForTaxYear>>,
): TaxYearSummary {
  const byCategory = new Map<string, TaxCategorySubtotal>();

  function addLine(kind: "income" | "expense", categoryName: string, line: TaxSummaryLine) {
    const key = `${kind}::${categoryName}`;
    const existing = byCategory.get(key);
    if (existing) {
      existing.total += line.amount;
      existing.lines.push(line);
    } else {
      byCategory.set(key, { categoryName, total: line.amount, lines: [line] });
    }
  }

  for (const e of entries) {
    addLine(e.kind, e.category.name, {
      id: e.id,
      date: e.date,
      amount: Number(e.amount),
      description: e.description,
      categoryName: e.category.name,
      editable: true,
    });
  }

  for (const p of payoutRows) {
    addLine("income", "Account Payouts", {
      id: p.id,
      date: p.date,
      amount: Number(p.grossAmount),
      description: p.account?.name ?? null,
      categoryName: "Account Payouts",
      editable: false,
    });
  }

  const income: TaxCategorySubtotal[] = [];
  const expense: TaxCategorySubtotal[] = [];
  for (const [key, subtotal] of byCategory) {
    subtotal.lines.sort((a, b) => b.date.getTime() - a.date.getTime());
    if (key.startsWith("income::")) income.push(subtotal);
    else expense.push(subtotal);
  }
  income.sort((a, b) => b.total - a.total);
  expense.sort((a, b) => b.total - a.total);

  const totalIncome = income.reduce((s, c) => s + c.total, 0);
  const totalExpense = expense.reduce((s, c) => s + c.total, 0);

  return { year, income, expense, totalIncome, totalExpense, net: totalIncome - totalExpense };
}

export { accounts, pairs, entryModels, sessions, setups, trades, tradeSetups, payouts, taxProfile, taxCategories, taxEntries, taxImportBatches, copyDestinations, eq };
