import { randomUUID, timingSafeEqual } from "node:crypto";
import { injectable } from "tsyringe";
import type { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { NotpRepository } from "../notp/notp.repository";
import { AccessTokenRepository } from "./access-token.repository";
import { AuthSessionUnavailableError } from "./errors/auth-session-unavailable.error";
import { InvalidRefreshTokenError } from "./errors/invalid-refresh-token.error";
import { RefreshSessionRevokedError } from "./errors/refresh-session-revoked.error";
import { SessionRevokedError } from "./errors/session-revoked.error";
import type { SessionOutputSchema } from "./session-output.schema";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { SessionRepository } from "./session.repository";
import { TokenService } from "./token.service";

@injectable()
export class SessionService {
	constructor(
		private readonly _accessTokenRepository: AccessTokenRepository,
		private readonly _notpRepository: NotpRepository,
		private readonly _tokenService: TokenService,
		private readonly _repository: SessionRepository,
	) {}

	async getActiveSessionFromAccessTokenOrNull(params: { accessToken: string }): Promise<AuthenticatedSession | null> {
		const storedSession = await this._accessTokenRepository.findByAccessTokenHash({
			accessTokenHash: this._tokenService.hashAccessToken({ accessToken: params.accessToken }),
		});
		if (storedSession === null) return null;

		const expiresAt = new Date(storedSession.expires_at);
		if (expiresAt <= new Date()) return null;

		return {
			accountId: storedSession.account_id,
			sessionId: storedSession.session_id,
			expiresAt: storedSession.expires_at,
		};
	}

	async create(params: {
		sessionId?: string;
		accountId: string;
		identityId: string;
	}): Promise<z.infer<typeof SessionOutputSchema>> {
		const sessionId = params.sessionId ?? randomUUID();
		const tokens = this._tokenService.createAccessAndRefreshTokens({ sessionId: sessionId });
		const now = new Date();

		try {
			await this._repository.create({
				now: now,
				sessionId: sessionId,
				accountId: params.accountId,
				identityId: params.identityId,
				refreshTokenHash: tokens.refreshTokenHash,
				refreshExpiresAt: tokens.refreshExpiresAt,
			});
		} catch (error) {
			if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;

			const existingSession = await this._repository.findById({ sessionId: sessionId });
			const canResumeInterruptedExchange =
				existingSession !== null &&
				existingSession.accountId === params.accountId &&
				existingSession.identityId === params.identityId;

			if (!canResumeInterruptedExchange) {
				throw new AuthSessionUnavailableError();
			}

			const replacedSession = await this._repository.replaceCredentials({
				now: now,
				sessionId: sessionId,
				accountId: params.accountId,
				identityId: params.identityId,
				refreshTokenHash: tokens.refreshTokenHash,
				refreshExpiresAt: tokens.refreshExpiresAt,
			});
			if (replacedSession.count !== 1) {
				throw new AuthSessionUnavailableError();
			}
		}

		try {
			const published = await this._accessTokenRepository.create({
				accessTokenHash: tokens.accessTokenHash,
				session: { accountId: params.accountId, sessionId: sessionId, expiresAt: tokens.accessExpiresAt },
			});
			if (published === 0) {
				throw new SessionRevokedError();
			}
		} catch (error) {
			await this.deleteAccessTokenAndSession({ sessionId: sessionId, accountId: params.accountId });
			throw error;
		}

		return {
			accessToken: tokens.accessToken,
			tokenType: "Bearer",
			expiresAt: tokens.accessExpiresAt.toISOString(),
			refreshToken: tokens.refreshToken,
			refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
			accountId: params.accountId,
		};
	}

	async refresh(params: { currentRefreshToken: string }): Promise<z.infer<typeof SessionOutputSchema>> {
		const now = new Date();
		const authenticatedRefreshToken = this._tokenService.getAuthenticatedRefreshTokenOrNull({
			refreshToken: params.currentRefreshToken,
		});
		if (authenticatedRefreshToken === null) {
			throw new InvalidRefreshTokenError();
		}

		const currentSession = await this._repository.findById({ sessionId: authenticatedRefreshToken.sessionId });
		if (currentSession === null || currentSession.refreshExpiresAt <= now) {
			throw new InvalidRefreshTokenError();
		}

		const presentedHash = Buffer.from(authenticatedRefreshToken.refreshTokenHash, "hex");
		const isCurrentRefreshToken = timingSafeEqual(Buffer.from(currentSession.refreshTokenHash, "hex"), presentedHash);
		const isRecoverablePreviousRefreshToken =
			currentSession.previousRefreshTokenHash !== null &&
			currentSession.previousRefreshTokenValidUntil !== null &&
			currentSession.previousRefreshTokenValidUntil > now &&
			timingSafeEqual(Buffer.from(currentSession.previousRefreshTokenHash, "hex"), presentedHash);

		if (!isCurrentRefreshToken && !isRecoverablePreviousRefreshToken) {
			await this.deleteAccessTokenAndSession({ sessionId: currentSession.id, accountId: currentSession.accountId });
			throw new InvalidRefreshTokenError();
		}

		const tokens = this._tokenService.createAccessAndRefreshTokens({ sessionId: currentSession.id });
		const rotated = await this._repository.rotateRefreshToken({
			now: now,
			currentRefreshTokenHash: currentSession.refreshTokenHash,
			...(isRecoverablePreviousRefreshToken
				? { presentedPreviousRefreshTokenHash: authenticatedRefreshToken.refreshTokenHash }
				: {}),
			newRefreshExpiresAt: tokens.refreshExpiresAt,
			newRefreshTokenHash: tokens.refreshTokenHash,
			newPreviousRefreshTokenValidUntil: new Date(now.getTime() + 60_000),
			sessionId: currentSession.id,
		});

		if (rotated.count !== 1) {
			await this.deleteAccessTokenAndSession({ sessionId: currentSession.id, accountId: currentSession.accountId });
			throw new InvalidRefreshTokenError();
		}

		try {
			const published = await this._accessTokenRepository.create({
				accessTokenHash: tokens.accessTokenHash,
				session: {
					accountId: currentSession.accountId,
					sessionId: currentSession.id,
					expiresAt: tokens.accessExpiresAt,
				},
			});
			if (published === 0) {
				throw new RefreshSessionRevokedError();
			}
		} catch (error) {
			await this.deleteAccessTokenAndSession({ sessionId: currentSession.id, accountId: currentSession.accountId });
			throw error;
		}

		return {
			accessToken: tokens.accessToken,
			tokenType: "Bearer",
			expiresAt: tokens.accessExpiresAt.toISOString(),
			refreshToken: tokens.refreshToken,
			refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
			accountId: currentSession.accountId,
		};
	}

	async logout(params: { refreshToken: string }): Promise<void> {
		const authenticatedRefreshToken = this._tokenService.getAuthenticatedRefreshTokenOrNull({
			refreshToken: params.refreshToken,
		});
		if (authenticatedRefreshToken === null) return;

		const session = await this._repository.findById({ sessionId: authenticatedRefreshToken.sessionId });
		if (session === null) return;

		await this._notpRepository.deleteIntentsForSessions({ sessionIds: [session.id] });
		await this.deleteAccessTokenAndSession({ sessionId: session.id, accountId: session.accountId });
	}

	async deleteAccessTokenAndSession(params: { sessionId: string; accountId: string }): Promise<void> {
		await this._accessTokenRepository.deleteForSession({ sessionId: params.sessionId });
		await this._repository.deleteSession({ sessionId: params.sessionId, accountId: params.accountId });
	}

	async revokeAll(params: { session: AuthenticatedSession }): Promise<void> {
		const sessions = await this._repository.findAll({ accountId: params.session.accountId });
		const sessionIds = sessions.map((session) => session.id);
		await this._notpRepository.deleteIntentsForSessions({ sessionIds: sessionIds });
		await this._accessTokenRepository.deleteAccessTokenSessions({ sessionIds: sessionIds });
		await this._repository.deleteSessions({ accountId: params.session.accountId, sessionIds: sessionIds });
	}

	async deleteExpired(): Promise<void> {
		await this._repository.deleteExpired({ now: new Date() });
	}
}
