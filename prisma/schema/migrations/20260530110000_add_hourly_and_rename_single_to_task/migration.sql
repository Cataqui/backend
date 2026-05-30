-- AlterEnum: rename SINGLE to TASK in JobType
ALTER TYPE "JobType" RENAME VALUE 'SINGLE' TO 'TASK';

-- AlterEnum: add HOURLY to JobPaymentRecurrence
ALTER TYPE "JobPaymentRecurrence" ADD VALUE 'HOURLY';
