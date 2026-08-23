import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
	MicroserviceAccessTokenConstants,
	MicroserviceAudience,
	MicroservicesAuthJwksOutputSchema,
} from "@cataqui/microservices-auth-contracts";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import type { z } from "zod";
import { type IMicroservicesAuthConfig, microservicesAuthConfig } from "./microservices-auth.config";
import { MicroserviceAccessTokenOutputSchema } from "./schemas/microservice-access-token-output.schema";

@Injectable()
export class MicroservicesAuthService implements OnModuleInit {
	constructor(@Inject(microservicesAuthConfig.KEY) private readonly _config: IMicroservicesAuthConfig) {}

	private _signingKey: Awaited<ReturnType<typeof importPKCS8>> | undefined;
	private _publicJwks: z.infer<typeof MicroservicesAuthJwksOutputSchema> | undefined;

	async createGeosearchAccessToken(params: {
		userId: string;
	}): Promise<z.infer<typeof MicroserviceAccessTokenOutputSchema>> {
		if (this._signingKey === undefined) throw new Error("The microservice JWT signing key is unavailable");

		const issuedAtEpochSeconds = Math.floor(Date.now() / 1_000);
		const expiresAtEpochSeconds = issuedAtEpochSeconds + MicroserviceAccessTokenConstants.LIFETIME_SECONDS;
		const accessToken = await new SignJWT()
			.setProtectedHeader({
				alg: MicroserviceAccessTokenConstants.ALGORITHM,
				kid: this._config.signingKeyId,
				typ: MicroserviceAccessTokenConstants.TOKEN_TYPE,
			})
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

	getPublicJwks(): z.infer<typeof MicroservicesAuthJwksOutputSchema> {
		if (this._publicJwks === undefined) throw new Error("The microservice public JWKS is unavailable");

		return this._publicJwks;
	}

	async onModuleInit(): Promise<void> {
		const privateKeyPkcs8Base64 = this._config.privateKeyPkcs8Base64ByKeyId[this._config.signingKeyId];

		if (privateKeyPkcs8Base64 === undefined) {
			throw new Error("The current microservice JWT signing key is unavailable");
		}

		const publicJwks = MicroservicesAuthJwksOutputSchema.parse({
			keys: Object.entries(this._config.privateKeyPkcs8Base64ByKeyId)
				.sort(([firstKeyId], [secondKeyId]) => firstKeyId.localeCompare(secondKeyId))
				.map(([keyId, configuredPrivateKeyPkcs8Base64]) => ({
					...createPublicKey(
						createPrivateKey({
							key: Buffer.from(configuredPrivateKeyPkcs8Base64, "base64"),
							format: "der",
							type: "pkcs8",
						}),
					).export({ format: "jwk" }),
					alg: MicroserviceAccessTokenConstants.ALGORITHM,
					kid: keyId,
					use: MicroserviceAccessTokenConstants.JWK_USE,
				})),
		});

		this._signingKey = await importPKCS8(
			`-----BEGIN PRIVATE KEY-----\n${privateKeyPkcs8Base64}\n-----END PRIVATE KEY-----`,
			MicroserviceAccessTokenConstants.ALGORITHM,
		);
		this._publicJwks = publicJwks;
	}
}
