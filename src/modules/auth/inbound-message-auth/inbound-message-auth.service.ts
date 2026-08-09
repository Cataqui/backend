import { Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { z } from "zod";
import { AuthIdentityProvider, JobContactMethod } from "../../../../generated/prisma/client.js";
import { UserService } from "../../user/user.service";
import { AuthSessionService } from "../auth-session.service";
import { AuthIdentityRepository } from "../repositories/auth-identity.repository";
import { InboundMessageAuthChannel } from "./enums/inbound-message-auth-channel.enum";
import { InboundMessageAuthIntentStatus } from "./enums/inbound-message-auth-intent-status.enum";
import { AuthIntentCreationCollisionError } from "./errors/auth-intent-creation-collision.error";
import { AuthIntentNotFoundError } from "./errors/auth-intent-not-found.error";
import { InboundMessageAuthConstants } from "./inbound-message-auth.constants";
import { InboundMessageAuthRepository } from "./repositories/inbound-message-auth.repository";
import { AuthIntentExchangeOutputSchema } from "./schemas/auth-intent-exchange-output.schema";
import { InboundMessageAuthIntentOutputSchema } from "./schemas/inbound-message-auth-intent-output.schema";

@Injectable()
export class InboundMessageAuthService {
	constructor(
		private readonly _inboundMessageAuthRepository: InboundMessageAuthRepository,
		private readonly _authIdentityRepository: AuthIdentityRepository,
		private readonly _userService: UserService,
		private readonly _authSessionService: AuthSessionService,
	) {}

	async createIntent(params: {
		channel: InboundMessageAuthChannel;
	}): Promise<z.infer<typeof InboundMessageAuthIntentOutputSchema>> {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const candidateSessionId = randomUUID();
			const intentToken = randomBytes(32).toString("base64url");
			const intentTokenHash = createHash("sha256").update(intentToken).digest("hex");
			const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

			let authCodeSuffix = "";

			for (let index = 0; index < 10; index += 1) authCodeSuffix += alphabet.charAt(randomInt(alphabet.length));

			const authCode = `AUTH-${authCodeSuffix}`;
			const createdAt = new Date();
			const expiresAt = new Date(createdAt.getTime() + InboundMessageAuthConstants.INTENT_EXPIRATION_SECONDS * 1000);

			const created = await this._inboundMessageAuthRepository.createIntent({
				authCodeHash: createHash("sha256").update(authCode).digest("hex"),
				candidateSessionId: candidateSessionId,
				intentTokenHash: intentTokenHash,
				channel: params.channel,
			});

			if (!created) continue;

			return {
				intentToken: intentToken,
				code: authCode,
				expiresAt: expiresAt.toISOString(),
			};
		}

		throw new AuthIntentCreationCollisionError();
	}

	async exchangeIntentForSession(params: {
		intentToken: string;
	}): Promise<z.infer<typeof AuthIntentExchangeOutputSchema>> {
		const intent = await this._inboundMessageAuthRepository.findIntentByTokenHash({
			intentTokenHash: createHash("sha256").update(params.intentToken).digest("hex"),
		});

		if (intent === null) throw new AuthIntentNotFoundError();

		if (intent.status !== InboundMessageAuthIntentStatus.VERIFIED) {
			return {
				status: InboundMessageAuthIntentStatus.PENDING,
				retryAfterSeconds: InboundMessageAuthConstants.INTENT_EXCHANGE_POLL_RETRY_SECONDS,
			};
		}

		if (intent.userId === null) throw new AuthIntentNotFoundError();

		return this._authSessionService.create({
			sessionId: intent.candidateSessionId,
			userId: intent.userId,
		});
	}

	async verifyAuthMessage(params: {
		channel: InboundMessageAuthChannel;
		providerMessageId: string;
		providerSubject: string;
		contactIdentifier: string;
		authCodeHash: string;
	}): Promise<void> {
		const processingIntent = await this._inboundMessageAuthRepository.getIntentOrNullAndMarkAsProcessing({
			authCodeHash: params.authCodeHash,
			providerMessageId: params.providerMessageId,
			nowMilliseconds: Date.now(),
			channel: params.channel,
		});

		if (processingIntent === null) return;

		try {
			const userId = await this._authIdentityRepository.upsertIdentity({
				provider: authIdentityProviderByChannel[params.channel],
				providerSubject: params.providerSubject,
				lastVerifiedAt: new Date(),
			});

			await this._userService.getOrAddContact({
				userId: userId,
				contact: {
					contactMethod: contactMethodByChannel[params.channel],
					identifier: params.contactIdentifier,
				},
			});

			await this._inboundMessageAuthRepository.markProcessingIntentAsVerified({
				candidateSessionId: processingIntent.candidateSessionId,
				authCodeHash: params.authCodeHash,
				intentTokenHash: processingIntent.intentTokenHash,
				providerMessageId: params.providerMessageId,
				channel: params.channel,
				userId: userId,
			});
		} catch (error) {
			await this._inboundMessageAuthRepository.markProcessingIntentAsPending({
				intentTokenHash: processingIntent.intentTokenHash,
				providerMessageId: params.providerMessageId,
			});

			throw error;
		}
	}
}

const authIdentityProviderByChannel = {
	[InboundMessageAuthChannel.WHATSAPP]: AuthIdentityProvider.WHATSAPP,
} satisfies Record<InboundMessageAuthChannel, AuthIdentityProvider>;

const contactMethodByChannel = {
	[InboundMessageAuthChannel.WHATSAPP]: JobContactMethod.WHATSAPP,
} satisfies Record<InboundMessageAuthChannel, JobContactMethod>;
