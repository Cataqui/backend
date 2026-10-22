CREATE TABLE "account_metadata" (
    "account_id" UUID NOT NULL,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "account_metadata_pkey" PRIMARY KEY ("account_id")
);
