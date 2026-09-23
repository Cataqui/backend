import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { z } from "zod";
import { AuthIdentityProvider, JobContactMethod } from "../../../../generated/prisma/client.js";
import { AuthSessionService } from "../auth-session.service";
import { AuthIdentityRepository } from "../repositories/auth-identity.repository";
import { NotpChannel } from "./enums/notp-channel.enum";
import { NotpIntentStatus } from "./enums/notp-intent-status.enum";
import { NotpIntentCreationCollisionError } from "./errors/notp-intent-creation-collision.error";
import { NotpIntentNotFoundError } from "./errors/notp-intent-not-found.error";
import { type INotpConfig, notpConfig } from "./notp.config";
import { NotpConstants } from "./notp.constants";
import { NotpRepository } from "./repositories/notp.repository";
import { NotpIntentExchangeOutputSchema } from "./schemas/notp-intent-exchange-output.schema";
import { NotpIntentOutputSchema } from "./schemas/notp-intent-output.schema";

@Injectable()
export class NotpService {
	constructor(
		private readonly _notpRepository: NotpRepository,
		private readonly _authIdentityRepository: AuthIdentityRepository,
		private readonly _authSessionService: AuthSessionService,
		@Inject(notpConfig.KEY) private readonly _config: INotpConfig,
	) {}

	async createIntent(params: { channel: NotpChannel }): Promise<z.infer<typeof NotpIntentOutputSchema>> {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const candidateSessionId = randomUUID();
			const intentToken = randomBytes(32).toString("base64url");
			const intentTokenHash = createHash("sha256").update(intentToken).digest("hex");
			const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

			let notpCodeSuffix = "";

			for (let index = 0; index < 10; index += 1) notpCodeSuffix += alphabet.charAt(randomInt(alphabet.length));

			const notpCode = `NOTP-${notpCodeSuffix}`;
			const createdAt = new Date();
			const expiresAt = new Date(createdAt.getTime() + NotpConstants.INTENT_EXPIRATION_SECONDS * 1000);

			const created = await this._notpRepository.createIntent({
				notpCodeHash: createHash("sha256").update(notpCode).digest("hex"),
				candidateSessionId: candidateSessionId,
				intentTokenHash: intentTokenHash,
				channel: params.channel,
			});

			if (!created) continue;

			return {
				intentToken: intentToken,
				code: notpCode,
				codeReceiver: this._config.codeReceiverByChannel[params.channel],
				expiresAt: expiresAt.toISOString(),
			};
		}

		throw new NotpIntentCreationCollisionError();
	}

	async exchangeIntentForSession(params: {
		abortSignal?: AbortSignal;
		intentToken: string;
	}): Promise<z.infer<typeof NotpIntentExchangeOutputSchema>> {
		const intentTokenHash = createHash("sha256").update(params.intentToken).digest("hex");
		const intent = await this._notpRepository.findIntentByTokenHashAfterWaitingForVerification({
			...(params.abortSignal === undefined ? {} : { abortSignal: params.abortSignal }),
			intentTokenHash: intentTokenHash,
		});

		if (intent === null) throw new NotpIntentNotFoundError();

		if (intent.status !== NotpIntentStatus.VERIFIED) {
			return {
				status: NotpIntentStatus.PENDING,
				retryAfterSeconds: NotpConstants.INTENT_EXCHANGE_POLL_RETRY_SECONDS,
			};
		}

		return this._authSessionService.create({
			sessionId: intent.candidateSessionId,
			userId: intent.userId,
			authIdentityId: intent.authIdentityId,
		});
	}

	async verifyNotp(params: {
		channel: NotpChannel;
		providerMessageId: string;
		providerSubject: string;
		contactIdentifier: string;
		providerProfileName: string | undefined;
		notpCodeHash: string;
	}): Promise<void> {
		const verificationStartedAt = new Date();

		const processingIntent = await this._notpRepository.getIntentOrNullAndMarkAsProcessing({
			notpCodeHash: params.notpCodeHash,
			providerMessageId: params.providerMessageId,
			nowMilliseconds: verificationStartedAt.getTime(),
			channel: params.channel,
		});

		if (processingIntent === null) return;

		try {
			const displayIdentifier = params.providerProfileName?.trim() || params.contactIdentifier;
			const identity = await this._authIdentityRepository.saveVerifiedIdentityAndContact({
				provider: _authIdentityProviderByChannel[params.channel],
				providerSubject: params.providerSubject,
				displayIdentifier: displayIdentifier,
				lastVerifiedAt: verificationStartedAt,
				contactMethod: _contactMethodByChannel[params.channel],
				contactIdentifier: params.contactIdentifier,
			});

			await this._notpRepository.markProcessingIntentAsVerified({
				candidateSessionId: processingIntent.candidateSessionId,
				notpCodeHash: params.notpCodeHash,
				intentTokenHash: processingIntent.intentTokenHash,
				providerMessageId: params.providerMessageId,
				channel: params.channel,
				userId: identity.userId,
				authIdentityId: identity.authIdentityId,
			});
		} catch (error) {
			await this._notpRepository.markProcessingIntentAsPending({
				intentTokenHash: processingIntent.intentTokenHash,
				providerMessageId: params.providerMessageId,
			});

			throw error;
		}
	}
}

const _authIdentityProviderByChannel = {
	[NotpChannel.WHATSAPP]: AuthIdentityProvider.WHATSAPP,
} satisfies Record<NotpChannel, AuthIdentityProvider>;

const _contactMethodByChannel = {
	[NotpChannel.WHATSAPP]: JobContactMethod.WHATSAPP,
} satisfies Record<NotpChannel, JobContactMethod>;
