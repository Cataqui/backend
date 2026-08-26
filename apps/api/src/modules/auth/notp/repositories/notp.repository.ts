import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { errors as UpstashRedisErrors } from "@upstash/redis";
import { createHash, randomUUID } from "node:crypto";
import { RedisService } from "../../../../core/redis/redis.service";
import { NotpChannel } from "../enums/notp-channel.enum";
import { NotpIntentStatus } from "../enums/notp-intent-status.enum";
import { NotpProcessingInProgressError } from "../errors/notp-processing-in-progress.error";
import { NotpConstants } from "../notp.constants";

type NotpIntent =
	| {
			candidateSessionId: string;
			status: NotpIntentStatus.PENDING | NotpIntentStatus.PROCESSING;
	  }
	| {
			candidateSessionId: string;
			status: NotpIntentStatus.VERIFIED;
			userId: string;
	  };

enum NotpVerificationSubscriptionReadiness {
	READY = "READY",
	UNAVAILABLE = "UNAVAILABLE",
}

enum NotpVerificationNotificationResult {
	ABORTED = "ABORTED",
	AUTHORITATIVE_READ_DUE = "AUTHORITATIVE_READ_DUE",
	TIMED_OUT = "TIMED_OUT",
	UNAVAILABLE = "UNAVAILABLE",
	VERIFIED = "VERIFIED",
}

@Injectable()
export class NotpRepository implements OnModuleInit {
	private readonly _logger = new Logger(NotpRepository.name);
	private _activeExchangeLongPollCount = 0;
	private readonly _getIntentOrNullAndMarkAsProcessingScript: {
		readonly script: string;
		exec(keys: string[], args: string[]): Promise<string[]>;
	};
	private readonly _findIntentByTokenHashScript: {
		readonly script: string;
		exec(keys: string[], args: string[]): Promise<string[]>;
	};
	private readonly _markProcessingIntentAsVerifiedScript: {
		readonly script: string;
		exec(keys: string[], args: string[]): Promise<number>;
	};

	constructor(private readonly _redis: RedisService) {
		this._findIntentByTokenHashScript = this._redis.createScript<string[]>(`
			local intentValues = redis.call("HMGET", KEYS[1],
				"candidate_session_id",
				"status",
				"user_id"
			)
			if not intentValues[1] or not intentValues[2] then return {} end
			return {
				intentValues[1] or "",
				intentValues[2] or "",
				intentValues[3] or ""
			}
		`);
		this._getIntentOrNullAndMarkAsProcessingScript = this._redis.createScript<string[]>(`
			local intentTokenHash = redis.call("GET", KEYS[1])
			if not intentTokenHash then return {} end

			local intentKey = ARGV[1] .. intentTokenHash
			if redis.call("EXISTS", intentKey) == 0 then
				redis.call("DEL", KEYS[1])
				return {}
			end

			local intentValues = redis.call("HMGET", intentKey,
				"status",
				"processing_until",
				"processing_message_id",
				"candidate_session_id"
			)
			local status = intentValues[1]
			local processingUntil = tonumber(intentValues[2] or "0")
			if status == ARGV[3]
				and processingUntil > tonumber(ARGV[4])
				and intentValues[3] == ARGV[5] then
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
				intentValues[4] or ""
			}
		`);
		this._markProcessingIntentAsVerifiedScript = this._redis.createScript<number>(`
			local intentValues = redis.call("HMGET", KEYS[1],
				"status",
				"processing_message_id",
				"candidate_session_id"
			)
			if intentValues[1] ~= ARGV[1] then return 0 end
			if intentValues[2] ~= ARGV[2] then return 0 end
			if intentValues[3] ~= ARGV[6] then return 0 end
			redis.call("HSET", KEYS[1],
				"status", ARGV[3],
				"user_id", ARGV[4]
			)
			redis.call("HDEL", KEYS[1],
				"processing_message_id",
				"processing_until"
			)
			redis.call("EXPIRE", KEYS[1], tonumber(ARGV[5]))
			redis.call("SET", KEYS[3], KEYS[1], "EX", tonumber(ARGV[5]))

			redis.call("DEL", KEYS[2])
			redis.call("PUBLISH", ARGV[7], ARGV[8])
			return 1
		`);
	}

