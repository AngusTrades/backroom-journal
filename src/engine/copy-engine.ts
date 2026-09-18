/**
 * Backroom Copy Engine
 * ---------------------------------------------------------------------
 * A standalone, long-running process — separate from `npm run dev` /
 * `npm run build` — that watches your designated "leader" Tradovate
 * account for fills in real time and mirrors them onto every enabled
 * Copytrader destination, scaled by that destination's multiplier.
 *
 * This is NOT part of the Next.js web app's request/response cycle. It
 * needs to stay running 24/7 during market hours, so it's meant to run
 * as its own process on a small always-on server (see README.md).
 *
 * SAFETY MODEL — read this before you ever set --live:
 *   - Defaults to DRY RUN: it connects, authenticates, watches for
 *     fills, and logs exactly what order it WOULD place on each
 *     follower — without calling Tradovate's placeOrder endpoint. Real
 *     orders only ever go out when you explicitly pass --live.
 *   - Defaults to the DEMO environment (TRADOVATE_ENV=demo). You have
 *     to explicitly set TRADOVATE_ENV=live to point this at real money.
 *   - None of this has been run against a live Tradovate connection from
 *     my end — this sandbox has no network path to Tradovate's servers.
 *     Run it yourself against demo accounts first, read the logs
 *     closely, and only flip to --live once you've watched it behave
 *     correctly for a while. Start with ONE small follower account
 *     enabled before turning on the rest.
 *
 * Credentials come from a local, git-ignored config file
 * (copy-engine.config.json — see copy-engine.config.example.json),
 * never from the database and never from an argument on the command
 * line. Which accounts are wired up for copying — and their scale/risk
 * settings — still comes from Postgres (the same `accounts` and
 * `copy_destinations` tables the Accounts/Copytrader pages use), via the
 * `tradovateAccountId` you set on each account's detail page.
 */

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { db } from "../db";
import { accounts, copyDestinations, eq } from "../db/queries";
import { TradovateClient, type TradovateCredentials, type TradovateEnvironment } from "./tradovate-client";

interface EngineConfig {
  credentials: Record<string, TradovateCredentials>; // keyed by tradovateAccountId
}

const CONFIG_PATH = process.env.COPY_ENGINE_CONFIG ?? "copy-engine.config.json";
const isLive = process.argv.includes("--live");
const env: TradovateEnvironment = (process.env.TRADOVATE_ENV as TradovateEnvironment) ?? "demo";

function log(...args: unknown[]) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function loadConfig(): EngineConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Missing ${CONFIG_PATH}. Copy copy-engine.config.example.json to ${CONFIG_PATH} and fill in your ` +
        `Tradovate credentials for the leader account and every follower account (never commit this file).`,
    );
  }
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  if (!raw.credentials || typeof raw.credentials !== "object") {
    throw new Error(`${CONFIG_PATH} is missing a "credentials" object keyed by Tradovate account ID.`);
  }
  return raw as EngineConfig;
}

async function main() {
  log(`Starting copy engine — environment: ${env.toUpperCase()}, mode: ${isLive ? "LIVE (real orders!)" : "DRY RUN (log only)"}`);
  if (env === "live" && !isLive) {
    log("Note: TRADOVATE_ENV=live but --live was not passed — staying in dry run. Pass --live to actually place orders.");
  }

  const config = loadConfig();

  const leader = await db.select().from(accounts).where(eq(accounts.isCopyLeader, true)).limit(1).then((r) => r[0]);
  if (!leader) {
    throw new Error("No leader account set. Open an account's page in the app and check \"Leader account\".");
  }
  if (!leader.tradovateAccountId) {
    throw new Error(`Leader account "${leader.name}" has no Tradovate Account ID set on its account page.`);
  }
  const leaderCreds = config.credentials[leader.tradovateAccountId];
  if (!leaderCreds) {
    throw new Error(`No credentials in ${CONFIG_PATH} for leader Tradovate account ${leader.tradovateAccountId}.`);
  }

  const destinationRows = await db.query.copyDestinations.findMany({
    where: eq(copyDestinations.enabled, true),
    with: { account: true },
  });
  const followers = destinationRows.filter((d) => d.account?.tradovateAccountId);
  const skipped = destinationRows.filter((d) => !d.account?.tradovateAccountId);
  for (const d of skipped) {
    log(
      `Skipping destination "${d.accountLabel}" (${d.firmName}) — not linked to an account with a Tradovate ` +
        `Account ID set. Link it and set that account's Tradovate ID on its account page to include it.`,
    );
  }
  if (followers.length === 0) {
    log("No follower destinations are wired up yet (linked to an account with a Tradovate Account ID). Nothing to mirror to — running anyway so you can verify the leader connection.");
  } else {
    log(`Following leader "${leader.name}" (#${leader.tradovateAccountId}) → mirroring to: ${followers.map((f) => f.accountLabel).join(", ")}`);
  }

  const leaderClient = new TradovateClient(env, leaderCreds);
  await leaderClient.authenticate();
  log("Leader authenticated.");

  const followerClients = new Map<string, { client: TradovateClient; username: string }>(); // keyed by tradovateAccountId
  for (const f of followers) {
    const tid = f.account!.tradovateAccountId!;
    if (followerClients.has(tid)) continue;
    const creds = config.credentials[tid];
    if (!creds) {
      log(`No credentials in ${CONFIG_PATH} for follower Tradovate account ${tid} (${f.accountLabel}) — skipping.`);
      continue;
    }
    const client = new TradovateClient(env, creds);
    await client.authenticate();
    followerClients.set(tid, { client, username: creds.name });
    log(`Follower authenticated: ${f.accountLabel} (#${tid})`);
  }

  leaderClient.connectRealtime(
    (msg) => onLeaderEvent(msg, leader, followers, followerClients, isLive),
    (status) => log(`[leader ws] ${status}`),
  );

  log("Copy engine running. Ctrl+C to stop.");
}

