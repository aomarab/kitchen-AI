CREATE TYPE "public"."dish_media_status" AS ENUM('matched', 'none');--> statement-breakpoint
CREATE TABLE "dish_media" (
	"dish_key" text NOT NULL,
	"locale" "locale" NOT NULL,
	"status" "dish_media_status" NOT NULL,
	"hero_youtube_id" text,
	"hero_thumbnail_url" text,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dish_media_dish_key_locale_pk" PRIMARY KEY("dish_key","locale")
);
--> statement-breakpoint
CREATE TABLE "dish_videos" (
	"dish_key" text NOT NULL,
	"locale" "locale" NOT NULL,
	"youtube_id" text NOT NULL,
	"title" text NOT NULL,
	"channel" text NOT NULL,
	"thumbnail_url" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"rank" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dish_videos_dish_key_locale_youtube_id_pk" PRIMARY KEY("dish_key","locale","youtube_id")
);
--> statement-breakpoint
DROP TABLE "recipe_videos" CASCADE;