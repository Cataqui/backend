import { Inject, Injectable } from "@nestjs/common";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type IAuthConfig, authConfig } from "./auth.config";

@Injectable()
export class AuthTokenService {
	constructor(@Inject(authConfig.KEY) private readonly _config: IAuthConfig) {}

	createAccessAndRefreshTokens(params: { sessionId: string }): {
		accessExpiresAt: Date;
		accessToken: string;
		accessTokenHash: string;
		refreshExpiresAt: Date;
		refreshToken: string;
		refreshTokenHash: string;
	} {
		const accessToken = randomBytes(32).toString("base64url");
		const refreshToken = this._createRefreshToken({ sessionId: params.sessionId });
		const now = new Date();

		return {
			accessToken: accessToken,
			accessTokenHash: this.hashAccessToken({ accessToken: accessToken }),
			accessExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
			refreshToken: refreshToken.refreshToken,
			refreshTokenHash: refreshToken.refreshTokenHash,
			refreshExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
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

	private _createRefreshToken(params: { sessionId: string }): { refreshToken: string; refreshTokenHash: string } {
		const keyId = this._config.refreshTokenHmacCurrentKid;
		const signingKey = this._config.refreshTokenHmacKeys[keyId];
		if (signingKey === undefined) throw new Error("The current refresh-token signing key is unavailable");

		const unsignedToken = `rt1.${keyId}.${params.sessionId}.${randomBytes(32).toString("base64url")}`;
		const refreshToken = `${unsignedToken}.${createHmac("sha256", Buffer.from(signingKey, "base64url"))
			.update(unsignedToken)
			.digest("base64url")}`;

		return {
			refreshToken: refreshToken,
			refreshTokenHash: createHash("sha256").update(refreshToken).digest("hex"),
		};
	}
}
