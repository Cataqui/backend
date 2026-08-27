import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createHash } from "node:crypto";
import { AuthSessionService } from "./auth-session.service";
import { AuthSessionCompensationReason } from "./auth-session-compensation-reason.enum";
import { AuthSessionObservabilityConstants } from "./auth-session-observability.constants";
import { AuthTokenService } from "./auth-token.service";
import { type IAuthConfig, authConfig as authConfigFactory } from "./auth.config";
import { AuthSessionUnavailableError } from "./errors/auth-session-unavailable.error";
import { InvalidRefreshTokenError } from "./errors/invalid-refresh-token.error";
import { AuthAccessTokenRepository } from "./repositories/auth-access-token.repository";
import { NotpRepository } from "./notp/repositories/notp.repository";
import { AuthSessionRepository } from "./repositories/auth-session.repository";

const SESSION_ID = "5c474828-dd9e-4490-a45a-0e82512bc45e";
const OTHER_SESSION_ID = "b2527587-3416-4da0-a2b6-d8a04acb1074";
const authConfig: IAuthConfig = {
	refreshTokenHmacCurrentKid: "current",
	refreshTokenHmacKeys: {
		current: Buffer.alloc(32, 1).toString("base64url"),
		previous: Buffer.alloc(32, 2).toString("base64url"),
	},
};

