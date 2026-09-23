import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dmEvents, dmKeywords, instagramConnections } from "@/db/schema";
import { requireInstagramOwner } from "@/lib/auth";
import { refreshIfDue } from "@/lib/instagramApi";
import { PageHead } from "@/components/PageHead";
import { DmKeywords } from "@/components/DmKeywords";
import { connectInstagram, disconnectInstagram } from "@/app/actions/dm-replies";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { cls: string; label: string }> = {
  replied: { cls: "live", label: "REPLIED" },
  no_match: { cls: "paper", label: "NO MATCH" },
  error: { cls: "failed", label: "ERROR" },
  pending: { cls: "eval", label: "SENDING" },
};

function daysUntil(d: Date | null) {
  return d ? Math.max(0, Math.round((d.getTime() - Date.now()) / 86_400_000)) : null;
}

export default async function DmRepliesPage({
  searchParams,
}: {
  searchParams: Promise<{ igError?: string; igConnected?: string }>;
}) {
  const user = await requireInstagramOwner();
  const { igError, igConnected } = await searchParams;

  const [[rawConn], keywords, events] = await Promise.all([
    db.select().from(instagramConnections).where(eq(instagramConnections.userId, user.id)),
    db.select().from(dmKeywords).where(eq(dmKeywords.userId, user.id)).orderBy(dmKeywords.keyword),
    db
      .select({
        id: dmEvents.id,
        kind: dmEvents.kind,
        fromUsername: dmEvents.fromUsername,
        text: dmEvents.text,
        status: dmEvents.status,
        error: dmEvents.error,
        createdAt: dmEvents.createdAt,
        keyword: dmKeywords.keyword,
      })
      .from(dmEvents)
      .leftJoin(dmKeywords, eq(dmEvents.keywordId, dmKeywords.id))
      .where(eq(dmEvents.userId, user.id))
      .orderBy(desc(dmEvents.createdAt))
      .limit(50),
  ]);
  const conn = rawConn ? await refreshIfDue(rawConn) : null;
  const daysLeft = daysUntil(conn?.tokenExpiresAt ?? null);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const base = process.env.PUBLIC_APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  const callbackUrl = `${base.replace(/\/$/, "")}/api/instagram/webhook`;
  const hasSecret = Boolean(process.env.IG_APP_SECRET);
  const hasVerify = Boolean(process.env.IG_WEBHOOK_VERIFY_TOKEN);

  return (
    <div>
      <PageHead
        title="DM Replies"
        subtitle="Automatic replies when someone DMs or comments a keyword like CHALLENGE."
      />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Setup</h3>
        {igError && <div className="form-error" style={{ margin: "8px 0" }}>{igError}</div>}
        {igConnected && conn && <div className="story-ok" style={{ margin: "8px 0" }}>Connected as @{conn.username}.</div>}
        <ol className="dm-setup">
          <li className={hasSecret && hasVerify ? "done" : ""}>
            <strong>Vercel settings.</strong> <code>IG_APP_SECRET</code> {hasSecret ? "✓" : "missing"} ·{" "}
            <code>IG_WEBHOOK_VERIFY_TOKEN</code> {hasVerify ? "✓" : "missing"}
          </li>
          <li className={conn ? "done" : ""}>
            <strong>Connect your account.</strong>{" "}
            {conn ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="status live">CONNECTED</span> <span className="mono">@{conn.username}</span>
                {daysLeft !== null && <span className="sub">token valid ~{daysLeft} days, refreshes automatically</span>}
                <form action={disconnectInstagram}>
                  <button type="submit" className="btn btn-ghost">Disconnect</button>
                </form>
              </span>
            ) : (
              <form action={connectInstagram} className="flex flex-wrap items-end gap-3" style={{ marginTop: 8 }}>
                <div className="field" style={{ flex: "1 1 320px" }}>
                  <label>Access token (Meta app → Instagram → Generate token)</label>
                  <input type="password" name="accessToken" autoComplete="off" className="mono" placeholder="IGAA…" />
                </div>
                <button type="submit" className="btn btn-primary">Connect</button>
              </form>
            )}
          </li>
          <li>
            <strong>Webhook in Meta&apos;s dashboard.</strong> Callback URL: <code className="dm-copy">{callbackUrl}</code>{" "}
            · Verify token: the same value as <code>IG_WEBHOOK_VERIFY_TOKEN</code> · Subscribe to{" "}
            <code>messages</code> and <code>comments</code>.
          </li>
        </ol>
      </div>

      <DmKeywords
        keywords={keywords.map((k) => ({
          id: k.id,
          keyword: k.keyword,
          reply: k.reply,
          onDm: k.onDm,
          onComment: k.onComment,
          publicCommentReply: k.publicCommentReply,
          active: k.active,
          useCount: k.useCount,
        }))}
      />

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <h3>Recent activity</h3>
        <div className="sub">Last 50 DMs and comments received (kept 30 days).</div>
      </div>
      {events.length === 0 ? (
        <div className="card card-pad">
          <div className="sub">Nothing yet. Once connected, new DMs and comments show up here.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>From</th>
                <th>Message</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="mono">
                    {e.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}{" "}
                    UTC
                  </td>
                  <td>{e.kind === "dm" ? "DM" : "Comment"}</td>
                  <td className="mono">{e.fromUsername ? `@${e.fromUsername}` : "—"}</td>
                  <td style={{ maxWidth: 360, whiteSpace: "normal" }}>{e.text}</td>
                  <td style={{ whiteSpace: "normal" }}>
                    <span className={`status ${STATUS[e.status]?.cls ?? "paper"}`}>{STATUS[e.status]?.label ?? e.status}</span>
                    {e.keyword && <span className="mono sub"> {e.keyword}</span>}
                    {e.error && <div className="sub bad">{e.error}</div>}
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
