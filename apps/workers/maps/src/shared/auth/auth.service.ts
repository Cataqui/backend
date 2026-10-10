import { MapsAccessTokenHeaderSchema, MapsAccessTokenPayloadSchema } from "@cataqui/microservices-auth-schemas/maps";
import { AuthRepository } from "./auth.repository";

export class AuthService {
	private readonly _repository = new AuthRepository();

	async getAuthenticatedUserIdOrNull(params: {
		accessToken: string;
		microservicesAuthJwksUrl: string;
	}): Promise<string | null> {
		const verifiedToken = await this._repository.getVerifiedAccessTokenOrNull({
			accessToken: params.accessToken,
			jwksUrl: params.microservicesAuthJwksUrl,
		});
		if (verifiedToken === null) return null;

		const protectedHeader = MapsAccessTokenHeaderSchema.safeParse(verifiedToken.protectedHeader);
		const payload = MapsAccessTokenPayloadSchema.safeParse(verifiedToken.payload);
		if (!protectedHeader.success || !payload.success) {
			return null;
		}

		return payload.data.sub;
	}
}

export const authService = new AuthService();
