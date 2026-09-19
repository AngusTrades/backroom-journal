import { db } from "@/db";
import { inviteCodes, users } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { PageHead } from "@/components/PageHead";
import { createInviteCode, toggleInviteCode } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function InviteCodesPage() {
  await requireAdmin();

  const [codes, memberCount] = await Promise.all([
    db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        label: inviteCodes.label,
        maxUses: inviteCodes.maxUses,
        usesCount: inviteCodes.usesCount,
        active: inviteCodes.active,
        createdAt: inviteCodes.createdAt,
      })
      .from(inviteCodes)
      .orderBy(desc(inviteCodes.createdAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(users).then((r) => r[0]?.count ?? 0),
  ]);

  return (
    <div>
      <PageHead title="Invite Codes" subtitle="Hand these out to members so they can create their own login." />

      <div className="kpi-row kpi-row-3" style={{ marginBottom: 24 }}>
        <div className="kpi">
          <div className="k">Total Members</div>
          <div className="v">{memberCount}</div>
        </div>
        <div className="kpi">
          <div className="k">Active Codes</div>
          <div className="v good">{codes.filter((c) => c.active).length}</div>
        </div>
        <div className="kpi">
          <div className="k">Total Signups via Codes</div>
          <div className="v">{codes.reduce((s, c) => s + c.usesCount, 0)}</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <h3>Create Invite Code</h3>
        <div className="sub" style={{ marginBottom: 12 }}>
          Leave the code blank to auto-generate one. Leave max uses blank for unlimited (good for one code shared in
          Discord); set it to 1 for a single-use invite for one specific person.
        </div>
        <form action={createInviteCode} className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-4">
          <div className="field">
            <label>Code (optional)</label>
            <input type="text" name="code" placeholder="auto-generated if blank" className="mono" />
          </div>
          <div className="field">
            <label>Label (optional)</label>
            <input type="text" name="label" placeholder="e.g. September cohort" />
          </div>
          <div className="field">
            <label>Max Uses (optional)</label>
            <input type="number" name="maxUses" min={1} step={1} placeholder="unlimited" />
          </div>
          <div className="field flex items-end">
            <button type="submit" className="btn btn-primary">
              + Create Code
            </button>
          </div>
        </form>
      </div>

      {codes.length === 0 ? (
        <div className="card card-pad">
          <div className="sub">No invite codes yet — create one above.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Label</th>
                <th className="num">Uses</th>
                <th>Created</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.code}</td>
                  <td>{c.label ?? "—"}</td>
                  <td className="num mono">
                    {c.usesCount}
                    {c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                  </td>
                  <td className="mono">{fmtDate(c.createdAt)}</td>
                  <td>
                    <span className={`status ${c.active ? "live" : "failed"}`}>{c.active ? "ACTIVE" : "DISABLED"}</span>
                  </td>
                  <td>
                    <form action={toggleInviteCode}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="nextActive" value={(!c.active).toString()} />
                      <button type="submit" className="btn btn-ghost">
                        {c.active ? "Disable" : "Enable"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
