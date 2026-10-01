import {
	GeoimageAccessTokenConstants,
	GeoimageAccessTokenHeaderSchema,
	GeoimageAccessTokenPayloadSchema,
} from "@cataqui/microservices-auth-schemas/geoimage";
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, errors, jwtVerify } from "jose";
import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { GeoimageError } from "../geoimage.error";
import { GeoimageAuthConfigSchema } from "./geoimage-auth-config.schema";

export class AuthService {
	private readonly _resolvers = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

	async authorizeImage(params: {
		authorization: string | undefined;
		jwksUrl: string;
		latitude: number;
		longitude: number;
	}): Promise<void> {
		const match = params.authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
		if (
			params.authorization === undefined ||
			match === undefined ||
			match === null ||
			params.authorization.length > 2055
		) {
			throw new GeoimageError(GeoimageErrorCode.UNAUTHORIZED);
		}
		const token = match[1]!;
		let header: unknown;
		let claims: unknown;
		try {
			header = decodeProtectedHeader(token);
			claims = decodeJwt(token);
		} catch {
			throw new GeoimageError(GeoimageErrorCode.UNAUTHORIZED);
		}
		const payload = GeoimageAccessTokenPayloadSchema.safeParse(claims);
		if (!GeoimageAccessTokenHeaderSchema.safeParse(header).success || !payload.success) {
			throw new GeoimageError(GeoimageErrorCode.UNAUTHORIZED);
		}
		const config = GeoimageAuthConfigSchema.safeParse({ jwksUrl: params.jwksUrl });
		if (!config.success) throw new GeoimageError(GeoimageErrorCode.INTERNAL_ERROR);
		let resolver = this._resolvers.get(config.data.jwksUrl);
		if (resolver === undefined) {
			resolver = createRemoteJWKSet(new URL(config.data.jwksUrl), {
				cacheMaxAge: 60 * 60 * 1000,
				cooldownDuration: 5 * 60 * 1000,
				timeoutDuration: 5000,
			});
			this._resolvers.set(config.data.jwksUrl, resolver);
		}

		try {
			await jwtVerify(token, resolver, {
				algorithms: [GeoimageAccessTokenConstants.ALGORITHM],
				audience: GeoimageAccessTokenConstants.AUDIENCE,
				typ: GeoimageAccessTokenConstants.TOKEN_TYPE,
				requiredClaims: ["aud", "latitude", "longitude"],
			});
		} catch (error) {
			if (
				error instanceof errors.JWKSNoMatchingKey ||
				error instanceof errors.JWSInvalid ||
				error instanceof errors.JWTInvalid ||
				error instanceof errors.JWTClaimValidationFailed ||
				error instanceof errors.JWSSignatureVerificationFailed ||
				error instanceof errors.JOSEAlgNotAllowed
			) {
				throw new GeoimageError(GeoimageErrorCode.UNAUTHORIZED);
			}
			throw new GeoimageError(GeoimageErrorCode.AUTH_UNAVAILABLE);
		}
		if (payload.data.latitude !== params.latitude || payload.data.longitude !== params.longitude) {
			throw new GeoimageError(GeoimageErrorCode.FORBIDDEN);
		}
	}
}

export const authService = new AuthService();
