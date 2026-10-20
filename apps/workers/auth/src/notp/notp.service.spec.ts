import { createHash } from "node:crypto";
import * as td from "testdouble";
import type { z } from "zod";
import type { AccountRepository } from "../account/account.repository";
import { AppErrorCode } from "../errors/app-error-code.enum";
import type { SessionOutputSchema } from "../session/session-output.schema";
import type { SessionService } from "../session/session.service";
import { NotpChannel } from "./notp-channel.enum";
import { NotpIntentStatus, NotpProcessingClaimStatus } from "./notp-intent-status.enum";
import type { NotpRepository, StoredNotpIntent } from "./notp.repository";
import { NotpService } from "./notp.service";

type VerificationSubscription = ReturnType<NotpRepository["subscribeToVerification"]>["subscription"];

function _subscriber(): VerificationSubscription & {
	emit: (type: string, event?: unknown) => void;
	listenerCount: () => number;
} {
	const listeners = new Map<string, Set<(event: unknown) => void>>();
	const subscriber = td.object<VerificationSubscription>();
	td.when(subscriber.on(td.matchers.anything(), td.matchers.anything())).thenDo(
		(type: string, listener: (event: unknown) => void): void => {
			const eventListeners = listeners.get(type) ?? new Set<(event: unknown) => void>();
			eventListeners.add(listener);
			listeners.set(type, eventListeners);
		},
	);
	td.when(subscriber.removeAllListeners()).thenDo((): void => listeners.clear());
	td.when(subscriber.unsubscribe()).thenResolve(undefined);
	return Object.assign(subscriber, {
		emit: (type: string, event?: unknown): void => {
			for (const listener of listeners.get(type) ?? []) listener(event);
		},
		listenerCount: (): number => Array.from(listeners.values()).reduce((count, set) => count + set.size, 0),
	});
}

