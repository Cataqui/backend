import { Injectable } from "@nestjs/common";
import { RedisService } from "../../../core/redis/redis.service";
import { AuthConstants } from "../auth.constants";

@Injectable()
export class AuthRepository {
	constructor(private readonly _redis: RedisService) {}

	async createWhatsappIntent(params: {
		intentId: string;
		codeHash: string;
		createdAt: string;
		expiresAt: string;
	}): Promise<boolean> {
		return this._redis.createHashAndStringIfNeitherExists({
			hashKey: `${AuthConstants.WHATSAPP_INTENT_REDIS_KEY_PREFIX}${params.intentId}`,
			hashFields: {
				code_hash: params.codeHash,
				created_at: params.createdAt,
				expires_at: params.expiresAt,
			},
			stringKey: `${AuthConstants.WHATSAPP_CODE_REDIS_KEY_PREFIX}${params.codeHash}`,
			stringValue: params.intentId,
			expirationSeconds: AuthConstants.WHATSAPP_INTENT_EXPIRATION_SECONDS,
		});
	}
}
