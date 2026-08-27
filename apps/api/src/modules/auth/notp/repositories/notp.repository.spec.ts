import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { errors as UpstashRedisErrors } from "@upstash/redis";
import { createHash } from "node:crypto";
import { RedisService } from "../../../../core/redis/redis.service";
import { NotpChannel } from "../enums/notp-channel.enum";
import { NotpExchangeWaitOutcome } from "../enums/notp-exchange-wait-outcome.enum";
import { NotpRecoveryOutcome } from "../enums/notp-recovery-outcome.enum";
import { NotpIntentStatus } from "../enums/notp-intent-status.enum";
import { NotpProcessingInProgressError } from "../errors/notp-processing-in-progress.error";
import { NotpConstants } from "../notp.constants";
import { NotpObservabilityConstants } from "../notp-observability.constants";
import { NotpRepository } from "./notp.repository";

function _createVerificationSubscriberTestDouble() {
	const listeners = new Map<string, Set<(event: unknown) => void>>();

	return {
		emit: (eventType: string, event: unknown) => {
			for (const listener of listeners.get(eventType) ?? []) listener(event);
		},
		listenerCount: () =>
			Array.from(listeners.values()).reduce((count, eventListeners) => count + eventListeners.size, 0),
		on: vi.fn((eventType: string, listener: (event: unknown) => void) => {
			const eventListeners = listeners.get(eventType) ?? new Set<(event: unknown) => void>();
			eventListeners.add(listener);
			listeners.set(eventType, eventListeners);
		}),
		removeAllListeners: vi.fn(() => listeners.clear()),
		unsubscribe: vi.fn(async () => undefined),
	};
}

function _createPendingIntentScriptResult(): string[] {
	return ["5c474828-dd9e-4490-a45a-0e82512bc45e", NotpIntentStatus.PENDING, ""];
}

function _createVerifiedIntentScriptResult(): string[] {
	return ["5c474828-dd9e-4490-a45a-0e82512bc45e", NotpIntentStatus.VERIFIED, "user-id"];
}

async function _flushSettledPromiseCallbacks(): Promise<void> {
	for (let callbackIndex = 0; callbackIndex < 8; callbackIndex += 1) await Promise.resolve();
}

