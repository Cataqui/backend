import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { injectable } from "tsyringe";
import type { NotpChannel } from "./notp-channel.enum";
import { NotpIntentStatus, NotpProcessingClaimStatus } from "./notp-intent-status.enum";

export type StoredNotpIntent =
	| []
	| [candidateSessionId: string, status: NotpIntentStatus.PENDING | NotpIntentStatus.PROCESSING]
	| [candidateSessionId: string, status: NotpIntentStatus.VERIFIED, accountId: string, identityId: string];

export type NotpProcessingClaim =
	| []
	| [status: NotpProcessingClaimStatus.PROCESSING_IN_PROGRESS]
	| [intentTokenHash: string, candidateSessionId: string];

@injectable()
export class NotpRepository {
	constructor(private readonly _redis: Redis) {}

	async createIntent(params: {
		notpCodeHash: string;
		candidateSessionId: string;
		intentTokenHash: string;
		channel: NotpChannel;
		expiresInSeconds: number;
	}): Promise<number> {
		return this._redis.eval<string[], number>(
			`
				if redis.call("EXISTS", KEYS[1]) == 1 or redis.call("EXISTS", KEYS[2]) == 1 then return 0 end
				redis.call("HSET", KEYS[1], "candidate_session_id", ARGV[1], "status", ARGV[2])
				redis.call("EXPIRE", KEYS[1], tonumber(ARGV[4]))
				redis.call("SET", KEYS[2], ARGV[3], "EX", tonumber(ARGV[4]))
				return 1
			`,
			[
				`auth:notp:intent-by-token-hash:${params.intentTokenHash}`,
				`auth:notp:code:${params.channel}:${params.notpCodeHash}`,
			],
			[params.candidateSessionId, NotpIntentStatus.PENDING, params.intentTokenHash, String(params.expiresInSeconds)],
		);
	}

	async findIntentByTokenHash(params: { intentTokenHash: string }): Promise<StoredNotpIntent> {
		return this._redis.eval<string[], StoredNotpIntent>(
			`
				local values = redis.call("HMGET", KEYS[1], "candidate_session_id", "status", "account_id", "identity_id")
				if not values[1] then return {} end
				if values[2] == ARGV[1] then return { values[1], values[2], values[3], values[4] } end
				return { values[1], values[2] }
			`,
			[`auth:notp:intent-by-token-hash:${params.intentTokenHash}`],
			[NotpIntentStatus.VERIFIED],
		);
	}

	async acquireVerificationWaitLease(params: {
		intentTokenHash: string;
		ownerToken: string;
		expiresInMilliseconds: number;
	}): Promise<string | null> {
		return this._redis.set(
			`${_verificationChannel({ intentTokenHash: params.intentTokenHash })}:wait-lease`,
			params.ownerToken,
			{
				nx: true,
				px: params.expiresInMilliseconds,
			},
		);
	}

	subscribeToVerification(params: { intentTokenHash: string }): {
		channel: string;
		subscription: ReturnType<Redis["subscribe"]>;
	} {
		const channel = _verificationChannel({ intentTokenHash: params.intentTokenHash });
		return { channel: channel, subscription: this._redis.subscribe<string>(channel) };
	}

	async releaseVerificationWaitLease(params: { intentTokenHash: string; ownerToken: string }): Promise<number> {
		return this._redis.eval<string[], number>(
			`
				if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
				return redis.call("DEL", KEYS[1])
			`,
			[`${_verificationChannel({ intentTokenHash: params.intentTokenHash })}:wait-lease`],
			[params.ownerToken],
		);
	}

