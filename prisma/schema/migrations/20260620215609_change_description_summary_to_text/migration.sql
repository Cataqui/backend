-- AlterTable
ALTER TABLE "jobs" ALTER COLUMN "description_summary" DROP DEFAULT,
ALTER COLUMN "description_summary" SET DATA TYPE TEXT;
