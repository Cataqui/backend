import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../../generated/prisma/client.js";
import type { IDatabaseConfig } from "../config/database.config";
import { DATABASE_CONFIG_KEY } from "../config/database.config";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
	private readonly _logger = new Logger(PrismaService.name);

	constructor(@Inject(DATABASE_CONFIG_KEY) private readonly _databaseConfig: IDatabaseConfig) {
		const adapter = new PrismaNeon({
			connectionString: _databaseConfig.appPoolerUrl,
			statement_timeout: _databaseConfig.statementTimeoutMs,
			query_timeout: _databaseConfig.queryTimeoutMs,
			lock_timeout: _databaseConfig.lockTimeoutMs,
			connectionTimeoutMillis: _databaseConfig.connectionTimeoutMs,
		});

		super({ adapter });
	}

	async onModuleInit(): Promise<void> {
		try {
			await this.$connect();

			// This pre-warms the Neon compute on container start, preventing cold-start penalties on the first request.
			await this.$queryRaw`SELECT 1`;
			this._logger.log("Database connected");
		} catch (error) {
			this._logger.warn("Database connection failed — app will run without DB");
			this._logger.debug(`Connection error: ${(error as Error).message}`);
		}
	}

	async onModuleDestroy(): Promise<void> {
		await this.$disconnect();
		this._logger.log("Database disconnected");
	}
}
