import { Test } from "@nestjs/testing";
import { RedisService } from "../../../../core/redis/redis.service";
import { InboundMessageAuthChannel } from "../enums/inbound-message-auth-channel.enum";
import { InboundMessageAuthIntentStatus } from "../enums/inbound-message-auth-intent-status.enum";
import { InboundMessageAuthProcessingInProgressError } from "../errors/inbound-message-auth-processing-in-progress.error";
import { InboundMessageAuthConstants } from "../inbound-message-auth.constants";
import { InboundMessageAuthRepository } from "./inbound-message-auth.repository";

describe("InboundMessageAuthRepository", () => {
	let repository: InboundMessageAuthRepository;
	let redis: {
		eval: ReturnType<typeof vi.fn>;
		hgetall: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		redis = { eval: vi.fn(), hgetall: vi.fn() };
		const module = await Test.createTestingModule({
			providers: [InboundMessageAuthRepository, { provide: RedisService, useValue: redis }],
		}).compile();

		repository = module.get(InboundMessageAuthRepository);
	});

	it("should create the token-hash intent and code lookup with one atomic Redis operation", async () => {
		redis.eval.mockResolvedValue(1);

		await repository.createIntent({
			authCodeHash: "a".repeat(64),
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			intentTokenHash: "b".repeat(64),
			channel: InboundMessageAuthChannel.WHATSAPP,
		});

		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("HSET", KEYS[1]'),
			[
				`auth:inbound-message:intent-by-token-hash:${"b".repeat(64)}`,
				`auth:inbound-message:code:WHATSAPP:${"a".repeat(64)}`,
			],
			[
				"5c474828-dd9e-4490-a45a-0e82512bc45e",
				"PENDING",
				"b".repeat(64),
				String(InboundMessageAuthConstants.INTENT_EXPIRATION_SECONDS),
			],
		);
	});

	it("should report successful inbound-message intent creation when Redis creates both records", async () => {
		redis.eval.mockResolvedValue(1);

		const result = await repository.createIntent({
			authCodeHash: "a".repeat(64),
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			intentTokenHash: "b".repeat(64),
			channel: InboundMessageAuthChannel.WHATSAPP,
		});

		expect(result).toBe(true);
	});

	it("should report an inbound-message intent collision when either Redis key already exists", async () => {
		redis.eval.mockResolvedValue(0);

		const result = await repository.createIntent({
			authCodeHash: "a".repeat(64),
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			intentTokenHash: "b".repeat(64),
			channel: InboundMessageAuthChannel.WHATSAPP,
		});

		expect(result).toBe(false);
	});

	it("should hide an intent when Redis cannot find its token hash", async () => {
		redis.hgetall.mockResolvedValue(null);

		const result = await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(result).toBeNull();
	});

	it("should read the intent hash identified by its channel and token hash", async () => {
		redis.hgetall.mockResolvedValue(null);

		await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(redis.hgetall).toHaveBeenCalledWith(`auth:inbound-message:intent-by-token-hash:${"b".repeat(64)}`);
	});

	it("should expose an unverified intent as pending", async () => {
		redis.hgetall.mockResolvedValue({
			candidate_session_id: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: InboundMessageAuthIntentStatus.PENDING,
		});

		const result = await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(result).toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: InboundMessageAuthIntentStatus.PENDING,
			userId: null,
		});
	});

	it("should return the same intent structure while message verification is processing", async () => {
		redis.hgetall.mockResolvedValue({
			candidate_session_id: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: InboundMessageAuthIntentStatus.PROCESSING,
		});

		const result = await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(result).toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: InboundMessageAuthIntentStatus.PROCESSING,
			userId: null,
		});
	});

	it("should expose the candidate session and verified user", async () => {
		redis.hgetall.mockResolvedValue({
			candidate_session_id: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: InboundMessageAuthIntentStatus.VERIFIED,
			user_id: "user-id",
		});

		const result = await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(result).toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: InboundMessageAuthIntentStatus.VERIFIED,
			userId: "user-id",
		});
	});

	it.each([
		{ status: InboundMessageAuthIntentStatus.VERIFIED, candidate_session_id: "", user_id: "user-id" },
		{
			status: InboundMessageAuthIntentStatus.VERIFIED,
			candidate_session_id: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			user_id: "",
		},
		{
			status: "UNKNOWN",
			candidate_session_id: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			user_id: "user-id",
		},
	])("should reject a corrupted intent", async (storedIntent) => {
		redis.hgetall.mockResolvedValue(storedIntent);

		const result = await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(result).toBeNull();
	});

	it("should preserve Redis failures for the global error boundary", async () => {
		const redisError = new Error("redis unavailable");
		redis.hgetall.mockRejectedValue(redisError);

		await expect(
			repository.findIntentByTokenHash({
				intentTokenHash: "b".repeat(64),
			}),
		).rejects.toBe(redisError);
	});

	it("should delete temporary intents through their session reverse indexes", async () => {
		await repository.deleteIntentsForSessions({ sessionIds: ["session-one", "session-two"] });

		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining("local intentKey"),
			[
				"auth:inbound-message:intent-key-by-session:session-one",
				"auth:inbound-message:intent-key-by-session:session-two",
			],
			[],
		);
	});

	it("should avoid calling Redis when no session can have a temporary intent", async () => {
		await repository.deleteIntentsForSessions({ sessionIds: [] });

		expect(redis.eval).not.toHaveBeenCalled();
	});

	it("should return the token hash and candidate session claimed atomically by code hash", async () => {
		redis.eval.mockResolvedValue(["b".repeat(64), "5c474828-dd9e-4490-a45a-0e82512bc45e"]);

		const result = await repository.getIntentOrNullAndMarkAsProcessing({
			authCodeHash: "a".repeat(64),
			providerMessageId: "wamid.message",
			nowMilliseconds: 1_786_547_200_000,
			channel: InboundMessageAuthChannel.WHATSAPP,
		});

		expect(result).toEqual({
			intentTokenHash: "b".repeat(64),
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
		});
	});

	it("should claim a channel-specific code lookup against the channel-independent intent key", async () => {
		redis.eval.mockResolvedValue(["b".repeat(64), "5c474828-dd9e-4490-a45a-0e82512bc45e"]);

		await repository.getIntentOrNullAndMarkAsProcessing({
			authCodeHash: "a".repeat(64),
			providerMessageId: "wamid.message",
			nowMilliseconds: 1_786_547_200_000,
			channel: InboundMessageAuthChannel.WHATSAPP,
		});

		expect({ keys: redis.eval.mock.calls[0]?.[1], intentKeyPrefix: redis.eval.mock.calls[0]?.[2]?.[0] }).toEqual({
			keys: [`auth:inbound-message:code:WHATSAPP:${"a".repeat(64)}`],
			intentKeyPrefix: "auth:inbound-message:intent-by-token-hash:",
		});
	});

	it("should keep an on-time code and its claimed intent alive through the processing recovery window", async () => {
		redis.eval.mockResolvedValue(["b".repeat(64), "5c474828-dd9e-4490-a45a-0e82512bc45e"]);

		await repository.getIntentOrNullAndMarkAsProcessing({
			authCodeHash: "a".repeat(64),
			providerMessageId: "wamid.message",
			nowMilliseconds: 1_786_547_200_000,
			channel: InboundMessageAuthChannel.WHATSAPP,
		});

		expect({ script: redis.eval.mock.calls[0]?.[0], ttl: redis.eval.mock.calls[0]?.[2]?.[6] }).toEqual({
			script: expect.stringMatching(/PEXPIRE", intentKey[\s\S]*PEXPIRE", KEYS\[1\]/),
			ttl: String(InboundMessageAuthConstants.PROCESSING_STALE_AFTER_MILLISECONDS),
		});
	});

	it("should return no intent for an unknown or actively claimed code lookup", async () => {
		redis.eval.mockResolvedValue([]);

		const result = await repository.getIntentOrNullAndMarkAsProcessing({
			authCodeHash: "a".repeat(64),
			providerMessageId: "wamid.message",
			nowMilliseconds: 1_786_547_200_000,
			channel: InboundMessageAuthChannel.WHATSAPP,
		});

		expect(result).toBeNull();
	});

	it("should require Queue or Meta retry while the same message still owns active processing", async () => {
		redis.eval.mockResolvedValue(["PROCESSING_IN_PROGRESS"]);

		await expect(
			repository.getIntentOrNullAndMarkAsProcessing({
				authCodeHash: "a".repeat(64),
				providerMessageId: "wamid.message",
				nowMilliseconds: 1_786_547_200_000,
				channel: InboundMessageAuthChannel.WHATSAPP,
			}),
		).rejects.toBeInstanceOf(InboundMessageAuthProcessingInProgressError);
	});

	it("should verify the intent and create its candidate-session reverse index atomically", async () => {
		redis.eval.mockResolvedValue(1);

		await repository.markProcessingIntentAsVerified({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			authCodeHash: "a".repeat(64),
			intentTokenHash: "b".repeat(64),
			providerMessageId: "wamid.message",
			userId: "user-id",
			channel: InboundMessageAuthChannel.WHATSAPP,
		});

		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("SET", KEYS[3], KEYS[1]'),
			[
				`auth:inbound-message:intent-by-token-hash:${"b".repeat(64)}`,
				`auth:inbound-message:code:WHATSAPP:${"a".repeat(64)}`,
				"auth:inbound-message:intent-key-by-session:5c474828-dd9e-4490-a45a-0e82512bc45e",
			],
			[
				"PROCESSING",
				"wamid.message",
				"VERIFIED",
				"user-id",
				String(InboundMessageAuthConstants.EXCHANGE_EXPIRATION_SECONDS),
				"5c474828-dd9e-4490-a45a-0e82512bc45e",
			],
		);
	});

	it("should complete atomic intent verification when the message still owns processing", async () => {
		redis.eval.mockResolvedValue(1);

		await expect(
			repository.markProcessingIntentAsVerified({
				candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
				authCodeHash: "a".repeat(64),
				intentTokenHash: "b".repeat(64),
				providerMessageId: "wamid.message",
				userId: "user-id",
				channel: InboundMessageAuthChannel.WHATSAPP,
			}),
		).resolves.toBeUndefined();
	});

	it("should throw when intent verification loses processing ownership", async () => {
		redis.eval.mockResolvedValue(0);

		await expect(
			repository.markProcessingIntentAsVerified({
				candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
				authCodeHash: "a".repeat(64),
				intentTokenHash: "b".repeat(64),
				providerMessageId: "wamid.message",
				userId: "user-id",
				channel: InboundMessageAuthChannel.WHATSAPP,
			}),
		).rejects.toThrow("Inbound-message authentication intent processing ownership was lost");
	});

	it("should atomically return a processing intent to pending", async () => {
		redis.eval.mockResolvedValue(1);

		await repository.markProcessingIntentAsPending({
			intentTokenHash: "b".repeat(64),
			providerMessageId: "wamid.message",
		});

		expect(redis.eval.mock.calls[0]?.[1]).toEqual([`auth:inbound-message:intent-by-token-hash:${"b".repeat(64)}`]);
	});

	it("should throw when returning an intent to pending loses processing ownership", async () => {
		redis.eval.mockResolvedValue(0);

		await expect(
			repository.markProcessingIntentAsPending({
				intentTokenHash: "b".repeat(64),
				providerMessageId: "wamid.message",
			}),
		).rejects.toThrow("Inbound-message authentication intent processing ownership was lost");
	});
});
