-- Prelaunch jobs belong to the retired map flow and cannot satisfy the new API
-- image contract. Their posting requests cascade; accounts and contacts remain.
DELETE FROM "public"."jobs" WHERE "location_image_url" IS NULL;
