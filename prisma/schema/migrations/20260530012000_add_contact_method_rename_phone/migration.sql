-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('WHATSAPP', 'PHONE_CALL');

-- AlterTable: rename contact_whatsapp to contact_phone_number
ALTER TABLE "jobs" RENAME COLUMN "contact_whatsapp" TO "contact_phone_number";

-- AlterTable: add contact_method column with default for existing rows
ALTER TABLE "jobs" ADD COLUMN "contact_method" "ContactMethod" NOT NULL DEFAULT 'WHATSAPP';
