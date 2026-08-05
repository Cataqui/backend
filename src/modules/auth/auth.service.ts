import { Injectable } from "@nestjs/common";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { AuthConstants } from "./auth.constants";
import { WhatsappAuthIntentOutputDto } from "./dto/whatsapp-auth-intent-output.dto";
import { AuthIntentCreationUnavailableError } from "./errors/auth-intent-creation-unavailable.error";
import { AuthRepository } from "./repositories/auth.repository";

@Injectable()
export class AuthService {
	constructor(private readonly _authRepository: AuthRepository) {}

	async createWhatsAppIntent(): Promise<WhatsappAuthIntentOutputDto> {
		try {
			for (let attempt = 0; attempt < 3; attempt += 1) {
				const intentId = randomUUID();
				const code = this._generateWhatsAppAuthCode();
				const createdAt = new Date();
				const expiresAt = new Date(createdAt.getTime() + AuthConstants.WHATSAPP_INTENT_EXPIRATION_SECONDS * 1000);
				const codeHash = createHash("sha256").update(code).digest("hex");

				const created = await this._authRepository.createWhatsappIntent({
					intentId: intentId,
					codeHash: codeHash,
					createdAt: createdAt.toISOString(),
					expiresAt: expiresAt.toISOString(),
				});

				if (!created) continue;

				return new WhatsappAuthIntentOutputDto({
					intentId: intentId,
					code: code,
					expiresAt: expiresAt.toISOString(),
				});
			}
		} catch {
			throw new AuthIntentCreationUnavailableError();
		}

		throw new AuthIntentCreationUnavailableError();
	}

	private _generateWhatsAppAuthCode(): string {
		let suffix = "";

		for (let index = 0; index < AuthConstants.WHATSAPP_AUTH_CODE_SUFFIX_LENGTH; index += 1) {
			suffix += AuthConstants.WHATSAPP_AUTH_CODE_ALPHABET.charAt(
				randomInt(AuthConstants.WHATSAPP_AUTH_CODE_ALPHABET.length),
			);
		}

		return `${AuthConstants.WHATSAPP_AUTH_CODE_PREFIX}${suffix}`;
	}
}
