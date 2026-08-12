ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_location_id_storage_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_location_id_storage_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."storage_locations"("id") ON DELETE no action ON UPDATE no action;