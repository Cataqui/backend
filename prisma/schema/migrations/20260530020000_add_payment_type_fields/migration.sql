-- CreateEnum
CREATE TYPE "JobPaymentType" AS ENUM ('FIXED', 'RANGE', 'FLEXIBLE', 'OTHER');

-- AlterTable: add new payment columns
ALTER TABLE "jobs" ADD COLUMN "payment_type" "JobPaymentType" NOT NULL DEFAULT 'FIXED';
ALTER TABLE "jobs" ADD COLUMN "payment_min_amount" DECIMAL(10,2);
ALTER TABLE "jobs" ADD COLUMN "payment_max_amount" DECIMAL(10,2);
ALTER TABLE "jobs" ADD COLUMN "payment_note" TEXT;

-- Migrate existing data: set payment_min_amount to payment_amount, type to FIXED
UPDATE "jobs" SET
	"payment_min_amount" = "payment_amount",
	"payment_type" = 'FIXED';

-- Drop old column
ALTER TABLE "jobs" DROP COLUMN "payment_amount";

-- Remove default on payment_type since app always provides it
ALTER TABLE "jobs" ALTER COLUMN "payment_type" DROP DEFAULT;
