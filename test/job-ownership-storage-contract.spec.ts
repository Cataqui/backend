import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("job ownership storage", () => {
	it("should relate jobs to the user that created them", () => {
		const jobSchema = readFileSync(resolve(process.cwd(), "prisma/schema/job.prisma"), "utf8");

		expect(jobSchema).toMatch(
			/poster\s+User\?\s+@relation\(fields: \[posterUserId\], references: \[id\], onDelete: SetNull\)/u,
		);
	});

	it("should index the job owner used by authenticated write queries", () => {
		const jobSchema = readFileSync(resolve(process.cwd(), "prisma/schema/job.prisma"), "utf8");

		expect(jobSchema).toContain("@@index([posterUserId])");
	});

	it("should add the nullable job-owner foreign key in the forward ownership migration", () => {
		const migration = readFileSync(
			resolve(process.cwd(), "prisma/schema/migrations/20260810170000_align_auth_and_job_ownership/migration.sql"),
			"utf8",
		);

		expect(migration).toContain(
			'ALTER TABLE "jobs" ADD CONSTRAINT "jobs_poster_user_id_fkey" FOREIGN KEY ("poster_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;',
		);
	});
});
