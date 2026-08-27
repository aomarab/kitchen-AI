CREATE TYPE "public"."timer_status" AS ENUM('running', 'paused', 'done');--> statement-breakpoint
CREATE TABLE "cooking_timers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"label" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"status" timer_status DEFAULT 'running' NOT NULL,
	"ends_at" timestamp with time zone,
	"remaining_sec" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cooking_timer_running_has_deadline" CHECK (("cooking_timers"."status" = 'running') = ("cooking_timers"."ends_at" is not null)),
	CONSTRAINT "cooking_timer_duration_positive" CHECK ("cooking_timers"."duration_sec" > 0),
	CONSTRAINT "cooking_timer_remaining_nonnegative" CHECK ("cooking_timers"."remaining_sec" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cooking_timers" ADD CONSTRAINT "cooking_timers_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cooking_timers_household_created_idx" ON "cooking_timers" USING btree ("household_id","created_at");