import * as td from "testdouble";
import type { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { AppErrorCode } from "../errors/app-error-code.enum";
import type { NotpRepository } from "../notp/notp.repository";
import type { AccessTokenRepository } from "./access-token.repository";
import type { SessionOutputSchema } from "./session-output.schema";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import type { SessionRepository } from "./session.repository";
import { SessionService } from "./session.service";
import type { TokenService } from "./token.service";

afterEach(() => {
	td.reset();
	vi.useRealTimers();
});

describe("SessionService", () => {
	let accessTokenRepository: AccessTokenRepository;
	let notpRepository: NotpRepository;
	let tokenService: TokenService;
	let repository: SessionRepository;
	let service: SessionService;
	const now = new Date("2026-10-19T12:00:00.000Z");
	const sessionId = "c45a5cd1-074d-4ed9-993f-0d3862e0b211";
	const accountId = "6c64c609-d3ab-4826-9b7d-8ac248207eb7";
	const identityId = "0992d8d5-54ab-43fe-b79c-371f8a7c7992";
	const tokens = {
		accessExpiresAt: new Date("2026-10-19T12:15:00.000Z"),
		accessToken: "a".repeat(43),
		accessTokenHash: "a".repeat(64),
		refreshExpiresAt: new Date("2026-11-18T12:00:00.000Z"),
		refreshToken: "new-refresh-token",
		refreshTokenHash: "b".repeat(64),
	} satisfies ReturnType<TokenService["createAccessAndRefreshTokens"]>;
	const storedSession = {
		id: sessionId,
		accountId: accountId,
		identityId: identityId,
		refreshTokenHash: "c".repeat(64),
		refreshExpiresAt: new Date("2026-11-17T12:00:00.000Z"),
		previousRefreshTokenHash: null,
		previousRefreshTokenValidUntil: null,
	} satisfies NonNullable<Awaited<ReturnType<SessionRepository["findById"]>>>;
	const authenticatedSession = {
		accountId: accountId,
		sessionId: sessionId,
		expiresAt: tokens.accessExpiresAt.toISOString(),
	} satisfies AuthenticatedSession;
	const expectedOutput = {
		accessToken: tokens.accessToken,
		tokenType: "Bearer",
		expiresAt: tokens.accessExpiresAt.toISOString(),
		refreshToken: tokens.refreshToken,
		refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
		accountId: accountId,
	} satisfies z.infer<typeof SessionOutputSchema>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(now);
		accessTokenRepository = td.object<AccessTokenRepository>();
		notpRepository = td.object<NotpRepository>();
		tokenService = td.object<TokenService>();
		repository = td.object<SessionRepository>();
		service = new SessionService(accessTokenRepository, notpRepository, tokenService, repository);
		td.when(tokenService.createAccessAndRefreshTokens(td.matchers.anything())).thenReturn(tokens);
		td.when(tokenService.hashAccessToken(td.matchers.anything())).thenReturn(tokens.accessTokenHash);
		td.when(tokenService.getAuthenticatedRefreshTokenOrNull(td.matchers.anything())).thenReturn({
			refreshTokenHash: storedSession.refreshTokenHash,
			sessionId: sessionId,
		});
		td.when(repository.create(td.matchers.anything())).thenResolve({ id: sessionId, accountId: accountId });
		td.when(repository.findById(td.matchers.anything())).thenResolve(storedSession);
		td.when(repository.replaceCredentials(td.matchers.anything())).thenResolve({ count: 1 });
		td.when(repository.rotateRefreshToken(td.matchers.anything())).thenResolve({ count: 1 });
		td.when(accessTokenRepository.create(td.matchers.anything())).thenResolve(1);
	});

	it("creates durable refresh state and publishes only the access hash", async () => {
		expect(await service.create({ sessionId: sessionId, accountId: accountId, identityId: identityId })).toEqual(
			expectedOutput,
		);
		td.verify(
			repository.create({
				now: now,
				sessionId: sessionId,
				accountId: accountId,
				identityId: identityId,
				refreshTokenHash: tokens.refreshTokenHash,
				refreshExpiresAt: tokens.refreshExpiresAt,
			}),
		);
		td.verify(
			accessTokenRepository.create({
				accessTokenHash: tokens.accessTokenHash,
				session: { accountId: accountId, sessionId: sessionId, expiresAt: tokens.accessExpiresAt },
			}),
		);
	});

	it("generates a session ID when the login attempt did not assign one", async () => {
		await service.create({ accountId: accountId, identityId: identityId });
		expect(td.explain(repository.create).calls[0]?.args[0]).toMatchObject({
			sessionId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
			accountId: accountId,
			identityId: identityId,
		});
	});

	it("resumes an interrupted login exchange only for its original account and identity", async () => {
		td.when(repository.create(td.matchers.anything())).thenReject(
			new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }),
		);
		expect(await service.create({ sessionId: sessionId, accountId: accountId, identityId: identityId })).toEqual(
			expectedOutput,
		);
		td.verify(
			repository.replaceCredentials({
				now: now,
				sessionId: sessionId,
				accountId: accountId,
				identityId: identityId,
				refreshTokenHash: tokens.refreshTokenHash,
				refreshExpiresAt: tokens.refreshExpiresAt,
			}),
		);
	});

	it.each([null, { ...storedSession, accountId: "other-account" }, { ...storedSession, identityId: "other-identity" }])(
		"does not replace an interrupted session owned by a different identity: %s",
		async (existing) => {
			td.when(repository.create(td.matchers.anything())).thenReject(
				new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }),
			);
			td.when(repository.findById(td.matchers.anything())).thenResolve(existing);
			await expect(
				service.create({ sessionId: sessionId, accountId: accountId, identityId: identityId }),
			).rejects.toMatchObject({ errorCode: AppErrorCode.AUTH_SESSION_UNAVAILABLE });
			expect(td.explain(accessTokenRepository.create).callCount).toBe(0);
		},
	);

	it("reports a session removed during interrupted-exchange recovery", async () => {
		td.when(repository.create(td.matchers.anything())).thenReject(
			new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }),
		);
		td.when(repository.replaceCredentials(td.matchers.anything())).thenResolve({ count: 0 });
		await expect(
			service.create({ sessionId: sessionId, accountId: accountId, identityId: identityId }),
		).rejects.toMatchObject({ errorCode: AppErrorCode.AUTH_SESSION_UNAVAILABLE });
	});

	it.each([
		new Error("unexpected database failure"),
		new Prisma.PrismaClientKnownRequestError("database offline", { code: "P1001", clientVersion: "test" }),
	])("preserves non-conflict creation failures", async (failure) => {
		td.when(repository.create(td.matchers.anything())).thenReject(failure);
		await expect(service.create({ sessionId: sessionId, accountId: accountId, identityId: identityId })).rejects.toBe(
			failure,
		);
	});

	it("revokes both stores when access-token publication fails", async () => {
		const failure = new Error("Redis unavailable");
		td.when(accessTokenRepository.create(td.matchers.anything())).thenReject(failure);
		await expect(service.create({ sessionId: sessionId, accountId: accountId, identityId: identityId })).rejects.toBe(
			failure,
		);
		td.verify(accessTokenRepository.deleteForSession({ sessionId: sessionId }));
		td.verify(repository.deleteSession({ sessionId: sessionId, accountId: accountId }));
	});

	it("does not reissue a login session revoked before access-token publication", async () => {
		td.when(accessTokenRepository.create(td.matchers.anything())).thenResolve(0);
		await expect(
			service.create({ sessionId: sessionId, accountId: accountId, identityId: identityId }),
		).rejects.toMatchObject({ errorCode: AppErrorCode.SESSION_REVOKED });
		td.verify(repository.deleteSession({ sessionId: sessionId, accountId: accountId }));
	});

	it("resolves a valid bearer token using only its hash", async () => {
		td.when(accessTokenRepository.findByAccessTokenHash(td.matchers.anything())).thenResolve({
			session_id: sessionId,
			account_id: accountId,
			expires_at: tokens.accessExpiresAt.toISOString(),
		});
		expect(await service.getActiveSessionFromAccessTokenOrNull({ accessToken: "opaque-token" })).toEqual(
			authenticatedSession,
		);
		td.verify(tokenService.hashAccessToken({ accessToken: "opaque-token" }));
		td.verify(accessTokenRepository.findByAccessTokenHash({ accessTokenHash: tokens.accessTokenHash }));
	});

	it("returns absence for an unknown bearer token", async () => {
		td.when(accessTokenRepository.findByAccessTokenHash(td.matchers.anything())).thenResolve(null);
		expect(await service.getActiveSessionFromAccessTokenOrNull({ accessToken: "opaque-token" })).toBeNull();
	});

	it("rejects an access token exactly at its expiry", async () => {
		td.when(accessTokenRepository.findByAccessTokenHash(td.matchers.anything())).thenResolve({
			session_id: sessionId,
			account_id: accountId,
			expires_at: now.toISOString(),
		});
		expect(await service.getActiveSessionFromAccessTokenOrNull({ accessToken: "opaque-token" })).toBeNull();
	});

	it("rejects forged refresh credentials before any durable lookup", async () => {
		td.when(tokenService.getAuthenticatedRefreshTokenOrNull(td.matchers.anything())).thenReturn(null);
		await expect(service.refresh({ currentRefreshToken: "forged" })).rejects.toMatchObject({
			errorCode: AppErrorCode.INVALID_REFRESH_TOKEN,
		});
		expect(td.explain(repository.findById).callCount).toBe(0);
	});

	it.each([null, { ...storedSession, refreshExpiresAt: now }])(
		"rejects missing or expired durable sessions",
		async (existing) => {
			td.when(repository.findById(td.matchers.anything())).thenResolve(existing);
			await expect(service.refresh({ currentRefreshToken: "current-token" })).rejects.toMatchObject({
				errorCode: AppErrorCode.INVALID_REFRESH_TOKEN,
			});
		},
	);

	it("rotates the current refresh hash and extends rolling expiry", async () => {
		expect(await service.refresh({ currentRefreshToken: "current-token" })).toEqual(expectedOutput);
		td.verify(
			repository.rotateRefreshToken({
				now: now,
				currentRefreshTokenHash: storedSession.refreshTokenHash,
				newRefreshExpiresAt: tokens.refreshExpiresAt,
				newRefreshTokenHash: tokens.refreshTokenHash,
				newPreviousRefreshTokenValidUntil: new Date(now.getTime() + 60_000),
				sessionId: sessionId,
			}),
		);
		td.verify(
			accessTokenRepository.create({
				accessTokenHash: tokens.accessTokenHash,
				session: { accountId: accountId, sessionId: sessionId, expiresAt: tokens.accessExpiresAt },
			}),
		);
	});

	it("recovers an immediately previous refresh token during the 60-second recovery window", async () => {
		td.when(tokenService.getAuthenticatedRefreshTokenOrNull(td.matchers.anything())).thenReturn({
			refreshTokenHash: "d".repeat(64),
			sessionId: sessionId,
		});
		td.when(repository.findById(td.matchers.anything())).thenResolve({
			...storedSession,
			previousRefreshTokenHash: "d".repeat(64),
			previousRefreshTokenValidUntil: new Date(now.getTime() + 1),
		});
		expect(await service.refresh({ currentRefreshToken: "previous-token" })).toEqual(expectedOutput);
		td.verify(
			repository.rotateRefreshToken({
				now: now,
				currentRefreshTokenHash: storedSession.refreshTokenHash,
				presentedPreviousRefreshTokenHash: "d".repeat(64),
				newRefreshExpiresAt: tokens.refreshExpiresAt,
				newRefreshTokenHash: tokens.refreshTokenHash,
				newPreviousRefreshTokenValidUntil: new Date(now.getTime() + 60_000),
				sessionId: sessionId,
			}),
		);
	});

	it.each([
		{ previousRefreshTokenHash: "d".repeat(64), previousRefreshTokenValidUntil: now },
		{ previousRefreshTokenHash: "d".repeat(64), previousRefreshTokenValidUntil: null },
		{ previousRefreshTokenHash: "e".repeat(64), previousRefreshTokenValidUntil: new Date(now.getTime() + 1) },
	])("revokes replayed or expired recovery credentials: %s", async (previous) => {
		td.when(tokenService.getAuthenticatedRefreshTokenOrNull(td.matchers.anything())).thenReturn({
			refreshTokenHash: "d".repeat(64),
			sessionId: sessionId,
		});
		td.when(repository.findById(td.matchers.anything())).thenResolve({ ...storedSession, ...previous });
		await expect(service.refresh({ currentRefreshToken: "replayed-token" })).rejects.toMatchObject({
			errorCode: AppErrorCode.INVALID_REFRESH_TOKEN,
		});
		td.verify(accessTokenRepository.deleteForSession({ sessionId: sessionId }));
		td.verify(repository.deleteSession({ sessionId: sessionId, accountId: accountId }));
	});

	it("revokes the session family when compare-and-set loses a concurrent rotation", async () => {
		td.when(repository.rotateRefreshToken(td.matchers.anything())).thenResolve({ count: 0 });
		await expect(service.refresh({ currentRefreshToken: "current-token" })).rejects.toMatchObject({
			errorCode: AppErrorCode.INVALID_REFRESH_TOKEN,
		});
		td.verify(accessTokenRepository.deleteForSession({ sessionId: sessionId }));
		td.verify(repository.deleteSession({ sessionId: sessionId, accountId: accountId }));
		expect(td.explain(accessTokenRepository.create).callCount).toBe(0);
	});

	it("deletes durable rotated state when Redis publication fails", async () => {
		const failure = new Error("Redis unavailable");
		td.when(accessTokenRepository.create(td.matchers.anything())).thenReject(failure);
		await expect(service.refresh({ currentRefreshToken: "current-token" })).rejects.toBe(failure);
		td.verify(repository.deleteSession({ sessionId: sessionId, accountId: accountId }));
	});

	it("rejects a rotated session revoked before publication", async () => {
		td.when(accessTokenRepository.create(td.matchers.anything())).thenResolve(0);
		await expect(service.refresh({ currentRefreshToken: "current-token" })).rejects.toMatchObject({
			errorCode: AppErrorCode.INVALID_REFRESH_TOKEN,
		});
		td.verify(repository.deleteSession({ sessionId: sessionId, accountId: accountId }));
	});

	it("logs out a session even with an authenticated historical refresh token", async () => {
		await service.logout({ refreshToken: "historical-token" });
		td.verify(notpRepository.deleteIntentsForSessions({ sessionIds: [sessionId] }));
		td.verify(accessTokenRepository.deleteForSession({ sessionId: sessionId }));
		td.verify(repository.deleteSession({ sessionId: sessionId, accountId: accountId }));
	});

	it("treats a forged logout credential idempotently", async () => {
		td.when(tokenService.getAuthenticatedRefreshTokenOrNull(td.matchers.anything())).thenReturn(null);
		await service.logout({ refreshToken: "forged-token" });
		expect(td.explain(repository.findById).callCount).toBe(0);
	});

	it("treats an already-deleted session logout idempotently", async () => {
		td.when(repository.findById(td.matchers.anything())).thenResolve(null);
		await service.logout({ refreshToken: "historical-token" });
		expect(td.explain(accessTokenRepository.deleteForSession).callCount).toBe(0);
	});

	it("invalidates access before deleting durable refresh state", async () => {
		const order: string[] = [];
		td.when(accessTokenRepository.deleteForSession(td.matchers.anything())).thenDo(async (): Promise<void> => {
			order.push("access");
		});
		td.when(repository.deleteSession(td.matchers.anything())).thenDo(async (): Promise<{ count: number }> => {
			order.push("durable");
			return { count: 1 };
		});
		await service.deleteAccessTokenAndSession({ sessionId: sessionId, accountId: accountId });
		expect(order).toEqual(["access", "durable"]);
	});

	it("retains durable state when access invalidation fails", async () => {
		const failure = new Error("Redis unavailable");
		td.when(accessTokenRepository.deleteForSession(td.matchers.anything())).thenReject(failure);
		await expect(service.deleteAccessTokenAndSession({ sessionId: sessionId, accountId: accountId })).rejects.toBe(
			failure,
		);
		expect(td.explain(repository.deleteSession).callCount).toBe(0);
	});

	it("revokes all account sessions and their verified login intents", async () => {
		td.when(repository.findAll(td.matchers.anything())).thenResolve([{ id: sessionId }, { id: "other-session" }]);
		await service.revokeAll({ session: authenticatedSession });
		td.verify(notpRepository.deleteIntentsForSessions({ sessionIds: [sessionId, "other-session"] }));
		td.verify(accessTokenRepository.deleteAccessTokenSessions({ sessionIds: [sessionId, "other-session"] }));
		td.verify(repository.deleteSessions({ accountId: accountId, sessionIds: [sessionId, "other-session"] }));
	});

	it("preserves a new login created after all-session revocation takes its snapshot", async () => {
		const lateSessionId = "388e5a3c-6480-40da-ae92-952931e32ac4";
		const durableSessionIds = new Set([sessionId]);
		td.when(repository.findAll(td.matchers.anything())).thenResolve([{ id: sessionId }]);
		td.when(repository.create(td.matchers.anything())).thenDo(
			async (params: Parameters<SessionRepository["create"]>[0]): ReturnType<SessionRepository["create"]> => {
				durableSessionIds.add(params.sessionId);
				return { id: params.sessionId, accountId: params.accountId };
			},
		);
		td.when(notpRepository.deleteIntentsForSessions(td.matchers.anything())).thenDo(async (): Promise<void> => {
			await service.create({ sessionId: lateSessionId, accountId: accountId, identityId: identityId });
		});
		td.when(repository.deleteSessions(td.matchers.anything())).thenDo(
			async (
				params: Parameters<SessionRepository["deleteSessions"]>[0],
			): ReturnType<SessionRepository["deleteSessions"]> => {
				for (const id of params.sessionIds) durableSessionIds.delete(id);
				return { count: params.sessionIds.length };
			},
		);

		await service.revokeAll({ session: authenticatedSession });

		expect([...durableSessionIds]).toEqual([lateSessionId]);
		td.verify(accessTokenRepository.deleteAccessTokenSessions({ sessionIds: [sessionId] }));
		td.verify(
			accessTokenRepository.create({
				accessTokenHash: tokens.accessTokenHash,
				session: { sessionId: lateSessionId, accountId: accountId, expiresAt: tokens.accessExpiresAt },
			}),
		);
	});

	it("cleans expired refresh records using the service-owned clock", async () => {
		await service.deleteExpired();
		td.verify(repository.deleteExpired({ now: now }));
	});
});
