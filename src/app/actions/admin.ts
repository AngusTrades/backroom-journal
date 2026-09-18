"use server";

import { db } from "@/db";
import { inviteCodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/auth";

function randomCode(): string {
  // 8 chars, uppercase-alnum, no ambiguous 0/O/1/I — easy to read out loud
  // or paste into a Discord message.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export async function createInviteCode(formData: FormData) {
  const admin = await requireAdmin();

  const customCode = String(formData.get("code") ?? "").trim().toUpperCase();
  const label = String(formData.get("label") ?? "").trim();
  const maxUsesRaw = String(formData.get("maxUses") ?? "").trim();
  const maxUses = maxUsesRaw ? Math.max(1, parseInt(maxUsesRaw, 10)) : null;

  const code = customCode || randomCode();

  if (customCode) {
    const [existing] = await db.select({ id: inviteCodes.id }).from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
    if (existing) {
      throw new Error(`Invite code "${code}" already exists — pick a different one.`);
    }
  }

  await db.insert(inviteCodes).values({
    code,
    label: label || null,
    maxUses,
    createdByUserId: admin.id,
  });

  revalidatePath("/admin/invites");
}

export async function toggleInviteCode(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const nextActive = formData.get("nextActive") === "true";
  if (!id) return;
  await db.update(inviteCodes).set({ active: nextActive }).where(eq(inviteCodes.id, id));
  revalidatePath("/admin/invites");
}
