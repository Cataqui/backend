import { AuthSchedules } from "./schedules";
import { UnregisteredScheduleError } from "./errors/unregistered-schedule.error";
import { AccessTokenRequiredError } from "./http/errors/access-token-required.error";
import { SessionRevokedError } from "./session/errors/session-revoked.error";
import { RefreshSessionRevokedError } from "./session/errors/refresh-session-revoked.error";
import { AccountNotFoundError } from "./account/errors/account-not-found.error";
import { NotpIntentNotFoundError } from "./notp/errors/notp-intent-not-found.error";
import { NotpIntentCreationCollisionError } from "./notp/errors/notp-intent-creation-collision.error";
import { NotpProcessingInProgressError } from "./notp/errors/notp-processing-in-progress.error";
import { NotpProcessingOwnershipLostError } from "./notp/errors/notp-processing-ownership-lost.error";
import { InvalidRequestError } from "./http/errors/invalid-request.error";
import { PayloadTooLargeError } from "./http/errors/payload-too-large.error";
import { RouteNotFoundError } from "./http/errors/route-not-found.error";
import { InternalError } from "./http/errors/internal.error";
import { MethodNotAllowedError } from "./http/errors/method-not-allowed.error";
import { AuthNotReadyError } from "./health/errors/auth-not-ready.error";
import { MetaSubscriptionVerificationRejectedError } from "./whatsapp/errors/meta-subscription-verification-rejected.error";
import { MetaWebhookSignatureInvalidError } from "./whatsapp/errors/meta-webhook-signature-invalid.error";
import { RefreshTokenSigningKeyUnavailableError } from "./session/errors/refresh-token-signing-key-unavailable.error";
import { NotpAccountPersistenceFailedError } from "./notp/errors/notp-account-persistence-failed.error";
import { InvalidWhatsappWebhookError } from "./whatsapp/errors/invalid-whatsapp-webhook.error";
import { WhatsappContactIdentifierRequiredError } from "./whatsapp/errors/whatsapp-contact-identifier-required.error";
import { AppError } from "./errors/app.error";
import { InvalidRefreshTokenError } from "./session/errors/invalid-refresh-token.error";
import { AuthSessionUnavailableError } from "./session/errors/auth-session-unavailable.error";
import { z } from "zod";
import type { AuthWorkerEnv } from "../cloudflare.config.ts";
import * as td from "testdouble";
import { AccountService } from "./account/account.service";
import { HealthService } from "./health/health.service";
import { AppErrorCode } from "./errors/app-error-code.enum";
import { AuthErrorResponseOutputSchema } from "./http/auth-error-response-output.schema";
import { NotpChannel } from "./notp/notp-channel.enum";
import { NotpIntentStatus } from "./notp/notp-intent-status.enum";
import { NotpService } from "./notp/notp.service";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { SessionService } from "./session/session.service";
import type { MetaWebhookAuthService } from "./whatsapp/meta-webhook-auth.service";
import type { WhatsappService } from "./whatsapp/whatsapp.service";

const { construct, close, accountService, healthService, notpService, sessionService, getChallenge, receiveWebhook } =
	await vi.hoisted(async () => {
		const td = await import("testdouble");
		return {
			construct: td.func<(env: AuthWorkerEnv) => void>(),
			getChallenge: td.func<MetaWebhookAuthService["getSubscriptionChallengeOrNull"]>(),
			receiveWebhook: td.func<WhatsappService["receiveMessagesWebhook"]>(),
			close: td.func<() => Promise<void>>(),
			accountService: td.object<AccountService>(),
			healthService: td.object<HealthService>(),
			notpService: td.object<NotpService>(),
			sessionService: td.object<SessionService>(),
		};
	});

