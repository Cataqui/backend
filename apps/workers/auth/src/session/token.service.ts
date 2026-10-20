import { RefreshTokenSigningKeyUnavailableError } from "./errors/refresh-token-signing-key-unavailable.error";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { inject, injectable } from "tsyringe";

import { TokenConfig } from "./token.config";

@injectable()
export class TokenService {
	constructor(@inject(TokenConfig) private readonly _config: TokenConfig) {}

	createAccessAndRefreshTokens(params: { sessionId: string }): {
		accessExpiresAt: Date;
		accessToken: string;
		accessTokenHash: string;
		refreshExpiresAt: Date;
		refreshToken: string;
		refreshTokenHash: string;
	} {
		const keyId = this._config.refreshTokenHmacCurrentKid;
		const signingKey = this._config.refreshTokenHmacKeys[keyId];
		if (signingKey === undefined) throw new RefreshTokenSigningKeyUnavailableError();

		const accessToken = Buffer.from(randomBytes(32)).toString("base64url");
		const unsignedRefreshToken = `rt1.${keyId}.${params.sessionId}.${Buffer.from(randomBytes(32)).toString("base64url")}`;
		const refreshToken = `${unsignedRefreshToken}.${createHmac("sha256", Buffer.from(signingKey, "base64url"))
			.update(unsignedRefreshToken)
			.digest("base64url")}`;
		const now = Date.now();

		return {
			accessToken: accessToken,
			accessTokenHash: this.hashAccessToken({ accessToken: accessToken }),
			accessExpiresAt: new Date(now + 15 * 60 * 1000),
			refreshToken: refreshToken,
			refreshTokenHash: createHash("sha256").update(refreshToken).digest("hex"),
			refreshExpiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
		};
	}

	hashAccessToken(params: { accessToken: string }): string {
		return createHash("sha256").update(params.accessToken).digest("hex");
	}

	getAuthenticatedRefreshTokenOrNull(params: {
		refreshToken: string;
	}): { refreshTokenHash: string; sessionId: string } | null {
		const tokenParts = params.refreshToken.split(".");
		if (tokenParts.length !== 5) return null;

		const [version, keyId, sessionId, randomSecret, signature] = tokenParts;
		if (
			version !== "rt1" ||
			typeof keyId !== "string" ||
			!/^[A-Za-z0-9_-]{1,32}$/.test(keyId) ||
			typeof sessionId !== "string" ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId) ||
			typeof randomSecret !== "string" ||
			!/^[A-Za-z0-9_-]{43}$/.test(randomSecret) ||
			typeof signature !== "string" ||
			!/^[A-Za-z0-9_-]{43}$/.test(signature)
		) {
			return null;
		}

		const configuredSigningKey = this._config.refreshTokenHmacKeys[keyId];
		const expectedSignature = createHmac(
			"sha256",
			configuredSigningKey === undefined ? Buffer.alloc(32) : Buffer.from(configuredSigningKey, "base64url"),
		)
			.update(`rt1.${keyId}.${sessionId}.${randomSecret}`)
			.digest();
		const receivedSignature = Buffer.from(signature, "base64url");

		if (
			receivedSignature.length !== expectedSignature.length ||
			!timingSafeEqual(receivedSignature, expectedSignature) ||
			configuredSigningKey === undefined
		) {
			return null;
		}

		return {
			refreshTokenHash: createHash("sha256").update(params.refreshToken).digest("hex"),
			sessionId: sessionId,
		};
	}
}
