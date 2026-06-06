UPDATE "jobs"
SET "neighborhood" = "city"
WHERE "neighborhood" IS NULL;

ALTER TABLE "jobs"
ALTER COLUMN "neighborhood" SET NOT NULL;
