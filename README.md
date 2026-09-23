# The Backroom — Member Desk

A trading journal + prop-firm toolkit for your whole community, built around
your real Notion journal structure: confluences, entry models, sessions,
pairs, accounts, and the three-part trade narrative (pre-trade / management /
review). R-multiple based, so stats match how you actually grade trades.

Every member gets their own login and only ever sees their own accounts,
trades, and payouts — see **Accounts & members** below before you do anything
else with a database that has real data in it.

## What's in here

- **Login / Signup** — email+password auth, invite-code-gated signup so
  membership stays limited to people you've actually given a code to.
- **Journal** — every logged trade, filterable table, live KPIs. Every row has
  an Edit and Delete action — same on each account's own Trades table.
- **Add Trade** — the full entry form: account, pair, entry model, session,
  R:R, outcome, optional $ P&L, your confluence tags, an optional chart
  screenshot, and the three-part narrative. Pairs, entry models, and
  confluences are all per-member lists you build yourself via a "+ Add"
  control right on the form — if you only trade NQ and GC, that's all you
  ever add, no fixed dropdown of instruments to wade through. A pair already
  used on one of your trades can't be deleted (it would orphan that trade's
  history) — remove the trade first, or just leave it.
- **Chart screenshots** — attach a screenshot of the actual trade from the
  Add/Edit Trade form (optional). It's compressed and resized in your
  browser before it's saved, so there's no file storage or upload service to
  set up — it just works. Any trade with one gets a "Chart" link next to
  Edit/Delete in the Journal and the account's Trades table, opening the
  full image in a new tab.
- **R:R is always stored as a positive number** — Outcome (Win/Loss/B/E) is
  what makes it count for or against you in Net R and Profit Factor. You can
  still just type it as a negative number for a loss (e.g. "-2") if that's
  more natural — the field auto-flips Outcome to Loss and normalizes the
  number back to positive for you. A handful of trades logged before the
  original fix (as a negative number that got double-counted) were corrected
  automatically on update. The Journal and each account's Trades table now
  also *display* R:R with the sign and color that match Outcome (a loss
  shows as e.g. "−2.00R" in red, a win in green) instead of always showing
  an unsigned positive number.
- **Analytics** — win rate, profit factor, avg R:R, an equity curve in
  cumulative R, and win-rate breakdowns by confluence (with avg R:R), entry
  model, session, and pair — filterable by Daily/Weekly/Monthly/Yearly/Lifetime.
- **PnL Calendar** — month-grid view of daily P&L, filterable by account
  (that filter is remembered across visits — see the News entry below for
  how). Checkboxes above the grid let you show or hide trade count, $ P&L,
  net R, and news events (the same short-name tags the News page shows, e.g.
  "CPI"/"FOMC Presser", colored by impact) independently per day (remembered
  per-browser).
- **Market Bias** — your own daily macro read, separate from your trade log:
  for each of the Asia/London/New York sessions, log whether it was bullish
  or bearish and how many points it pushed or dumped, with an optional note.
  Summary cards and a table, filterable by Daily/Weekly/Monthly/Yearly/Lifetime.
  Logging the same date+session again just updates that entry. Edit and
  Delete on every row. (The schema also has a few reserved-for-later fields
  for importing real session open/high/low/close data — not used by
  anything yet, see the project plan.) Below the table, a **Session
  Correlation** panel answers questions like "after London dumps 50+
  points, how often does New York come back bullish?" — pick a trigger
  session/direction/threshold and a target session, and it shows how often
  the target reversed, continued, or came in neutral, computed entirely
  from your own logged bias/points-moved history (no OHLC import needed).
