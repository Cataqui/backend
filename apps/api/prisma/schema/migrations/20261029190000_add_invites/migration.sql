BEGIN;

CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "referrer_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_uses" INTEGER,
    CONSTRAINT "invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invites_code_check" CHECK ("code" ~ '^[A-Z0-9-]{1,64}$'),
    CONSTRAINT "invites_max_uses_check" CHECK ("max_uses" IS NULL OR "max_uses" > 0)
);

CREATE UNIQUE INDEX "invites_code_key" ON "invites"("code");
ALTER TABLE "accounts" ALTER COLUMN "admission" SET DEFAULT 'NOT_REQUESTED';
ALTER TABLE "accounts" ADD COLUMN "from_invite_id" UUID;
CREATE INDEX "accounts_from_invite_id_idx" ON "accounts"("from_invite_id");
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_from_invite_id_fkey"
    FOREIGN KEY ("from_invite_id") REFERENCES "invites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