	async onModuleInit(): Promise<void> {
		try {
			await this._redis
				.pipeline()
				.scriptLoad(this._findIntentByTokenHashScript.script)
				.scriptLoad(this._getIntentOrNullAndMarkAsProcessingScript.script)
				.scriptLoad(this._markProcessingIntentAsVerifiedScript.script)
				.exec();
		} catch {
			this._logger.warn("NOTP scripts could not be preloaded; first use will load them");
		}
	}

	async createIntent(params: {
		notpCodeHash: string;
		candidateSessionId: string;
		intentTokenHash: string;
		channel: NotpChannel;
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
				this._buildNotpCodeRedisKey({ notpCodeHash: params.notpCodeHash, channel: params.channel }),
			],
			[
				params.candidateSessionId,
				NotpIntentStatus.PENDING,
				params.intentTokenHash,
				String(NotpConstants.INTENT_EXPIRATION_SECONDS),
			],
		);

		return result === 1;
	}

	async findIntentByTokenHash(params: { intentTokenHash: string }): Promise<NotpIntent | null> {
		let storedIntentValues: string[];
		try {
			storedIntentValues = await this._findIntentByTokenHashScript.exec(
				[
					this._buildIntentByTokenHashRedisKey({
						intentTokenHash: params.intentTokenHash,
					}),
				],
				[],
			);
		} catch (error) {
			if (!(error instanceof UpstashRedisErrors.UpstashError)) throw error;
			throw new Error("NOTP intent lookup was rejected by Redis");
		}

		const candidateSessionId = storedIntentValues[0];
		const status = Object.values(NotpIntentStatus).find((intentStatus) => intentStatus === storedIntentValues[1]);

		if (typeof candidateSessionId !== "string" || candidateSessionId.length === 0) return null;
		if (status === undefined) return null;
		const storedUserId = storedIntentValues[2];
		if (status !== NotpIntentStatus.VERIFIED) {
			if (storedUserId !== undefined && storedUserId !== "") return null;

			return {
				candidateSessionId: candidateSessionId,
				status: status,
			};
		}

		if (typeof storedUserId !== "string" || storedUserId.length === 0) {
			return null;
		}

		return {
			candidateSessionId: candidateSessionId,
			status: status,
			userId: storedUserId,
		};
	}

	async findIntentByTokenHashAfterWaitingForVerification(params: {
		abortSignal?: AbortSignal;
		intentTokenHash: string;
	}): Promise<NotpIntent | null> {
		const initialIntent = await this.findIntentByTokenHash({ intentTokenHash: params.intentTokenHash });
		if (initialIntent === null || initialIntent.status === NotpIntentStatus.VERIFIED) {
			return initialIntent;
		}
		const isExchangeAborted = () => params.abortSignal?.aborted === true;
		if (isExchangeAborted()) return initialIntent;

		const verificationChannel = this._buildIntentVerificationChannel({
			intentTokenHash: params.intentTokenHash,
		});
		const verificationWaitLeaseKey = `${verificationChannel}:wait-lease`;
		const verificationWaitLeaseOwnerToken = randomUUID();
		const verificationWaitLeaseDeadlineAt = Date.now() + NotpConstants.EXCHANGE_LONG_POLL_MAX_LEASE_HOLD_MILLISECONDS;
		let verificationWaitLeaseDeadlineTimeout!: ReturnType<typeof setTimeout>;
		const verificationWaitLeaseDeadline = new Promise<undefined>((resolve) => {
			verificationWaitLeaseDeadlineTimeout = setTimeout(
				() => resolve(undefined),
				NotpConstants.EXCHANGE_LONG_POLL_MAX_LEASE_HOLD_MILLISECONDS,
			);
		});
		let settleVerificationWaitAbort!: () => void;
		const verificationWaitAbort = new Promise<undefined>((resolve) => {
			settleVerificationWaitAbort = () => resolve(undefined);
		});
		params.abortSignal?.addEventListener("abort", settleVerificationWaitAbort, { once: true });
		if (isExchangeAborted()) settleVerificationWaitAbort();
		const stopVerificationWaitLeaseGuard = () => {
			clearTimeout(verificationWaitLeaseDeadlineTimeout);
			params.abortSignal?.removeEventListener("abort", settleVerificationWaitAbort);
		};

		try {
			const leaseAcquisitionResult = await Promise.race([
				this._redis.set(verificationWaitLeaseKey, verificationWaitLeaseOwnerToken, {
					nx: true,
					px: NotpConstants.EXCHANGE_LONG_POLL_LEASE_EXPIRATION_MILLISECONDS,
				}),
				verificationWaitLeaseDeadline,
				verificationWaitAbort,
			]);

			if (leaseAcquisitionResult === undefined || Date.now() >= verificationWaitLeaseDeadlineAt) {
				stopVerificationWaitLeaseGuard();
				return initialIntent;
			}

			if (leaseAcquisitionResult !== "OK") {
				stopVerificationWaitLeaseGuard();
				return this.findIntentByTokenHash({ intentTokenHash: params.intentTokenHash });
			}
		} catch {
			stopVerificationWaitLeaseGuard();
			if (isExchangeAborted()) return initialIntent;
			return this.findIntentByTokenHash({ intentTokenHash: params.intentTokenHash });
		}

		let isHoldingExchangeLongPollCapacity = false;
		let subscription: ReturnType<RedisService["subscribe"]> | null = null;
		const findIntentBeforeVerificationWaitLeaseDeadline = () =>
			Promise.race([
				this.findIntentByTokenHash({ intentTokenHash: params.intentTokenHash }),
				verificationWaitLeaseDeadline,
				verificationWaitAbort,
			]);

		try {
			if (this._activeExchangeLongPollCount >= NotpConstants.MAX_CONCURRENT_EXCHANGE_LONG_POLLS_PER_CONTAINER) {
				return this.findIntentByTokenHash({ intentTokenHash: params.intentTokenHash });
			}
			this._activeExchangeLongPollCount += 1;
			isHoldingExchangeLongPollCapacity = true;

			if (isExchangeAborted()) return initialIntent;

			try {
				subscription = this._redis.subscribe<string>(verificationChannel);
			} catch {
				const intentAfterSubscriptionFailure = await findIntentBeforeVerificationWaitLeaseDeadline();
				return intentAfterSubscriptionFailure === undefined ? initialIntent : intentAfterSubscriptionFailure;
			}

			let settleSubscriptionReadiness!: (result: NotpVerificationSubscriptionReadiness) => void;
			let subscriptionReadinessSettled = false;
			const subscriptionReadiness = new Promise<NotpVerificationSubscriptionReadiness>((resolve) => {
				settleSubscriptionReadiness = (result) => {
					if (subscriptionReadinessSettled) return;
					subscriptionReadinessSettled = true;
					resolve(result);
				};
			});

			let settleVerificationNotification!: (result: NotpVerificationNotificationResult) => void;
			let verificationNotificationSettled = false;
			const verificationNotification = new Promise<NotpVerificationNotificationResult>((resolve) => {
				settleVerificationNotification = (result) => {
					if (verificationNotificationSettled) return;
					verificationNotificationSettled = true;
					resolve(result);
				};
			});
			let verificationNotificationConsumed = false;
			const verificationWaitAbortResult = verificationWaitAbort.then(() => NotpVerificationNotificationResult.ABORTED);

			const subscriptionReadinessTimeout = setTimeout(() => {
				settleSubscriptionReadiness(NotpVerificationSubscriptionReadiness.UNAVAILABLE);
			}, NotpConstants.EXCHANGE_SUBSCRIPTION_READY_TIMEOUT_MILLISECONDS);

			const verificationNotificationTimeout = setTimeout(() => {
				settleVerificationNotification(NotpVerificationNotificationResult.TIMED_OUT);
			}, NotpConstants.EXCHANGE_LONG_POLL_TIMEOUT_MILLISECONDS);

			const abortWait = () => {
				settleSubscriptionReadiness(NotpVerificationSubscriptionReadiness.UNAVAILABLE);
				settleVerificationNotification(NotpVerificationNotificationResult.ABORTED);
			};

			subscription.on("subscribe", () => {
				settleSubscriptionReadiness(NotpVerificationSubscriptionReadiness.READY);
			});
			subscription.on("message", ({ channel, message }) => {
				if (channel !== verificationChannel || message !== NotpIntentStatus.VERIFIED) return;
				settleVerificationNotification(NotpVerificationNotificationResult.VERIFIED);
			});
			subscription.on("error", () => {
				settleSubscriptionReadiness(NotpVerificationSubscriptionReadiness.UNAVAILABLE);
				settleVerificationNotification(NotpVerificationNotificationResult.UNAVAILABLE);
			});
			params.abortSignal?.addEventListener("abort", abortWait, { once: true });
			if (isExchangeAborted()) abortWait();

			try {
				const readiness = await subscriptionReadiness;
				if (isExchangeAborted()) return initialIntent;

				const intentAfterSubscriptionReadiness = await findIntentBeforeVerificationWaitLeaseDeadline();
				if (intentAfterSubscriptionReadiness === undefined) return initialIntent;
				let intent = intentAfterSubscriptionReadiness;
				if (intent === null || intent.status === NotpIntentStatus.VERIFIED) return intent;
				if (readiness !== NotpVerificationSubscriptionReadiness.READY) return intent;

				let authoritativeReadIntervalIndex = 0;
				while (true) {
					const authoritativeReadInterval =
						NotpConstants.EXCHANGE_AUTHORITATIVE_READ_INTERVALS_MILLISECONDS[
							Math.min(
								authoritativeReadIntervalIndex,
								NotpConstants.EXCHANGE_AUTHORITATIVE_READ_INTERVALS_MILLISECONDS.length - 1,
							)
						];
					let authoritativeReadTimeout!: ReturnType<typeof setTimeout>;
					const authoritativeReadDue = new Promise<NotpVerificationNotificationResult>((resolve) => {
						authoritativeReadTimeout = setTimeout(() => {
							resolve(NotpVerificationNotificationResult.AUTHORITATIVE_READ_DUE);
						}, authoritativeReadInterval);
					});
					const waitResult = await Promise.race(
						verificationNotificationConsumed
							? [verificationWaitAbortResult, authoritativeReadDue]
							: [verificationNotification, verificationWaitAbortResult, authoritativeReadDue],
					);
					clearTimeout(authoritativeReadTimeout);

					switch (waitResult) {
						case NotpVerificationNotificationResult.ABORTED:
							return intent;
						case NotpVerificationNotificationResult.TIMED_OUT:
						case NotpVerificationNotificationResult.UNAVAILABLE: {
							const finalIntent = await findIntentBeforeVerificationWaitLeaseDeadline();
							return finalIntent === undefined ? intent : finalIntent;
						}
						case NotpVerificationNotificationResult.VERIFIED: {
							const intentAfterVerificationNotification = await findIntentBeforeVerificationWaitLeaseDeadline();
							if (intentAfterVerificationNotification === undefined) return intent;
							if (
								intentAfterVerificationNotification === null ||
								intentAfterVerificationNotification.status === NotpIntentStatus.VERIFIED
							) {
								return intentAfterVerificationNotification;
							}
							intent = intentAfterVerificationNotification;
							verificationNotificationConsumed = true;
							authoritativeReadIntervalIndex = 0;
							continue;
						}
						case NotpVerificationNotificationResult.AUTHORITATIVE_READ_DUE:
							break;
					}

					const adaptivelyReadIntent = await findIntentBeforeVerificationWaitLeaseDeadline();
					if (adaptivelyReadIntent === undefined) return intent;
					intent = adaptivelyReadIntent;
					if (intent === null || intent.status === NotpIntentStatus.VERIFIED) return intent;
					authoritativeReadIntervalIndex += 1;
				}
			} finally {
				clearTimeout(subscriptionReadinessTimeout);
				clearTimeout(verificationNotificationTimeout);
				params.abortSignal?.removeEventListener("abort", abortWait);
			}
		} finally {
			stopVerificationWaitLeaseGuard();
			if (subscription !== null) {
				subscription.removeAllListeners();
				try {
					await subscription.unsubscribe();
				} catch {
					this._logger.warn("NOTP verification subscription could not be closed cleanly");
				}
			}
			if (isHoldingExchangeLongPollCapacity) this._activeExchangeLongPollCount -= 1;

			void Promise.resolve()
				.then(() =>
					this._redis.eval<string[], number>(
						`
						if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
						return redis.call("DEL", KEYS[1])
					`,
						[verificationWaitLeaseKey],
						[verificationWaitLeaseOwnerToken],
					),
				)
				.catch(() => {
					this._logger.warn("NOTP verification wait lease could not be released cleanly");
				});
		}
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
		notpCodeHash: string;
		providerMessageId: string;
		nowMilliseconds: number;
		channel: NotpChannel;
	}): Promise<{
		candidateSessionId: string;
		intentTokenHash: string;
	} | null> {
		const result = await this._getIntentOrNullAndMarkAsProcessingScript.exec(
			[this._buildNotpCodeRedisKey({ notpCodeHash: params.notpCodeHash, channel: params.channel })],
			[
				this._buildIntentByTokenHashRedisKey({ intentTokenHash: "" }),
				NotpIntentStatus.PENDING,
				NotpIntentStatus.PROCESSING,
				String(params.nowMilliseconds),
				params.providerMessageId,
				String(params.nowMilliseconds + NotpConstants.PROCESSING_STALE_AFTER_MILLISECONDS),
				String(NotpConstants.PROCESSING_STALE_AFTER_MILLISECONDS),
				"PROCESSING_IN_PROGRESS",
			],
		);

		if (result[0] === "PROCESSING_IN_PROGRESS") throw new NotpProcessingInProgressError();

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
		notpCodeHash: string;
		intentTokenHash: string;
		providerMessageId: string;
		channel: NotpChannel;
		userId: string;
	}): Promise<void> {
		const result = await this._markProcessingIntentAsVerifiedScript.exec(
			[
				this._buildIntentByTokenHashRedisKey({
					intentTokenHash: params.intentTokenHash,
				}),
				this._buildNotpCodeRedisKey({ notpCodeHash: params.notpCodeHash, channel: params.channel }),
				this._buildIntentBySessionIdRedisKey({ sessionId: params.candidateSessionId }),
			],
			[
				NotpIntentStatus.PROCESSING,
				params.providerMessageId,
				NotpIntentStatus.VERIFIED,
				params.userId,
				String(NotpConstants.EXCHANGE_EXPIRATION_SECONDS),
				params.candidateSessionId,
				this._buildIntentVerificationChannel({ intentTokenHash: params.intentTokenHash }),
				NotpIntentStatus.VERIFIED,
			],
		);

		if (result !== 1) throw new Error("NOTP intent processing ownership was lost");
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
			[NotpIntentStatus.PROCESSING, params.providerMessageId, NotpIntentStatus.PENDING],
		);

		if (result !== 1) throw new Error("NOTP intent processing ownership was lost");
	}

	private _buildIntentByTokenHashRedisKey(params: { intentTokenHash: string }): string {
		return `auth:notp:intent-by-token-hash:${params.intentTokenHash}`;
	}

	private _buildNotpCodeRedisKey(params: { notpCodeHash: string; channel: NotpChannel }): string {
		return `auth:notp:code:${params.channel}:${params.notpCodeHash}`;
	}

	private _buildIntentBySessionIdRedisKey(params: { sessionId: string }): string {
		return `auth:notp:intent-key-by-session:${params.sessionId}`;
	}

	private _buildIntentVerificationChannel(params: { intentTokenHash: string }): string {
		const anonymousChannelId = createHash("sha256")
			.update(`auth:notp:verification-channel:${params.intentTokenHash}`)
			.digest("hex");

		return `auth:notp:verification:${anonymousChannelId}`;
	}
}