vi.mock("./auth-dependencies", async () => {
	const { AccountService } = await import("./account/account.service");
	const { HealthService } = await import("./health/health.service");
	const { NotpService } = await import("./notp/notp.service");
	const { SessionService } = await import("./session/session.service");
	const { MetaWebhookAuthService } = await import("./whatsapp/meta-webhook-auth.service");
	const { WhatsappService } = await import("./whatsapp/whatsapp.service");
	class RequestResource {
		dispose(): Promise<void> {
			return close();
		}
	}
	return {
		registerAuthDependencies: (params: {
			container: import("tsyringe").DependencyContainer;
			environment: AuthWorkerEnv;
		}): void => {
			construct(params.environment);
			params.container.registerInstance(AccountService, accountService);
			params.container.registerInstance(HealthService, healthService);
			params.container.registerInstance(NotpService, notpService);
			params.container.registerInstance(SessionService, sessionService);
			params.container.registerInstance(
				MetaWebhookAuthService,
				new MetaWebhookAuthService({
					appSecret: params.environment.META_APP_SECRET,
					verificationToken: params.environment.WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN,
				}),
			);
			params.container.registerInstance(
				WhatsappService,
				new WhatsappService(
					notpService,
					new MetaWebhookAuthService({
						appSecret: params.environment.META_APP_SECRET,
						verificationToken: params.environment.WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN,
					}),
					{
						whatsappPhoneNumber: params.environment.WHATSAPP_NOTP_RECEIVER,
						whatsappPhoneNumberId: params.environment.WHATSAPP_NOTP_PHONE_NUMBER_ID,
					},
				),
			);
			params.container.resolve(RequestResource);
		},
	};
});

vi.mock("./whatsapp/meta-webhook-auth.service", () => ({
	MetaWebhookAuthService: class {
		getSubscriptionChallengeOrNull = getChallenge;
	},
}));
vi.mock("./whatsapp/whatsapp.service", () => ({
	WhatsappService: class {
		receiveMessagesWebhook = receiveWebhook;
	},
}));

import worker, { app } from "./app";
import { AuthEntrypoint } from "./entrypoint";

afterEach(() => td.reset());
afterEach(() => vi.useRealTimers());

const authenticatedSession = {
	accountId: "f884cf46-357f-4fb4-a5a7-d2e4edd97950",
	sessionId: "2069c021-ce33-4171-995a-7045945df4db",
	expiresAt: "2026-10-19T12:15:00.000Z",
} satisfies AuthenticatedSession;
const accessToken = "a".repeat(43);

function _environment(): AuthWorkerEnv {
	return Object.assign(td.object<AuthWorkerEnv>(), {
		META_APP_SECRET: "test-app-secret",
		WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "test-verify-token",
		WHATSAPP_NOTP_PHONE_NUMBER_ID: "1211194405413752",
	});
}

function _sessionOutput(): Awaited<ReturnType<SessionService["refresh"]>> {
	return {
		accessToken: accessToken,
		tokenType: "Bearer",
		expiresAt: "2026-10-19T12:15:00.000Z",
		refreshToken: "refresh-credential",
		refreshExpiresAt: "2026-11-18T12:00:00.000Z",
		accountId: authenticatedSession.accountId,
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
	td.when(close()).thenResolve(undefined);
	td.when(getChallenge(td.matchers.anything())).thenResolve("challenge");
	td.replace(console, "error", td.func<Console["error"]>());
});

