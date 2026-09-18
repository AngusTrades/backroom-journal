CREATE TYPE "public"."tax_entry_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TABLE "tax_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "tax_entry_kind" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_categories_user_kind_name_unique" UNIQUE("user_id","kind","name")
);
--> statement-breakpoint
CREATE TABLE "tax_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "tax_entry_kind" NOT NULL,
	"category_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"description" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"kind" "tax_entry_kind" NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tax_categories" ADD CONSTRAINT "tax_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_entries" ADD CONSTRAINT "tax_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_entries" ADD CONSTRAINT "tax_entries_category_id_tax_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tax_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_entries" ADD CONSTRAINT "tax_entries_import_batch_id_tax_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."tax_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_import_batches" ADD CONSTRAINT "tax_import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tax_entries_user_date_idx" ON "tax_entries" USING btree ("user_id","date");