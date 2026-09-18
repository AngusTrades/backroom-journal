-- One-time data fix: R:R was always meant to be stored as a positive
-- magnitude (Win/Loss/B/E is what applies the sign in every Net R rollup —
-- see normalizeRr() in actions/trades.ts), but nothing stopped someone from
-- typing a negative number for a loss before this release. That silently
-- broke Net R (a "-1" loss got added instead of subtracted) and Profit
-- Factor (a negative gross-loss sum made the formula treat it as "no
-- losses at all", showing an infinite, unmoving profit factor). This
-- corrects every trade already logged that way; new trades can't hit this
-- again since the app now normalizes on save.
UPDATE "trades" SET "rr" = ABS("rr") WHERE "rr" < 0;
