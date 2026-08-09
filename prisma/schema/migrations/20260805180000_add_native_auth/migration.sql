-- CreateEnum
CREATE TYPE "AuthIdentityProvider" AS ENUM ('WHATSAPP');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "AuthIdentityProvider" NOT NULL,
    "provider_subject" VARCHAR(320) NOT NULL,
    "last_verified_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "previous_refresh_token_hash" CHAR(64),
    "previous_refresh_token_valid_until" TIMESTAMP(3),
    "refresh_expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_subject_key" ON "auth_identities"("provider", "provider_subject");

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "contact_id" UUID,
ADD COLUMN "poster_user_id" UUID;

-- Preserve existing job-contact associations before contacts become reusable.
UPDATE "jobs"
SET "contact_id" = "job_contact_methods"."id"
FROM "job_contact_methods"
WHERE "job_contact_methods"."job_id" = "jobs"."id";

-- AlterTable
ALTER TABLE "job_contact_methods" DROP CONSTRAINT "job_contact_methods_job_id_fkey";
DROP INDEX "job_contact_methods_job_id_idx";
DROP INDEX "job_contact_methods_job_id_key";
ALTER TABLE "job_contact_methods" DROP COLUMN "job_id",
DROP COLUMN "updated_at",
ADD COLUMN "user_id" UUID,
ALTER COLUMN "identifier" TYPE VARCHAR(320);

-- CreateIndex
CREATE INDEX "job_contact_methods_user_id_idx" ON "job_contact_methods"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_contact_methods_user_id_contact_method_identifier_key" ON "job_contact_methods"("user_id", "contact_method", "identifier");

-- CreateIndex
CREATE INDEX "jobs_contact_id_idx" ON "jobs"("contact_id");

-- CreateIndex
CREATE INDEX "jobs_poster_user_id_idx" ON "jobs"("poster_user_id");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_contact_methods" ADD CONSTRAINT "job_contact_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_poster_user_id_fkey" FOREIGN KEY ("poster_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "job_contact_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
