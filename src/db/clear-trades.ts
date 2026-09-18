/**
 * Wipes trades/tradeSetups/payouts (not reference data or accounts) — use
 * this to clear out demo data before handing the journal off for real use.
 */
import "dotenv/config";
import { db } from "./index";
import { trades, tradeSetups, payouts } from "./schema";

async function main() {
  await db.delete(tradeSetups);
  await db.delete(trades);
  await db.delete(payouts);
  console.log("Cleared trades, trade_setups, and payouts.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
