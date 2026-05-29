import { registerAs } from "@nestjs/config";

export const DATABASE_CONFIG_KEY = "database";

export interface IDatabaseConfig {
	poolerUrl: string;
	directUrl: string;
}

export const databaseConfig = registerAs(
	DATABASE_CONFIG_KEY,
	(): IDatabaseConfig => ({
		poolerUrl: process.env["DATABASE_POOLER_URL"]!,
		directUrl: process.env["DATABASE_DIRECT_URL"]!,
	}),
);
