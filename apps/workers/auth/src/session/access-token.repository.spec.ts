import { SessionExpirationInvalidError } from "./errors/session-expiration-invalid.error";
import type { Redis } from "@upstash/redis";
import * as td from "testdouble";
import { AccessTokenRepository } from "./access-token.repository";

afterEach(() => {
	td.reset();
	vi.useRealTimers();
});

describe("AccessTokenRepository", () => {
	let repository: AccessTokenRepository;
	let redis: Redis;

	beforeEach(() => {
		redis = td.object<Redis>();
		repository = new AccessTokenRepository(redis);
	});

	it("atomically replaces a session's previous access token with matching expiry on both indexes", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-19T15:00:00.000Z"));
		const session = {
			sessionId: "session-id",
			accountId: "account-id",
			expiresAt: new Date("2026-10-19T15:14:59.001Z"),
		} satisfies Parameters<AccessTokenRepository["create"]>[0]["session"];
		td.when(
			redis.eval<string[], number>(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()),
		).thenResolve(1);

		const result = await repository.create({ accessTokenHash: "access-hash", session: session });

		expect(result).toBe(1);
		expect(td.explain(redis.eval).calls[0]?.args).toEqual([
			expect.stringContaining('redis.call("DEL", ARGV[1] .. previousAccessTokenHash)'),
			[
				"auth:session-by-access-token-hash:access-hash",
				"auth:access-token-hash-by-session-id:session-id",
				"auth:revoked-session:session-id",
			],
			[
				"auth:session-by-access-token-hash:",
				"session-id",
				"account-id",
				"2026-10-19T15:14:59.001Z",
				"900",
				"access-hash",
			],
		]);
		expect(td.explain(redis.eval).calls[0]?.args[0]).toContain('"account_id", ARGV[3]');
		expect(td.explain(redis.eval).calls[0]?.args[0]).toContain('redis.call("EXPIRE", KEYS[1], tonumber(ARGV[5]))');
		expect(td.explain(redis.eval).calls[0]?.args[0]).toContain(
			'redis.call("SET", KEYS[2], ARGV[6], "EX", tonumber(ARGV[5]))',
		);
	});

	it("returns Redis's rejected-write result when revocation already marked the session", async () => {
		td.when(
			redis.eval<string[], number>(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()),
		).thenResolve(0);

		expect(
			await repository.create({
				accessTokenHash: "access-hash",
				session: { sessionId: "session-id", accountId: "account-id", expiresAt: new Date("2099-01-01T00:00:00.000Z") },
			}),
		).toBe(0);
		expect(td.explain(redis.eval).calls[0]?.args[0]).toContain(
			'if redis.call("EXISTS", KEYS[3]) == 1 then return 0 end',
		);
	});

	it.each(["2026-10-19T14:59:59.999Z", "2026-10-19T15:00:00.000Z"])(
		"rejects already expired session %s without calling Redis",
		async (expiresAt) => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-10-19T15:00:00.000Z"));

			await expect(
				repository.create({
					accessTokenHash: "access-hash",
					session: { sessionId: "session-id", accountId: "account-id", expiresAt: new Date(expiresAt) },
				}),
			).rejects.toThrow(new SessionExpirationInvalidError());
			td.verify(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), { times: 0 });
		},
	);

	it("returns the stored session fields without interpreting the expiration", async () => {
		const storedSession = {
			session_id: "session-id",
			account_id: "account-id",
			expires_at: "2020-01-01T00:00:00.000Z",
		} satisfies { session_id: string; account_id: string; expires_at: string };
		td.when(redis.hgetall<typeof storedSession>("auth:session-by-access-token-hash:access-hash")).thenResolve(
			storedSession,
		);

		expect(await repository.findByAccessTokenHash({ accessTokenHash: "access-hash" })).toEqual(storedSession);
	});

	it("returns an absent access token directly", async () => {
		td.when(
			redis.hgetall<{ session_id: string; account_id: string; expires_at: string }>(
				"auth:session-by-access-token-hash:missing",
			),
		).thenResolve(null);

		expect(await repository.findByAccessTokenHash({ accessTokenHash: "missing" })).toBeNull();
	});

	it("atomically marks revocation for the refresh lifetime and deletes the token indexes", async () => {
		td.when(
			redis.eval<string[], number>(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()),
		).thenResolve(1);

		await repository.deleteForSession({ sessionId: "session-id" });

		expect(td.explain(redis.eval).calls[0]?.args).toEqual([
			expect.stringContaining('redis.call("DEL", ARGV[1] .. accessTokenHash)'),
			["auth:access-token-hash-by-session-id:session-id", "auth:revoked-session:session-id"],
			["auth:session-by-access-token-hash:", "2592000"],
		]);
		expect(td.explain(redis.eval).calls[0]?.args[0]).toContain(
			'redis.call("SET", KEYS[2], "1", "EX", tonumber(ARGV[2]))',
		);
	});

	it("deletes every requested session and its access token in one Redis operation", async () => {
		td.when(
			redis.eval<string[], number>(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()),
		).thenResolve(2);

		await repository.deleteAccessTokenSessions({ sessionIds: ["session-one", "session-two"] });

		expect(td.explain(redis.eval).calls[0]?.args).toEqual([
			expect.stringContaining("for index = 1, #KEYS, 2 do"),
			[
				"auth:access-token-hash-by-session-id:session-one",
				"auth:revoked-session:session-one",
				"auth:access-token-hash-by-session-id:session-two",
				"auth:revoked-session:session-two",
			],
			["auth:session-by-access-token-hash:", "2592000"],
		]);
		expect(td.explain(redis.eval).calls[0]?.args[0]).toContain(
			'redis.call("SET", KEYS[index + 1], "1", "EX", tonumber(ARGV[2]))',
		);
	});

	it("avoids Redis when no sessions need deletion", async () => {
		await repository.deleteAccessTokenSessions({ sessionIds: [] });

		td.verify(redis.eval(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), { times: 0 });
	});

	it("preserves Redis read failures for the service", async () => {
		const error = new Error("Redis unavailable");
		td.when(
			redis.hgetall<{ session_id: string; account_id: string; expires_at: string }>(td.matchers.anything()),
		).thenReject(error);

		await expect(repository.findByAccessTokenHash({ accessTokenHash: "access-hash" })).rejects.toBe(error);
	});

	it("preserves Redis write failures for the service", async () => {
		const error = new Error("Redis unavailable");
		td.when(
			redis.eval<string[], number>(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()),
		).thenReject(error);

		await expect(
			repository.create({
				accessTokenHash: "access-hash",
				session: { sessionId: "session-id", accountId: "account-id", expiresAt: new Date("2099-01-01T00:00:00.000Z") },
			}),
		).rejects.toBe(error);
	});
});
