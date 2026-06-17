import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { GLOBAL_THROTTLE_CONFIG_KEY, type IGlobalThrottleConfig } from "../config/throttle.config";
import { CustomThrottlerGuard } from "../guards/throttler.guard";

@Module({
	imports: [
		ThrottlerModule.forRootAsync({
			inject: [GLOBAL_THROTTLE_CONFIG_KEY],
			useFactory: (config: IGlobalThrottleConfig) => [
				{
					name: "default",
					ttl: config.ttl,
					limit: config.limit,
				},
			],
		}),
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: CustomThrottlerGuard,
		},
	],
})
export class ThrottleModule {}
