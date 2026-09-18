/**
 * One-time cleanup: removes the default Notion-derived confluence list that
 * earlier versions of this app seeded automatically. Run this once if your
 * database already has those defaults and you want to start your own
 * confluence list from scratch via the Add Trade page's "+ Add" control.
 *
 * Safe to run even with trades already logged — it only removes the
 * trade-to-confluence tag links (trade_setups), not the trades themselves.
 */
import "dotenv/config";
import { db } from "./index";
import { setups, tradeSetups } from "./schema";

async function main() {
  await db.delete(tradeSetups);
  await db.delete(setups);
  console.log("Cleared all confluences (setups) and their trade tags.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
