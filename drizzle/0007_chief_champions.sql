CREATE TYPE "public"."news_impact" AS ENUM('medium', 'high');--> statement-breakpoint
CREATE TABLE "news_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"time" text,
	"time_minutes" integer,
	"country" text NOT NULL,
	"title" text NOT NULL,
	"impact" "news_impact" NOT NULL,
	"forecast" text,
	"previous" text,
	"source_url" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_events_date_country_title_unique" UNIQUE("date","country","title")
);