async function _flush(): Promise<void> {
	for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

afterEach(() => td.reset());

describe("NotpService", () => {
	let repository: NotpRepository;
	let accountRepository: AccountRepository;
	let sessionService: SessionService;
	let subscriber: ReturnType<typeof _subscriber>;
	let service: NotpService;
	const token = "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI";
	const tokenHash = createHash("sha256").update(token).digest("hex");
	const pending = ["candidate-session", NotpIntentStatus.PENDING] satisfies StoredNotpIntent;
	const verified = [
		"candidate-session",
		NotpIntentStatus.VERIFIED,
		"account-id",
		"identity-id",
	] satisfies StoredNotpIntent;
	const issuedSession = {
		accessToken: "a".repeat(43),
		tokenType: "Bearer",
		expiresAt: "2026-10-19T15:15:00.000Z",
		refreshToken: "refresh-token",
		refreshExpiresAt: "2026-11-18T15:00:00.000Z",
		accountId: "ac15fc2f-f58f-4962-8593-dd05d8e89ecd",
	} satisfies z.infer<typeof SessionOutputSchema>;
	const verificationInput = {
		channel: NotpChannel.WHATSAPP,
		providerMessageId: "wamid.message",
		providerSubject: "opaque-meta-subject",
		contactIdentifier: "+5511999999999",
		providerProfileName: undefined,
		notpCodeHash: "a".repeat(64),
	} satisfies Parameters<NotpService["verifyNotp"]>[0];

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-19T15:00:00.000Z"));
		repository = td.object<NotpRepository>();
		accountRepository = td.object<AccountRepository>();
		sessionService = td.object<SessionService>();
		subscriber = _subscriber();
		service = new NotpService(repository, accountRepository, sessionService, {
			whatsappPhoneNumber: "+5511963270517",
			whatsappPhoneNumberId: "notp-number",
		});
		td.when(repository.createIntent(td.matchers.anything())).thenResolve(1);
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending);
		td.when(repository.acquireVerificationWaitLease(td.matchers.anything())).thenResolve("OK");
		td.when(repository.releaseVerificationWaitLease(td.matchers.anything())).thenResolve(1);
		td.when(repository.subscribeToVerification(td.matchers.anything())).thenReturn({
			channel: "anonymous-channel",
			subscription: subscriber,
		});
		td.when(repository.claimIntentForVerification(td.matchers.anything())).thenResolve([
			tokenHash,
			"candidate-session",
		]);
		td.when(repository.markIntentVerified(td.matchers.anything())).thenResolve(1);
		td.when(repository.releaseProcessingIntent(td.matchers.anything())).thenResolve(1);
		td.when(accountRepository.saveVerifiedIdentity(td.matchers.anything())).thenResolve({
			accountId: "account-id",
			identityId: "identity-id",
		});
		td.when(sessionService.create(td.matchers.anything())).thenResolve(issuedSession);
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("creates a fifteen-minute intent with unpredictable credentials and persists only hashes", async () => {
		const result = await service.createIntent({ channel: NotpChannel.WHATSAPP });
		expect(result).toMatchObject({
			intentToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
			code: expect.stringMatching(/^NOTP-[A-Z0-9]{10}$/),
			codeReceiver: "+5511963270517",
			expiresAt: "2026-10-19T15:15:00.000Z",
		});
		td.verify(
			repository.createIntent({
				notpCodeHash: createHash("sha256").update(result.code).digest("hex"),
				candidateSessionId: td.matchers.isA(String),
				intentTokenHash: createHash("sha256").update(result.intentToken).digest("hex"),
				channel: NotpChannel.WHATSAPP,
				expiresInSeconds: 900,
			}),
		);
	});

	it("retries an atomic credential collision", async () => {
		td.when(repository.createIntent(td.matchers.anything())).thenResolve(0, 1);
		await service.createIntent({ channel: NotpChannel.WHATSAPP });
		expect(td.explain(repository.createIntent).callCount).toBe(2);
	});

	it("fails with a specific error after repeated credential collisions", async () => {
		td.when(repository.createIntent(td.matchers.anything())).thenResolve(0);
		await expect(service.createIntent({ channel: NotpChannel.WHATSAPP })).rejects.toMatchObject({
			errorCode: AppErrorCode.NOTP_INTENT_CREATION_COLLISION,
		});
		expect(td.explain(repository.createIntent).callCount).toBe(3);
	});

	it("preserves a storage failure during intent creation", async () => {
		const error = new Error("storage failure");
		td.when(repository.createIntent(td.matchers.anything())).thenReject(error);
		await expect(service.createIntent({ channel: NotpChannel.WHATSAPP })).rejects.toBe(error);
	});

	it("returns the same missing-intent error for an unknown or expired token", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve([]);
		await expect(service.exchangeIntentForSession({ intentToken: token })).rejects.toMatchObject({
			errorCode: AppErrorCode.NOTP_INTENT_NOT_FOUND,
		});
		td.verify(repository.acquireVerificationWaitLease(td.matchers.anything()), { times: 0 });
	});

	it("issues replacement credentials for verified-intent retries using the same candidate session", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(verified);
		expect(await service.exchangeIntentForSession({ intentToken: token })).toBe(issuedSession);
		await service.exchangeIntentForSession({ intentToken: token });
		td.verify(
			sessionService.create({ sessionId: "candidate-session", accountId: "account-id", identityId: "identity-id" }),
			{ times: 2 },
		);
		td.verify(repository.subscribeToVerification(td.matchers.anything()), { times: 0 });
	});

	it("preserves a session issuance failure", async () => {
		const error = new Error("session storage failed");
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(verified);
		td.when(sessionService.create(td.matchers.anything())).thenReject(error);
		await expect(service.exchangeIntentForSession({ intentToken: token })).rejects.toBe(error);
	});

	it.each([NotpIntentStatus.PENDING, NotpIntentStatus.PROCESSING] as const)(
		"does not open a subscription for a disconnected %s exchange",
		async (status) => {
			td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve([
				"candidate-session",
				status,
			] satisfies StoredNotpIntent);
			const controller = new AbortController();
			controller.abort();
			expect(await service.exchangeIntentForSession({ intentToken: token, abortSignal: controller.signal })).toEqual({
				status: "PENDING",
				retryAfterSeconds: 1,
			});
			td.verify(repository.acquireVerificationWaitLease(td.matchers.anything()), { times: 0 });
		},
	);

	it("returns pending to another caller that already has the per-intent lease", async () => {
		td.when(repository.acquireVerificationWaitLease(td.matchers.anything())).thenResolve(null);
		expect(await service.exchangeIntentForSession({ intentToken: token })).toEqual({
			status: "PENDING",
			retryAfterSeconds: 1,
		});
		td.verify(repository.findIntentByTokenHash({ intentTokenHash: tokenHash }), { times: 2 });
		td.verify(repository.subscribeToVerification(td.matchers.anything()), { times: 0 });
		td.verify(repository.releaseVerificationWaitLease(td.matchers.anything()), { times: 0 });
	});

	it("recovers a completed intent after lease storage fails", async () => {
		td.when(repository.acquireVerificationWaitLease(td.matchers.anything())).thenReject(new Error("lease failed"));
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, verified);
		expect(await service.exchangeIntentForSession({ intentToken: token })).toBe(issuedSession);
	});

	it("bounds a stalled lease acquisition and removes its timers", async () => {
		td.when(repository.acquireVerificationWaitLease(td.matchers.anything())).thenReturn(
			new Promise<string | null>(() => {}),
		);
		const result = service.exchangeIntentForSession({ intentToken: token });
		await vi.advanceTimersByTimeAsync(22_000);
		expect(await result).toEqual({ status: "PENDING", retryAfterSeconds: 1 });
		expect(vi.getTimerCount()).toBe(0);
		td.verify(repository.releaseVerificationWaitLease(td.matchers.anything()), { times: 0 });
	});

	it("aborts a stalled lease acquisition without opening a subscription", async () => {
		td.when(repository.acquireVerificationWaitLease(td.matchers.anything())).thenReturn(
			new Promise<string | null>(() => {}),
		);
		const controller = new AbortController();
		const result = service.exchangeIntentForSession({ intentToken: token, abortSignal: controller.signal });
		await _flush();
		controller.abort();
		expect(await result).toEqual({ status: "PENDING", retryAfterSeconds: 1 });
		expect(vi.getTimerCount()).toBe(0);
	});

	it("closes the subscribe/read race before waiting for notifications", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, verified);
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		subscriber.emit("subscribe", 1);
		expect(await result).toBe(issuedSession);
		td.verify(subscriber.unsubscribe());
		expect(subscriber.listenerCount()).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("discovers verification without a notification through authoritative reads", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, pending, verified);
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		subscriber.emit("subscribe", 1);
		await vi.advanceTimersByTimeAsync(400);
		expect(await result).toBe(issuedSession);
	});

	it("rereads immediately after the correct verification notification", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, pending, verified);
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		subscriber.emit("subscribe", 1);
		await _flush();
		subscriber.emit("message", { channel: "other-channel", message: "VERIFIED" });
		subscriber.emit("message", { channel: "anonymous-channel", message: "PENDING" });
		await _flush();
		td.verify(repository.findIntentByTokenHash(td.matchers.anything()), { times: 2 });
		subscriber.emit("message", { channel: "anonymous-channel", message: "VERIFIED" });
		expect(await result).toBe(issuedSession);
	});

	it("keeps reading when a notification precedes visible verified state", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, pending, pending, verified);
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		subscriber.emit("subscribe", 1);
		await _flush();
		subscriber.emit("message", { channel: "anonymous-channel", message: "VERIFIED" });
		await _flush();
		expect(subscriber.listenerCount()).toBe(3);
		await vi.advanceTimersByTimeAsync(400);
		expect(await result).toBe(issuedSession);
	});

	it("returns pending after twenty seconds and releases the distributed lease", async () => {
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		subscriber.emit("subscribe", 1);
		await vi.advanceTimersByTimeAsync(20_000);
		expect(await result).toEqual({ status: "PENDING", retryAfterSeconds: 1 });
		td.verify(
			repository.acquireVerificationWaitLease({
				intentTokenHash: tokenHash,
				ownerToken: td.matchers.isA(String),
				expiresInMilliseconds: 25_000,
			}),
		);
		td.verify(
			repository.releaseVerificationWaitLease({ intentTokenHash: tokenHash, ownerToken: td.matchers.isA(String) }),
		);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("does a final authoritative read at the twenty-second deadline", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenDo(
			async (): Promise<StoredNotpIntent> => (Date.now() >= Date.parse("2026-10-19T15:00:20Z") ? verified : pending),
		);
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		subscriber.emit("subscribe", 1);
		await vi.advanceTimersByTimeAsync(20_000);
		expect(await result).toBe(issuedSession);
	});

	it("returns pending when subscription readiness times out", async () => {
		const result = service.exchangeIntentForSession({ intentToken: token });
		await vi.advanceTimersByTimeAsync(1_500);
		expect(await result).toEqual({ status: "PENDING", retryAfterSeconds: 1 });
		td.verify(repository.findIntentByTokenHash(td.matchers.anything()), { times: 2 });
		td.verify(subscriber.unsubscribe());
	});

	it("rereads immediately after a subscription error before readiness", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, verified);
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		subscriber.emit("error", new Error("subscription failed"));
		expect(await result).toBe(issuedSession);
	});

	it("rereads after a subscription fails while waiting", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, pending, verified);
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		subscriber.emit("subscribe", 1);
		await _flush();
		subscriber.emit("error", new Error("subscription failed"));
		expect(await result).toBe(issuedSession);
	});

	it("falls back to a fresh read if subscription creation fails", async () => {
		td.when(repository.subscribeToVerification(td.matchers.anything())).thenThrow(new Error("subscription failed"));
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, verified);
		expect(await service.exchangeIntentForSession({ intentToken: token })).toBe(issuedSession);
		td.verify(repository.releaseVerificationWaitLease(td.matchers.anything()));
	});

	it("returns not found when the intent expires during verification wait", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, []);
		const result = service.exchangeIntentForSession({ intentToken: token });
		const assertion = expect(result).rejects.toMatchObject({ errorCode: AppErrorCode.NOTP_INTENT_NOT_FOUND });
		await _flush();
		subscriber.emit("subscribe", 1);
		await assertion;
	});

	it("preserves a lookup error while draining subscription and lease", async () => {
		const error = new Error("read failed");
		const result = service.exchangeIntentForSession({ intentToken: token });
		const assertion = expect(result).rejects.toBe(error);
		await _flush();
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenReject(error);
		subscriber.emit("subscribe", 1);
		await assertion;
		td.verify(subscriber.unsubscribe());
		td.verify(repository.releaseVerificationWaitLease(td.matchers.anything()));
	});

	it("cancels a stalled authoritative read and removes subscription listeners", async () => {
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending);
		const controller = new AbortController();
		const result = service.exchangeIntentForSession({ intentToken: token, abortSignal: controller.signal });
		await _flush();
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenReturn(
			new Promise<StoredNotpIntent>(() => {}),
		);
		subscriber.emit("subscribe", 1);
		await _flush();
		controller.abort();
		expect(await result).toEqual({ status: "PENDING", retryAfterSeconds: 1 });
		expect(subscriber.listenerCount()).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("cancels a connected exchange during its adaptive wait", async () => {
		const controller = new AbortController();
		const result = service.exchangeIntentForSession({ intentToken: token, abortSignal: controller.signal });
		await _flush();
		subscriber.emit("subscribe", 1);
		await _flush();
		controller.abort();
		expect(await result).toEqual({ status: "PENDING", retryAfterSeconds: 1 });
		expect(vi.getTimerCount()).toBe(0);
	});

	it("bounds a stalled authoritative read with the lease deadline", async () => {
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenReturn(
			new Promise<StoredNotpIntent>(() => {}),
		);
		subscriber.emit("subscribe", 1);
		await vi.advanceTimersByTimeAsync(22_000);
		expect(await result).toEqual({ status: "PENDING", retryAfterSeconds: 1 });
		expect(vi.getTimerCount()).toBe(0);
	});

	it("does not hide verified state when subscription or lease cleanup fails", async () => {
		td.replace(console, "warn");
		td.when(subscriber.unsubscribe()).thenReject(new Error("unsubscribe failed"));
		td.when(repository.releaseVerificationWaitLease(td.matchers.anything())).thenReject(new Error("release failed"));
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, verified);
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		subscriber.emit("subscribe", 1);
		expect(await result).toBe(issuedSession);
	});

	it("bounds stalled cleanup using the existing operation deadline", async () => {
		td.when(subscriber.unsubscribe()).thenReturn(new Promise<void>(() => {}));
		td.when(repository.releaseVerificationWaitLease(td.matchers.anything())).thenReturn(new Promise<number>(() => {}));
		td.when(repository.findIntentByTokenHash(td.matchers.anything())).thenResolve(pending, verified);
		const result = service.exchangeIntentForSession({ intentToken: token });
		await _flush();
		subscriber.emit("subscribe", 1);
		await vi.advanceTimersByTimeAsync(22_000);
		expect(await result).toBe(issuedSession);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("ignores an unknown, consumed, or separately owned verification code", async () => {
		td.when(repository.claimIntentForVerification(td.matchers.anything())).thenResolve([]);
		await service.verifyNotp(verificationInput);
		td.verify(accountRepository.saveVerifiedIdentity(td.matchers.anything()), { times: 0 });
	});

	it("asks Meta to retry the same message while processing is still active", async () => {
		td.when(repository.claimIntentForVerification(td.matchers.anything())).thenResolve([
			NotpProcessingClaimStatus.PROCESSING_IN_PROGRESS,
		]);
		await expect(service.verifyNotp(verificationInput)).rejects.toMatchObject({
			errorCode: AppErrorCode.NOTP_PROCESSING_IN_PROGRESS,
		});
		td.verify(accountRepository.saveVerifiedIdentity(td.matchers.anything()), { times: 0 });
	});

	it.each([
		{ name: undefined, display: "+5511999999999" },
		{ name: "  ", display: "+5511999999999" },
		{ name: "  Ana Silva  ", display: "Ana Silva" },
	])("persists a verified identity with display $display", async ({ name, display }) => {
		await service.verifyNotp({ ...verificationInput, providerProfileName: name });
		td.verify(
			repository.claimIntentForVerification({
				notpCodeHash: "a".repeat(64),
				providerMessageId: "wamid.message",
				nowMilliseconds: Date.now(),
				channel: NotpChannel.WHATSAPP,
				processingLeaseMilliseconds: 60_000,
			}),
		);
		td.verify(
			accountRepository.saveVerifiedIdentity({
				providerSubject: "opaque-meta-subject",
				displayIdentifier: display,
				identifier: "+5511999999999",
				lastVerifiedAt: new Date("2026-10-19T15:00:00.000Z"),
			}),
		);
		td.verify(
			repository.markIntentVerified({
				candidateSessionId: "candidate-session",
				notpCodeHash: "a".repeat(64),
				intentTokenHash: tokenHash,
				providerMessageId: "wamid.message",
				channel: NotpChannel.WHATSAPP,
				accountId: "account-id",
				identityId: "identity-id",
				expiresInSeconds: 300,
			}),
		);
	});

	it("does not make an intent exchangeable before durable identity creation completes", async () => {
		let persist!: (identity: { accountId: string; identityId: string }) => void;
		td.when(accountRepository.saveVerifiedIdentity(td.matchers.anything())).thenReturn(
			new Promise<{ accountId: string; identityId: string }>((resolve) => {
				persist = resolve;
			}),
		);
		const result = service.verifyNotp(verificationInput);
		await _flush();
		td.verify(repository.markIntentVerified(td.matchers.anything()), { times: 0 });
		persist({ accountId: "account-id", identityId: "identity-id" });
		await result;
		td.verify(repository.markIntentVerified(td.matchers.anything()));
	});

	it("reports a missing identity result and releases its processing claim", async () => {
		td.when(accountRepository.saveVerifiedIdentity(td.matchers.anything())).thenResolve(undefined);
		await expect(service.verifyNotp(verificationInput)).rejects.toThrow(
			"Verified identity persistence returned no account",
		);
		td.verify(repository.releaseProcessingIntent({ intentTokenHash: tokenHash, providerMessageId: "wamid.message" }));
	});

	it("preserves an identity persistence failure while allowing webhook retry", async () => {
		const error = new Error("identity write failed");
		td.when(accountRepository.saveVerifiedIdentity(td.matchers.anything())).thenReject(error);
		await expect(service.verifyNotp(verificationInput)).rejects.toBe(error);
		td.verify(repository.releaseProcessingIntent(td.matchers.anything()));
	});

	it("reports lost processing ownership instead of acknowledging verification", async () => {
		td.when(repository.markIntentVerified(td.matchers.anything())).thenResolve(0);
		await expect(service.verifyNotp(verificationInput)).rejects.toMatchObject({
			errorCode: AppErrorCode.NOTP_PROCESSING_OWNERSHIP_LOST,
		});
	});

	it("preserves the original verification error if processing cleanup fails", async () => {
		td.replace(console, "warn");
		const error = new Error("identity write failed");
		td.when(accountRepository.saveVerifiedIdentity(td.matchers.anything())).thenReject(error);
		td.when(repository.releaseProcessingIntent(td.matchers.anything())).thenReject(new Error("lease cleanup failed"));
		await expect(service.verifyNotp(verificationInput)).rejects.toBe(error);
	});
});
