import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  pgEnum,
  primaryKey,
  index,
  unique,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

export const accountTypeEnum = pgEnum("account_type", [
  "prop_firm",
  "live",
  "paper",
  "backtest",
  "forward_test",
]);

export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "passed",
  "failed",
  "funded",
  "closed",
]);

export const positionEnum = pgEnum("position", ["long", "short"]);

export const outcomeEnum = pgEnum("outcome", ["win", "loss", "be"]);

export const marketSessionEnum = pgEnum("market_session", ["asia", "london", "new_york"]);

export const sessionBiasEnum = pgEnum("session_bias", ["bullish", "bearish", "neutral"]);

// Only medium/high are ever stored — "low" and "holiday" impact events from
// the ForexFactory feed are discarded at sync time, per August's request to
// only track red (high) and orange (medium) folder news.
export const newsImpactEnum = pgEnum("news_impact", ["medium", "high"]);

export const taxEntryKindEnum = pgEnum("tax_entry_kind", ["income", "expense"]);

// ---------------------------------------------------------------------------
// Members — each signed-up member gets their own login and sees only their
// own accounts/trades/payouts. Invite codes gate signup since this sits
// behind a paid community, not open to anyone with the link. The very first
// user ever created (empty table) is auto-promoted to admin so there's
// always someone who can generate invite codes.
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
// NOTE: an earlier migration (0003) also added a "used_invite_code_id"
// column to the real "users" table in the database, but it was deliberately
// left out of this schema.ts definition — declaring it here creates a
// circular type-inference loop with inviteCodes (which references users
// back) that breaks TypeScript inference across the whole app. The column
// sits unused in the database; nothing reads or writes it. Leave it alone —
// don't add it back here, and don't let a future `drizzle-kit generate` talk
// you into a migration that drops it.

