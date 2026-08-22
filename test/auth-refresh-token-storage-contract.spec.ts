import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("authenticated refresh-token storage", () => {
	it("should keep one current hash and one nullable previous-token recovery window without a history model", () => {
		const schema = readFileSync(resolve(process.cwd(), "prisma/schema/auth-session.prisma"), "utf8");

		expect({
			hasCurrentHash: /refreshTokenHash\s+String\s+@unique/.test(schema),
			hasPreviousHash: /previousRefreshTokenHash\s+String\?/.test(schema),
			hasPreviousTokenValidUntil: /previousRefreshTokenValidUntil\s+DateTime\?/.test(schema),
			hasRollingExpiration: /refreshExpiresAt\s+DateTime/.test(schema),
			hasHistoryModel: schema.includes("model AuthRefreshToken"),
		}).toEqual({
			hasCurrentHash: true,
			hasPreviousHash: true,
			hasPreviousTokenValidUntil: true,
			hasRollingExpiration: true,
			hasHistoryModel: false,
		});
	});

	it("should migrate the historical session columns forward without creating a token-history table", () => {
		const migration = readFileSync(
			resolve(process.cwd(), "prisma/schema/migrations/20260810170000_align_auth_and_job_ownership/migration.sql"),
			"utf8",
		);

		expect({
			renamedSessionHash: migration.includes('RENAME COLUMN "token_hash" TO "refresh_token_hash"'),
			hasPreviousHash: migration.includes('"previous_refresh_token_hash" CHAR(64)'),
			hasPreviousTokenValidUntil: migration.includes('"previous_refresh_token_valid_until" TIMESTAMP(3)'),
			renamedUniqueSessionHash: migration.includes(
				'ALTER INDEX "auth_sessions_token_hash_key" RENAME TO "auth_sessions_refresh_token_hash_key"',
			),
			hasHistoryTable: migration.includes('CREATE TABLE "auth_refresh_tokens"'),
		}).toEqual({
			renamedSessionHash: true,
			hasPreviousHash: true,
			hasPreviousTokenValidUntil: true,
			renamedUniqueSessionHash: true,
			hasHistoryTable: false,
		});
	});
});
