-- DropIndex
DROP INDEX "jobs_status_idx";

-- CreateIndex
CREATE INDEX "jobs_status_created_at_id_idx" ON "jobs"("status", "created_at" DESC, "id" DESC);
