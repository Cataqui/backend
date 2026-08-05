import { createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { AuthIntentCreationUnavailableError } from "./errors/auth-intent-creation-unavailable.error";
import { AuthRepository } from "./repositories/auth.repository";

describe("AuthService", () => {
	let service: AuthService;
	let repository: { createWhatsappIntent: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		repository = { createWhatsappIntent: vi.fn() };
		const module = await Test.createTestingModule({
			providers: [AuthService, { provide: AuthRepository, useValue: repository }],
		}).compile();

		service = module.get(AuthService);
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should create a code with the AUTH prefix and ten uppercase alphanumeric characters", async () => {
		repository.createWhatsappIntent.mockResolvedValue(true);

		const result = await service.createWhatsAppIntent();

		expect(result.code).toMatch(/^AUTH-[A-Z0-9]{10}$/);
	});

	it("should return a UUID as the public intent identifier", async () => {
		repository.createWhatsappIntent.mockResolvedValue(true);

		const result = await service.createWhatsAppIntent();

		expect(result.intentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it("should expire the authentication intent exactly fifteen minutes after creation", async () => {
		repository.createWhatsappIntent.mockResolvedValue(true);

		const result = await service.createWhatsAppIntent();

		expect(result.expiresAt).toBe("2026-08-05T15:15:00.000Z");
	});

	it("should persist the SHA-256 hash of the emitted code", async () => {
		repository.createWhatsappIntent.mockResolvedValue(true);

		const result = await service.createWhatsAppIntent();

		expect(repository.createWhatsappIntent).toHaveBeenCalledWith(
			expect.objectContaining({ codeHash: createHash("sha256").update(result.code).digest("hex") }),
		);
	});

	it("should never send the raw authentication code to the repository", async () => {
		repository.createWhatsappIntent.mockResolvedValue(true);

		const result = await service.createWhatsAppIntent();
		const persistedIntent = repository.createWhatsappIntent.mock.calls[0]![0] as Record<string, unknown>;

		expect(Object.values(persistedIntent)).not.toContain(result.code);
	});

	it("should persist the exact creation and expiration timestamps", async () => {
		repository.createWhatsappIntent.mockResolvedValue(true);

		await service.createWhatsAppIntent();

		expect(repository.createWhatsappIntent).toHaveBeenCalledWith(
			expect.objectContaining({
				createdAt: "2026-08-05T15:00:00.000Z",
				expiresAt: "2026-08-05T15:15:00.000Z",
			}),
		);
	});

	it("should retry when a generated intent collides with an existing Redis record", async () => {
		repository.createWhatsappIntent.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

		await service.createWhatsAppIntent();

		expect(repository.createWhatsappIntent).toHaveBeenCalledTimes(2);
	});

	it("should fail safely after three consecutive collisions", async () => {
		repository.createWhatsappIntent.mockResolvedValue(false);

		await expect(service.createWhatsAppIntent()).rejects.toThrow(AuthIntentCreationUnavailableError);
	});

	it("should fail safely when Upstash rejects intent creation", async () => {
		repository.createWhatsappIntent.mockRejectedValue(new Error("UPSTASH_REDIS_REST_TOKEN rejected"));

		await expect(service.createWhatsAppIntent()).rejects.toThrow(AuthIntentCreationUnavailableError);
	});
});
