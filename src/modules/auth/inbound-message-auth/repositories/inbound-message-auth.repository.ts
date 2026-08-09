import { Injectable } from "@nestjs/common";
import { RedisService } from "../../../../core/redis/redis.service";
import { InboundMessageAuthChannel } from "../enums/inbound-message-auth-channel.enum";
import { InboundMessageAuthIntentStatus } from "../enums/inbound-message-auth-intent-status.enum";
import { InboundMessageAuthProcessingInProgressError } from "../errors/inbound-message-auth-processing-in-progress.error";
import { InboundMessageAuthConstants } from "../inbound-message-auth.constants";

@Injectable()
export class InboundMessageAuthRepository {
	constructor(private readonly _redis: RedisService) {}

	async createIntent(params: {
		authCodeHash: string;
		candidateSessionId: string;
		intentTokenHash: string;
		channel: InboundMessageAuthChannel;
	}): Promise<boolean> {
		const result = await this._redis.eval<string[], number>(
			`
				if redis.call("EXISTS", KEYS[1]) == 1 or redis.call("EXISTS", KEYS[2]) == 1 then
					return 0
				end

				redis.call("HSET", KEYS[1],
					"candidate_session_id", ARGV[1],
					"status", ARGV[2]
				)
				redis.call("EXPIRE", KEYS[1], tonumber(ARGV[4]))
				redis.call("SET", KEYS[2], ARGV[3], "EX", tonumber(ARGV[4]))
				return 1
			`,
			[
				this._buildIntentByTokenHashRedisKey({
					intentTokenHash: params.intentTokenHash,
				}),
				this._buildAuthCodeRedisKey({ authCodeHash: params.authCodeHash, channel: params.channel }),
			],
			[
				params.candidateSessionId,
				InboundMessageAuthIntentStatus.PENDING,
				params.intentTokenHash,
				String(InboundMessageAuthConstants.INTENT_EXPIRATION_SECONDS),
			],
		);

		return result === 1;
	}

