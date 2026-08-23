import type { ExecutionContext } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import type { ThrottlerLimitDetail } from "@nestjs/throttler/dist/throttler.guard.interface";
import { RateLimitedError } from "../errors/rate-limited.error";
import { UserRateLimitGuard } from "./user-rate-limit.guard";

describe("UserRateLimitGuard", () => {
	let guard: UserRateLimitGuard;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 1 }])],
			providers: [UserRateLimitGuard],
		}).compile();

		guard = module.get<UserRateLimitGuard>(UserRateLimitGuard);
	});

	it("should declare its own dependencies so Nest can resolve the guard in the native ESM application", () => {
		expect(Reflect.hasOwnMetadata("design:paramtypes", UserRateLimitGuard)).toBe(true);
	});

	it("should use the authenticated user ID for every device session", async () => {
		const tracker = await guard["getTracker"]({
			authSession: {
				expiresAt: new Date("2026-09-04T15:00:00.000Z"),
				sessionId: "device-session-id",
				userId: "user-id",
			},
		});

		expect(tracker).toBe("user-id");
	});

	it("should ignore the request IP when identifying the authenticated user", async () => {
		const tracker = await guard["getTracker"]({
			ip: "189.45.200.10",
			authSession: {
				expiresAt: new Date("2026-09-04T15:00:00.000Z"),
				sessionId: "device-session-id",
				userId: "user-id",
			},
		});

		expect(tracker).toBe("user-id");
	});

	it("should reject a request whose authentication guard has not attached a session", async () => {
		await expect(guard["getTracker"]({ ip: "189.45.200.10" })).rejects.toThrow(
			"UserRateLimitGuard must run after an auth session has been attached",
		);
	});

	it("should return the stable rate-limit error", () => {
		const detail = {
			limit: 20,
			ttl: 3_600_000,
			key: "request-key",
			tracker: "user-id",
			totalHits: 21,
			timeToExpire: 3_000,
			isBlocked: true,
			timeToBlockExpire: 3_000,
		} as ThrottlerLimitDetail;

		expect(() => guard["throwThrottlingException"]({} as ExecutionContext, detail)).toThrow(RateLimitedError);
	});
});
