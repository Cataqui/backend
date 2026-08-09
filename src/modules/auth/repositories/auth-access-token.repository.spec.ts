import { Test } from "@nestjs/testing";
import { RedisService } from "../../../core/redis/redis.service";
import { AuthAccessTokenRepository } from "./auth-access-token.repository";

describe("AuthAccessTokenRepository", () => {
	let repository: AuthAccessTokenRepository;
	let redis: {
		eval: ReturnType<typeof vi.fn>;
		hgetall: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		redis = { eval: vi.fn(), hgetall: vi.fn() };
		const module = await Test.createTestingModule({
			providers: [AuthAccessTokenRepository, { provide: RedisService, useValue: redis }],
		}).compile();
		repository = module.get(AuthAccessTokenRepository);
	});

	it("should atomically replace the access token indexed by the session", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
		redis.eval.mockResolvedValue(1);

		await repository.create({
			accessTokenHash: "a".repeat(64),
			session: {
				sessionId: "session-id",
				userId: "user-id",
				expiresAt: new Date("2026-08-05T15:15:00.000Z"),
			},
		});
		vi.useRealTimers();

		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("DEL", ARGV[1] .. previousAccessTokenHash)'),
			["auth:session-by-access-token-hash:" + "a".repeat(64), "auth:access-token-hash-by-session-id:session-id"],
			[
				"auth:session-by-access-token-hash:",
				"session-id",
				"user-id",
				"2026-08-05T15:15:00.000Z",
				"900",
				"a".repeat(64),
			],
		);
	});

	it("should reject storing an already expired access session", async () => {
		await expect(
			repository.create({
				accessTokenHash: "a".repeat(64),
				session: {
					sessionId: "session-id",
					userId: "user-id",
					expiresAt: new Date(0),
				},
			}),
		).rejects.toThrow("session.expiresAt must be in the future");
	});

	it("should return an active access session from Redis", async () => {
		redis.hgetall.mockResolvedValue({
			session_id: "session-id",
			user_id: "user-id",
			expires_at: "2099-08-05T15:15:00.000Z",
		});

		const result = await repository.findActiveAccessTokenSession({ accessTokenHash: "a".repeat(64) });

		expect(result).toEqual({
			sessionId: "session-id",
			userId: "user-id",
			expiresAt: new Date("2099-08-05T15:15:00.000Z"),
		});
	});

	it.each([
		{ description: "missing", storedSession: null },
		{ description: "missing session identifier", storedSession: { user_id: "user-id", expires_at: "2099-01-01" } },
		{ description: "missing user identifier", storedSession: { session_id: "session-id", expires_at: "2099-01-01" } },
		{ description: "missing expiration", storedSession: { session_id: "session-id", user_id: "user-id" } },
		{
			description: "invalid expiration",
			storedSession: { session_id: "session-id", user_id: "user-id", expires_at: "invalid" },
		},
		{
			description: "expired",
			storedSession: { session_id: "session-id", user_id: "user-id", expires_at: "2020-01-01T00:00:00.000Z" },
		},
	])("should reject a $description Redis access session", async ({ storedSession }) => {
		redis.hgetall.mockResolvedValue(storedSession);

		const result = await repository.findActiveAccessTokenSession({ accessTokenHash: "a".repeat(64) });

		expect(result).toBeNull();
	});

	it("should delete the access key and its session reverse index atomically", async () => {
		redis.eval.mockResolvedValue(1);

		await repository.deleteForSession({ sessionId: "session-id" });

		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("DEL", ARGV[1] .. accessTokenHash)'),
			["auth:access-token-hash-by-session-id:session-id"],
			["auth:session-by-access-token-hash:"],
		);
	});

	it("should delete every access session requested", async () => {
		redis.eval.mockResolvedValue(1);

		await repository.deleteAccessTokenSessions({ sessionIds: ["session-one", "session-two"] });

		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining("for _, sessionKey in ipairs(KEYS) do"),
			["auth:access-token-hash-by-session-id:session-one", "auth:access-token-hash-by-session-id:session-two"],
			["auth:session-by-access-token-hash:"],
		);
	});

	it("should avoid calling Redis when no access sessions need deletion", async () => {
		await repository.deleteAccessTokenSessions({ sessionIds: [] });

		expect(redis.eval).not.toHaveBeenCalled();
	});

	it("should preserve Redis failures for the global error boundary", async () => {
		const redisError = new Error("redis unavailable");
		redis.hgetall.mockRejectedValue(redisError);

		await expect(repository.findActiveAccessTokenSession({ accessTokenHash: "a".repeat(64) })).rejects.toBe(redisError);
	});
});
