CREATE TABLE "reminder_settings" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"break_enabled" boolean DEFAULT true NOT NULL,
	"stretch_enabled" boolean DEFAULT true NOT NULL,
	"morning_enabled" boolean DEFAULT true NOT NULL,
	"hydration_enabled" boolean DEFAULT true NOT NULL,
	"break_cadence_minutes" integer DEFAULT 60 NOT NULL,
	"hydration_goal_cups" integer DEFAULT 8 NOT NULL,
	"quiet_hours_start" integer DEFAULT 22 NOT NULL,
	"quiet_hours_end" integer DEFAULT 7 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;