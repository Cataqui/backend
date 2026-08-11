import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("job-contact storage", () => {
	it("should let one user own multiple immutable contacts shared by jobs", () => {
		const schema = readFileSync(resolve(process.cwd(), "prisma/schema/job-contact.prisma"), "utf8");

		expect({
			hasUserRelation: schema.includes(
				"user          User?            @relation(fields: [userId], references: [id], onDelete: Cascade)",
			),
			hasJobCollection: schema.includes("jobs          Job[]"),
			deduplicatesOnlyMatchingContacts: schema.includes("@@unique([userId, contactMethod, identifier])"),
			hasMutableTimestamp: schema.includes("updatedAt"),
		}).toEqual({
			hasUserRelation: true,
			hasJobCollection: true,
			deduplicatesOnlyMatchingContacts: true,
			hasMutableTimestamp: false,
		});
	});

	it("should migrate existing jobs to reference reusable contacts", () => {
		const migration = readFileSync(
			resolve(process.cwd(), "prisma/schema/migrations/20260805180000_add_native_auth/migration.sql"),
			"utf8",
		);

		expect({
			copiesExistingContactIds: migration.includes('SET "contact_id" = "job_contact_methods"."id"'),
			removesPerJobOwnership: migration.includes('DROP COLUMN "job_id"'),
			addsUserOwnership: migration.includes('ADD COLUMN "user_id" UUID'),
			addsJobReference: migration.includes('ADD CONSTRAINT "jobs_contact_id_fkey"'),
			hasDuplicateContactTable: migration.includes('CREATE TABLE "user_job_contacts"'),
		}).toEqual({
			copiesExistingContactIds: true,
			removesPerJobOwnership: true,
			addsUserOwnership: true,
			addsJobReference: true,
			hasDuplicateContactTable: false,
		});
	});
});
