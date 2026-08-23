import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import {
	MicroserviceAccessTokenConstants,
	MicroserviceAccessTokenHeaderInputSchema,
	MicroserviceAccessTokenPayloadInputSchema,
	MicroserviceAudience,
} from "@cataqui/microservices-auth-contracts";

export class AuthService {
	private readonly _remoteJwksResolversByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

	async getAuthenticatedUserIdOrNull(params: {
		accessToken: string;
		microservicesAuthJwksUrl: string;
	}): Promise<string | null> {
		let verifiedToken: Awaited<ReturnType<typeof jwtVerify>>;

		try {
			verifiedToken = await jwtVerify(
				params.accessToken,
				this._getJwksResolver({ microservicesAuthJwksUrl: params.microservicesAuthJwksUrl }),
				{
					algorithms: [MicroserviceAccessTokenConstants.ALGORITHM],
					audience: MicroserviceAudience.GEOSEARCH,
					clockTolerance: 5,
					maxTokenAge: MicroserviceAccessTokenConstants.LIFETIME_SECONDS,
					requiredClaims: ["aud", "exp", "iat", "sub"],
					typ: MicroserviceAccessTokenConstants.TOKEN_TYPE,
				},
			);
		} catch (error) {
			if (error instanceof errors.JOSEError) return null;
			throw error;
		}

		const protectedHeader = MicroserviceAccessTokenHeaderInputSchema.safeParse(verifiedToken.protectedHeader);
		const payload = MicroserviceAccessTokenPayloadInputSchema.safeParse(verifiedToken.payload);
		if (!protectedHeader.success || !payload.success) {
			return null;
		}

		return payload.data.sub;
	}

	private _getJwksResolver(params: { microservicesAuthJwksUrl: string }): ReturnType<typeof createRemoteJWKSet> {
		const cachedResolver = this._remoteJwksResolversByUrl.get(params.microservicesAuthJwksUrl);
		if (cachedResolver !== undefined) return cachedResolver;

		const resolver = createRemoteJWKSet(new URL(params.microservicesAuthJwksUrl), {
			cacheMaxAge: 60 * 60 * 1_000,
			cooldownDuration: 5 * 60 * 1_000,
			timeoutDuration: 5_000,
		});
		this._remoteJwksResolversByUrl.set(params.microservicesAuthJwksUrl, resolver);

		return resolver;
	}
}

export const authService = new AuthService();
