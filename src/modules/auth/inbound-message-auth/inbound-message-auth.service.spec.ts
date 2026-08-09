import { Test } from "@nestjs/testing";
import { createHash } from "node:crypto";
import { AuthIdentityProvider, JobContactMethod } from "../../../../generated/prisma/client.js";
import { UserService } from "../../user/user.service";
import { AuthSessionService } from "../auth-session.service";
import { AuthSessionUnavailableError } from "../errors/auth-session-unavailable.error";
import { AuthIdentityRepository } from "../repositories/auth-identity.repository";
import { InboundMessageAuthChannel } from "./enums/inbound-message-auth-channel.enum";
import { InboundMessageAuthIntentStatus } from "./enums/inbound-message-auth-intent-status.enum";
import { AuthIntentCreationCollisionError } from "./errors/auth-intent-creation-collision.error";
import { AuthIntentNotFoundError } from "./errors/auth-intent-not-found.error";
import { InboundMessageAuthService } from "./inbound-message-auth.service";
import { InboundMessageAuthRepository } from "./repositories/inbound-message-auth.repository";

function _createProcessingIntent() {
	return {
		candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
		intentTokenHash: "b".repeat(64),
	};
}

describe("InboundMessageAuthService", () => {
	let service: InboundMessageAuthService;
	let repository: {
		createIntent: ReturnType<typeof vi.fn>;
		findIntentByTokenHash: ReturnType<typeof vi.fn>;
		getIntentOrNullAndMarkAsProcessing: ReturnType<typeof vi.fn>;
		markProcessingIntentAsVerified: ReturnType<typeof vi.fn>;
		markProcessingIntentAsPending: ReturnType<typeof vi.fn>;
	};
	let identityRepository: { upsertIdentity: ReturnType<typeof vi.fn> };
	let userService: { getOrAddContact: ReturnType<typeof vi.fn> };
	let authSessionService: { create: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		repository = {
			createIntent: vi.fn(),
			findIntentByTokenHash: vi.fn(),
			getIntentOrNullAndMarkAsProcessing: vi.fn(),
			markProcessingIntentAsVerified: vi.fn(),
			markProcessingIntentAsPending: vi.fn(),
		};
		identityRepository = { upsertIdentity: vi.fn() };
		userService = { getOrAddContact: vi.fn() };
		authSessionService = { create: vi.fn() };
		const module = await Test.createTestingModule({
			providers: [
				InboundMessageAuthService,
				{ provide: InboundMessageAuthRepository, useValue: repository },
				{ provide: AuthIdentityRepository, useValue: identityRepository },
				{ provide: UserService, useValue: userService },
				{ provide: AuthSessionService, useValue: authSessionService },
			],
		}).compile();

		service = module.get(InboundMessageAuthService);
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should create a code with the AUTH prefix and ten uppercase alphanumeric characters", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });

		expect(result.code).toMatch(/^AUTH-[A-Z0-9]{10}$/);
	});

	it("should preassign a candidate session identifier for retry-safe exchange", async () => {
		repository.createIntent.mockResolvedValue(true);

		await service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });

		expect(repository.createIntent).toHaveBeenCalledWith(
			expect.objectContaining({
				candidateSessionId: expect.stringMatching(
					/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
				),
			}),
		);
	});

	it("should return a 256-bit URL-safe secret intent token", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });

		expect(result.intentToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("should expire the authentication intent exactly fifteen minutes after creation", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });

		expect(result.expiresAt).toBe("2026-08-05T15:15:00.000Z");
	});

	it("should persist the SHA-256 hash of the emitted code", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });

		expect(repository.createIntent).toHaveBeenCalledWith(
			expect.objectContaining({ authCodeHash: createHash("sha256").update(result.code).digest("hex") }),
		);
	});

	it("should never send the raw authentication code to the repository", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });
		const persistedIntent = repository.createIntent.mock.calls[0]![0] as Record<string, unknown>;

		expect(Object.values(persistedIntent)).not.toContain(result.code);
	});

	it("should never send the raw intent token to the repository", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });
		const persistedIntent = repository.createIntent.mock.calls[0]![0] as Record<string, unknown>;

		expect(Object.values(persistedIntent)).not.toContain(result.intentToken);
	});

	it("should persist the SHA-256 hash of the emitted intent token", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });

		expect(repository.createIntent).toHaveBeenCalledWith(
			expect.objectContaining({
				intentTokenHash: createHash("sha256").update(result.intentToken).digest("hex"),
			}),
		);
	});

	it("should persist the selected inbound-message channel", async () => {
		repository.createIntent.mockResolvedValue(true);

		await service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });

		expect(repository.createIntent).toHaveBeenCalledWith(
			expect.objectContaining({ channel: InboundMessageAuthChannel.WHATSAPP }),
		);
	});

	it("should retry when a generated intent collides with an existing Redis record", async () => {
		repository.createIntent.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

		await service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP });

		expect(repository.createIntent).toHaveBeenCalledTimes(2);
	});

	it("should fail safely after three consecutive collisions", async () => {
		repository.createIntent.mockResolvedValue(false);

		await expect(service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP })).rejects.toThrow(
			AuthIntentCreationCollisionError,
		);
	});

	it("should propagate an internal storage failure to the global error filter", async () => {
		const storageError = new Error("UPSTASH_REDIS_REST_TOKEN rejected");
		repository.createIntent.mockRejectedValue(storageError);

		await expect(service.createIntent({ channel: InboundMessageAuthChannel.WHATSAPP })).rejects.toBe(storageError);
	});

	it("should expose the same error for an unknown or expired intent token", async () => {
		repository.findIntentByTokenHash.mockResolvedValue(null);

		await expect(
			service.exchangeIntentForSession({
				intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
			}),
		).rejects.toThrow(AuthIntentNotFoundError);
	});

	it("should tell the mobile client to poll again while the intent is pending", async () => {
		repository.findIntentByTokenHash.mockResolvedValue({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: InboundMessageAuthIntentStatus.PENDING,
			userId: null,
		});

		const result = await service.exchangeIntentForSession({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});

		expect(result).toEqual({ status: InboundMessageAuthIntentStatus.PENDING, retryAfterSeconds: 2 });
	});

	it("should tell the mobile client to poll again while the intent is processing", async () => {
		repository.findIntentByTokenHash.mockResolvedValue({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: InboundMessageAuthIntentStatus.PROCESSING,
			userId: null,
		});

		const result = await service.exchangeIntentForSession({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});

		expect(result).toEqual({ status: InboundMessageAuthIntentStatus.PENDING, retryAfterSeconds: 2 });
	});

	it("should locate the intent using only the SHA-256 hash of the supplied token", async () => {
		repository.findIntentByTokenHash.mockResolvedValue({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: InboundMessageAuthIntentStatus.PENDING,
			userId: null,
		});

		await service.exchangeIntentForSession({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});

		expect(repository.findIntentByTokenHash).toHaveBeenCalledWith({
			intentTokenHash: createHash("sha256").update("kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI").digest("hex"),
		});
	});

	it("should return the session issued from a verified intent", async () => {
		repository.findIntentByTokenHash.mockResolvedValue({
			status: InboundMessageAuthIntentStatus.VERIFIED,
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
		});
		const issuedSession = {
			accessToken: "access-token",
			tokenType: "Bearer" as const,
			expiresAt: "2026-08-05T15:15:00.000Z",
			refreshToken: "refresh-token",
			refreshExpiresAt: "2026-09-04T15:00:00.000Z",
			userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
		};
		authSessionService.create.mockResolvedValue(issuedSession);

		const result = await service.exchangeIntentForSession({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});

		expect(result).toBe(issuedSession);
	});

	it("should issue a session using the verified intent's candidate session identifier", async () => {
		repository.findIntentByTokenHash.mockResolvedValue({
			status: InboundMessageAuthIntentStatus.VERIFIED,
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
		});
		authSessionService.create.mockResolvedValue({
			accessToken: "access-token",
			tokenType: "Bearer",
			expiresAt: "2026-08-05T15:15:00.000Z",
			refreshToken: "refresh-token",
			refreshExpiresAt: "2026-09-04T15:00:00.000Z",
			userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
		});

		await service.exchangeIntentForSession({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});

		expect(authSessionService.create).toHaveBeenCalledWith({
			sessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
		});
	});

	it("should propagate session issuance failures", async () => {
		repository.findIntentByTokenHash.mockResolvedValue({
			status: InboundMessageAuthIntentStatus.VERIFIED,
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
		});
		authSessionService.create.mockRejectedValue(new AuthSessionUnavailableError());

		await expect(
			service.exchangeIntentForSession({
				intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
			}),
		).rejects.toThrow(AuthSessionUnavailableError);
	});

	it("should claim the matching intent using channel-neutral message details", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(null);

		await service.verifyAuthMessage({
			channel: InboundMessageAuthChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "+5511999999999",
			contactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		});

		expect(repository.getIntentOrNullAndMarkAsProcessing).toHaveBeenCalledWith({
			authCodeHash: "a".repeat(64),
			providerMessageId: "wamid.message",
			nowMilliseconds: Date.parse("2026-08-05T15:00:00.000Z"),
			channel: InboundMessageAuthChannel.WHATSAPP,
		});
	});

	it("should not create an identity when the code cannot identify an intent", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(null);

		await service.verifyAuthMessage({
			channel: InboundMessageAuthChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "+5511999999999",
			contactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		});

		expect(identityRepository.upsertIdentity).not.toHaveBeenCalled();
	});

	it("should derive the WhatsApp identity provider from the inbound-message channel", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsVerified.mockResolvedValue(undefined);
		identityRepository.upsertIdentity.mockResolvedValue("user-id");

		await service.verifyAuthMessage({
			channel: InboundMessageAuthChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			contactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		});

		expect(identityRepository.upsertIdentity).toHaveBeenCalledWith({
			provider: AuthIdentityProvider.WHATSAPP,
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
		});
	});

	it("should save the observed WhatsApp identifier as a reusable contact", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsVerified.mockResolvedValue(undefined);
		identityRepository.upsertIdentity.mockResolvedValue("user-id");
		userService.getOrAddContact.mockResolvedValue({});

		await service.verifyAuthMessage({
			channel: InboundMessageAuthChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			contactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		});

		expect(userService.getOrAddContact).toHaveBeenCalledWith({
			userId: "user-id",
			contact: {
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			},
		});
	});

	it("should wait for contact persistence before making the intent exchangeable", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsVerified.mockResolvedValue(undefined);
		identityRepository.upsertIdentity.mockResolvedValue("user-id");
		let resolveContactPersistence!: (value: unknown) => void;
		const contactPersistence = new Promise<unknown>((resolve) => {
			resolveContactPersistence = resolve;
		});
		let markContactPersistenceAsStarted!: () => void;
		const contactPersistenceStarted = new Promise<void>((resolve) => {
			markContactPersistenceAsStarted = resolve;
		});
		userService.getOrAddContact.mockImplementation(() => {
			markContactPersistenceAsStarted();
			return contactPersistence;
		});

		const verification = service.verifyAuthMessage({
			channel: InboundMessageAuthChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			contactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		});
		await contactPersistenceStarted;
		const verificationStartedBeforeContactPersisted = repository.markProcessingIntentAsVerified.mock.calls.length > 0;
		resolveContactPersistence({});
		await verification;

		expect(verificationStartedBeforeContactPersisted).toBe(false);
	});

	it("should make the processing intent exchangeable after resolving its identity", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsVerified.mockResolvedValue(undefined);
		identityRepository.upsertIdentity.mockResolvedValue("user-id");

		await service.verifyAuthMessage({
			channel: InboundMessageAuthChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "+5511999999999",
			contactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		});

		expect(repository.markProcessingIntentAsVerified).toHaveBeenCalledWith({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			authCodeHash: "a".repeat(64),
			intentTokenHash: "b".repeat(64),
			providerMessageId: "wamid.message",
			channel: InboundMessageAuthChannel.WHATSAPP,
			userId: "user-id",
		});
	});

	it("should propagate failures that happen before an intent becomes processing", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockRejectedValue(new Error("redis unavailable"));

		await expect(
			service.verifyAuthMessage({
				channel: InboundMessageAuthChannel.WHATSAPP,
				providerMessageId: "wamid.message",
				providerSubject: "+5511999999999",
				contactIdentifier: "+5511999999999",
				authCodeHash: "a".repeat(64),
			}),
		).rejects.toThrow("redis unavailable");
	});

	it("should return the processing intent to pending when identity creation fails", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsPending.mockResolvedValue(undefined);
		identityRepository.upsertIdentity.mockRejectedValue(new Error("database unavailable"));

		const error = await service
			.verifyAuthMessage({
				channel: InboundMessageAuthChannel.WHATSAPP,
				providerMessageId: "wamid.message",
				providerSubject: "+5511999999999",
				contactIdentifier: "+5511999999999",
				authCodeHash: "a".repeat(64),
			})
			.catch((caughtError: unknown) => caughtError);

		expect({ error: error, pending: repository.markProcessingIntentAsPending.mock.calls[0]?.[0] }).toEqual({
			error: expect.objectContaining({ message: "database unavailable" }),
			pending: { intentTokenHash: "b".repeat(64), providerMessageId: "wamid.message" },
		});
	});

	it("should return the processing intent to pending when verification ownership is lost", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsPending.mockResolvedValue(undefined);
		repository.markProcessingIntentAsVerified.mockRejectedValue(
			new Error("Inbound-message authentication intent processing ownership was lost"),
		);
		identityRepository.upsertIdentity.mockResolvedValue("user-id");

		await expect(
			service.verifyAuthMessage({
				channel: InboundMessageAuthChannel.WHATSAPP,
				providerMessageId: "wamid.message",
				providerSubject: "+5511999999999",
				contactIdentifier: "+5511999999999",
				authCodeHash: "a".repeat(64),
			}),
		).rejects.toThrow("Inbound-message authentication intent processing ownership was lost");
	});
});
