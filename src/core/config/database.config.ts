import { registerAs } from "@nestjs/config";

export interface IDatabaseConfig {
	appPoolerUrl: string;
	statementTimeoutMs: number;
	queryTimeoutMs: number;
	lockTimeoutMs: number;
	connectionTimeoutMs: number;
}

export const databaseConfig = registerAs(
	"database",
	(): IDatabaseConfig => ({
		appPoolerUrl: process.env["DATABASE_APP_POOLER_URL"]!,
		statementTimeoutMs: 5_000,
		queryTimeoutMs: 6_000,
		lockTimeoutMs: 1_000,
		connectionTimeoutMs: 10_000,
	}),
);
