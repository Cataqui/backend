-- DropIndex
DROP INDEX "jobs_location_point_idx";

-- AlterTable
ALTER TABLE "jobs" ALTER COLUMN "contact_method" DROP DEFAULT;

-- CreateTable
CREATE TABLE "map_versions" (
    "id" UUID NOT NULL,
    "region_code" VARCHAR(50) NOT NULL,
    "map_file_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "map_versions_region_code_key" ON "map_versions"("region_code");
