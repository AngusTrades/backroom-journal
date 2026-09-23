ALTER TABLE "trades" ALTER COLUMN "rr" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "entry_price" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "exit_price" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "stop_price" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "contracts" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "point_value" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "exit_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "trades_account_external_unique" ON "trades" USING btree ("account_id","external_id");