import { GUARDS_METADATA } from "@nestjs/common/constants";
import { THROTTLER_LIMIT, THROTTLER_TTL } from "@nestjs/throttler/dist/throttler.constants";
import { AccessTokenGuard } from "../../modules/auth/guards/access-token.guard";
import { UserRateLimitGuard } from "../guards/user-rate-limit.guard";
import { RateLimit } from "./rate-limit.decorator";
import { RateLimitConstants } from "./rate-limit.constants";

class RateLimitTestController {
	@RateLimit({ requests: 20, per: "hour" })
	limited(): void {}
}

describe("rate-limit decorators", () => {
	it.each([
		["minute", 60_000],
		["five-minute", 300_000],
		["hour", 3_600_000],
		["day", 86_400_000],
	] as const)("should convert the %s period into milliseconds", (period, expectedMilliseconds) => {
		class PeriodController {
			@RateLimit({ requests: 1, per: period })
			limited(): void {}
		}

		expect(
			Reflect.getMetadata(`${THROTTLER_TTL}${RateLimitConstants.THROTTLER_NAME}`, PeriodController.prototype.limited),
		).toBe(expectedMilliseconds);
	});

	it("should store the request limit under the Redis throttler", () => {
		expect(
			Reflect.getMetadata(
				`${THROTTLER_LIMIT}${RateLimitConstants.THROTTLER_NAME}`,
				RateLimitTestController.prototype.limited,
			),
		).toBe(20);
	});

	it("should mark the endpoint for focused rate-limit enforcement", () => {
		expect(
			Reflect.getMetadata(RateLimitConstants.DECORATOR_METADATA_KEY, RateLimitTestController.prototype.limited),
		).toBe(true);
	});

	it("should authenticate the user before enforcing the rate limit", () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, RateLimitTestController.prototype.limited)).toEqual([
			AccessTokenGuard,
			UserRateLimitGuard,
		]);
	});
});
