import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Prisma migration history", () => {
	it("should preserve the checksums of migrations already applied to shared databases", () => {
		const appliedMigrationChecksums = {
			"00000000000000_init": "3994a6e7f7c49f6689ff4c501fe7444f206b88fac05d22e6b0acba35ad39654e",
			"20260805130000_remove_map_versions": "ed8aba661f8112cee3afbca683aaa6b23052b48c506e7f0d98cf5816aa919625",
			"20260805180000_add_native_auth": "fc13e62d96885c63f02e5836b2dca6f843d570284e0d523ce4c0f0793bf54a34",
			"20260806124135": "1ad0b0d6a1b0e0a71c539b9753408a92e73c9f49a5a72db2e5e1e8409f56fe85",
			"20260810170000_align_auth_and_job_ownership": "e2d95cae1441f8b3986d5f61af031ab9d73330d92637b8facd3e100402480317",
			"20260810170000_save_verified_identity_and_contact":
				"3647a8e48ec446da6c615ed23ebdb84ebca6b92d875a41b691f07cc49893af1b",
			"20260810190000_save_verified_identity_contact_and_session":
				"a5aba8272a13dd32b11e16c9cf6168b7ee69165b4648c7286fe55c24d726f976",
			"20260822120000_remove_job_location_labels": "9dfd1b41c128175dfc128675a9e74ba319cfb8f471a088ce97c0a7a61b48e834",
		};

		const actualMigrationChecksums = Object.fromEntries(
			Object.keys(appliedMigrationChecksums).map((migrationName) => {
				const migrationSql = readFileSync(
					resolve(process.cwd(), "prisma/schema/migrations", migrationName, "migration.sql"),
				);

				return [migrationName, createHash("sha256").update(migrationSql).digest("hex")];
			}),
		);

		expect(actualMigrationChecksums).toEqual(appliedMigrationChecksums);
	});
});
