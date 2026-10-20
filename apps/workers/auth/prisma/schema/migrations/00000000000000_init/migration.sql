-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('WHATSAPP');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identities" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "provider_subject" VARCHAR(320) NOT NULL,
    "identifier" VARCHAR(320) NOT NULL,
    "display_identifier" VARCHAR(320) NOT NULL,
    "last_verified_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "previous_refresh_token_hash" CHAR(64),
    "previous_refresh_token_valid_until" TIMESTAMP(3),
    "refresh_expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identities_account_id_idx" ON "identities"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "identities_provider_provider_subject_key" ON "identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_account_id_idx" ON "sessions"("account_id");

-- CreateIndex
CREATE INDEX "sessions_refresh_expires_at_idx" ON "sessions"("refresh_expires_at");

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "public"."save_verified_identity"(
    "input_provider_subject" TEXT,
    "input_display_identifier" TEXT,
    "input_identifier" TEXT,
    "input_last_verified_at" TIMESTAMP(3),
    "candidate_account_id" UUID,
    "candidate_identity_id" UUID
)
RETURNS TABLE ("accountId" UUID, "identityId" UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    "resolved_account_id" UUID;
    "resolved_identity_id" UUID;
BEGIN
    UPDATE "public"."identities"
    SET "last_verified_at" = "input_last_verified_at",
        "display_identifier" = "input_display_identifier",
        "identifier" = "input_identifier",
        "updated_at" = "input_last_verified_at"
    WHERE "provider" = 'WHATSAPP'::"public"."IdentityProvider"
        AND "provider_subject" = "input_provider_subject"
    RETURNING "account_id", "id" INTO "resolved_account_id", "resolved_identity_id";

    IF "resolved_account_id" IS NULL THEN
        BEGIN
            INSERT INTO "public"."accounts" ("id") VALUES ("candidate_account_id");
            INSERT INTO "public"."identities" (
                "id", "account_id", "provider", "provider_subject", "identifier",
                "display_identifier", "last_verified_at", "updated_at"
            ) VALUES (
                "candidate_identity_id", "candidate_account_id", 'WHATSAPP'::"public"."IdentityProvider",
                "input_provider_subject", "input_identifier", "input_display_identifier",
                "input_last_verified_at", "input_last_verified_at"
            );
            "resolved_account_id" := "candidate_account_id";
            "resolved_identity_id" := "candidate_identity_id";
        EXCEPTION WHEN unique_violation THEN
            UPDATE "public"."identities"
            SET "last_verified_at" = "input_last_verified_at",
                "display_identifier" = "input_display_identifier",
                "identifier" = "input_identifier",
                "updated_at" = "input_last_verified_at"
            WHERE "provider" = 'WHATSAPP'::"public"."IdentityProvider"
                AND "provider_subject" = "input_provider_subject"
            RETURNING "account_id", "id" INTO "resolved_account_id", "resolved_identity_id";
            IF "resolved_account_id" IS NULL THEN RAISE; END IF;
        END;
    END IF;
    RETURN QUERY SELECT "resolved_account_id", "resolved_identity_id";
END;
$function$;
