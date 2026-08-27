CREATE TYPE "public"."reminder_channel" AS ENUM('screen');--> statement-breakpoint
CREATE TYPE "public"."reminder_type" AS ENUM('break', 'stretch', 'morning', 'hydration');--> statement-breakpoint
CREATE TABLE "reminder_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"type" "reminder_type" NOT NULL,
	"channel" "reminder_channel" DEFAULT 'screen' NOT NULL,
	"message_key" text NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "reminder_ack_not_before_fire" CHECK ("reminder_occurrences"."acknowledged_at" is null or "reminder_occurrences"."acknowledged_at" >= "reminder_occurrences"."fired_at")
);
--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD COLUMN "time_zone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminder_occurrences_household_fired_idx" ON "reminder_occurrences" USING btree ("household_id","fired_at");