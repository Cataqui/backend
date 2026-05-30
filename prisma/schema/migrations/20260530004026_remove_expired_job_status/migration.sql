-- AlterEnum
BEGIN;
CREATE TYPE "JobStatus_new" AS ENUM ('ACTIVE', 'CLOSED');
ALTER TABLE "jobs" ALTER COLUMN "status" TYPE "JobStatus_new" USING ("status"::text::"JobStatus_new");
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";
ALTER TYPE "JobStatus_new" RENAME TO "JobStatus";
DROP TYPE "public"."JobStatus_old";
COMMIT;
