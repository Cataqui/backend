import { Test } from "@nestjs/testing";
import { RedisService } from "../../../core/redis/redis.service";
import { AuthConstants } from "../auth.constants";
import { AuthRepository } from "./auth.repository";

describe("AuthRepository", () => {
	let repository: AuthRepository;
	let redis: { createHashAndStringIfNeitherExists: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		redis = { createHashAndStringIfNeitherExists: vi.fn() };
		const module = await Test.createTestingModule({
			providers: [AuthRepository, { provide: RedisService, useValue: redis }],
		}).compile();

		repository = module.get(AuthRepository);
	});

	it("should create the WhatsApp intent and code lookup with one atomic Redis script", async () => {
		redis.createHashAndStringIfNeitherExists.mockResolvedValue(true);

		await repository.createWhatsappIntent({
			intentId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			codeHash: "a".repeat(64),
			createdAt: "2026-08-05T15:00:00.000Z",
			expiresAt: "2026-08-05T15:15:00.000Z",
		});

		expect(redis.createHashAndStringIfNeitherExists).toHaveBeenCalledWith({
			hashKey: "auth:whatsapp:intent:5c474828-dd9e-4490-a45a-0e82512bc45e",
			hashFields: {
				code_hash: "a".repeat(64),
				created_at: "2026-08-05T15:00:00.000Z",
				expires_at: "2026-08-05T15:15:00.000Z",
			},
			stringKey: `auth:whatsapp:code:${"a".repeat(64)}`,
			stringValue: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			expirationSeconds: AuthConstants.WHATSAPP_INTENT_EXPIRATION_SECONDS,
		});
	});

	it("should report successful WhatsApp intent creation when Redis returns one", async () => {
		redis.createHashAndStringIfNeitherExists.mockResolvedValue(true);

		const result = await repository.createWhatsappIntent({
			intentId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			codeHash: "a".repeat(64),
			createdAt: "2026-08-05T15:00:00.000Z",
			expiresAt: "2026-08-05T15:15:00.000Z",
		});

		expect(result).toBe(true);
	});

	it("should report a WhatsApp intent collision when either Redis key already exists", async () => {
		redis.createHashAndStringIfNeitherExists.mockResolvedValue(false);

		const result = await repository.createWhatsappIntent({
			intentId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			codeHash: "a".repeat(64),
			createdAt: "2026-08-05T15:00:00.000Z",
			expiresAt: "2026-08-05T15:15:00.000Z",
		});

		expect(result).toBe(false);
	});
});
