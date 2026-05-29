import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { IEnvSchema } from "./env.validation";
import { DATABASE_CONFIG_KEY, databaseConfig } from "./database.config";

@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ".env",
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
	],
	exports: [DATABASE_CONFIG_KEY],
})
export class ConfigModule {}
