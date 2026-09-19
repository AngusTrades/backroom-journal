import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionLogById } from "@/db/queries";
import { updateSessionLog } from "@/app/actions/session-logs";
import { PageHead } from "@/components/PageHead";
import { DeleteSessionLogButton } from "@/components/DeleteSessionLogButton";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EditSessionLogPage({
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
  const returnTo = returnToRaw && returnToRaw.startsWith("/") ? returnToRaw : "/market-bias";

  const log = await getSessionLogById(id, user.id);
  if (!log) {
    notFound();
  }

  const dateValue = new Date(log.date).toISOString().slice(0, 10);

  return (
    <div>
      <PageHead
        title="Edit Session Entry"
        subtitle="Update the details below, or delete this entry entirely."
        action={
          <Link href={returnTo} className="btn btn-ghost">
            ← Back
          </Link>
        }
      />

      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="sub" style={{ margin: 0 }}>
            Deleting an entry removes it permanently.
          </div>
          <DeleteSessionLogButton id={log.id} returnTo={returnTo} />
        </div>
      </div>

      <div className="card p-5">
        <form action={updateSessionLog} className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <input type="hidden" name="logId" value={log.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="field">
            <label htmlFor="date">Date</label>
            <input type="date" id="date" name="date" defaultValue={dateValue} required />
          </div>
          <div className="field">
            <label htmlFor="session">Session</label>
            <select id="session" name="session" required defaultValue={log.session}>
              <option value="asia">Asia</option>
              <option value="london">London</option>
              <option value="new_york">New York</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="bias">Bias</label>
            <select id="bias" name="bias" required defaultValue={log.bias}>
              <option value="bullish">Bullish</option>
              <option value="bearish">Bearish</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="pointsMoved">Points moved</label>
            <input type="number" id="pointsMoved" name="pointsMoved" step="0.25" defaultValue={log.pointsMoved} required />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="note">Note (optional)</label>
            <input type="text" id="note" name="note" defaultValue={log.note ?? ""} placeholder="e.g. FOMC, NFP, range day" />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="btn btn-primary w-full justify-center">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
