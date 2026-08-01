ALTER TYPE "JobStatus" ADD VALUE 'DRAFT' BEFORE 'ACTIVE';

ALTER TABLE "jobs"
    ALTER COLUMN "title" DROP NOT NULL,
    ALTER COLUMN "description_summary" DROP NOT NULL,
    ALTER COLUMN "neighborhood" DROP NOT NULL,
    ALTER COLUMN "city" DROP NOT NULL,
    ALTER COLUMN "state" DROP NOT NULL,
    ALTER COLUMN "country" DROP NOT NULL,
    ALTER COLUMN "fuzzy_latitude" DROP NOT NULL,
    ALTER COLUMN "fuzzy_longitude" DROP NOT NULL,
    ALTER COLUMN "type" DROP NOT NULL,
    ALTER COLUMN "payment_type" DROP NOT NULL,
    ALTER COLUMN "payment_amount_period" DROP NOT NULL,
    ALTER COLUMN "payment_currency" DROP NOT NULL,
    ALTER COLUMN "category_id" DROP NOT NULL;
