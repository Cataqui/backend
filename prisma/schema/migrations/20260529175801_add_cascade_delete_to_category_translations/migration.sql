-- DropForeignKey
ALTER TABLE "job_category_translations" DROP CONSTRAINT "job_category_translations_category_id_fkey";

-- AddForeignKey
ALTER TABLE "job_category_translations" ADD CONSTRAINT "job_category_translations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "job_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
