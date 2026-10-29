BEGIN;

CREATE TYPE "AccountAdmission" AS ENUM ('WAITLISTED', 'ADMITTED');

ALTER TABLE "account_metadata" RENAME TO "accounts";
ALTER TABLE "accounts" RENAME COLUMN "account_id" TO "id";
ALTER TABLE "accounts" RENAME CONSTRAINT "account_metadata_pkey" TO "accounts_pkey";
ALTER TABLE "accounts" ADD COLUMN "admission" "AccountAdmission" NOT NULL DEFAULT 'WAITLISTED';

COMMIT;