/**
 * NOTE ON FILL EVENT SHAPE — the part of this file I'm least certain
 * about. Tradovate's real-time push messages after a user/syncrequest
 * generally arrive as { entityType, eventType, entity } for each entity
 * type you subscribed to. For a fill, "entity" is expected to carry
 * something like { id, orderId, accountId, contractId, action ("Buy" /
 * "Sell"), qty, price, timestamp } — but this wasn't independently
 * confirmed against Tradovate's own field-by-field reference. The first
 * thing to do when you run this against your demo leader account is
 * WATCH THE RAW LOGS from a real fill and confirm the shape below
 * actually matches — adjust the field names here if it doesn't. Nothing
 * downstream trusts a guess silently: if the shape doesn't match, this
 * logs the raw event and does nothing further.
 */
function onLeaderEvent(
  msg: unknown,
  leader: { id: string; name: string; tradovateAccountId: string | null },
  followers: Array<{ accountLabel: string; scaleMultiplier: string; dailyLossCapUsd: string | null; account: { tradovateAccountId: string | null } | null }>,
  followerClients: Map<string, { client: TradovateClient; username: string }>,
  isLive: boolean,
) {
  log("[leader event]", JSON.stringify(msg));

  const anyMsg = msg as { entityType?: string; eventType?: string; entity?: Record<string, unknown> };
  if (anyMsg.entityType !== "fill" || anyMsg.eventType !== "Created") return;

  const fill = anyMsg.entity;
  if (!fill) return;

  const action = fill.action as "Buy" | "Sell" | undefined;
  const qty = Number(fill.qty ?? fill.orderQty ?? 0);
  const symbol = String(fill.contractId ?? fill.symbol ?? "");

  if (!action || !qty || !symbol) {
    log("Fill event didn't match the expected shape (missing action/qty/symbol) — see the NOTE above. Raw:", JSON.stringify(fill));
    return;
  }

  log(`Leader fill detected: ${action} ${qty} ${symbol}`);

  for (const dest of followers) {
    const tid = dest.account?.tradovateAccountId;
    if (!tid) continue;
    const followerEntry = followerClients.get(tid);
    if (!followerEntry) continue;
    const { client, username } = followerEntry;

    const scaledQty = Math.max(1, Math.round(qty * Number(dest.scaleMultiplier)));
    const orderDescription = `${action} ${scaledQty} ${symbol} on ${dest.accountLabel} (#${tid})`;

    if (!isLive) {
      log(`[DRY RUN] would place: ${orderDescription}`);
      continue;
    }

    // TODO before relying on this: dailyLossCapUsd (dest.dailyLossCapUsd) is
    // captured in the schema but NOT yet enforced here — there's no check
    // against the follower account's actual current day P&L before firing
    // an order. Wire that up (via the account entity synced over the same
    // WebSocket, or a REST call) before trusting this past the demo stage.
    log(`[LIVE] placing: ${orderDescription}`);
    client
      .placeOrder({
        accountSpec: username,
        accountId: Number(tid),
        action,
        symbol,
        orderQty: scaledQty,
        orderType: "Market",
        isAutomated: true,
      })
      .then((res) => log(`[LIVE] order placed for ${dest.accountLabel}:`, JSON.stringify(res)))
      .catch((err) => log(`[LIVE] ORDER FAILED for ${dest.accountLabel}:`, err.message ?? err));
  }
}

main().catch((err) => {
  console.error("Copy engine crashed:", err);
  process.exit(1);
});
