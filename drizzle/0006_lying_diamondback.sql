CREATE TYPE "public"."market_session" AS ENUM('asia', 'london', 'new_york');--> statement-breakpoint
CREATE TYPE "public"."session_bias" AS ENUM('bullish', 'bearish', 'neutral');--> statement-breakpoint
CREATE TABLE "session_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"session" "market_session" NOT NULL,
	"bias" "session_bias" NOT NULL,
	"points_moved" numeric(8, 2) NOT NULL,
	"open_pts" numeric(10, 2),
	"high_pts" numeric(10, 2),
	"low_pts" numeric(10, 2),
	"close_pts" numeric(10, 2),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_logs_user_date_session_unique" UNIQUE("user_id","date","session")
);
--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;