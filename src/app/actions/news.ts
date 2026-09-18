"use server";

/**
 * Admin-triggered sync of the shared News calendar. Pulls last/this/next
 * week from a public feed that mirrors ForexFactory's economic calendar
 * (title, country, date, time, impact, forecast, previous — the same data
 * ForexFactory's own calendar page shows), keeps only medium ("orange
 * folder") and high ("red folder") impact events, and upserts them into
 * `news_events`. Low-impact and holiday events are discarded before
 * anything touches the database.
 *
 * This is shared, not per-member — one admin syncing updates the calendar
 * every member sees, since news events aren't personal data the way trades
 * are.
 *
 * The feed's date/time fields are plain calendar-day + Eastern/New York
 * clock-time strings, with no timezone marker of their own — which is also
 * how traders normally read a ForexFactory calendar, so we store them as
 * given rather than attempting a UTC conversion: `date` becomes that
 * calendar day's UTC midnight (never a real time-of-day, same convention as
 * session_logs), and the raw time string is kept for display alongside a
 * `timeMinutes` sort key.
 */

import { db } from "@/db";
import { newsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const FEED_URLS = [
  "https://nfs.faireconomy.media/ff_calendar_lastweek.xml",
  "https://nfs.faireconomy.media/ff_calendar_thisweek.xml",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.xml",
];

function getTag(block: string, tag: string): string {
  if (new RegExp(`<${tag}\\s*/>`).test(block)) return "";
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!m) return "";
  const cdata = m[1].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (cdata ? cdata[1] : m[1]).trim();
}

function mapImpact(raw: string): "medium" | "high" | null {
  const v = raw.trim().toLowerCase();
  return v === "medium" || v === "high" ? v : null;
}

// "MM-DD-YYYY" -> that calendar day's UTC midnight.
function parseFeedDate(raw: string): Date | null {
  const m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(date.getTime()) ? null : date;
}

// "8:30am" / "12:15pm" -> minutes since midnight. Anything that isn't a
// plain clock time ("All Day", "Tentative", "") returns null — those sort
// after timed events and are shown with their raw label instead of a time.
function parseTimeMinutes(raw: string): number | null {
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10) % 12;
  const minutes = parseInt(m[2], 10);
  if (m[3].toLowerCase() === "pm") hours += 12;
  return hours * 60 + minutes;
}

export async function syncNews(formData: FormData) {
  await requireAdmin();

  // Carries whatever month/day the admin was looking at back through the
  // sync, so clicking "Sync Now" doesn't bounce them to the current month.
  const returnToRaw = String(formData.get("returnTo") ?? "");
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/news";

  let imported = 0;
  let syncNote: string | undefined;

  try {
    // Fetch each week's feed independently — the upstream mirror has
    // occasionally dropped the lastweek/nextweek files while thisweek keeps
    // working, and there's no reason a hiccup on one should sink a sync that
    // could otherwise still pull in the others. Only fail outright if every
    // feed is unreachable.
    const results = await Promise.allSettled(
      FEED_URLS.map(async (url) => {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      }),
    );

    const feeds = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const failed = results
      .map((r, i) => (r.status === "rejected" ? { url: FEED_URLS[i], reason: r.reason } : null))
      .filter((f): f is { url: string; reason: unknown } => f !== null);

    if (feeds.length === 0) {
      const detail = failed[0]?.reason instanceof Error ? failed[0].reason.message : "request failed";
      throw new Error(`News feed request failed (${detail}).`);
    }

    if (failed.length > 0) {
      const which = failed
        .map((f) => f.url.match(/ff_calendar_(\w+)\.xml/)?.[1] ?? f.url)
        .join(", ");
      syncNote = `Note: the ${which} feed didn't respond this time (upstream issue) — the rest synced fine. Try again later to fill in the gap.`;
    }

    for (const xml of feeds) {
      const blocks = xml.match(/<event>[\s\S]*?<\/event>/g) ?? [];
      for (const block of blocks) {
        const impact = mapImpact(getTag(block, "impact"));
        if (!impact) continue; // low / holiday — discarded

        const title = getTag(block, "title");
        const date = parseFeedDate(getTag(block, "date"));
        if (!title || !date) continue; // malformed entry — skip rather than fail the whole sync

        const country = getTag(block, "country") || "—";
        const timeRaw = getTag(block, "time") || null;
        const timeMinutes = timeRaw ? parseTimeMinutes(timeRaw) : null;
        const forecast = getTag(block, "forecast") || null;
        const previous = getTag(block, "previous") || null;
        const sourceUrl = getTag(block, "url") || null;

        await db
          .insert(newsEvents)
          .values({ date, time: timeRaw, timeMinutes, country, title, impact, forecast, previous, sourceUrl })
          .onConflictDoUpdate({
            target: [newsEvents.date, newsEvents.country, newsEvents.title],
            set: { time: timeRaw, timeMinutes, impact, forecast, previous, sourceUrl, syncedAt: new Date() },
          });
        imported++;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "News sync failed.";
    redirect(appendParam(returnTo, "syncError", message));
  }

  revalidatePath("/news");
  redirect(appendParam(returnTo, "synced", String(imported), syncNote));
}

function appendParam(
  path: string,
  key: "synced" | "syncError",
  value: string,
  note?: string,
): string {
  const url = new URL(path, "http://internal");
  url.searchParams.delete("synced");
  url.searchParams.delete("syncError");
  url.searchParams.delete("syncNote");
  url.searchParams.set(key, value);
  if (note) url.searchParams.set("syncNote", note);
  return `${url.pathname}${url.search}`;
}
