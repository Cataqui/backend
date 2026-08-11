import { Injectable } from "@nestjs/common";
import { RedisService } from "../../../core/redis/redis.service";
import type { IAuthenticatedSession } from "../interfaces/authenticated-session.interface";

@Injectable()
export class AuthAccessTokenRepository {
	constructor(private readonly _redis: RedisService) {}

	async create(params: { accessTokenHash: string; session: IAuthenticatedSession }): Promise<void> {
		const expirationSeconds = Math.ceil((params.session.expiresAt.getTime() - Date.now()) / 1000);
		if (expirationSeconds <= 0) throw new RangeError("session.expiresAt must be in the future");

		await this._redis.eval<string[], number>(
			`
				local previousAccessTokenHash = redis.call("GET", KEYS[2])
				if previousAccessTokenHash then
					redis.call("DEL", ARGV[1] .. previousAccessTokenHash)
				end

				redis.call("HSET", KEYS[1],
					"session_id", ARGV[2],
					"user_id", ARGV[3],
					"expires_at", ARGV[4]
				)
				redis.call("EXPIRE", KEYS[1], tonumber(ARGV[5]))
				redis.call("SET", KEYS[2], ARGV[6], "EX", tonumber(ARGV[5]))
				return 1
			`,
			[
				this._buildSessionByAccessTokenHashRedisKey({ accessTokenHash: params.accessTokenHash }),
				this._buildAccessTokenHashBySessionIdRedisKey({ sessionId: params.session.sessionId }),
			],
			[
				this._buildSessionByAccessTokenHashRedisKey({ accessTokenHash: "" }),
				params.session.sessionId,
				params.session.userId,
				params.session.expiresAt.toISOString(),
				String(expirationSeconds),
				params.accessTokenHash,
			],
		);
	}

	async findActiveAccessTokenSession(params: { accessTokenHash: string }): Promise<IAuthenticatedSession | null> {
		const storedSession = await this._redis.hgetall<Record<string, string>>(
			this._buildSessionByAccessTokenHashRedisKey({ accessTokenHash: params.accessTokenHash }),
		);

		if (storedSession === null) return null;

		const sessionId = storedSession["session_id"];
		const userId = storedSession["user_id"];
		const expiresAtValue = storedSession["expires_at"];
		if (typeof sessionId !== "string" || typeof userId !== "string" || typeof expiresAtValue !== "string") return null;

		const expiresAt = new Date(expiresAtValue);
		if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) return null;

		return {
			sessionId: sessionId,
			userId: userId,
			expiresAt: expiresAt,
		};
	}

	async deleteForSession(params: { sessionId: string }): Promise<void> {
		await this._redis.eval<string[], number>(
			`
				local accessTokenHash = redis.call("GET", KEYS[1])
				if accessTokenHash then redis.call("DEL", ARGV[1] .. accessTokenHash) end
				return redis.call("DEL", KEYS[1])
			`,
			[this._buildAccessTokenHashBySessionIdRedisKey({ sessionId: params.sessionId })],
			[this._buildSessionByAccessTokenHashRedisKey({ accessTokenHash: "" })],
		);
	}

	async deleteAccessTokenSessions(params: { sessionIds: string[] }): Promise<void> {
		if (params.sessionIds.length === 0) return;

		await this._redis.eval<string[], number>(
			`
				for _, sessionKey in ipairs(KEYS) do
					local accessTokenHash = redis.call("GET", sessionKey)
					if accessTokenHash then redis.call("DEL", ARGV[1] .. accessTokenHash) end
					redis.call("DEL", sessionKey)
				end
				return #KEYS
			`,
			params.sessionIds.map((sessionId) => this._buildAccessTokenHashBySessionIdRedisKey({ sessionId: sessionId })),
			[this._buildSessionByAccessTokenHashRedisKey({ accessTokenHash: "" })],
		);
	}

	private _buildSessionByAccessTokenHashRedisKey(params: { accessTokenHash: string }): string {
		return `auth:session-by-access-token-hash:${params.accessTokenHash}`;
	}

	private _buildAccessTokenHashBySessionIdRedisKey(params: { sessionId: string }): string {
		return `auth:access-token-hash-by-session-id:${params.sessionId}`;
	}
}
