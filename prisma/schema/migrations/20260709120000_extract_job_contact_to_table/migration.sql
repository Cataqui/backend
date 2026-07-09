-- CreateTable: job_contact_methods
-- Separates contact data from the jobs table into its own table
-- anticipating future 1:N (multiple contact methods per job).
-- Currently 1:1 enforced via unique constraint on job_id.

CREATE TABLE "job_contact_methods" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "contact_method" "JobContactMethod" NOT NULL,
    "identifier" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_contact_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: enforce 1:1 now; relax to (job_id, contact_method) for future 1:N
CREATE UNIQUE INDEX "job_contact_methods_job_id_key" ON "job_contact_methods"("job_id");

-- CreateIndex: index for future 1:N lookups by job
CREATE INDEX "job_contact_methods_job_id_idx" ON "job_contact_methods"("job_id");

-- AddForeignKey: cascade delete owned contact entries when job is deleted
ALTER TABLE "job_contact_methods" ADD CONSTRAINT "job_contact_methods_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate existing contact data from jobs table
INSERT INTO "job_contact_methods" ("id", "job_id", "contact_method", "identifier", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "contact_method", "contact_phone_number", "created_at", "updated_at" FROM "jobs";

-- Drop old columns from jobs table
ALTER TABLE "jobs" DROP COLUMN "contact_phone_number";
ALTER TABLE "jobs" DROP COLUMN "contact_method";
