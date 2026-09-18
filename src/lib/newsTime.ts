/**
 * The News feed's `date`/`timeMinutes` fields are stored as given by the
 * feed, which turns out to be UTC — confirmed 2026-09-10 by cross-checking
 * known release times: "Unemployment Claims" and "Core CPI m/m" both come
 * back as "12:30pm" in the raw feed, which only lines up with their real
 * 8:30am US-Eastern release time as a UTC value (8:30am ET + 4h during EDT
 * = 12:30pm UTC) — not as an Eastern-time value like the schema originally
 * assumed when this table was first built. These helpers convert a stored
 * UTC date + timeMinutes into actual New York wall-clock time for display,
 * and into the New York calendar day the event actually falls on (which can
 * differ from its stored UTC day for anything published before roughly
 * 4-5am UTC — mostly Asia-session releases).
 */

const NY_TZ = "America/New_York";

function eventInstant(dateUtcMidnight: Date, timeMinutes: number | null): Date | null {
  if (timeMinutes === null) return null;
  return new Date(dateUtcMidnight.getTime() + timeMinutes * 60_000);
}

// "8:30am" in New York time. Falls back to the feed's raw display string
// (e.g. "Tentative", "All Day") for events with no fixed clock time — there's
// no instant to convert without one.
export function nyTimeLabel(dateUtcMidnight: Date, timeMinutes: number | null, rawTime: string | null): string {
  const instant = eventInstant(dateUtcMidnight, timeMinutes);
  if (!instant) return rawTime ?? "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const ampm = dayPeriod.toLowerCase().startsWith("p") ? "pm" : "am";
  return `${hour}:${minute}${ampm}`;
}

// "yyyy-MM-dd" the event actually falls on in New York — this is what every
// place that groups news events by day (calendar dots, day-filtering, the
// PnL Calendar's news dots) should bucket on, instead of the raw UTC date,
// so a late-UTC-evening/early-UTC-morning release lands on the day a
// New-York-based trader would actually call it. Events with no fixed clock
// time keep the feed's given UTC calendar day AS ITS OWN DAY, not run through
// timezone conversion — midnight UTC is always the previous evening in New
// York, so converting a dateless event's midnight timestamp would silently
// push every single one back a day for no reason; there's no real instant to
// convert without a time, so the UTC calendar day is used as-is instead.
export function nyDateKey(dateUtcMidnight: Date, timeMinutes: number | null): string {
  if (timeMinutes === null) {
    const y = dateUtcMidnight.getUTCFullYear();
    const m = String(dateUtcMidnight.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dateUtcMidnight.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const instant = eventInstant(dateUtcMidnight, timeMinutes)!;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

// Same day as nyDateKey, as a plain Date (local calendar fields only — safe
// to hand to date-fns' format() for display, regardless of the server's own
// timezone) rather than a "yyyy-MM-dd" string.
export function nyDateOnly(dateUtcMidnight: Date, timeMinutes: number | null): Date {
  const [y, m, d] = nyDateKey(dateUtcMidnight, timeMinutes).split("-").map(Number);
  return new Date(y, m - 1, d);
}
