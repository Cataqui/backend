import type { ExecutionContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AuthSessionService } from "../auth-session.service";
import { AccessTokenRequiredError } from "../errors/access-token-required.error";
import { AccessTokenGuard } from "./access-token.guard";

function buildContext(params: { authorization?: string }): {
	context: ExecutionContext;
	request: Record<string, unknown>;
} {
	const request: { headers: { authorization?: string }; authSession?: unknown } = { headers: {} };
	if (params.authorization !== undefined) request.headers.authorization = params.authorization;

	return {
		request: request,
		context: {
			switchToHttp: () => ({ getRequest: () => request }),
		} as unknown as ExecutionContext,
	};
}

describe("AccessTokenGuard", () => {
	let guard: AccessTokenGuard;
	let service: { getActiveSessionFromAccessTokenOrNull: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		service = { getActiveSessionFromAccessTokenOrNull: vi.fn() };
		const module = await Test.createTestingModule({
			providers: [AccessTokenGuard, { provide: AuthSessionService, useValue: service }],
		}).compile();
		guard = module.get(AccessTokenGuard);
	});

	it("should reject a request without an Authorization header", async () => {
		await expect(guard.canActivate(buildContext({}).context)).rejects.toThrow(AccessTokenRequiredError);
	});

	it("should reject a malformed bearer header", async () => {
		await expect(guard.canActivate(buildContext({ authorization: "Basic credentials" }).context)).rejects.toThrow(
			AccessTokenRequiredError,
		);
	});

	it("should reject a bearer credential that is not a 256-bit base64url token", async () => {
		await expect(guard.canActivate(buildContext({ authorization: "Bearer invalid-token" }).context)).rejects.toThrow(
			AccessTokenRequiredError,
		);
	});

	it("should reject a bearer token that has no active session", async () => {
		service.getActiveSessionFromAccessTokenOrNull.mockResolvedValue(null);

		await expect(
			guard.canActivate(buildContext({ authorization: `Bearer ${"a".repeat(43)}` }).context),
		).rejects.toThrow(AccessTokenRequiredError);
	});

	it("should authenticate a case-insensitive Bearer scheme", async () => {
		service.getActiveSessionFromAccessTokenOrNull.mockResolvedValue({
			sessionId: "session-id",
			userId: "user-id",
			expiresAt: new Date("2026-09-04T15:00:00.000Z"),
		});

		await guard.canActivate(buildContext({ authorization: `bearer ${"a".repeat(43)}` }).context);

		expect(service.getActiveSessionFromAccessTokenOrNull).toHaveBeenCalledWith({ accessToken: "a".repeat(43) });
	});

	it("should attach the authenticated session to the request", async () => {
		const session = { sessionId: "session-id", userId: "user-id", expiresAt: new Date("2026-09-04T15:00:00.000Z") };
		service.getActiveSessionFromAccessTokenOrNull.mockResolvedValue(session);
		const requestContext = buildContext({ authorization: `Bearer ${"a".repeat(43)}` });

		const result = await guard.canActivate(requestContext.context);

		expect({ allowed: result, authSession: requestContext.request["authSession"] }).toEqual({
			allowed: true,
			authSession: session,
		});
	});
});