describe("Auth HTTP application", () => {
	it("serves liveness without constructing storage services", async () => {
		const response = await app.request("/v1/health/live", {}, _environment());

		expect({
			status: response.status,
			body: await response.text(),
			cache: response.headers.get("Cache-Control"),
		}).toEqual({
			status: 204,
			body: "",
			cache: "no-store",
		});
		expect(td.explain(construct).callCount).toBe(1);
	});

	it.each([true, false])("maps readiness %s into the dependency status", async (ready) => {
		td.when(healthService.check()).thenResolve(ready);

		const response = await app.request("/v1/health", {}, _environment());

		expect(response.status).toBe(ready ? 200 : 503);
		const body: unknown = await response.json();
		if (ready) expect(body).toEqual({ status: "ok" });
		if (!ready)
			expect(AuthErrorResponseOutputSchema.parse(body)).toMatchObject({
				status: 503,
				errorCode: AppErrorCode.AUTH_NOT_READY,
			});
		td.verify(close());
	});

	it("serves authoritative OpenAPI without constructing storage services", async () => {
		const response = await app.request("/openapi.json", {}, _environment());

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			openapi: "3.1.0",
			info: { title: "Cataquí Auth", version: "1.0.0" },
			paths: {
				"/v1/account": {
					get: {
						operationId: "getCurrentAccount",
						responses: {
							"200": {
								content: {
									"application/json": {
										schema: {
											required: ["data", "requestId", "timestamp", "endpoint"],
											properties: { data: {}, requestId: {}, timestamp: {}, endpoint: {} },
										},
									},
								},
							},
							default: {
								content: {
									"application/json": {
										schema: {
											properties: { errorCode: { enum: Object.values(AppErrorCode) } },
										},
									},
								},
							},
						},
					},
				},
				"/v1/notp/intents": {
					post: {
						operationId: "createNotpIntent",
						security: [],
						requestBody: {
							required: true,
							content: {
								"application/json": {
									schema: { properties: { channel: { type: "string", enum: ["WHATSAPP"] } }, required: ["channel"] },
								},
							},
						},
					},
				},
				"/v1/notp/intents/exchange": { post: { operationId: "exchangeNotpIntent" } },
				"/v1/sessions/current": { get: { operationId: "getCurrentSession" } },
				"/v1/sessions/refresh": { post: { operationId: "refreshSession", requestBody: { required: true } } },
				"/v1/sessions/logout": { post: { operationId: "logoutSession", requestBody: { required: true } } },
				"/v1/sessions": { delete: { operationId: "revokeAllSessions" } },
				"/v1/health": { get: { operationId: "checkReadiness" } },
				"/v1/health/live": { get: { operationId: "checkLiveness" } },
				"/webhooks/whatsapp": {
					get: { operationId: "verifyMetaSubscription" },
					post: { operationId: "receiveMetaWebhook" },
				},
			},
		});
		expect(td.explain(construct).callCount).toBe(1);
	});

	it("serves public Meta subscription verification without database services", async () => {
		const response = await app.request(
			"/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=challenge",
			{},
			_environment(),
		);

		expect({ status: response.status, body: await response.text(), services: td.explain(construct).callCount }).toEqual(
			{ status: 200, body: "challenge", services: 1 },
		);
	});

	it("acquires request services for Meta delivery and releases them after processing", async () => {
		td.when(receiveWebhook(td.matchers.anything())).thenResolve(true);
		const response = await app.request(
			"/webhooks/whatsapp",
			{ method: "POST", body: "signed callback" },
			_environment(),
		);

		expect(response.status).toBe(200);
		expect(td.explain(construct).callCount).toBe(1);
		td.verify(close());
	});

	it("releases Meta request services when accepted delivery processing fails", async () => {
		td.when(receiveWebhook(td.matchers.anything())).thenReject(new Error("processing unavailable"));
		const response = await app.request(
			"/webhooks/whatsapp",
			{ method: "POST", body: "signed callback" },
			_environment(),
		);

		expect(response.status).toBe(500);
		td.verify(close());
	});

	it("answers CORS preflight without acquiring storage resources", async () => {
		const response = await app.request(
			"/v1/account",
			{ method: "OPTIONS", headers: { Origin: "https://cataqui.com", "Access-Control-Request-Method": "GET" } },
			_environment(),
		);

		expect({
			status: response.status,
			origin: response.headers.get("Access-Control-Allow-Origin"),
			services: td.explain(construct).callCount,
		}).toEqual({ status: 204, origin: "*", services: 0 });
	});

	it("returns a structured not-found error and retains the request ID", async () => {
		const response = await app.request(
			"/missing?private=query",
			{ headers: { "x-request-id": "request-identifier-123" } },
			_environment(),
		);

		expect({ status: response.status, body: await response.json() }).toEqual({
			status: 404,
			body: {
				errorCode: AppErrorCode.ROUTE_NOT_FOUND,
				message: "The requested endpoint was not found.",
				status: 404,
				requestId: "request-identifier-123",
				timestamp: "2026-10-19T12:00:00.000Z",
				endpoint: "/missing",
			},
		});
	});

	it("rejects oversized bodies before creating services", async () => {
		const response = await app.request(
			"/v1/sessions/refresh",
			{ method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(64 * 1024 + 1) },
			_environment(),
		);

		expect(response.status).toBe(413);
		expect(await response.json()).toMatchObject({ errorCode: AppErrorCode.PAYLOAD_TOO_LARGE });
		expect(td.explain(construct).callCount).toBe(0);
	});

	it("returns created login intent data using the response envelope", async () => {
		const output = {
			intentToken: "i".repeat(43),
			code: "NOTP-ABCDEFGHIJ",
			codeReceiver: "+5511999999999",
			expiresAt: "2026-10-19T12:05:00.000Z",
		} satisfies Awaited<ReturnType<NotpService["createIntent"]>>;
		td.when(notpService.createIntent({ channel: NotpChannel.WHATSAPP })).thenResolve(output);

		const response = await app.request(
			"/v1/notp/intents",
			{
				method: "POST",
				headers: { "Content-Type": "application/json; charset=utf-8", "x-request-id": "create-request-123" },
				body: JSON.stringify({ channel: "WHATSAPP" }),
			},
			_environment(),
		);

		expect({ status: response.status, body: await response.json() }).toEqual({
			status: 201,
			body: {
				data: output,
				requestId: "create-request-123",
				timestamp: "2026-10-19T12:00:00.000Z",
				endpoint: "/v1/notp/intents",
			},
		});
		td.verify(close());
	});

	it("maps a pending intent exchange into 202 with retry guidance and forwards cancellation", async () => {
		const controller = new AbortController();
		const intentToken = "i".repeat(43);
		let forwardedSignal: AbortSignal | undefined;
		td.when(notpService.exchangeIntentForSession(td.matchers.anything())).thenDo(
			async (
				params: Parameters<NotpService["exchangeIntentForSession"]>[0],
			): ReturnType<NotpService["exchangeIntentForSession"]> => {
				forwardedSignal = params.abortSignal;
				return { status: NotpIntentStatus.PENDING, retryAfterSeconds: 2 };
			},
		);

		const request = new Request("https://auth.cataqui.com/v1/notp/intents/exchange", {
			method: "POST",
			signal: controller.signal,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ intentToken: intentToken }),
		});
		const response = await app.request(request, {}, _environment());

		expect({
			status: response.status,
			retryAfter: response.headers.get("Retry-After"),
			body: await response.json(),
		}).toMatchObject({ status: 202, retryAfter: "2", body: { data: { status: "PENDING", retryAfterSeconds: 2 } } });
		controller.abort();
		expect(forwardedSignal?.aborted).toBe(true);
	});

	it("returns verified intent exchanges as newly created sessions", async () => {
		td.when(notpService.exchangeIntentForSession(td.matchers.anything())).thenResolve(_sessionOutput());

		const response = await app.request(
			"/v1/notp/intents/exchange",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ intentToken: "i".repeat(43) }),
			},
			_environment(),
		);

		expect({ status: response.status, body: await response.json() }).toMatchObject({
			status: 201,
			body: { data: _sessionOutput() },
		});
	});

	it.each([undefined, "", "Basic abc", "Bearer short", `Bearer ${"!".repeat(43)}`, `Bearer ${accessToken} extra`])(
		"rejects missing or malformed bearer credentials %j without calling session storage",
		async (authorization) => {
			const response = await app.request(
				"/v1/account",
				{ headers: authorization === undefined ? {} : { Authorization: authorization } },
				_environment(),
			);

			expect(response.status).toBe(401);
			expect(await response.json()).toMatchObject({ errorCode: AppErrorCode.ACCESS_TOKEN_REQUIRED });
			expect(td.explain(sessionService.getActiveSessionFromAccessTokenOrNull).callCount).toBe(0);
			td.verify(close());
		},
	);

	it("rejects expired or revoked access credentials", async () => {
		td.when(sessionService.getActiveSessionFromAccessTokenOrNull({ accessToken: accessToken })).thenResolve(null);

		const response = await app.request(
			"/v1/sessions/current",
			{ headers: { Authorization: `Bearer ${accessToken}` } },
			_environment(),
		);

		expect(response.status).toBe(401);
	});

	it("serializes the authenticated session without issuing new credentials", async () => {
		td.when(sessionService.getActiveSessionFromAccessTokenOrNull({ accessToken: accessToken })).thenResolve(
			authenticatedSession,
		);

		const response = await app.request(
			"/v1/sessions/current",
			{ headers: { Authorization: `bEaReR ${accessToken}` } },
			_environment(),
		);

		expect({ status: response.status, body: await response.json() }).toMatchObject({
			status: 200,
			body: {
				data: {
					accountId: authenticatedSession.accountId,
					sessionId: authenticatedSession.sessionId,
					expiresAt: "2026-10-19T12:15:00.000Z",
				},
			},
		});
	});

	it("uses authenticated identity when requesting the current account", async () => {
		td.when(sessionService.getActiveSessionFromAccessTokenOrNull({ accessToken: accessToken })).thenResolve(
			authenticatedSession,
		);
		const account = { accountId: authenticatedSession.accountId, identities: [] } satisfies Awaited<
			ReturnType<AccountService["getCurrent"]>
		>;
		td.when(accountService.getCurrent({ accountId: authenticatedSession.accountId })).thenResolve(account);

		const response = await app.request(
			"/v1/account?accountId=forged",
			{ headers: { Authorization: `Bearer ${accessToken}` } },
			_environment(),
		);

		expect({ status: response.status, body: await response.json() }).toMatchObject({
			status: 200,
			body: { data: account },
		});
	});

	it("refreshes credentials from the validated request body", async () => {
		td.when(sessionService.refresh({ currentRefreshToken: "refresh-credential" })).thenResolve(_sessionOutput());

		const response = await app.request(
			"/v1/sessions/refresh",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refreshToken: "refresh-credential" }),
			},
			_environment(),
		);

		expect({ status: response.status, body: await response.json() }).toMatchObject({
			status: 200,
			body: { data: _sessionOutput() },
		});
	});

	it("logs out the submitted refresh session and returns no content", async () => {
		td.when(sessionService.logout({ refreshToken: "refresh-credential" })).thenResolve(undefined);

		const response = await app.request(
			"/v1/sessions/logout",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refreshToken: "refresh-credential" }),
			},
			_environment(),
		);

		expect({ status: response.status, body: await response.text() }).toEqual({ status: 204, body: "" });
		td.verify(close());
	});

	it("revokes all sessions for the authenticated account", async () => {
		td.when(sessionService.getActiveSessionFromAccessTokenOrNull({ accessToken: accessToken })).thenResolve(
			authenticatedSession,
		);

		const response = await app.request(
			"/v1/sessions",
			{ method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
			_environment(),
		);

		expect(response.status).toBe(204);
		td.verify(sessionService.revokeAll({ session: authenticatedSession }));
	});

	it.each([undefined, "text/plain", "application/jsonp"])(
		"returns field validation errors when the JSON media type does not match: %j",
		async (contentType) => {
			const response = await app.request(
				"/v1/sessions/refresh",
				{ method: "POST", headers: contentType === undefined ? {} : { "Content-Type": contentType }, body: "{}" },
				_environment(),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				errorCode: AppErrorCode.VALIDATION_ERROR,
				violations: [{ path: ["refreshToken"], message: expect.any(String) }],
			});
			expect(td.explain(sessionService.refresh).callCount).toBe(0);
		},
	);

	it("returns field validation errors when neither a content type nor body was supplied", async () => {
		const response = await app.request("/v1/sessions/refresh", { method: "POST" }, _environment());

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			errorCode: AppErrorCode.VALIDATION_ERROR,
			violations: [{ path: ["refreshToken"], message: expect.any(String) }],
		});
	});

	it("identifies malformed JSON as a caller request error", async () => {
		const response = await app.request(
			"/v1/sessions/refresh",
			{ method: "POST", headers: { "Content-Type": "application/json" }, body: "{" },
			_environment(),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ errorCode: AppErrorCode.INVALID_REQUEST });
		td.verify(close());
	});

	it("reports all public field violations while omitting submitted secrets", async () => {
		const response = await app.request(
			"/v1/sessions/refresh",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refreshToken: "", privateSubmittedToken: "sensitive-value" }),
			},
			_environment(),
		);
		const body: unknown = await response.json();

		expect(response.status).toBe(400);
		expect(body).toMatchObject({
			errorCode: AppErrorCode.VALIDATION_ERROR,
			violations: [
				{ path: ["refreshToken"], message: "refreshToken must not be empty" },
				{ path: [], message: "Only documented fields are supported." },
			],
		});
		expect(AuthErrorResponseOutputSchema.safeParse(body).success).toBe(true);
		expect(JSON.stringify(body)).not.toContain("sensitive-value");
		expect(JSON.stringify(body)).not.toContain("privateSubmittedToken");
	});

	it("preserves owned errors and their HTTP status", async () => {
		td.when(sessionService.refresh(td.matchers.anything())).thenReject(new InvalidRefreshTokenError());

		const response = await app.request(
			"/v1/sessions/refresh",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refreshToken: "expired" }),
			},
			_environment(),
		);

		expect({ status: response.status, body: await response.json() }).toMatchObject({
			status: 401,
			body: { errorCode: AppErrorCode.INVALID_REFRESH_TOKEN, message: "The refresh token is invalid" },
		});
	});

	it("sanitizes unexpected provider failures and releases request resources", async () => {
		td.when(healthService.check()).thenReject(new Error("postgres://private:password@database secret-token"));

		const response = await app.request("/v1/health", {}, _environment());
		const body: unknown = await response.json();

		expect(response.status).toBe(500);
		expect(body).toMatchObject({
			errorCode: AppErrorCode.INTERNAL_ERROR,
			message: "An internal error occurred.",
		});
		expect(JSON.stringify(body)).not.toContain("password");
		td.verify(close());
		td.verify(
			console.error({
				event: "auth.request.failed",
				method: "GET",
				path: "/v1/health",
				responseStatus: 500,
				errorCode: AppErrorCode.INTERNAL_ERROR,
			}),
		);
	});

	it("sanitizes resource cleanup failures", async () => {
		td.when(healthService.check()).thenResolve(true);
		td.when(close()).thenReject(new Error("private connection cleanup failure"));

		const response = await app.request("/v1/health", {}, _environment());

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ errorCode: AppErrorCode.INTERNAL_ERROR });
	});
});

