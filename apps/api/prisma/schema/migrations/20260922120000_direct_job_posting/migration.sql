DELETE FROM "public"."jobs";

ALTER TABLE "public"."jobs"
  DROP COLUMN "type",
  DROP COLUMN "payment_type",
  DROP COLUMN "payment_min_amount",
  DROP COLUMN "payment_max_amount",
  DROP COLUMN "payment_note",
  DROP COLUMN "payment_amount_period",
  DROP COLUMN "payment_currency",
  ADD COLUMN "payment" TEXT NOT NULL,
  ALTER COLUMN "title" SET NOT NULL,
  ALTER COLUMN "description_summary" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

CREATE TABLE "public"."job_post_requests" (
  "id" UUID NOT NULL,
  "poster_user_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "job_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "job_post_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_post_requests_poster_user_id_idempotency_key_key" ON "public"."job_post_requests"("poster_user_id", "idempotency_key");
CREATE UNIQUE INDEX "job_post_requests_job_id_key" ON "public"."job_post_requests"("job_id");
ALTER TABLE "public"."job_post_requests" ADD CONSTRAINT "job_post_requests_poster_user_id_fkey" FOREIGN KEY ("poster_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."job_post_requests" ADD CONSTRAINT "job_post_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "public"."JobStatus" RENAME TO "JobStatus_old";
CREATE TYPE "public"."JobStatus" AS ENUM ('ACTIVE', 'CLOSED');
ALTER TABLE "public"."jobs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."jobs" ALTER COLUMN "status" TYPE "public"."JobStatus" USING ("status"::text::"public"."JobStatus");
ALTER TABLE "public"."jobs" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "public"."JobStatus_old";
DROP TYPE "public"."JobType";
DROP TYPE "public"."JobPaymentType";
DROP TYPE "public"."JobPaymentAmountPeriod";
