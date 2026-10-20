import { injectable } from "tsyringe";
import { type Prisma, PrismaClient } from "../generated/prisma/client";

@injectable()
export class SessionRepository {
	constructor(private readonly _prisma: PrismaClient) {}

	async create(params: {
		now: Date;
		refreshExpiresAt: Date;
		refreshTokenHash: string;
		sessionId: string;
		accountId: string;
		identityId: string;
	}): Promise<{ id: string; accountId: string }> {
		return this._prisma.session.create({
			data: {
				id: params.sessionId,
				accountId: params.accountId,
				identityId: params.identityId,
				lastUsedAt: params.now,
				previousRefreshTokenHash: null,
				previousRefreshTokenValidUntil: null,
				refreshExpiresAt: params.refreshExpiresAt,
				refreshTokenHash: params.refreshTokenHash,
			},
			select: { id: true, accountId: true },
		});
	}

	async replaceCredentials(params: {
		now: Date;
		refreshExpiresAt: Date;
		refreshTokenHash: string;
		sessionId: string;
		accountId: string;
		identityId: string;
	}): Promise<Prisma.BatchPayload> {
		return this._prisma.session.updateMany({
			where: { id: params.sessionId, accountId: params.accountId, identityId: params.identityId },
			data: {
				lastUsedAt: params.now,
				previousRefreshTokenHash: null,
				previousRefreshTokenValidUntil: null,
				refreshExpiresAt: params.refreshExpiresAt,
				refreshTokenHash: params.refreshTokenHash,
			},
		});
	}

	async findById(params: { sessionId: string }): Promise<{
		id: string;
		accountId: string;
		identityId: string;
		previousRefreshTokenHash: string | null;
		previousRefreshTokenValidUntil: Date | null;
		refreshExpiresAt: Date;
		refreshTokenHash: string;
	} | null> {
		return this._prisma.session.findUnique({
			where: { id: params.sessionId },
			select: {
				id: true,
				accountId: true,
				identityId: true,
				previousRefreshTokenHash: true,
				previousRefreshTokenValidUntil: true,
				refreshExpiresAt: true,
				refreshTokenHash: true,
			},
		});
	}

	async rotateRefreshToken(params: {
		now: Date;
		currentRefreshTokenHash: string;
		presentedPreviousRefreshTokenHash?: string;
		newRefreshExpiresAt: Date;
		newRefreshTokenHash: string;
		newPreviousRefreshTokenValidUntil: Date;
		sessionId: string;
	}): Promise<Prisma.BatchPayload> {
		return this._prisma.session.updateMany({
			where: {
				id: params.sessionId,
				...(params.presentedPreviousRefreshTokenHash === undefined
					? {}
					: {
							previousRefreshTokenHash: params.presentedPreviousRefreshTokenHash,
							previousRefreshTokenValidUntil: { gt: params.now },
						}),
				refreshExpiresAt: { gt: params.now },
				refreshTokenHash: params.currentRefreshTokenHash,
			},
			data: {
				lastUsedAt: params.now,
				previousRefreshTokenHash: params.currentRefreshTokenHash,
				previousRefreshTokenValidUntil: params.newPreviousRefreshTokenValidUntil,
				refreshExpiresAt: params.newRefreshExpiresAt,
				refreshTokenHash: params.newRefreshTokenHash,
			},
		});
	}

	async deleteSession(params: { sessionId: string; accountId: string }): Promise<Prisma.BatchPayload> {
		return this._prisma.session.deleteMany({ where: { id: params.sessionId, accountId: params.accountId } });
	}

	async findAll(params: { accountId: string }): Promise<Array<{ id: string }>> {
		return this._prisma.session.findMany({ where: { accountId: params.accountId }, select: { id: true } });
	}

	async deleteSessions(params: { accountId: string; sessionIds: string[] }): Promise<Prisma.BatchPayload> {
		return this._prisma.session.deleteMany({
			where: { accountId: params.accountId, id: { in: params.sessionIds } },
		});
	}

	async deleteExpired(params: { now: Date }): Promise<Prisma.BatchPayload> {
		return this._prisma.session.deleteMany({ where: { refreshExpiresAt: { lte: params.now } } });
	}
}
