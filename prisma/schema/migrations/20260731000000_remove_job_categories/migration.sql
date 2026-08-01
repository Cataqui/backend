ALTER TABLE "jobs" DROP CONSTRAINT "jobs_category_id_fkey";

DROP INDEX "jobs_category_id_idx";

ALTER TABLE "jobs" DROP COLUMN "category_id";

DROP TABLE "job_category_translations";

DROP TABLE "job_categories";
