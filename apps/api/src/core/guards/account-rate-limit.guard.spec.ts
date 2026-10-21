import * as td from "testdouble";
import type { ExecutionContext } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { type ThrottlerLimitDetail, ThrottlerModule } from "@nestjs/throttler";
import type { IAuthenticatedRequest } from "../../modules/authentication/interfaces/authenticated-request.interface";
import { RateLimitedError } from "../errors/rate-limited.error";
import { AccountRateLimitGuard } from "./account-rate-limit.guard";

afterEach(() => td.reset());

describe("AccountRateLimitGuard", () => {
	let guard: AccountRateLimitGuard;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 1 }])],
			providers: [AccountRateLimitGuard],
		}).compile();

		guard = module.get<AccountRateLimitGuard>(AccountRateLimitGuard);
	});

	it("should declare its own dependencies so Nest can resolve the guard in the native ESM application", () => {
		expect(Reflect.hasOwnMetadata("design:paramtypes", AccountRateLimitGuard)).toBe(true);
	});

	it("should use the authenticated account ID for every device session", async () => {
		const request = td.object<IAuthenticatedRequest>();
		request.authSession = {
			expiresAt: "2026-09-04T15:00:00.000Z",
			sessionId: "device-session-id",
			accountId: "account-id",
		};
		const tracker = await guard["getTracker"](request);

		expect(tracker).toBe("account-id");
	});

	it("should ignore the request IP when identifying the authenticated account", async () => {
		const request = Object.assign(td.object<IAuthenticatedRequest>(), { ip: "189.45.200.10" });
		request.authSession = {
			expiresAt: "2026-09-04T15:00:00.000Z",
			sessionId: "device-session-id",
			accountId: "account-id",
		};
		const tracker = await guard["getTracker"](request);

		expect(tracker).toBe("account-id");
	});

	it("should return the stable rate-limit error", () => {
		const detail = {
			limit: 20,
			ttl: 3_600_000,
			key: "request-key",
			tracker: "account-id",
			totalHits: 21,
			timeToExpire: 3_000,
			isBlocked: true,
			timeToBlockExpire: 3_000,
		} satisfies ThrottlerLimitDetail;

		expect(() => guard["throwThrottlingException"](td.object<ExecutionContext>(), detail)).toThrow(RateLimitedError);
	});
});
