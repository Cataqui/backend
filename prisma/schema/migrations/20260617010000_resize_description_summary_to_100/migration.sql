-- Truncate existing summaries to 100 characters before altering the column
UPDATE "jobs" SET "description_summary" = LEFT("description_summary", 100) WHERE LENGTH("description_summary") > 100;

-- Alter the column to VarChar(100)
ALTER TABLE "jobs" ALTER COLUMN "description_summary" TYPE VARCHAR(100);
