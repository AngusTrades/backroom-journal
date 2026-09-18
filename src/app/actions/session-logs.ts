"use server";

import { db } from "@/db";
import { sessionLogs } from "@/db/schema";
import { getSessionLogById } from "@/db/queries";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

const SESSION_VALUES = ["asia", "london", "new_york"] as const;
type SessionValue = (typeof SESSION_VALUES)[number];
const BIAS_VALUES = ["bullish", "bearish", "neutral"] as const;
type BiasValue = (typeof BIAS_VALUES)[number];

function isSessionValue(v: string): v is SessionValue {
  return (SESSION_VALUES as readonly string[]).includes(v);
}
function isBiasValue(v: string): v is BiasValue {
  return (BIAS_VALUES as readonly string[]).includes(v);
}

// Logging the same date+session again overwrites that entry (an upsert)
// instead of erroring or creating a duplicate — this is meant to be a quick
// daily habit, not a form that fights back if you re-enter today twice.
export async function upsertSessionLog(formData: FormData) {
  const user = await requireUser();
  const dateStr = String(formData.get("date") ?? "");
  const session = String(formData.get("session") ?? "");
  const bias = String(formData.get("bias") ?? "");
  const pointsMovedRaw = String(formData.get("pointsMoved") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!dateStr || !isSessionValue(session) || !isBiasValue(bias) || pointsMovedRaw === "") {
    throw new Error("Date, session, bias, and points moved are all required.");
  }

  await db
    .insert(sessionLogs)
    .values({
      userId: user.id,
      date: new Date(dateStr),
      session,
      bias,
      pointsMoved: pointsMovedRaw,
      note: note || null,
    })
    .onConflictDoUpdate({
      target: [sessionLogs.userId, sessionLogs.date, sessionLogs.session],
      set: { bias, pointsMoved: pointsMovedRaw, note: note || null },
    });

  revalidatePath("/market-bias");
}

export async function updateSessionLog(formData: FormData) {
  const user = await requireUser();
  const logId = String(formData.get("logId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "") || "/market-bias";
  const dateStr = String(formData.get("date") ?? "");
  const session = String(formData.get("session") ?? "");
  const bias = String(formData.get("bias") ?? "");
  const pointsMovedRaw = String(formData.get("pointsMoved") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!logId || !dateStr || !isSessionValue(session) || !isBiasValue(bias) || pointsMovedRaw === "") {
    throw new Error("Date, session, bias, and points moved are all required.");
  }

  const existing = await getSessionLogById(logId, user.id);
  if (!existing) {
    throw new Error("That entry doesn't belong to your login.");
  }

  try {
    await db
      .update(sessionLogs)
      .set({
        date: new Date(dateStr),
        session,
        bias,
        pointsMoved: pointsMovedRaw,
        note: note || null,
      })
      .where(eq(sessionLogs.id, logId));
  } catch (err: unknown) {
    // Changing the date/session to one you already have a separate entry
    // for hits the same unique constraint the upsert above relies on —
    // surface that plainly instead of a raw Postgres error.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
      throw new Error(
        "You already have an entry for that date and session — edit that one instead, or pick a different date/session.",
      );
    }
    throw err;
  }

  revalidatePath("/market-bias");
  redirect(returnTo);
}

export async function deleteSessionLog(id: string) {
  const user = await requireUser();
  if (!id) return;
  const existing = await getSessionLogById(id, user.id);
  if (!existing) return;
  await db.delete(sessionLogs).where(and(eq(sessionLogs.id, id), eq(sessionLogs.userId, user.id)));
  revalidatePath("/market-bias");
}
