/**
 * Seeds reference/tag data so the Add Trade form has real options from day
 * one, plus a starter set of accounts matching the ones already in August's
 * Notion Accounts database — all attached to one bootstrap member account so
 * this stays useful for a fresh dev database.
 *
 * Confluences ("setups"), entry models, and pairs are intentionally NOT
 * seeded here — every member builds all three lists from scratch via the
 * "+ Add" controls on the Add Trade page, rather than inheriting a fixed
 * default list.
 *
 * The bootstrap member is upserted by email, so re-running this is safe.
 * Override with env vars if you want different seed credentials:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD
 *
 * Run with: npm run db:seed
 */
import "dotenv/config";
import { db } from "./index";
import { accounts, sessions, taxProfile, users } from "./schema";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "@/lib/password";

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const SEED_ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Admin";
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

const SESSIONS = [
  "New York (AM)", "London", "Asia", "New York (PM)", "Pre Market", "Weekend", "Unknown",
];

const ACCOUNTS: {
  name: string;
  type: "prop_firm" | "live" | "paper" | "backtest" | "forward_test";
  firm?: string;
  sizeUsd?: string;
  status: "active" | "passed" | "failed" | "funded" | "closed";
  startingBalance: string;
}[] = [
  { name: "Apex 50k", type: "prop_firm", firm: "Apex Trader Funding", sizeUsd: "50000", status: "funded", startingBalance: "50000" },
  { name: "TopStep 50k", type: "prop_firm", firm: "Topstep", sizeUsd: "50000", status: "funded", startingBalance: "50000" },
  { name: "FundedNext 25k", type: "prop_firm", firm: "FundedNext Futures", sizeUsd: "25000", status: "funded", startingBalance: "25000" },
  { name: "MyFundedFutures 50k", type: "prop_firm", firm: "MyFundedFutures", sizeUsd: "50000", status: "active", startingBalance: "50000" },
  { name: "Live Account", type: "live", status: "active", startingBalance: "0" },
  { name: "Paper", type: "paper", status: "active", startingBalance: "0" },
];

async function main() {
  console.log("Seeding reference data…");

  await db.insert(sessions).values(SESSIONS.map((name) => ({ name }))).onConflictDoNothing();

  // Bootstrap member — every account/trade/payout in this app belongs to a
  // user, so seed data needs an owner. First user ever created is always
  // admin (see isFirstEverUser in lib/auth.ts); on a fresh DB this becomes
  // that first admin automatically.
  let [seedUser] = await db.select().from(users).where(eq(users.email, SEED_ADMIN_EMAIL)).limit(1);
  if (!seedUser) {
    const isFirstUser = (await db.select({ id: users.id }).from(users).limit(1)).length === 0;
    const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);
    [seedUser] = await db
      .insert(users)
      .values({
        email: SEED_ADMIN_EMAIL,
        name: SEED_ADMIN_NAME,
        passwordHash,
        role: isFirstUser ? "admin" : "member",
      })
      .returning();
    console.log(`Created seed user ${SEED_ADMIN_EMAIL} (password: ${SEED_ADMIN_PASSWORD}) — change this in a real deployment.`);
  }

  const existingAccounts = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, seedUser.id)).limit(1);
  if (existingAccounts.length === 0) {
    await db.insert(accounts).values(ACCOUNTS.map((a) => ({ ...a, userId: seedUser.id })));
  }

  const existingProfile = await db.select().from(taxProfile).where(eq(taxProfile.userId, seedUser.id)).limit(1);
  if (existingProfile.length === 0) {
    await db.insert(taxProfile).values({
      userId: seedUser.id,
      country: "United States",
      countryCode: "US",
    });
  }

  console.log("Done.");
  await db.execute(sql`select 1`); // keep pool warm check
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
