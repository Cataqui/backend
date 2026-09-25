ALTER TABLE "public"."jobs"
  ADD COLUMN "location_title" TEXT;

UPDATE "public"."jobs"
SET "location_title" = 'legacy-location-' || "id"::text;

ALTER TABLE "public"."jobs"
  ALTER COLUMN "location_title" SET NOT NULL;
