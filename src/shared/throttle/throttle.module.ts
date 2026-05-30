import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { CustomThrottlerGuard } from "../guards/throttler.guard";
import { THROTTLE_CONFIG_KEY, type IThrottleConfig } from "../config/throttle.config";

@Module({
	imports: [
		ThrottlerModule.forRootAsync({
			inject: [THROTTLE_CONFIG_KEY],
			useFactory: (config: IThrottleConfig) => [
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
