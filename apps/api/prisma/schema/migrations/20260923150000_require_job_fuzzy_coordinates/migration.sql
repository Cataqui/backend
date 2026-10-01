UPDATE "public"."jobs"
SET
  "fuzzy_latitude" = COALESCE("fuzzy_latitude", ROUND((random() * 180 - 90)::numeric, 6)),
  "fuzzy_longitude" = COALESCE("fuzzy_longitude", ROUND((random() * 360 - 180)::numeric, 6))
WHERE "fuzzy_latitude" IS NULL OR "fuzzy_longitude" IS NULL;

ALTER TABLE "public"."jobs"
  ALTER COLUMN "fuzzy_latitude" SET NOT NULL,
  ALTER COLUMN "fuzzy_longitude" SET NOT NULL;
