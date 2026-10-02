import { MapsAccessTokenConstants } from "@cataqui/microservices-auth-schemas/maps";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";

export class AuthRepository {
	private readonly _remoteJwksResolversByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

	async getVerifiedAccessTokenOrNull(params: {
		accessToken: string;
		jwksUrl: string;
	}): Promise<{ protectedHeader: unknown; payload: unknown } | null> {
		try {
			const verifiedToken = await jwtVerify(params.accessToken, this._getJwksResolver({ url: params.jwksUrl }), {
				algorithms: [MapsAccessTokenConstants.ALGORITHM],
				audience: MapsAccessTokenConstants.AUDIENCE,
				clockTolerance: 5,
				maxTokenAge: MapsAccessTokenConstants.LIFETIME_SECONDS,
				requiredClaims: ["aud", "exp", "iat", "sub"],
				typ: MapsAccessTokenConstants.TOKEN_TYPE,
			});

			return { protectedHeader: verifiedToken.protectedHeader, payload: verifiedToken.payload };
		} catch (error) {
			if (error instanceof errors.JOSEError) return null;
			throw error;
		}
	}

	private _getJwksResolver(params: { url: string }): ReturnType<typeof createRemoteJWKSet> {
		const cachedResolver = this._remoteJwksResolversByUrl.get(params.url);
		if (cachedResolver !== undefined) return cachedResolver;

		const resolver = createRemoteJWKSet(new URL(params.url), {
			cacheMaxAge: 60 * 60 * 1_000,
			cooldownDuration: 5 * 60 * 1_000,
			timeoutDuration: 5_000,
		});
		this._remoteJwksResolversByUrl.set(params.url, resolver);

		return resolver;
	}
}
