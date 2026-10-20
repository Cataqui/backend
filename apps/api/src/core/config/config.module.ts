import path from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { databaseConfig } from "./database.config";
import { EnvSchema } from "./env.schema";
import { requestSizeConfig } from "./request-size.config";
import { runtimeConfig } from "./runtime.config";
import { upstashRedisConfig } from "./upstash-redis.config";

@Module({
	imports: [
		NestConfigModule.forRoot({
			isGlobal: true,
			envFilePath: path.resolve(process.cwd(), ".env"),
			load: [runtimeConfig, databaseConfig, requestSizeConfig, upstashRedisConfig],
			validationSchema: EnvSchema,
		}),
	],
	exports: [NestConfigModule],
})
export class ConfigModule {}
