ALTER TYPE "public"."JobContactMethod" RENAME TO "ContactMethod";
ALTER TABLE "public"."job_contact_methods" RENAME TO "contacts";
ALTER TABLE "public"."contacts" RENAME CONSTRAINT "job_contact_methods_pkey" TO "contacts_pkey";
ALTER TABLE "public"."contacts" RENAME CONSTRAINT "job_contact_methods_user_id_fkey" TO "contacts_user_id_fkey";
ALTER INDEX "public"."job_contact_methods_user_id_idx" RENAME TO "contacts_user_id_idx";
ALTER INDEX "public"."job_contact_methods_user_id_contact_method_identifier_key" RENAME TO "contacts_user_id_contact_method_identifier_key";

CREATE OR REPLACE FUNCTION "public"."save_verified_identity_and_contact"(
    "input_provider" "public"."AuthIdentityProvider",
    "input_provider_subject" TEXT,
    "input_display_identifier" TEXT,
    "input_last_verified_at" TIMESTAMP(3),
    "input_contact_method" "public"."ContactMethod",
    "input_contact_identifier" TEXT,
    "candidate_user_id" UUID,
    "candidate_identity_id" UUID,
    "candidate_contact_id" UUID
)
RETURNS TABLE ("userId" UUID, "authIdentityId" UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    "resolved_user_id" UUID;
    "resolved_identity_id" UUID;
BEGIN
    UPDATE "public"."auth_identities"
    SET
        "last_verified_at" = "input_last_verified_at",
        "display_identifier" = "input_display_identifier",
        "updated_at" = "input_last_verified_at"
    WHERE "provider" = "input_provider"
        AND "provider_subject" = "input_provider_subject"
    RETURNING "user_id", "id" INTO "resolved_user_id", "resolved_identity_id";

    IF "resolved_user_id" IS NULL THEN
        BEGIN
            INSERT INTO "public"."users" ("id", "updated_at")
            VALUES ("candidate_user_id", "input_last_verified_at");

            INSERT INTO "public"."auth_identities" (
                "id",
                "user_id",
                "provider",
                "provider_subject",
                "display_identifier",
                "last_verified_at",
                "updated_at"
            )
            VALUES (
                "candidate_identity_id",
                "candidate_user_id",
                "input_provider",
                "input_provider_subject",
                "input_display_identifier",
                "input_last_verified_at",
                "input_last_verified_at"
            );

            "resolved_user_id" := "candidate_user_id";
            "resolved_identity_id" := "candidate_identity_id";
        EXCEPTION
            WHEN unique_violation THEN
                UPDATE "public"."auth_identities"
                SET
                    "last_verified_at" = "input_last_verified_at",
                    "display_identifier" = "input_display_identifier",
                    "updated_at" = "input_last_verified_at"
                WHERE "provider" = "input_provider"
                    AND "provider_subject" = "input_provider_subject"
                RETURNING "user_id", "id" INTO "resolved_user_id", "resolved_identity_id";

                IF "resolved_user_id" IS NULL THEN
                    RAISE;
                END IF;
        END;
    END IF;

    INSERT INTO "public"."contacts" (
        "id",
        "user_id",
        "contact_method",
        "identifier"
    )
    VALUES (
        "candidate_contact_id",
        "resolved_user_id",
        "input_contact_method",
        "input_contact_identifier"
    )
    ON CONFLICT ("user_id", "contact_method", "identifier") DO NOTHING;

    RETURN QUERY SELECT "resolved_user_id", "resolved_identity_id";
END;
$function$;
