ALTER TABLE "credit_ledger" DROP CONSTRAINT "credit_ledger_ai_usage_id_ai_usage_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "spend_group_id" uuid;--> statement-breakpoint
CREATE INDEX "ai_usage_spend_group_idx" ON "ai_usage" USING btree ("spend_group_id");--> statement-breakpoint
ALTER TABLE "credit_ledger" DROP COLUMN "ai_usage_id";