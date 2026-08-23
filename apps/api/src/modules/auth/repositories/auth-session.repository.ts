import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AuthSessionUnavailableError } from "../errors/auth-session-unavailable.error";

@Injectable()
export class AuthSessionRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async createOrReplaceForUser(params: {
		refreshExpiresAt: Date;
		refreshTokenHash: string;
		sessionId: string;
		userId: string;
	}): Promise<{ sessionId: string; userId: string }> {
		const now = new Date();
		const sessionData = {
			lastUsedAt: now,
			previousRefreshTokenHash: null,
			previousRefreshTokenValidUntil: null,
			refreshExpiresAt: params.refreshExpiresAt,
			refreshTokenHash: params.refreshTokenHash,
		};

		try {
			const session = await this._prisma.authSession.create({
				data: {
					id: params.sessionId,
					userId: params.userId,
					...sessionData,
				},
				select: { id: true, userId: true },
			});

			return {
				sessionId: session.id,
				userId: session.userId,
			};
		} catch (error) {
			if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
		}

		const existingSession = await this._prisma.authSession.findUnique({
			where: { id: params.sessionId },
			select: { id: true, userId: true },
		});
		if (existingSession === null || existingSession.userId !== params.userId) {
			throw new AuthSessionUnavailableError();
		}

		const replacedSession = await this._prisma.authSession.updateMany({
			where: { id: params.sessionId, userId: params.userId },
			data: sessionData,
		});

		if (replacedSession.count !== 1) throw new AuthSessionUnavailableError();

		return {
			sessionId: existingSession.id,
			userId: existingSession.userId,
		};
	}

	async findRefreshSessionById(params: { sessionId: string }): Promise<{
		previousRefreshTokenHash: string | null;
		previousRefreshTokenValidUntil: Date | null;
		refreshExpiresAt: Date;
		refreshTokenHash: string;
		sessionId: string;
		userId: string;
	} | null> {
		const session = await this._prisma.authSession.findUnique({
			where: { id: params.sessionId },
			select: {
				id: true,
				previousRefreshTokenHash: true,
				previousRefreshTokenValidUntil: true,
				refreshExpiresAt: true,
				refreshTokenHash: true,
				userId: true,
			},
		});

		if (session === null) return null;

		return {
			previousRefreshTokenHash: session.previousRefreshTokenHash,
			previousRefreshTokenValidUntil: session.previousRefreshTokenValidUntil,
			refreshExpiresAt: session.refreshExpiresAt,
			refreshTokenHash: session.refreshTokenHash,
			sessionId: session.id,
			userId: session.userId,
		};
	}

	async rotateRefreshToken(params: {
		now: Date;
		currentRefreshTokenHash: string;
		presentedPreviousRefreshTokenHash?: string;
		newRefreshExpiresAt: Date;
		newRefreshTokenHash: string;
		newPreviousRefreshTokenValidUntil: Date;
		sessionId: string;
	}): Promise<
		| { status: "ALREADY_ROTATED" }
		| {
				status: "ROTATED";
				session: { sessionId: string; userId: string };
				refreshExpiresAt: Date;
		  }
	> {
		return this._prisma.$transaction(async (transaction) => {
			const rotated = await transaction.authSession.updateMany({
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

			if (rotated.count === 0) {
				await transaction.authSession.deleteMany({
					where: { id: params.sessionId },
				});

				return { status: "ALREADY_ROTATED" };
			}

			const session = await transaction.authSession.findUniqueOrThrow({
				where: { id: params.sessionId },
				select: { id: true, userId: true },
			});

			return {
				status: "ROTATED",
				session: { sessionId: session.id, userId: session.userId },
				refreshExpiresAt: params.newRefreshExpiresAt,
			};
		});
	}

	async deleteSession(params: { sessionId: string; userId: string }): Promise<void> {
		await this._prisma.authSession.deleteMany({
			where: { id: params.sessionId, userId: params.userId },
		});
	}

	async findAll(params: { userId: string }): Promise<Array<{ sessionId: string }>> {
		const sessions = await this._prisma.authSession.findMany({
			where: { userId: params.userId },
			select: { id: true },
		});

		return sessions.map((session) => ({ sessionId: session.id }));
	}

	async deleteAll(params: { userId: string }): Promise<void> {
		await this._prisma.authSession.deleteMany({ where: { userId: params.userId } });
	}
}
