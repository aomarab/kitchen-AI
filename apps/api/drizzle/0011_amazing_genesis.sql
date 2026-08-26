CREATE TABLE "product_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"brand" text,
	"rating" smallint NOT NULL,
	"message" text,
	"locale" "locale" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_feedback_rating_range" CHECK ("product_feedback"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_feedback_one_per_user" ON "product_feedback" USING btree ("user_id","ingredient_id",lower(coalesce("brand", '')));--> statement-breakpoint
CREATE INDEX "product_feedback_brand_idx" ON "product_feedback" USING btree (lower("brand"));--> statement-breakpoint
CREATE INDEX "product_feedback_created_idx" ON "product_feedback" USING btree ("created_at" DESC NULLS LAST);