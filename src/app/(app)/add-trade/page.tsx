import { getFormOptions } from "@/db/queries";
import { PageHead } from "@/components/PageHead";
import { AddTradeForm } from "@/components/AddTradeForm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AddTradePage() {
  const user = await requireUser();
  const { accounts, accountGroups, pairs, entryModels, sessions, setups } = await getFormOptions(user.id);
  const today = new Date().toISOString().slice(0, 16);

  return (
    <div>
      <PageHead title="Add Trade" subtitle="Log a trade — pick every confluence that applied, not just one." />
      <AddTradeForm
        accounts={accounts}
        accountGroups={accountGroups}
        pairs={pairs}
        entryModels={entryModels}
        sessions={sessions}
        setups={setups}
        today={today}
      />
    </div>
  );
}
