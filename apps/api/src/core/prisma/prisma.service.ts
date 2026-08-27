import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../../generated/prisma/client.js";
import { type IDatabaseConfig, databaseConfig } from "../config/database.config";
import { getDevelopmentErrorLogFields, getSafeErrorTelemetryFields } from "../observability/safe-error-telemetry";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
	private readonly _logger = new Logger(PrismaService.name);

	constructor(@Inject(databaseConfig.KEY) private readonly _databaseConfig: IDatabaseConfig) {
		const adapter = new PrismaNeon({
			connectionString: _databaseConfig.appPoolerUrl,
			min: _databaseConfig.minimumPoolConnections,
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
			this._logger.log({
				event: ObservabilityEventConstants.API_DATABASE_CONNECTION_ESTABLISHED_EVENT,
				status: "READY",
			});
		} catch (error: unknown) {
			this._logger.warn({
				event: ObservabilityEventConstants.API_DATABASE_CONNECTION_FAILED_EVENT,
				outcome: "DEGRADED",
				...getSafeErrorTelemetryFields({ error: error }),
				...(process.env["NODE_ENV"] === "development" ? getDevelopmentErrorLogFields({ error: error }) : {}),
			});
		}
	}

	async onModuleDestroy(): Promise<void> {
		await this.$disconnect();
		this._logger.log({
			event: ObservabilityEventConstants.API_DATABASE_CONNECTION_CLOSED_EVENT,
			status: "STOPPED",
		});
	}
}
