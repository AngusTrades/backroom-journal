import Link from "next/link";
import { getFormOptions } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { PageHead } from "@/components/PageHead";
import { TradovateImport } from "@/components/TradovateImport";

export const dynamic = "force-dynamic";

export default async function ImportTradesPage() {
  const user = await requireUser();
  const { accounts } = await getFormOptions(user.id);
  const open = accounts.filter((a) => a.status !== "failed");

  return (
    <div>
      <PageHead
        title="Import Trades"
        subtitle="Pull a day's trades from a Tradovate export. P&L, direction, size and prices fill in automatically; you add the stop and your notes."
        action={
          <Link href="/" className="btn btn-ghost">
            ← Journal
          </Link>
        }
      />
      <TradovateImport accounts={open.map((a) => ({ id: a.id, name: a.name }))} />
    </div>
  );
}
