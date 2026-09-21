// Best-effort progressive income-tax bracket estimator for a handful of
// countries. Feeds the "auto-calculated" set-aside rate on the Budgeting &
// Tax page — NOT tax advice, same disclaimer as the rest of that page
// already carries. A member can always override it with their own flat
// blended rate in Filing Region.
//
// Non-USD countries: thresholds are stored in their native currency and
// converted to USD once below, using an approximate FX rate captured
// 2026-09-21 (source: xe.com / pluang.com). Real exchange rates move —
// treat the resulting USD breakpoints as ballpark, not exact, and nudge
// FX_RATES occasionally rather than assuming they stay accurate forever.
//
// Deliberately simplified vs. the real tax code in every country below:
//  - US: federal brackets only — no state tax, no NIIT, no QBI/self-employment
//    tax, no capital-gains treatment for futures (Section 1256 etc).
//  - UK: the £100k–£125,140 personal-allowance taper (the "60% band") is not
//    modeled — the allowance is treated as a flat cliff at £12,570.
//  - Norway: models the flat "alminnelig inntekt" rate + trinnskatt only.
//    Trygdeavgift (national insurance, ~7.6-10.8% depending on whether the
//    income counts as wage, business, or capital income) is NOT included,
//    since that classification is genuinely ambiguous for trading income —
//    add it yourself as a rough add-on if you know which bucket applies.
//  - Russia: the 2025+ progressive NDFL scale, no regional variation.
//
// Every one of these is exactly the kind of thing that changes by tax year
// and by how your trading income actually gets classified — confirm with a
// licensed professional before relying on the number this produces.

export type Bracket = { upTo: number | null; rate: number }; // upTo in USD; null = no cap; rate is 0–1
export type FilingStatusOption = { value: string; label: string };

export type BracketResult = {
  totalTaxUsd: number;
  effectiveRatePct: number; // totalTax / income * 100
  marginalRatePct: number; // rate of the bracket the last dollar landed in
  currency: string;
  bracketsNote?: string;
};

type CountryTaxModel = {
  currency: string;
  fxToUsd: number;
  statuses: FilingStatusOption[];
  defaultStatus: string;
  bracketsFor: (status: string) => Bracket[];
  note: string;
};

// Approximate FX rates (1 unit of local currency = this many USD), captured 2026-09-21.
const GBP_TO_USD = 1.33759;
const NOK_TO_USD = 0.106049;
const RUB_TO_USD = 0.011841;

function toUsdBrackets(nativeUpTo: (number | null)[], rates: number[], fx: number): Bracket[] {
  return nativeUpTo.map((upTo, i) => ({
    upTo: upTo === null ? null : Math.round(upTo * fx),
    rate: rates[i],
  }));
}