describe("AuthSessionService", () => {
	let service: AuthSessionService;
	let tokenService: AuthTokenService;
	let repository: {
		deleteAll: ReturnType<typeof vi.fn>;
		deleteSession: ReturnType<typeof vi.fn>;
		findAll: ReturnType<typeof vi.fn>;
		findRefreshSessionById: ReturnType<typeof vi.fn>;
		rotateRefreshToken: ReturnType<typeof vi.fn>;
		createOrReplaceForUser: ReturnType<typeof vi.fn>;
	};
	let accessTokenRepository: {
		create: ReturnType<typeof vi.fn>;
		deleteAccessTokenSessions: ReturnType<typeof vi.fn>;
		deleteForSession: ReturnType<typeof vi.fn>;
		findActiveAccessTokenSession: ReturnType<typeof vi.fn>;
	};
	let notpRepository: { deleteIntentsForSessions: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		repository = {
			deleteAll: vi.fn(),
			deleteSession: vi.fn(),
			findAll: vi.fn(),
			findRefreshSessionById: vi.fn(),
			rotateRefreshToken: vi.fn(),
			createOrReplaceForUser: vi.fn(),
		};
		accessTokenRepository = {
			create: vi.fn(),
			deleteAccessTokenSessions: vi.fn(),
			deleteForSession: vi.fn(),
			findActiveAccessTokenSession: vi.fn(),
		};
		notpRepository = { deleteIntentsForSessions: vi.fn() };
		const module = await Test.createTestingModule({
			providers: [
				AuthTokenService,
				AuthSessionService,
				{ provide: authConfigFactory.KEY, useValue: authConfig },
				{ provide: AuthAccessTokenRepository, useValue: accessTokenRepository },
				{ provide: NotpRepository, useValue: notpRepository },
				{ provide: AuthSessionRepository, useValue: repository },
			],
		}).compile();
		service = module.get(AuthSessionService);
		tokenService = module.get(AuthTokenService);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("should create a signed rolling refresh token and a short-lived access token", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
		repository.createOrReplaceForUser.mockResolvedValue({ sessionId: SESSION_ID, userId: "user-id" });

		const result = await service.create({ sessionId: SESSION_ID, userId: "user-id" });

		expect(result).toEqual({
			accessToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
			tokenType: "Bearer",
			expiresAt: "2026-08-05T15:15:00.000Z",
			refreshToken: expect.stringMatching(
				new RegExp(`^rt1\\.current\\.${SESSION_ID}\\.[A-Za-z0-9_-]{43}\\.[A-Za-z0-9_-]{43}$`),
			),
			refreshExpiresAt: "2026-09-04T15:00:00.000Z",
			userId: "user-id",
		});
	});

	it("should store only the complete signed refresh-token hash", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
		repository.createOrReplaceForUser.mockResolvedValue({ sessionId: SESSION_ID, userId: "user-id" });

		const result = await service.create({ sessionId: SESSION_ID, userId: "user-id" });

		expect(repository.createOrReplaceForUser).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			userId: "user-id",
			refreshTokenHash: createHash("sha256").update(result.refreshToken).digest("hex"),
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
		});
	});

	it("should generate a session family identifier when the caller does not provide one", async () => {
		repository.createOrReplaceForUser.mockImplementation(
			async (params: { sessionId: string; userId: string }) => params,
		);

		await service.create({ userId: "user-id" });

		expect(repository.createOrReplaceForUser).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
				userId: "user-id",
			}),
		);
	});

	it("should register only the access-token hash when creating a session", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
		repository.createOrReplaceForUser.mockResolvedValue({ sessionId: SESSION_ID, userId: "user-id" });

		const result = await service.create({ sessionId: SESSION_ID, userId: "user-id" });

		expect(accessTokenRepository.create).toHaveBeenCalledWith({
			accessTokenHash: createHash("sha256").update(result.accessToken).digest("hex"),
			session: { sessionId: SESSION_ID, userId: "user-id", expiresAt: new Date("2026-08-05T15:15:00.000Z") },
		});
	});

	it("should remove both stores when Redis cannot register a created access token", async () => {
		repository.createOrReplaceForUser.mockResolvedValue({ sessionId: SESSION_ID, userId: "user-id" });
		accessTokenRepository.create.mockRejectedValue(new AuthSessionUnavailableError());

		const error = await service.create({ sessionId: SESSION_ID, userId: "user-id" }).catch((caught: unknown) => caught);

		expect({
			error: error,
			accessDeletion: accessTokenRepository.deleteForSession.mock.calls[0]?.[0],
			sessionDeletion: repository.deleteSession.mock.calls[0]?.[0],
		}).toEqual({
			error: expect.any(AuthSessionUnavailableError),
			accessDeletion: { sessionId: SESSION_ID },
			sessionDeletion: { sessionId: SESSION_ID, userId: "user-id" },
		});
	});

	it("should preserve access-token creation failure when session compensation also fails", async () => {
		const accessTokenCreationError = new AuthSessionUnavailableError();
		repository.createOrReplaceForUser.mockResolvedValue({ sessionId: SESSION_ID, userId: "user-id" });
		accessTokenRepository.create.mockRejectedValue(accessTokenCreationError);
		accessTokenRepository.deleteForSession.mockRejectedValue(new Error("private compensation details"));
		const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		const error = await service.create({ sessionId: SESSION_ID, userId: "user-id" }).catch((caught: unknown) => caught);

		expect({
			error: error,
			leaksCompensationMessage: JSON.stringify(log.mock.calls).includes("private compensation details"),
			logFields: log.mock.calls[0]?.[0],
		}).toEqual({
			error: accessTokenCreationError,
			leaksCompensationMessage: false,
			logFields: expect.objectContaining({
				errorName: "Error",
				errorStackFrames: expect.stringContaining("auth-session.service.spec.ts"),
				event: AuthSessionObservabilityConstants.PERSISTENCE_COMPENSATION_FAILED_EVENT,
				outcome: "STATE_UNCERTAIN",
				reason: AuthSessionCompensationReason.ACCESS_TOKEN_CREATE_FAILED_AFTER_SESSION_CREATE,
			}),
		});
	});

	it("should find an active access-token session by the SHA-256 bearer hash", async () => {
		accessTokenRepository.findActiveAccessTokenSession.mockResolvedValue(null);

		await service.getActiveSessionFromAccessTokenOrNull({ accessToken: "secret-access-token" });

		expect(accessTokenRepository.findActiveAccessTokenSession).toHaveBeenCalledWith({
			accessTokenHash: createHash("sha256").update("secret-access-token").digest("hex"),
		});
	});

	it("should reject a forged refresh token before querying PostgreSQL", async () => {
		await expect(
			service.refresh({ currentRefreshToken: `rt1.current.${SESSION_ID}.${"a".repeat(43)}.${"b".repeat(43)}` }),
		).rejects.toThrow(InvalidRefreshTokenError);
	});

	it("should not query PostgreSQL for a forged refresh token", async () => {
		await service
			.refresh({ currentRefreshToken: `rt1.current.${SESSION_ID}.${"a".repeat(43)}.${"b".repeat(43)}` })
			.catch(() => undefined);

		expect(repository.findRefreshSessionById).not.toHaveBeenCalled();
	});

	it("should reject an authenticated token for an unknown session family", async () => {
		const refreshToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID }).refreshToken;
		repository.findRefreshSessionById.mockResolvedValue(null);

		await expect(service.refresh({ currentRefreshToken: refreshToken })).rejects.toThrow(InvalidRefreshTokenError);
	});

	it("should reject an expired session family", async () => {
		const token = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		repository.findRefreshSessionById.mockResolvedValue({
			previousRefreshTokenHash: null,
			previousRefreshTokenValidUntil: null,
			refreshExpiresAt: new Date(Date.now() - 1),
			refreshTokenHash: token.refreshTokenHash,
			sessionId: SESSION_ID,
			userId: "user-id",
		});

		await expect(service.refresh({ currentRefreshToken: token.refreshToken })).rejects.toThrow(
			InvalidRefreshTokenError,
		);
	});

	it("should revoke one device session when a token older than the immediately previous token is replayed", async () => {
		const olderToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		const previousToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		const currentToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		repository.findRefreshSessionById.mockResolvedValue({
			previousRefreshTokenHash: previousToken.refreshTokenHash,
			previousRefreshTokenValidUntil: new Date(Date.now() + 30_000),
			refreshExpiresAt: new Date(Date.now() + 60_000),
			refreshTokenHash: currentToken.refreshTokenHash,
			sessionId: SESSION_ID,
			userId: "user-id",
		});

		const error = await service
			.refresh({ currentRefreshToken: olderToken.refreshToken })
			.catch((caught: unknown) => caught);

		expect({
			error: error,
			accessDeletion: accessTokenRepository.deleteForSession.mock.calls[0]?.[0],
			sessionDeletion: repository.deleteSession.mock.calls[0]?.[0],
		}).toEqual({
			error: expect.any(InvalidRefreshTokenError),
			accessDeletion: { sessionId: SESSION_ID },
			sessionDeletion: { sessionId: SESSION_ID, userId: "user-id" },
		});
	});

	it("should leave other device sessions untouched after replay revocation", async () => {
		const olderToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		const previousToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		const currentToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		repository.findRefreshSessionById.mockResolvedValue({
			previousRefreshTokenHash: previousToken.refreshTokenHash,
			previousRefreshTokenValidUntil: new Date(Date.now() + 30_000),
			refreshExpiresAt: new Date(Date.now() + 60_000),
			refreshTokenHash: currentToken.refreshTokenHash,
			sessionId: SESSION_ID,
			userId: "user-id",
		});

		await service.refresh({ currentRefreshToken: olderToken.refreshToken }).catch(() => undefined);

		expect(repository.deleteSession).not.toHaveBeenCalledWith({ sessionId: OTHER_SESSION_ID, userId: "user-id" });
	});

	it("should recover a lost refresh response by rotating the immediately previous token within sixty seconds", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
		const originalToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		repository.findRefreshSessionById.mockResolvedValueOnce({
			previousRefreshTokenHash: null,
			previousRefreshTokenValidUntil: null,
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			refreshTokenHash: originalToken.refreshTokenHash,
			sessionId: SESSION_ID,
			userId: "user-id",
		});
		repository.rotateRefreshToken.mockResolvedValue({
			status: "ROTATED",
			session: { sessionId: SESSION_ID, userId: "user-id" },
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
		});

		const lostResponse = await service.refresh({ currentRefreshToken: originalToken.refreshToken });
		const lostResponseRefreshTokenHash = createHash("sha256").update(lostResponse.refreshToken).digest("hex");
		repository.findRefreshSessionById.mockResolvedValueOnce({
			previousRefreshTokenHash: originalToken.refreshTokenHash,
			previousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			refreshTokenHash: lostResponseRefreshTokenHash,
			sessionId: SESSION_ID,
			userId: "user-id",
		});

		const recoveredResponse = await service.refresh({ currentRefreshToken: originalToken.refreshToken });

		expect({
			refreshToken: recoveredResponse.refreshToken,
			recoveryRotation: repository.rotateRefreshToken.mock.calls[1]?.[0],
			sessionDeleted: repository.deleteSession.mock.calls.length,
		}).toEqual({
			refreshToken: expect.stringMatching(new RegExp(`^rt1\\.current\\.${SESSION_ID}\\.`)),
			recoveryRotation: {
				now: new Date("2026-08-05T15:00:00.000Z"),
				currentRefreshTokenHash: lostResponseRefreshTokenHash,
				presentedPreviousRefreshTokenHash: originalToken.refreshTokenHash,
				newRefreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
				newRefreshTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
				newPreviousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
				sessionId: SESSION_ID,
			},
			sessionDeleted: 0,
		});
	});

	it("should revoke the device session when the immediately previous token recovery window has expired", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:01:00.001Z"));
		const previousToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		const currentToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		repository.findRefreshSessionById.mockResolvedValue({
			previousRefreshTokenHash: previousToken.refreshTokenHash,
			previousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			refreshTokenHash: currentToken.refreshTokenHash,
			sessionId: SESSION_ID,
			userId: "user-id",
		});

		const error = await service
			.refresh({ currentRefreshToken: previousToken.refreshToken })
			.catch((caught: unknown) => caught);

		expect({ error: error, sessionDeletion: repository.deleteSession.mock.calls[0]?.[0] }).toEqual({
			error: expect.any(InvalidRefreshTokenError),
			sessionDeletion: { sessionId: SESSION_ID, userId: "user-id" },
		});
	});

	it("should atomically rotate the authenticated current refresh token", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
		const currentToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		repository.findRefreshSessionById.mockResolvedValue({
			previousRefreshTokenHash: null,
			previousRefreshTokenValidUntil: null,
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			refreshTokenHash: currentToken.refreshTokenHash,
			sessionId: SESSION_ID,
			userId: "user-id",
		});
		repository.rotateRefreshToken.mockResolvedValue({
			status: "ROTATED",
			session: { sessionId: SESSION_ID, userId: "user-id" },
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
		});

		await service.refresh({ currentRefreshToken: currentToken.refreshToken });

		expect(repository.rotateRefreshToken).toHaveBeenCalledWith({
			now: new Date("2026-08-05T15:00:00.000Z"),
			currentRefreshTokenHash: currentToken.refreshTokenHash,
			newRefreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			newRefreshTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
			newPreviousRefreshTokenValidUntil: new Date("2026-08-05T15:01:00.000Z"),
			sessionId: SESSION_ID,
		});
	});

	it("should return newly signed session tokens after a successful rotation", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
		const currentToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		repository.findRefreshSessionById.mockResolvedValue({
			previousRefreshTokenHash: null,
			previousRefreshTokenValidUntil: null,
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
			refreshTokenHash: currentToken.refreshTokenHash,
			sessionId: SESSION_ID,
			userId: "user-id",
		});
		repository.rotateRefreshToken.mockResolvedValue({
			status: "ROTATED",
			session: { sessionId: SESSION_ID, userId: "user-id" },
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
		});

		const result = await service.refresh({ currentRefreshToken: currentToken.refreshToken });

		expect(result).toEqual({
			accessToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
			tokenType: "Bearer",
			expiresAt: "2026-08-05T15:15:00.000Z",
			refreshToken: expect.stringMatching(new RegExp(`^rt1\\.current\\.${SESSION_ID}\\.`)),
			refreshExpiresAt: "2026-09-04T15:00:00.000Z",
			userId: "user-id",
		});
	});

	it("should invalidate Redis when a concurrent refresh wins the compare-and-set", async () => {
		const currentToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		repository.findRefreshSessionById.mockResolvedValue({
			previousRefreshTokenHash: null,
			previousRefreshTokenValidUntil: null,
			refreshExpiresAt: new Date(Date.now() + 60_000),
			refreshTokenHash: currentToken.refreshTokenHash,
			sessionId: SESSION_ID,
			userId: "user-id",
		});
		repository.rotateRefreshToken.mockResolvedValue({ status: "ALREADY_ROTATED" });

		const error = await service
			.refresh({ currentRefreshToken: currentToken.refreshToken })
			.catch((caught: unknown) => caught);

		expect({ error: error, deletion: accessTokenRepository.deleteForSession.mock.calls[0]?.[0] }).toEqual({
			error: expect.any(InvalidRefreshTokenError),
			deletion: { sessionId: SESSION_ID },
		});
	});

	it("should remove both stores when Redis cannot register a rotated access token", async () => {
		const currentToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		repository.findRefreshSessionById.mockResolvedValue({
			previousRefreshTokenHash: null,
			previousRefreshTokenValidUntil: null,
			refreshExpiresAt: new Date(Date.now() + 60_000),
			refreshTokenHash: currentToken.refreshTokenHash,
			sessionId: SESSION_ID,
			userId: "user-id",
		});
		repository.rotateRefreshToken.mockResolvedValue({
			status: "ROTATED",
			session: { sessionId: SESSION_ID, userId: "user-id" },
			refreshExpiresAt: new Date(Date.now() + 120_000),
		});
		accessTokenRepository.create.mockRejectedValue(new AuthSessionUnavailableError());

		const error = await service
			.refresh({ currentRefreshToken: currentToken.refreshToken })
			.catch((caught: unknown) => caught);

		expect({ error: error, deletion: repository.deleteSession.mock.calls[0]?.[0] }).toEqual({
			error: expect.any(AuthSessionUnavailableError),
			deletion: { sessionId: SESSION_ID, userId: "user-id" },
		});
	});

	it("should revoke a family during logout when given an authenticated historical token", async () => {
		const historicalToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID });
		repository.findRefreshSessionById.mockResolvedValue({
			previousRefreshTokenHash: null,
			previousRefreshTokenValidUntil: null,
			refreshExpiresAt: new Date(Date.now() + 60_000),
			refreshTokenHash: "f".repeat(64),
			sessionId: SESSION_ID,
			userId: "user-id",
		});

		await service.logout({ refreshToken: historicalToken.refreshToken });

		expect({
			intentDeletion: notpRepository.deleteIntentsForSessions.mock.calls[0]?.[0],
			accessDeletion: accessTokenRepository.deleteForSession.mock.calls[0]?.[0],
			sessionDeletion: repository.deleteSession.mock.calls[0]?.[0],
		}).toEqual({
			intentDeletion: { sessionIds: [SESSION_ID] },
			accessDeletion: { sessionId: SESSION_ID },
			sessionDeletion: { sessionId: SESSION_ID, userId: "user-id" },
		});
	});

	it("should treat malformed refresh tokens as an idempotent logout", async () => {
		await service.logout({ refreshToken: "not-a-signed-token" });

		expect(repository.findRefreshSessionById).not.toHaveBeenCalled();
	});

	it("should treat an authenticated token for an already deleted family as an idempotent logout", async () => {
		const refreshToken = tokenService.createAccessAndRefreshTokens({ sessionId: SESSION_ID }).refreshToken;
		repository.findRefreshSessionById.mockResolvedValue(null);

		await service.logout({ refreshToken: refreshToken });

		expect(accessTokenRepository.deleteForSession).not.toHaveBeenCalled();
	});

	it("should delete every access token before deleting all user sessions", async () => {
		repository.findAll.mockResolvedValue([{ sessionId: SESSION_ID }, { sessionId: OTHER_SESSION_ID }]);

		await service.revokeAll({
			session: { sessionId: SESSION_ID, userId: "user-id", expiresAt: new Date("2026-09-04T15:00:00.000Z") },
		});

		expect({
			accessSessionIds: accessTokenRepository.deleteAccessTokenSessions.mock.calls[0]?.[0],
			deletedSessions: repository.deleteAll.mock.calls[0]?.[0],
		}).toEqual({
			accessSessionIds: { sessionIds: [SESSION_ID, OTHER_SESSION_ID] },
			deletedSessions: { userId: "user-id" },
		});
	});

	it("should delete every verified intent during all-session revocation", async () => {
		repository.findAll.mockResolvedValue([{ sessionId: SESSION_ID }, { sessionId: OTHER_SESSION_ID }]);

		await service.revokeAll({
			session: { sessionId: SESSION_ID, userId: "user-id", expiresAt: new Date("2026-09-04T15:00:00.000Z") },
		});

		expect(notpRepository.deleteIntentsForSessions).toHaveBeenCalledWith({
			sessionIds: [SESSION_ID, OTHER_SESSION_ID],
		});
	});
});
