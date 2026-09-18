ALTER TABLE "accounts" ADD COLUMN "tradovate_account_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_copy_leader" boolean DEFAULT false NOT NULL;