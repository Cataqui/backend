import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { DATABASE_CONFIG_KEY, databaseConfig } from "./database.config";
import { IEnvSchema } from "./env.validation";
import { REQUEST_SIZE_CONFIG_KEY, requestSizeConfig } from "./request-size.config";
import { GLOBAL_THROTTLE_CONFIG_KEY, globalThrottleConfig } from "./throttle.config";
import { UPSTASH_REDIS_CONFIG_KEY, upstashRedisConfig } from "./upstash-redis.config";

@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ".env",
			load: [globalThrottleConfig, requestSizeConfig, upstashRedisConfig],
			validate: (config: Record<string, unknown>) => {
				const result = IEnvSchema.safeParse(config);

				if (!result.success) {
					const details = result.error.issues
						.map((issue) => `  - ${issue.path.join(".")}: ${issue.message} (code: ${issue.code})`)
						.join("\n");
					throw new Error(`Environment validation failed:\n${details}`);
				}

				return result.data;
			},
		}),
	],
	providers: [
		{
			provide: DATABASE_CONFIG_KEY,
			useFactory: databaseConfig,
		},
		{
			provide: GLOBAL_THROTTLE_CONFIG_KEY,
			useFactory: globalThrottleConfig,
		},
		{
			provide: REQUEST_SIZE_CONFIG_KEY,
			useFactory: requestSizeConfig,
		},
		{
			provide: UPSTASH_REDIS_CONFIG_KEY,
			useFactory: upstashRedisConfig,
		},
	],
	exports: [DATABASE_CONFIG_KEY, GLOBAL_THROTTLE_CONFIG_KEY, REQUEST_SIZE_CONFIG_KEY, UPSTASH_REDIS_CONFIG_KEY],
})
export class ConfigModule {}