describe("Auth private entrypoint", () => {
	it("returns the resolved account/session identity and closes services", async () => {
		const env = _environment();
		td.when(sessionService.getActiveSessionFromAccessTokenOrNull({ accessToken: accessToken })).thenResolve(
			authenticatedSession,
		);

		expect(
			await new AuthEntrypoint(td.object<ExecutionContext>(), env).resolveSession({ accessToken: accessToken }),
		).toEqual({
			accountId: authenticatedSession.accountId,
			sessionId: authenticatedSession.sessionId,
			expiresAt: "2026-10-19T12:15:00.000Z",
		});
		td.verify(construct(env));
		td.verify(close());
	});

	it("returns absence for inactive credentials", async () => {
		td.when(sessionService.getActiveSessionFromAccessTokenOrNull({ accessToken: accessToken })).thenResolve(null);

		expect(
			await new AuthEntrypoint(td.object<ExecutionContext>(), _environment()).resolveSession({
				accessToken: accessToken,
			}),
		).toBeNull();
		td.verify(close());
	});

	it("propagates availability failure separately from invalid credentials and closes resources", async () => {
		const failure = new Error("session storage unavailable");
		td.when(sessionService.getActiveSessionFromAccessTokenOrNull({ accessToken: accessToken })).thenReject(failure);

		await expect(
			new AuthEntrypoint(td.object<ExecutionContext>(), _environment()).resolveSession({ accessToken: accessToken }),
		).rejects.toBe(failure);
		td.verify(close());
	});
});

