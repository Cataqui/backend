import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { importPKCS8, SignJWT } from "jose";
import type { z } from "zod";
import { MicroserviceAudience } from "./enums/microservice-audience.enum";
import { type IMicroservicesAuthConfig, microservicesAuthConfig } from "./microservices-auth.config";
import { MicroserviceAccessTokenOutputSchema } from "./schemas/microservice-access-token-output.schema";

@Injectable()
export class MicroservicesAuthService implements OnModuleInit {
	constructor(@Inject(microservicesAuthConfig.KEY) private readonly _config: IMicroservicesAuthConfig) {}

	private _signingKey: Awaited<ReturnType<typeof importPKCS8>> | undefined;

	async createGeosearchAccessToken(params: {
		userId: string;
	}): Promise<z.infer<typeof MicroserviceAccessTokenOutputSchema>> {
		if (this._signingKey === undefined) throw new Error("The microservice JWT signing key is unavailable");

		const issuedAtEpochSeconds = Math.floor(Date.now() / 1_000);
		const expiresAtEpochSeconds = issuedAtEpochSeconds + 10 * 60;
		const accessToken = await new SignJWT()
			.setProtectedHeader({ alg: "ES256", kid: this._config.signingKeyId, typ: "microservice-access+jwt" })
			.setSubject(params.userId)
			.setAudience(MicroserviceAudience.GEOSEARCH)
			.setIssuedAt(issuedAtEpochSeconds)
			.setExpirationTime(expiresAtEpochSeconds)
			.sign(this._signingKey);

		return {
			accessToken: accessToken,
			expiresAt: new Date(expiresAtEpochSeconds * 1_000).toISOString(),
			tokenType: "Bearer",
		};
	}

	async onModuleInit(): Promise<void> {
		const privateKeyPkcs8Base64 = this._config.privateKeyPkcs8Base64ByKeyId[this._config.signingKeyId];

		if (privateKeyPkcs8Base64 === undefined) {
			throw new Error("The current microservice JWT signing key is unavailable");
		}

		this._signingKey = await importPKCS8(
			`-----BEGIN PRIVATE KEY-----\n${privateKeyPkcs8Base64}\n-----END PRIVATE KEY-----`,
			"ES256",
		);
	}
}