// Opaque bearer tokens, stored server-side so a logout (or a revoke) actually
// invalidates them — not a stateless JWT. One row per signed-in browser.
export const authSessions = pgTable("auth_sessions", {
  token: text("token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// "Forgot password" links — one-time, short-lived tokens, same opaque-random-
// string-in-a-table shape as auth_sessions above (never a JWT) so a token
// can actually be invalidated server-side rather than just expiring on its
// own timer. Requesting a new reset link deletes any older ones for that
// member first (see createPasswordResetToken in lib/auth.ts), so only the
// most recently emailed link ever works, and consuming a token deletes it —
// good for exactly one reset.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
);

// Access codes August hands out to paying members so signup isn't wide open.
// maxUses null = unlimited; usesCount increments on every successful signup.
export const inviteCodes = pgTable("invite_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label"),
  maxUses: integer("max_uses"),
  usesCount: integer("uses_count").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Reference / tag tables — mirrors August's existing Notion structure so the
// Add Trade form and Analytics rollups line up with his proven system.
// Sessions are shared vocabulary across every member; "pairs", "entry
// models" and "setups" (confluences) are personal per-member — see the
// notes above each table below.
// ---------------------------------------------------------------------------

// Account groups — a member's own folders for organizing accounts (e.g. one
// firm like Apex can have 20 separate accounts; a group lets those be
// collapsed into one "Apex" section on the Accounts dashboard instead of 20
// flat cards with no structure). Same "+ Add your own" per-member pattern as
// pairs/entry models/setups/tax categories: freeform, named by the member,
// unique only within their own list. Deliberately a separate concept from
// the existing freeform `accounts.firm` text field (which just labels which
// firm an account is with) — a group is an explicit, member-chosen bucket
// that can hold accounts across different firms/types if that's how a
// member wants to organize their dashboard.
export const accountGroups = pgTable(
  "account_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("account_groups_user_name_unique").on(t.userId, t.name)],
);

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull().default("paper"),
  firm: text("firm"),
  sizeUsd: numeric("size_usd", { precision: 14, scale: 2 }),
  status: accountStatusEnum("status").notNull().default("active"),
  startingBalance: numeric("starting_balance", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  // Optional — an account with no group shows in the dashboard's "Ungrouped"
  // section. Deleting a group (accountGroups above) un-groups its accounts
  // rather than deleting them (`onDelete: set null`), same treatment as
  // deleting an entry model just clears the tag off past trades.
  groupId: uuid("group_id").references(() => accountGroups.id, { onDelete: "set null" }),
  // Copytrader / Tradovate live sync — the broker-side account number this
  // journal account corresponds to (from Tradovate's Account Info panel),
  // and whether this is the one account the copy engine watches as the
  // "leader" whose fills get mirrored onto every enabled copy destination.
  tradovateAccountId: text("tradovate_account_id"),
  isCopyLeader: boolean("is_copy_leader").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Pairs — every member builds their own list from scratch via the "+ Add"
// control on the Add Trade page, same pattern as entry models/setups below
// (a symbol is only unique within one member's own list, not globally) —
// someone who only trades NQ and GC just adds those two and never sees
// anyone else's instruments.
export const pairs = pgTable(
  "pairs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
  },
  (t) => [unique("pairs_user_symbol_unique").on(t.userId, t.symbol)],
);

// Entry models — every member builds their own list from scratch via the
// "+ Add" control on the Add Trade page, same as setups/confluences below
// (a name is only unique within one member's own list, not globally).
export const entryModels = pgTable(
  "entry_models",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [unique("entry_models_user_name_unique").on(t.userId, t.name)],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
});

// Confluences — every member builds their own list from scratch via the
// "+ Add" control on the Add Trade page, so these are per-member (a name is
// only unique within one member's own list, not globally).
export const setups = pgTable(
  "setups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [unique("setups_user_name_unique").on(t.userId, t.name)],
);

// ---------------------------------------------------------------------------
// Trades — one row per trade, matching the Notion Journal database
// ---------------------------------------------------------------------------
export const trades = pgTable(
  "trades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    pairId: uuid("pair_id")
      .notNull()
      .references(() => pairs.id),
    entryModelId: uuid("entry_model_id").references(() => entryModels.id, { onDelete: "set null" }),
    position: positionEnum("position").notNull(),
    sessionId: uuid("session_id").references(() => sessions.id),
    rr: numeric("rr", { precision: 6, scale: 2 }).notNull(),
    outcome: outcomeEnum("outcome").notNull(),
    // Actual realized $ P&L for this trade, entered manually (signed — negative
    // for a loss). Optional: older trades and anyone who only tracks R won't
    // have this set. Feeds the account's live current-balance figure and the
    // PnL calendar.
    pnlUsd: numeric("pnl_usd", { precision: 14, scale: 2 }),
    preTrade: text("pre_trade"),
    management: text("management"),
    review: text("review"),
    // A screenshot of the actual trade, attached from the Add/Edit Trade
    // form. Stored as a compressed base64 "data:image/..." URI rather than
    // a link to separate file storage — no bucket/CDN to set up, it just
    // works — so this column holds the image itself, not a pointer to it.
    chartImageUrl: text("chart_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("trades_date_idx").on(t.date), index("trades_account_idx").on(t.accountId)],
);

// Multiple confluences ("Setups") per trade — many-to-many
export const tradeSetups = pgTable(
  "trade_setups",
  {
    tradeId: uuid("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    setupId: uuid("setup_id")
      .notNull()
      .references(() => setups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.tradeId, t.setupId] })],
);

// ---------------------------------------------------------------------------
// Payouts — feeds the Budgeting & Tax screen
// ---------------------------------------------------------------------------
export const payouts = pgTable("payouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  date: timestamp("date", { withTimezone: true }).notNull(),
  grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
  netAmount: numeric("net_amount", { precision: 14, scale: 2 }).notNull(),
  setAsidePct: numeric("set_aside_pct", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One filing-region profile per member.
export const taxProfile = pgTable("tax_profile", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  country: text("country").notNull().default("United States"),
  countryCode: text("country_code").notNull().default("US"),
  filingStatus: text("filing_status"),
  blendedRatePct: numeric("blended_rate_pct", { precision: 5, scale: 2 }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Tax calculator — August's own words: a real income/write-off ledger, not
// just the payout set-aside tracker above. Per-member, like pairs/entry
// models/setups. Categories are freeform and user-named (e.g. "Lucid
// Payout", "Affiliate Payout", "Prop Firm Account Purchase") — same "+ Add
// your own" pattern as everything else in this app, split by kind
// (income/expense) since a category only ever means one or the other. Entry
// amounts are always stored as a positive magnitude; `kind` (via the
// category) says whether it adds to or subtracts from the year's net total.
// Existing `payouts` rows are NOT duplicated in here — they already track
// account payouts — the tax-year summary query unions them in as automatic,
// read-only "Account Payouts" income lines instead.
// ---------------------------------------------------------------------------
export const taxCategories = pgTable(
  "tax_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: taxEntryKindEnum("kind").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("tax_categories_user_kind_name_unique").on(t.userId, t.kind, t.name)],
);

// One CSV/text-file import creates one batch row plus one tax_entries row
// per successfully-parsed line, so an entire import can be undone in one
// click (delete the batch, cascade-deletes its entries) if it was mapped
// wrong. This is a generic column-mapped CSV importer, not a firm-specific
// one-click import — no real prop-firm export file was available to model
// a real one against; see the note on importTaxEntries in actions/tax.ts.
export const taxImportBatches = pgTable("tax_import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  kind: taxEntryKindEnum("kind").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxEntries = pgTable(
  "tax_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: taxEntryKindEnum("kind").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => taxCategories.id),
    date: timestamp("date", { withTimezone: true }).notNull(),
    // Always a positive magnitude, like trades.rr — `kind` (mirrored from the
    // category) supplies the sign in every year-summary total, so this can't
    // suffer the same double-negative bug the R:R field once had.
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    description: text("description"),
    source: text("source").notNull().default("manual"), // "manual" | "import"
    importBatchId: uuid("import_batch_id").references(() => taxImportBatches.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tax_entries_user_date_idx").on(t.userId, t.date)],
);

// ---------------------------------------------------------------------------
// Receipts — a general holding pen for every purchase receipt/invoice a
// member wants on hand for tax time (prop-firm eval receipts, software
// subscriptions, whatever), independent of any one tax_entries row (a
// receipt doesn't have to be linked to a specific logged income/expense
// line to be worth keeping). Same storage philosophy as trades.chartImageUrl
// — the file itself (image or PDF) is stored as a base64 data URI directly
// in this text column rather than pushed out to a separate bucket/CDN, so
// there's no file-storage service to provision. `date` defaults to the
// upload date but is editable (the date on the actual receipt matters more
// than when it was scanned in) and is what "Download Receipts" scopes by
// tax year, same as everything else on the Budgeting & Tax page.
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    label: text("label"),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(), // "image/jpeg" | "image/png" | ... | "application/pdf"
    fileDataUrl: text("file_data_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipts_user_date_idx").on(t.userId, t.date)],
);

// ---------------------------------------------------------------------------
// Market session bias log — August's own daily macro read: for each of the
// three trading sessions (Asia/London/New York), was it bullish or bearish,
// and how many points did it push or dump. Per-member, like accounts/setups
// above. One row per (member, date, session) — logging the same day+session
// again overwrites that entry (an "upsert") rather than creating a
// duplicate, since this is meant to be a quick daily habit, not a form to
// fight with. `date` is always stored as that calendar day's UTC midnight
// (never a real time-of-day) so the uniqueness check behaves predictably.
// ---------------------------------------------------------------------------
export const sessionLogs = pgTable(
  "session_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    session: marketSessionEnum("session").notNull(),
    bias: sessionBiasEnum("bias").notNull(),
    pointsMoved: numeric("points_moved", { precision: 8, scale: 2 }).notNull(),
    // Optional OHLC-style session data, in points. Reserved for a future
    // "import real session data" feature (August's own words: build the
    // schema for it now, build the actual import later) — nothing writes
    // these yet, the manual "Log a Session" form above only asks for bias +
    // net points moved, so these stay null for every entry logged that way.
    openPts: numeric("open_pts", { precision: 10, scale: 2 }),
    highPts: numeric("high_pts", { precision: 10, scale: 2 }),
    lowPts: numeric("low_pts", { precision: 10, scale: 2 }),
    closePts: numeric("close_pts", { precision: 10, scale: 2 }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("session_logs_user_date_session_unique").on(t.userId, t.date, t.session)],
);

// ---------------------------------------------------------------------------
// News events — high/medium impact economic calendar events, synced from a
// public ForexFactory-mirroring feed by an admin (see the "Sync News" control
// on the News page, admin-only). Unlike accounts/session logs above, this is
// NOT per-member: one shared table every member reads from, since news isn't
// personal data. An admin clicking "Sync Now" fetches the last/this/next-week
// feeds and upserts here; low-impact and holiday events are filtered out
// before anything is written, so this table only ever holds red/orange
// folder news. `date` is that calendar day's UTC midnight (the feed's date is
// already a plain calendar day, no real time-of-day, same convention as
// session_logs above). `time`/`timeMinutes` are UTC, not Eastern as
// originally assumed when this table was first built — confirmed 2026-09-10
// by cross-checking known release times (Unemployment Claims/Core CPI m/m
// both come back "12:30pm" in the feed, which is their real 8:30am ET
// release time as a UTC value, not an ET one). `time` is kept as the feed's
// raw UTC display string; `timeMinutes` is UTC minutes-since-midnight for
// sorting within a day and is null for entries with no fixed clock time
// (e.g. "Tentative", "All Day"). Convert to New York time for display via
// src/lib/newsTime.ts — never read `time`/`timeMinutes` directly as if they
// were already Eastern. Re-syncing the same event (same date+country+title)
// updates it in place instead of duplicating it, so syncing repeatedly is
// always safe.
// ---------------------------------------------------------------------------
export const newsEvents = pgTable(
  "news_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    time: text("time"),
    timeMinutes: integer("time_minutes"),
    country: text("country").notNull(),
    title: text("title").notNull(),
    impact: newsImpactEnum("impact").notNull(),
    forecast: text("forecast"),
    previous: text("previous"),
    sourceUrl: text("source_url"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("news_events_date_country_title_unique").on(t.date, t.country, t.title)],
);

// ---------------------------------------------------------------------------
// Copytrader — destination account configs (UI/config only; no live broker
// execution wired up yet)
// ---------------------------------------------------------------------------
export const copyDestinations = pgTable("copy_destinations", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  firmName: text("firm_name").notNull(),
  accountLabel: text("account_label").notNull(),
  scaleMultiplier: numeric("scale_multiplier", { precision: 5, scale: 2 })
    .notNull()
    .default("1.0"),
  dailyLossCapUsd: numeric("daily_loss_cap_usd", { precision: 14, scale: 2 }),
  enabled: boolean("enabled").notNull().default(true),
  lastMirroredAt: timestamp("last_mirrored_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  accountGroups: many(accountGroups),
  setups: many(setups),
  entryModels: many(entryModels),
  pairs: many(pairs),
  sessionLogs: many(sessionLogs),
  authSessions: many(authSessions),
  passwordResetTokens: many(passwordResetTokens),
  taxCategories: many(taxCategories),
  taxEntries: many(taxEntries),
  receipts: many(receipts),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  user: one(users, { fields: [receipts.userId], references: [users.id] }),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));

export const inviteCodesRelations = relations(inviteCodes, ({ one }) => ({
  createdBy: one(users, { fields: [inviteCodes.createdByUserId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  group: one(accountGroups, { fields: [accounts.groupId], references: [accountGroups.id] }),
  trades: many(trades),
  payouts: many(payouts),
  copyDestinations: many(copyDestinations),
}));

export const accountGroupsRelations = relations(accountGroups, ({ one, many }) => ({
  user: one(users, { fields: [accountGroups.userId], references: [users.id] }),
  accounts: many(accounts),
}));

export const copyDestinationsRelations = relations(copyDestinations, ({ one }) => ({
  account: one(accounts, { fields: [copyDestinations.accountId], references: [accounts.id] }),
}));

export const tradesRelations = relations(trades, ({ one, many }) => ({
  account: one(accounts, { fields: [trades.accountId], references: [accounts.id] }),
  pair: one(pairs, { fields: [trades.pairId], references: [pairs.id] }),
  entryModel: one(entryModels, {
    fields: [trades.entryModelId],
    references: [entryModels.id],
  }),
  session: one(sessions, { fields: [trades.sessionId], references: [sessions.id] }),
  tradeSetups: many(tradeSetups),
}));

export const tradeSetupsRelations = relations(tradeSetups, ({ one }) => ({
  trade: one(trades, { fields: [tradeSetups.tradeId], references: [trades.id] }),
  setup: one(setups, { fields: [tradeSetups.setupId], references: [setups.id] }),
}));

export const setupsRelations = relations(setups, ({ one, many }) => ({
  user: one(users, { fields: [setups.userId], references: [users.id] }),
  tradeSetups: many(tradeSetups),
}));

export const entryModelsRelations = relations(entryModels, ({ one, many }) => ({
  user: one(users, { fields: [entryModels.userId], references: [users.id] }),
  trades: many(trades),
}));

export const pairsRelations = relations(pairs, ({ one, many }) => ({
  user: one(users, { fields: [pairs.userId], references: [users.id] }),
  trades: many(trades),
}));

export const payoutsRelations = relations(payouts, ({ one }) => ({
  account: one(accounts, { fields: [payouts.accountId], references: [accounts.id] }),
}));

export const sessionLogsRelations = relations(sessionLogs, ({ one }) => ({
  user: one(users, { fields: [sessionLogs.userId], references: [users.id] }),
}));

export const taxCategoriesRelations = relations(taxCategories, ({ one, many }) => ({
  user: one(users, { fields: [taxCategories.userId], references: [users.id] }),
  entries: many(taxEntries),
}));

export const taxImportBatchesRelations = relations(taxImportBatches, ({ one, many }) => ({
  user: one(users, { fields: [taxImportBatches.userId], references: [users.id] }),
  entries: many(taxEntries),
}));

export const taxEntriesRelations = relations(taxEntries, ({ one }) => ({
  user: one(users, { fields: [taxEntries.userId], references: [users.id] }),
  category: one(taxCategories, { fields: [taxEntries.categoryId], references: [taxCategories.id] }),
  importBatch: one(taxImportBatches, { fields: [taxEntries.importBatchId], references: [taxImportBatches.id] }),
}));
