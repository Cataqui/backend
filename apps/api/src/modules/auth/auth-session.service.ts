import { Injectable } from "@nestjs/common";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { AuthTokenService } from "./auth-token.service";
import { InvalidRefreshTokenError } from "./errors/invalid-refresh-token.error";
import { NotpRepository } from "./notp/repositories/notp.repository";
import type { IAuthenticatedSession } from "./interfaces/authenticated-session.interface";
import { AuthAccessTokenRepository } from "./repositories/auth-access-token.repository";
import { AuthSessionRepository } from "./repositories/auth-session.repository";
import { AuthSessionOutputSchema } from "./schemas/auth-session-output.schema";

@Injectable()
export class AuthSessionService {
	constructor(
		private readonly _authAccessTokenRepository: AuthAccessTokenRepository,
		private readonly _notpRepository: NotpRepository,
		private readonly _authTokenService: AuthTokenService,
		private readonly _authSessionRepository: AuthSessionRepository,
	) {}

	async getActiveSessionFromAccessTokenOrNull(params: { accessToken: string }): Promise<IAuthenticatedSession | null> {
		return this._authAccessTokenRepository.findActiveAccessTokenSession({
			accessTokenHash: this._authTokenService.hashAccessToken({ accessToken: params.accessToken }),
		});
	}

	async create(params: {
		sessionId?: string;
		userId: string;
		authIdentityId: string;
	}): Promise<z.infer<typeof AuthSessionOutputSchema>> {
		const sessionId = params.sessionId ?? randomUUID();
		const tokens = this._authTokenService.createAccessAndRefreshTokens({ sessionId: sessionId });

		const session = await this._authSessionRepository.createOrReplaceForUser({
			sessionId: sessionId,
			userId: params.userId,
			authIdentityId: params.authIdentityId,
			refreshTokenHash: tokens.refreshTokenHash,
			refreshExpiresAt: tokens.refreshExpiresAt,
		});

		try {
			await this._authAccessTokenRepository.create({
				accessTokenHash: tokens.accessTokenHash,
				session: { ...session, expiresAt: tokens.accessExpiresAt },
			});
		} catch (error) {
			await this.deleteAccessTokenAndSession({
				sessionId: session.sessionId,
				userId: session.userId,
			});

			throw error;
		}

		return {
			accessToken: tokens.accessToken,
			tokenType: "Bearer",
			expiresAt: tokens.accessExpiresAt.toISOString(),
			refreshToken: tokens.refreshToken,
			refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
			userId: session.userId,
		};
	}

	async refresh(params: { currentRefreshToken: string }): Promise<z.infer<typeof AuthSessionOutputSchema>> {
		const now = new Date();

		const authenticatedRefreshToken = this._authTokenService.getAuthenticatedRefreshTokenOrNull({
			refreshToken: params.currentRefreshToken,
		});

		if (authenticatedRefreshToken === null) throw new InvalidRefreshTokenError();

		const currentSession = await this._authSessionRepository.findRefreshSessionById({
			sessionId: authenticatedRefreshToken.sessionId,
		});

		if (currentSession === null || currentSession.refreshExpiresAt <= now) throw new InvalidRefreshTokenError();

		const presentedRefreshTokenHash = Buffer.from(authenticatedRefreshToken.refreshTokenHash, "hex");
		const isCurrentRefreshToken = timingSafeEqual(
			Buffer.from(currentSession.refreshTokenHash, "hex"),
			presentedRefreshTokenHash,
		);

		const isRecoverablePreviousRefreshToken =
			currentSession.previousRefreshTokenHash !== null &&
			currentSession.previousRefreshTokenValidUntil !== null &&
			currentSession.previousRefreshTokenValidUntil > now &&
			timingSafeEqual(Buffer.from(currentSession.previousRefreshTokenHash, "hex"), presentedRefreshTokenHash);

		if (!isCurrentRefreshToken && !isRecoverablePreviousRefreshToken) {
			await this.deleteAccessTokenAndSession({
				sessionId: currentSession.sessionId,
				userId: currentSession.userId,
			});

			throw new InvalidRefreshTokenError();
		}

		const tokens = this._authTokenService.createAccessAndRefreshTokens({ sessionId: currentSession.sessionId });

		const refreshResult = await this._authSessionRepository.rotateRefreshToken({
			now: now,
			currentRefreshTokenHash: currentSession.refreshTokenHash,
			...(isRecoverablePreviousRefreshToken
				? { presentedPreviousRefreshTokenHash: authenticatedRefreshToken.refreshTokenHash }
				: {}),
			newRefreshExpiresAt: tokens.refreshExpiresAt,
			newRefreshTokenHash: tokens.refreshTokenHash,
			newPreviousRefreshTokenValidUntil: new Date(now.getTime() + 60_000),
			sessionId: currentSession.sessionId,
		});

		if (refreshResult.status !== "ROTATED") {
			await this._authAccessTokenRepository.deleteForSession({
				sessionId: currentSession.sessionId,
			});

			throw new InvalidRefreshTokenError();
		}

		try {
			await this._authAccessTokenRepository.create({
				accessTokenHash: tokens.accessTokenHash,
				session: { ...refreshResult.session, expiresAt: tokens.accessExpiresAt },
			});
		} catch (error) {
			await this.deleteAccessTokenAndSession({
				sessionId: refreshResult.session.sessionId,
				userId: refreshResult.session.userId,
			});

			throw error;
		}

		return {
			accessToken: tokens.accessToken,
			tokenType: "Bearer",
			expiresAt: tokens.accessExpiresAt.toISOString(),
			refreshExpiresAt: refreshResult.refreshExpiresAt.toISOString(),
			refreshToken: tokens.refreshToken,
			userId: refreshResult.session.userId,
		};
	}

	async logout(params: { refreshToken: string }): Promise<void> {
		const authenticatedRefreshToken = this._authTokenService.getAuthenticatedRefreshTokenOrNull({
			refreshToken: params.refreshToken,
		});

		if (authenticatedRefreshToken === null) return;

		const session = await this._authSessionRepository.findRefreshSessionById({
			sessionId: authenticatedRefreshToken.sessionId,
		});

		if (session === null) return;

		await this._notpRepository.deleteIntentsForSessions({ sessionIds: [session.sessionId] });
		await this.deleteAccessTokenAndSession({
			sessionId: session.sessionId,
			userId: session.userId,
		});
	}

	async deleteAccessTokenAndSession(params: { sessionId: string; userId: string }): Promise<void> {
		// Redis authorizes access, so invalidate it before deleting durable session state from Neon.
		await this._authAccessTokenRepository.deleteForSession({ sessionId: params.sessionId });
		await this._authSessionRepository.deleteSession({ sessionId: params.sessionId, userId: params.userId });
	}

	async revokeAll(params: { session: IAuthenticatedSession }): Promise<void> {
		const sessions = await this._authSessionRepository.findAll({
			userId: params.session.userId,
		});

		const sessionIds = sessions.map((session) => session.sessionId);
		await this._notpRepository.deleteIntentsForSessions({ sessionIds: sessionIds });

		await this._authAccessTokenRepository.deleteAccessTokenSessions({
			sessionIds: sessionIds,
		});

		await this._authSessionRepository.deleteAll({ userId: params.session.userId });
	}
}
