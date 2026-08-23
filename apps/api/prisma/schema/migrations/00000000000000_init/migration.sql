-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('INDIVIDUAL', 'EMPLOYMENT', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "JobPaymentAmountPeriod" AS ENUM ('SINGLE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "JobPaymentType" AS ENUM ('FIXED', 'RANGE', 'FLEXIBLE', 'OTHER');

-- CreateEnum
CREATE TYPE "JobContactMethod" AS ENUM ('WHATSAPP', 'PHONE_CALL');

-- CreateTable
CREATE TABLE "job_contact_methods" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "contact_method" "JobContactMethod" NOT NULL,
    "identifier" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_contact_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT NOT NULL,
    "description_summary" TEXT,
    "street" VARCHAR(200),
    "neighborhood" VARCHAR(100),
    "city" VARCHAR(100),
    "state" VARCHAR(2),
    "country" VARCHAR(2),
    "location_point" geometry(Point,4326),
    "fuzzy_latitude" DECIMAL(9,6),
    "fuzzy_longitude" DECIMAL(9,6),
    "status" "JobStatus" NOT NULL,
    "type" "JobType",
    "payment_type" "JobPaymentType",
    "payment_min_amount" DECIMAL(10,2),
    "payment_max_amount" DECIMAL(10,2),
    "payment_note" TEXT,
    "payment_amount_period" "JobPaymentAmountPeriod",
    "payment_currency" VARCHAR(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_contact_methods_job_id_idx" ON "job_contact_methods"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_contact_methods_job_id_key" ON "job_contact_methods"("job_id");

-- CreateIndex
CREATE INDEX "jobs_city_state_country_idx" ON "jobs"("city", "state", "country");

-- CreateIndex
CREATE INDEX "jobs_status_created_at_id_idx" ON "jobs"("status", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "job_contact_methods" ADD CONSTRAINT "job_contact_methods_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