// ---------------------------------------------------------------------
// United States — IRS Rev. Proc. 2025-32 (tax year 2026), federal only.
// ---------------------------------------------------------------------
const US_BRACKETS: Record<string, Bracket[]> = {
  single: [
    { upTo: 12400, rate: 0.1 },
    { upTo: 50400, rate: 0.12 },
    { upTo: 105700, rate: 0.22 },
    { upTo: 201775, rate: 0.24 },
    { upTo: 256225, rate: 0.32 },
    { upTo: 640600, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  married_joint: [
    { upTo: 24800, rate: 0.1 },
    { upTo: 100800, rate: 0.12 },
    { upTo: 211400, rate: 0.22 },
    { upTo: 403550, rate: 0.24 },
    { upTo: 512450, rate: 0.32 },
    { upTo: 768700, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  // MFS thresholds are exactly half of MFJ by statute (the 35%/37% break
  // included) — deriving it that way is more reliable than the scraped
  // MFS-specific figures, which several sources still show as stale 2025
  // numbers.
  married_separate: [
    { upTo: 12400, rate: 0.1 },
    { upTo: 50400, rate: 0.12 },
    { upTo: 105700, rate: 0.22 },
    { upTo: 201775, rate: 0.24 },
    { upTo: 256225, rate: 0.32 },
    { upTo: 384350, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  head_of_household: [
    { upTo: 17700, rate: 0.1 },
    { upTo: 67450, rate: 0.12 },
    { upTo: 105700, rate: 0.22 },
    { upTo: 201750, rate: 0.24 },
    { upTo: 256200, rate: 0.32 },
    { upTo: 640600, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
};

// ---------------------------------------------------------------------
// United Kingdom — 2026/27 tax year, individual only (no joint filing in
// the UK). Personal allowance taper above £100k is not modeled.
// ---------------------------------------------------------------------
const GB_BRACKETS = toUsdBrackets([12570, 50270, 125140, null], [0, 0.2, 0.4, 0.45], GBP_TO_USD);

// ---------------------------------------------------------------------
// Norway — 2026: flat 22% "alminnelig inntekt" rate + trinnskatt (bracket
// tax) layered on top of it. Trygdeavgift intentionally excluded — see
// header note.
// ---------------------------------------------------------------------
const NO_BRACKETS = toUsdBrackets(
  [226100, 318300, 725050, 980100, 1467200, null],
  [0.22, 0.237, 0.26, 0.357, 0.388, 0.398],
  NOK_TO_USD,
);

// ---------------------------------------------------------------------
// Russia — 2025+ progressive NDFL scale (replaced the old flat 13%/15%).
// ---------------------------------------------------------------------
const RU_BRACKETS = toUsdBrackets(
  [2400000, 5000000, 20000000, 50000000, null],
  [0.13, 0.15, 0.18, 0.2, 0.22],
  RUB_TO_USD,
);

const MODELS: Record<string, CountryTaxModel> = {
  US: {
    currency: "USD",
    fxToUsd: 1,
    defaultStatus: "single",
    statuses: [
      { value: "single", label: "Single" },
      { value: "married_joint", label: "Married Filing Jointly" },
      { value: "married_separate", label: "Married Filing Separately" },
      { value: "head_of_household", label: "Head of Household" },
    ],
    bracketsFor: (status) => US_BRACKETS[status] ?? US_BRACKETS.single,
    note: "Federal brackets only — no state tax, NIIT, or self-employment tax.",
  },
  GB: {
    currency: "GBP",
    fxToUsd: GBP_TO_USD,
    defaultStatus: "individual",
    statuses: [{ value: "individual", label: "Individual" }],
    bracketsFor: () => GB_BRACKETS,
    note: "Doesn't model the £100k–£125,140 personal-allowance taper.",
  },
  NO: {
    currency: "NOK",
    fxToUsd: NOK_TO_USD,
    defaultStatus: "individual",
    statuses: [{ value: "individual", label: "Individual" }],
    bracketsFor: () => NO_BRACKETS,
    note: "Flat 22% + trinnskatt only — trygdeavgift (national insurance) isn't included.",
  },
  RU: {
    currency: "RUB",
    fxToUsd: RUB_TO_USD,
    defaultStatus: "individual",
    statuses: [{ value: "individual", label: "Individual" }],
    bracketsFor: () => RU_BRACKETS,
    note: "2025+ progressive NDFL scale, no regional variation.",
  },
};

export function getCountryTaxModel(countryCode: string): CountryTaxModel | null {
  return MODELS[countryCode] ?? null;
}

export function getFilingStatusOptions(countryCode: string): FilingStatusOption[] | null {
  return MODELS[countryCode]?.statuses ?? null;
}

// Progressive bracket math: each bracket's rate applies only to the slice
// of income that falls inside it, not the whole amount.
export function computeBracketTax(countryCode: string, filingStatus: string, taxableIncomeUsd: number): BracketResult | null {
  const model = getCountryTaxModel(countryCode);
  if (!model) return null;
  if (taxableIncomeUsd <= 0) {
    const firstRate = model.bracketsFor(filingStatus)[0]?.rate ?? 0;
    return { totalTaxUsd: 0, effectiveRatePct: 0, marginalRatePct: firstRate * 100, currency: model.currency, bracketsNote: model.note };
  }

  const brackets = model.bracketsFor(filingStatus || model.defaultStatus);
  let prevCap = 0;
  let totalTax = 0;
  let marginalRatePct = brackets[brackets.length - 1].rate * 100;

  for (const b of brackets) {
    const cap = b.upTo ?? Infinity;
    const sliceTop = Math.min(taxableIncomeUsd, cap);
    const slice = sliceTop - prevCap;
    if (slice <= 0) {
      prevCap = cap;
      continue;
    }
    totalTax += slice * b.rate;
    marginalRatePct = b.rate * 100;
    prevCap = cap;
    if (taxableIncomeUsd <= cap) break;
  }

  return {
    totalTaxUsd: totalTax,
    effectiveRatePct: (totalTax / taxableIncomeUsd) * 100,
    marginalRatePct,
    currency: model.currency,
    bracketsNote: model.note,
  };
}
