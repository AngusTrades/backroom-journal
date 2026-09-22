ALTER TABLE "receipts" ADD COLUMN "tax_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tax_entry_id_tax_entries_id_fk" FOREIGN KEY ("tax_entry_id") REFERENCES "public"."tax_entries"("id") ON DELETE set null ON UPDATE no action;
