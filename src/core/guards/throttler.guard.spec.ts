import { Test, type TestingModule } from "@nestjs/testing";
import { ExecutionContext } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import type { ThrottlerLimitDetail } from "@nestjs/throttler/dist/throttler.guard.interface";
import { CustomThrottlerGuard } from "./throttler.guard";
import { RateLimitedError } from "../errors/rate-limited.error";

describe("CustomThrottlerGuard", () => {
	let guard: CustomThrottlerGuard;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [
				ThrottlerModule.forRoot([
					{
						name: "default",
						ttl: 300_000,
						limit: 1_000,
					},
				]),
			],
			providers: [
				CustomThrottlerGuard,
				{
					provide: APP_GUARD,
					useClass: CustomThrottlerGuard,
				},
			],
		}).compile();

		guard = module.get<CustomThrottlerGuard>(CustomThrottlerGuard);
	});

	describe("getTracker", () => {
		it("should return CF-Connecting-IP when present", async () => {
			const req = {
				headers: { "cf-connecting-ip": "189.45.200.10" },
				ip: "131.0.1.1",
			};

			const tracker = await guard["getTracker"](req);

			expect(tracker).toBe("189.45.200.10");
		});

		it("should fall back to req.ip when CF-Connecting-IP is absent", async () => {
			const req = {
				headers: {},
				ip: "131.0.1.1",
			};

			const tracker = await guard["getTracker"](req);

			expect(tracker).toBe("131.0.1.1");
		});
	});

	describe("throwThrottlingException", () => {
		it("should throw RateLimitedError", () => {
			const mockContext = {} as ExecutionContext;
			const mockDetail = {
				limit: 1_000,
				ttl: 300_000,
				key: "test-key",
				tracker: "127.0.0.1",
				totalHits: 1_001,
				timeToExpire: 250_000,
				isBlocked: true,
				timeToBlockExpire: 250_000,
			} as ThrottlerLimitDetail;

			expect(() => guard["throwThrottlingException"](mockContext, mockDetail)).toThrow(RateLimitedError);
		});
	});
});
