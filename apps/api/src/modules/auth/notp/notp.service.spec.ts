import { Test } from "@nestjs/testing";
import { createHash } from "node:crypto";
import { AuthIdentityProvider, JobContactMethod } from "../../../../generated/prisma/client.js";
import { AuthSessionService } from "../auth-session.service";
import { AuthSessionUnavailableError } from "../errors/auth-session-unavailable.error";
import { AuthIdentityRepository } from "../repositories/auth-identity.repository";
import { NotpChannel } from "./enums/notp-channel.enum";
import { NotpIntentStatus } from "./enums/notp-intent-status.enum";
import { NotpIntentCreationCollisionError } from "./errors/notp-intent-creation-collision.error";
import { NotpIntentNotFoundError } from "./errors/notp-intent-not-found.error";
import { notpConfig } from "./notp.config";
import { NotpService } from "./notp.service";
import { NotpRepository } from "./repositories/notp.repository";

function _createProcessingIntent() {
	return {
		candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
		intentTokenHash: "b".repeat(64),
	};
}

describe("NotpService", () => {
	let service: NotpService;
	let repository: {
		createIntent: ReturnType<typeof vi.fn>;
		findIntentByTokenHashAfterWaitingForVerification: ReturnType<typeof vi.fn>;
		getIntentOrNullAndMarkAsProcessing: ReturnType<typeof vi.fn>;
		markProcessingIntentAsVerified: ReturnType<typeof vi.fn>;
		markProcessingIntentAsPending: ReturnType<typeof vi.fn>;
	};
	let identityRepository: { saveVerifiedIdentityAndContact: ReturnType<typeof vi.fn> };
	let authSessionService: { create: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		repository = {
			createIntent: vi.fn(),
			findIntentByTokenHashAfterWaitingForVerification: vi.fn(),
			getIntentOrNullAndMarkAsProcessing: vi.fn(),
			markProcessingIntentAsVerified: vi.fn(),
			markProcessingIntentAsPending: vi.fn(),
		};
		identityRepository = { saveVerifiedIdentityAndContact: vi.fn() };
		authSessionService = { create: vi.fn() };
		const module = await Test.createTestingModule({
			providers: [
				NotpService,
				{ provide: NotpRepository, useValue: repository },
				{ provide: AuthIdentityRepository, useValue: identityRepository },
				{ provide: AuthSessionService, useValue: authSessionService },
				{
					provide: notpConfig.KEY,
					useValue: {
						codeReceiverByChannel: {
							[NotpChannel.WHATSAPP]: "+5511963270517",
						},
					},
				},
			],
		}).compile();

		service = module.get(NotpService);
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("should create a code with the AUTH prefix and ten uppercase alphanumeric characters", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: NotpChannel.WHATSAPP });

		expect(result.code).toMatch(/^NOTP-[A-Z0-9]{10}$/);
	});

	it("should return the code receiver configured for the selected channel", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: NotpChannel.WHATSAPP });

		expect(result.codeReceiver).toBe("+5511963270517");
	});

	it("should preassign a candidate session identifier for retry-safe exchange", async () => {
		repository.createIntent.mockResolvedValue(true);

		await service.createIntent({ channel: NotpChannel.WHATSAPP });

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

		const result = await service.createIntent({ channel: NotpChannel.WHATSAPP });

		expect(result.intentToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("should expire the NOTP intent exactly fifteen minutes after creation", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: NotpChannel.WHATSAPP });

		expect(result.expiresAt).toBe("2026-08-05T15:15:00.000Z");
	});

	it("should persist the SHA-256 hash of the emitted code", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: NotpChannel.WHATSAPP });

		expect(repository.createIntent).toHaveBeenCalledWith(
			expect.objectContaining({ notpCodeHash: createHash("sha256").update(result.code).digest("hex") }),
		);
	});

	it("should never send the raw NOTP code to the repository", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: NotpChannel.WHATSAPP });
		const persistedIntent = repository.createIntent.mock.calls[0]![0] as Record<string, unknown>;

		expect(Object.values(persistedIntent)).not.toContain(result.code);
	});

	it("should never send the raw intent token to the repository", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: NotpChannel.WHATSAPP });
		const persistedIntent = repository.createIntent.mock.calls[0]![0] as Record<string, unknown>;

		expect(Object.values(persistedIntent)).not.toContain(result.intentToken);
	});

	it("should persist the SHA-256 hash of the emitted intent token", async () => {
		repository.createIntent.mockResolvedValue(true);

		const result = await service.createIntent({ channel: NotpChannel.WHATSAPP });

		expect(repository.createIntent).toHaveBeenCalledWith(
			expect.objectContaining({
				intentTokenHash: createHash("sha256").update(result.intentToken).digest("hex"),
			}),
		);
	});

	it("should persist the selected NOTP channel", async () => {
		repository.createIntent.mockResolvedValue(true);

		await service.createIntent({ channel: NotpChannel.WHATSAPP });

		expect(repository.createIntent).toHaveBeenCalledWith(expect.objectContaining({ channel: NotpChannel.WHATSAPP }));
	});

	it("should retry when a generated intent collides with an existing Redis record", async () => {
		repository.createIntent.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

		await service.createIntent({ channel: NotpChannel.WHATSAPP });

		expect(repository.createIntent).toHaveBeenCalledTimes(2);
	});

	it("should fail safely after three consecutive collisions", async () => {
		repository.createIntent.mockResolvedValue(false);

		await expect(service.createIntent({ channel: NotpChannel.WHATSAPP })).rejects.toThrow(
			NotpIntentCreationCollisionError,
		);
	});

	it("should propagate an internal storage failure to the global error filter", async () => {
		const storageError = new Error("UPSTASH_REDIS_REST_TOKEN rejected");
		repository.createIntent.mockRejectedValue(storageError);

		await expect(service.createIntent({ channel: NotpChannel.WHATSAPP })).rejects.toBe(storageError);
	});

	it("should expose the same error for an unknown or expired intent token", async () => {
		repository.findIntentByTokenHashAfterWaitingForVerification.mockResolvedValue(null);

		await expect(
			service.exchangeIntentForSession({
				intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
			}),
		).rejects.toThrow(NotpIntentNotFoundError);
	});

	it("should tell the mobile client to poll again while the intent is pending", async () => {
		repository.findIntentByTokenHashAfterWaitingForVerification.mockResolvedValue({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});

		const result = await service.exchangeIntentForSession({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});

		expect(result).toEqual({ status: NotpIntentStatus.PENDING, retryAfterSeconds: 1 });
	});

	it("should tell the mobile client to poll again while the intent is processing", async () => {
		repository.findIntentByTokenHashAfterWaitingForVerification.mockResolvedValue({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PROCESSING,
		});

		const result = await service.exchangeIntentForSession({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});

		expect(result).toEqual({ status: NotpIntentStatus.PENDING, retryAfterSeconds: 1 });
	});

	it("should locate the intent using only the SHA-256 hash of the supplied token", async () => {
		repository.findIntentByTokenHashAfterWaitingForVerification.mockResolvedValue({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});

		await service.exchangeIntentForSession({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});

		expect(repository.findIntentByTokenHashAfterWaitingForVerification).toHaveBeenCalledWith({
			intentTokenHash: createHash("sha256").update("kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI").digest("hex"),
		});
	});

	it("should pass request cancellation to the verification wait", async () => {
		repository.findIntentByTokenHashAfterWaitingForVerification.mockResolvedValue({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			status: NotpIntentStatus.PENDING,
		});
		const abortController = new AbortController();

		await service.exchangeIntentForSession({
			abortSignal: abortController.signal,
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});

		expect(repository.findIntentByTokenHashAfterWaitingForVerification).toHaveBeenCalledWith({
			abortSignal: abortController.signal,
			intentTokenHash: createHash("sha256").update("kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI").digest("hex"),
		});
	});

	it("should return a randomly issued session from a verified intent", async () => {
		repository.findIntentByTokenHashAfterWaitingForVerification.mockResolvedValue({
			status: NotpIntentStatus.VERIFIED,
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
		repository.findIntentByTokenHashAfterWaitingForVerification.mockResolvedValue({
			status: NotpIntentStatus.VERIFIED,
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

	it("should allow a verified intent retry to rotate the same session after a lost response", async () => {
		repository.findIntentByTokenHashAfterWaitingForVerification.mockResolvedValue({
			status: NotpIntentStatus.VERIFIED,
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
		});
		authSessionService.create
			.mockResolvedValueOnce({
				accessToken: "first-access-token",
				tokenType: "Bearer",
				expiresAt: "2026-08-05T15:15:00.000Z",
				refreshToken: "first-refresh-token",
				refreshExpiresAt: "2026-09-04T15:00:00.000Z",
				userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
			})
			.mockResolvedValueOnce({
				accessToken: "replacement-access-token",
				tokenType: "Bearer",
				expiresAt: "2026-08-05T15:15:00.000Z",
				refreshToken: "replacement-refresh-token",
				refreshExpiresAt: "2026-09-04T15:00:00.000Z",
				userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
			});

		const firstResult = await service.exchangeIntentForSession({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});
		const retryResult = await service.exchangeIntentForSession({
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
		});

		expect(firstResult).toMatchObject({ accessToken: "first-access-token" });
		expect(retryResult).toMatchObject({ accessToken: "replacement-access-token" });
		expect(authSessionService.create).toHaveBeenCalledTimes(2);
	});

	it("should propagate session issuance failures", async () => {
		repository.findIntentByTokenHashAfterWaitingForVerification.mockResolvedValue({
			status: NotpIntentStatus.VERIFIED,
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

		await service.verifyNotp({
			channel: NotpChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "+5511999999999",
			contactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		});

		expect(repository.getIntentOrNullAndMarkAsProcessing).toHaveBeenCalledWith({
			notpCodeHash: "a".repeat(64),
			providerMessageId: "wamid.message",
			nowMilliseconds: Date.parse("2026-08-05T15:00:00.000Z"),
			channel: NotpChannel.WHATSAPP,
		});
	});

	it("should not create an identity when the code cannot identify an intent", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(null);

		await service.verifyNotp({
			channel: NotpChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "+5511999999999",
			contactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		});

		expect(identityRepository.saveVerifiedIdentityAndContact).not.toHaveBeenCalled();
	});

	it("should derive the WhatsApp identity provider from the NOTP channel", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsVerified.mockResolvedValue(undefined);
		identityRepository.saveVerifiedIdentityAndContact.mockResolvedValue("user-id");

		await service.verifyNotp({
			channel: NotpChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			contactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		});

		expect(identityRepository.saveVerifiedIdentityAndContact).toHaveBeenCalledWith({
			provider: AuthIdentityProvider.WHATSAPP,
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
			contactMethod: JobContactMethod.WHATSAPP,
			contactIdentifier: "+5511999999999",
		});
	});

	it("should save the observed WhatsApp identifier in the same database operation as the identity", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsVerified.mockResolvedValue(undefined);
		identityRepository.saveVerifiedIdentityAndContact.mockResolvedValue("user-id");

		await service.verifyNotp({
			channel: NotpChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			contactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		});

		expect(identityRepository.saveVerifiedIdentityAndContact).toHaveBeenCalledWith({
			provider: AuthIdentityProvider.WHATSAPP,
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
			contactMethod: JobContactMethod.WHATSAPP,
			contactIdentifier: "+5511999999999",
		});
	});

	it("should wait for atomic identity and contact persistence before making the intent exchangeable", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsVerified.mockResolvedValue(undefined);
		let resolveIdentityAndContactPersistence!: (value: string) => void;
		const identityAndContactPersistence = new Promise<string>((resolve) => {
			resolveIdentityAndContactPersistence = resolve;
		});
		let markIdentityAndContactPersistenceAsStarted!: () => void;
		const identityAndContactPersistenceStarted = new Promise<void>((resolve) => {
			markIdentityAndContactPersistenceAsStarted = resolve;
		});
		identityRepository.saveVerifiedIdentityAndContact.mockImplementation(() => {
			markIdentityAndContactPersistenceAsStarted();
			return identityAndContactPersistence;
		});

		const verification = service.verifyNotp({
			channel: NotpChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			contactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		});
		await identityAndContactPersistenceStarted;
		const verificationStartedBeforeIdentityAndContactPersisted =
			repository.markProcessingIntentAsVerified.mock.calls.length > 0;
		resolveIdentityAndContactPersistence("user-id");
		await verification;

		expect(verificationStartedBeforeIdentityAndContactPersisted).toBe(false);
	});

	it("should make the processing intent exchangeable after resolving its identity", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsVerified.mockResolvedValue(undefined);
		identityRepository.saveVerifiedIdentityAndContact.mockResolvedValue("user-id");

		await service.verifyNotp({
			channel: NotpChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "+5511999999999",
			contactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		});

		expect(repository.markProcessingIntentAsVerified).toHaveBeenCalledWith({
			candidateSessionId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			notpCodeHash: "a".repeat(64),
			intentTokenHash: "b".repeat(64),
			providerMessageId: "wamid.message",
			channel: NotpChannel.WHATSAPP,
			userId: "user-id",
		});
	});

	it("should propagate failures that happen before an intent becomes processing", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockRejectedValue(new Error("redis unavailable"));

		await expect(
			service.verifyNotp({
				channel: NotpChannel.WHATSAPP,
				providerMessageId: "wamid.message",
				providerSubject: "+5511999999999",
				contactIdentifier: "+5511999999999",
				notpCodeHash: "a".repeat(64),
			}),
		).rejects.toThrow("redis unavailable");
	});

	it("should return the processing intent to pending when identity creation fails", async () => {
		repository.getIntentOrNullAndMarkAsProcessing.mockResolvedValue(_createProcessingIntent());
		repository.markProcessingIntentAsPending.mockResolvedValue(undefined);
		identityRepository.saveVerifiedIdentityAndContact.mockRejectedValue(new Error("database unavailable"));

		const error = await service
			.verifyNotp({
				channel: NotpChannel.WHATSAPP,
				providerMessageId: "wamid.message",
				providerSubject: "+5511999999999",
				contactIdentifier: "+5511999999999",
				notpCodeHash: "a".repeat(64),
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
		repository.markProcessingIntentAsVerified.mockRejectedValue(new Error("NOTP intent processing ownership was lost"));
		identityRepository.saveVerifiedIdentityAndContact.mockResolvedValue("user-id");

		await expect(
			service.verifyNotp({
				channel: NotpChannel.WHATSAPP,
				providerMessageId: "wamid.message",
				providerSubject: "+5511999999999",
				contactIdentifier: "+5511999999999",
				notpCodeHash: "a".repeat(64),
			}),
		).rejects.toThrow("NOTP intent processing ownership was lost");
	});
});