describe("Auth scheduled refresh-session expiry", () => {
	it.each(["0 * * * *", "17  3 * * *"])(
		"rejects the unregistered schedule %s without running cleanup and releases its resources",
		async (cron) => {
			const event = Object.assign(td.object<ScheduledController>(), { cron: cron });
			await expect(worker.scheduled(event, _environment())).rejects.toBeInstanceOf(UnregisteredScheduleError);
			expect(td.explain(sessionService.deleteExpired).callCount).toBe(0);
			td.verify(close());
		},
	);

	it("invokes the session lifecycle operation and releases database resources", async () => {
		await worker.scheduled(
			Object.assign(td.object<ScheduledController>(), { cron: AuthSchedules.DELETE_EXPIRED_SESSIONS }),
			_environment(),
		);

		td.verify(sessionService.deleteExpired());
		td.verify(close());
	});

	it("releases resources when expiry cleanup fails", async () => {
		const failure = new Error("expiry unavailable");
		td.when(sessionService.deleteExpired()).thenReject(failure);

		await expect(
			worker.scheduled(
				Object.assign(td.object<ScheduledController>(), { cron: AuthSchedules.DELETE_EXPIRED_SESSIONS }),
				_environment(),
			),
		).rejects.toBe(failure);
		td.verify(close());
	});
});

