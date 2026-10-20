import type { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import * as td from "testdouble";
import { NotpChannel } from "./notp-channel.enum";
import { NotpIntentStatus } from "./notp-intent-status.enum";
import { NotpRepository, type StoredNotpIntent } from "./notp.repository";

afterEach(() => td.reset());

describe("NotpRepository", () => {
	let redis: Redis;
	let repository: NotpRepository;
	const tokenHash = "b".repeat(64);
	const channel = `auth:notp:verification:${createHash("sha256").update(`auth:notp:verification-channel:${tokenHash}`).digest("hex")}`;

	beforeEach(() => {
		redis = td.object<Redis>();
		repository = new NotpRepository(redis);
	});

	it("atomically writes the pending intent and hashed-code lookup with matching expiry", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve(1);
		expect(
			await repository.createIntent({
				notpCodeHash: "a".repeat(64),
				candidateSessionId: "session-id",
				intentTokenHash: tokenHash,
				channel: NotpChannel.WHATSAPP,
				expiresInSeconds: 900,
			}),
		).toBe(1);
		td.verify(
			redis.eval(
				td.matchers.isA(String),
				[`auth:notp:intent-by-token-hash:${tokenHash}`, `auth:notp:code:WHATSAPP:${"a".repeat(64)}`],
				["session-id", "PENDING", tokenHash, "900"],
			),
		);
	});

	it("returns the raw stored intent result without duplicating the service interpretation", async () => {
		const stored = ["session-id", NotpIntentStatus.VERIFIED, "account-id", "identity-id"] satisfies StoredNotpIntent;
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve(stored);
		expect(await repository.findIntentByTokenHash({ intentTokenHash: tokenHash })).toBe(stored);
		td.verify(redis.eval(td.matchers.isA(String), [`auth:notp:intent-by-token-hash:${tokenHash}`], ["VERIFIED"]));
	});

	it("acquires one expiring wait lease on the anonymized notification channel", async () => {
		td.when(redis.set(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve("OK");
		expect(
			await repository.acquireVerificationWaitLease({
				intentTokenHash: tokenHash,
				ownerToken: "owner",
				expiresInMilliseconds: 25_000,
			}),
		).toBe("OK");
		td.verify(redis.set(`${channel}:wait-lease`, "owner", { nx: true, px: 25_000 }));
		expect(channel).not.toContain(tokenHash);
	});

	it("opens the provider subscription and exposes its actual channel", () => {
		const subscription = td.object<ReturnType<Redis["subscribe"]>>();
		td.when(redis.subscribe(channel)).thenReturn(subscription);
		const result = repository.subscribeToVerification({ intentTokenHash: tokenHash });
		expect(result.channel).toBe(channel);
		expect(result.subscription).toBe(subscription);
	});

	it("releases a wait lease only through an atomic ownership comparison", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve(0);
		expect(
			await repository.releaseVerificationWaitLease({ intentTokenHash: tokenHash, ownerToken: "former-owner" }),
		).toBe(0);
		td.verify(
			redis.eval(
				td.matchers.contains('redis.call("GET", KEYS[1]) ~= ARGV[1]'),
				[`${channel}:wait-lease`],
				["former-owner"],
			),
		);
	});

	it("claims the channel-specific code with the operation's processing lease", async () => {
		const claim = [tokenHash, "session-id"];
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve(claim);
		expect(
			await repository.claimIntentForVerification({
				notpCodeHash: "a".repeat(64),
				providerMessageId: "message-id",
				nowMilliseconds: 123_000,
				channel: NotpChannel.WHATSAPP,
				processingLeaseMilliseconds: 60_000,
			}),
		).toBe(claim);
		td.verify(
			redis.eval(
				td.matchers.isA(String),
				[`auth:notp:code:WHATSAPP:${"a".repeat(64)}`],
				[
					"auth:notp:intent-by-token-hash:",
					"PENDING",
					"PROCESSING",
					"123000",
					"message-id",
					"183000",
					"60000",
					"PROCESSING_IN_PROGRESS",
				],
			),
		);
	});

	it("atomically saves the verified account and identity before publishing and indexes its candidate session", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve(1);
		expect(
			await repository.markIntentVerified({
				candidateSessionId: "session-id",
				notpCodeHash: "a".repeat(64),
				intentTokenHash: tokenHash,
				providerMessageId: "message-id",
				channel: NotpChannel.WHATSAPP,
				accountId: "account-id",
				identityId: "identity-id",
				expiresInSeconds: 300,
			}),
		).toBe(1);
		td.verify(
			redis.eval(
				td.matchers.isA(String),
				[
					`auth:notp:intent-by-token-hash:${tokenHash}`,
					`auth:notp:code:WHATSAPP:${"a".repeat(64)}`,
					"auth:notp:intent-key-by-session:session-id",
				],
				["PROCESSING", "message-id", "VERIFIED", "account-id", "300", "session-id", channel, "VERIFIED", "identity-id"],
			),
		);
	});

	it("returns a processing claim to pending only for its owning message", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve(1);
		expect(
			await repository.releaseProcessingIntent({ intentTokenHash: tokenHash, providerMessageId: "message-id" }),
		).toBe(1);
		td.verify(
			redis.eval(
				td.matchers.isA(String),
				[`auth:notp:intent-by-token-hash:${tokenHash}`],
				["PROCESSING", "message-id", "PENDING"],
			),
		);
	});

	it("deletes exchange recovery state through its session reverse index", async () => {
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve(2);
		await repository.deleteIntentsForSessions({ sessionIds: ["session-a", "session-b"] });
		td.verify(
			redis.eval(
				td.matchers.isA(String),
				["auth:notp:intent-key-by-session:session-a", "auth:notp:intent-key-by-session:session-b"],
				[],
			),
		);
	});

	it("does no I/O when no session has exchange recovery state", async () => {
		await repository.deleteIntentsForSessions({ sessionIds: [] });
		td.verify(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), { times: 0 });
	});

	it("preserves provider failures for the service and transport to interpret", async () => {
		const error = new Error("redis failed");
		td.when(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReject(error);
		await expect(repository.findIntentByTokenHash({ intentTokenHash: tokenHash })).rejects.toBe(error);
	});
});
