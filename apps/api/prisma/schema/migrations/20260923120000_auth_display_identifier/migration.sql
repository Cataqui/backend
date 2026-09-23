ALTER TABLE "public"."auth_identities" ADD COLUMN "display_identifier" VARCHAR(320);

UPDATE "public"."auth_identities" AS identity
SET "display_identifier" = (
    SELECT contact."identifier" FROM "public"."job_contact_methods" AS contact
    WHERE contact."user_id" = identity."user_id" AND contact."contact_method" = 'WHATSAPP'
    ORDER BY contact."created_at" ASC, contact."id" ASC LIMIT 1
);

ALTER TABLE "public"."auth_identities" ALTER COLUMN "display_identifier" SET NOT NULL;

ALTER TABLE "public"."auth_sessions" ADD COLUMN "auth_identity_id" UUID;

UPDATE "public"."auth_sessions" AS session
SET "auth_identity_id" = (
    SELECT identity."id" FROM "public"."auth_identities" AS identity
    WHERE identity."user_id" = session."user_id"
    ORDER BY identity."created_at" ASC, identity."id" ASC LIMIT 1
);

ALTER TABLE "public"."auth_sessions" ADD CONSTRAINT "auth_sessions_auth_identity_id_fkey"
    FOREIGN KEY ("auth_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "public"."save_verified_identity_and_contact"(
    "input_provider" "public"."AuthIdentityProvider",
    "input_provider_subject" TEXT,
    "input_display_identifier" TEXT,
    "input_last_verified_at" TIMESTAMP(3),
    "input_contact_method" "public"."JobContactMethod",
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

    INSERT INTO "public"."job_contact_methods" (
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

-- Keep the old API signature available during a database-first rollout.
CREATE OR REPLACE FUNCTION "public"."save_verified_identity_and_contact"(
    "input_provider" "public"."AuthIdentityProvider",
    "input_provider_subject" TEXT,
    "input_last_verified_at" TIMESTAMP(3),
    "input_contact_method" "public"."JobContactMethod",
    "input_contact_identifier" TEXT,
    "candidate_user_id" UUID,
    "candidate_identity_id" UUID,
    "candidate_contact_id" UUID
)
RETURNS UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT "userId" FROM "public"."save_verified_identity_and_contact"(
        "input_provider",
        "input_provider_subject",
        "input_contact_identifier",
        "input_last_verified_at",
        "input_contact_method",
        "input_contact_identifier",
        "candidate_user_id",
        "candidate_identity_id",
        "candidate_contact_id"
    );
$function$;
