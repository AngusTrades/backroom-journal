import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { dmEvents, dmKeywords, instagramConnections } from "@/db/schema";
import { matchKeyword } from "@/lib/dmKeywords";
import {
  InstagramError,
  refreshIfDue,
  replyToComment,
  sendDm,
  sendPrivateReply,
  verifySignature,
} from "@/lib/instagramApi";

export const maxDuration = 30;

// GET: Meta's one-time verification when you save the callback URL in the
// app dashboard. It must echo hub.challenge if the verify token matches
// IG_WEBHOOK_VERIFY_TOKEN.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const expected = process.env.IG_WEBHOOK_VERIFY_TOKEN;
  if (expected && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === expected) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

type Incoming = { kind: "dm" | "comment"; externalId: string; fromId: string; fromUsername?: string; text: string };

type WebhookBody = {
  object?: string;
  entry?: {
    id?: string;
    messaging?: {
      sender?: { id?: string };
      message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean };
    }[];
    changes?: {
      field?: string;
      value?: { id?: string; text?: string; from?: { id?: string; username?: string }; parent_id?: string };
    }[];
  }[];
};

// POST: a new DM or comment. Always answers 200 quickly (Meta retries and
// eventually disables webhooks that keep failing); problems are recorded in
// the DM Replies log instead.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (body.object !== "instagram") return NextResponse.json({ ok: true });

  for (const entry of body.entry ?? []) {
    if (!entry.id) continue;
    const [found] = await db.select().from(instagramConnections).where(eq(instagramConnections.igUserId, entry.id));
    if (!found) continue;
    const conn = await refreshIfDue(found);

    const incoming: Incoming[] = [];
    for (const m of entry.messaging ?? []) {
      const msg = m.message;
      // Skip our own outgoing messages (echoes), deletions, and non-text (reactions, media).
      if (!msg?.mid || !msg.text || msg.is_echo || msg.is_deleted || !m.sender?.id || m.sender.id === conn.igUserId) continue;
      incoming.push({ kind: "dm", externalId: msg.mid, fromId: m.sender.id, text: msg.text });
    }
    for (const c of entry.changes ?? []) {
      const v = c.value;
      if (c.field !== "comments" || !v?.id || !v.text || !v.from?.id || v.from.id === conn.igUserId) continue;
      incoming.push({ kind: "comment", externalId: v.id, fromId: v.from.id, fromUsername: v.from.username, text: v.text });
    }
    if (incoming.length === 0) continue;

    const keywords = await db
      .select()
      .from(dmKeywords)
      .where(and(eq(dmKeywords.userId, conn.userId), eq(dmKeywords.active, true)));

    for (const ev of incoming) {
      const kw = matchKeyword(ev.text, keywords.filter((k) => (ev.kind === "dm" ? k.onDm : k.onComment)));
      // Unique externalId: a retried webhook inserts nothing and is skipped.
      const [logged] = await db
        .insert(dmEvents)
        .values({
          userId: conn.userId,
          kind: ev.kind,
          externalId: ev.externalId,
          fromId: ev.fromId,
          fromUsername: ev.fromUsername ?? null,
          text: ev.text.slice(0, 300),
          keywordId: kw?.id ?? null,
          status: kw ? "pending" : "no_match",
        })
        .onConflictDoNothing()
        .returning({ id: dmEvents.id });
      if (!logged || !kw) continue;

      try {
        if (ev.kind === "dm") {
          await sendDm(conn, ev.fromId, kw.reply);
        } else {
          await sendPrivateReply(conn, ev.externalId, kw.reply);
          if (kw.publicCommentReply) {
            // Nice-to-have: a failed public reply doesn't undo the DM.
            await replyToComment(conn, ev.externalId, kw.publicCommentReply).catch(() => undefined);
          }
        }
        await db.update(dmEvents).set({ status: "replied" }).where(eq(dmEvents.id, logged.id));
        await db
          .update(dmKeywords)
          .set({ useCount: sql`${dmKeywords.useCount} + 1` })
          .where(eq(dmKeywords.id, kw.id));
      } catch (e) {
        const message = e instanceof InstagramError ? e.message : "Unexpected error sending the reply.";
        if (!(e instanceof InstagramError)) console.error("auto-reply failed", e);
        await db.update(dmEvents).set({ status: "error", error: message }).where(eq(dmEvents.id, logged.id));
      }
    }

    // Keep the log to the last 30 days.
    await db
      .delete(dmEvents)
      .where(and(eq(dmEvents.userId, conn.userId), lt(dmEvents.createdAt, new Date(Date.now() - 30 * 86_400_000))));
  }

  return NextResponse.json({ ok: true });
}
