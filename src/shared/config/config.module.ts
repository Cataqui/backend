import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { IEnvSchema } from "./env.validation";
import { DATABASE_CONFIG_KEY, databaseConfig } from "./database.config";
import { GLOBAL_THROTTLE_CONFIG_KEY, globalThrottleConfig } from "./throttle.config";
import { REQUEST_SIZE_CONFIG_KEY, requestSizeConfig } from "./request-size.config";

@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ".env",
			load: [globalThrottleConfig, requestSizeConfig],
			validate: (config: Record<string, unknown>) => {
				const result = IEnvSchema.safeParse(config);

				if (!result.success) {
					const errors = result.error.flatten().fieldErrors;
					throw new Error(`Environment validation failed: ${JSON.stringify(errors)}`);
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
	],
	exports: [DATABASE_CONFIG_KEY, GLOBAL_THROTTLE_CONFIG_KEY, REQUEST_SIZE_CONFIG_KEY],
})
export class ConfigModule {}
