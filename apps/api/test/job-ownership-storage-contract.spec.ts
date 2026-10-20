import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("job ownership storage", () => {
	it("should relate jobs to the profile that created them", () => {
		const jobSchema = readFileSync(resolve(process.cwd(), "prisma/schema/job.prisma"), "utf8");

		expect(jobSchema).toMatch(
			/poster\s+Profile\?\s+@relation\(fields: \[posterProfileId\], references: \[id\], onDelete: SetNull\)/u,
		);
	});

	it("should index the job owner used by authenticated write queries", () => {
		const jobSchema = readFileSync(resolve(process.cwd(), "prisma/schema/job.prisma"), "utf8");

		expect(jobSchema).toContain("@@index([posterProfileId])");
	});

	it("should add the nullable job-owner foreign key in the v1 schema", () => {
		const migration = readFileSync(
			resolve(process.cwd(), "prisma/schema/migrations/00000000000000_init/migration.sql"),
			"utf8",
		);

		expect(migration).toContain(
			'ALTER TABLE "jobs" ADD CONSTRAINT "jobs_poster_profile_id_fkey" FOREIGN KEY ("poster_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;',
		);
	});
});
