import { SessionExpirationInvalidError } from "./errors/session-expiration-invalid.error";
import { Redis } from "@upstash/redis";
import { injectable } from "tsyringe";

@injectable()
export class AccessTokenRepository {
	constructor(private readonly _redis: Redis) {}

	async create(params: {
		accessTokenHash: string;
		session: { accountId: string; sessionId: string; expiresAt: Date };
	}): Promise<number> {
		const expirationSeconds = Math.ceil((params.session.expiresAt.getTime() - Date.now()) / 1000);
		if (expirationSeconds <= 0) throw new SessionExpirationInvalidError();

		return this._redis.eval<string[], number>(
			`
				if redis.call("EXISTS", KEYS[3]) == 1 then return 0 end

				local previousAccessTokenHash = redis.call("GET", KEYS[2])
				if previousAccessTokenHash then
					redis.call("DEL", ARGV[1] .. previousAccessTokenHash)
				end

				redis.call("HSET", KEYS[1],
					"session_id", ARGV[2],
					"account_id", ARGV[3],
					"expires_at", ARGV[4]
				)
				redis.call("EXPIRE", KEYS[1], tonumber(ARGV[5]))
				redis.call("SET", KEYS[2], ARGV[6], "EX", tonumber(ARGV[5]))
				return 1
			`,
			[
				this._buildSessionByAccessTokenHashRedisKey({ accessTokenHash: params.accessTokenHash }),
				this._buildAccessTokenHashBySessionIdRedisKey({ sessionId: params.session.sessionId }),
				this._buildRevokedSessionRedisKey({ sessionId: params.session.sessionId }),
			],
			[
				this._buildSessionByAccessTokenHashRedisKey({ accessTokenHash: "" }),
				params.session.sessionId,
				params.session.accountId,
				params.session.expiresAt.toISOString(),
				String(expirationSeconds),
				params.accessTokenHash,
			],
		);
	}

	findByAccessTokenHash(params: {
		accessTokenHash: string;
	}): Promise<{ session_id: string; account_id: string; expires_at: string } | null> {
		return this._redis.hgetall<{ session_id: string; account_id: string; expires_at: string }>(
			this._buildSessionByAccessTokenHashRedisKey({ accessTokenHash: params.accessTokenHash }),
		);
	}

	async deleteForSession(params: { sessionId: string }): Promise<void> {
		await this._redis.eval<string[], number>(
			`
				redis.call("SET", KEYS[2], "1", "EX", tonumber(ARGV[2]))
				local accessTokenHash = redis.call("GET", KEYS[1])
				if accessTokenHash then redis.call("DEL", ARGV[1] .. accessTokenHash) end
				return redis.call("DEL", KEYS[1])
			`,
			[
				this._buildAccessTokenHashBySessionIdRedisKey({ sessionId: params.sessionId }),
				this._buildRevokedSessionRedisKey({ sessionId: params.sessionId }),
			],
			[this._buildSessionByAccessTokenHashRedisKey({ accessTokenHash: "" }), "2592000"],
		);
	}

	async deleteAccessTokenSessions(params: { sessionIds: string[] }): Promise<void> {
		if (params.sessionIds.length === 0) return;

		await this._redis.eval<string[], number>(
			`
				for index = 1, #KEYS, 2 do
					local sessionKey = KEYS[index]
					redis.call("SET", KEYS[index + 1], "1", "EX", tonumber(ARGV[2]))
					local accessTokenHash = redis.call("GET", sessionKey)
					if accessTokenHash then redis.call("DEL", ARGV[1] .. accessTokenHash) end
					redis.call("DEL", sessionKey)
				end
				return #KEYS / 2
			`,
			params.sessionIds.flatMap((sessionId) => [
				this._buildAccessTokenHashBySessionIdRedisKey({ sessionId: sessionId }),
				this._buildRevokedSessionRedisKey({ sessionId: sessionId }),
			]),
			[this._buildSessionByAccessTokenHashRedisKey({ accessTokenHash: "" }), "2592000"],
		);
	}

	private _buildSessionByAccessTokenHashRedisKey(params: { accessTokenHash: string }): string {
		return `auth:session-by-access-token-hash:${params.accessTokenHash}`;
	}

	private _buildAccessTokenHashBySessionIdRedisKey(params: { sessionId: string }): string {
		return `auth:access-token-hash-by-session-id:${params.sessionId}`;
	}

	private _buildRevokedSessionRedisKey(params: { sessionId: string }): string {
		return `auth:revoked-session:${params.sessionId}`;
	}
}
