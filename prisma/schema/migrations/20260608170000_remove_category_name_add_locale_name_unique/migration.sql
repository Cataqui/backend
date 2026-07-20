-- Drop the unique index on name from job_categories
DROP INDEX IF EXISTS "job_categories_name_key";

-- Drop the name column from job_categories
ALTER TABLE "job_categories" DROP COLUMN "name";

-- Create unique index on (locale, name) for job_category_translations
CREATE UNIQUE INDEX "job_category_translations_locale_name_key" ON "job_category_translations"("locale", "name");