describe("NotpRepository", () => {
	let repository: NotpRepository;
	let findIntentByTokenHashScriptExec: ReturnType<typeof vi.fn>;
	let getIntentOrNullAndMarkAsProcessingScriptExec: ReturnType<typeof vi.fn>;
	let markProcessingIntentAsVerifiedScriptExec: ReturnType<typeof vi.fn>;
	let preloadScript: ReturnType<typeof vi.fn>;
	let preloadScripts: ReturnType<typeof vi.fn>;
	let verificationSubscriber: ReturnType<typeof _createVerificationSubscriberTestDouble>;
	let redis: {
		createScript: ReturnType<typeof vi.fn>;
		eval: ReturnType<typeof vi.fn>;
		pipeline: ReturnType<typeof vi.fn>;
		set: ReturnType<typeof vi.fn>;
		subscribe: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
		findIntentByTokenHashScriptExec = vi.fn();
		getIntentOrNullAndMarkAsProcessingScriptExec = vi.fn();
		markProcessingIntentAsVerifiedScriptExec = vi.fn();
		preloadScript = vi.fn();
		preloadScripts = vi.fn();
		verificationSubscriber = _createVerificationSubscriberTestDouble();
		const scriptPreloadPipeline = {
			scriptLoad: preloadScript,
			exec: preloadScripts,
		};
		preloadScript.mockReturnValue(scriptPreloadPipeline);

		let createdScriptCount = 0;
		redis = {
			createScript: vi.fn((script: string) => {
				const exec = [
					findIntentByTokenHashScriptExec,
					getIntentOrNullAndMarkAsProcessingScriptExec,
					markProcessingIntentAsVerifiedScriptExec,
				][createdScriptCount % 3];
				if (exec === undefined) throw new Error("Unexpected Redis script");
				createdScriptCount += 1;

				return { script: script, exec: exec };
			}),
			eval: vi.fn(),
			pipeline: vi.fn(() => scriptPreloadPipeline),
			set: vi.fn().mockResolvedValue("OK"),
			subscribe: vi.fn(() => verificationSubscriber),
		};
		const module = await Test.createTestingModule({
			providers: [NotpRepository, { provide: RedisService, useValue: redis }],
		}).compile();

		repository = module.get(NotpRepository);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("should preload the critical NOTP scripts with one Redis request before serving traffic", async () => {
		await repository.onModuleInit();

		expect(redis.pipeline).toHaveBeenCalledOnce();
		expect(preloadScript).toHaveBeenCalledTimes(3);
		expect(preloadScript.mock.calls).toEqual([
			[expect.stringContaining('redis.call("HMGET", KEYS[1]')],
			[expect.stringContaining('redis.call("HMGET", intentKey')],
			[expect.stringContaining('redis.call("HSET", KEYS[1]')],
		]);
		expect(preloadScripts).toHaveBeenCalledOnce();
	});

	it("should preserve startup availability when first-use script loading can recover from a preload failure", async () => {
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
		vi.stubEnv("NODE_ENV", "development");
		preloadScripts.mockRejectedValueOnce(new Error("redis unavailable"));

		const result = await repository.onModuleInit();

		expect({ result: result, warning: warn.mock.calls[0]?.[0] }).toEqual({
			result: undefined,
			warning: expect.objectContaining({
				errorMessage: "redis unavailable",
				errorName: "Error",
				errorStackFrames: expect.stringContaining("notp.repository.spec.ts"),
				event: NotpObservabilityConstants.REDIS_SCRIPTS_PRELOAD_FAILED_EVENT,
				outcome: NotpRecoveryOutcome.FALLBACK_TO_FIRST_USE,
			}),
		});

		warn.mockRestore();
	});

	it("should create the token-hash intent and code lookup with one atomic Redis operation", async () => {
		redis.eval.mockResolvedValue(1);

		await repository.createIntent({
			notpCodeHash: "a".repeat(64),
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			intentTokenHash: "b".repeat(64),
			channel: NotpChannel.WHATSAPP,
		});

		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("HSET", KEYS[1]'),
			[`auth:notp:intent-by-token-hash:${"b".repeat(64)}`, `auth:notp:code:WHATSAPP:${"a".repeat(64)}`],
			[
				"5c474828-dd9e-4490-a45a-0e82512bc45e",
				"PENDING",
				"b".repeat(64),
				String(NotpConstants.INTENT_EXPIRATION_SECONDS),
			],
		);
	});

	it("should report successful NOTP intent creation when Redis creates both records", async () => {
		redis.eval.mockResolvedValue(1);

		const result = await repository.createIntent({
			notpCodeHash: "a".repeat(64),
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			intentTokenHash: "b".repeat(64),
			channel: NotpChannel.WHATSAPP,
		});

		expect(result).toBe(true);
	});

	it("should report a NOTP intent collision when either Redis key already exists", async () => {
		redis.eval.mockResolvedValue(0);

		const result = await repository.createIntent({
			notpCodeHash: "a".repeat(64),
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			intentTokenHash: "b".repeat(64),
			channel: NotpChannel.WHATSAPP,
		});

		expect(result).toBe(false);
	});

	it("should hide an intent when Redis cannot find its token hash", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue([]);

		const result = await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(result).toBeNull();
	});

	it("should read and validate an intent with one preloaded Redis script", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue([]);

		await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledWith(
			[`auth:notp:intent-by-token-hash:${"b".repeat(64)}`],
			[],
		);
	});

	it("should expose an unverified intent as pending", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue([
			"5c474828-dd9e-4490-a45a-0e82512bc45e",
			NotpIntentStatus.PENDING,
		]);

		const result = await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(result).toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
	});

	it("should return the same intent structure while message verification is processing", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue([
			"5c474828-dd9e-4490-a45a-0e82512bc45e",
			NotpIntentStatus.PROCESSING,
		]);

		const result = await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(result).toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PROCESSING,
		});
	});

	it("should expose a verified intent with its user", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue(_createVerifiedIntentScriptResult());

		const result = await repository.findIntentByTokenHash({
			intentTokenHash: "b".repeat(64),
		});

		expect(result).toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.VERIFIED,
			userId: "user-id",
		});
	});

	it("should replace command-bearing Redis failures with a safe intent-lookup error", async () => {
		const intentTokenHash = "b".repeat(64);
		findIntentByTokenHashScriptExec.mockRejectedValue(
			new UpstashRedisErrors.UpstashError(`redis unavailable, command was: ${intentTokenHash}`),
		);

		const error = await repository
			.findIntentByTokenHash({
				intentTokenHash: intentTokenHash,
			})
			.catch((intentLookupError: unknown) => intentLookupError);

		expect({
			cause: (error as Error & { cause?: unknown }).cause,
			isError: error instanceof Error,
			leaksCommand: String(error).includes("command was"),
			leaksTokenHash: String(error).includes(intentTokenHash),
			message: (error as Error).message,
		}).toEqual({
			cause: expect.any(UpstashRedisErrors.UpstashError),
			isError: true,
			leaksCommand: false,
			leaksTokenHash: false,
			message: "NOTP intent lookup was rejected by Redis",
		});
	});

	it("should return a missing intent with one authoritative read and no lease or subscription", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue([]);

		await expect(
			repository.findIntentByTokenHashAfterWaitingForVerification({
				intentTokenHash: "b".repeat(64),
			}),
		).resolves.toBeNull();
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledOnce();
		expect(redis.set).not.toHaveBeenCalled();
		expect(redis.subscribe).not.toHaveBeenCalled();
	});

	it("should use the reviewed adaptive authoritative-read cadence", () => {
		expect([...NotpConstants.EXCHANGE_AUTHORITATIVE_READ_INTERVALS_MILLISECONDS]).toEqual([
			400, 700, 1_000, 1_500, 2_000, 3_000,
		]);
	});

	it("should return an already-verified intent with one authoritative read and no lease or subscription", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue(_createVerifiedIntentScriptResult());

		await expect(
			repository.findIntentByTokenHashAfterWaitingForVerification({
				intentTokenHash: "b".repeat(64),
			}),
		).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.VERIFIED,
			userId: "user-id",
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledOnce();
		expect(redis.set).not.toHaveBeenCalled();
		expect(redis.subscribe).not.toHaveBeenCalled();
		expect(verificationSubscriber.unsubscribe).not.toHaveBeenCalled();
		expect(verificationSubscriber.listenerCount()).toBe(0);
	});

	it("should use an anonymous intent-specific channel that exposes neither the token verifier nor identity data", async () => {
		findIntentByTokenHashScriptExec
			.mockResolvedValueOnce(_createPendingIntentScriptResult())
			.mockResolvedValueOnce(_createVerifiedIntentScriptResult());
		const intentTokenHash = "b".repeat(64);

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: intentTokenHash,
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await resultPromise;

		const subscribedChannel: unknown = redis.subscribe.mock.calls[0]?.[0];
		expect(subscribedChannel).toBe(
			`auth:notp:verification:${createHash("sha256")
				.update(`auth:notp:verification-channel:${intentTokenHash}`)
				.digest("hex")}`,
		);
		expect(String(subscribedChannel)).not.toContain(intentTokenHash);
		expect(String(subscribedChannel)).not.toContain("user-id");
		expect(String(subscribedChannel)).not.toContain("5c474828-dd9e-4490-a45a-0e82512bc45e");
		expect(redis.set).toHaveBeenCalledWith(`${String(subscribedChannel)}:wait-lease`, expect.any(String), {
			nx: true,
			px: NotpConstants.EXCHANGE_LONG_POLL_LEASE_EXPIRATION_MILLISECONDS,
		});
		expect(String(redis.set.mock.calls[0]?.[0])).not.toContain(intentTokenHash);
	});

	it("should recover a verification published between subscription readiness and the race-closing reread", async () => {
		let markIntentReadAsStarted!: () => void;
		const intentReadStarted = new Promise<void>((resolve) => {
			markIntentReadAsStarted = resolve;
		});
		let resolveIntentRead!: (value: string[]) => void;
		findIntentByTokenHashScriptExec
			.mockResolvedValueOnce(_createPendingIntentScriptResult())
			.mockImplementationOnce(() => {
				markIntentReadAsStarted();
				return new Promise<string[]>((resolve) => {
					resolveIntentRead = resolve;
				});
			});

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await intentReadStarted;
		verificationSubscriber.emit("message", {
			channel: redis.subscribe.mock.calls[0]?.[0],
			message: NotpIntentStatus.VERIFIED,
		});
		resolveIntentRead(_createVerifiedIntentScriptResult());

		await expect(resultPromise).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.VERIFIED,
			userId: "user-id",
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(2);
	});

	it("should reread the intent when verification is published after the race-closing pending read", async () => {
		let intentReadCount = 0;
		let markRaceClosingReadAsCompleted!: () => void;
		const raceClosingReadCompleted = new Promise<void>((resolve) => {
			markRaceClosingReadAsCompleted = resolve;
		});
		findIntentByTokenHashScriptExec.mockImplementation(async () => {
			intentReadCount += 1;
			if (intentReadCount === 2) markRaceClosingReadAsCompleted();
			return intentReadCount <= 2 ? _createPendingIntentScriptResult() : _createVerifiedIntentScriptResult();
		});

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await raceClosingReadCompleted;
		verificationSubscriber.emit("message", {
			channel: redis.subscribe.mock.calls[0]?.[0],
			message: NotpIntentStatus.VERIFIED,
		});

		await expect(resultPromise).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.VERIFIED,
			userId: "user-id",
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(3);
	});

	it("should resume adaptive reads when a verification notification arrives before the verified intent is visible", async () => {
		let verifiedIntentVisible = false;
		findIntentByTokenHashScriptExec.mockImplementation(async () =>
			verifiedIntentVisible ? _createVerifiedIntentScriptResult() : _createPendingIntentScriptResult(),
		);

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await _flushSettledPromiseCallbacks();
		for (const interval of [400, 700, 1_000]) await vi.advanceTimersByTimeAsync(interval);
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(5);
		verificationSubscriber.emit("message", {
			channel: redis.subscribe.mock.calls[0]?.[0],
			message: NotpIntentStatus.VERIFIED,
		});
		await _flushSettledPromiseCallbacks();

		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(6);
		expect(verificationSubscriber.unsubscribe).not.toHaveBeenCalled();
		verifiedIntentVisible = true;
		await vi.advanceTimersByTimeAsync(399);
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(6);
		await vi.advanceTimersByTimeAsync(1);

		await expect(resultPromise).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.VERIFIED,
			userId: "user-id",
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(7);
		expect(verificationSubscriber.unsubscribe).toHaveBeenCalledOnce();
	});

	it("should catch verification without a publish on the first adaptive authoritative reread", async () => {
		let verified = false;
		findIntentByTokenHashScriptExec.mockImplementation(async () => {
			return verified ? _createVerifiedIntentScriptResult() : _createPendingIntentScriptResult();
		});

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await _flushSettledPromiseCallbacks();
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(2);
		verified = true;
		await vi.advanceTimersByTimeAsync(NotpConstants.EXCHANGE_AUTHORITATIVE_READ_INTERVALS_MILLISECONDS[0]);

		await expect(resultPromise).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.VERIFIED,
			userId: "user-id",
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(3);
		expect(verificationSubscriber.unsubscribe).toHaveBeenCalledOnce();
		expect(verificationSubscriber.listenerCount()).toBe(0);
	});

	it("should make a final authoritative reread when the bounded verification wait times out", async () => {
		let verified = false;
		findIntentByTokenHashScriptExec.mockImplementation(async () => {
			return verified ? _createVerifiedIntentScriptResult() : _createPendingIntentScriptResult();
		});

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await _flushSettledPromiseCallbacks();
		await vi.advanceTimersByTimeAsync(NotpConstants.EXCHANGE_LONG_POLL_TIMEOUT_MILLISECONDS - 1);
		verified = true;
		await vi.advanceTimersByTimeAsync(1);

		await expect(resultPromise).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.VERIFIED,
			userId: "user-id",
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(12);
	});

	it("should return the existing pending contract after the final timeout reread remains pending", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await vi.advanceTimersByTimeAsync(NotpConstants.EXCHANGE_LONG_POLL_TIMEOUT_MILLISECONDS);

		await expect(resultPromise).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(12);
	});

	it("should fall back to the existing pending contract when subscription readiness times out", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		await vi.advanceTimersByTimeAsync(NotpConstants.EXCHANGE_SUBSCRIPTION_READY_TIMEOUT_MILLISECONDS);

		await expect(resultPromise).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(2);
		expect(verificationSubscriber.unsubscribe).toHaveBeenCalledOnce();
		expect(verificationSubscriber.listenerCount()).toBe(0);
	});

	it("should stop a stalled authoritative read and return pending when the client aborts", async () => {
		let resolveLateIntentRead!: (storedIntentValues: string[]) => void;
		findIntentByTokenHashScriptExec.mockResolvedValueOnce(_createPendingIntentScriptResult()).mockImplementationOnce(
			() =>
				new Promise<string[]>((resolve) => {
					resolveLateIntentRead = resolve;
				}),
		);
		const abortController = new AbortController();

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			abortSignal: abortController.signal,
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await _flushSettledPromiseCallbacks();
		abortController.abort();

		await expect(resultPromise).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(2);
		expect(verificationSubscriber.unsubscribe).toHaveBeenCalledOnce();
		expect(verificationSubscriber.listenerCount()).toBe(0);
		resolveLateIntentRead(_createPendingIntentScriptResult());
		await _flushSettledPromiseCallbacks();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("should not delay the exchange response when token-owned lease release stalls", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());
		redis.eval.mockImplementationOnce(() => new Promise<number>(() => undefined));
		const abortController = new AbortController();

		const exchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			abortSignal: abortController.signal,
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await _flushSettledPromiseCallbacks();
		abortController.abort();

		await expect(exchange).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		await _flushSettledPromiseCallbacks();
		expect(verificationSubscriber.unsubscribe).toHaveBeenCalledOnce();
		expect(redis.eval).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("should make a final authoritative reread when the subscription reports an error", async () => {
		let verified = false;
		findIntentByTokenHashScriptExec.mockImplementation(async () => {
			return verified ? _createVerifiedIntentScriptResult() : _createPendingIntentScriptResult();
		});

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await _flushSettledPromiseCallbacks();
		verified = true;
		verificationSubscriber.emit("error", new Error("subscription unavailable"));

		await expect(resultPromise).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.VERIFIED,
			userId: "user-id",
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(3);
		expect(verificationSubscriber.unsubscribe).toHaveBeenCalledOnce();
		expect(verificationSubscriber.listenerCount()).toBe(0);
	});

	it("should safely make an immediate authoritative reread when subscription creation fails", async () => {
		redis.subscribe.mockImplementationOnce(() => {
			throw new Error("subscription unavailable");
		});
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());

		await expect(
			repository.findIntentByTokenHashAfterWaitingForVerification({
				intentTokenHash: "b".repeat(64),
			}),
		).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(2);
		expect(redis.eval).toHaveBeenCalledOnce();
		expect(verificationSubscriber.listenerCount()).toBe(0);
	});

	it("should make an immediate authoritative reread without subscribing when lease acquisition fails", async () => {
		redis.set.mockRejectedValueOnce(new Error("redis unavailable"));
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());

		await expect(
			repository.findIntentByTokenHashAfterWaitingForVerification({
				intentTokenHash: "b".repeat(64),
			}),
		).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(2);
		expect(redis.subscribe).not.toHaveBeenCalled();
		expect(redis.eval).not.toHaveBeenCalled();
	});

	it("should never subscribe when lease acquisition does not finish before the lease-hold deadline", async () => {
		let rejectLateLeaseAcquisition!: (error: Error) => void;
		redis.set.mockImplementationOnce(
			() =>
				new Promise((_resolve, reject) => {
					rejectLateLeaseAcquisition = reject;
				}),
		);
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());

		const exchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		await vi.advanceTimersByTimeAsync(NotpConstants.EXCHANGE_LONG_POLL_MAX_LEASE_HOLD_MILLISECONDS);

		await expect(exchange).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		expect(redis.subscribe).not.toHaveBeenCalled();
		expect(redis.eval).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);

		rejectLateLeaseAcquisition(new Error(`command was: ${"b".repeat(64)}`));
		await _flushSettledPromiseCallbacks();
	});

	it("should clean up its subscriber while preserving an intent read failure", async () => {
		const redisError = new Error("redis unavailable");
		findIntentByTokenHashScriptExec
			.mockResolvedValueOnce(_createPendingIntentScriptResult())
			.mockRejectedValueOnce(redisError);

		const resultPromise = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);

		await expect(resultPromise).rejects.toBe(redisError);
		expect(verificationSubscriber.unsubscribe).toHaveBeenCalledOnce();
		expect(verificationSubscriber.listenerCount()).toBe(0);
	});

	it("should close the first subscriber before lease expiry when an authoritative read remains stalled", async () => {
		const secondRepository = new NotpRepository(redis as never);
		const secondVerificationSubscriber = _createVerificationSubscriberTestDouble();
		redis.subscribe.mockReturnValueOnce(verificationSubscriber).mockReturnValueOnce(secondVerificationSubscriber);
		let resolveStalledIntentRead!: (storedIntentValues: string[]) => void;
		let intentReadCount = 0;
		findIntentByTokenHashScriptExec.mockImplementation(() => {
			intentReadCount += 1;
			if (intentReadCount !== 2) return Promise.resolve(_createPendingIntentScriptResult());

			return new Promise<string[]>((resolve) => {
				resolveStalledIntentRead = resolve;
			});
		});

		const firstExchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await _flushSettledPromiseCallbacks();
		expect(findIntentByTokenHashScriptExec).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(NotpConstants.EXCHANGE_LONG_POLL_MAX_LEASE_HOLD_MILLISECONDS);
		await expect(firstExchange).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		expect(verificationSubscriber.unsubscribe).toHaveBeenCalledOnce();
		expect(verificationSubscriber.listenerCount()).toBe(0);

		await vi.advanceTimersByTimeAsync(
			NotpConstants.EXCHANGE_LONG_POLL_LEASE_EXPIRATION_MILLISECONDS -
				NotpConstants.EXCHANGE_LONG_POLL_MAX_LEASE_HOLD_MILLISECONDS,
		);
		const secondAbortController = new AbortController();
		const secondExchange = secondRepository.findIntentByTokenHashAfterWaitingForVerification({
			abortSignal: secondAbortController.signal,
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		expect(redis.subscribe).toHaveBeenCalledTimes(2);
		expect(verificationSubscriber.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
			redis.subscribe.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
		);

		secondAbortController.abort();
		await expect(secondExchange).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		resolveStalledIntentRead(_createPendingIntentScriptResult());
		await _flushSettledPromiseCallbacks();
		expect(secondVerificationSubscriber.unsubscribe).toHaveBeenCalledOnce();
		expect(secondVerificationSubscriber.listenerCount()).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("should allow only one cross-repository subscription for one hundred concurrent exchanges", async () => {
		const secondRepository = new NotpRepository(redis as never);
		let verified = false;
		findIntentByTokenHashScriptExec.mockImplementation(async () => {
			return verified ? _createVerifiedIntentScriptResult() : _createPendingIntentScriptResult();
		});
		redis.set.mockResolvedValueOnce("OK").mockResolvedValue(null);

		const firstExchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await _flushSettledPromiseCallbacks();

		const duplicateResults = await Promise.all(
			Array.from({ length: 99 }, () =>
				secondRepository.findIntentByTokenHashAfterWaitingForVerification({
					intentTokenHash: "b".repeat(64),
				}),
			),
		);

		expect(duplicateResults).toEqual(
			Array.from({ length: 99 }, () => ({
				candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
				status: NotpIntentStatus.PENDING,
			})),
		);
		expect(redis.set).toHaveBeenCalledTimes(100);
		expect(redis.subscribe).toHaveBeenCalledOnce();

		verified = true;
		verificationSubscriber.emit("message", {
			channel: redis.subscribe.mock.calls[0]?.[0],
			message: NotpIntentStatus.VERIFIED,
		});

		await expect(firstExchange).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.VERIFIED,
			userId: "user-id",
		});
		expect(verificationSubscriber.unsubscribe).toHaveBeenCalledOnce();
		expect(verificationSubscriber.listenerCount()).toBe(0);
	});

	it("should cap active verification waits at twenty-five per container", async () => {
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());
		redis.set.mockResolvedValue("OK");
		const abortControllers = Array.from({ length: 25 }, () => new AbortController());
		const activeExchanges = abortControllers.map((abortController, exchangeIndex) =>
			repository.findIntentByTokenHashAfterWaitingForVerification({
				abortSignal: abortController.signal,
				intentTokenHash: exchangeIndex.toString(16).padStart(64, "0"),
			}),
		);
		await _flushSettledPromiseCallbacks();

		expect(redis.subscribe).toHaveBeenCalledTimes(25);

		await expect(
			repository.findIntentByTokenHashAfterWaitingForVerification({
				intentTokenHash: "f".repeat(64),
			}),
		).resolves.toEqual({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		expect(redis.subscribe).toHaveBeenCalledTimes(25);

		for (const abortController of abortControllers) abortController.abort();
		await Promise.all(activeExchanges);
	});

	it("should never release a successor lease after its own lease expires", async () => {
		const leaseOwnersByKey = new Map<string, string>();
		redis.set.mockImplementation(async (key: string, value: string) => {
			leaseOwnersByKey.set(key, value);
			return "OK";
		});
		redis.eval.mockImplementation(async (_script: string, keys: string[], args: string[]) => {
			const leaseKey = keys[0];
			const expectedOwner = args[0];
			if (leaseKey === undefined || expectedOwner === undefined) return 0;
			if (leaseOwnersByKey.get(leaseKey) !== expectedOwner) return 0;
			leaseOwnersByKey.delete(leaseKey);
			return 1;
		});
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());
		const abortController = new AbortController();

		const exchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			abortSignal: abortController.signal,
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await _flushSettledPromiseCallbacks();
		const leaseKey: unknown = redis.set.mock.calls[0]?.[0];
		if (typeof leaseKey !== "string") throw new Error("Expected a verification wait lease key");
		leaseOwnersByKey.set(leaseKey, "successor-owner");
		abortController.abort();
		await exchange;

		expect(leaseOwnersByKey.get(leaseKey)).toBe("successor-owner");
		expect(redis.eval.mock.calls[0]?.[0]).toMatch(
			/redis.call\("GET", KEYS\[1\]\) ~= ARGV\[1\][\s\S]*redis.call\("DEL", KEYS\[1\]\)/,
		);
	});

	it("should record when an already-aborted exchange skips the verification wait", async () => {
		const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());
		const abortController = new AbortController();
		abortController.abort();

		await repository.findIntentByTokenHashAfterWaitingForVerification({
			abortSignal: abortController.signal,
			intentTokenHash: "b".repeat(64),
		});

		expect(log).toHaveBeenCalledWith({
			event: NotpObservabilityConstants.EXCHANGE_WAIT_COMPLETED_EVENT,
			outcome: NotpExchangeWaitOutcome.ABORTED,
		});
	});

	it("should record when another request owns the verification wait lease", async () => {
		const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());
		redis.set.mockResolvedValue(null);

		await repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});

		expect(log).toHaveBeenCalledWith({
			event: NotpObservabilityConstants.EXCHANGE_WAIT_COMPLETED_EVENT,
			outcome: NotpExchangeWaitOutcome.LEASE_HELD_BY_ANOTHER_REQUEST,
		});
	});

	it("should report lease acquisition recovery without exposing the Redis failure", async () => {
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());
		redis.set.mockRejectedValue(new Error("private Redis command"));

		await repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});

		expect({
			leaksFailure: JSON.stringify(warn.mock.calls).includes("private Redis command"),
			warning: warn.mock.calls[0]?.[0],
		}).toEqual({
			leaksFailure: false,
			warning: expect.objectContaining({
				errorName: "Error",
				event: NotpObservabilityConstants.EXCHANGE_LEASE_ACQUISITION_FAILED_EVENT,
				outcome: NotpRecoveryOutcome.FALLBACK_TO_AUTHORITATIVE_READ,
			}),
		});
	});

	it("should record when lease acquisition exceeds the maximum hold duration", async () => {
		const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());
		redis.set.mockImplementation(() => new Promise(() => undefined));

		const exchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await vi.advanceTimersByTimeAsync(NotpConstants.EXCHANGE_LONG_POLL_MAX_LEASE_HOLD_MILLISECONDS);
		await exchange;

		expect(log).toHaveBeenCalledWith({
			event: NotpObservabilityConstants.EXCHANGE_WAIT_COMPLETED_EVENT,
			outcome: NotpExchangeWaitOutcome.LEASE_DEADLINE_EXCEEDED,
		});
	});

	it("should report exhausted per-container verification wait capacity", async () => {
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());
		Object.assign(repository, {
			_activeExchangeLongPollCount: NotpConstants.MAX_CONCURRENT_EXCHANGE_LONG_POLLS_PER_CONTAINER,
		});

		await repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});

		expect(warn).toHaveBeenCalledWith({
			event: NotpObservabilityConstants.EXCHANGE_CAPACITY_EXHAUSTED_EVENT,
			outcome: NotpRecoveryOutcome.FALLBACK_TO_AUTHORITATIVE_READ,
		});
	});

	it("should report subscription creation recovery without exposing the provider failure", async () => {
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());
		redis.subscribe.mockImplementation(() => {
			throw new Error("private subscription provider failure");
		});

		await repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});

		expect({
			leaksFailure: JSON.stringify(warn.mock.calls).includes("private subscription provider failure"),
			warning: warn.mock.calls[0]?.[0],
		}).toEqual({
			leaksFailure: false,
			warning: expect.objectContaining({
				errorName: "Error",
				event: NotpObservabilityConstants.EXCHANGE_SUBSCRIPTION_CREATE_FAILED_EVENT,
				outcome: NotpRecoveryOutcome.FALLBACK_TO_AUTHORITATIVE_READ,
			}),
		});
	});

	it("should report when subscription readiness exceeds its bounded wait", async () => {
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());

		const exchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		await vi.advanceTimersByTimeAsync(NotpConstants.EXCHANGE_SUBSCRIPTION_READY_TIMEOUT_MILLISECONDS);
		await exchange;

		expect(warn).toHaveBeenCalledWith({
			event: NotpObservabilityConstants.EXCHANGE_SUBSCRIPTION_READINESS_TIMED_OUT_EVENT,
			outcome: NotpRecoveryOutcome.FALLBACK_TO_AUTHORITATIVE_READ,
		});
	});

	it("should report a failed active subscription before the authoritative reread", async () => {
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());

		const exchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("error", new Error("private subscriber failure"));
		await exchange;

		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({
				errorName: "Error",
				event: NotpObservabilityConstants.EXCHANGE_SUBSCRIPTION_FAILED_EVENT,
				outcome: NotpRecoveryOutcome.FALLBACK_TO_AUTHORITATIVE_READ,
			}),
		);
	});

	it("should record when the bounded verification notification wait expires", async () => {
		const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
		findIntentByTokenHashScriptExec.mockResolvedValue(_createPendingIntentScriptResult());

		const exchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await vi.advanceTimersByTimeAsync(NotpConstants.EXCHANGE_LONG_POLL_TIMEOUT_MILLISECONDS);
		await exchange;

		expect(log).toHaveBeenCalledWith({
			event: NotpObservabilityConstants.EXCHANGE_WAIT_COMPLETED_EVENT,
			outcome: NotpExchangeWaitOutcome.TIMED_OUT,
		});
	});

	it("should report a failed subscriber cleanup without failing the completed exchange", async () => {
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
		verificationSubscriber.unsubscribe.mockRejectedValue(new Error("private unsubscribe failure"));
		findIntentByTokenHashScriptExec
			.mockResolvedValueOnce(_createPendingIntentScriptResult())
			.mockResolvedValueOnce(_createVerifiedIntentScriptResult());

		const exchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await exchange;

		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({
				errorName: "Error",
				event: NotpObservabilityConstants.EXCHANGE_SUBSCRIPTION_CLEANUP_FAILED_EVENT,
				outcome: NotpRecoveryOutcome.DETACHED_CLEANUP_FAILED,
			}),
		);
	});

	it("should report a failed detached lease cleanup without failing the completed exchange", async () => {
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
		redis.eval.mockRejectedValue(new Error("private lease cleanup failure"));
		findIntentByTokenHashScriptExec
			.mockResolvedValueOnce(_createPendingIntentScriptResult())
			.mockResolvedValueOnce(_createVerifiedIntentScriptResult());

		const exchange = repository.findIntentByTokenHashAfterWaitingForVerification({
			intentTokenHash: "b".repeat(64),
		});
		await _flushSettledPromiseCallbacks();
		verificationSubscriber.emit("subscribe", 1);
		await exchange;
		await _flushSettledPromiseCallbacks();

		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({
				errorName: "Error",
				event: NotpObservabilityConstants.EXCHANGE_LEASE_CLEANUP_FAILED_EVENT,
				outcome: NotpRecoveryOutcome.DETACHED_CLEANUP_FAILED,
			}),
		);
	});

	it("should delete temporary intents through their session reverse indexes", async () => {
		await repository.deleteIntentsForSessions({ sessionIds: ["session-one", "session-two"] });

		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining("local intentKey"),
			["auth:notp:intent-key-by-session:session-one", "auth:notp:intent-key-by-session:session-two"],
			[],
		);
	});

	it("should avoid calling Redis when no session can have a temporary intent", async () => {
		await repository.deleteIntentsForSessions({ sessionIds: [] });

		expect(redis.eval).not.toHaveBeenCalled();
	});

	it("should return the token hash and candidate session claimed atomically by code hash", async () => {
		getIntentOrNullAndMarkAsProcessingScriptExec.mockResolvedValue([
			"b".repeat(64),
			"5c474828-dd9e-4490-a45a-0e82512bc45e",
		]);

		const result = await repository.getIntentOrNullAndMarkAsProcessing({
			notpCodeHash: "a".repeat(64),
			providerMessageId: "wamid.message",
			nowMilliseconds: 1_786_547_200_000,
			channel: NotpChannel.WHATSAPP,
		});

		expect(result).toEqual({
			intentTokenHash: "b".repeat(64),
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
		});
	});

	it("should claim a channel-specific code lookup against the channel-independent intent key", async () => {
		getIntentOrNullAndMarkAsProcessingScriptExec.mockResolvedValue([
			"b".repeat(64),
			"5c474828-dd9e-4490-a45a-0e82512bc45e",
		]);

		await repository.getIntentOrNullAndMarkAsProcessing({
			notpCodeHash: "a".repeat(64),
			providerMessageId: "wamid.message",
			nowMilliseconds: 1_786_547_200_000,
			channel: NotpChannel.WHATSAPP,
		});

		expect({
			keys: getIntentOrNullAndMarkAsProcessingScriptExec.mock.calls[0]?.[0],
			intentKeyPrefix: getIntentOrNullAndMarkAsProcessingScriptExec.mock.calls[0]?.[1]?.[0],
		}).toEqual({
			keys: [`auth:notp:code:WHATSAPP:${"a".repeat(64)}`],
			intentKeyPrefix: "auth:notp:intent-by-token-hash:",
		});
	});

	it("should keep an on-time code and its claimed intent alive through the processing recovery window", async () => {
		getIntentOrNullAndMarkAsProcessingScriptExec.mockResolvedValue([
			"b".repeat(64),
			"5c474828-dd9e-4490-a45a-0e82512bc45e",
		]);

		await repository.getIntentOrNullAndMarkAsProcessing({
			notpCodeHash: "a".repeat(64),
			providerMessageId: "wamid.message",
			nowMilliseconds: 1_786_547_200_000,
			channel: NotpChannel.WHATSAPP,
		});

		expect({
			script: redis.createScript.mock.calls[1]?.[0],
			ttl: getIntentOrNullAndMarkAsProcessingScriptExec.mock.calls[0]?.[1]?.[6],
		}).toEqual({
			script: expect.stringMatching(/PEXPIRE", intentKey[\s\S]*PEXPIRE", KEYS\[1\]/),
			ttl: String(NotpConstants.PROCESSING_STALE_AFTER_MILLISECONDS),
		});
	});

	it("should return no intent for an unknown or actively claimed code lookup", async () => {
		getIntentOrNullAndMarkAsProcessingScriptExec.mockResolvedValue([]);

		const result = await repository.getIntentOrNullAndMarkAsProcessing({
			notpCodeHash: "a".repeat(64),
			providerMessageId: "wamid.message",
			nowMilliseconds: 1_786_547_200_000,
			channel: NotpChannel.WHATSAPP,
		});

		expect(result).toBeNull();
	});

	it("should require Queue or Meta retry while the same message still owns active processing", async () => {
		getIntentOrNullAndMarkAsProcessingScriptExec.mockResolvedValue(["PROCESSING_IN_PROGRESS"]);

		await expect(
			repository.getIntentOrNullAndMarkAsProcessing({
				notpCodeHash: "a".repeat(64),
				providerMessageId: "wamid.message",
				nowMilliseconds: 1_786_547_200_000,
				channel: NotpChannel.WHATSAPP,
			}),
		).rejects.toBeInstanceOf(NotpProcessingInProgressError);
	});

	it("should retain a verified intent for a five-minute exchange recovery window", async () => {
		markProcessingIntentAsVerifiedScriptExec.mockResolvedValue(1);
		const intentTokenHash = "b".repeat(64);
		const verificationChannel = `auth:notp:verification:${createHash("sha256")
			.update(`auth:notp:verification-channel:${intentTokenHash}`)
			.digest("hex")}`;

		await repository.markProcessingIntentAsVerified({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			notpCodeHash: "a".repeat(64),
			intentTokenHash: intentTokenHash,
			providerMessageId: "wamid.message",
			userId: "user-id",
			channel: NotpChannel.WHATSAPP,
		});

		const verificationScript: unknown = redis.createScript.mock.calls[2]?.[0];
		if (typeof verificationScript !== "string") throw new Error("Expected the verification Lua script");
		expect(verificationScript).toMatch(
			/redis.call\("HSET", KEYS\[1\],[\s\S]*"status", ARGV\[3\][\s\S]*redis.call\("PUBLISH", ARGV\[7\], ARGV\[8\]\)/,
		);
		expect(markProcessingIntentAsVerifiedScriptExec).toHaveBeenCalledWith(
			[
				`auth:notp:intent-by-token-hash:${"b".repeat(64)}`,
				`auth:notp:code:WHATSAPP:${"a".repeat(64)}`,
				"auth:notp:intent-key-by-session:5c474828-dd9e-4490-a45a-0e82512bc45e",
			],
			[
				"PROCESSING",
				"wamid.message",
				"VERIFIED",
				"user-id",
				"300",
				"5c474828-dd9e-4490-a45a-0e82512bc45e",
				verificationChannel,
				NotpIntentStatus.VERIFIED,
			],
		);
		expect(verificationChannel).not.toContain(intentTokenHash);
		expect(markProcessingIntentAsVerifiedScriptExec.mock.calls[0]?.[1]?.slice(-2)).toEqual([
			verificationChannel,
			"VERIFIED",
		]);
	});

	it("should complete atomic intent verification when the message still owns processing", async () => {
		markProcessingIntentAsVerifiedScriptExec.mockResolvedValue(1);

		await expect(
			repository.markProcessingIntentAsVerified({
				candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
				notpCodeHash: "a".repeat(64),
				intentTokenHash: "b".repeat(64),
				providerMessageId: "wamid.message",
				userId: "user-id",
				channel: NotpChannel.WHATSAPP,
			}),
		).resolves.toBeUndefined();
	});

	it("should throw when intent verification loses processing ownership", async () => {
		markProcessingIntentAsVerifiedScriptExec.mockResolvedValue(0);

		await expect(
			repository.markProcessingIntentAsVerified({
				candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
				notpCodeHash: "a".repeat(64),
				intentTokenHash: "b".repeat(64),
				providerMessageId: "wamid.message",
				userId: "user-id",
				channel: NotpChannel.WHATSAPP,
			}),
		).rejects.toThrow("NOTP intent processing ownership was lost");
	});

	it("should atomically return a processing intent to pending", async () => {
		redis.eval.mockResolvedValue(1);

		await repository.markProcessingIntentAsPending({
			intentTokenHash: "b".repeat(64),
			providerMessageId: "wamid.message",
		});

		expect(redis.eval.mock.calls[0]?.[1]).toEqual([`auth:notp:intent-by-token-hash:${"b".repeat(64)}`]);
	});

	it("should throw when returning an intent to pending loses processing ownership", async () => {
		redis.eval.mockResolvedValue(0);

		await expect(
			repository.markProcessingIntentAsPending({
				intentTokenHash: "b".repeat(64),
				providerMessageId: "wamid.message",
			}),
		).rejects.toThrow("NOTP intent processing ownership was lost");
	});
});
