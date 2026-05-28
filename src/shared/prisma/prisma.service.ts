import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { PrismaClient } from "../../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
	private readonly _logger = new Logger(PrismaService.name);

	constructor(configService: ConfigService) {
		const pool = new pg.Pool({
			connectionString: configService.getOrThrow<string>("DATABASE_URL"),
		});

		const adapter = new PrismaPg(pool);
		super({ adapter });
	}

	async onModuleInit(): Promise<void> {
		try {
			await this.$connect();
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
