"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dmKeywords, instagramConnections } from "@/db/schema";
import { requireInstagramOwner } from "@/lib/auth";
import { InstagramError, connectAccount } from "@/lib/instagramApi";
import { MAX_REPLY_BYTES, byteLength, normalizeKeyword } from "@/lib/dmKeywords";

export async function connectInstagram(formData: FormData) {
  const user = await requireInstagramOwner();
  const token = String(formData.get("accessToken") ?? "").trim();
  if (!token) redirect("/dm-replies?igError=" + encodeURIComponent("Paste an access token first."));
  let conn: Awaited<ReturnType<typeof connectAccount>>;
  try {
    conn = await connectAccount(token);
  } catch (e) {
    const msg = e instanceof InstagramError ? e.message : "Couldn't verify that token.";
    redirect("/dm-replies?igError=" + encodeURIComponent(`Connection failed: ${msg}`));
  }
  await db
    .insert(instagramConnections)
    .values({ userId: user.id, ...conn, tokenRefreshedAt: new Date() })
    .onConflictDoUpdate({ target: instagramConnections.userId, set: { ...conn, tokenRefreshedAt: new Date() } });
  revalidatePath("/dm-replies");
  redirect("/dm-replies?igConnected=1");
}

export async function disconnectInstagram() {
  const user = await requireInstagramOwner();
  await db.delete(instagramConnections).where(eq(instagramConnections.userId, user.id));
  revalidatePath("/dm-replies");
}

export type KeywordInput = {
  id?: string;
  keyword: string;
  reply: string;
  onDm: boolean;
  onComment: boolean;
  publicCommentReply: string;
};
export type KeywordResult = { error?: string };

function validate(input: KeywordInput) {
  const keyword = normalizeKeyword(String(input?.keyword ?? ""));
  const reply = String(input?.reply ?? "").trim();
  const publicCommentReply = String(input?.publicCommentReply ?? "").trim();
  if (!keyword) return { error: "Enter a keyword, e.g. CHALLENGE." } as const;
  if (keyword.length > 60) return { error: "Keep the keyword short, it has to be the whole message." } as const;
  if (!reply) return { error: "Write the reply people should get." } as const;
  if (byteLength(reply) > MAX_REPLY_BYTES) return { error: "That reply is too long for Instagram (max about 1000 characters)." } as const;
  if (publicCommentReply.length > 300) return { error: "Keep the public comment reply short." } as const;
  if (!input.onDm && !input.onComment) return { error: "Pick DMs, comments, or both." } as const;
  return {
    values: { keyword, reply, publicCommentReply: publicCommentReply || null, onDm: Boolean(input.onDm), onComment: Boolean(input.onComment) },
  } as const;
}

export async function saveKeyword(input: KeywordInput): Promise<KeywordResult> {
  const user = await requireInstagramOwner();
  const v = validate(input);
  if ("error" in v) return { error: v.error };

  const [clash] = await db
    .select({ id: dmKeywords.id })
    .from(dmKeywords)
    .where(and(eq(dmKeywords.userId, user.id), eq(dmKeywords.keyword, v.values.keyword)));
  if (clash && clash.id !== input.id) return { error: `You already have a reply for ${v.values.keyword}.` };

  if (input.id) {
    await db
      .update(dmKeywords)
      .set(v.values)
      .where(and(eq(dmKeywords.id, input.id), eq(dmKeywords.userId, user.id)));
  } else {
    await db.insert(dmKeywords).values({ userId: user.id, ...v.values });
  }
  revalidatePath("/dm-replies");
  return {};
}

export async function setKeywordActive(id: string, active: boolean) {
  const user = await requireInstagramOwner();
  await db
    .update(dmKeywords)
    .set({ active: Boolean(active) })
    .where(and(eq(dmKeywords.id, id), eq(dmKeywords.userId, user.id)));
  revalidatePath("/dm-replies");
}

export async function deleteKeyword(id: string) {
  const user = await requireInstagramOwner();
  await db.delete(dmKeywords).where(and(eq(dmKeywords.id, id), eq(dmKeywords.userId, user.id)));
  revalidatePath("/dm-replies");
}
