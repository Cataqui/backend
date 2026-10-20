import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type { Redis } from "@upstash/redis";
import * as td from "testdouble";
import { AccessTokenRepository } from "./access-token.repository";

const redisContainer = process.env["AUTH_REDIS_TEST_CONTAINER"];

function _runRedis(params: { arguments: string[] }): unknown {
	if (redisContainer === undefined)
		throw new Error("AUTH_REDIS_TEST_CONTAINER is required for Redis integration tests");
	return JSON.parse(
		execFileSync("docker", ["exec", redisContainer, "redis-cli", "--json", ...params.arguments], {
			encoding: "utf8",
			timeout: 10_000,
		}),
	);
}

afterEach(() => td.reset());

describe.skipIf(redisContainer === undefined)("AccessTokenRepository against Redis", () => {
	let repository: AccessTokenRepository;
	let session: Parameters<AccessTokenRepository["create"]>[0]["session"];
	let accessTokenHash: string;

	beforeEach(() => {
		const redis = td.object<Redis>();
		td.when(
			redis.eval<string[], number>(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()),
		).thenDo(async (script: string, keys: string[], args: string[]): Promise<number> => {
			const result = _runRedis({ arguments: ["EVAL", script, String(keys.length), ...keys, ...args] });
			if (typeof result !== "number") throw new TypeError("Redis EVAL must return a number");
			return result;
		});
		repository = new AccessTokenRepository(redis);
		session = { sessionId: randomUUID(), accountId: randomUUID(), expiresAt: new Date(Date.now() + 15 * 60_000) };
		accessTokenHash = randomUUID();
	});

	it("replaces the previous access token and gives both indexes the same expiration", async () => {
		expect(await repository.create({ accessTokenHash: accessTokenHash, session: session })).toBe(1);
		const replacementHash = randomUUID();
		expect(await repository.create({ accessTokenHash: replacementHash, session: session })).toBe(1);

		expect(_runRedis({ arguments: ["EXISTS", `auth:session-by-access-token-hash:${accessTokenHash}`] })).toBe(0);
		expect(_runRedis({ arguments: ["GET", `auth:access-token-hash-by-session-id:${session.sessionId}`] })).toBe(
			replacementHash,
		);
		expect(_runRedis({ arguments: ["HGETALL", `auth:session-by-access-token-hash:${replacementHash}`] })).toEqual({
			session_id: session.sessionId,
			account_id: session.accountId,
			expires_at: session.expiresAt.toISOString(),
		});
		const tokenTtl = _runRedis({ arguments: ["TTL", `auth:session-by-access-token-hash:${replacementHash}`] });
		const indexTtl = _runRedis({ arguments: ["TTL", `auth:access-token-hash-by-session-id:${session.sessionId}`] });
		expect(tokenTtl).toBeGreaterThan(890);
		expect(tokenTtl).toBeLessThanOrEqual(900);
		expect(indexTtl).toBeGreaterThan(890);
		expect(indexTtl).toBeLessThanOrEqual(900);
	});

	it("rejects late publication when revocation wins before the first token is stored", async () => {
		await repository.deleteForSession({ sessionId: session.sessionId });
		expect(await repository.create({ accessTokenHash: accessTokenHash, session: session })).toBe(0);
		expect(
			_runRedis({
				arguments: [
					"EXISTS",
					`auth:session-by-access-token-hash:${accessTokenHash}`,
					`auth:access-token-hash-by-session-id:${session.sessionId}`,
				],
			}),
		).toBe(0);
		expect(_runRedis({ arguments: ["GET", `auth:revoked-session:${session.sessionId}`] })).toBe("1");
		const tombstoneTtl = _runRedis({ arguments: ["TTL", `auth:revoked-session:${session.sessionId}`] });
		expect(tombstoneTtl).toBeGreaterThan(2_591_990);
		expect(tombstoneTtl).toBeLessThanOrEqual(2_592_000);
	});

	it("removes the active token and prevents a delayed refresh from resurrecting it", async () => {
		await repository.create({ accessTokenHash: accessTokenHash, session: session });
		await repository.deleteForSession({ sessionId: session.sessionId });
		const delayedRefreshHash = randomUUID();
		expect(await repository.create({ accessTokenHash: delayedRefreshHash, session: session })).toBe(0);
		expect(
			_runRedis({
				arguments: [
					"EXISTS",
					`auth:session-by-access-token-hash:${accessTokenHash}`,
					`auth:session-by-access-token-hash:${delayedRefreshHash}`,
					`auth:access-token-hash-by-session-id:${session.sessionId}`,
				],
			}),
		).toBe(0);
	});

	it("revokes every selected session while preserving another account's active session", async () => {
		const secondSession = {
			sessionId: randomUUID(),
			accountId: session.accountId,
			expiresAt: session.expiresAt,
		} satisfies Parameters<AccessTokenRepository["create"]>[0]["session"];
		const unrelatedSession = {
			sessionId: randomUUID(),
			accountId: randomUUID(),
			expiresAt: session.expiresAt,
		} satisfies Parameters<AccessTokenRepository["create"]>[0]["session"];
		const secondHash = randomUUID();
		const unrelatedHash = randomUUID();
		await repository.create({ accessTokenHash: accessTokenHash, session: session });
		await repository.create({ accessTokenHash: secondHash, session: secondSession });
		await repository.create({ accessTokenHash: unrelatedHash, session: unrelatedSession });

		await repository.deleteAccessTokenSessions({ sessionIds: [session.sessionId, secondSession.sessionId] });
		expect(
			_runRedis({
				arguments: [
					"EXISTS",
					`auth:session-by-access-token-hash:${accessTokenHash}`,
					`auth:session-by-access-token-hash:${secondHash}`,
					`auth:access-token-hash-by-session-id:${session.sessionId}`,
					`auth:access-token-hash-by-session-id:${secondSession.sessionId}`,
				],
			}),
		).toBe(0);
		expect(await repository.create({ accessTokenHash: randomUUID(), session: session })).toBe(0);
		expect(await repository.create({ accessTokenHash: randomUUID(), session: secondSession })).toBe(0);
		expect(_runRedis({ arguments: ["EXISTS", `auth:session-by-access-token-hash:${unrelatedHash}`] })).toBe(1);
		expect(
			_runRedis({ arguments: ["GET", `auth:access-token-hash-by-session-id:${unrelatedSession.sessionId}`] }),
		).toBe(unrelatedHash);
		expect(
			_runRedis({
				arguments: [
					"EXISTS",
					`auth:revoked-session:${session.sessionId}`,
					`auth:revoked-session:${secondSession.sessionId}`,
				],
			}),
		).toBe(2);
	});

	it("expires both indexes without retaining access state", async () => {
		const expiringSession = {
			sessionId: session.sessionId,
			accountId: session.accountId,
			expiresAt: new Date(Date.now() + 500),
		} satisfies Parameters<AccessTokenRepository["create"]>[0]["session"];
		expect(await repository.create({ accessTokenHash: accessTokenHash, session: expiringSession })).toBe(1);
		await setTimeout(1_100);
		expect(
			_runRedis({
				arguments: [
					"EXISTS",
					`auth:session-by-access-token-hash:${accessTokenHash}`,
					`auth:access-token-hash-by-session-id:${session.sessionId}`,
				],
			}),
		).toBe(0);
	});
});
