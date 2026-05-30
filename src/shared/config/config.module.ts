import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { IEnvSchema } from "./env.validation";
import { DATABASE_CONFIG_KEY, databaseConfig } from "./database.config";
import { THROTTLE_CONFIG_KEY, throttleConfig } from "./throttle.config";

@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ".env",
			load: [throttleConfig],
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
			provide: THROTTLE_CONFIG_KEY,
			useFactory: throttleConfig,
		},
	],
	exports: [DATABASE_CONFIG_KEY, THROTTLE_CONFIG_KEY],
})
export class ConfigModule {}
