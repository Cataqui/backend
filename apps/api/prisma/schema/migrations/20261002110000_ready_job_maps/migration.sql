ALTER TABLE "public"."jobs" ADD COLUMN "location_image_url" TEXT;
ALTER TABLE "public"."job_post_requests"
 ADD COLUMN "fuzzy_latitude" DECIMAL(9,6),
 ADD COLUMN "fuzzy_longitude" DECIMAL(9,6),
 ALTER COLUMN "job_id" DROP NOT NULL;

UPDATE "public"."job_post_requests" AS request
SET "fuzzy_latitude" = job."fuzzy_latitude", "fuzzy_longitude" = job."fuzzy_longitude"
FROM "public"."jobs" AS job
WHERE job."id" = request."job_id";

ALTER TABLE "public"."job_post_requests"
 ALTER COLUMN "fuzzy_latitude" SET NOT NULL,
 ALTER COLUMN "fuzzy_longitude" SET NOT NULL;
