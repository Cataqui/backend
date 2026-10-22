import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("profile storage", () => {
	it("preserves the v1 baseline without authentication tables", () => {
		const migration = readFileSync(
			resolve(process.cwd(), "prisma/schema/migrations/00000000000000_init/migration.sql"),
			"utf8",
		);
		expect({
			hasProfiles: migration.includes('CREATE TABLE "profiles"'),
			hasAuthenticationTables: /auth_(identities|sessions)|CREATE TABLE "users"/u.test(migration),
			profileIdIsAssigned: !/"id" UUID NOT NULL DEFAULT/u.test(migration),
		}).toEqual({
			hasProfiles: true,
			hasAuthenticationTables: false,
			profileIdIsAssigned: true,
		});
	});
	it("keeps immutable contacts private to a profile and reusable by jobs", () => {
		const schema = readFileSync(resolve(process.cwd(), "prisma/schema/contact.prisma"), "utf8");
		expect({
			ownership:
				/ownerProfile\s+Profile\?\s+@relation\(fields: \[ownerProfileId\], references: \[id\], onDelete: Cascade\)/u.test(
					schema,
				),
			reusable: /jobs\s+Job\[\]/u.test(schema),
			identity: schema.includes("@@unique([ownerProfileId, contactMethod, identifier])"),
			mutable: schema.includes("updatedAt"),
		}).toEqual({ ownership: true, reusable: true, identity: true, mutable: false });
	});
	it("persists the creation fingerprint independently from mutable profile data", () => {
		const schema = readFileSync(resolve(process.cwd(), "prisma/schema/profile.prisma"), "utf8");
		expect({
			idAssigned: /id\s+String\s+@id\s+@db.Uuid/u.test(schema),
			creationHash: /creationHash\s+String\s+@map\("creation_hash"\)\s+@db.Char\(64\)/u.test(schema),
			name: /name\s+String\s+@db.VarChar\(320\)/u.test(schema),
		}).toEqual({ idAssigned: true, creationHash: true, name: true });
	});
});
