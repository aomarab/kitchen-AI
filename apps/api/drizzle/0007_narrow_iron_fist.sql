ALTER TABLE "credit_ledger" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX "credit_ledger_refund_idx" ON "credit_ledger" USING btree ("household_id","action","kind","seq");