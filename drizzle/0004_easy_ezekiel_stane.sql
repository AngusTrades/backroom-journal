ALTER TABLE "entry_models" DROP CONSTRAINT "entry_models_name_unique";--> statement-breakpoint
ALTER TABLE "trades" DROP CONSTRAINT "trades_entry_model_id_entry_models_id_fk";--> statement-breakpoint
ALTER TABLE "entry_models" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "entry_models" ADD CONSTRAINT "entry_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_entry_model_id_entry_models_id_fk" FOREIGN KEY ("entry_model_id") REFERENCES "public"."entry_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_models" ADD CONSTRAINT "entry_models_user_name_unique" UNIQUE("user_id","name");
