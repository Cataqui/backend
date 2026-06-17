import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { AI_CONFIG_KEY, aiConfig } from "../ai/ai.config";
import { DATABASE_CONFIG_KEY, databaseConfig } from "./database.config";
import { IEnvSchema } from "./env.validation";
import { MAP_AUTH_CONFIG_KEY, mapAuthConfig } from "./map-auth.config";
import { REQUEST_SIZE_CONFIG_KEY, requestSizeConfig } from "./request-size.config";
import { GLOBAL_THROTTLE_CONFIG_KEY, globalThrottleConfig } from "./throttle.config";

@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ".env",
			load: [globalThrottleConfig, requestSizeConfig, mapAuthConfig],
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
			provide: MAP_AUTH_CONFIG_KEY,
			useFactory: mapAuthConfig,
		},
		{
			provide: AI_CONFIG_KEY,
			useFactory: aiConfig,
		},
	],
	exports: [
		DATABASE_CONFIG_KEY,
		GLOBAL_THROTTLE_CONFIG_KEY,
		REQUEST_SIZE_CONFIG_KEY,
		MAP_AUTH_CONFIG_KEY,
		AI_CONFIG_KEY,
	],
})
export class ConfigModule {}
