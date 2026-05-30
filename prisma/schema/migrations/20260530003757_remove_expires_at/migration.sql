-- DropIndex
DROP INDEX IF EXISTS "jobs_expires_at_idx";

-- AlterTable
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "expires_at";
