CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"kind" text NOT NULL,
	"bucket" text NOT NULL,
	"action" text,
	"ai_usage_id" uuid,
	"purchase_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"store" text,
	"product_id" text NOT NULL,
	"store_transaction_id" text,
	"credits" integer NOT NULL,
	"price_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_credits" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"free_balance" integer DEFAULT 0 NOT NULL,
	"paid_balance" integer DEFAULT 0 NOT NULL,
	"grant_period" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_ai_usage_id_ai_usage_id_fk" FOREIGN KEY ("ai_usage_id") REFERENCES "public"."ai_usage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_credits" ADD CONSTRAINT "household_credits_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_household_idx" ON "credit_ledger" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchases_store_txn_key" ON "credit_purchases" USING btree ("store_transaction_id");--> statement-breakpoint
CREATE INDEX "credit_purchases_household_idx" ON "credit_purchases" USING btree ("household_id");