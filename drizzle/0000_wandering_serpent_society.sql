CREATE TYPE "public"."account_status" AS ENUM('active', 'passed', 'failed', 'funded', 'closed');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('prop_firm', 'live', 'paper', 'backtest', 'forward_test');--> statement-breakpoint
CREATE TYPE "public"."asset_class" AS ENUM('forex', 'commodity', 'futures', 'crypto');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('win', 'loss', 'be');--> statement-breakpoint
CREATE TYPE "public"."position" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" DEFAULT 'paper' NOT NULL,
	"firm" text,
	"size_usd" numeric(14, 2),
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"starting_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"firm_name" text NOT NULL,
	"account_label" text NOT NULL,
	"scale_multiplier" numeric(5, 2) DEFAULT '1.0' NOT NULL,
	"daily_loss_cap_usd" numeric(14, 2),
	"enabled" boolean DEFAULT true NOT NULL,
	"last_mirrored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "entry_models_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	CONSTRAINT "pairs_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"gross_amount" numeric(14, 2) NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"set_aside_pct" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "sessions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "setups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "setups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tax_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text DEFAULT 'United States' NOT NULL,
	"country_code" text DEFAULT 'US' NOT NULL,
	"filing_status" text,
	"blended_rate_pct" numeric(5, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_setups" (
	"trade_id" uuid NOT NULL,
	"setup_id" uuid NOT NULL,
	CONSTRAINT "trade_setups_trade_id_setup_id_pk" PRIMARY KEY("trade_id","setup_id")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"account_id" uuid NOT NULL,
	"pair_id" uuid NOT NULL,
	"entry_model_id" uuid,
	"position" "position" NOT NULL,
	"session_id" uuid,
	"rr" numeric(6, 2) NOT NULL,
	"outcome" "outcome" NOT NULL,
	"pre_trade" text,
	"management" text,
	"review" text,
	"chart_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "copy_destinations" ADD CONSTRAINT "copy_destinations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_setups" ADD CONSTRAINT "trade_setups_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_setups" ADD CONSTRAINT "trade_setups_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_entry_model_id_entry_models_id_fk" FOREIGN KEY ("entry_model_id") REFERENCES "public"."entry_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trades_date_idx" ON "trades" USING btree ("date");--> statement-breakpoint
CREATE INDEX "trades_account_idx" ON "trades" USING btree ("account_id");