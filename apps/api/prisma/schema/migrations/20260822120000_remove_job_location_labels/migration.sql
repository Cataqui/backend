-- DropIndex
DROP INDEX "jobs_city_state_country_idx";

-- AlterTable
ALTER TABLE "jobs"
DROP COLUMN "street",
DROP COLUMN "neighborhood",
DROP COLUMN "city",
DROP COLUMN "state",
DROP COLUMN "country";
