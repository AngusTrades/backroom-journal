/**
 * The PnL Calendar shows trading days only (Mon–Fri). Weekend activity is
 * folded into the neighbouring trading day, matching how futures sessions
 * work:
 *   Sunday   → Monday  (the Sunday evening open is Monday's session)
 *   Saturday → Friday  (e.g. someone in Asia trading Friday's US session
 *                       after midnight their time)
 * Keys are calendar days as "yyyy-MM-dd".
 */
export function tradingDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0 = Sun, 6 = Sat
  if (dow === 6) date.setUTCDate(date.getUTCDate() - 1);
  else if (dow === 0) date.setUTCDate(date.getUTCDate() + 1);
  else return key;
  return date.toISOString().slice(0, 10);
}

/** Re-keys a per-day map onto trading days, merging values that land on
 * the same day. */
export function foldWeekends<V>(byDay: Map<string, V>, merge: (a: V, b: V) => V): Map<string, V> {
  const out = new Map<string, V>();
  for (const [key, value] of byDay) {
    const k = tradingDayKey(key);
    const existing = out.get(k);
    out.set(k, existing === undefined ? value : merge(existing, value));
  }
  return out;
}

export const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
