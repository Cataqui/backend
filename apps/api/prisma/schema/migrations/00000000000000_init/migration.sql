-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('WHATSAPP', 'PHONE_CALL');

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "owner_profile_id" UUID,
    "contact_method" "ContactMethod" NOT NULL,
    "identifier" VARCHAR(320) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "poster_profile_id" UUID,
    "contact_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "description_summary" TEXT NOT NULL,
    "location_point" geometry(Point,4326),
    "location_title" TEXT NOT NULL,
    "fuzzy_latitude" DECIMAL(9,6) NOT NULL,
    "fuzzy_longitude" DECIMAL(9,6) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "payment" TEXT,
    "location_image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_post_requests" (
    "id" UUID NOT NULL,
    "poster_profile_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "fuzzy_latitude" DECIMAL(9,6) NOT NULL,
    "fuzzy_longitude" DECIMAL(9,6) NOT NULL,
    "job_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_post_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(320) NOT NULL,
    "creation_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_owner_profile_id_idx" ON "contacts"("owner_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_owner_profile_id_contact_method_identifier_key" ON "contacts"("owner_profile_id", "contact_method", "identifier");

-- CreateIndex
CREATE INDEX "jobs_contact_id_idx" ON "jobs"("contact_id");

-- CreateIndex
CREATE INDEX "jobs_poster_profile_id_idx" ON "jobs"("poster_profile_id");

-- CreateIndex
CREATE INDEX "jobs_poster_profile_id_created_at_id_idx" ON "jobs"("poster_profile_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "jobs_status_created_at_id_idx" ON "jobs"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "job_post_requests_job_id_key" ON "job_post_requests"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_post_requests_poster_profile_id_idempotency_key_key" ON "job_post_requests"("poster_profile_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_poster_profile_id_fkey" FOREIGN KEY ("poster_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_requests" ADD CONSTRAINT "job_post_requests_poster_profile_id_fkey" FOREIGN KEY ("poster_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_requests" ADD CONSTRAINT "job_post_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
