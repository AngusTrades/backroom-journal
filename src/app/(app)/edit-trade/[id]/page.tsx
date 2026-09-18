import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormOptions, getTradeById } from "@/db/queries";
import { PageHead } from "@/components/PageHead";
import { DeleteTradeButton } from "@/components/DeleteTradeButton";
import { EditTradeForm } from "@/components/EditTradeForm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EditTradePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { returnTo: returnToRaw } = await searchParams;
  // Only allow returning to a path inside this app, not an arbitrary URL.
  const returnTo = returnToRaw && returnToRaw.startsWith("/") ? returnToRaw : "/";

  const [trade, { accounts, pairs, entryModels, sessions, setups }] = await Promise.all([
    getTradeById(id, user.id),
    getFormOptions(user.id),
  ]);

  if (!trade) {
    notFound();
  }

  const dateValue = new Date(trade.date).toISOString().slice(0, 16);
  const checkedSetupIds = trade.tradeSetups.map((ts) => ts.setupId);

  return (
    <div>
      <PageHead
        title="Edit Trade"
        subtitle="Update the details below, or delete this trade entirely."
        action={
          <Link href={returnTo} className="btn btn-ghost">
            ← Back
          </Link>
        }
      />

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="sub" style={{ margin: 0 }}>
            Deleting a trade also removes its confluence tags. Its entry model and account stay untouched.
          </div>
          <DeleteTradeButton id={trade.id} returnTo={returnTo} />
        </div>
      </div>

      <EditTradeForm
        trade={trade}
        returnTo={returnTo}
        dateValue={dateValue}
        checkedSetupIds={checkedSetupIds}
        accounts={accounts}
        pairs={pairs}
        entryModels={entryModels}
        sessions={sessions}
        setups={setups}
      />
    </div>
  );
}