- **News** — a shared economic calendar (month grid + table), synced from
  ForexFactory's public calendar feed. Only high (red folder) and medium
  (orange folder) impact events are kept — low impact and holidays are
  filtered out automatically. Every member can view it; only an admin sees
  the "Sync Now" button (Invite Codes-holders — see Accounts & members).
  Clicking it pulls whichever of last/this/next week the feed has available
  (if one of the three is temporarily down upstream, the rest still sync —
  you'll see a note naming which one didn't come through) and updates the
  calendar for everyone at once, since news isn't personal data the way
  trades are. Re-syncing is always safe — it just updates existing events
  instead of duplicating them. Click a day on the calendar to see just that
  day's events in the table below. Filter by asset (USD, EUR, etc.) with the
  pills above the calendar — this only changes what you see, not what gets
  synced — that filter is remembered (via a cookie) the next time you open
  the page, even after logging out and back in. Event names show as the
  short term traders actually use (NFP, FOMC, CPI, PPI, ...) with the full
  official name underneath in the table, and now directly in each calendar
  day's cell too (up to 3 per day, "+N more" on a busy day). Times display
  correctly in New York time (previously mislabeled — see the project plan
  if you're curious). The same tags also show up on the PnL Calendar now,
  with their own toggle.
- **Accounts** — every account (prop firm, live, paper) with real computed
  stats: trade count, win rate, total R, live current balance, payouts.
- **Budgeting & Tax** — log payouts, set a blended tax rate, track set-aside
  progress. Not tax advice — it's a planning aid.
- **Invite Codes** (admin only) — generate/disable the codes members use to
  sign up.
- **EV Calculator** — the Monte Carlo simulator (same engine as the
  standalone tool) ranking real prop-firm accounts by expected value against
  your actual trade stats.
- **Hide $ amounts** (sidebar button) — blurs every dollar figure site-wide
  (balances, P&L, payouts) for streaming or screen-sharing. Per-browser,
  remembered via localStorage — click again to reveal.

**Not currently on the website:** Copytrader (live Tradovate trade copying)
was pulled from the UI — see the section near the bottom of this file and
the project plan for why and what's next.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 ·
Drizzle ORM · PostgreSQL. Everything is server-rendered with real Server
Actions — no mock data, no client-side API layer.

## Local setup

1. **Install dependencies** (this repo needs `--legacy-peer-deps` due to an
   unrelated npm/arborist bug):

   ```bash
   npm install --legacy-peer-deps
   ```

2. **Get a Postgres database.** Any Postgres 14+ works. Easiest paths:
   - **Supabase** (recommended — free tier, works great for this): create a
     project at [supabase.com](https://supabase.com), then grab the
     connection string from Project Settings → Database → Connection String
     (use the "Transaction" pooler string for serverless deploys, the direct
     string for local dev).
   - **Local Postgres**: `createdb backroom_journal` after installing
     Postgres locally.

3. **Set your connection string** in `.env`:

   ```
   DATABASE_URL="postgresql://user:password@host:5432/backroom_journal"
   ```

   Optionally, also set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (see
   `.env.example`) if you want "forgot password" reset emails to actually
   send in local dev — see **Accounts & members** below for details. Without
   these, everything else works fine; only that one feature is affected.

4. **Run migrations and seed reference data:**

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

   This seeds sessions and pairs (shared across every member — entry models
   and confluences are built by each member from scratch instead), creates
   one bootstrap member account (`admin@example.com` /
   `changeme123` by default — override with `SEED_ADMIN_EMAIL` /
   `SEED_ADMIN_NAME` / `SEED_ADMIN_PASSWORD` env vars), and attaches the six
   starter accounts from your Notion setup (Apex 50k, TopStep 50k, FundedNext
   25k, MyFundedFutures 50k, Live Account, Paper) plus a tax profile to that
   bootstrap member. **Change that password before this database has real
   members on it.**

5. **Start the dev server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) — you'll land on
   `/login`. Sign in with the bootstrap credentials above, or see **Accounts
   & members** below for how to get new members signed up.

## Optional: seed demo trades

To see the Journal/Analytics/Accounts pages populated while you're getting
oriented:

```bash
npm run db:seed-demo-trades
```

Then clear them before you start logging real trades:

```bash
npm run db:clear-trades
```

(`db:clear-trades` removes trades, trade-setup tags, and payouts only — it
never touches your accounts, pairs, entry models, sessions, or confluences.)

## Accounts & members

Every account, trade, payout, tax profile, entry-model list, and confluence
list belongs to exactly one signed-in member — there's no shared data
between members except the instrument list (pairs) and session names, which
are the same for everyone. Signing up requires an invite code.

**Getting your own first login on a brand-new database:** the very first
account ever created is automatically made an admin, so the simplest path is
`npm run db:seed` (see above) and log in with those credentials — or sign up
normally at `/signup` before seeding anything, in which case *that* account
becomes the admin instead (it'll ask for an invite code even though none
exist yet — insert one directly for this one-time bootstrap:
`INSERT INTO invite_codes (code) VALUES ('FIRSTCODE');`).

**Inviting real members:** once you have an admin login, go to **Invite
Codes** in the sidebar. Leave "Max Uses" blank for a code you can share once
in Discord and reuse for everyone, or set it to `1` for a single-use code for
one specific person. Disabling a code stops new signups without deleting its
history.

**Migrating an existing database that predates this feature:** if you're
running this against a database that already had accounts/trades/payouts in
it before member accounts existed, the migration that adds the required
`user_id` columns will fail until every existing row has an owner. Sign up
for your own account first, then run something like this against your
database *before* applying that migration, substituting your new user's id:

```sql
UPDATE accounts SET user_id = '<your user id>' WHERE user_id IS NULL;
UPDATE setups SET user_id = '<your user id>' WHERE user_id IS NULL;
UPDATE tax_profile SET user_id = '<your user id>' WHERE user_id IS NULL;
```

**Migrating an existing database to per-member entry models:** entry models
went from shared/global to per-member the same way setups did above, but a
little later, so it's a two-step migration if your database already has
entry-model rows in it (and trades pointing at them) from before this
change:

1. Run `npm run db:migrate` once — this adds the new column without
   requiring every row to already have an owner yet, so it's safe to run
   immediately, even with existing data.
2. Back-fill the existing rows with your own user id (same idea as the
   `UPDATE` statements above):
   ```sql
   UPDATE entry_models SET user_id = '<your user id>' WHERE user_id IS NULL;
   ```
3. Run `npm run db:migrate` again — this second run locks the column in as
   required, now that every row has an owner.

**Password reset:** a member can reset their own password from `/login` →
"Forgot password?" — enter the account's email, get a one-hour reset link by
email (via [Resend](https://resend.com); see **Local setup** step 3 and
**Deploying** below for the env vars it needs), set a new password. Resetting
logs that member out everywhere else they were signed in, same as changing a
password normally should. When the email address entered doesn't match an
account, the form shows the same "if that email exists, we've sent a link"
message as when it does — it never confirms which emails are registered.
When it *does* match an account but `RESEND_API_KEY` isn't set (or the send
otherwise fails), the member sees an error instead, since silently saying
"check your email" with nothing actually sent would leave them stuck — check
the server logs for the real Resend error if a member reports this.

**What's not built yet:** email verification on signup; any member
management beyond invite codes (no way yet to see the member list or
deactivate someone from the UI).

**Migrating an existing database to add Market Bias:** this one's simple —
it's a brand-new table, so there's no existing data to back-fill. Just run
`npm run db:migrate` once and you're done.

**Migrating an existing database to add News:** same as Market Bias — a
brand-new table (`news_events`), nothing to back-fill. Run `npm run
db:migrate` once. Nobody sees any events until an admin visits the News page
and clicks "Sync Now" for the first time.

**Migrating an existing database to per-member pairs + the R:R fix:** run
`npm run db:migrate` once — it re-homes every pair you've already used onto
your own login automatically (no re-entering NQ/GC by hand), drops the
handful of unused starter pairs nobody ever traded, and corrects any trade
that had a negative R:R from before this fix. Nothing else to do.

**A note on the News feature's data source:** it pulls from
`nfs.faireconomy.media`, a free public feed that mirrors ForexFactory's
calendar (title, country, date, time, impact, forecast, previous) — the same
data many trading tools and EAs use, not ForexFactory's own site directly
(they don't offer a public API). It's not an official/contracted feed, so if
it ever goes down or changes its format, the "Sync Now" button will show an
error message instead of crashing the page — nothing else breaks. Each sync
only pulls a rolling ~3-week window (last/this/next week), which is all the
free feed offers; syncing regularly is what builds up history over time,
since past weeks stay in the database once synced.

## Deploying

This is a standard Next.js app — it deploys to **Vercel** with zero config:

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Set `DATABASE_URL` in the Vercel project's environment variables (point
   it at your Supabase connection string — use the pooled connection string
   for serverless). Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` there too if
   you want password-reset emails to actually deliver to members — the
   `RESEND_FROM_EMAIL` address needs to be on a domain you've verified in
   Resend, not their shared test domain, which only delivers to your own
   Resend account's email.
4. Deploy. Run `npm run db:migrate` once (locally, pointed at the prod
   `DATABASE_URL`, or via a one-off script) before first use.

Fonts: the app uses system-font fallback stacks (Inter/IBM Plex
Mono/Fraunces with system fallbacks) instead of `next/font/google`, so it
renders correctly with zero network dependencies — on Vercel you can swap in
the actual Google Fonts via `next/font/google` if you want the exact
typefaces, but the fallback stacks are close.

## Copytrader: live trade copying (Tradovate)

**Update (2026-09-08):** the Copytrader screen and the "Copytrader /
Tradovate Sync" account-detail card described in step 1 below have been
pulled from the website — see the project plan for why (short version:
Tradovate restricts copy-trading between accounts under different prop-firm
logins, so the original plan needed rework first). The `tradovateAccountId`
and `isCopyLeader` columns are still on the `accounts` table and the engine
code below still works — there's just no UI for step 1 anymore. Until it's
rebuilt (or a different access method is chosen — see the project plan),
wire up an account directly in the database instead:

```sql
UPDATE accounts SET tradovate_account_id = '<id from Tradovate>', is_copy_leader = true WHERE id = '<leader account id>';
UPDATE accounts SET tradovate_account_id = '<id from Tradovate>' WHERE id = '<follower account id>';
```

Copy destinations (scale multiplier, daily loss cap, enable/disable, which
account they're linked to) still live in the `copy_destinations` table and
need the same direct-SQL treatment for now.

The rest of this section — credentials, dry run, going live, deployment —
still describes the standalone engine process accurately.

The Copytrader screen's "destinations" (scale multiplier, daily loss cap,
enable/disable) are real config, but by themselves they don't execute
anything — they're read by a separate, standalone process:
`src/engine/copy-engine.ts`, run with `npm run copy-engine`. It watches one
account (the "leader") for fills over Tradovate's real-time API and mirrors
each one, scaled, onto every enabled destination.

**This needs real money — go slowly, in this order:**

1. **Wire up the accounts.** Set the leader account's Tradovate Account ID
   (from Tradovate's Account Info panel) and mark it as the leader, and do
   the same for every follower account, using the SQL above (there's no UI
   for this right now — see the update note above). Make sure each account
   is linked to a copy destination row too.
2. **Set up credentials.** Copy `copy-engine.config.example.json` to
   `copy-engine.config.json` (already git-ignored — this file holds real
   broker logins, never commit it) and fill in the Tradovate login for the
   leader account and for every follower account, keyed by the same
   Tradovate Account ID you set in step 1.
3. **Dry run against demo first.** With `TRADOVATE_ENV=demo` (the default)
   in `.env` and demo-account credentials in the config file, run:
   ```
   npm run copy-engine
   ```
   This connects, authenticates, and logs every real-time event it sees —
   including exactly what order it *would* place on each follower — without
   ever calling Tradovate's order-placement endpoint. Place a manual trade
   on your leader demo account in Tradovate's own platform and confirm the
   engine logs a matching, correctly-scaled dry-run order for each follower.
4. **Only once that looks right**, flip to real order placement — still
   against demo accounts first — with `npm run copy-engine:live`.
5. **Go live for real** by setting `TRADOVATE_ENV=live` in `.env` with real
   account credentials in the config file, and start with just one follower
   destination enabled before turning the rest on.

**Where this runs:** it has to stay running 24/7 during market hours, which
a request-driven Next.js deployment (Vercel) can't do. Run it as its own
process on a small always-on box — a cheap VPS (Railway, Render, a $5–6/mo
droplet) works fine — kept alive with a process manager, e.g.:

```
npm install -g pm2
pm2 start "npm run copy-engine:live" --name copy-engine
pm2 save
pm2 startup   # follow the printed instructions to survive a reboot
```

**What's unverified:** the connection/auth/order-placement code here was
written directly from Tradovate's official API docs, but none of it has
actually been exercised against a live Tradovate connection — the
environment this was built in has no network path to Tradovate's servers.
The real-time "fill" event shape in particular (`onLeaderEvent` in
`copy-engine.ts`) is the least certain part — the big comment right above it
in that file explains what to check the first time you watch a real fill
come through. The `dailyLossCapUsd` risk setting is captured in the schema
and shown in the UI but **not yet enforced** by the engine — see the TODO
in `copy-engine.ts` before relying on it.

## Story Maker (owner-only)

**Story Maker** turns a short brief and a few photos into finished Instagram
story frames. Each frame is a 1080x1920 JPEG: your photo with a headline and
short text overlaid in Backroom styling.

1. Write a brief and add your photos in order. Claude writes one frame per photo.
2. Tweak the text. The preview is exactly the image you'll download.
3. Download frames one at a time, or use **Save all**. On a phone, Save all
   opens the share sheet, where "Save Images" puts them in your camera roll.
4. Post them yourself in the Instagram app, adding any link stickers or polls.

### Cropping to 9:16

Every photo is cropped to 1080x1920 around its subject, not just the
center. Claude finds the subject: for fresh uploads, in the same call that
writes the text; for library photos, once at upload from the thumbnail
(photos uploaded before this existed are detected the first time they're
used). Text goes on whichever half the subject isn't in. On each frame you
can **drag the preview** to reposition the photo, **Re-center** to undo, and
switch **Text: Top/Bottom**. Migration `0016_story_focus` adds the focus
columns.

### Photo library

Upload a batch of photos of yourself once under **Story Maker → Manage**, or
at `/stories/library`, up to 300 photos. Then, in Story Maker, pick a number
and click **Add random from library** to fill slides with random backgrounds.
**↻** swaps any slide for a different random library photo, before or after
generating. You can mix library photos with fresh uploads in the same story.

Library photos aren't sent to Claude, only fresh uploads are, so a 10-slide
library story is fast and cheap. The text is written to work over any photo.
Library photos are stored compressed in Postgres (migration
`0014_story_library`, so run `npm run db:migrate` once) and are only viewable
by the Story Maker owner.

The stories themselves still aren't saved. Frames live in the
browser until you download them, and the page warns you before you leave.

| Variable | What it is |
| --- | --- |
| `INSTAGRAM_OWNER_EMAIL` | The login email of the ONE account that may use Story Maker. Everyone else, including other admins, gets a 404, and the sidebar link is hidden for them. If this isn't set, nobody has access. |
| `ANTHROPIC_API_KEY` | From console.anthropic.com. Used to write the text. |
| `ANTHROPIC_MODEL` | *Optional.* Defaults to `claude-sonnet-5`. |

## Importing trades from Tradovate

**Journal → Import from Tradovate** (`/import-trades`) takes a Tradovate
**Performance** export (Account Reports → Performance → export CSV). Pick the
account to import into and the time zone your Tradovate platform shows times
in (default UTC).

- **One journal trade per round trip.** Rows sharing a fill are combined,
  so scaling in or out of one position is one trade, with quantity-weighted
  average entry and exit prices.
- **Filled in automatically:** date and time, direction, contracts,
  entry/exit, $ P&L, and Win/Loss/B/E from the P&L. Pairs are matched to
  yours (NQZ6 → NQ) or created.
- **R comes from your stop.** Imported trades show an **Add stop** badge.
  On Edit Trade, enter the stop price and R is calculated from the real
  P&L: `R = |P&L| ÷ (|entry − stop| × $/point × contracts)`. $/point is read
  from the export itself, falling back to a built-in table. Until a stop is
  entered, the trade counts toward win rate and $ P&L but not toward R stats.
- **Re-importing overlapping dates is safe.** Trades already in the account,
  matched by Tradovate fill id, are skipped.
- **$ P&L is before commissions**, as Tradovate reports it. Edit a trade's
  P&L to include fees if you want them in; R recalculates.

Migration `0015_trade_import` (run `npm run db:migrate` once) makes `rr`
nullable and adds the execution columns.

## Project structure

```
src/
  app/
    (app)/               # every signed-in screen — one shared layout that
                          # calls requireUser() once (journal, accounts,
                          # add-trade, analytics, budgeting, calendar,
                          # ev-calculator, admin/invites)
    login/, signup/       # auth pages (outside the (app) group — no login required)
    actions/              # server actions
      auth.ts               # signup / login / logout
      admin.ts              # invite-code create/toggle (admin only)
      accounts.ts, trades.ts, tax.ts, setups.ts, ...
  components/          # shared UI (Sidebar, PageHead, EquityCurve, LoginForm, etc.)
  db/
    schema.ts           # Drizzle schema — the whole data model
    queries.ts           # all read queries, every one scoped by userId
    seed.ts               # reference data + bootstrap admin + starter accounts
    seed-demo-trades.ts    # optional demo data generator
    clear-trades.ts          # wipes trades/payouts, keeps everything else
  engine/
    tradovate-client.ts  # Tradovate REST + WebSocket client
    copy-engine.ts        # standalone leader→follower copy process (see above)
  lib/
    auth.ts              # sessions, getCurrentUser/requireUser/requireAdmin
    password.ts           # scrypt password hashing (no external deps)
    ev-engine.ts         # the Monte Carlo EV simulator (firm data + math)
```
