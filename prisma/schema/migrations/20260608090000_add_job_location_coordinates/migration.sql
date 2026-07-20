CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "jobs"
ADD COLUMN "location_point" geometry(Point, 4326),
ADD COLUMN "fuzzy_latitude" DECIMAL(9, 6) NOT NULL DEFAULT -23.550520,
ADD COLUMN "fuzzy_longitude" DECIMAL(9, 6) NOT NULL DEFAULT -46.633308;

UPDATE "jobs"
SET "location_point" = ST_SetSRID(ST_MakePoint(-46.633308, -23.550520), 4326)
WHERE "location_point" IS NULL;

CREATE INDEX "jobs_location_point_idx" ON "jobs" USING GIST ("location_point");

ALTER TABLE "jobs"
ALTER COLUMN "fuzzy_latitude" DROP DEFAULT,
ALTER COLUMN "fuzzy_longitude" DROP DEFAULT;
