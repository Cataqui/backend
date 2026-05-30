import { registerAs } from "@nestjs/config";

export const DATABASE_CONFIG_KEY = "database";

export interface IDatabaseConfig {
	poolerUrl: string;
	directUrl: string;
	statementTimeoutMs: number;
	queryTimeoutMs: number;
	lockTimeoutMs: number;
	connectionTimeoutMs: number;
}

export const databaseConfig = registerAs(
	DATABASE_CONFIG_KEY,
	(): IDatabaseConfig => ({
		poolerUrl: process.env["DATABASE_POOLER_URL"]!,
		directUrl: process.env["DATABASE_DIRECT_URL"]!,
		statementTimeoutMs: 5_000,
		queryTimeoutMs: 6_000,
		lockTimeoutMs: 1_000,
		connectionTimeoutMs: 10_000,
	}),
);
