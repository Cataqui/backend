CREATE FUNCTION "public"."save_verified_identity_contact_and_session"(
    "input_provider" "public"."AuthIdentityProvider",
    "input_provider_subject" TEXT,
    "input_last_verified_at" TIMESTAMP(3),
    "input_contact_method" "public"."JobContactMethod",
    "input_contact_identifier" TEXT,
    "input_session_id" UUID,
    "input_refresh_token_hash" CHAR(64),
    "input_refresh_expires_at" TIMESTAMP(3),
    "candidate_user_id" UUID,
    "candidate_identity_id" UUID,
    "candidate_contact_id" UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    "resolved_user_id" UUID;
    "existing_session_user_id" UUID;
BEGIN
    UPDATE "public"."auth_identities"
    SET
        "last_verified_at" = "input_last_verified_at",
        "updated_at" = "input_last_verified_at"
    WHERE "provider" = "input_provider"
        AND "provider_subject" = "input_provider_subject"
    RETURNING "user_id" INTO "resolved_user_id";

    IF "resolved_user_id" IS NULL THEN
        BEGIN
            INSERT INTO "public"."users" ("id", "updated_at")
            VALUES ("candidate_user_id", "input_last_verified_at");

            INSERT INTO "public"."auth_identities" (
                "id",
                "user_id",
                "provider",
                "provider_subject",
                "last_verified_at",
                "updated_at"
            )
            VALUES (
                "candidate_identity_id",
                "candidate_user_id",
                "input_provider",
                "input_provider_subject",
                "input_last_verified_at",
                "input_last_verified_at"
            );

            "resolved_user_id" := "candidate_user_id";
        EXCEPTION
            WHEN unique_violation THEN
                UPDATE "public"."auth_identities"
                SET
                    "last_verified_at" = "input_last_verified_at",
                    "updated_at" = "input_last_verified_at"
                WHERE "provider" = "input_provider"
                    AND "provider_subject" = "input_provider_subject"
                RETURNING "user_id" INTO "resolved_user_id";

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

    INSERT INTO "public"."auth_sessions" (
        "id",
        "user_id",
        "refresh_token_hash",
        "previous_refresh_token_hash",
        "previous_refresh_token_valid_until",
        "refresh_expires_at",
        "last_used_at",
        "updated_at"
    )
    VALUES (
        "input_session_id",
        "resolved_user_id",
        "input_refresh_token_hash",
        NULL,
        NULL,
        "input_refresh_expires_at",
        "input_last_verified_at",
        "input_last_verified_at"
    )
    ON CONFLICT ("id") DO NOTHING;

    IF NOT FOUND THEN
        SELECT "user_id"
        INTO "existing_session_user_id"
        FROM "public"."auth_sessions"
        WHERE "id" = "input_session_id";

        IF "existing_session_user_id" IS DISTINCT FROM "resolved_user_id" THEN
            RAISE EXCEPTION 'Candidate authentication session belongs to another user'
                USING ERRCODE = '23505';
        END IF;
    END IF;

    RETURN "resolved_user_id";
END;
$function$;
