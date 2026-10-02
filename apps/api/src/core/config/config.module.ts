import path from "node:path";
import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { databaseConfig } from "./database.config";
import { EnvSchema } from "./env.schema";
import { requestSizeConfig } from "./request-size.config";
import { upstashRedisConfig } from "./upstash-redis.config";

@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			isGlobal: true,
			envFilePath: path.resolve(process.cwd(), "../../.env"),
			load: [requestSizeConfig, upstashRedisConfig],
			validationSchema: EnvSchema,
		}),
	],
	providers: [
		{
			provide: databaseConfig.KEY,
			useFactory: databaseConfig,
		},
		{
			provide: requestSizeConfig.KEY,
			useFactory: requestSizeConfig,
		},
		{
			provide: upstashRedisConfig.KEY,
			useFactory: upstashRedisConfig,
		},
	],
	exports: [databaseConfig.KEY, requestSizeConfig.KEY, upstashRedisConfig.KEY],
})
export class ConfigModule {}
