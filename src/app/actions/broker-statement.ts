"use server";

import { db } from "@/db";
import { taxCategories, taxEntries } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getAccountById } from "@/db/queries";

// Shared, automatic categories — same "Account Payouts" precedent
// (summarizeTaxYear) of one shared category with the account name folded
// into each line's description, rather than a new per-account category
// every time this is run.
const GAIN_CATEGORY_NAME = "Broker Statement Gains";
const LOSS_CATEGORY_NAME = "Broker Statement Losses";

async function getOrCreateCategory(userId: string, kind: "income" | "expense", name: string) {
  await db.insert(taxCategories).values({ userId, kind, name }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(taxCategories)
    .where(and(eq(taxCategories.userId, userId), eq(taxCategories.kind, kind), eq(taxCategories.name, name)))
    .limit(1);
  return row ?? null;
}

// Turns a computed equity swing (see BrokerStatementImport's peak/trough
// math) into up to two tax entries: the run-up from the account's starting
// balance to its peak as a realized-gain income entry, and the give-back
// from that peak down to the lowest point afterward as a realized-loss
// expense entry — the same gross-gains/gross-losses shape the Norway
// example on this page's refund estimate is built on, rather than a single
// netted figure. Either half is skipped if there's nothing to it (an
// account that only ever declined has no gain phase; one that's still
// sitting at its peak has no loss phase yet).
export async function createEquitySwingEntries(input: {
  accountId: string;
  startingBalance: number;
  peak: number;
  peakDate: string; // ISO
  trough: number;
  troughDate: string; // ISO
}): Promise<{ ok: boolean; error?: string; created?: number; gain?: number; loss?: number }> {
  const user = await requireUser();

  const account = await getAccountById(input.accountId, user.id);
  if (!account) return { ok: false, error: "That account doesn't belong to your login." };

  if (!Number.isFinite(input.startingBalance) || !Number.isFinite(input.peak) || !Number.isFinite(input.trough)) {
    return { ok: false, error: "Couldn't read those figures." };
  }
  const peakDate = new Date(input.peakDate);
  const troughDate = new Date(input.troughDate);
  if (isNaN(peakDate.getTime()) || isNaN(troughDate.getTime())) {
    return { ok: false, error: "Couldn't read those dates." };
  }

  const gain = Math.round((input.peak - input.startingBalance) * 100) / 100;
  const loss = Math.round((input.peak - input.trough) * 100) / 100;

  if (gain <= 0 && loss <= 0) {
    return { ok: false, error: "Nothing to log — the peak never exceeded the starting balance and there's no drawdown after it." };
  }

  let created = 0;

  if (gain > 0) {
    const cat = await getOrCreateCategory(user.id, "income", GAIN_CATEGORY_NAME);
    if (cat) {
      await db.insert(taxEntries).values({
        userId: user.id,
        kind: "income",
        categoryId: cat.id,
        date: peakDate,
        amount: gain.toFixed(2),
        description: `${account.name} — ran up to a peak of $${input.peak.toFixed(2)} from a $${input.startingBalance.toFixed(2)} starting balance`,
        source: "manual",
      });
      created++;
    }
  }

  if (loss > 0) {
    const cat = await getOrCreateCategory(user.id, "expense", LOSS_CATEGORY_NAME);
    if (cat) {
      await db.insert(taxEntries).values({
        userId: user.id,
        kind: "expense",
        categoryId: cat.id,
        date: troughDate,
        amount: loss.toFixed(2),
        description: `${account.name} — gave back $${loss.toFixed(2)} of its $${input.peak.toFixed(2)} peak, down to $${input.trough.toFixed(2)}`,
        source: "manual",
      });
      created++;
    }
  }

  revalidatePath("/budgeting");
  return { ok: true, created, gain, loss };
}
