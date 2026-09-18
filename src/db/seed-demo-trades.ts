/**
 * DEV-ONLY: inserts randomized demo trades so Analytics/Accounts/Budgeting
 * have something to render during QA. Run `npm run db:clear-trades` before
 * handing the app off so August starts with a clean journal.
 */
import "dotenv/config";
import { db } from "./index";
import { accounts, pairs, entryModels, sessions, setups, trades, tradeSetups, payouts } from "./schema";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickMany<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function main() {
  const accountRows = await db.select().from(accounts);
  const pairRows = await db.select().from(pairs);
  const entryModelRows = await db.select().from(entryModels);
  const sessionRows = await db.select().from(sessions);
  const setupRows = await db.select().from(setups);

  const fundedAccounts = accountRows.filter((a) => a.status === "funded");

  const now = Date.now();
  for (let i = 0; i < 40; i++) {
    const daysAgo = Math.floor(Math.random() * 60);
    const date = new Date(now - daysAgo * 86400000);
    const outcomeRoll = Math.random();
    const outcome = outcomeRoll < 0.52 ? "win" : outcomeRoll < 0.62 ? "be" : "loss";
    const rr = outcome === "win" ? (1 + Math.random() * 2.5).toFixed(2) : outcome === "be" ? "0" : (0.5 + Math.random() * 1).toFixed(2);

    const [inserted] = await db
      .insert(trades)
      .values({
        date,
        accountId: pick(accountRows).id,
        pairId: pick(pairRows).id,
        entryModelId: pick(entryModelRows).id,
        position: Math.random() > 0.5 ? "long" : "short",
        sessionId: pick(sessionRows).id,
        rr,
        outcome: outcome as "win" | "loss" | "be",
        preTrade: "Demo trade for QA.",
      })
      .returning({ id: trades.id });

    const chosenSetups = setupRows.length ? pickMany(setupRows, Math.min(setupRows.length, 1 + Math.floor(Math.random() * 3))) : [];
    if (inserted && chosenSetups.length > 0) {
      await db.insert(tradeSetups).values(chosenSetups.map((s) => ({ tradeId: inserted.id, setupId: s.id })));
    }
  }

  for (const acc of fundedAccounts) {
    for (let i = 0; i < 2; i++) {
      const daysAgo = Math.floor(Math.random() * 45);
      await db.insert(payouts).values({
        accountId: acc.id,
        date: new Date(now - daysAgo * 86400000),
        grossAmount: (500 + Math.random() * 2500).toFixed(2),
        netAmount: (450 + Math.random() * 2000).toFixed(2),
      });
    }
  }

  console.log("Demo trades + payouts seeded.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
