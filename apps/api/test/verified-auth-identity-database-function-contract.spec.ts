import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationSource = readFileSync(
	join(process.cwd(), "prisma/schema/migrations/20260810170000_save_verified_identity_and_contact/migration.sql"),
	"utf8",
);

describe("verified auth identity database function contract", () => {
	it("should execute with the application role and an empty search path", () => {
		expect(migrationSource).toContain('CREATE FUNCTION "public"."save_verified_identity_and_contact"');
		expect(migrationSource).toContain("SECURITY INVOKER");
		expect(migrationSource).toContain("SET search_path = ''");
		expect(migrationSource).not.toContain("SECURITY DEFINER");
	});

	it("should roll back a losing candidate user before reusing the concurrent identity winner", () => {
		const concurrencyRecoverySource = migrationSource.slice(migrationSource.indexOf("EXCEPTION"));

		expect(migrationSource).toMatch(
			/BEGIN[\s\S]*INSERT INTO "public"\."users"[\s\S]*INSERT INTO "public"\."auth_identities"[\s\S]*EXCEPTION\s+WHEN unique_violation THEN/,
		);
		expect(concurrencyRecoverySource).toContain('UPDATE "public"."auth_identities"');
		expect(concurrencyRecoverySource).toMatch(/IF "resolved_user_id" IS NULL THEN\s+RAISE;/);
	});

	it("should save the reusable contact idempotently before returning the resolved user", () => {
		expect(migrationSource).toContain('INSERT INTO "public"."job_contact_methods"');
		expect(migrationSource).toContain('ON CONFLICT ("user_id", "contact_method", "identifier") DO NOTHING;');
		expect(migrationSource).toMatch(/INSERT INTO "public"\."job_contact_methods"[\s\S]*RETURN "resolved_user_id";/);
	});
});
