import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AccessTokenGuard } from "../../modules/auth/guards/access-token.guard";
import { UserRateLimitGuard } from "../guards/user-rate-limit.guard";
import { getRateLimitPeriodMilliseconds, type RateLimitPeriod } from "./rate-limit-period";
import { RateLimitConstants } from "./rate-limit.constants";

export function RateLimit(params: { requests: number; per: RateLimitPeriod }): MethodDecorator & ClassDecorator {
	return applyDecorators(
		UseGuards(AccessTokenGuard, UserRateLimitGuard),
		ApiBearerAuth(),
		SetMetadata(RateLimitConstants.DECORATOR_METADATA_KEY, true),
		Throttle({
			[RateLimitConstants.THROTTLER_NAME]: {
				limit: params.requests,
				ttl: getRateLimitPeriodMilliseconds({ period: params.per }),
			},
		}),
	);
}