	async findIntentByTokenHash(params: { intentTokenHash: string }): Promise<{
		candidateSessionId: string;
		status: InboundMessageAuthIntentStatus;
		userId: string | null;
	} | null> {
		const storedIntent = await this._redis.hgetall<Record<string, string>>(
			this._buildIntentByTokenHashRedisKey({
				intentTokenHash: params.intentTokenHash,
			}),
		);

		if (storedIntent === null) return null;

		const candidateSessionId = storedIntent["candidate_session_id"];
		const status = Object.values(InboundMessageAuthIntentStatus).find((status) => status === storedIntent["status"]);
		const storedUserId = storedIntent["user_id"];
		const userId = typeof storedUserId === "string" && storedUserId.length > 0 ? storedUserId : null;

		if (typeof candidateSessionId !== "string" || candidateSessionId.length === 0) return null;
		if (status === undefined) return null;
		if (status === InboundMessageAuthIntentStatus.VERIFIED && userId === null) return null;

		return {
			candidateSessionId: candidateSessionId,
			status: status,
			userId: userId,
		};
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
			params.sessionIds.map((sessionId) => this._buildIntentBySessionIdRedisKey({ sessionId: sessionId })),
			[],
		);
	}

	async getIntentOrNullAndMarkAsProcessing(params: {
		authCodeHash: string;
		providerMessageId: string;
		nowMilliseconds: number;
		channel: InboundMessageAuthChannel;
	}): Promise<{ candidateSessionId: string; intentTokenHash: string } | null> {
		const result = await this._redis.eval<string[], string[]>(
			`
				local intentTokenHash = redis.call("GET", KEYS[1])
				if not intentTokenHash then return {} end

				local intentKey = ARGV[1] .. intentTokenHash
				if redis.call("EXISTS", intentKey) == 0 then
					redis.call("DEL", KEYS[1])
					return {}
				end

				local status = redis.call("HGET", intentKey, "status")
				local processingUntil = tonumber(redis.call("HGET", intentKey, "processing_until") or "0")
				if status == ARGV[3]
					and processingUntil > tonumber(ARGV[4])
					and redis.call("HGET", intentKey, "processing_message_id") == ARGV[5] then
					return { ARGV[8] }
				end
				if status ~= ARGV[2] and not (status == ARGV[3] and processingUntil <= tonumber(ARGV[4])) then
					return {}
				end

				redis.call("HSET", intentKey,
					"status", ARGV[3],
					"processing_message_id", ARGV[5],
					"processing_until", ARGV[6]
				)

				local processingTtlMilliseconds = tonumber(ARGV[7])
				if redis.call("PTTL", intentKey) < processingTtlMilliseconds then
					redis.call("PEXPIRE", intentKey, processingTtlMilliseconds)
				end
				if redis.call("PTTL", KEYS[1]) < processingTtlMilliseconds then
					redis.call("PEXPIRE", KEYS[1], processingTtlMilliseconds)
				end

				return {
					intentTokenHash,
					redis.call("HGET", intentKey, "candidate_session_id") or ""
				}
			`,
			[this._buildAuthCodeRedisKey({ authCodeHash: params.authCodeHash, channel: params.channel })],
			[
				this._buildIntentByTokenHashRedisKey({ intentTokenHash: "" }),
				InboundMessageAuthIntentStatus.PENDING,
				InboundMessageAuthIntentStatus.PROCESSING,
				String(params.nowMilliseconds),
				params.providerMessageId,
				String(params.nowMilliseconds + InboundMessageAuthConstants.PROCESSING_STALE_AFTER_MILLISECONDS),
				String(InboundMessageAuthConstants.PROCESSING_STALE_AFTER_MILLISECONDS),
				"PROCESSING_IN_PROGRESS",
			],
		);

		if (result[0] === "PROCESSING_IN_PROGRESS") throw new InboundMessageAuthProcessingInProgressError();

		const intentTokenHash = result[0];
		const candidateSessionId = result[1];

		if (intentTokenHash === undefined || typeof candidateSessionId !== "string" || candidateSessionId.length === 0) {
			return null;
		}

		return {
			candidateSessionId: candidateSessionId,
			intentTokenHash: intentTokenHash,
		};
	}

	async markProcessingIntentAsVerified(params: {
		candidateSessionId: string;
		authCodeHash: string;
		intentTokenHash: string;
		providerMessageId: string;
		channel: InboundMessageAuthChannel;
		userId: string;
	}): Promise<void> {
		const result = await this._redis.eval<string[], number>(
			`
				if redis.call("HGET", KEYS[1], "status") ~= ARGV[1] then return 0 end
				if redis.call("HGET", KEYS[1], "processing_message_id") ~= ARGV[2] then return 0 end
				if redis.call("HGET", KEYS[1], "candidate_session_id") ~= ARGV[6] then return 0 end
				redis.call("HSET", KEYS[1],
					"status", ARGV[3],
					"user_id", ARGV[4]
				)
				redis.call("HDEL", KEYS[1], "processing_message_id", "processing_until")
				redis.call("EXPIRE", KEYS[1], tonumber(ARGV[5]))
				redis.call("SET", KEYS[3], KEYS[1], "EX", tonumber(ARGV[5]))
				redis.call("DEL", KEYS[2])
				return 1
			`,
			[
				this._buildIntentByTokenHashRedisKey({
					intentTokenHash: params.intentTokenHash,
				}),
				this._buildAuthCodeRedisKey({ authCodeHash: params.authCodeHash, channel: params.channel }),
				this._buildIntentBySessionIdRedisKey({ sessionId: params.candidateSessionId }),
			],
			[
				InboundMessageAuthIntentStatus.PROCESSING,
				params.providerMessageId,
				InboundMessageAuthIntentStatus.VERIFIED,
				params.userId,
				String(InboundMessageAuthConstants.EXCHANGE_EXPIRATION_SECONDS),
				params.candidateSessionId,
			],
		);

		if (result !== 1) throw new Error("Inbound-message authentication intent processing ownership was lost");
	}

	async markProcessingIntentAsPending(params: { intentTokenHash: string; providerMessageId: string }): Promise<void> {
		const result = await this._redis.eval<string[], number>(
			`
				if redis.call("HGET", KEYS[1], "status") == ARGV[1]
					and redis.call("HGET", KEYS[1], "processing_message_id") == ARGV[2] then
					redis.call("HSET", KEYS[1], "status", ARGV[3])
					redis.call("HDEL", KEYS[1], "processing_message_id", "processing_until")
					return 1
				end
				return 0
			`,
			[
				this._buildIntentByTokenHashRedisKey({
					intentTokenHash: params.intentTokenHash,
				}),
			],
			[InboundMessageAuthIntentStatus.PROCESSING, params.providerMessageId, InboundMessageAuthIntentStatus.PENDING],
		);

		if (result !== 1) throw new Error("Inbound-message authentication intent processing ownership was lost");
	}

	private _buildIntentByTokenHashRedisKey(params: { intentTokenHash: string }): string {
		return `auth:inbound-message:intent-by-token-hash:${params.intentTokenHash}`;
	}

	private _buildAuthCodeRedisKey(params: { authCodeHash: string; channel: InboundMessageAuthChannel }): string {
		return `auth:inbound-message:code:${params.channel}:${params.authCodeHash}`;
	}

	private _buildIntentBySessionIdRedisKey(params: { sessionId: string }): string {
		return `auth:inbound-message:intent-key-by-session:${params.sessionId}`;
	}
}
