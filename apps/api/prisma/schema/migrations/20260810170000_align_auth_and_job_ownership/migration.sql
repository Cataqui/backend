-- Remove the legacy map table after its historical migration is replayed.
DROP TABLE IF EXISTS "map_versions";

-- Preserve existing native-auth records while aligning column names with the current session model.
ALTER TABLE "auth_identities" RENAME COLUMN "verified_at" TO "last_verified_at";
ALTER INDEX "auth_sessions_token_hash_key" RENAME TO "auth_sessions_refresh_token_hash_key";
ALTER TABLE "auth_sessions" RENAME COLUMN "token_hash" TO "refresh_token_hash";
ALTER TABLE "auth_sessions" RENAME COLUMN "expires_at" TO "refresh_expires_at";
DROP INDEX "auth_sessions_source_intent_id_key";
DROP INDEX "auth_sessions_user_id_revoked_at_expires_at_idx";
ALTER TABLE "auth_sessions"
DROP COLUMN "source_intent_id",
DROP COLUMN "revoked_at",
ADD COLUMN "previous_refresh_token_hash" CHAR(64),
ADD COLUMN "previous_refresh_token_valid_until" TIMESTAMP(3);
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- Give jobs reusable contacts and optional ownership while preserving every existing job-contact association.
ALTER TABLE "jobs" ADD COLUMN "contact_id" UUID,
ADD COLUMN "poster_user_id" UUID;

UPDATE "jobs"
SET "contact_id" = "job_contact_methods"."id"
FROM "job_contact_methods"
WHERE "job_contact_methods"."job_id" = "jobs"."id";

ALTER TABLE "job_contact_methods" DROP CONSTRAINT "job_contact_methods_job_id_fkey";
DROP INDEX "job_contact_methods_job_id_idx";
DROP INDEX "job_contact_methods_job_id_key";
ALTER TABLE "job_contact_methods" DROP COLUMN "job_id",
DROP COLUMN "updated_at",
ADD COLUMN "user_id" UUID,
ALTER COLUMN "identifier" TYPE VARCHAR(320);

CREATE INDEX "job_contact_methods_user_id_idx" ON "job_contact_methods"("user_id");
CREATE UNIQUE INDEX "job_contact_methods_user_id_contact_method_identifier_key" ON "job_contact_methods"("user_id", "contact_method", "identifier");
CREATE INDEX "jobs_contact_id_idx" ON "jobs"("contact_id");
CREATE INDEX "jobs_poster_user_id_idx" ON "jobs"("poster_user_id");

ALTER TABLE "job_contact_methods" ADD CONSTRAINT "job_contact_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_poster_user_id_fkey" FOREIGN KEY ("poster_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "job_contact_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
