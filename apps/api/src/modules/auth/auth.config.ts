import { registerAs } from "@nestjs/config";

const AUTH_REFRESH_TOKEN_HMAC_CURRENT_KID = "V1";

export interface IAuthConfig {
	refreshTokenHmacCurrentKid: string;
	refreshTokenHmacKeys: Record<string, string>;
}

export const authConfig = registerAs(
	"auth",
	(): IAuthConfig => ({
		refreshTokenHmacCurrentKid: AUTH_REFRESH_TOKEN_HMAC_CURRENT_KID,
		refreshTokenHmacKeys: {
			V1: process.env["AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL"] as string,
		} satisfies Record<typeof AUTH_REFRESH_TOKEN_HMAC_CURRENT_KID, string>,
	}),
);
