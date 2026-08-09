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

	it("should create no transitional refresh-token history table in the unlaunched auth migration", () => {
		const migration = readFileSync(
			resolve(process.cwd(), "prisma/schema/migrations/20260805180000_add_native_auth/migration.sql"),
			"utf8",
		);

		expect({
			hasSessionHash: migration.includes('"refresh_token_hash" CHAR(64) NOT NULL'),
			hasPreviousHash: migration.includes('"previous_refresh_token_hash" CHAR(64)'),
			hasPreviousTokenValidUntil: migration.includes('"previous_refresh_token_valid_until" TIMESTAMP(3)'),
			hasUniqueSessionHash: migration.includes('CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key"'),
			hasHistoryTable: migration.includes('CREATE TABLE "auth_refresh_tokens"'),
		}).toEqual({
			hasSessionHash: true,
			hasPreviousHash: true,
			hasPreviousTokenValidUntil: true,
			hasUniqueSessionHash: true,
			hasHistoryTable: false,
		});
	});
});
