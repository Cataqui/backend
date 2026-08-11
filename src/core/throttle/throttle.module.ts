import { Global, Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { UserRateLimitGuard } from "../guards/user-rate-limit.guard";
import { RedisModule } from "../redis/redis.module";
import { RedisService } from "../redis/redis.service";
import { RateLimitConstants } from "./rate-limit.constants";
import { RedisThrottlerStorage } from "./redis-throttler.storage";

@Global()
@Module({
	imports: [
		ThrottlerModule.forRootAsync({
			imports: [RedisModule],
			inject: [Reflector, RedisService],
			useFactory: (reflector: Reflector, redis: RedisService) => ({
				storage: new RedisThrottlerStorage(redis),
				throttlers: [
					{
						name: RateLimitConstants.THROTTLER_NAME,
						ttl: 0,
						limit: 0,
						skipIf: (context) =>
							reflector.getAllAndOverride<boolean>(RateLimitConstants.DECORATOR_METADATA_KEY, [
								context.getHandler(),
								context.getClass(),
							]) !== true,
					},
				],
			}),
		}),
	],
	providers: [UserRateLimitGuard],
	exports: [UserRateLimitGuard],
})
export class ThrottleModule {}