	async claimIntentForVerification(params: {
		notpCodeHash: string;
		providerMessageId: string;
		nowMilliseconds: number;
		channel: NotpChannel;
		processingLeaseMilliseconds: number;
	}): Promise<NotpProcessingClaim> {
		return this._redis.eval<string[], NotpProcessingClaim>(
			`
				local tokenHash = redis.call("GET", KEYS[1])
				if not tokenHash then return {} end
				local intentKey = ARGV[1] .. tokenHash
				if redis.call("EXISTS", intentKey) == 0 then
					redis.call("DEL", KEYS[1])
					return {}
				end
				local values = redis.call("HMGET", intentKey, "status", "processing_until", "processing_message_id", "candidate_session_id")
				local status = values[1]
				local processingUntil = tonumber(values[2] or "0")
				if status == ARGV[3] and processingUntil > tonumber(ARGV[4]) and values[3] == ARGV[5] then
					return { ARGV[8] }
				end
				if status ~= ARGV[2] and not (status == ARGV[3] and processingUntil <= tonumber(ARGV[4])) then return {} end
				redis.call("HSET", intentKey, "status", ARGV[3], "processing_message_id", ARGV[5], "processing_until", ARGV[6])
				local ttl = tonumber(ARGV[7])
				if redis.call("PTTL", intentKey) < ttl then redis.call("PEXPIRE", intentKey, ttl) end
				if redis.call("PTTL", KEYS[1]) < ttl then redis.call("PEXPIRE", KEYS[1], ttl) end
				return { tokenHash, values[4] }
			`,
			[`auth:notp:code:${params.channel}:${params.notpCodeHash}`],
			[
				"auth:notp:intent-by-token-hash:",
				NotpIntentStatus.PENDING,
				NotpIntentStatus.PROCESSING,
				String(params.nowMilliseconds),
				params.providerMessageId,
				String(params.nowMilliseconds + params.processingLeaseMilliseconds),
				String(params.processingLeaseMilliseconds),
				NotpProcessingClaimStatus.PROCESSING_IN_PROGRESS,
			],
		);
	}

	async markIntentVerified(params: {
		candidateSessionId: string;
		notpCodeHash: string;
		intentTokenHash: string;
		providerMessageId: string;
		channel: NotpChannel;
		accountId: string;
		identityId: string;
		expiresInSeconds: number;
	}): Promise<number> {
		return this._redis.eval<string[], number>(
			`
				local values = redis.call("HMGET", KEYS[1], "status", "processing_message_id", "candidate_session_id")
				if values[1] ~= ARGV[1] or values[2] ~= ARGV[2] or values[3] ~= ARGV[6] then return 0 end
				redis.call("HSET", KEYS[1], "status", ARGV[3], "account_id", ARGV[4], "identity_id", ARGV[9])
				redis.call("HDEL", KEYS[1], "processing_message_id", "processing_until")
				redis.call("EXPIRE", KEYS[1], tonumber(ARGV[5]))
				redis.call("SET", KEYS[3], KEYS[1], "EX", tonumber(ARGV[5]))
				redis.call("DEL", KEYS[2])
				redis.call("PUBLISH", ARGV[7], ARGV[8])
				return 1
			`,
			[
				`auth:notp:intent-by-token-hash:${params.intentTokenHash}`,
				`auth:notp:code:${params.channel}:${params.notpCodeHash}`,
				`auth:notp:intent-key-by-session:${params.candidateSessionId}`,
			],
			[
				NotpIntentStatus.PROCESSING,
				params.providerMessageId,
				NotpIntentStatus.VERIFIED,
				params.accountId,
				String(params.expiresInSeconds),
				params.candidateSessionId,
				_verificationChannel({ intentTokenHash: params.intentTokenHash }),
				NotpIntentStatus.VERIFIED,
				params.identityId,
			],
		);
	}

	async releaseProcessingIntent(params: { intentTokenHash: string; providerMessageId: string }): Promise<number> {
		return this._redis.eval<string[], number>(
			`
				if redis.call("HGET", KEYS[1], "status") ~= ARGV[1]
					or redis.call("HGET", KEYS[1], "processing_message_id") ~= ARGV[2] then return 0 end
				redis.call("HSET", KEYS[1], "status", ARGV[3])
				redis.call("HDEL", KEYS[1], "processing_message_id", "processing_until")
				return 1
			`,
			[`auth:notp:intent-by-token-hash:${params.intentTokenHash}`],
			[NotpIntentStatus.PROCESSING, params.providerMessageId, NotpIntentStatus.PENDING],
		);
	}

	async deleteIntentsForSessions(params: { sessionIds: string[] }): Promise<void> {
		if (params.sessionIds.length === 0) return;
		await this._redis.eval<string[], number>(
			`
				for _, sessionKey in ipairs(KEYS) do
					local intentKey = redis.call("GET", sessionKey)
					if intentKey then redis.call("DEL", intentKey) end
					redis.call("DEL", sessionKey)
				end
				return #KEYS
			`,
			params.sessionIds.map((sessionId) => `auth:notp:intent-key-by-session:${sessionId}`),
			[],
		);
	}
}

function _verificationChannel(params: { intentTokenHash: string }): string {
	return `auth:notp:verification:${createHash("sha256").update(`auth:notp:verification-channel:${params.intentTokenHash}`).digest("hex")}`;
}
