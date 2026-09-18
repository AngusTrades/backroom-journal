/**
 * Best-effort shorthand for economic calendar event names, so the compact
 * views (calendar dots, day cells) can show the term traders actually say
 * out loud — "NFP", "CPI", "FOMC" — instead of the full official title from
 * the feed. The full title is never thrown away: it's still shown in the
 * details table/tooltips, this is purely a display shortcut.
 *
 * Strategy: an exact-match dictionary (case-insensitive, keyed on the feed's
 * standard event names) covers the handful of releases that show up over and
 * over across major currencies. Anything not in the dictionary falls through
 * a couple of generic, low-risk cleanups (PMI wording, trailing m/m·q/q·y/y),
 * and if still nothing matches, the original title is returned untouched —
 * an unfamiliar or newly-added event never breaks or gets mangled.
 */

const EXACT_MAP: Record<string, string> = {
  // Employment
  "non-farm employment change": "NFP",
  "adp non-farm employment change": "ADP NFP",
  "average hourly earnings m/m": "Avg Hourly Earnings",
  "unemployment claims": "Jobless Claims",
  "continuing claims": "Continuing Claims",
  "employment change": "Employment Chg",
  "claimant count change": "Claimant Count",
  "average earnings index 3m/y": "Avg Earnings",
  "jolts job openings": "JOLTS",

  // Inflation
  "cpi m/m": "CPI",
  "cpi y/y": "CPI y/y",
  "core cpi m/m": "Core CPI",
  "core cpi y/y": "Core CPI y/y",
  "cpi flash estimate y/y": "CPI Flash Estimate",
  "ppi m/m": "PPI",
  "core ppi m/m": "Core PPI",
  "pce price index m/m": "PCE",
  "core pce price index m/m": "Core PCE",
  "trimmed mean cpi q/q": "Trimmed Mean CPI",

  // Growth / activity
  "gdp m/m": "GDP",
  "gdp q/q": "GDP",
  "advance gdp q/q": "Advance GDP",
  "prelim gdp q/q": "Prelim GDP",
  "final gdp q/q": "Final GDP",
  "retail sales m/m": "Retail Sales",
  "core retail sales m/m": "Core Retail Sales",
  "durable goods orders m/m": "Durable Goods",
  "core durable goods orders m/m": "Core Durable Goods",
  "trade balance": "Trade Balance",
  "building permits": "Building Permits",
  "existing home sales": "Existing Home Sales",
  "new home sales": "New Home Sales",

  // Fed / FOMC
  "fomc statement": "FOMC Statement",
  "fomc press conference": "FOMC Presser",
  "fomc economic projections": "FOMC Projections",
  "fomc meeting minutes": "FOMC Minutes",
  "federal funds rate": "Fed Rate",

  // Other central banks
  "official bank rate": "BOE Rate",
  "monetary policy summary": "BOE Summary",
  "mpc official bank rate votes": "MPC Rate Votes",
  "main refinancing rate": "ECB Rate",
  "ecb monetary policy statement": "ECB Statement",
  "ecb press conference": "ECB Presser",
  "cash rate": "RBA Rate",
  "rba rate statement": "RBA Statement",
  "official cash rate": "RBNZ Rate",
  "rbnz rate statement": "RBNZ Statement",
  "rbnz monetary policy statement": "RBNZ Statement",
  "overnight rate": "BOC Rate",
  "boc rate statement": "BOC Statement",
  "boj policy rate": "BOJ Rate",
  "boj press conference": "BOJ Presser",
  "monetary policy statement": "BOJ Statement",
  "snb policy rate": "SNB Rate",
  "snb monetary policy assessment": "SNB Assessment",

  // PMI / sentiment / surveys
  "ism manufacturing pmi": "ISM Mfg PMI",
  "ism services pmi": "ISM Services PMI",
  "ism non-manufacturing pmi": "ISM Services PMI",
  "prelim uom consumer sentiment": "UoM Sentiment",
  "revised uom consumer sentiment": "UoM Sentiment",
  "german zew economic sentiment": "ZEW Sentiment",
  "german ifo business climate": "Ifo Business Climate",
  "tankan manufacturing index": "Tankan Mfg Index",
  "ivey pmi": "Ivey PMI",
};

// Speeches: "Fed Chair Powell Speaks" -> "Powell Speaks". Strips the title
// before the name so what's left reads like how a trader would actually
// flag it on a calendar.
const SPEAKER_PREFIX =
  /^(fed chair|fomc member|boe gov|ecb president|rba gov|boj gov|snb chairman|rbnz gov|boc gov|treasury secretary)\s+/i;

export function abbreviateNewsTitle(title: string): string {
  const t = title.trim().replace(/\s+/g, " ");
  const exact = EXACT_MAP[t.toLowerCase()];
  if (exact) return exact;

  if (/\bspeaks$/i.test(t)) return t.replace(SPEAKER_PREFIX, "").trim();

  let out = t.replace(/\bManufacturing PMI\b/i, "Mfg PMI").replace(/\bServices PMI\b/i, "Svc PMI");

  // Traders drop the bare periodicity suffix when they say a release's name
  // out loud ("CPI", not "CPI m/m") — safe to trim generically since the
  // metric name itself is untouched.
  out = out.replace(/\s+(m\/m|q\/q|y\/y|3m\/y|w\/w)$/i, "");

  return out;
}
