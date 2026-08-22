import { registerAs } from "@nestjs/config";

const MICROSERVICES_AUTH_JWT_CURRENT_SIGNING_KEY_ID = "V1";

export interface IMicroservicesAuthConfig {
	privateKeyPkcs8Base64ByKeyId: Record<string, string>;
	signingKeyId: string;
}

export const microservicesAuthConfig = registerAs(
	"microservicesAuth",
	(): IMicroservicesAuthConfig => ({
		privateKeyPkcs8Base64ByKeyId: {
			V1: process.env["MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64"] as string,
		} satisfies Record<typeof MICROSERVICES_AUTH_JWT_CURRENT_SIGNING_KEY_ID, string>,
		signingKeyId: MICROSERVICES_AUTH_JWT_CURRENT_SIGNING_KEY_ID,
	}),
);
