-- Pairs go from shared/global (like sessions) to per-member (like entry
-- models and setups) — every member now builds their own pair list from
-- scratch via "+ Add" on the Add Trade page. This table can already hold
-- real data (the day-one seed list, plus whatever members have logged
-- trades against), so this migration re-homes existing rows instead of
-- just dropping them:
--   1. add a nullable user_id column, and free up the columns/constraints
--      the data migration below needs to touch
--   2. give each existing pair row to the first member who logged a trade
--      against it
--   3. for every OTHER member who also used that same symbol, create their
--      own copy of the pair and repoint their trades onto it
--   4. drop whatever's left with no owner (unused seed rows nobody ever
--      traded) — matches how entry_models/setups have always worked
--   5. lock down NOT NULL + the per-member unique constraint
-- asset_class is dropped in the same migration — it was never surfaced
-- anywhere in the app (only ever written by the old seed script), so there's
-- nothing to preserve.
ALTER TABLE "pairs" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "pairs" ALTER COLUMN "asset_class" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pairs" DROP CONSTRAINT "pairs_symbol_unique";--> statement-breakpoint
WITH first_owner AS (
  SELECT DISTINCT ON (t.pair_id) t.pair_id, a.user_id
  FROM "trades" t
  JOIN "accounts" a ON a.id = t.account_id
  ORDER BY t.pair_id, t.created_at ASC
)
UPDATE "pairs" p
SET "user_id" = fo.user_id
FROM first_owner fo
WHERE p.id = fo.pair_id;--> statement-breakpoint
INSERT INTO "pairs" ("id", "user_id", "symbol")
SELECT gen_random_uuid(), needed.user_id, needed.symbol
FROM (
  SELECT DISTINCT a.user_id, p.symbol
  FROM "trades" t
  JOIN "accounts" a ON a.id = t.account_id
  JOIN "pairs" p ON p.id = t.pair_id
  WHERE NOT EXISTS (
    SELECT 1 FROM "pairs" p2 WHERE p2.user_id = a.user_id AND p2.symbol = p.symbol
  )
) needed;--> statement-breakpoint
UPDATE "trades" t
SET "pair_id" = correct.id
FROM "accounts" a, "pairs" correct, "pairs" old
WHERE t.account_id = a.id
  AND old.id = t.pair_id
  AND correct.user_id = a.user_id
  AND correct.symbol = old.symbol
  AND t.pair_id <> correct.id;--> statement-breakpoint
DELETE FROM "pairs" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "pairs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_user_symbol_unique" UNIQUE("user_id","symbol");--> statement-breakpoint
ALTER TABLE "pairs" DROP COLUMN "asset_class";--> statement-breakpoint
DROP TYPE "public"."asset_class";
