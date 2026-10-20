import { instancePerContainerCachingFactory, registry } from "tsyringe";
import { AuthEnvironment } from "../environment.config";

export const TokenConfig = Symbol("TokenConfig");
export interface TokenConfig {
	refreshTokenHmacCurrentKid: string;
	refreshTokenHmacKeys: Record<string, string>;
}

@registry([
	{
		token: TokenConfig,
		useFactory: instancePerContainerCachingFactory<TokenConfig>((container) => ({
			refreshTokenHmacCurrentKid: "V1",
			refreshTokenHmacKeys: {
				V1: container.resolve<AuthEnvironment>(AuthEnvironment).AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL,
			},
		})),
	},
])
export class TokenConfigRegistry {}