describe("Auth concrete HTTP errors", () => {
	it.each([
		{
			error: new AccessTokenRequiredError(),
			code: AppErrorCode.ACCESS_TOKEN_REQUIRED,
			message: "A valid bearer session is required. Send the session token as Authorization: Bearer <accessToken>.",
			name: "AccessTokenRequiredError",
			status: 401,
		},
		{
			error: new SessionRevokedError(),
			code: AppErrorCode.SESSION_REVOKED,
			message: "The authentication session was revoked while issuing credentials",
			name: "SessionRevokedError",
			status: 401,
		},
		{
			error: new InvalidRefreshTokenError(),
			code: AppErrorCode.INVALID_REFRESH_TOKEN,
			message: "The refresh token is invalid",
			name: "InvalidRefreshTokenError",
			status: 401,
		},
		{
			error: new RefreshSessionRevokedError(),
			code: AppErrorCode.INVALID_REFRESH_TOKEN,
			message: "The refresh session was revoked",
			name: "RefreshSessionRevokedError",
			status: 401,
		},
		{
			error: new AuthSessionUnavailableError(),
			code: AppErrorCode.AUTH_SESSION_UNAVAILABLE,
			message: "The authentication session is unavailable",
			name: "AuthSessionUnavailableError",
			status: 503,
		},
		{
			error: new AccountNotFoundError(),
			code: AppErrorCode.ACCOUNT_NOT_FOUND,
			message: "The authenticated account no longer exists.",
			name: "AccountNotFoundError",
			status: 401,
		},
		{
			error: new NotpIntentNotFoundError(),
			code: AppErrorCode.NOTP_INTENT_NOT_FOUND,
			message: "The NOTP intent was not found or has expired. Create a new intent.",
			name: "NotpIntentNotFoundError",
			status: 404,
		},
		{
			error: new NotpIntentCreationCollisionError(),
			code: AppErrorCode.NOTP_INTENT_CREATION_COLLISION,
			message: "The NOTP intent could not be created. Please try again.",
			name: "NotpIntentCreationCollisionError",
			status: 503,
		},
		{
			error: new NotpProcessingInProgressError(),
			code: AppErrorCode.NOTP_PROCESSING_IN_PROGRESS,
			message: "The NOTP message is still processing and must be retried after recovery.",
			name: "NotpProcessingInProgressError",
			status: 503,
		},
		{
			error: new NotpProcessingOwnershipLostError(),
			code: AppErrorCode.NOTP_PROCESSING_OWNERSHIP_LOST,
			message: "The NOTP verification could not complete because its processing lease was lost.",
			name: "NotpProcessingOwnershipLostError",
			status: 503,
		},
		{
			error: new InvalidRequestError(),
			code: AppErrorCode.INVALID_REQUEST,
			message: "The request body must contain valid JSON.",
			name: "InvalidRequestError",
			status: 400,
		},
		{
			error: new PayloadTooLargeError(),
			code: AppErrorCode.PAYLOAD_TOO_LARGE,
			message: "Request body exceeds the maximum allowed size.",
			name: "PayloadTooLargeError",
			status: 413,
		},
		{
			error: new RouteNotFoundError(),
			code: AppErrorCode.ROUTE_NOT_FOUND,
			message: "The requested endpoint was not found.",
			name: "RouteNotFoundError",
			status: 404,
		},
		{
			error: new InternalError(),
			code: AppErrorCode.INTERNAL_ERROR,
			message: "An internal error occurred.",
			name: "InternalError",
			status: 500,
		},
		{
			error: new MethodNotAllowedError(),
			code: AppErrorCode.METHOD_NOT_ALLOWED,
			message: "The requested HTTP method is not supported.",
			name: "MethodNotAllowedError",
			status: 405,
		},
		{
			error: new AuthNotReadyError(),
			code: AppErrorCode.AUTH_NOT_READY,
			message: "An authentication dependency is unavailable.",
			name: "AuthNotReadyError",
			status: 503,
		},
		{
			error: new MetaSubscriptionVerificationRejectedError(),
			code: AppErrorCode.META_SUBSCRIPTION_VERIFICATION_REJECTED,
			message: "The subscription verification was rejected.",
			name: "MetaSubscriptionVerificationRejectedError",
			status: 403,
		},
		{
			error: new MetaWebhookSignatureInvalidError(),
			code: AppErrorCode.META_WEBHOOK_SIGNATURE_INVALID,
			message: "The webhook signature is invalid.",
			name: "MetaWebhookSignatureInvalidError",
			status: 401,
		},
		{
			error: new RefreshTokenSigningKeyUnavailableError(),
			code: AppErrorCode.REFRESH_TOKEN_SIGNING_KEY_UNAVAILABLE,
			message: "The current refresh-token signing key is unavailable",
			name: "RefreshTokenSigningKeyUnavailableError",
			status: 500,
		},
		{
			error: new NotpAccountPersistenceFailedError(),
			code: AppErrorCode.NOTP_ACCOUNT_PERSISTENCE_FAILED,
			message: "Verified identity persistence returned no account",
			name: "NotpAccountPersistenceFailedError",
			status: 500,
		},
		{
			error: new InvalidWhatsappWebhookError(),
			code: AppErrorCode.INVALID_WHATSAPP_WEBHOOK,
			message: "Authenticated WhatsApp webhook payload is invalid",
			name: "InvalidWhatsappWebhookError",
			status: 500,
		},
		{
			error: new WhatsappContactIdentifierRequiredError(),
			code: AppErrorCode.WHATSAPP_CONTACT_IDENTIFIER_REQUIRED,
			message: "NOTP requires a provider contact identifier",
			name: "WhatsappContactIdentifierRequiredError",
			status: 500,
		},
	] satisfies { error: AppError; code: AppErrorCode; message: string; name: string; status: number }[])(
		"serializes $name with its fixed code, message and status",
		async ({ error, code, message, name, status }) => {
			td.when(sessionService.refresh(td.matchers.anything())).thenReject(error);
			const response = await app.request(
				"/v1/sessions/refresh",
				{
					method: "POST",
					headers: { "Content-Type": "application/json", "x-request-id": "concrete-error-request" },
					body: JSON.stringify({ refreshToken: "credential" }),
				},
				_environment(),
			);
			expect(error).toBeInstanceOf(AppError);
			expect({ name: error.name, errorCode: error.errorCode, message: error.message, status: error.status }).toEqual({
				name: name,
				status: status,
				errorCode: code,
				message: message,
			});
			expect(response.status).toBe(status);
			expect(AuthErrorResponseOutputSchema.parse(await response.json())).toEqual({
				errorCode: code,
				message: message,
				status: status,
				requestId: "concrete-error-request",
				timestamp: "2026-10-19T12:00:00.000Z",
				endpoint: "/v1/sessions/refresh",
			});
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			td.verify(close());
		},
	);

	it("sanitizes internal schema failures instead of reporting caller violations", async () => {
		const parsed = z.strictObject({ privateProviderField: z.string() }).safeParse({ privateProviderField: 42 });
		expect(parsed.success).toBe(false);
		td.when(healthService.check()).thenReject(parsed.error);
		const response = await app.request("/v1/health", {}, _environment());
		const body = AuthErrorResponseOutputSchema.parse(await response.json());
		expect(response.status).toBe(500);
		expect(body).toMatchObject({
			status: 500,
			errorCode: AppErrorCode.INTERNAL_ERROR,
			message: "An internal error occurred.",
		});
		expect(body.violations).toBeUndefined();
		expect(JSON.stringify(body)).not.toContain("privateProviderField");
		expect(JSON.stringify(body)).not.toContain("expected string");
	});

	it.each([
		{
			method: "GET",
			approvedChallenge: null,
			accepted: true,
			body: undefined,
			status: 403,
			code: AppErrorCode.META_SUBSCRIPTION_VERIFICATION_REJECTED,
		},
		{
			method: "POST",
			approvedChallenge: "challenge",
			accepted: false,
			body: "signed callback",
			status: 401,
			code: AppErrorCode.META_WEBHOOK_SIGNATURE_INVALID,
		},
		{
			method: "PUT",
			approvedChallenge: "challenge",
			accepted: true,
			body: undefined,
			status: 405,
			code: AppErrorCode.METHOD_NOT_ALLOWED,
		},
		{
			method: "POST",
			approvedChallenge: "challenge",
			accepted: true,
			body: "x".repeat(10 * 1024 * 1024 + 1),
			status: 413,
			code: AppErrorCode.PAYLOAD_TOO_LARGE,
		},
	])(
		"returns a structured webhook $status response for $method",
		async ({ method, approvedChallenge, accepted, body, status, code }) => {
			td.when(getChallenge(td.matchers.anything())).thenResolve(approvedChallenge);
			td.when(receiveWebhook(td.matchers.anything())).thenResolve(accepted);
			const response = await app.request(
				"/webhooks/whatsapp",
				{ method: method, ...(body === undefined ? {} : { body: body }) },
				_environment(),
			);
			expect(response.status).toBe(status);
			expect(AuthErrorResponseOutputSchema.parse(await response.json())).toMatchObject({
				status: status,
				errorCode: code,
				endpoint: "/webhooks/whatsapp",
			});
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			if (method === "PUT") expect(response.headers.get("Allow")).toBe("GET, POST");
			if (status === 413) expect(td.explain(receiveWebhook).callCount).toBe(0);
		},
	);

	it("preserves the webhook method rejection for HEAD without a response body", async () => {
		const response = await app.request("/webhooks/whatsapp", { method: "HEAD" }, _environment());
		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("GET, POST");
		expect(await response.text()).toBe("");
	});
});
